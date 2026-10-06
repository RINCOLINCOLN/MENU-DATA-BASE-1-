// Smoke test: tesseract.js OCR on the fixture menu photo.
// Run: cd server && node e2e/ocr-smoke.mjs
import { createWorker } from 'tesseract.js';
import fs from 'fs';

const image = '/home/team/shared/menuvo/server/e2e/fixtures/menu-photo.png';
const worker = await createWorker('eng', 1, { langPath: '/home/team/shared/menuvo/server/tessdata' });
const { data } = await worker.recognize(image);
console.log('CONFIDENCE:', data.confidence);
console.log('--- RAW TEXT ---');
console.log(data.text);
await worker.terminate();