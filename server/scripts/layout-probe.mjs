/**
 * layout-probe.mjs — fast (no-OCR) probe of the layout measurements for one
 * photo: row luminance profile, board top, X-axis ink coverage and the column
 * bands that come out. Used to tune menuImage.js against real photos.
 *
 *   node scripts/layout-probe.mjs --file <photo>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Jimp from 'jimp';
import { measurePolarity, detectBoardTop, detectColumns, otsuThresholdFromData } from '../lib/menuImage.js';
import { readExifOrientation, applyExifOrientation } from '../lib/snapshotPipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
}
const FILE = path.resolve(args.file || path.join(__dirname, '..', 'e2e', 'fixtures', 'owner-menu-photo.jpg'));

const buf = fs.readFileSync(FILE);
const img = await Jimp.read(buf);
const orientation = readExifOrientation(buf);
if (orientation !== 1) applyExifOrientation(img, orientation);
const polarity = measurePolarity(img);
const corrected = img.clone().grayscale().normalize().contrast(0.3);
if (polarity.darkBackground) corrected.invert(); // ink becomes dark on light
const inkThreshold = otsuThresholdFromData(corrected.bitmap.data);

// raw row luminance profile (sampled)
const { data, width, height } = img.clone().grayscale().bitmap;
const rows = [];
for (let y = 0; y < height; y += Math.max(1, Math.round(height / 60))) {
  let s = 0;
  for (let x = 0; x < width; x += 1) s += data[y * width * 4 + x * 4];
  rows.push([y, Math.round(s / width)]);
}
console.log('polarity', polarity, 'inkThreshold', inkThreshold);
console.log('row mean luminance (y, mean):', JSON.stringify(rows));

const boardTop = detectBoardTop(img, polarity);
console.log('boardTop', boardTop, `(${(boardTop / height * 100).toFixed(1)}%)`);

const res = detectColumns(corrected, { region: { y0: boardTop, y1: height }, inkThreshold });
console.log('columns', JSON.stringify(res.columns));
console.log('gutters', JSON.stringify(res.gutters));
const n = res.coverage.length;
const step = Math.max(1, Math.round(n / 100));
const prof = [];
for (let i = 0; i < n; i += step) prof.push(`${Math.round(i * (width / n))}:${res.coverage[i].toFixed(2)}`);
console.log('coverage profile (x:frac)', prof.join(' '));

await Jimp.writeAsync;
const out = path.join('/tmp', `layout-${path.basename(FILE)}.png`);
fs.copyFileSync(FILE, out);
