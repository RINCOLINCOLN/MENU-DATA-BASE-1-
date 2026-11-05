/**
 * priceprobe.mjs — OCR just the PRICE ZONE (right edge of a column) at several
 * upscales, to see whether the superscript ("two-tier") prices resolve.
 *   node scripts/priceprobe.mjs /tmp/page.png 0 1240
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
const LEFT = Number(process.argv[5] || 0.55); // fraction of the band to keep (right part)

const base = await Jimp.read(PAGE);
const H = base.getHeight();
const bandW = X1 - X0;
const cx0 = Math.round(X0 + bandW * LEFT);

const worker = await createWorker('eng', 1, { langPath: TESSDATA_DIR, cache: false });
try {
  for (const scale of [2, 3, 4, 6]) {
    let img = base.clone().crop(cx0, 0, X1 - cx0, H);
    img = img.scale(scale, Jimp.RESIZE_BICUBIC);
    const p = path.join(os.tmpdir(), `pp-${scale}-${process.pid}.png`);
    await img.writeAsync(p);
    for (const psm of [PSM.SINGLE_BLOCK, PSM.SPARSE_TEXT]) {
      await worker.setParameters({ tessedit_pageseg_mode: psm });
      const t0 = Date.now();
      const { data } = await worker.recognize(p, {}, { text: true });
      console.log(`\n### scale ${scale} psm ${psm} ${Date.now() - t0}ms conf=${Math.round(data.confidence || 0)}`);
      console.log(String(data.text || '').split('\n').filter((l) => l.trim()).join(' | '));
    }
    fs.unlinkSync(p);
  }
} finally { await worker.terminate(); }
