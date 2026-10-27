/**
 * Snapshot-to-digital pipeline.
 *
 * Fully local OCR (tesseract.js + vendored eng.traineddata — no external
 * API key required) that turns a menu photo into Lumenu DATA:
 *   - preprocesses the photo offline (EXIF orientation, grayscale, contrast
 *     stretch, Otsu binarization) so real-world café photos read correctly
 *   - extracts item names / prices / section headers (menu_items shape,
 *     name-optional + per-item font overrides left null to inherit)
 *   - QUALITY GATE: never records status 'ready' unless the extracted text is
 *     credible menu data — otherwise status 'failed' with a retake message
 *   - generates a Lumenu template (text zones) + a screen + menu_items
 *     when a restaurant was given, so prices are editable phone-side
 *     and NOT baked into any image
 *   - records the result on the snapshots row (status: processing|ready|failed)
 *
 * Image preprocessing uses jimp (pure-JS, no native build) so the whole
 * pipeline runs on this shared host without system image libraries.
 */
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWorker } from 'tesseract.js';
import Jimp from 'jimp';
import { getDb } from '../db/database.js';
import {
  parseMenuText,
  parseMenuWords,
  gateMenuData,
  RETAKE_MESSAGE,
  NO_TEXT_MESSAGE,
} from './menuParse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESSDATA_DIR = path.join(__dirname, '..', 'tessdata');
const SNAPSHOTS_DIR = path.join(__dirname, '..', 'uploads', 'snapshots');

export class SnapshotPipelineError extends Error {}

// ---------------------------------------------------------------------------
// EXIF orientation — phone photos store rotation as a tag, not baked pixels.
// We apply it ourselves and feed tesseract a clean PNG (no EXIF), so the
// fragile byte-scan exif detection inside tesseract.js never double-rotates.
// ---------------------------------------------------------------------------
export function readExifOrientation(buf) {
  try {
    if (!buf || buf.length < 2 || buf[0] !== 0xff || buf[1] !== 0xd8) return 1;
    let off = 2;
    while (off + 4 < buf.length) {
      if (buf[off] !== 0xff) { off += 1; continue; }
      const marker = buf[off + 1];
      const len = buf.readUInt16BE(off + 2);
      if (marker === 0xe1) {
        const seg = buf.slice(off + 4, off + 2 + len);
        if (seg.length > 12 && seg.toString('ascii', 0, 6) === 'Exif\0\0') {
          const tiff = seg.slice(6);
          const isLE = tiff.readUInt16BE(0) === 0x4949;
          const read16 = (o) => (isLE ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
          const read32 = (o) => (isLE ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
          const ifd0 = read32(4);
          const n = read16(ifd0);
          for (let i = 0; i < n; i += 1) {
            const e = ifd0 + 2 + i * 12;
            if (read16(e) === 0x0112) return read16(e + 8) || 1;
          }
        }
        return 1;
      }
      if (marker === 0xda || marker === 0xd9) return 1; // SOS/EOI — no more APPn
      off += 2 + len;
    }
  } catch { /* not a normal JPEG → leave as-is */ }
  return 1;
}

export function applyExifOrientation(img, orientation) {
  switch (orientation) {
    case 2: img.flip(true, false); break;
    case 3: img.rotate(180); break;
    case 4: img.flip(false, true); break;
    case 5: img.flip(true, false); img.rotate(90); break;
    case 6: img.rotate(90); break;
    case 7: img.flip(false, true); img.rotate(90); break;
    case 8: img.rotate(-90); break;
    default: break;
  }
  return img;
}

// ---------------------------------------------------------------------------
// Otsu global threshold — black & white "ink on board", which is what the
// LSTM model was trained on. Tesseract re-binarizes internally anyway, but a
// clean binary image removes glare/shadow/background texture first.
// ---------------------------------------------------------------------------
export function otsuThreshold(img) {
  const { data, width, height } = img.bitmap;
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) hist[data[i]] += 1;
  const total = width * height;
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = -1;
  let threshold = 127;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

/**
 * Offline preprocessing → PNG the OCR worker consumes.
 * Steps: EXIF orientation → grayscale → normalize (stretch) → gentle contrast
 * → 2× upscale (small x-height kills real-photo OCR) → Otsu binarize (only for
 * the retry pass — glare/anti-aliasing on chalkboards survives better in the
 * grayscale pass, so binarization is the fallback, not the default).
 * Returns the temp PNG path (caller removes it after OCR).
 */
export async function preprocessForOcr(filePath, opts = {}) {
  const buf = fs.readFileSync(filePath);
  const orientation = readExifOrientation(buf);

  let img = await Jimp.read(buf);
  if (orientation !== 1) applyExifOrientation(img, orientation);

  const w = img.getWidth();
  const h = img.getHeight();

  img.grayscale();
  img.normalize();
  img.contrast(0.3);

  // 2× when the photo is a small/medium board photo — menu glyphs land in the
  // 30–60px x-height band the LSTM reads best. Skip for huge already-crisp
  // uploads to bound runtime.
  const longest = Math.max(w, h);
  let scale = 1;
  if (longest >= 1200 && longest <= 2600) scale = 2;
  else if (longest < 1200) scale = Math.max(1, Math.round(2200 / longest));

  if (opts.binarize) {
    const otsu = otsuThreshold(img);
    const { data } = img.bitmap;
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i] > otsu ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }

  if (scale !== 1) img.scale(scale, Jimp.RESIZE_BICUBIC);

  const tmpPath = path.join(os.tmpdir(), `lumenu-ocr-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  await img.writeAsync(tmpPath);
  return { tmpPath, width: img.getWidth(), height: img.getHeight() };
}

// ---------------------------------------------------------------------------
// OCR — one shared tesseract worker, language data vendored locally so the
// pipeline works offline and never depends on a CDN. cache:false — every
// upload is recognized fresh (no stale cached junk for a re-uploaded photo).
// ---------------------------------------------------------------------------
let workerPromise = null;
function getTesseractWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, { langPath: TESSDATA_DIR, cache: false }).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}
async function ocrImage(filePath) {
  const worker = await getTesseractWorker();
  try {
    // v7 defaults to text-only output — request blocks so word geometry (used
    // for two-column row splitting + price-placement metrics) is available.
    const { data } = await worker.recognize(filePath, {}, { text: true, blocks: true });
    if (!data.words && Array.isArray(data.blocks)) {
      data.words = [];
      for (const b of data.blocks) {
        for (const p of (b.paragraphs || [])) {
          for (const l of (p.lines || [])) {
            for (const w of (l.words || [])) data.words.push(w);
          }
        }
      }
    }
    return data;
  } catch (err) {
    // Worker may have crashed — drop it so the next call rebuilds it.
    try { await worker.terminate(); } catch { /* noop */ }
    workerPromise = null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Image dimensions (PNG / JPEG — enough to pick screen orientation).
// ---------------------------------------------------------------------------
export function getImageDimensions(buf) {
  // PNG: IHDR width at offset 16, height at 20
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: scan segments for a SOF marker that carries dimensions
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off += 1; continue; }
      const marker = buf[off + 1];
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; }
      const len = buf.readUInt16BE(off + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: buf.readUInt16BE(off + 7), height: buf.readUInt16BE(off + 5) };
      }
      off += 2 + len;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Price placement + price glyph heuristics (owner requirement).
// Measures OCR word bounding boxes in the ORIGINAL photo:
//   1. Where prices go — each price's right-edge x is measured; a tightly
//      aligned column near the right margin → 'right_column' (classic menu
//      board). Prices landing mid-row (dot-leader style) → 'inline'.
//   2. Font size — price glyph height vs item-name glyph height per row,
//      median across rows (fallback 0.9×). Weight: bold when price glyphs
//      are clearly wider per character than name glyphs.
// Heuristic by design — the customer/template designer adjusts later. The
// suggestions ship in the snapshot payload AND in the generated template
// zone (price_font_ratio / price_font_weight / price_position), so the
// mockup already resembles the original photo.
// ---------------------------------------------------------------------------
function median(nums) {
  if (!nums || !nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function clampNum(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}
export function measurePriceLayout(ocr) {
  const fallback = { position: 'right_column', align: 'right', margin_right_frac: 0.05, font_ratio: 0.9, bold: false, leader: false, reliable: false };
  const words = (ocr && Array.isArray(ocr.words) ? ocr.words : [])
    .filter((w) => w && w.text && w.bbox && String(w.text).trim());
  const W = ocr && Number(ocr.width) > 0 ? Number(ocr.width) : null;
  if (words.length < 2 || !W) return fallback;
  // Group words into lines by vertical proximity (bbox units are px).
  const lines = [];
  for (const w of words) {
    const cy = (w.bbox.y0 + w.bbox.y1) / 2;
    const l = lines.find((ln) => Math.abs(ln.cy - cy) < Math.max(6, (w.bbox.y1 - w.bbox.y0) * 0.6));
    if (l) { l.words.push(w); l.cy = (l.cy * (l.words.length - 1) + cy) / l.words.length; }
    else lines.push({ cy, words: [w] });
  }
  const rows = [];
  for (const ln of lines) {
    const ws = [...ln.words].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    // The price is the TRAILING pure-price token(s): "$4.50" (one word) or
    // "$4" + ".50" (tesseract splits). Everything before it is the name.
    let priceWords = [];
    for (let i = ws.length - 1; i >= 0; i -= 1) {
      const t = String(ws[i].text).replace(/[\s,]/g, '');
      if (/^[0-9$][0-9.,]*$/.test(t) || /^[.,]\d+$/.test(t)) priceWords.unshift(ws[i]);
      else break;
    }
    if (!priceWords.length) continue;
    const nameWords = ws.slice(0, ws.length - priceWords.length);
    if (!nameWords.length) continue;
    const box = (acc, w) => ({
      x0: Math.min(acc.x0, w.bbox.x0), y0: Math.min(acc.y0, w.bbox.y0),
      x1: Math.max(acc.x1, w.bbox.x1), y1: Math.max(acc.y1, w.bbox.y1),
    });
    const init = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const pb = priceWords.reduce(box, init);
    const nb = nameWords.reduce(box, init);
    const nameH = median(nameWords.map((w) => w.bbox.y1 - w.bbox.y0).filter((h) => h > 0));
    const priceH = pb.y1 - pb.y0;
    if (!nameH || priceH <= 0) continue;
    const nameW = nameWords.reduce((s, w) => s + (w.bbox.x1 - w.bbox.x0), 0);
    const nameChars = nameWords.reduce((s, w) => s + String(w.text).replace(/\s/g, '').length, 0) || 1;
    const priceW = pb.x1 - pb.x0;
    const priceChars = priceWords.reduce((s, w) => s + String(w.text).replace(/[^0-9.,$]/g, '').length, 0) || 1;
    rows.push({
      priceRight: pb.x1, nameRight: nb.x1,
      ratio: priceH / nameH,
      charWidthRatio: (priceW / priceChars) / (nameW / nameChars),
      gap: pb.x0 - nb.x1, priceH,
    });
  }
  if (rows.length === 0) return fallback;
  const marginFracs = rows.map((r) => (W - r.priceRight) / W);
  const spread = Math.max(...marginFracs) - Math.min(...marginFracs);
  const medianMargin = median(marginFracs);
  const rightColumn = spread <= 0.10 && medianMargin <= 0.35;
  const fontRatio = clampNum(Math.round(median(rows.map((r) => r.ratio)) * 100) / 100, 0.5, 1.5);
  const bold = median(rows.map((r) => r.charWidthRatio)) > 1.12;
  const leader = !rightColumn && median(rows.map((r) => r.gap / Math.max(1, r.priceH))) > 3;
  return {
    position: rightColumn ? 'right_column' : 'inline',
    align: rightColumn ? 'right' : 'left',
    margin_right_frac: rightColumn ? clampNum(Math.round(medianMargin * 1000) / 1000, 0.005, 0.4) : null,
    font_ratio: fontRatio,
    bold,
    leader,
    reliable: true,
  };
}

// ---------------------------------------------------------------------------
// Template zones for a snapshot-derived board (same shape the TV PWA and the
// screen designer use: bare array of percent-based zones).
// ---------------------------------------------------------------------------
function buildZones(orientation, restaurantName, priceLayout = null) {
  const zones = [];
  if (restaurantName) {
    zones.push({
      id: 'snapshot-header', label: 'Header / Restaurant Name', type: 'header',
      x: 4, y: 2, width: 92, height: 10,
      alignment: 'center', font_size: 42, min_font_size: 22, max_font_size: 56,
      color: '#ffffff', font_weight: 'bold',
      font_family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      item_ids: [],
    });
  }
  const portrait = orientation === 'portrait';
  zones.push({
    id: 'snapshot-menu', label: 'Snapshot Menu Items', type: 'menu_items',
    x: portrait ? 6 : 8, y: portrait ? 16 : 14,
    width: portrait ? 88 : 84, height: portrait ? 78 : 74,
    alignment: 'left', font_size: 34, min_font_size: 14, max_font_size: 46,
    color: '#ffffff', font_weight: 'normal',
    font_family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    item_ids: [],
    // Price-placement heuristics from the original photo (owner requirement):
    // the TV renders price font-size as an em ratio of the row font and
    // right-aligns or dot-leads prices per the measured layout.
    price_position: priceLayout ? priceLayout.position : 'right_column',
    price_font_ratio: priceLayout ? priceLayout.font_ratio : 0.9,
    price_font_weight: priceLayout && priceLayout.bold ? 'bold' : '600',
    price_leader: !!(priceLayout && priceLayout.leader),
  });
  return zones;
}

// ---------------------------------------------------------------------------
// Pipeline runner — invoked async after upload; updates the snapshots row.
// QUALITY GATE: 'ready' is only recorded when parsed data passes
// gateMenuData — otherwise the snapshot is 'failed' with a clear message, so
// the dashboard NEVER shows junk words/prices as a finished mockup.
// ---------------------------------------------------------------------------
export async function runSnapshotPipeline(snapshotId) {
  const db = getDb();
  const snapshot = db.prepare('SELECT * FROM snapshots WHERE id = ?').get(snapshotId);
  if (!snapshot) return;
  const absPath = path.join(SNAPSHOTS_DIR, path.basename(snapshot.original_path));
  const tmpPaths = [];
  try {
    const cleanTmp = () => {
      for (const p of tmpPaths) { try { fs.unlinkSync(p); } catch { /* noop */ } }
      tmpPaths.length = 0;
    };
    const dims = getImageDimensions(fs.readFileSync(absPath));
    const orientation = dims && dims.height > dims.width ? 'portrait' : 'landscape';

    // Pass A — grayscale/contrast/2× (no hard binarize): best for chalkboards
    // with glare. Pass B — Otsu-binarized retry: best for hard-contrast menus.
    const passes = [{ binarize: false }, { binarize: true }];

    let result = null; // { ocr, items, categories, priceLayout }
    const failKinds = new Set();

    for (const pass of passes) {
      const pre = await preprocessForOcr(absPath, pass);
      tmpPaths.push(pre.tmpPath);

      const ocr = await ocrImage(pre.tmpPath);

      // No text at all → graceful fail (existing path, message preserved).
      // Try the next pass before giving up — a binarized retry can still read
      // a menu that a normalized pass found empty.
      if (!ocr.text || !ocr.text.trim()) {
        failKinds.add('no-text');
        console.warn(`[snapshots] pass ${pass.binarize ? 'otsu' : 'normal'} empty (${snapshotId})`);
        cleanTmp();
        continue;
      }

      // Word-geometry parse (splits two-column boards at the gutter) when OCR
      // word boxes exist; line-based parse otherwise.
      const hasWords = Array.isArray(ocr.words) && ocr.words.length >= 4;
      const parsed = hasWords
        ? parseMenuWords(ocr.words)
        : parseMenuText(ocr.text);
      const { items, categories } = parsed;

      // Text, but no priced items → existing graceful fail path.
      if (items.length === 0) {
        failKinds.add('no-items');
        console.warn(`[snapshots] pass ${pass.binarize ? 'otsu' : 'normal'} no priced items (${snapshotId})`);
        cleanTmp();
        continue;
      }

      // QUALITY GATE — text found but not credible menu data → honest retake
      // message. NEVER status 'ready' with junk words/prices.
      const gate = gateMenuData(parsed);
      if (gate.ok) {
        result = { ocr, items, categories };
        break;
      }
      failKinds.add('gate');
      console.warn(`[snapshots] gate rejected pass ${pass.binarize ? 'otsu' : 'normal'} (${snapshotId}): ${gate.reasons.join('; ')}`);
      cleanTmp();
    }

    if (!result) {
      console.warn(`[snapshots] all OCR passes rejected ${snapshotId} (${[...failKinds].join(', ')})`);
      // Truly empty readings keep the original "no text" message; anything
      // else (no priced items, or text that fails the gate after BOTH
      // preprocessing passes) means the photo itself is unreadable → the
      // clear retake message wins. NEVER 'ready' with garbage.
      if (failKinds.size === 1 && failKinds.has('no-text')) {
        throw new SnapshotPipelineError(NO_TEXT_MESSAGE);
      }
      throw new SnapshotPipelineError(RETAKE_MESSAGE);
    }

    const { ocr, items, categories } = result;

    const restaurant = snapshot.restaurant_id
      ? db.prepare('SELECT * FROM restaurants WHERE id = ?').get(snapshot.restaurant_id)
      : null;
    const restaurantName = restaurant?.name || null;
    // Price placement + glyph-size heuristics from the original photo.
    const priceLayout = measurePriceLayout(ocr);
    const configZones = buildZones(orientation, restaurantName, priceLayout);

    const templateId = uuidv4();
    const screenId = uuidv4();
    const screenSlug = `snapshot-${snapshotId.slice(0, 8)}`;

    db.transaction(() => {
      db.prepare(
        'INSERT INTO templates (id, name, video_url, video_duration_ms, orientation, config_json) VALUES (?, ?, NULL, NULL, ?, ?)'
      ).run(templateId, restaurantName ? `Snapshot — ${restaurantName}` : 'Snapshot Menu', orientation, JSON.stringify(configZones));

      let createdScreenId = null;
      if (snapshot.restaurant_id) {
        createdScreenId = screenId;
        db.prepare(
          'INSERT INTO screens (id, restaurant_id, name, unique_slug, orientation, template_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, 0)'
        ).run(screenId, snapshot.restaurant_id, `${restaurantName || 'Snapshot'} Menu`, screenSlug, orientation, templateId);

        const insertItem = db.prepare(
          `INSERT INTO menu_items
             (id, screen_id, name, description, price, category, availability, text_zone_id,
              font_family, font_size, font_weight, color, sort_order)
           VALUES (?, ?, ?, NULL, ?, ?, 'available', 'snapshot-menu', NULL, NULL, NULL, NULL, ?)`
        );
        for (const it of items) {
          insertItem.run(uuidv4(), screenId, it.name, it.price, it.category, it.sort_order);
        }
      }

      db.prepare(
        `UPDATE snapshots SET status = 'ready', menu_json = ?, template_id = ?, screen_id = ?,
           price_stripped = 1, error_message = NULL, updated_at = datetime('now')
         WHERE id = ?`
      ).run(JSON.stringify({ items, categories, orientation, price_layout: priceLayout }), templateId, createdScreenId, snapshotId);
    })();
  } catch (err) {
    const msg = err instanceof SnapshotPipelineError
      ? err.message
      : `Snapshot processing failed: ${err.message}`;
    db.prepare(
      `UPDATE snapshots SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(msg, snapshotId);
  } finally {
    for (const p of tmpPaths) { try { fs.unlinkSync(p); } catch { /* noop */ } }
  }
}