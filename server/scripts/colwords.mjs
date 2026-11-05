/**
 * colwords.mjs — dump the OCR words (text, conf, bbox) of one column band, so
 * the price decoder can be designed against real output instead of guesses.
 *   node scripts/colwords.mjs /tmp/page.png 0 1240 [psm]
 */
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createWorker, PSM } from 'tesseract.js';
import Jimp from 'jimp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESSDATA_DIR = path.join(__dirname, '..', 'tessdata');
const PAGE = path.resolve(process.argv[2]);
const X0 = Number(process.argv[3]);
const X1 = Number(process.argv[4]);
const PSMV = String(process.argv[5] || PSM.SINGLE_BLOCK);

const base = await Jimp.read(PAGE);
const H = base.getHeight();
const p = path.join(os.tmpdir(), `cw-${process.pid}.png`);
await base.clone().crop(X0, 0, X1 - X0, H).writeAsync(p);

const worker = await createWorker('eng', 1, { langPath: TESSDATA_DIR, cache: false });
try {
  await worker.setParameters({ tessedit_pageseg_mode: PSMV });
  const { data } = await worker.recognize(p, {}, { text: true, blocks: true });
  const words = [];
  for (const b of (data.blocks || [])) for (const pa of (b.paragraphs || [])) for (const l of (pa.lines || [])) for (const w of (l.words || [])) words.push(w);
  // group into rows by y-centre for readability
  const rows = [];
  for (const w of words) {
    const cy = (w.bbox.y0 + w.bbox.y1) / 2;
    const r = rows.find((x) => Math.abs(x.cy - cy) < 22);
    if (r) { r.words.push(w); r.cy = (r.cy + cy) / 2; } else rows.push({ cy, words: [w] });
  }
  rows.sort((a, b) => a.cy - b.cy);
  for (const r of rows) {
    r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    console.log(`y=${Math.round(r.cy)} ` + r.words.map((w) => `"${w.text}"(c${Math.round(w.confidence)},x${w.bbox.x0}-${w.bbox.x1},y${w.bbox.y0}-${w.bbox.y1})`).join(' '));
  }
} finally { await worker.terminate(); fs.unlinkSync(p); }
