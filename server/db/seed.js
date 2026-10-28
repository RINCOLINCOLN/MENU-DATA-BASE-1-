import { getDb } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// Single source of truth for the three demo boards (layouts, menus, logos):
// server/db/showcase-configs.cjs — also consumed by apply-demo-showcase.cjs.
const { configs, menus, schedules, logos } = require('../db/showcase-configs.cjs');

const db = getDb();

console.log('🌱 Seeding Lumenu showcase demo data...\n');

// Idempotent guard: NEVER wipe an existing database (live owner data).
// Seed only when the users table is empty (fresh clone / first boot).
const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;
if (userCount > 0) {
  console.log(`  ⏭️  Skipping seed — ${userCount} user(s) already present. Run on a fresh DB only.`);
  process.exit(0);
}

const CREAM = '#FFF6E8';
const MUTED = '#E6D7C2';

// ── 1. Create demo users ──
const ownerId = uuidv4();
const passwordHash = bcrypt.hashSync('demo1234', 10);
db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
  .run(ownerId, 'owner@menuvo.app', passwordHash, 'Sarah Chen');

const owner2Id = uuidv4();
db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
  .run(owner2Id, 'marco@trattoria.demo', passwordHash, 'Marco Rossi');

console.log('  ✅ Created demo users (login: owner@menuvo.app / demo1234)');

// ── 2. Create showcase restaurants (with brand logo_url) ──
const taqueriaId = uuidv4();
db.prepare('INSERT INTO restaurants (id, user_id, name, logo_url) VALUES (?, ?, ?, ?)')
  .run(taqueriaId, ownerId, 'Sol y Sombra Taquería', logos.sol);

const coffeeId = uuidv4();
db.prepare('INSERT INTO restaurants (id, user_id, name, logo_url) VALUES (?, ?, ?, ?)')
  .run(coffeeId, ownerId, 'Ember & Oak Coffee Bar', logos.ember);

const trattoriaId = uuidv4();
db.prepare('INSERT INTO restaurants (id, user_id, name, logo_url) VALUES (?, ?, ?, ?)')
  .run(trattoriaId, owner2Id, 'Oliva Trattoria', logos.oliva);

console.log('  ✅ Created 3 showcase restaurants (logo_url set)');

// ── 3. Create the three showcase templates from showcase-configs.cjs ──
const templateTaqueriaId = uuidv4();
db.prepare(`INSERT INTO templates (id, name, video_url, video_duration_ms, orientation, config_json)
  VALUES (?, ?, ?, ?, ?, ?)`).run(
  templateTaqueriaId,
  'Sol y Sombra — Fire & Citrus',
  null,
  null,
  'landscape',
  JSON.stringify({ layout: configs.taqueria }),
);

const templateCoffeeId = uuidv4();
db.prepare(`INSERT INTO templates (id, name, video_url, video_duration_ms, orientation, config_json)
  VALUES (?, ?, ?, ?, ?, ?)`).run(
  templateCoffeeId,
  'Ember & Oak — Morning Roast',
  null,
  null,
  'landscape',
  JSON.stringify({ layout: configs.ember }),
);

const templateTrattoriaId = uuidv4();
db.prepare(`INSERT INTO templates (id, name, video_url, video_duration_ms, orientation, config_json)
  VALUES (?, ?, ?, ?, ?, ?)`).run(
  templateTrattoriaId,
  'Oliva — Trattoria Notturna',
  null,
  null,
  'portrait',
  JSON.stringify({ layout: configs.oliva }),
);

console.log('  ✅ Created 3 image-backed showcase templates (logos + fit-to-TV layouts)');

// ── 4. Create screens ──
const screen1Id = uuidv4();
const screen1Slug = 'brew-main-board';
db.prepare('INSERT INTO screens (id, restaurant_id, name, unique_slug, orientation, template_id) VALUES (?, ?, ?, ?, ?, ?)')
  .run(screen1Id, taqueriaId, 'Sol y Sombra Main Board', screen1Slug, 'landscape', templateTaqueriaId);

const screen2Id = uuidv4();
const screen2Slug = 'brew-bar-display';
db.prepare('INSERT INTO screens (id, restaurant_id, name, unique_slug, orientation, template_id) VALUES (?, ?, ?, ?, ?, ?)')
  .run(screen2Id, coffeeId, 'Ember & Oak Bar Display', screen2Slug, 'landscape', templateCoffeeId);

const screen3Id = uuidv4();
const screen3Slug = 'trattoria-menu';
db.prepare('INSERT INTO screens (id, restaurant_id, name, unique_slug, orientation, template_id) VALUES (?, ?, ?, ?, ?, ?)')
  .run(screen3Id, trattoriaId, 'Oliva Portrait Menu', screen3Slug, 'portrait', templateTrattoriaId);

// The taquería board's canonical screen slug for TV demos (PR #41 mapping).
const screen4Id = uuidv4();
const screen4Slug = 'sol-y-sombra-main';
db.prepare('INSERT INTO screens (id, restaurant_id, name, unique_slug, orientation, template_id) VALUES (?, ?, ?, ?, ?, ?)')
  .run(screen4Id, taqueriaId, 'Sol y Sombra Main Board', screen4Slug, 'landscape', templateTaqueriaId);

console.log('  ✅ Created 4 showcase screens with unique slugs');

// ── 5. Create appetizing menu content (prices validated, see benchmark doc) ──
const menuData = {
  [screen1Id]: menus.taqueria,
  [screen2Id]: menus.ember,
  [screen3Id]: menus.oliva,
  [screen4Id]: menus.taqueria,
};

const insertItem = db.prepare(`
  INSERT INTO menu_items (id, screen_id, name, description, price, category, availability, text_zone_id, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let itemCount = 0;
for (const [screenId, items] of Object.entries(menuData)) {
  for (const item of items) {
    insertItem.run(uuidv4(), screenId, item.n, item.d, item.p, item.c, item.a || 'available', item.z, item.o);
    itemCount++;
  }
}

console.log(`  ✅ Created ${itemCount} menu items across all showcase screens`);

// ── 6. Create schedules ──
const insertSchedule = db.prepare(`
  INSERT INTO schedules (id, screen_id, menu_name, start_time, end_time, days_of_week)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const schedDefs = [
  [screen1Id, schedules.taqueria],
  [screen2Id, schedules.ember],
  [screen3Id, schedules.oliva],
  [screen4Id, schedules.taqueria],
];
for (const [screenId, scheds] of schedDefs) {
  for (const s of scheds) {
    insertSchedule.run(uuidv4(), screenId, s.menu, s.start, s.end, JSON.stringify(s.days));
  }
}

console.log('  ✅ Created 8 schedules');

console.log('\n📋 Showcase Seed Summary:');
console.log('  • 2 users created');
console.log('  • 3 restaurants created (Sol y Sombra, Ember & Oak, Oliva) — logo_url set');
console.log('  • 3 image-backed templates created (brand logos + fit-to-TV layouts + animation spec)');
console.log('  • 4 screens created with unique slugs');
console.log(`  • ${itemCount} menu items created (market-validated prices, some marked sold_out)`);
console.log('  • 8 schedules created');
console.log('\n🔑 Demo login:');
console.log('  Email:    owner@menuvo.app');
console.log('  Password: demo1234');
console.log('\n📺 Test screen slugs:');
for (const slug of [screen1Slug, screen2Slug, screen3Slug, screen4Slug]) {
  console.log(`  /api/screens/${slug}/data`);
}
console.log('\n✨ Showcase seed complete!');