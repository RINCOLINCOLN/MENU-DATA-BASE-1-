/**
 * E2E: Snapshot-to-digital backend + payment-hold groundwork + OCR QUALITY.
 *
 * Run against a THROWAWAY server + THROWAWAY database (never the live one):
 *   cd server
 *   export E2E_DB_PATH=/tmp/lumenu-e2e/menuvo.db   # seeded from the live DB on first use
 *   PORT=3011 DB_PATH="$E2E_DB_PATH" node server.js &
 *   BASE_URL=http://127.0.0.1:3011 node e2e/snapshot-flow.mjs
 *
 * E2E_DB_PATH is MANDATORY (see e2e/lib/e2e-db.mjs): this suite writes rows and
 * toggles on_hold in SQLite, so pointing it at the live DB pollutes production.
 * It refuses to run if E2E_DB_PATH is unset, resolves to server/data/menuvo.db,
 * or if BASE_URL is the live :3000 server.
 *
 * Covers the contract Dashboard Dev's UI is built against:
 *   POST /api/snapshots           → { snapshot_id, status: "processing" }
 *   GET  /api/snapshots/:id       → { status, original_url, mockup_url?, message?, menu_items?, template?, screen? }
 *   PATCH /api/snapshots/:id      → owner-redesign flag
 *   Hold flag: /api/screens/:slug/data reflects restaurant/screen on_hold.
 *
 * OCR QUALITY GATE (owner's #1 complaint):
 *   [8] THE owner's real café menu photo (regression fixture) — the pipeline
 *       must return credible menu words/prices OR status 'failed' with a clear
 *       retake message. NEVER status 'ready' with junk words/prices.
 *   [9] a deliberately noisy/blurred photo → status 'failed' + retake message.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { prepareE2eDatabase, assertNotLiveServer, requireE2eDbPath } from './lib/e2e-db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const FIXTURE = path.join(__dirname, 'fixtures', 'menu-photo.png');
const OWNER_FIXTURE = path.join(__dirname, 'fixtures', 'owner-menu-photo.jpg');
const NOISY_FIXTURE = path.join(__dirname, 'fixtures', 'noisy-blur.jpg');
// Mandatory + guarded: both checks exit non-zero rather than touch the live
// database. E2E_DB_PATH first, so a missing/unsafe path is reported as such.
requireE2eDbPath();
assertNotLiveServer(BASE_URL);
const { dbPath: DB_PATH } = await prepareE2eDatabase();

const RETAKE_MESSAGE = "We couldn't read that menu clearly. Try a straighter, closer photo in good light.";

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

// ---------------------------------------------------------------------------
// [0] helpers
// ---------------------------------------------------------------------------
const alphaCount = (s) => (String(s).match(/[A-Za-z]/g) || []).length;
// Independent plausibility re-check (not importing lib code — proves the
// invariant from the API surface): names need letters, prices must be sane.
function plausibleItems(menuItems) {
  if (!Array.isArray(menuItems) || menuItems.length === 0) return { ok: false, why: 'no items' };
  const badNames = menuItems.filter((i) => alphaCount(i.name) < 3 || alphaCount(i.name) / String(i.name).length < 0.5);
  const badPrices = menuItems.filter((i) => {
    const p = Number(i.price);
    return !Number.isFinite(p) || p < 0.5 || p > 500;
  });
  if (badNames.length > 0) return { ok: false, why: `bad names: ${badNames.map((i) => i.name).join(', ')}` };
  if (badPrices.length > 0) return { ok: false, why: `bad prices: ${badPrices.map((i) => i.price).join(', ')}` };
  return { ok: true };
}

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

// 3. POST snapshot with the (synthetic) menu photo
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

const q = plausibleItems(snap.menu_items);
assert(q.ok, `every extracted item name/price is credible (${q.why})`);

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

const rawDb = new Database(DB_PATH);
// This write must be visible through the server: if it is not, the server is
// bound to a different database than E2E_DB_PATH (the classic way to think you
// are on a throwaway DB while actually writing to the live one).
const restRow = rawDb.prepare('SELECT COUNT(*) c FROM restaurants WHERE id = ?').get(restaurantId);
assert(restRow.c === 1, `throwaway DB is the one the server writes to (restaurant found in ${DB_PATH})`);
rawDb.prepare('UPDATE restaurants SET on_hold = 1 WHERE id = ?').run(restaurantId);
const tvHold = await api(`/api/screens/${snap.screen.slug}/data`);
assert(tvHold.body.on_hold === true,
  `TV data: on_hold true once restaurant flag set (got ${tvHold.body?.on_hold}) — if false, the server is not running against E2E_DB_PATH`);
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

// ---------------------------------------------------------------------------
// [8] THE regression fixture: the owner's REAL café menu photo.
// Accepted outcomes ONLY: credible items+prices (ready) OR failed with the
// clear retake message. status 'ready' with garbage = suite failure.
// ---------------------------------------------------------------------------
console.log('\n[8] owner real-menu photo (quality gate)');
assert(fs.existsSync(OWNER_FIXTURE), `owner fixture exists (${OWNER_FIXTURE})`);
const oForm = new FormData();
oForm.append('photo', new Blob([fs.readFileSync(OWNER_FIXTURE)], { type: 'image/jpeg' }), 'owner-menu-photo.jpg');
oForm.append('restaurant_id', restaurantId);
const oUp = await api('/api/snapshots', { method: 'POST', headers: H, body: oForm });
assert(oUp.status === 201, `POST owner photo → 201 (got ${oUp.status})`);
const oSid = oUp.body.snapshot_id;

let oSnap = null;
for (let i = 0; i < 90; i += 1) {
  const r = await api(`/api/snapshots/${oSid}`, { headers: H });
  if (r.status === 200 && r.body.status !== 'processing') { oSnap = r.body; break; }
  await new Promise((res) => setTimeout(res, 2000));
}
assert(oSnap !== null, 'owner pipeline finished in 180s');
if (oSnap) {
  assert(oSnap.status === 'ready' || oSnap.status === 'failed', `owner photo → ready|failed (got ${oSnap.status}))`);
  if (oSnap.status === 'ready') {
    console.log('   (owner photo read OK — extracting items)');
    const oq = plausibleItems(oSnap.menu_items);
    assert(oq.ok, `owner 'ready' items are credible (${oq.why})`);
    assert(oSnap.menu_items.length >= 3, `owner 'ready' has ≥3 items (${oSnap.menu_items?.length})`);
    console.log('   items:', oSnap.menu_items?.slice(0, 12).map((i) => `${i.name}=$${i.price}`).join(' | '));
  } else {
    assert(typeof oSnap.message === 'string' && oSnap.message.length > 0, 'failed status carries a user-facing message');
    console.log(`   message: ${oSnap.message}`);
  }
  assert(!(oSnap.status === 'ready' && !plausibleItems(oSnap.menu_items).ok),
    'INVARIANT: never "ready" with garbage words/prices');
}

// ---------------------------------------------------------------------------
// [9] quality gate: deliberately noisy/blurred photo must fail with retake msg
// ---------------------------------------------------------------------------
console.log('\n[9] noisy/blurred photo → retake message');
assert(fs.existsSync(NOISY_FIXTURE), `noisy fixture exists (${NOISY_FIXTURE})`);
const nForm = new FormData();
nForm.append('photo', new Blob([fs.readFileSync(NOISY_FIXTURE)], { type: 'image/jpeg' }), 'noisy-blur.jpg');
nForm.append('restaurant_id', restaurantId);
const nUp = await api('/api/snapshots', { method: 'POST', headers: H, body: nForm });
assert(nUp.status === 201, `POST noisy photo → 201 (got ${nUp.status})`);
const nSid = nUp.body.snapshot_id;

let nSnap = null;
for (let i = 0; i < 90; i += 1) {
  const r = await api(`/api/snapshots/${nSid}`, { headers: H });
  if (r.status === 200 && r.body.status !== 'processing') { nSnap = r.body; break; }
  await new Promise((res) => setTimeout(res, 2000));
}
assert(nSnap !== null, 'noisy pipeline finished in 180s');
if (nSnap) {
  assert(nSnap.status === 'failed', `noisy photo → failed (got ${nSnap.status})`);
  assert(typeof nSnap.message === 'string' && nSnap.message.includes('straighter'),
    `retake message present (got ${nSnap.message})`);
  console.log(`   message: ${nSnap.message}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);