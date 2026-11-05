/**
 * digitprobe.mjs — price zone (right edge of each column) OCRed with a DIGIT
 * WHITELIST. The superscript cents on a chalkboard read as °/" /% glyphs
 * otherwise; forcing digits should recover "450 500" instead.
 *   node scripts/digitprobe.mjs /tmp/page.png
 */
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createWorker, PSM } from 'tesseract.js';
import Jimp from 'jimp';
import { otsuThresholdFromData } from '../lib/menuImage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESSDATA_DIR = path.join(__dirname, '..', 'tessdata');

const PAGE = path.resolve(process.argv[2]);
const ext = String(process.argv[3] || '0,0.31,0.55,0.77,1').split(',').map(Number);
const fromFrac = Number(process.argv[4] || 0.62);
const extras = String(process.argv[5] || '4').split(',').map(Number);
const binarize = process.argv[6] !== 'no';

const base = await Jimp.read(PAGE);
const W = base.getWidth();
const H = base.getHeight();

const worker = await createWorker('eng', 1, { langPath: TESSDATA_DIR, cache: false });
try {
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789',
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    tessdata_preserve_interword_spaces: '1',
  });
  for (const extra of extras) {
    for (let c = 0; c < ext.length - 1; c += 1) {
      const cx0 = Math.round(ext[c] * W);
      const cx1 = Math.round(ext[c + 1] * W);
      const zx = Math.round(cx0 + (cx1 - cx0) * fromFrac);
      let img = base.clone().crop(zx, 0, cx1 - zx, H).scale(extra, Jimp.RESIZE_BICUBIC);
      if (binarize) {
        const t = otsuThresholdFromData(img.clone().grayscale().bitmap.data);
        const { data } = img.bitmap;
        for (let i = 0; i < data.length; i += 4) {
          const v = data[i] > t ? 255 : 0;
          data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
        }
      }
      const p = path.join(os.tmpdir(), `dp-${extra}-${c}-${process.pid}.png`);
      await img.writeAsync(p);
      const t0 = Date.now();
      const { data } = await worker.recognize(p, {}, { text: true });
      console.log(`\n### x${extra} col${c} zone x${zx}-${cx1} binarize=${binarize} ${Date.now() - t0}ms conf=${Math.round(data.confidence || 0)}`);
      console.log(String(data.text || '').split('\n').map((l) => l.trim()).filter(Boolean).join(' | '));
      fs.unlinkSync(p);
    }
  }
} finally { await worker.terminate(); }
