/**
 * oneprice.mjs — OCR a single price cluster ("4⁵⁰ 5⁰⁰") cropped from the page,
 * at several upscales, with and without a digit whitelist. Decides whether the
 * superscript cents are recoverable at all.
 *   node scripts/oneprice.mjs /tmp/page.png 965 757 1164 837
 */
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createWorker, PSM } from 'tesseract.js';
import Jimp from 'jimp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESSDATA_DIR = path.join(__dirname, '..', 'tessdata');
const [PAGE, x0, y0, x1, y1] = [path.resolve(process.argv[2]), ...process.argv.slice(3, 7).map(Number)];

const base = await Jimp.read(PAGE);
const pad = 6;
const worker = await createWorker('eng', 1, { langPath: TESSDATA_DIR, cache: false });
try {
  for (const scale of [2, 4, 8]) {
    for (const whitelist of [null, '0123456789']) {
      const img = base.clone()
        .crop(Math.max(0, x0 - pad), Math.max(0, y0 - pad), (x1 - x0) + pad * 2, (y1 - y0) + pad * 2)
        .scale(scale, Jimp.RESIZE_BICUBIC);
      const p = path.join(os.tmpdir(), `op-${scale}-${whitelist ? 'w' : 'n'}-${process.pid}.png`);
      await img.writeAsync(p);
      const params = { tessedit_pageseg_mode: PSM.SINGLE_BLOCK };
      if (whitelist) params.tessedit_char_whitelist = whitelist; else params.tessedit_char_whitelist = '';
      await worker.setParameters(params);
      const { data } = await worker.recognize(p, {}, { text: true });
      console.log(`scale ${scale} whitelist=${whitelist ? 'digits' : 'none'} → "${String(data.text || '').trim()}" (${Math.round(data.confidence || 0)}%)`);
      const words = [];
      for (const b of (data.blocks || [])) for (const pa of (b.paragraphs || [])) for (const l of (pa.lines || [])) for (const w of (l.words || [])) words.push(`${w.text}[c${Math.round(w.confidence)}]`);
      if (words.length) console.log('    words:', words.join(' '));
      fs.unlinkSync(p);
    }
  }
} finally { await worker.terminate(); }
