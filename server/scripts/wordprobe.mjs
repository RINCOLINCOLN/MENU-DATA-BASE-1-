/**
 * wordprobe.mjs — for each PSM, count OCR words and show the column bands
 * detectColumnsFromWords finds. Tuning tool for the column split.
 *   node scripts/wordprobe.mjs /tmp/page.png
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createWorker, PSM } from 'tesseract.js';
import { detectColumnsFromWords } from '../lib/menuImage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESSDATA_DIR = path.join(__dirname, '..', 'tessdata');
const PAGE = path.resolve(process.argv[2]);

const worker = await createWorker('eng', 1, { langPath: TESSDATA_DIR, cache: false });
const flatten = (data) => {
  const out = [];
  for (const b of (data.blocks || [])) for (const p of (b.paragraphs || [])) for (const l of (p.lines || [])) for (const w of (l.words || [])) out.push(w);
  if (!out.length && Array.isArray(data.words)) out.push(...data.words);
  return out;
};
try {
  for (const psm of [PSM.AUTO, PSM.SINGLE_COLUMN, PSM.SINGLE_BLOCK, PSM.SPARSE_TEXT]) {
    await worker.setParameters({ tessedit_pageseg_mode: String(psm) });
    const t0 = Date.now();
    const { data } = await worker.recognize(PAGE, {}, { text: true, blocks: true });
    const words = flatten(data);
    const width = data.imageColor?.width || (data.blocks?.[0]?.bbox?.x1) || 4000;
    const cols = detectColumnsFromWords(words, Math.max(width, ...words.map((w) => w.bbox.x1)));
    console.log(`psm ${psm}: ${Date.now() - t0}ms words=${words.length} conf=${Math.round(data.confidence || 0)} width=${width}`);
    console.log('   columns:', JSON.stringify(cols.columns), 'gutters:', JSON.stringify(cols.gutters), cols.reason);
  }
} finally { await worker.terminate(); }
