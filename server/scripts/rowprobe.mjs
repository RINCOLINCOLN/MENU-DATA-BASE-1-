/**
 * rowprobe.mjs — per-row price-zone OCR test.
 * OCRs one column, then re-OCRs the price zone of each text line with PSM 7
 * (single line) at a few upscales, to see whether the two-tier (superscript)
 * prices resolve. Tuning tool.
 *   node scripts/rowprobe.mjs /tmp/page.png 0 1240 0.6
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
const ZONE_FRAC = Number(process.argv[5] || 0.6);
const EXTRA = Number(process.argv[6] || 3);

const base = await Jimp.read(PAGE);
const H = base.getHeight();
const zoneX0 = Math.round(X0 + (X1 - X0) * ZONE_FRAC);

const worker = await createWorker('eng', 1, { langPath: TESSDATA_DIR, cache: false });
const lines = (data) => {
  const out = [];
  for (const b of (data.blocks || [])) for (const p of (b.paragraphs || [])) for (const l of (p.lines || [])) out.push(l);
  return out;
};
try {
  const colPath = path.join(os.tmpdir(), `rowprobe-col-${process.pid}.png`);
  await base.clone().crop(X0, 0, X1 - X0, H).writeAsync(colPath);
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
  const { data } = await worker.recognize(colPath, {}, { text: true, blocks: true });
  const ls = lines(data);
  console.log(`column lines: ${ls.length}`);
  for (const l of ls) {
    const t = (l.text || '').trim();
    if (!t) continue;
    const y0 = Math.max(0, l.bbox.y0 - Math.round((l.bbox.y1 - l.bbox.y0) * 0.45));
    const y1 = Math.min(H, l.bbox.y1 + Math.round((l.bbox.y1 - l.bbox.y0) * 0.15));
    const zx = Math.max(zoneX0, X0);
    const img = base.clone().crop(zx, y0, X1 - zx, y1 - y0).scale(EXTRA, Jimp.RESIZE_BICUBIC);
    const p = path.join(os.tmpdir(), `rowprobe-${process.pid}.png`);
    await img.writeAsync(p);
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
    const r = await worker.recognize(p, {}, { text: true });
    fs.unlinkSync(p);
    console.log(`[${t.slice(0, 34).padEnd(34)}] price→ "${String(r.data.text || '').trim()}" (${Math.round(r.data.confidence || 0)}%)`);
  }
  fs.unlinkSync(colPath);
} finally { await worker.terminate(); }
