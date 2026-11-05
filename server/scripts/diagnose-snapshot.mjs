/**
 * diagnose-snapshot.mjs — stage-by-stage OFFLINE diagnosis of the snapshot OCR
 * pipeline for one photo. Does not touch the live API or the DB.
 *
 *   node scripts/diagnose-snapshot.mjs --file <photo> [--out <dir>]
 *        [--variants normal,otsu,invert,invert-otsu,columns]
 *
 * Prints, per variant: image statistics (polarity, binarization), the OCR words
 * with confidence + bounding boxes, what menuParse produces from them, and why
 * gateMenuData accepts or rejects the result. Writes a JSON dump of everything
 * so the numbers in the PR/report are reproducible.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWorker, PSM } from 'tesseract.js';
import Jimp from 'jimp';
import {
  parseMenuText,
  parseMenuWords,
  gateMenuData,
} from '../lib/menuParse.js';
import {
  readExifOrientation,
  applyExifOrientation,
} from '../lib/snapshotPipeline.js';
import { measurePolarity, detectBoardTop, detectColumns, otsuThresholdFromData } from '../lib/menuImage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESSDATA_DIR = path.join(__dirname, '..', 'tessdata');

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
}
const FILE = path.resolve(args.file || path.join(__dirname, '..', 'e2e', 'fixtures', 'owner-menu-photo.jpg'));
const OUT = path.resolve(args.out || '/home/team/shared/snapshot-diagnosis');
const VARIANTS = String(args.variants || 'normal,otsu,invert,invert-otsu,columns').split(',').filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });

// ── preprocessing variants (mirror of pipeline.preprocessForOcr + candidates) ─
function stats(img) {
  const { data } = { data: img.clone().grayscale().bitmap.data };
  let dark = 0; let n = 0; let sum = 0;
  for (let i = 0; i < data.length; i += 4) { n += 1; sum += data[i]; if (data[i] < 60) dark += 1; }
  return { mean: Math.round((sum / n) * 10) / 10, pctVeryDark: Math.round((dark / n) * 1000) / 10 };
}

function binarize(img, threshold) {
  const { data } = img.bitmap;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] > threshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
  return img;
}

async function buildVariant(buf, name) {
  const orientation = readExifOrientation(buf);
  const img = await Jimp.read(buf);
  if (orientation !== 1) applyExifOrientation(img, orientation);
  const rawDims = { width: img.getWidth(), height: img.getHeight() };

  img.grayscale();
  img.normalize();
  img.contrast(0.3);

  const wantsInvert = name.startsWith('invert') || name === 'columns';
  if (wantsInvert) img.invert();

  // 2× upscale for photos in the 1200–2600px band (same rule as the pipeline)
  const longest = Math.max(rawDims.width, rawDims.height);
  let scale = 1;
  if (longest >= 1200 && longest <= 2600) scale = 2;
  else if (longest < 1200) scale = Math.max(1, Math.round(2200 / longest));
  if (scale !== 1) img.scale(scale, Jimp.RESIZE_BICUBIC);

  let binarized = null;
  if (name.endsWith('otsu')) {
    binarized = otsuThresholdFromData(img.clone().bitmap.data);
    binarize(img, binarized);
  }
  const p = path.join(os.tmpdir(), `diag-${name}-${process.pid}.png`);
  await img.writeAsync(p);
  return { path: p, img, orientation, rawDims, scale, binarized, stats: stats(img) };
}

async function ocr(worker, filePath, psm) {
  await worker.setParameters({ tessedit_pageseg_mode: String(psm) });
  const { data } = await worker.recognize(filePath, {}, { text: true, blocks: true });
  if (!data.words && Array.isArray(data.blocks)) {
    data.words = [];
    for (const b of data.blocks) for (const pa of (b.paragraphs || [])) for (const l of (pa.lines || [])) for (const w of (l.words || [])) data.words.push(w);
  }
  return data;
}

const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

function summarize(data) {
  const words = (data.words || []).filter((w) => w && w.text && String(w.text).trim());
  const confs = words.map((w) => Number(w.confidence ?? 0)).filter((c) => Number.isFinite(c));
  const meanConf = confs.length ? round(confs.reduce((a, b) => a + b, 0) / confs.length) : 0;
  return {
    chars: (data.text || '').length,
    words: words.length,
    meanConf,
    highConfWords: words.filter((w) => Number(w.confidence) >= 60).length,
    text: (data.text || '').slice(0, 1200),
    sample: words.slice(0, 40).map((w) => ({
      text: w.text,
      conf: Math.round(Number(w.confidence) || 0),
      bbox: w.bbox,
    })),
  };
}

function parseAndGate(data) {
  const words = (data.words || []).filter((w) => w && w.text && String(w.text).trim());
  const parsed = words.length >= 4 ? parseMenuWords(words) : parseMenuText(data.text || '');
  const gate = gateMenuData(parsed);
  return {
    parser: words.length >= 4 ? 'parseMenuWords' : 'parseMenuText',
    items: parsed.items,
    categories: parsed.categories,
    unpricedRows: parsed.unpricedRows,
    gate,
  };
}

const buf = fs.readFileSync(FILE);
const orientation = readExifOrientation(buf);
const probe = await Jimp.read(buf);
if (orientation !== 1) applyExifOrientation(probe, orientation);
const polarity = measurePolarity(probe);
const boardTop = detectBoardTop(probe, polarity);
const normalized = probe.clone().grayscale().normalize().contrast(0.3);
const inkThreshold = otsuThresholdFromData(normalized.bitmap.data);
const cols = detectColumns(normalized, { region: { y0: boardTop, y1: probe.getHeight() }, inkThreshold });

const report = {
  file: FILE,
  bytes: buf.length,
  exif_orientation: orientation,
  dims_after_exif: { width: probe.getWidth(), height: probe.getHeight() },
  polarity,
  board_top_px: boardTop,
  board_frac_of_height: round(boardTop / probe.getHeight(), 3),
  ink_threshold: inkThreshold,
  columns: cols.columns,
  gutters: cols.gutters,
  coverage_profile_frac: cols.coverage.filter((_, i) => i % Math.max(1, Math.round(cols.coverage.length / 60)) === 0)
    .map((c) => round(c, 2)),
  variants: {},
};

const worker = await createWorker('eng', 1, { langPath: TESSDATA_DIR, cache: false });
try {
  for (const name of VARIANTS) {
    const v = await buildVariant(buf, name);
    const t0 = Date.now();
    const data = await ocr(worker, v.path, name === 'columns' ? PSM.SINGLE_COLUMN : PSM.AUTO);
    const ms = Date.now() - t0;
    const s = summarize(data);
    const pg = parseAndGate(data);
    report.variants[name] = {
      preprocessing: {
        inverted: name.startsWith('invert') || name === 'columns',
        binarized: v.binarized,
        upscale: v.scale,
        dims: { width: v.img.getWidth(), height: v.img.getHeight() },
        stats: v.stats,
      },
      ocr_ms: ms,
      ocr: s,
      parse: {
        parser: pg.parser,
        item_count: pg.items.length,
        items: pg.items.slice(0, 40),
        categories: pg.categories,
        unpriced_row_count: pg.unpricedRows.length,
        unpriced_rows: pg.unpricedRows.slice(0, 40),
      },
      gate: { ok: pg.gate.ok, reasons: pg.gate.reasons },
    };
    fs.unlinkSync(v.path);
    console.log(`\n=== ${name} === ${ms}ms | words=${s.words} meanConf=${s.meanConf} | items=${pg.items.length} | gate ${pg.gate.ok ? 'OK' : 'REJECT: ' + pg.gate.reasons.join('; ')}`);
    console.log(s.text.replace(/\n{2,}/g, '\n').split('\n').slice(0, 30).join('\n'));
    if (pg.items.length) console.log('items:', pg.items.slice(0, 15).map((i) => `${i.name} = $${i.price}`).join(' | '));
  }
} finally {
  await worker.terminate();
}

fs.writeFileSync(path.join(OUT, `diagnosis-${path.basename(FILE)}.json`), JSON.stringify(report, null, 2));
console.log('\n--- layout ---');
console.log(JSON.stringify({
  exif_orientation: report.exif_orientation,
  dims: report.dims_after_exif,
  polarity: report.polarity,
  board_top_px: report.board_top_px,
  ink_threshold: report.ink_threshold,
  columns: report.columns,
  gutters: report.gutters,
}, null, 2));
console.log(`\nwrote ${path.join(OUT, `diagnosis-${path.basename(FILE)}.json`)}`);
