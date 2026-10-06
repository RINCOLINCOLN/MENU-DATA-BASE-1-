/**
 * E2E: Snapshot-to-digital backend + payment-hold groundwork.
 *
 * Run against a LIVE server (BASE_URL, default http://localhost:3000):
 *   cd server && node e2e/snapshot-flow.mjs
 *
 * Covers the contract Dashboard Dev's UI is built against:
 *   POST /api/snapshots           → { snapshot_id, status: "processing" }
 *   GET  /api/snapshots/:id       → { status, original_url, mockup_url?, message?, menu_items?, template?, screen? }
 *   PATCH /api/snapshots/:id      → owner-redesign flag
 * Hold flag: /api/screens/:slug/data reflects restaurant/screen on_hold.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const FIXTURE = path.join(__dirname, 'fixtures', 'menu-photo.png');
const DB_PATH = path.join(__dirname, '..', 'data', 'menuvo.db');

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { passed += 1; console.log(`  ✅ ${label}`); }
  else { failed += 1; console.error(`  ❌ ${label}`); }
}

const api = async (pathname, opts = {}) => {
  const res = await fetch(`${BASE_URL}${pathname}`, opts);
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
};

// 1. Register a throwaway user + restaurant
const email = `snap-e2e-${Date.now()}@test.app`;
const reg = await api('/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'snap-pass-123', name: 'Snap E2E' }),
});
console.log('\n[1] auth');
assert(reg.status === 201, `register → 201 (got ${reg.status})`);
const token = reg.body.token;
const H = { Authorization: `Bearer ${token}` };
const rest = await api('/api/restaurants', {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Snap Test Eatery' }),
});
assert(rest.status === 201, `create restaurant → 201 (got ${rest.status})`);
const restaurantId = rest.body.restaurant.id;

// 2. Unauthenticated upload must fail
console.log('\n[2] auth guards');
const unauth = await api('/api/snapshots', { method: 'POST' });
assert(unauth.status === 401, `POST without token → 401 (got ${unauth.status})`);

// 3. POST snapshot with the menu photo
console.log('\n[3] upload + pipeline');
assert(fs.existsSync(FIXTURE), `fixture exists (${FIXTURE})`);
const form = new FormData();
form.append('photo', new Blob([fs.readFileSync(FIXTURE)], { type: 'image/png' }), 'menu-photo.png');
form.append('restaurant_id', restaurantId);
const up = await api('/api/snapshots', { method: 'POST', headers: H, body: form });
assert(up.status === 201, `POST /api/snapshots → 201 (got ${up.status})`);
assert(up.body.snapshot_id && up.body.status === 'processing',
  `returns { snapshot_id, status: "processing" } (got ${JSON.stringify(up.body)})`);
const sid = up.body.snapshot_id;

// 4. Poll GET until ready/failed
let snap = null;
for (let i = 0; i < 60; i += 1) {
  const r = await api(`/api/snapshots/${sid}`, { headers: H });
  if (r.status === 200 && r.body.status !== 'processing') { snap = r.body; break; }
  await new Promise((res) => setTimeout(res, 2000));
}
if (!snap) { console.error('  ❌ pipeline did not finish in 120s'); process.exit(1); }
assert(snap.status === 'ready', `pipeline → ready (got ${snap.status}${snap.message ? `: ${snap.message}` : ''})`);
assert(snap.original_url && snap.original_url.startsWith('/uploads/snapshots/'), 'original_url served from /uploads/snapshots');
assert(snap.price_stripped === true, 'price_stripped = true (prices are DATA, not baked)');
assert(Array.isArray(snap.menu_items) && snap.menu_items.length >= 8, `menu_items extracted (${snap.menu_items?.length})`);
const asada = snap.menu_items.find((i) => i.name === 'Asada');
assert(asada && asada.price === 4.5, 'Asada → $4.50 parsed as data');
const burrito = snap.menu_items.find((i) => i.name === 'Pollo Burrito');
assert(burrito && burrito.price === 9.99, 'Pollo Burrito → $9.99 parsed as data');
assert(snap.categories.includes('TACOS') && snap.categories.includes('DRINKS'), `categories detected (${snap.categories?.join(',')})`);
assert(snap.template && snap.template.id, 'template generated with zones');
assert(snap.template.text_zones.some((z) => z.id === 'snapshot-menu'), 'menu zone in template config');
assert(snap.screen && snap.screen.slug, 'screen created for the restaurant');

// Price-placement + glyph heuristics (owner requirement): fixture prices form
// a right-aligned column and the price font ≈ item-name font.
const menuZone = snap.template.text_zones.find((z) => z.id === 'snapshot-menu');
assert(snap.suggested_price_zone === 'right_column', `suggested_price_zone = 'right_column' (got ${snap.suggested_price_zone})`);
assert(typeof snap.price_font_ratio === 'number' && snap.price_font_ratio >= 0.5 && snap.price_font_ratio <= 1.5,
  `price_font_ratio in [0.5, 1.5] (got ${snap.price_font_ratio})`);
assert(typeof snap.price_bold === 'boolean', 'price_bold flag present');
assert(menuZone && menuZone.price_font_ratio === snap.price_font_ratio, 'template zone carries the measured price font ratio');
assert(menuZone && menuZone.price_position === 'right_column', 'template zone carries the measured price position');

// 5. TV data endpoint: menu items live + on_hold false by default
console.log('\n[4] hold-flag groundwork');
const tv = await api(`/api/screens/${snap.screen.slug}/data`);
assert(tv.status === 200 && tv.body.on_hold === false, `TV data: on_hold false by default (got ${tv.body?.on_hold})`);
assert(tv.body.menu_items.length === snap.menu_items.length, 'TV data returns the extracted menu items');
assert(tv.body.menu_items.every((i) => i.price !== null), 'items have editable prices (not baked)');

// Flip the restaurant hold flag directly (billing wires this later) and verify the TV reflects it.
const rawDb = new Database(DB_PATH);
rawDb.prepare('UPDATE restaurants SET on_hold = 1 WHERE id = ?').run(restaurantId);
const tvHold = await api(`/api/screens/${snap.screen.slug}/data`);
assert(tvHold.body.on_hold === true, 'TV data: on_hold true once restaurant flag set');
rawDb.prepare('UPDATE restaurants SET on_hold = 0 WHERE id = ?').run(restaurantId);
const tvAfter = await api(`/api/screens/${snap.screen.slug}/data`);
assert(tvAfter.body.on_hold === false, 'TV data: on_hold reverts');
rawDb.close();

// 6. Owner-redesign path
console.log('\n[5] owner-redesign path');
const patch = await api(`/api/snapshots/${sid}`, {
  method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ needs_redesign: true }),
});
assert(patch.status === 200 && patch.body.needs_redesign === true, 'PATCH needs_redesign → flag set');
const after = await api(`/api/snapshots/${sid}`, { headers: H });
assert(after.body.needs_redesign === true, 'GET reflects needs_redesign');

// 7. Ownership guard + list
console.log('\n[6] ownership + list');
const reg2 = await api('/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: `snap-other-${Date.now()}@test.app`, password: 'x-password-1', name: 'Other' }),
});
const other = await api(`/api/snapshots/${sid}`, { headers: { Authorization: `Bearer ${reg2.body.token}` } });
assert(other.status === 404, 'other user cannot read my snapshot');
const list = await api('/api/snapshots', { headers: H });
assert(list.status === 200 && list.body.snapshots.some((s) => s.snapshot_id === sid), 'my snapshot appears in list');

// 8. Garbage image → graceful failed status
console.log('\n[7] graceful failure');
const garbage = new Blob([Buffer.from('this is not a menu photo at all, just words on a page')], { type: 'text/plain' });
const badForm = new FormData();
badForm.append('photo', garbage, 'note.txt');
const bad = await api('/api/snapshots', { method: 'POST', headers: H, body: badForm });
assert(bad.status === 400, `non-image upload rejected → 400 (got ${bad.status})`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);