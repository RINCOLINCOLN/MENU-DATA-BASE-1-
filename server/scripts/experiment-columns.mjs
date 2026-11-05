/**
 * experiment-columns.mjs — explore the column-split OCR strategy on a photo.
 *   node scripts/experiment-columns.mjs --file <photo> [--psm 6] [--save]
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWorker, PSM } from 'tesseract.js';
import Jimp from 'jimp';
import { prepareMenuImage, detectColumnsFromWords, cropColumn } from '../lib/menuImage.js';
import { readExifOrientation, applyExifOrientation } from '../lib/snapshotPipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESSDATA_DIR = path.join(__dirname, '..', 'tessdata');
const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
}
const FILE = path.resolve(args.file || path.join(__dirname, '..', 'e2e', 'fixtures', 'owner-menu-photo.jpg'));
const PSM_FULL = String(args.psm || PSM.SINGLE_BLOCK);

const buf = fs.readFileSync(FILE);
const img = await Jimp.read(buf);
const orientation = readExifOrientation(buf);
if (orientation !== 1) applyExifOrientation(img, orientation);

const prep = await prepareMenuImage(img, {});
console.log('prep:', JSON.stringify({
  polarity: prep.polarity, boardTop: prep.boardTop, scale: prep.scale,
  dims: [prep.page.getWidth(), prep.page.getHeight()], inkThreshold: prep.inkThreshold, inkFrac: prep.inkFrac,
}));
const pagePath = path.join('/tmp', `page-${path.basename(FILE)}.png`);
await prep.page.writeAsync(pagePath);

const worker = await createWorker('eng', 1, { langPath: TESSDATA_DIR, cache: false });
const flat = (data) => {
  if (!data.words && Array.isArray(data.blocks)) {
    data.words = [];
    for (const b of data.blocks) for (const p of (b.paragraphs || [])) for (const l of (p.lines || [])) for (const w of (l.words || [])) data.words.push(w);
  }
  return data;
};

try {
  await worker.setParameters({ tessedit_pageseg_mode: PSM_FULL });
  let t0 = Date.now();
  const full = flat(await worker.recognize(pagePath, {}, { text: true, blocks: true }));
  console.log(`\nfull-page OCR (psm ${PSM_FULL}) ${Date.now() - t0}ms words=${(full.words || []).length} conf=${full.confidence}`);
  console.log(String(full.text).split('\n').slice(0, 60).join('\n'));

  const cols = detectColumnsFromWords(full.words || [], prep.page.getWidth());
  console.log('\ncolumns:', JSON.stringify({ columns: cols.columns, gutters: cols.gutters, reason: cols.reason, wordCount: cols.wordCount }));

  for (const [i, band] of cols.columns.entries()) {
    const crop = cropColumn(prep.page, band);
    const p = path.join(os.tmpdir(), `col-${i}-${process.pid}.png`);
    await crop.img.writeAsync(p);
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
    t0 = Date.now();
    const d = flat(await worker.recognize(p, {}, { text: true, blocks: true }));
    console.log(`\n--- column ${i} x${band.x0}-${band.x1} ${Date.now() - t0}ms words=${(d.words || []).length} conf=${d.confidence}`);
    console.log(String(d.text).split('\n').filter((l) => l.trim()).slice(0, 45).join('\n'));
    fs.unlinkSync(p);
  }
} finally {
  await worker.terminate();
}
console.log('\npage written to', pagePath);
