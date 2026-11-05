/**
 * colprobe.mjs — OCR each of the 4 column bands of the prepared page and print
 * the text, so the preprocessing per column can be compared (grayscale vs Otsu,
 * upscale factor). Tuning tool only.
 *   node scripts/colprobe.mjs /tmp/page.png [--ext 0,0.31,0.55,0.77,1]
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
const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
}
const PAGE = path.resolve(args.page || process.argv[2]);
const ext = String(args.ext || '0,0.31,0.55,0.77,1').split(',').map(Number);
const extras = String(args.extra || 'none').split(','); // none | otsu | up1.5

const base = await Jimp.read(PAGE);
const W = base.getWidth();
const H = base.getHeight();

const worker = await createWorker('eng', 1, { langPath: TESSDATA_DIR, cache: false });
try {
  await worker.setParameters({ tessdata_preserve_interword_spaces: '1' });
  for (const extra of extras) {
    for (let c = 0; c < ext.length - 1; c += 1) {
      const x0 = Math.round(ext[c] * W);
      const x1 = Math.round(ext[c + 1] * W);
      let img = base.clone().crop(x0, 0, x1 - x0, H);
      if (extra.startsWith('up')) img = img.scale(Number(extra.slice(2)), Jimp.RESIZE_BICUBIC);
      if (extra === 'otsu') {
        const t = otsuThresholdFromData(img.clone().grayscale().bitmap.data);
        const { data } = img.bitmap;
        for (let i = 0; i < data.length; i += 4) {
          const v = data[i] > t ? 255 : 0;
          data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
        }
      }
      const p = path.join(os.tmpdir(), `cp-${extra}-${c}-${process.pid}.png`);
      await img.writeAsync(p);
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      const t0 = Date.now();
      const { data } = await worker.recognize(p, {}, { text: true });
      console.log(`\n### ${extra} col${c} x${x0}-${x1} ${Date.now() - t0}ms conf=${Math.round(data.confidence || 0)}`);
      console.log(String(data.text || '').split('\n').filter((l) => l.trim()).join('\n'));
      fs.unlinkSync(p);
    }
  }
} finally { await worker.terminate(); }
