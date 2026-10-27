#!/usr/bin/env node
/**
 * Demo-showcase board mapping CORRECTION (lead-approved final layout):
 *   brew-main-board  → Sol y Sombra Taquería (landscape)
 *   brew-bar-display → Ember & Oak Coffee Bar (landscape)
 *   trattoria-menu   → Oliva Trattoria (portrait)
 * Matches the designer's fresh-install seed exactly. Demo rows only.
 * Usage: node db/fix-demo-board-mapping.cjs [--dry-run]
 */
'use strict';
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const DRY = process.argv.includes('--dry-run');
const dbPath = process.env.LUMENU_DB || require('path').join(__dirname, '..', 'data', 'menuvo.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const DEMO_USER_EMAIL = 'owner@menuvo.app';
const SOL_REST = 'c5bd3ab1-0c5'; // Sol y Sombra Taquería (already exists)
const OLIVA_REST = '470a6d10-4bff-4c79-88d8-02d09f26e04e'; // Trattoria Bella Vita → rename
const BREW_REST = '7200be4c-2556-4e19-8f53-a630a3bec078'; // Brew & Bean Café → delete when empty
const SOL_TPL = null; // resolved at runtime by name
const EMBER_TPL = 'c0d5152e-61c8-4f9e-accc-b50ba3aba887';
const OLIVA_TPL = '04a3709b-1bcb-4a0e-b85a-6f0ee188699a';
const EXTRA_SCREEN = 'sol-y-sombra-main';

// guards
const user = db.prepare('SELECT id FROM users WHERE email=?').get(DEMO_USER_EMAIL);
if (!user) throw new Error('demo user missing');
for (const s of ['brew-main-board', 'brew-bar-display', 'trattoria-menu', 'right-tv-luptitas']) {
  const row = db.prepare('SELECT id FROM screens WHERE unique_slug=?').get(s);
  if (!row) throw new Error(`screen ${s} missing`);
}
const solTplRow = db.prepare("SELECT id FROM templates WHERE name='Sol y Sombra — Fire & Citrus'").get();
if (!solTplRow) throw new Error('Sol y Sombra template missing');
const SOL_TPL_ID = solTplRow.id;
const solRestRow = db.prepare("SELECT id FROM restaurants WHERE name='Sol y Sombra Taquería'").get();
const SOL_REST_ID = solRestRow ? solRestRow.id : (() => { if (DRY) return '(new)'; const id = uuidv4(); db.prepare('INSERT INTO restaurants (id,user_id,name) VALUES (?,?,?)').run(id, user.id, 'Sol y Sombra Taquería'); return id; })();

const MENU_TAQUERIA = [
  ['Camarón al Carbón', 'Grilled shrimp, guajillo butter, avocado', 15.5, 'Tacos', 'tacos', 1],
  ['Birria de Res', 'Slow-braised beef, queso, consommé', 16.0, 'Tacos', 'tacos', 2],
  ['Pollo Adobado', 'Achiote chicken, pineapple, salsa verde', 14.0, 'Tacos', 'tacos', 3],
  ['Hongos al Pastor', 'Roasted mushrooms, pineapple, pepita', 13.0, 'Tacos', 'tacos', 4],
  ['Costilla de Cerdo', 'Chile morita glaze, charred scallion', 24.0, 'Platos Fuertes', 'plates', 1],
  ['Pesca del Día', 'Citrus escabeche, crispy potato, herbs', 26.0, 'Platos Fuertes', 'plates', 2],
  ['Enchiladas de Mole', 'Oaxacan mole negro, crema, sesame', 19.0, 'Platos Fuertes', 'plates', 3, 'sold_out'],
  ['Guacamole de la Casa', 'Avocado, serrano, lime, blue corn chips', 10.0, 'Para Compartir', 'sharing', 1],
  ['Elote Asado', 'Cotija, chile ancho, lime crema', 8.0, 'Para Compartir', 'sharing', 2],
  ['Queso Fundido', 'Oaxaca cheese, chorizo, warm tortillas', 12.0, 'Para Compartir', 'sharing', 3],
];
const SCHED_TAQUERIA = [
  ['All Day Taquería', '11:00', '22:00', [1, 2, 3, 4, 5, 6, 7]],
  ['Late Night Tacos', '22:00', '01:00', [5, 6]],
];

const tx = db.transaction(() => {
  // 1. move brew-main-board → Sol y Sombra
  const brewMain = db.prepare("SELECT id FROM screens WHERE unique_slug='brew-main-board'").get();
  db.prepare("UPDATE screens SET restaurant_id=?, name='Sol y Sombra Main Board', template_id=? WHERE unique_slug='brew-main-board'").run(SOL_REST_ID, SOL_TPL_ID);
  db.prepare('DELETE FROM menu_items WHERE screen_id=?').run(brewMain.id);
  db.prepare('DELETE FROM schedules WHERE screen_id=?').run(brewMain.id);
  const insItem = db.prepare('INSERT INTO menu_items (id,screen_id,name,description,price,category,availability,text_zone_id,sort_order) VALUES (?,?,?,?,?,?,?,?,?)');
  for (const [n, d, p, c, z, o, a] of MENU_TAQUERIA) insItem.run(uuidv4(), brewMain.id, n, d, p, c, a || 'available', z, o);
  const insSched = db.prepare('INSERT INTO schedules (id,screen_id,menu_name,start_time,end_time,days_of_week) VALUES (?,?,?,?,?,?)');
  for (const [m, st, en, days] of SCHED_TAQUERIA) insSched.run(uuidv4(), brewMain.id, m, st, en, JSON.stringify(days));

  // 2. move brew-bar-display → Ember & Oak Coffee Bar (new restaurant)
  let emberRest = db.prepare("SELECT id FROM restaurants WHERE name='Ember & Oak Coffee Bar'").get();
  if (!emberRest) {
    emberRest = { id: uuidv4() };
    db.prepare('INSERT INTO restaurants (id,user_id,name) VALUES (?,?,?)').run(emberRest.id, user.id, 'Ember & Oak Coffee Bar');
  }
  db.prepare("UPDATE screens SET restaurant_id=?, name='Ember & Oak Bar Display' WHERE unique_slug='brew-bar-display'").run(emberRest.id);

  // 3. rename trattoria restaurant
  db.prepare("UPDATE restaurants SET name='Oliva Trattoria' WHERE id=?").run(OLIVA_REST);
  db.prepare("UPDATE screens SET name='Oliva Portrait Menu' WHERE unique_slug='trattoria-menu'").run();

  // 4. remove the extra sol-y-sombra-main screen (created during the first apply) + its rows
  const extra = db.prepare("SELECT id FROM screens WHERE unique_slug=?").get(EXTRA_SCREEN);
  if (extra) {
    db.prepare('DELETE FROM menu_items WHERE screen_id=?').run(extra.id);
    db.prepare('DELETE FROM schedules WHERE screen_id=?').run(extra.id);
    db.prepare('DELETE FROM screens WHERE id=?').run(extra.id);
  }

  // 5. delete Brew & Bean Café only if it now has zero screens
  const brewScreens = db.prepare('SELECT COUNT(*) c FROM screens WHERE restaurant_id=?').get(BREW_REST).c;
  if (brewScreens === 0) db.prepare('DELETE FROM restaurants WHERE id=?').run(BREW_REST);
});
if (DRY) {
  console.log('DRY-RUN plan: move brew-main-board→Sol y Sombra; brew-bar-display→Ember & Oak Coffee Bar; rename Trattoria→Oliva Trattoria; delete extra sol-y-sombra-main; delete Brew & Bean if empty.');
  db.close(); process.exit(0);
}
tx();
// report
for (const s of ['brew-main-board', 'brew-bar-display', 'trattoria-menu']) {
  const r = db.prepare(`SELECT s.unique_slug slug, s.name, r.name rest, t.name tpl,
      (SELECT COUNT(*) FROM menu_items mi WHERE mi.screen_id=s.id) items
    FROM screens s JOIN restaurants r ON r.id=s.restaurant_id JOIN templates t ON t.id=s.template_id WHERE s.unique_slug=?`).get(s);
  console.log(`${r.slug.padEnd(20)} | ${r.rest} | ${r.name} | ${r.tpl} | items=${r.items}`);
}
const extra = db.prepare('SELECT id FROM screens WHERE unique_slug=?').get(EXTRA_SCREEN);
const brew = db.prepare("SELECT id FROM restaurants WHERE name='Brew & Bean Café'").get();
console.log('extra screen sol-y-sombra-main:', extra ? 'STILL PRESENT' : 'removed');
console.log('Brew & Bean Café restaurant:', brew ? 'STILL PRESENT' : 'removed');
db.close();
console.log('Done.', DRY ? '(dry)' : '(live)');