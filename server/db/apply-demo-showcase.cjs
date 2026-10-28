#!/usr/bin/env node
/**
 * SAFE migration v2 — apply the market-validated showcase boards (brand
 * logos, fit-to-TV layouts, corrected prices, animation spec) to a
 * NON-fresh Lumenu database.
 *
 * What it changes (demo data ONLY — never touches owner rows):
 *   1. Rewrites the demo templates' layouts in place:
 *        - c0d5152e…  "Ember & Oak — Morning Roast" (landscape, ember-coffee.jpg)
 *        - 04a3709b…  "Oliva — Trattoria Notturna"  (portrait, oliva-trattoria.jpg)
 *        - "Sol y Sombra — Fire & Citrus" (landscape; found by name, created if missing)
 *   2. Converges the demo screens to the intended showcase mapping (PR #41):
 *        - brew-main-board  → Ember & Oak Main Menu   (Ember template + Ember restaurant)
 *        - brew-bar-display → Ember & Oak Bar Display (Ember template + Ember restaurant)
 *        - trattoria-menu   → Oliva Portrait Menu     (Oliva template + Oliva restaurant)
 *        - sol-y-sombra-main → Sol y Sombra Main Board (created if missing)
 *   3. Replaces menu_items + schedules for exactly those demo screens with the
 *      corrected, market-validated content (single source: showcase-configs.cjs).
 *   4. Sets logo_url on the Sol y Sombra and Ember & Oak restaurants when
 *      empty; Oliva's existing logo_url is left untouched.
 *
 * All writes run inside ONE SQLite transaction (all-or-nothing).
 *
 * Guards:
 *   - Aborts unless the demo user exists and all three templates + demo slugs exist.
 *   - Aborts unless the demo screens still belong to the three demo restaurants.
 *   - Never writes to any row it does not target; the owner screen
 *     `right-tv-luptitas` is read-only and its before/after config hash is
 *     printed as proof.
 *   - Idempotent: safe to re-run (UPDATEs converge; inserts are skipped).
 *
 * Usage (run from server/):
 *   node db/apply-demo-showcase.cjs --dry-run          # plan only
 *   node db/apply-demo-showcase.cjs                    # apply for real (default DB)
 *   node db/apply-demo-showcase.cjs --db=/tmp/copy.db  # apply against a different file
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const ROOT = path.join(__dirname, '..');
const DEFAULT_DB = path.join(ROOT, 'data', 'menuvo.db');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const dbArg = args.find((a) => a.startsWith('--db='));
const DB_PATH = dbArg ? dbArg.slice(5) : process.env.LUMENU_DB || DEFAULT_DB;

const CONFIG_FILE = path.join(__dirname, 'showcase-board-configs.json');
const configs = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

// Menus / schedules / logos: single source of truth.
const { menus, schedules, logos } = require('./showcase-configs.cjs');

// sha256(JSON.stringify(config-string)) pins — regenerated from
// showcase-configs.cjs via db/regen-showcase-configs.cjs. If the config file
// drifts from the module, this fails loudly.
const EXPECTED_SHA = {
  taqueria: 'e5fb19a786c37b4d96ad34b21ae7d7573e42eeb29382427bf513017898362ec7',
  ember: 'ba1fea11c333c3e0cf4972ea4bd7428a71cf408e1ae2181998b1d44af4d24482',
  oliva: '0ef2f5c2db3135155121cff380b560264e899b4e453719a821f4da27667878b8',
};

for (const k of Object.keys(EXPECTED_SHA)) {
  const s = JSON.stringify(configs[k]);
  const h = crypto.createHash('sha256').update(s).digest('hex');
  if (h !== EXPECTED_SHA[k]) {
    throw new Error(
      `showcase-board-configs.json "${k}" does not match showcase-configs.cjs ground truth (${h}); run node db/regen-showcase-configs.cjs`
    );
  }
}

const DEMO_USER_EMAIL = 'owner@menuvo.app';
// Canonical config format: `{ layout: board }`, SINGLE-stringified — the same
// shape seed.js and the dashboard's templates.js normalization produce, and
// the shape extractLayout resolves first ("template config_json.layout").
// The pinned file stores each board as a JSON-stringIFIED STRING (legacy
// double form), so parse once → object, then wrap + stringify once.
const canonicalConfig = (k) => JSON.stringify({ layout: JSON.parse(configs[k]) });
const TEMPLATE_EMBER_ID = 'c0d5152e-61c8-4f9e-accc-b50ba3aba887'; // was "Classic Split Layout"
const TEMPLATE_OLIVA_ID = '04a3709b-1bcb-4a0e-b85a-6f0ee188699a'; // was "Full Screen Centered"
const DEMO_RESTAURANT_NAMES = ['Sol y Sombra Taquería', 'Ember & Oak Coffee Bar', 'Oliva Trattoria'];
const DEMO_SLUGS = ['brew-main-board', 'brew-bar-display', 'trattoria-menu'];
const SOL_SLUG = 'sol-y-sombra-main';
const OWNER_SLUG = 'right-tv-luptitas';
const ASSETS = [
  path.join(ROOT, 'uploads', 'demo', 'ember-coffee.jpg'),
  path.join(ROOT, 'uploads', 'demo', 'oliva-trattoria.jpg'),
  path.join(ROOT, 'uploads', 'demo', 'sol-y-sombra.jpg'),
  path.join(ROOT, 'uploads', 'demo', 'ember-oak-logo.png'),
  path.join(ROOT, 'uploads', 'demo', 'sol-y-sombra-logo.png'),
  path.join(ROOT, 'uploads', 'demo', 'oliva-logo.png'),
];

if (!fs.existsSync(DB_PATH)) throw new Error(`Database not found: ${DB_PATH}`);
for (const asset of ASSETS) {
  const st = fs.statSync(asset, { throwIfNoEntry: false });
  if (!st || st.size < 10_000) throw new Error(`Board asset missing/small: ${asset}`);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
const log = (msg) => console.log(`  ${msg}`);
const plan = (msg) => console.log(`  → ${msg}`);

// ── Guards (read-only) ──
const demoUser = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_USER_EMAIL);
if (!demoUser) throw new Error(`Abort: demo user ${DEMO_USER_EMAIL} not found`);
for (const tplId of [TEMPLATE_EMBER_ID, TEMPLATE_OLIVA_ID]) {
  if (!db.prepare('SELECT id FROM templates WHERE id = ?').get(tplId)) {
    throw new Error(`Abort: expected demo template ${tplId} not found`);
  }
}
const demoRestaurantIds = new Set(
  db.prepare('SELECT id FROM restaurants WHERE name IN (?, ?, ?)').all(...DEMO_RESTAURANT_NAMES).map((r) => r.id)
);
if (demoRestaurantIds.size !== 3) {
  throw new Error(`Abort: expected the three demo restaurants (${DEMO_RESTAURANT_NAMES.join(', ')})`);
}
for (const slug of DEMO_SLUGS) {
  const s = db.prepare('SELECT id, restaurant_id FROM screens WHERE unique_slug = ?').get(slug);
  if (!s) throw new Error(`Abort: demo screen ${slug} not found`);
  if (!demoRestaurantIds.has(s.restaurant_id)) {
    throw new Error(`Abort: demo screen ${slug} no longer belongs to a demo restaurant — refusing to touch`);
  }
}
if (!db.prepare('SELECT id FROM screens WHERE unique_slug = ?').get(OWNER_SLUG)) {
  throw new Error(`Abort: expected owner screen ${OWNER_SLUG} not found (refusing to run blind)`);
}

// ── Owner-screen proof (before) ──
const ownerBefore = db
  .prepare(
    `SELECT t.name AS tpl, t.config_json AS cfg FROM screens s JOIN templates t ON t.id = s.template_id WHERE s.unique_slug = ?`
  )
  .get(OWNER_SLUG);
const ownerBeforeHash = crypto.createHash('sha256').update(JSON.stringify(ownerBefore)).digest('hex').slice(0, 16);

console.log(`\nLumenu showcase demo-board apply v2 (${DRY ? 'DRY-RUN — no writes' : 'LIVE'})`);
console.log(`  DB: ${DB_PATH}\n`);

// ── All writes live inside ONE transaction ──
const applyAll = db.transaction(() => {
  console.log('1) Rewriting demo template layouts (IDs/names kept):');
  const updateTpl = db.prepare(
    'UPDATE templates SET name = ?, video_url = ?, video_duration_ms = ?, orientation = ?, config_json = ? WHERE id = ?'
  );
  if (DRY) {
    plan('c0d5152e → “Ember & Oak — Morning Roast” v2 (logo + oat panels + corrected menu)');
    plan('04a3709b → “Oliva — Trattoria Notturna” v2 (logo + masthead + corrected menu)');
    plan('“Sol y Sombra — Fire & Citrus” template config update (logo + panels + corrected menu)');
  } else {
    updateTpl.run('Ember & Oak — Morning Roast', null, null, 'landscape', canonicalConfig('ember'), TEMPLATE_EMBER_ID);
    updateTpl.run('Oliva — Trattoria Notturna', null, null, 'portrait', canonicalConfig('oliva'), TEMPLATE_OLIVA_ID);
    const solTpl = db.prepare("SELECT id FROM templates WHERE name = 'Sol y Sombra — Fire & Citrus'").get();
    if (solTpl) {
      db.prepare('UPDATE templates SET orientation = ?, config_json = ? WHERE id = ?')
        .run('landscape', canonicalConfig('taqueria'), solTpl.id);
    } else {
      db.prepare('INSERT INTO templates (id, name, video_url, video_duration_ms, orientation, config_json) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), 'Sol y Sombra — Fire & Citrus', null, null, 'landscape', canonicalConfig('taqueria'));
    }
    log('3 template configs updated');
  }

  console.log('2) Converging demo screens to the showcase mapping (implicit want: brew→Ember, sol-y-sombra-main):');
  const findRestaurant = (name) => db.prepare('SELECT id FROM restaurants WHERE name = ?').get(name);
  const solRest = findRestaurant('Sol y Sombra Taquería');
  const emberRest = findRestaurant('Ember & Oak Coffee Bar');
  const olivaRest = findRestaurant('Oliva Trattoria');
  const updateScreen = db.prepare('UPDATE screens SET restaurant_id = ?, name = ?, orientation = ?, template_id = ? WHERE unique_slug = ?');
  if (DRY) {
    plan('brew-main-board  → Ember & Oak Main Menu (Ember template + restaurant)');
    plan('brew-bar-display → Ember & Oak Bar Display (Ember template + restaurant)');
    plan('trattoria-menu   → Oliva Portrait Menu (Oliva template + restaurant)');
    plan(`sol-y-sombra-main  ensure-exists (Sol template + restaurant, landscape)`);
  } else {
    updateScreen.run(emberRest.id, 'Ember & Oak Main Menu', 'landscape', TEMPLATE_EMBER_ID, 'brew-main-board');
    updateScreen.run(emberRest.id, 'Ember & Oak Bar Display', 'landscape', TEMPLATE_EMBER_ID, 'brew-bar-display');
    updateScreen.run(olivaRest.id, 'Oliva Portrait Menu', 'portrait', TEMPLATE_OLIVA_ID, 'trattoria-menu');
    const solTpl = db.prepare("SELECT id FROM templates WHERE name = 'Sol y Sombra — Fire & Citrus'").get();
    const exists = db.prepare('SELECT id FROM screens WHERE unique_slug = ?').get(SOL_SLUG);
    if (!exists) {
      db.prepare('INSERT INTO screens (id, restaurant_id, name, unique_slug, orientation, template_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), solRest.id, 'Sol y Sombra Main Board', SOL_SLUG, 'landscape', solTpl.id);
      log(`created screen ${SOL_SLUG}`);
    } else {
      db.prepare('UPDATE screens SET restaurant_id = ?, name = ?, orientation = ?, template_id = ? WHERE unique_slug = ?')
        .run(solRest.id, 'Sol y Sombra Main Board', 'landscape', solTpl.id, SOL_SLUG);
    }
    log('4 demo screens converged');
  }

  console.log('3) Replacing demo menu content (demo screens only):');
  const replaceMenuAndSchedules = (label, screenId, menuKey, schedKey) => {
    const items = menus[menuKey];
    const scheds = schedules[schedKey];
    if (DRY || !screenId) {
      plan(`${label}: replace with ${items.length} items + ${scheds.length} schedules`);
      return;
    }
    db.prepare('DELETE FROM menu_items WHERE screen_id = ?').run(screenId);
    db.prepare('DELETE FROM schedules WHERE screen_id = ?').run(screenId);
    const insItem = db.prepare(
      'INSERT INTO menu_items (id, screen_id, name, description, price, category, availability, text_zone_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const it of items) insItem.run(uuidv4(), screenId, it.n, it.d, it.p, it.c, it.a || 'available', it.z, it.o);
    const insSched = db.prepare(
      'INSERT INTO schedules (id, screen_id, menu_name, start_time, end_time, days_of_week) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const s of scheds) insSched.run(uuidv4(), screenId, s.menu, s.start, s.end, JSON.stringify(s.days));
  };

  const slugId = (slug) => (DRY ? null : db.prepare('SELECT id FROM screens WHERE unique_slug = ?').get(slug)?.id);
  replaceMenuAndSchedules('brew-main-board', slugId('brew-main-board'), 'ember', 'ember');
  replaceMenuAndSchedules('brew-bar-display', slugId('brew-bar-display'), 'ember', 'ember');
  replaceMenuAndSchedules('trattoria-menu', slugId('trattoria-menu'), 'oliva', 'oliva');
  replaceMenuAndSchedules('sol-y-sombra-main', slugId('sol-y-sombra-main'), 'taqueria', 'taqueria');

  console.log('4) Setting logo_url on demo restaurants (only when empty):');
  const setLogo = (name, url) => {
    const r = findRestaurant(name);
    const cur = db.prepare('SELECT logo_url FROM restaurants WHERE id = ?').get(r.id);
    if (cur && cur.logo_url) {
      plan(`${name}: keeps existing logo_url (${cur.logo_url})`);
    } else if (DRY) {
      plan(`${name}: logo_url would be set to ${url}`);
    } else {
      db.prepare('UPDATE restaurants SET logo_url = ? WHERE id = ?').run(url, r.id);
      log(`${name} ← ${url}`);
    }
  };
  setLogo('Sol y Sombra Taquería', logos.sol);
  setLogo('Ember & Oak Coffee Bar', logos.ember);
  setLogo('Oliva Trattoria', logos.oliva);

  const itemTotal = menus.ember.length * 2 + menus.oliva.length + menus.taqueria.length;
  const schedTotal = schedules.ember.length * 2 + schedules.oliva.length + schedules.taqueria.length;
  log(`totals: ${itemTotal} menu items + ${schedTotal} schedules across 4 demo screens`);
});

applyAll();

if (DRY) {
  console.log('\n── DRY-RUN complete — nothing was written. ──\n');
  db.close();
  process.exit(0);
}

console.log('\n── Apply committed (single transaction) ──\n');

// ── Verification ──
console.log('Verification (post-apply):');
for (const slug of [...DEMO_SLUGS, SOL_SLUG, OWNER_SLUG]) {
  const row = db
    .prepare(
      `SELECT s.name AS screen, s.orientation AS orient, t.name AS tpl_name, t.config_json AS cfg,
              (SELECT COUNT(*) FROM menu_items mi WHERE mi.screen_id = s.id) AS items,
              (SELECT COUNT(*) FROM schedules sc WHERE sc.screen_id = s.id) AS scheds
         FROM screens s JOIN templates t ON t.id = s.template_id WHERE s.unique_slug = ?`
    )
    .get(slug);
  if (!row) { console.log(`  ${slug}: MISSING`); continue; }
  let bg = null;
  let logo = null;
  try {
    const cfg = JSON.parse(row.cfg);
    bg = cfg?.layout?.background?.src || null;
    const logoEl = (cfg?.layout?.elements || []).find((e) => e.id === 'logo');
    logo = logoEl?.src || null;
  } catch {}
  console.log(
    `  ${slug.padEnd(20)} items=${row.items} scheds=${row.scheds} orient=${row.orient} tpl=${row.tpl_name}${bg ? ` bg=${bg}` : ''}${logo ? ` logo=${logo}` : ''}`
  );
}
const ownerAfter = db
  .prepare(
    `SELECT t.name AS tpl, t.config_json AS cfg FROM screens s JOIN templates t ON t.id = s.template_id WHERE s.unique_slug = ?`
  )
  .get(OWNER_SLUG);
const ownerAfterHash = crypto.createHash('sha256').update(JSON.stringify(ownerAfter)).digest('hex').slice(0, 16);
console.log(
  `  owner ${OWNER_SLUG}: before=${ownerBeforeHash} after=${ownerAfterHash} ${ownerBeforeHash === ownerAfterHash ? '✅ UNCHANGED' : '❌ CHANGED!'}`
);
const census = {
  users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
  restaurants: db.prepare('SELECT COUNT(*) c FROM restaurants').get().c,
  templates: db.prepare('SELECT COUNT(*) c FROM templates').get().c,
  screens: db.prepare('SELECT COUNT(*) c FROM screens').get().c,
  menu_items: db.prepare('SELECT COUNT(*) c FROM menu_items').get().c,
};
if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='snapshots'").get()) {
  census.snapshots = db.prepare('SELECT COUNT(*) c FROM snapshots').get().c;
}
console.log('  census:', JSON.stringify(census));

db.close();
console.log('\nDone. Restart the server so screens pick up the new templates.');