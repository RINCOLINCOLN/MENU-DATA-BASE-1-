/**
 * menuParse.js — OCR text → structured menu data, with a QUALITY GATE.
 *
 * Split from snapshotPipeline.js so the parsing + gate can be unit-tested
 * against both the synthetic fixture and the owner's real menu photo.
 *
 * Behaviour contract (owner priority):
 *   - Never return 'ready' status with garbage. If OCR text isn't credible
 *     menu data, the pipeline reports a clear, human failure instead.
 *   - Prices are DATA (editable phone-side), parsed as numbers with sane
 *     bounds — real menus price between $0.50 and $500 (two decimals).
 */
export const MIN_PRICE = 0.5;
export const MAX_PRICE = 500;
export const MIN_ITEMS = 3;
export const CREDIBLE_RATIO = 0.7;

export const RETAKE_MESSAGE =
  "We couldn't read that menu clearly. Try a straighter, closer photo in good light.";
export const NO_TEXT_MESSAGE =
  'No menu text detected in the photo. Please retake the photo with good lighting and try again.';
export const NO_ITEMS_MESSAGE =
  'No menu items with prices were found in the photo. Try a closer, well-lit photo of the menu board.';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const alpha = (s) => (String(s).match(/[A-Za-z]/g) || []).length;
const digits = (s) => (String(s).match(/\d/g) || []).length;
const punctCount = (s) => (String(s).match(/[^A-Za-z0-9\s]/g) || []).length;
const median = (nums) => {
  if (!nums || !nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** A trailing price: "$9.99", "9.99", "9,99", "$4", "4.5" — with sane bounds. */
const TRAILING_PRICE_RE = /([$€£¥]?\s*)(\d{1,3}(?:[.,]\d{1,2})?)\s*$/;

export function extractTrailingPrice(raw) {
  let line = String(raw || '').replace(/\s+/g, ' ').trim();
  const m = line.match(TRAILING_PRICE_RE);
  if (!m) return null;
  let price = Number(m[2].replace(',', '.'));
  if (!Number.isFinite(price)) return null;
  // Integer prices ≥ 100 lose their dot on chalkboards ("535" = £5.35).
  if (!/\d*\.\d/.test(m[2]) && price >= 100 && price <= 9999) price /= 100;
  price = Math.round(price * 100) / 100; // two decimals
  if (price < MIN_PRICE || price > MAX_PRICE) return null;
  return {
    price,
    name: line.slice(0, m.index).replace(/[\s\-–—.·•∙:|)\]}>'"*+=_~`«»“”]+$/g, '').trim(),
  };
}

/**
 * Per-item plausibility. Items that fail are DROPPED at parse time rather than
 * minted as junk — most of today's garbage dies here.
 */
export function itemPlausible(name) {
  const n = String(name || '').trim();
  if (n.length < 3) return false;
  const letters = alpha(n);
  const d = digits(n);
  if (letters < 3) return false;
  if (letters / n.length < 0.5) return false;
  if (punctCount(n) > 2) return false;
  if (d > 0 && (d >= letters || (d > 1 && letters < 8))) return false;
  return true;
}

/** Strong item: multi-word, dictionary-like, no digits — used by the gate. */
export function itemCredible(name) {
  const n = String(name || '').trim();
  const letters = alpha(n);
  if (digits(n) > 0) return false;
  if (punctCount(n) > 1) return false;
  if (letters < 5) return false;
  if (letters / n.length < 0.6) return false;
  return true;
}

export function categoryPlausible(cat) {
  const c = String(cat || '').trim();
  if (c.length < 3 || c.length > 32) return false;
  const letters = alpha(c);
  if (letters < 3 || letters / c.length < 0.5) return false;
  if (punctCount(c) > 1) return false;
  if (digits(c) > 0) return false;
  return true;
}

/** A credible category: uppercase-heavy section header ("TACOS", "DRINKS"). */
export function categoryCredible(cat) {
  const c = String(cat || '').trim();
  if (!categoryPlausible(c)) return false;
  const letters = alpha(c);
  const upper = (c.match(/[A-Z]/g) || []).length;
  return upper >= letters * 0.5 || /\b(?:menu|specials?|drinks?|coffee|tea(?:s)?|food|dessert|sides?|breakfast|lunch|dinner|sandwiches?|salads?|bakery)\b/i.test(c);
}

// ---------------------------------------------------------------------------
// Text → items/categories
// ---------------------------------------------------------------------------
/**
 * Line-oriented menu parsing:
 *   - a line ending in a price with a plausible name → menu item
 *   - a short digit-free all-letter line → section header (category)
 *   - "|"/"¦"-joined columns are split first (common on two-column boards)
 *   - symbol-heavy / too-short / too-few-letter lines are dropped entirely
 *     (never emitted as items), which keeps the quality gate meaningful.
 */
export function parseMenuText(text) {
  const rawLines = String(text || '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const items = [];
  const categories = [];
  const unpricedRows = []; // item-like rows (letters + digits) that yielded no price
  let currentCategory = null;

  for (const raw of rawLines) {
    const parts = raw.split(/[|¦]/).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      const extracted = extractTrailingPrice(part);
      if (extracted) {
        const name = extracted.name;
        if (itemPlausible(name)) {
          items.push({
            name,
            price: extracted.price,
            category: currentCategory,
            sort_order: items.length + 1,
          });
          if (currentCategory && !categories.includes(currentCategory)) {
            categories.push(currentCategory);
          }
        }
      } else if (!/\d/.test(part) && alpha(part) >= 3 && part.length >= 2 && part.length <= 40) {
        // Section header candidate — must pass readability, else ignored.
        if (categoryPlausible(part)) currentCategory = part;
      } else if (alpha(part) >= 4 && /\d/.test(part) && itemPlausible(part.split(/\s+/).slice(0, -1).join(' ') || part)) {
        // Item-like row that failed to yield a trailing price (merged columns,
        // mangled price) — tracked so the gate can reject unreadable pricing.
        unpricedRows.push(part);
      }
    }
  }

  // Merge adjacent sort_orders so the dashboard order is 1..N regardless of
  // dropped junk rows (already sequential, keep stable).
  items.forEach((it, i) => { it.sort_order = i + 1; });

  return { items, categories, unpricedRows, rawLines };
}

// ---------------------------------------------------------------------------
// Word-geometry parsing — two-column boards (a "|"-less menu photo like the
// owner's café) merge right-column items into left-column text lines, which
// destroys line-based parsing. OCR words carry bounding boxes, so we group
// words into rows, split each row at its largest horizontal gap (the column
// gutter), and parse each segment independently. Price tokens get a tolerant
// shape check ("£5.80" often OCRs as "L580)"), and integer prices ≥ 100 are
// decimal-shifted ("575" → 5.75, "935" → 9.35) — chalkboard photos routinely
// lose the dot.
// ---------------------------------------------------------------------------
function groupWordsIntoRows(words) {
  const rows = [];
  for (const w of words) {
    const cy = (w.bbox.y0 + w.bbox.y1) / 2;
    const l = rows.find((r) => Math.abs(r.cy - cy) < Math.max(8, (w.bbox.y1 - w.bbox.y0) * 0.6));
    if (l) {
      l.words.push(w);
      l.cy = (l.cy * (l.words.length - 1) + cy) / l.words.length;
    } else {
      rows.push({ cy, words: [w] });
    }
  }
  for (const r of rows) {
    r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    r.height = median(r.words.map((w) => w.bbox.y1 - w.bbox.y0).filter((h) => h > 0)) || 1;
  }
  rows.sort((a, b) => a.cy - b.cy);
  return rows;
}

function splitRowAtGaps(words, rowHeight) {
  if (words.length < 4) return [words];
  let bestIdx = -1;
  let bestGap = 0;
  for (let i = 1; i < words.length; i += 1) {
    const gap = words[i].bbox.x0 - words[i - 1].bbox.x1;
    if (gap > bestGap) { bestGap = gap; bestIdx = i; }
  }
  if (bestIdx < 1) return [words];
  const otherGaps = [];
  for (let i = 1; i < words.length; i += 1) {
    if (i !== bestIdx) otherGaps.push(words[i].bbox.x0 - words[i - 1].bbox.x1);
  }
  const medOther = median(otherGaps) || 0;
  if (bestGap > Math.max(rowHeight * 1.1, medOther * 2.2)) {
    return [words.slice(0, bestIdx), words.slice(bestIdx)];
  }
  return [words];
}

/** Tolerant price-token shape: "$4.50", "535", "L580)", "£6.35". */
export function isPriceishToken(t) {
  const s = String(t || '').replace(/[\s_]/g, '');
  if (!/\d/.test(s)) return false;
  return (
    /^[$€£¥L]?\d{1,4}(?:[.,]\d{1,2})?[)\]]?$/.test(s)
    || /^[.,]\d{1,2}$/.test(s)
    || /^[$€£¥L]?[.,]\d{1,2}[)\]]?$/.test(s)
  );
}

/** Join price tokens → sane number with bounds; ≥100 ints shift the dot. */
export function parsePriceTokens(tokens) {
  let s = tokens.map((t) => String(t.text ?? t)).join('').replace(/[\s_]/g, '');
  s = s.replace(/[)\]]+$/g, '');
  const m = s.match(/\d{1,4}(?:[.,]\d{1,2})?/);
  if (!m) return null;
  let num = Number(m[0].replace(',', '.'));
  if (!Number.isFinite(num)) return null;
  if (m[0] === String(Math.round(num)) && num >= 100 && num <= 9999) num /= 100;
  num = Math.round(num * 100) / 100;
  if (num < MIN_PRICE || num > MAX_PRICE) return null;
  return num;
}

function extractTrailingPriceFromWords(seg) {
  let i = seg.length - 1;
  const priceWs = [];
  for (; i >= 0; i -= 1) {
    const t = String(seg[i].text ?? seg[i]).trim();
    if (isPriceishToken(t)) priceWs.unshift(seg[i]);
    else break;
  }
  if (!priceWs.length) return null;
  const nameWs = seg.slice(0, seg.length - priceWs.length);
  if (!nameWs.length) return null;
  const price = parsePriceTokens(priceWs);
  if (price == null) return null;
  return { price, name: nameWs.map((w) => w.text).join(' ') };
}

/**
 * Parse OCR WORD geometry (preferred when available). Falls back to the
 * line-based parser when given no words. Returns the same shape as
 * parseMenuText: { items, categories, unpricedRows, rawLines }.
 */
export function parseMenuWords(words) {
  const items = [];
  const categories = [];
  const unpricedRows = [];
  let currentCategory = null;

  if (!Array.isArray(words) || words.length < 4) {
    return { items: [], categories: [], unpricedRows: [], rawLines: [] };
  }

  const rows = groupWordsIntoRows(words);
  for (const row of rows) {
    const segs = splitRowAtGaps(row.words, row.height);
    for (const seg of segs) {
      if (!seg.length) continue;
      const text = seg.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
      const hit = extractTrailingPriceFromWords(seg);
      if (hit) {
        // Reject names that still look like cross-column merges (trailing
        // fragment words after a plausible price inside the segment).
        if (itemPlausible(hit.name)) {
          items.push({
            name: hit.name,
            price: hit.price,
            category: currentCategory,
            sort_order: items.length + 1,
          });
          if (currentCategory && !categories.includes(currentCategory)) {
            categories.push(currentCategory);
          }
        }
      } else if (seg.length <= 3 && !/\d/.test(text) && alpha(text) >= 3 && text.length <= 40) {
        // Section header (single word / short title, no price).
        if (categoryPlausible(text)) currentCategory = text;
      } else if (alpha(text) >= 4 && /\d/.test(text) && text.length <= 80) {
        unpricedRows.push(text);
      }
    }
  }

  items.forEach((it, i) => { it.sort_order = i + 1; });
  return { items, categories, unpricedRows, rawLines: [] };
}

// ---------------------------------------------------------------------------
// QUALITY GATE — the invariant: no 'ready' with garbage.
// ---------------------------------------------------------------------------
/**
 * Decide whether parsed data is credible menu data.
 * Returns { ok: true, items, categories } or { ok: false, reasons: [...] }.
 * The pipeline maps a failing gate to status 'failed' + RETAKE_MESSAGE.
 */
export function gateMenuData(parsed) {
  const { items, categories, unpricedRows } = parsed;
  const reasons = [];

  if (!Array.isArray(items) || items.length === 0) {
    reasons.push('no items extracted');
    return { ok: false, reasons, items: [], categories: [] };
  }
  if (items.length < MIN_ITEMS) {
    reasons.push(`only ${items.length} item(s) extracted (need ≥ ${MIN_ITEMS})`);
  }

  const weak = items.filter((it) => !itemCredible(it.name));
  if (items.length > 0 && weak.length / items.length > 0.3) {
    reasons.push(`${weak.length}/${items.length} item names not credible`);
  }

  const badPrices = items.filter((it) => {
    const p = Number(it.price);
    return !Number.isFinite(p) || p < MIN_PRICE || p > MAX_PRICE;
  });
  if (badPrices.length > 0) {
    reasons.push(`${badPrices.length} price(s) out of sane range ($${MIN_PRICE}–$${MAX_PRICE})`);
  }

  // Prices missing on too many rows — rows with letters+digits that never
  // yielded a priced item (merged columns / unreadable price column).
  if (items.length > 0 && unpricedRows.length >= 2 * items.length && items.length < MIN_ITEMS * 2) {
    reasons.push(`prices unreadable on ${unpricedRows.length} row(s)`);
  }

  const badCats = categories.filter((c) => !categoryCredible(c));
  if (categories.length > 0 && badCats.length / categories.length > 0.25) {
    reasons.push(`${badCats.length}/${categories.length} sections not readable`);
  }

  return { ok: reasons.length === 0, reasons, items, categories };
}