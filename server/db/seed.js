import { getDb } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const db = getDb();

console.log('🌱 Seeding Lumenu demo data...\n');

// Clean existing data
db.exec('DELETE FROM schedules');
db.exec('DELETE FROM menu_items');
db.exec('DELETE FROM screens');
db.exec('DELETE FROM templates');
db.exec('DELETE FROM restaurants');
db.exec('DELETE FROM users');

// ── 1. Create users ──
const ownerId = uuidv4();
const passwordHash = bcrypt.hashSync('demo1234', 10);
db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
  .run(ownerId, 'owner@lumenu.app', passwordHash, 'Sarah Chen');

const owner2Id = uuidv4();
db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
  .run(owner2Id, 'marco@trattoria.demo', passwordHash, 'Marco Rossi');

console.log('  ✅ Created demo users (login: owner@lumenu.app / demo1234)');

// ── 2. Create restaurants ──
const cafeId = uuidv4();
db.prepare('INSERT INTO restaurants (id, user_id, name) VALUES (?, ?, ?)')
  .run(cafeId, ownerId, 'Brew & Bean Café');

const trattoriaId = uuidv4();
db.prepare('INSERT INTO restaurants (id, user_id, name, logo_url) VALUES (?, ?, ?, ?)')
  .run(trattoriaId, owner2Id, 'Trattoria Bella Vita', '/uploads/trattoria-logo.png');

console.log('  ✅ Created 2 demo restaurants');

// ── 3. Create templates ──
    const template1Id = uuidv4();
    const template1Config = JSON.stringify([
      {
        id: 'zone-menu', label: 'Main Menu Items', type: 'menu_items',
        x: 4, y: 18, width: 44, height: 74,
        alignment: 'left', font_size: 42, min_font_size: 14, max_font_size: 42,
        color: '#ffffff', font_weight: 'normal',
        font_family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        item_ids: []
      },
      {
        id: 'zone-specials', label: 'Daily Specials', type: 'specials',
        x: 52, y: 18, width: 44, height: 74,
        alignment: 'left', font_size: 38, min_font_size: 14, max_font_size: 38,
        color: '#fc8181', font_weight: 'bold',
        font_family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        item_ids: []
      },
      {
        id: 'zone-header', label: 'Header / Restaurant Name', type: 'header',
        x: 4, y: 2, width: 92, height: 12,
        alignment: 'center', font_size: 48, min_font_size: 24, max_font_size: 64,
        color: '#f6ad55', font_weight: 'bold',
        font_family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        item_ids: []
      }
    ]);

db.prepare(`INSERT INTO templates (id, name, video_url, video_duration_ms, orientation, config_json)
  VALUES (?, ?, ?, ?, ?, ?)`)
  .run(template1Id, 'Classic Split Layout', '/uploads/default-background.mp4', 30000, 'landscape', template1Config);

const template2Id = uuidv4();
    const template2Config = JSON.stringify([
      {
        id: 'zone-items', label: 'All Menu Items', type: 'menu_items',
        x: 5, y: 15, width: 90, height: 78,
        alignment: 'center', font_size: 38, min_font_size: 16, max_font_size: 52,
        color: '#ffffff', font_weight: 'normal',
        font_family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        item_ids: []
      },
      {
        id: 'zone-tagline', label: 'Tagline', type: 'header',
        x: 5, y: 2, width: 90, height: 10,
        alignment: 'center', font_size: 28, min_font_size: 18, max_font_size: 36,
        color: '#f6ad55', font_weight: 'bold',
        font_family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        item_ids: []
      }
    ]);

db.prepare(`INSERT INTO templates (id, name, video_url, video_duration_ms, orientation, config_json)
  VALUES (?, ?, ?, ?, ?, ?)`)
  .run(template2Id, 'Full Screen Centered', '/uploads/italian-bg.mp4', 20000, 'portrait', template2Config);

console.log('  ✅ Created 2 demo templates with text zone configurations');

// ── 4. Create screens ──
const screen1Id = uuidv4();
const screen1Slug = 'brew-main-board';
db.prepare('INSERT INTO screens (id, restaurant_id, name, unique_slug, orientation, template_id) VALUES (?, ?, ?, ?, ?, ?)')
  .run(screen1Id, cafeId, 'Main Menu Board', screen1Slug, 'landscape', template1Id);

const screen2Id = uuidv4();
const screen2Slug = 'brew-bar-display';
db.prepare('INSERT INTO screens (id, restaurant_id, name, unique_slug, orientation, template_id) VALUES (?, ?, ?, ?, ?, ?)')
  .run(screen2Id, cafeId, 'Bar Specials Display', screen2Slug, 'portrait', template2Id);

const screen3Id = uuidv4();
const screen3Slug = 'trattoria-menu';
db.prepare('INSERT INTO screens (id, restaurant_id, name, unique_slug, orientation, template_id) VALUES (?, ?, ?, ?, ?, ?)')
  .run(screen3Id, trattoriaId, 'Trattoria Main Menu', screen3Slug, 'landscape', template1Id);

console.log('  ✅ Created 3 demo screens with unique slugs');

// ── 5. Create menu items ──
const menuData = {
  [screen1Id]: [
    { n: 'Espresso', d: 'Single origin Ethiopian', p: 3.50, c: 'Coffee', z: 'zone-menu', o: 1 },
    { n: 'Latte', d: 'Espresso with steamed oat milk', p: 4.75, c: 'Coffee', z: 'zone-menu', o: 2 },
    { n: 'Cold Brew', d: '24-hour steeped, smooth finish', p: 4.50, c: 'Coffee', z: 'zone-menu', o: 3 },
    { n: 'Matcha Latte', d: 'Ceremonial grade matcha', p: 5.25, c: 'Tea', z: 'zone-menu', o: 4 },
    { n: 'Chai Latte', d: 'House-spiced chai concentrate', p: 4.75, c: 'Tea', z: 'zone-menu', o: 5 },
    { n: 'Blueberry Muffin', d: 'Fresh-baked, streusel top', p: 3.50, c: 'Pastries', z: 'zone-menu', o: 6 },
    { n: 'Croissant', d: 'Butter laminated, flaky', p: 3.00, c: 'Pastries', z: 'zone-menu', o: 7 },
    { n: 'Avocado Toast', d: 'Sourdough, avocado, chili flakes', p: 8.50, c: 'Specials', z: 'zone-specials', o: 1, a: 'sold_out' },
    { n: 'Berry Smoothie Bowl', d: 'Açaí, granola, fresh berries', p: 9.00, c: 'Specials', z: 'zone-specials', o: 2 },
  ],
  [screen2Id]: [
    { n: 'House Old Fashioned', d: 'Bourbon, bitters, demerara', p: 14.00, c: 'Cocktails', z: 'zone-items', o: 1 },
    { n: 'Espresso Martini', d: 'Vodka, Kahlúa, fresh espresso', p: 15.00, c: 'Cocktails', z: 'zone-items', o: 2 },
    { n: 'Negroni', d: 'Gin, Campari, sweet vermouth', p: 13.00, c: 'Cocktails', z: 'zone-items', o: 3 },
    { n: 'Draft IPA', d: 'Local hazy IPA', p: 7.50, c: 'Beer', z: 'zone-items', o: 4 },
    { n: 'Pinot Noir', d: 'Willamette Valley, Oregon', p: 12.00, c: 'Wine', z: 'zone-items', o: 5 },
  ],
  [screen3Id]: [
    { n: 'Bruschetta Classica', d: 'Tomato, basil, extra virgin olive oil', p: 9.00, c: 'Antipasti', z: 'zone-menu', o: 1 },
    { n: 'Carpaccio di Manzo', d: 'Beef carpaccio, arugula, parmesan', p: 14.00, c: 'Antipasti', z: 'zone-menu', o: 2 },
    { n: 'Spaghetti Carbonara', d: 'Guanciale, egg, pecorino', p: 17.00, c: 'Primi', z: 'zone-menu', o: 3 },
    { n: 'Pappardelle al Ragu', d: 'Wild boar ragu, parmesan', p: 19.00, c: 'Primi', z: 'zone-menu', o: 4 },
    { n: 'Margherita Pizza', d: 'San Marzano, mozzarella, basil', p: 14.00, c: 'Pizza', z: 'zone-menu', o: 5 },
    { n: 'Diavola Pizza', d: 'Spicy salami, chili oil', p: 16.00, c: 'Pizza', z: 'zone-menu', o: 6, a: 'sold_out' },
    { n: 'Tiramisù', d: 'Classic Italian, mascarpone', p: 9.00, c: 'Dolci', z: 'zone-menu', o: 7 },
    { n: 'Panna Cotta', d: 'Vanilla bean, berry coulis', p: 8.50, c: 'Dolci', z: 'zone-menu', o: 8 },
  ]
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

console.log(`  ✅ Created ${itemCount} menu items across all screens`);

// ── 6. Create schedules ──
const insertSchedule = db.prepare(`
  INSERT INTO schedules (id, screen_id, menu_name, start_time, end_time, days_of_week)
  VALUES (?, ?, ?, ?, ?, ?)
`);

insertSchedule.run(uuidv4(), screen1Id, 'Breakfast', '07:00', '11:00', JSON.stringify([1, 2, 3, 4, 5]));
insertSchedule.run(uuidv4(), screen1Id, 'All Day Menu', '11:00', '21:00', JSON.stringify([1, 2, 3, 4, 5, 6, 7]));
insertSchedule.run(uuidv4(), screen1Id, 'Weekend Brunch', '08:00', '14:00', JSON.stringify([6, 7]));
insertSchedule.run(uuidv4(), screen2Id, 'Happy Hour', '16:00', '19:00', JSON.stringify([1, 2, 3, 4, 5]));
insertSchedule.run(uuidv4(), screen3Id, 'Lunch', '12:00', '15:00', JSON.stringify([1, 2, 3, 4, 5, 6]));
insertSchedule.run(uuidv4(), screen3Id, 'Dinner', '18:00', '22:30', JSON.stringify([1, 2, 3, 4, 5, 6, 7]));

console.log('  ✅ Created 6 schedules');

// ── Summary ──
console.log('\n📋 Seed Summary:');
console.log('  • 2 users created');
console.log('  • 2 restaurants created');
console.log('  • 2 templates created with text zone configs');
console.log('  • 3 screens created with unique slugs');
console.log(`  • ${itemCount} menu items created (some marked sold_out)`);
console.log('  • 6 schedules created');
console.log('\n🔑 Demo login:');
console.log('  Email:    owner@lumenu.app');
console.log('  Password: demo1234');
console.log('\n📺 Test screen slugs:');
console.log(`  /api/screens/${screen1Slug}/data`);
console.log(`  /api/screens/${screen2Slug}/data`);
console.log(`  /api/screens/${screen3Slug}/data`);
console.log('\n✨ Seed complete!');
