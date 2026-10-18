#!/usr/bin/env node
/**
 * SAFE one-off migration — apply the PR #40 cinematic showcase boards to a
 * NON-fresh (already populated) Lumenu database.
 *
 * What it does (demo data ONLY — never touches owner rows):
 *   1. Rewrites the two legacy demo templates in place (their IDs are kept so
 *      nothing referencing them breaks):
 *        - Classic Split Layout   c0d5152e…  → "Ember & Oak — Morning Roast" (landscape, ember-coffee.jpg)
 *        - Full Screen Centered   04a3709b…  → "Oliva — Trattoria Notturna"  (portrait, oliva-trattoria.jpg)
 *   2. Re-points the three demo screens to the new boards + menus:
 *        - brew-main-board  → Ember & Oak (landscape)
 *        - brew-bar-display → Ember & Oak (landscape; was a portrait placeholder on the "test video" template)
 *        - trattoria-menu   → Oliva (portrait)
 *   3. Adds the NEW taquería showcase board (design's third board):
 *        - restaurant   "Sol y Sombra Taquería"   (demo user owner@menuvo.app)
 *        - template     "Sol y Sombra — Fire & Citrus" (landscape, sol-y-sombra.jpg)
 *        - screen       sol-y-sombra-main ("Sol y Sombra Main Board")
 *   4. Replaces menu_items + schedules for exactly those demo screens with the
 *      designer's content from server/db/seed.js (same categories/zones).
 *
 * All writes run inside ONE SQLite transaction (all-or-nothing).
 *
 * Guards:
 *   - Aborts unless the demo user, both templates and all three demo slugs exist.
 *   - Aborts unless the three demo screens still belong to the demo restaurants
 *     (Brew & Bean Café / Trattoria Bella Vita) and the board asset files are on disk.
 *   - Never writes to any row it does not target; `right-tv-luptitas` (owner) is
 *     read-only and its before/after config hash is printed as proof.
 *   - Idempotent: safe to re-run (UPDATEs converge; inserts are skipped when the
 *     taquería restaurant/template/screen already exist).
 *
 * Usage (run from server/):
 *   node db/apply-demo-showcase.cjs --dry-run          # print the plan, write nothing
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

// Ground truth: sha256(JSON.stringify(config)) as generated from the merged
// server/db/seed.js (PR #40). If the config file drifts, this fails loudly.
const EXPECTED_SHA = {
  taqueria: 'cbea07418d2faa4229eedbab62fa0a85a7e6b94a0640034201b4eb50f6db22ec',
  ember: '87e096092f4c3ba1256ae3cf604873d6368694d75358cc90050810f26ca3922e',
  oliva: '7b56617ce08f2bc1b8e539f31400a5ed2272ac24f3617519886eadd8361416c3',
};

for (const k of Object.keys(EXPECTED_SHA)) {
  const s = JSON.stringify(configs[k]);
  const h = crypto.createHash('sha256').update(s).digest('hex');
  if (h !== EXPECTED_SHA[k]) {
    throw new Error(
      `showcase-board-configs.json "${k}" does not match seed.js ground truth (${h}); regenerate it from server/db/seed.js`
    );
  }
}

const DEMO_USER_EMAIL = 'owner@menuvo.app';
const TEMPLATE_EMBER_ID = 'c0d5152e-61c8-4f9e-accc-b50ba3aba887'; // was "Classic Split Layout"
const TEMPLATE_OLIVA_ID = '04a3709b-1bcb-4a0e-b85a-6f0ee188699a'; // was "Full Screen Centered"
const DEMO_RESTAURANT_NAMES = ['Brew & Bean Café', 'Trattoria Bella Vita'];
const DEMO_SLUGS = ['brew-main-board', 'brew-bar-display', 'trattoria-menu'];
const TAQUERIA_SLUG = 'sol-y-sombra-main';
const OWNER_SLUG = 'right-tv-luptitas';
const ASSETS = [
  path.join(ROOT, 'uploads', 'demo', 'ember-coffee.jpg'),
  path.join(ROOT, 'uploads', 'demo', 'oliva-trattoria.jpg'),
  path.join(ROOT, 'uploads', 'demo', 'sol-y-sombra.jpg'),
];

// ── Designer's menu content (verbatim from server/db/seed.js on main) ──
const MENUS = {
  // Ember & Oak — used for brew-main-board AND brew-bar-display
  ember: [
    { n: 'Espresso', d: 'Double shot · house blend', p: 3.5, c: 'Coffee', z: 'drinks', o: 1 },
    { n: 'Oat Milk Cortado', d: 'Two shots, silky oat milk', p: 5.5, c: 'Coffee', z: 'drinks', o: 2 },
    { n: 'Maple Sea Salt Latte', d: 'Espresso, maple, flaky sea salt', p: 6.25, c: 'Coffee', z: 'drinks', o: 3 },
    { n: 'Cold Brew Tonic', d: 'Citrus tonic, slow-steeped coffee', p: 6.5, c: 'Coffee', z: 'drinks', o: 4 },
    { n: 'Ceremonial Matcha', d: 'Stone-milled, vanilla oat foam', p: 6.0, c: 'Tea', z: 'noncoffee', o: 1 },
    { n: 'Ginger Citrus Tea', d: 'Fresh ginger, lemon, honey', p: 4.75, c: 'Tea', z: 'noncoffee', o: 2, a: 'sold_out' },
    { n: 'Almond Croissant', d: 'Frangipane, toasted almond, butter', p: 5.5, c: 'Bakes', z: 'bakes', o: 1 },
    { n: 'Cardamom Bun', d: 'Brown sugar, cardamom, orange zest', p: 4.75, c: 'Bakes', z: 'bakes', o: 2 },
    { n: 'Miso Chocolate Cookie', d: 'Dark chocolate, sesame, sea salt', p: 3.75, c: 'Bakes', z: 'bakes', o: 3 },
    { n: 'Seasonal Fruit Galette', d: 'Market fruit, oat crumble, cream', p: 6.5, c: 'Bakes', z: 'bakes', o: 4 },
  ],
  // Oliva — used for trattoria-menu
  oliva: [
    { n: 'Burrata e Pomodori', d: 'Creamy burrata, heirloom tomato, basil oil', p: 16.0, c: 'Antipasti', z: 'antipasti', o: 1 },
    { n: 'Polpo Alla Griglia', d: 'Grilled octopus, lemon, smoked potato', p: 19.0, c: 'Antipasti', z: 'antipasti', o: 2 },
    { n: 'Focaccia al Rosmarino', d: 'Warm rosemary focaccia, whipped ricotta', p: 9.0, c: 'Antipasti', z: 'antipasti', o: 3 },
    { n: 'Tagliatelle al Ragù', d: 'Hand-cut pasta, beef and pork sugo', p: 23.0, c: 'Primi', z: 'primi', o: 1 },
    { n: 'Cacio e Pepe', d: 'Tonnarelli, pecorino romano, black pepper', p: 20.0, c: 'Primi', z: 'primi', o: 2 },
    { n: 'Risotto ai Funghi', d: 'Wild mushrooms, parmigiano, thyme', p: 22.0, c: 'Primi', z: 'primi', o: 3 },
    { n: 'Branzino Arrosto', d: 'Roasted sea bass, fennel, salsa verde', p: 31.0, c: 'Secondi', z: 'secondi', o: 1 },
    { n: 'Pollo al Mattone', d: 'Pressed chicken, lemon, rosemary jus', p: 28.0, c: 'Secondi', z: 'secondi', o: 2, a: 'sold_out' },
    { n: 'Tiramisù della Casa', d: 'Espresso mascarpone, cocoa, ladyfingers', p: 11.0, c: 'Dolci', z: 'dolci', o: 1 },
    { n: 'Panna Cotta', d: 'Vanilla bean, blood orange, pistachio', p: 10.0, c: 'Dolci', z: 'dolci', o: 2 },
  ],
  // Sol y Sombra taquería — new board
  taqueria: [
    { n: 'Camarón al Carbón', d: 'Grilled shrimp, guajillo butter, avocado', p: 15.5, c: 'Tacos', z: 'tacos', o: 1 },
    { n: 'Birria de Res', d: 'Slow-braised beef, queso, consommé', p: 16.0, c: 'Tacos', z: 'tacos', o: 2 },
    { n: 'Pollo Adobado', d: 'Achiote chicken, pineapple, salsa verde', p: 14.0, c: 'Tacos', z: 'tacos', o: 3 },
    { n: 'Hongos al Pastor', d: 'Roasted mushrooms, pineapple, pepita', p: 13.0, c: 'Tacos', z: 'tacos', o: 4 },
    { n: 'Costilla de Cerdo', d: 'Chile morita glaze, charred scallion', p: 24.0, c: 'Platos Fuertes', z: 'plates', o: 1 },
    { n: 'Pesca del Día', d: 'Citrus escabeche, crispy potato, herbs', p: 26.0, c: 'Platos Fuertes', z: 'plates', o: 2 },
    { n: 'Enchiladas de Mole', d: 'Oaxacan mole negro, crema, sesame', p: 19.0, c: 'Platos Fuertes', z: 'plates', o: 3, a: 'sold_out' },
    { n: 'Guacamole de la Casa', d: 'Avocado, serrano, lime, blue corn chips', p: 10.0, c: 'Para Compartir', z: 'sharing', o: 1 },
    { n: 'Elote Asado', d: 'Cotija, chile ancho, lime crema', p: 8.0, c: 'Para Compartir', z: 'sharing', o: 2 },
    { n: 'Queso Fundido', d: 'Oaxaca cheese, chorizo, warm tortillas', p: 12.0, c: 'Para Compartir', z: 'sharing', o: 3 },
  ],
};

const SCHEDULES = {
  taqueria: [
    { menu: 'All Day Taquería', start: '11:00', end: '22:00', days: [1, 2, 3, 4, 5, 6, 7] },
    { menu: 'Late Night Tacos', start: '22:00', end: '01:00', days: [5, 6] },
  ],
  ember: [
    { menu: 'Morning Menu', start: '07:00', end: '11:00', days: [1, 2, 3, 4, 5, 6, 7] },
    { menu: 'Afternoon Menu', start: '11:00', end: '16:00', days: [1, 2, 3, 4, 5, 6, 7] },
  ],
  oliva: [
    { menu: 'Pranzo', start: '12:00', end: '15:00', days: [1, 2, 3, 4, 5, 6] },
    { menu: 'Cena', start: '17:00', end: '22:30', days: [1, 2, 3, 4, 5, 6, 7] },
  ],
};

if (!fs.existsSync(DB_PATH)) throw new Error(`Database not found: ${DB_PATH}`);
for (const asset of ASSETS) {
  const st = fs.statSync(asset, { throwIfNoEntry: false });
  if (!st || st.size < 100_000) throw new Error(`Board asset missing/small: ${asset}`);
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
  db.prepare('SELECT id FROM restaurants WHERE name IN (?, ?)').all(...DEMO_RESTAURANT_NAMES).map((r) => r.id)
);
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

console.log(`\nLumenu showcase demo-board apply (${DRY ? 'DRY-RUN — no writes' : 'LIVE'})`);
console.log(`  DB: ${DB_PATH}\n`);

// ── All writes live inside ONE transaction ──
const applyAll = db.transaction(() => {
  console.log('1) Rewriting demo templates (IDs kept):');
  const updateTpl = db.prepare(
    'UPDATE templates SET name = ?, video_url = ?, video_duration_ms = ?, orientation = ?, config_json = ? WHERE id = ?'
  );
  if (DRY) {
    plan('Classic Split Layout → “Ember & Oak — Morning Roast” (landscape, ember-coffee.jpg)');
    plan('Full Screen Centered → “Oliva — Trattoria Notturna” (portrait, oliva-trattoria.jpg)');
  } else {
    updateTpl.run('Ember & Oak — Morning Roast', null, null, 'landscape', JSON.stringify(configs.ember), TEMPLATE_EMBER_ID);
    updateTpl.run('Oliva — Trattoria Notturna', null, null, 'portrait', JSON.stringify(configs.oliva), TEMPLATE_OLIVA_ID);
    log(`updated ${TEMPLATE_EMBER_ID.slice(0, 8)} (ember) + ${TEMPLATE_OLIVA_ID.slice(0, 8)} (oliva)`);
  }

  console.log('2) New showcase board — Sol y Sombra Taquería:');
  const findRestaurant = () => db.prepare('SELECT id FROM restaurants WHERE name = ?').get('Sol y Sombra Taquería');
  const findTemplate = () => db.prepare('SELECT id FROM templates WHERE name = ?').get('Sol y Sombra — Fire & Citrus');
  const findScreen = () => db.prepare('SELECT id FROM screens WHERE unique_slug = ?').get(TAQUERIA_SLUG);

  let rest = findRestaurant();
  if (!rest) {
    if (DRY) { plan('restaurant “Sol y Sombra Taquería” would be created'); rest = { id: '(new-restaurant)' }; }
    else { rest = { id: uuidv4() }; db.prepare('INSERT INTO restaurants (id, user_id, name) VALUES (?, ?, ?)').run(rest.id, demoUser.id, 'Sol y Sombra Taquería'); }
  }
  plan(`restaurant “Sol y Sombra Taquería”: ${rest.id.slice(0, 12)}`);

  let tpl = findTemplate();
  if (!tpl) {
    if (DRY) { plan('template “Sol y Sombra — Fire & Citrus” would be created'); tpl = { id: '(new-template)' }; }
    else { tpl = { id: uuidv4() }; db.prepare('INSERT INTO templates (id, name, video_url, video_duration_ms, orientation, config_json) VALUES (?, ?, ?, ?, ?, ?)').run(tpl.id, 'Sol y Sombra — Fire & Citrus', null, null, 'landscape', JSON.stringify(configs.taqueria)); }
  }
  plan(`template “Sol y Sombra — Fire & Citrus”: ${tpl.id.slice(0, 12)} (landscape, sol-y-sombra.jpg)`);

  let screen = findScreen();
  if (!screen) {
    if (DRY) { plan(`screen ${TAQUERIA_SLUG} would be created (landscape)`); screen = { id: '(new-screen)' }; }
    else { screen = { id: uuidv4() }; db.prepare('INSERT INTO screens (id, restaurant_id, name, unique_slug, orientation, template_id) VALUES (?, ?, ?, ?, ?, ?)').run(screen.id, rest.id, 'Sol y Sombra Main Board', TAQUERIA_SLUG, 'landscape', tpl.id); }
  }
  plan(`screen ${TAQUERIA_SLUG}: ${screen.id.slice(0, 12)}`);

  console.log('3) Re-pointing demo screens:');
  const updateScreen = db.prepare('UPDATE screens SET name = ?, orientation = ?, template_id = ? WHERE unique_slug = ?');
  if (DRY) {
    plan('brew-main-board  → Ember & Oak Main Menu (landscape)');
    plan('brew-bar-display → Ember & Oak Bar Display (landscape)');
    plan('trattoria-menu   → Oliva Portrait Menu (portrait)');
  } else {
    updateScreen.run('Ember & Oak Main Menu', 'landscape', TEMPLATE_EMBER_ID, 'brew-main-board');
    updateScreen.run('Ember & Oak Bar Display', 'landscape', TEMPLATE_EMBER_ID, 'brew-bar-display');
    updateScreen.run('Oliva Portrait Menu', 'portrait', TEMPLATE_OLIVA_ID, 'trattoria-menu');
    log('3 demo screens updated');
  }

  console.log('4) Replacing demo menu content (demo screens only):');
  const replaceMenuAndSchedules = (label, screenId, menuKey, schedulesKey) => {
    const items = MENUS[menuKey];
    const scheds = SCHEDULES[schedulesKey];
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
  replaceMenuAndSchedules('sol-y-sombra-main', screen ? screen.id : null, 'taqueria', 'taqueria');

  const itemTotal = MENUS.ember.length * 2 + MENUS.oliva.length + MENUS.taqueria.length;
  const schedTotal = SCHEDULES.ember.length * 2 + SCHEDULES.oliva.length + SCHEDULES.taqueria.length;
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
for (const slug of [...DEMO_SLUGS, TAQUERIA_SLUG, OWNER_SLUG]) {
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
  try { const cfg = JSON.parse(row.cfg); bg = cfg?.layout?.background?.src || null; } catch {}
  console.log(
    `  ${slug.padEnd(20)} items=${row.items} scheds=${row.scheds} orient=${row.orient} tpl=${row.tpl_name}${bg ? ` bg=${bg}` : ''}`
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