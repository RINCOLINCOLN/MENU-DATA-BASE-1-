import path from 'path';
import { fileURLToPath } from 'url';
import { createWorker, PSM } from 'tesseract.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESSDATA_DIR = path.join(__dirname, '..', 'tessdata');
const page = process.argv[2];
const w = await createWorker('eng', 1, { langPath: TESSDATA_DIR, cache: false });
try {
  for (const psm of [PSM.AUTO, PSM.SINGLE_BLOCK, PSM.SINGLE_COLUMN, PSM.SPARSE_TEXT]) {
    await w.setParameters({ tessedit_pageseg_mode: String(psm) });
    const t0 = Date.now();
    const r = await w.recognize(page, {}, { text: true, blocks: true });
    const d = r.data || {};
    const words = d.words ? d.words.length : (d.blocks || []).length;
    console.log(`psm ${psm}: ${Date.now() - t0}ms keys=${Object.keys(d).join(',')} textLen=${(d.text || '').length} words=${words} conf=${d.confidence}`);
    console.log((d.text || '').split('\n').slice(0, 8).join(' | '));
  }
} finally { await w.terminate(); }
