/**
 * menuImage.js — layout analysis for menu photos (jimp only, no native deps).
 *
 * Real café menus are not "a page of text". The owner's own photo is a
 * CHALKBOARD photographed with a shelf of shoes/drinks cans above it, with FOUR
 * text columns and superscript ("two-tier") prices. Feeding that whole frame to
 * tesseract in reading order interleaves the columns, which destroys
 * item/price adjacency — that is why the pipeline used to extract 2 items out
 * of ~40.
 *
 * This module gives the pipeline the three measurements it needs:
 *
 *   1. POLARITY — median luminance decides whether the photo is dark-background
 *      (chalkboard: light chalk on a near-black board) and must be INVERTED so
 *      OCR sees dark ink on a light page. The LSTM model is trained on dark-on-
 *      light text; light-on-dark loses most glyphs, and Otsu binarization on a
 *      raw chalkboard produces WHITE-on-BLACK, i.e. the worst case for it.
 *      Paper menus (median ≥ 128) are left untouched.
 *   2. BOARD REGION — for dark boards, the bright clutter above the board (a
 *      shelf of shoes, cans, a window) is cropped off. In the raw photo those
 *      rows are much brighter than the board, so the board is the longest
 *      contiguous run of rows darker than the frame's Otsu split.
 *   3. COLUMNS — measured from OCR WORD geometry (see detectColumnsFromWords).
 *      A pixel ink projection is too noisy on chalk lettering (sparse strokes →
 *      gutter and column look alike); word boxes are not: every word belongs to
 *      exactly one column, so a gutter is an x-range no word except the odd
 *      centred title crosses.
 */
import Jimp from 'jimp';

const RESIZE_BICUBIC = 4; // jimp 0.22 RESIZE_BICUBIC
const RESIZE_BILINEAR = 2;

/** Copy of an image as 8-bit grayscale luminance (r channel). */
export function grayscaleLuma(img) {
  const g = img.clone().grayscale();
  return { data: g.bitmap.data, width: g.getWidth(), height: g.getHeight() };
}

export function otsuThresholdFromData(data) {
  const hist = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) { hist[data[i]] += 1; total += 1; }
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

function medianOf(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Is this a dark-background menu (chalkboard / blackboard / dark painted
 * wall)? Statistic: median luminance of the frame. The owner's chalkboard photo
 * measures median 46 / mean 78; lit paper menus sit above 140. `darkBackground`
 * tells the caller to invert.
 */
export function measurePolarity(img) {
  const { data } = grayscaleLuma(img);
  const hist = new Uint32Array(256);
  let n = 0;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) { hist[data[i]] += 1; sum += data[i]; n += 1; }
  let acc = 0;
  let median = 0;
  for (let t = 0; t < 256; t += 1) { acc += hist[t]; if (acc >= n / 2) { median = t; break; } }
  return {
    median,
    mean: Math.round((sum / n) * 10) / 10,
    darkBackground: median < 128,
    threshold: otsuThresholdFromData(data),
  };
}

/**
 * Top of the menu board in a dark-background photo (0 = no crop).
 * The board is the longest contiguous run of rows whose mean luminance is below
 * the frame's Otsu split (×1.1 headroom for glare on the board surface). Runs
 * shorter than 25% of the frame height are ignored — that is not a board.
 */
export function detectBoardTop(img, polarity) {
  if (!polarity || !polarity.darkBackground) return 0;
  const { data, width, height } = grayscaleLuma(img); // raw polarity (not inverted)
  const stepY = Math.max(1, Math.floor(height / 500));
  const rowMean = [];
  for (let y = 0; y < height; y += stepY) {
    let s = 0;
    const off = y * width * 4;
    for (let x = 0; x < width; x += 1) s += data[off + x * 4];
    rowMean.push({ y, mean: s / width });
  }
  const cut = (polarity.threshold || 127) * 1.1;
  let best = { start: 0, len: 0 };
  let runStart = -1;
  for (let i = 0; i < rowMean.length; i += 1) {
    const onBoard = rowMean[i].mean < cut;
    if (onBoard && runStart < 0) runStart = i;
    if ((!onBoard || i === rowMean.length - 1) && runStart >= 0) {
      const end = onBoard ? i : i - 1;
      if (end - runStart + 1 > best.len) best = { start: runStart, len: end - runStart + 1 };
      runStart = -1;
    }
  }
  if (!best.len || best.len * stepY < height * 0.25) return 0;
  return rowMean[best.start].y;
}

/**
 * Full preprocessing → a single-channel "page" the OCR worker can read:
 *   EXIF handled by the caller → grayscale → normalize → gentle contrast
 *   → INVERT when the photo is a dark board → crop the non-menu top band
 *   → upscale (2× for the 1200–2600px band, which is where phone photos land).
 *
 * `opts.binarize` adds an Otsu threshold pass (fallback pass only: on
 * chalkboards the grayscale image keeps the glare-softened stroke edges that
 * binarization eats).
 *
 * Returns the working Jimp image plus every measurement used to produce it, so
 * callers can report exactly what happened.
 */
export async function prepareMenuImage(img, opts = {}) {
  const rawDims = { width: img.getWidth(), height: img.getHeight() };
  const polarity = measurePolarity(img);

  const work = img.clone().grayscale().normalize().contrast(0.3);
  if (polarity.darkBackground) work.invert(); // chalk → dark ink on light page

  const boardTop = Math.round(detectBoardTop(img, polarity) * (opts.boardScale ?? 1));
  let page = work;
  if (boardTop > 0) page = work.crop(0, boardTop, rawDims.width, rawDims.height - boardTop);

  const longest = Math.max(rawDims.width, rawDims.height);
  let scale = 1;
  if (longest >= 1200 && longest <= 2600) scale = 2;
  else if (longest < 1200) scale = Math.max(1, Math.round(2200 / longest));
  if (scale !== 1) page.scale(scale, RESIZE_BICUBIC);

  const inkThreshold = otsuThresholdFromData(page.clone().grayscale().bitmap.data);

  if (opts.binarize) {
    const { data } = page.bitmap;
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i] > inkThreshold ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }

  // Bookkeeping statistics — evidence for the diagnosis report.
  const { data } = page.bitmap;
  let ink = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) { if (data[i] < inkThreshold) ink += 1; n += 1; }
  return {
    page,
    polarity,
    boardTop,
    scale,
    rawDims,
    inkThreshold,
    inkFrac: Math.round((ink / n) * 1000) / 1000,
    cropOffsetY: boardTop,
    inverted: polarity.darkBackground,
  };
}

/** Downscaled working copy for projections (max dimension `maxDim`). */
export function analysisCopy(img, maxDim = 1000) {
  const w = img.getWidth();
  const h = img.getHeight();
  const longest = Math.max(w, h);
  if (longest <= maxDim) return { img: img.clone(), scale: 1 };
  const scale = maxDim / longest;
  return { img: img.clone().resize(Math.round(w * scale), Math.round(h * scale), RESIZE_BILINEAR), scale };
}

/**
 * Column bands from OCR WORD geometry.
 *
 * Every text word belongs to exactly one column, so the union of word boxes
 * gives a nearly solid ink profile inside a column and (almost) nothing at a
 * gutter. Only a centred title ("DANIEL S COFFEE") crosses gutters, and it
 * contributes a count of 1–3 compared with the hundreds of pixels of real
 * column text.
 *
 * Words below `minConf` are ignored (garbage floats), and bands narrower than
 * `minColFrac` of the text width are merged away so a stray mark can't become
 * a column.
 *
 * Returns { columns: [{x0,x1}], coverage, gutters }.
 */
export function detectColumnsFromWords(words, width, opts = {}) {
  const minConf = opts.minConf ?? 35;
  const minColFrac = opts.minColFrac ?? 0.10;
  const maxCols = opts.maxCols ?? 4;
  const gutterFrac = opts.gutterFrac ?? 0.012;
  const emptyMax = opts.emptyMax ?? 3; // word-boxes crossing an x for it to be "gutter"

  const ws = (words || []).filter((w) => w && w.text && String(w.text).trim()
    && Number(w.confidence ?? 0) >= minConf && w.bbox && w.bbox.x1 > w.bbox.x0);
  if (ws.length < 4) return { columns: [], coverage: [], gutters: [], reason: 'too-few-words' };

  const cov = new Uint16Array(Math.max(1, width));
  for (const w of ws) {
    const x0 = Math.max(0, Math.floor(w.bbox.x0));
    const x1 = Math.min(width, Math.ceil(w.bbox.x1));
    for (let x = x0; x < x1; x += 1) cov[x] += 1;
  }

  // Trim the empty margins first — they are not columns either.
  let left = 0;
  while (left < width && cov[left] <= emptyMax) left += 1;
  let right = width - 1;
  while (right > left && cov[right] <= emptyMax) right -= 1;
  if (right - left < width * 0.2) return { columns: [{ x0: 0, x1: width }], coverage: [], gutters: [], reason: 'no-text-band' };

  const runs = [];
  let runStart = -1;
  for (let x = left; x <= right; x += 1) {
    const empty = cov[x] <= emptyMax;
    if (empty && runStart < 0) runStart = x;
    if ((!empty || x === right) && runStart >= 0) { runs.push([runStart, empty ? x : x - 1]); runStart = -1; }
  }
  const minGutterPx = Math.max(6, Math.round(width * gutterFrac));
  const gutters = runs.filter(([a, b]) => (b - a + 1) >= minGutterPx);

  const minColPx = Math.round((right - left) * minColFrac);
  const bands = [];
  let start = left;
  for (const [a, b] of gutters) {
    const cut = Math.round((a + b) / 2);
    if (cut - start > 0) bands.push({ x0: start, x1: cut });
    start = cut;
  }
  bands.push({ x0: start, x1: right });

  // Merge slivers into the previous band (ragged board edge, a lone glyph).
  const merged = [];
  for (const b of bands) {
    if (merged.length && (b.x1 - b.x0) < minColPx) merged[merged.length - 1].x1 = b.x1;
    else merged.push({ ...b });
  }
  // Cap the number of columns by repeatedly folding the narrowest into a neighbour.
  while (merged.length > maxCols) {
    let idx = 0;
    for (let i = 1; i < merged.length; i += 1) {
      if (merged[i].x1 - merged[i].x0 < merged[idx].x1 - merged[idx].x0) idx = i;
    }
    if (idx === merged.length - 1) { merged[idx - 1].x1 = merged[idx].x1; merged.splice(idx, 1); }
    else { merged[idx + 1].x0 = merged[idx].x0; merged.splice(idx, 1); }
  }

  return {
    columns: merged.filter((b) => b.x1 > b.x0),
    gutters,
    coverage: Array.from(cov),
    wordCount: ws.length,
    reason: merged.length > 1 ? 'word-gutters' : 'single-column',
  };
}

/** Crop a padded column band out of the prepared page. */
export function cropColumn(page, band, padFrac = 0.01) {
  const w = page.getWidth();
  const h = page.getHeight();
  const pad = Math.round(w * padFrac);
  const x0 = Math.max(0, Math.floor(band.x0) - pad);
  const x1 = Math.min(w, Math.ceil(band.x1) + pad);
  return { img: page.clone().crop(x0, 0, x1 - x0, h), x0, y0: 0, width: x1 - x0, height: h };
}
