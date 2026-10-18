import { getDb } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const db = getDb();

console.log('🌱 Seeding Lumenu showcase demo data...\n');

// Idempotent guard: NEVER wipe an existing database (live owner data).
// Seed only when the users table is empty (fresh clone / first boot).
const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;
if (userCount > 0) {
  console.log(`  ⏭️  Skipping seed — ${userCount} user(s) already present. Run on a fresh DB only.`);
  process.exit(0);
}

const FONT_SANS = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const FONT_DISPLAY = 'Georgia, "Times New Roman", serif';
const CREAM = '#FFF6E8';
const MUTED = '#E6D7C2';

function textElement(id, text, x, y, width, height, options = {}) {
  return {
    id,
    type: 'text',
    text,
    x,
    y,
    width,
    height,
    coords: 'percent',
    z_index: options.z_index ?? 2,
    font_family: options.font_family || FONT_SANS,
    font_size: options.font_size || 32,
    font_size_min: options.font_size_min || 18,
    font_size_max: options.font_size_max || options.font_size || 64,
    font_weight: options.font_weight || '600',
    color: options.color || CREAM,
    letter_spacing: options.letter_spacing || '0.02em',
    line_height: options.line_height || '1.08',
    text_transform: options.text_transform || 'none',
    align: options.align || 'left',
    padding: options.padding,
    background_color: options.background_color,
    border_radius: options.border_radius,
  };
}

function menuElement(id, x, y, width, height, category, options = {}) {
  return {
    id,
    type: 'menu_items',
    x,
    y,
    width,
    height,
    coords: 'percent',
    z_index: options.z_index ?? 2,
    category,
    align: options.align || 'left',
    font_family: options.font_family || FONT_SANS,
    font_size: options.font_size || 30,
    font_size_min: options.font_size_min || 18,
    font_size_max: options.font_size_max || options.font_size || 38,
    font_weight: options.font_weight || '500',
    color: options.color || CREAM,
    line_height: options.line_height || '1.18',
    price_position: options.price_position || 'right_column',
    price_font_weight: options.price_font_weight || '700',
    show_description: false,
    sold_out_badge: true,
  };
}

function layout(background, width, height, elements) {
  return {
    version: 1,
    coords: 'percent',
    width,
    height,
    background: {
      type: 'image',
      src: background,
      fit: 'cover',
      overlay_color: 'rgba(6, 8, 10, 0.48)',
    },
    elements,
  };
}

// ── 1. Create demo users ──
const ownerId = uuidv4();
const passwordHash = bcrypt.hashSync('demo1234', 10);
db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
  .run(ownerId, 'owner@menuvo.app', passwordHash, 'Sarah Chen');

const owner2Id = uuidv4();
db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
  .run(owner2Id, 'marco@trattoria.demo', passwordHash, 'Marco Rossi');

console.log('  ✅ Created demo users (login: owner@menuvo.app / demo1234)');

// ── 2. Create showcase restaurants ──
const taqueriaId = uuidv4();
db.prepare('INSERT INTO restaurants (id, user_id, name) VALUES (?, ?, ?)')
  .run(taqueriaId, ownerId, 'Sol y Sombra Taquería');

const coffeeId = uuidv4();
db.prepare('INSERT INTO restaurants (id, user_id, name) VALUES (?, ?, ?)')
  .run(coffeeId, ownerId, 'Ember & Oak Coffee Bar');

const trattoriaId = uuidv4();
db.prepare('INSERT INTO restaurants (id, user_id, name) VALUES (?, ?, ?)')
  .run(trattoriaId, owner2Id, 'Oliva Trattoria');

console.log('  ✅ Created 3 showcase restaurants');

// ── 3. Create three cinematic templates ──
const templateTaqueriaId = uuidv4();
const taqueriaConfig = JSON.stringify({
  layout: layout('/uploads/demo/sol-y-sombra.jpg', 1920, 1080, [
    textElement('brand', 'SOL Y SOMBRA', 7, 6, 86, 8, {
      font_family: FONT_DISPLAY, font_size: 54, font_size_min: 30, font_size_max: 64,
      font_weight: '700', letter_spacing: '0.12em', text_transform: 'uppercase',
    }),
    textElement('tagline', 'Cocina de fuego · tacos de autor', 7, 15, 55, 5, {
      font_size: 22, font_size_min: 16, font_size_max: 26, color: '#F4B860',
      font_weight: '600', letter_spacing: '0.08em', text_transform: 'uppercase',
    }),
    textElement('tacos-label', 'TACOS', 7, 26, 42, 5, {
      font_size: 23, font_size_min: 16, font_size_max: 30, color: '#F4B860',
      font_weight: '700', letter_spacing: '0.2em', text_transform: 'uppercase',
    }),
    menuElement('tacos', 7, 32, 43, 30, 'Tacos', { font_size: 29, font_size_min: 20, color: CREAM }),
    textElement('plates-label', 'PLATOS FUERTES', 7, 66, 43, 5, {
      font_size: 23, font_size_min: 16, font_size_max: 30, color: '#F4B860',
      font_weight: '700', letter_spacing: '0.15em', text_transform: 'uppercase',
    }),
    menuElement('plates', 7, 72, 43, 21, 'Platos Fuertes', { font_size: 29, font_size_min: 20, color: CREAM }),
    textElement('specials-label', 'PARA COMPARTIR', 57, 26, 36, 5, {
      font_size: 23, font_size_min: 16, font_size_max: 30, color: '#F4B860',
      font_weight: '700', letter_spacing: '0.14em', text_transform: 'uppercase',
    }),
    menuElement('sharing', 57, 32, 36, 27, 'Para Compartir', { font_size: 29, font_size_min: 20, color: CREAM }),
    textElement('chef-note', 'FUEGO · FRESCO · HECHO AQUÍ', 57, 77, 36, 7, {
      font_family: FONT_DISPLAY, font_size: 27, font_size_min: 18, font_size_max: 34,
      font_weight: '700', color: '#F7D28C', letter_spacing: '0.08em', text_transform: 'uppercase',
    }),
    textElement('hours', 'MAÍZ AZUL  ·  AGAVE  ·  LIMA', 57, 89, 36, 4, {
      font_size: 15, font_size_min: 12, font_size_max: 18, font_weight: '600',
      color: MUTED, letter_spacing: '0.1em', text_transform: 'uppercase',
    }),
  ]),
});
db.prepare(`INSERT INTO templates (id, name, video_url, video_duration_ms, orientation, config_json)
  VALUES (?, ?, ?, ?, ?, ?)`).run(
  templateTaqueriaId,
  'Sol y Sombra — Fire & Citrus',
  null,
  null,
  'landscape',
  taqueriaConfig,
);

const templateCoffeeId = uuidv4();
const coffeeConfig = JSON.stringify({
  layout: layout('/uploads/demo/ember-coffee.jpg', 1920, 1080, [
    textElement('brand', 'EMBER & OAK', 7, 7, 86, 8, {
      font_family: FONT_DISPLAY, font_size: 54, font_size_min: 30, font_size_max: 64,
      font_weight: '700', letter_spacing: '0.1em', text_transform: 'uppercase', color: '#FFF9EE',
    }),
    textElement('tagline', 'Coffee, slowly made', 7, 16, 48, 5, {
      font_family: FONT_DISPLAY, font_size: 25, font_size_min: 18, font_size_max: 30,
      font_weight: '500', color: '#D8A56F', letter_spacing: '0.05em',
    }),
    textElement('drinks-label', 'FROM THE BAR', 7, 28, 42, 5, {
      font_size: 21, font_size_min: 15, font_size_max: 28, color: '#C98D58',
      font_weight: '700', letter_spacing: '0.18em', text_transform: 'uppercase',
    }),
    menuElement('drinks', 7, 34, 44, 26, 'Coffee', { font_size: 28, font_size_min: 19, color: '#FFF9EE' }),
    textElement('noncoffee-label', 'ALTERNATIVES', 7, 63, 44, 4, {
      font_size: 19, font_size_min: 14, font_size_max: 25, color: '#C98D58',
      font_weight: '700', letter_spacing: '0.16em', text_transform: 'uppercase',
    }),
    menuElement('noncoffee', 7, 68, 44, 8, 'Tea', { font_size: 25, font_size_min: 17, color: '#FFF9EE' }),
    textElement('bakes-label', 'BAKED THIS MORNING', 7, 79, 44, 4, {
      font_size: 19, font_size_min: 14, font_size_max: 25, color: '#C98D58',
      font_weight: '700', letter_spacing: '0.14em', text_transform: 'uppercase',
    }),
    menuElement('bakes', 7, 84, 44, 11, 'Bakes', { font_size: 25, font_size_min: 17, color: '#FFF9EE' }),
    textElement('roast-note', 'ROASTED DAILY', 62, 31, 31, 10, {
      font_family: FONT_DISPLAY, font_size: 38, font_size_min: 24, font_size_max: 48,
      font_weight: '700', color: '#FFF9EE', letter_spacing: '0.05em', align: 'right',
    }),
    textElement('note', 'Single origin · house pastries · good mornings', 62, 45, 31, 12, {
      font_size: 18, font_size_min: 14, font_size_max: 22, font_weight: '500', color: '#493B2E',
      letter_spacing: '0.04em', align: 'right', line_height: '1.3',
      background_color: 'rgba(255, 249, 238, 0.78)', padding: '12px 16px', border_radius: '4px',
    }),
    textElement('hours', 'OPEN 7A — 4P  ·  SEASONAL MENU', 62, 88, 31, 4, {
      font_size: 14, font_size_min: 11, font_size_max: 18, font_weight: '700', color: '#493B2E',
      letter_spacing: '0.12em', text_transform: 'uppercase', align: 'right',
    }),
  ]),
});
db.prepare(`INSERT INTO templates (id, name, video_url, video_duration_ms, orientation, config_json)
  VALUES (?, ?, ?, ?, ?, ?)`).run(
  templateCoffeeId,
  'Ember & Oak — Morning Roast',
  null,
  null,
  'landscape',
  coffeeConfig,
);

const templateTrattoriaId = uuidv4();
const trattoriaConfig = JSON.stringify({
  layout: layout('/uploads/demo/oliva-trattoria.jpg', 1080, 1920, [
    textElement('brand', 'OLIVA', 8, 5, 84, 7, {
      font_family: FONT_DISPLAY, font_size: 58, font_size_min: 34, font_size_max: 70,
      font_weight: '700', letter_spacing: '0.2em', text_transform: 'uppercase', align: 'center',
      color: '#FFF4DF',
    }),
    textElement('tagline', 'Trattoria italiana · dal 1987', 8, 13, 84, 4, {
      font_size: 18, font_size_min: 13, font_size_max: 23, font_weight: '600',
      color: '#D6A55B', letter_spacing: '0.12em', text_transform: 'uppercase', align: 'center',
    }),
    textElement('antipasti-label', 'ANTIPASTI', 8, 22, 84, 4, {
      font_size: 22, font_size_min: 15, font_size_max: 28, color: '#D6A55B',
      font_weight: '700', letter_spacing: '0.2em', text_transform: 'uppercase',
    }),
    menuElement('antipasti', 8, 27, 84, 20, 'Antipasti', { font_size: 27, font_size_min: 18, color: '#FFF4DF' }),
    textElement('primi-label', 'PRIMI', 8, 47, 84, 4, {
      font_size: 22, font_size_min: 15, font_size_max: 28, color: '#D6A55B',
      font_weight: '700', letter_spacing: '0.2em', text_transform: 'uppercase',
    }),
    menuElement('primi', 8, 52, 84, 19, 'Primi', { font_size: 27, font_size_min: 18, color: '#FFF4DF' }),
    textElement('secondi-label', 'SECONDI', 8, 74, 84, 4, {
      font_size: 22, font_size_min: 15, font_size_max: 28, color: '#D6A55B',
      font_weight: '700', letter_spacing: '0.2em', text_transform: 'uppercase',
    }),
    menuElement('secondi', 8, 79, 84, 9, 'Secondi', { font_size: 27, font_size_min: 18, color: '#FFF4DF' }),
    textElement('dolci-label', 'DOLCI', 8, 90, 84, 3, {
      font_size: 17, font_size_min: 12, font_size_max: 22, color: '#D6A55B',
      font_weight: '700', letter_spacing: '0.2em', text_transform: 'uppercase',
    }),
    menuElement('dolci', 8, 94, 84, 5, 'Dolci', { font_size: 23, font_size_min: 15, color: '#FFF4DF' }),
  ]),
});
db.prepare(`INSERT INTO templates (id, name, video_url, video_duration_ms, orientation, config_json)
  VALUES (?, ?, ?, ?, ?, ?)`).run(
  templateTrattoriaId,
  'Oliva — Trattoria Notturna',
  null,
  null,
  'portrait',
  trattoriaConfig,
);

console.log('  ✅ Created 3 image-backed showcase templates');

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

console.log('  ✅ Created 3 showcase screens with unique slugs');

// ── 5. Create appetizing menu content ──
const menuData = {
  [screen1Id]: [
    { n: 'Camarón al Carbón', d: 'Grilled shrimp, guajillo butter, avocado', p: 15.50, c: 'Tacos', o: 1 },
    { n: 'Birria de Res', d: 'Slow-braised beef, queso, consommé', p: 16.00, c: 'Tacos', o: 2 },
    { n: 'Pollo Adobado', d: 'Achiote chicken, pineapple, salsa verde', p: 14.00, c: 'Tacos', o: 3 },
    { n: 'Hongos al Pastor', d: 'Roasted mushrooms, pineapple, pepita', p: 13.00, c: 'Tacos', o: 4 },
    { n: 'Costilla de Cerdo', d: 'Chile morita glaze, charred scallion', p: 24.00, c: 'Platos Fuertes', o: 1 },
    { n: 'Pesca del Día', d: 'Citrus escabeche, crispy potato, herbs', p: 26.00, c: 'Platos Fuertes', o: 2 },
    { n: 'Enchiladas de Mole', d: 'Oaxacan mole negro, crema, sesame', p: 19.00, c: 'Platos Fuertes', o: 3, a: 'sold_out' },
    { n: 'Guacamole de la Casa', d: 'Avocado, serrano, lime, blue corn chips', p: 10.00, c: 'Para Compartir', o: 1 },
    { n: 'Elote Asado', d: 'Cotija, chile ancho, lime crema', p: 8.00, c: 'Para Compartir', o: 2 },
    { n: 'Queso Fundido', d: 'Oaxaca cheese, chorizo, warm tortillas', p: 12.00, c: 'Para Compartir', o: 3 },
  ],
  [screen2Id]: [
    { n: 'Espresso', d: 'Double shot · house blend', p: 3.50, c: 'Coffee', o: 1 },
    { n: 'Oat Milk Cortado', d: 'Two shots, silky oat milk', p: 5.50, c: 'Coffee', o: 2 },
    { n: 'Maple Sea Salt Latte', d: 'Espresso, maple, flaky sea salt', p: 6.25, c: 'Coffee', o: 3 },
    { n: 'Cold Brew Tonic', d: 'Citrus tonic, slow-steeped coffee', p: 6.50, c: 'Coffee', o: 4 },
    { n: 'Ceremonial Matcha', d: 'Stone-milled, vanilla oat foam', p: 6.00, c: 'Tea', o: 1 },
    { n: 'Ginger Citrus Tea', d: 'Fresh ginger, lemon, honey', p: 4.75, c: 'Tea', o: 2, a: 'sold_out' },
    { n: 'Almond Croissant', d: 'Frangipane, toasted almond, butter', p: 5.50, c: 'Bakes', o: 1 },
    { n: 'Cardamom Bun', d: 'Brown sugar, cardamom, orange zest', p: 4.75, c: 'Bakes', o: 2 },
    { n: 'Miso Chocolate Cookie', d: 'Dark chocolate, sesame, sea salt', p: 3.75, c: 'Bakes', o: 3 },
    { n: 'Seasonal Fruit Galette', d: 'Market fruit, oat crumble, cream', p: 6.50, c: 'Bakes', o: 4 },
  ],
  [screen3Id]: [
    { n: 'Burrata e Pomodori', d: 'Creamy burrata, heirloom tomato, basil oil', p: 16.00, c: 'Antipasti', o: 1 },
    { n: 'Polpo Alla Griglia', d: 'Grilled octopus, lemon, smoked potato', p: 19.00, c: 'Antipasti', o: 2 },
    { n: 'Focaccia al Rosmarino', d: 'Warm rosemary focaccia, whipped ricotta', p: 9.00, c: 'Antipasti', o: 3 },
    { n: 'Tagliatelle al Ragù', d: 'Hand-cut pasta, beef and pork sugo', p: 23.00, c: 'Primi', o: 1 },
    { n: 'Cacio e Pepe', d: 'Tonnarelli, pecorino romano, black pepper', p: 20.00, c: 'Primi', o: 2 },
    { n: 'Risotto ai Funghi', d: 'Wild mushrooms, parmigiano, thyme', p: 22.00, c: 'Primi', o: 3 },
    { n: 'Branzino Arrosto', d: 'Roasted sea bass, fennel, salsa verde', p: 31.00, c: 'Secondi', o: 1 },
    { n: 'Pollo al Mattone', d: 'Pressed chicken, lemon, rosemary jus', p: 28.00, c: 'Secondi', o: 2, a: 'sold_out' },
    { n: 'Tiramisù della Casa', d: 'Espresso mascarpone, cocoa, ladyfingers', p: 11.00, c: 'Dolci', o: 1 },
    { n: 'Panna Cotta', d: 'Vanilla bean, blood orange, pistachio', p: 10.00, c: 'Dolci', o: 2 },
  ],
};

const insertItem = db.prepare(`
  INSERT INTO menu_items (id, screen_id, name, description, price, category, availability, text_zone_id, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let itemCount = 0;
for (const [screenId, items] of Object.entries(menuData)) {
  for (const item of items) {
    const zone = item.c === 'Tacos' ? 'tacos'
      : item.c === 'Platos Fuertes' ? 'plates'
      : item.c === 'Para Compartir' ? 'sharing'
      : item.c === 'Coffee' ? 'drinks'
      : item.c === 'Tea' ? 'noncoffee'
      : item.c === 'Bakes' ? 'bakes'
      : item.c === 'Antipasti' ? 'antipasti'
      : item.c === 'Primi' ? 'primi'
      : item.c === 'Secondi' ? 'secondi'
      : 'dolci';
    insertItem.run(uuidv4(), screenId, item.n, item.d, item.p, item.c, item.a || 'available', zone, item.o);
    itemCount++;
  }
}

console.log(`  ✅ Created ${itemCount} menu items across all showcase screens`);

// ── 6. Create schedules ──
const insertSchedule = db.prepare(`
  INSERT INTO schedules (id, screen_id, menu_name, start_time, end_time, days_of_week)
  VALUES (?, ?, ?, ?, ?, ?)
`);

insertSchedule.run(uuidv4(), screen1Id, 'All Day Taquería', '11:00', '22:00', JSON.stringify([1, 2, 3, 4, 5, 6, 7]));
insertSchedule.run(uuidv4(), screen1Id, 'Late Night Tacos', '22:00', '01:00', JSON.stringify([5, 6]));
insertSchedule.run(uuidv4(), screen2Id, 'Morning Menu', '07:00', '11:00', JSON.stringify([1, 2, 3, 4, 5, 6, 7]));
insertSchedule.run(uuidv4(), screen2Id, 'Afternoon Menu', '11:00', '16:00', JSON.stringify([1, 2, 3, 4, 5, 6, 7]));
insertSchedule.run(uuidv4(), screen3Id, 'Pranzo', '12:00', '15:00', JSON.stringify([1, 2, 3, 4, 5, 6]));
insertSchedule.run(uuidv4(), screen3Id, 'Cena', '17:00', '22:30', JSON.stringify([1, 2, 3, 4, 5, 6, 7]));

console.log('  ✅ Created 6 schedules');

console.log('\n📋 Showcase Seed Summary:');
console.log('  • 2 users created');
console.log('  • 3 restaurants created (Sol y Sombra, Ember & Oak, Oliva)');
console.log('  • 3 image-backed templates created');
console.log('  • 3 screens created with unique slugs');
console.log(`  • ${itemCount} menu items created (some marked sold_out)`);
console.log('  • 6 schedules created');
console.log('\n🔑 Demo login:');
console.log('  Email:    owner@menuvo.app');
console.log('  Password: demo1234');
console.log('\n📺 Test screen slugs:');
console.log(`  /api/screens/${screen1Slug}/data`);
console.log(`  /api/screens/${screen2Slug}/data`);
console.log(`  /api/screens/${screen3Slug}/data`);
console.log('\n✨ Showcase seed complete!');
