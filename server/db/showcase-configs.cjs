/**
 * showcase-configs.cjs — SINGLE SOURCE OF TRUTH for the Lumenu demo boards.
 *
 * Consumed by:
 *   - server/db/seed.js                 (fresh-install seed, PR #40 pattern)
 *   - server/db/apply-demo-showcase.cjs (safe live-DB migration, PR #41 pattern)
 *   - server/db/regen-showcase-configs.cjs (regenerates showcase-board-configs.json + sha pins)
 *
 * This is the designer's board spec: layouts are tuned for a real TV
 * (1920×1080 landscape / 1080×1920 portrait, ~5% overscan-safe margins),
 * prices were corrected against 2025–26 US-metro market ranges
 * (see /home/team/shared/coffee-menu-benchmark.md), and every board ships
 * a machine-readable `animation` block for the TV motion pass.
 */
'use strict';

const FONT_SANS = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const FONT_DISPLAY = 'Georgia, "Times New Roman", serif';

// ── Board palettes (shared by text colors + animation pulse spec) ──
const PALETTES = {
  ember: { espresso: '#241B13', copper: '#B5773F', oat: '#FAF4E7', cream: '#FFF9EE' },
  sol:   { charcoal: '#0E0B08', marigold: '#F4B860', cream: '#FFF6E8', chile: '#8C3A20', muted: '#E6D7C2' },
  oliva: { nearBlack: '#0A080C', amber: '#D6A55B', basil: '#3E5C41', terracotta: '#B86A3E', parchment: '#FFF4DF', muted: '#E6D7C2' },
};

function textEl(id, text, x, y, width, height, options = {}) {
  const el = {
    id, type: 'text', text, x, y, width, height, coords: 'percent',
    z_index: options.z_index ?? 2,
    font_family: options.font_family || FONT_SANS,
    font_size: options.font_size || 32,
    font_size_min: options.font_size_min || 18,
    font_size_max: options.font_size_max || options.font_size || 64,
    font_weight: options.font_weight || '600',
    color: options.color || '#FFF6E8',
    letter_spacing: options.letter_spacing || '0.02em',
    line_height: options.line_height || '1.08',
    text_transform: options.text_transform || 'none',
    align: options.align || 'left',
  };
  for (const k of ['padding', 'background_color', 'border_radius']) {
    if (options[k] !== undefined) el[k] = options[k];
  }
  return el;
}

function menuEl(id, x, y, width, height, category, options = {}) {
  return {
    id, type: 'menu_items', x, y, width, height, coords: 'percent',
    z_index: options.z_index ?? 2, category,
    align: options.align || 'left',
    font_family: options.font_family || FONT_SANS,
    font_size: options.font_size || 28,
    font_size_min: options.font_size_min || 18,
    font_size_max: options.font_size_max || options.font_size || 34,
    font_weight: options.font_weight || '500',
    color: options.color || '#FFF6E8',
    line_height: options.line_height || '1.18',
    price_position: options.price_position || 'right_column',
    price_font_weight: options.price_font_weight || '700',
    show_description: false,
    sold_out_badge: true,
  };
}

function shapeEl(id, x, y, width, height, options = {}) {
  return {
    id, type: 'shape', x, y, width, height, coords: 'percent',
    z_index: options.z_index ?? 1,
    fill: options.fill || 'rgba(12, 10, 8, 0.6)',
    border_radius: options.border_radius || '16px',
  };
}

function logoEl(src, x, y, width, height) {
  return {
    id: 'logo', type: 'image', src, x, y, width, height, coords: 'percent',
    z_index: 3, fit: 'contain', object_fit: 'contain', background_color: 'transparent',
  };
}

function board(backgroundSrc, width, height, overlay, elements, animation, fit = 'cover') {
  return {
    version: 1,
    coords: 'percent',
    width,
    height,
    background: {
      type: 'image',
      src: backgroundSrc,
      fit,
      overlay_color: overlay,
    },
    elements,
    animation,
  };
}

// ── Animation spec (requirement #5). TV Display Engineer implements the
//    motion pass USING THIS BLOCK; text/menu/logo elements never move. ──
const ANIM = {
  ember: {
    version: 1,
    ken_burns: {
      // Slow drift on the BACKGROUND image only (background-position/scale).
      scale_from: 1.0, scale_to: 1.07,       // soft zoom, never a hard cut
      leg_ms: 40000,                          // one zoom leg; loop = ping-pong (scale_to→scale_from)
      easing: 'easeInOutSine',                // ≈ cubic-bezier(0.37, 0.00, 0.63, 1.00)
      pan_pct: { x_end: 1.5, y_end: -1.0 },   // end offset in % of image size; drifts toward the
                                              // text-light upper-right gap (pan stays ≤ ~2% so the
                                              // cover can never reveal canvas edges)
      text_safe_side: 'upper-right',
    },
    scrim_pulse: {
      // Low-saturation oscillation of the overlay tint (pine/espresso ↔ muted
      // copper). Implemented as: overlay color interpolates color_a→color_b
      // while its ALPHA breathes base ± amplitude on a sine curve.
      color_a: '#1C1510',                     // espresso
      color_b: '#8A6B4C',                     // muted copper
      alpha_base: 0.42, alpha_amplitude: 0.06,
      cycle_ms: 12000,
      easing: 'sine',
    },
    never_animate: 'ALL layout elements (text, menu_items, image/logo, shape panels) stay perfectly static; only the background image and its overlay breathe.',
  },
  sol: {
    version: 1,
    ken_burns: {
      scale_from: 1.0, scale_to: 1.08,
      leg_ms: 45000,
      easing: 'easeInOutSine',
      pan_pct: { x_end: 0.0, y_end: 1.2 },    // minimal downward settle; grid board is text-dense
      text_safe_side: 'full-grid',
    },
    scrim_pulse: {
      color_a: '#0E0B08',                     // charcoal
      color_b: '#7A3B18',                     // ancho/chile
      alpha_base: 0.5, alpha_amplitude: 0.06,
      cycle_ms: 10000,
      easing: 'sine',
    },
    never_animate: 'ALL layout elements stay static; only the background image and its overlay breathe.',
  },
  oliva: {
    version: 1,
    ken_burns: {
      scale_from: 1.0, scale_to: 1.06,
      leg_ms: 55000,
      easing: 'easeInOutSine',
      pan_pct: { x_end: 0.0, y_end: -1.5 },   // slow upward drift, classic vertical restaurant board
      text_safe_side: 'center-column',
    },
    scrim_pulse: {
      color_a: '#0A080C',                     // near-black
      color_b: '#4E2F1E',                     // terracotta dusk
      alpha_base: 0.52, alpha_amplitude: 0.06,
      cycle_ms: 14000,
      easing: 'sine',
    },
    never_animate: 'ALL layout elements stay static; only the background image and its overlay breathe.',
  },
};

// ── 1. EMBER & OAK — coffee bar, landscape 1920×1080 ──
//    Benchmark-driven: solid oat menu panel (café-wall look), espresso-brown
//    type on the panel, one featured "TODAY'S POUR" callout (Onyx pattern),
//    right-aligned price rail, ~5% overscan margins respected everywhere.
const EMBER_BG = '/uploads/demo/ember-coffee.jpg';
const EMBER_OVL = 'rgba(22, 18, 14, 0.42)';
const ember = board(EMBER_BG, 1920, 1080, EMBER_OVL, [
  // Logo mark (top-left, like a real café door sign) — transparent PNG, ~10% of width
  logoEl('/uploads/demo/ember-oak-logo.png', 6, 5.5, 10, 10),
  textEl('brand', 'EMBER & OAK', 17.5, 5.6, 66, 7.5, {
    font_family: FONT_DISPLAY, font_size: 50, font_size_min: 30, font_size_max: 60,
    font_weight: '700', letter_spacing: '0.1em', text_transform: 'uppercase', color: PALETTES.ember.cream,
  }),
  textEl('tagline', 'Coffee, slowly made', 17.5, 13.4, 66, 4, {
    font_family: FONT_DISPLAY, font_size: 22, font_size_min: 16, font_size_max: 27,
    font_weight: '500', color: PALETTES.ember.copper,
  }),
  // Oat menu panel (left) + thin feature panel (right, top)
  shapeEl('panel-drinks', 5.5, 19, 50, 77, { fill: 'rgba(250, 244, 231, 0.94)', border_radius: '20px' }),
  shapeEl('panel-feature', 58.5, 19, 35, 31, { fill: 'rgba(250, 244, 231, 0.94)', border_radius: '20px' }),
  textEl('drinks-label', 'COFFEE & ESPRESSO', 8.5, 22.5, 44, 3.5, {
    font_size: 17, font_size_min: 13, font_size_max: 21, color: '#A86E3F',
    font_weight: '700', letter_spacing: '0.18em', text_transform: 'uppercase',
  }),
  menuEl('drinks', 8.5, 26.5, 44, 25, 'Coffee', { font_size: 26, font_size_min: 18, color: PALETTES.ember.espresso }),
  textEl('alt-label', 'TEA + ALTERNATIVES', 8.5, 54, 44, 3.5, {
    font_size: 17, font_size_min: 13, font_size_max: 21, color: '#A86E3F',
    font_weight: '700', letter_spacing: '0.16em', text_transform: 'uppercase',
  }),
  menuEl('noncoffee', 8.5, 58, 44, 8.5, 'Tea', { font_size: 24, font_size_min: 16, color: PALETTES.ember.espresso }),
  textEl('bakes-label', 'BAKED THIS MORNING', 8.5, 68.5, 44, 3.5, {
    font_size: 16, font_size_min: 12, font_size_max: 20, color: '#A86E3F',
    font_weight: '700', letter_spacing: '0.14em', text_transform: 'uppercase',
  }),
  menuEl('bakes', 8.5, 72.5, 44, 17, 'Bakes', { font_size: 24, font_size_min: 16, color: PALETTES.ember.espresso }),
  // Featured pour (Onyx-style single callout — NEVER more than one)
  textEl('feature-kicker', "TODAY'S POUR", 61.5, 21.5, 29.5, 3, {
    font_size: 15, font_size_min: 12, font_size_max: 18, color: '#A86E3F',
    font_weight: '700', letter_spacing: '0.2em', text_transform: 'uppercase',
  }),
  textEl('feature-title', 'La Esperanza · Colombia', 61.5, 26, 29.5, 4.5, {
    font_family: FONT_DISPLAY, font_size: 26, font_size_min: 18, font_size_max: 30,
    font_weight: '500', color: PALETTES.ember.espresso,
  }),
  textEl('feature-note', 'Stone fruit · caramel · jasmine. Batch and pour-over, all day.', 61.5, 31.5, 29.5, 11.5, {
    font_size: 15, font_size_min: 12, font_size_max: 18, font_weight: '500',
    color: '#6B5A48', line_height: '1.35',
  }),
  textEl('hours', 'OPEN 7A — 4P · SEASONAL MENU', 58.5, 88.5, 35, 3.5, {
    font_size: 15, font_size_min: 12, font_size_max: 18, font_weight: '700',
    color: PALETTES.ember.cream, letter_spacing: '0.12em', text_transform: 'uppercase', align: 'right',
  }),
], ANIM.ember);

// ── 2. SOL Y SOMBRA — taquería, landscape 1920×1080 ──
//    Wall-of-menus grid (real taquería boards stack categories in panels);
//    charcoal translucent panels, marigold category labels, right price rail.
const SOL_BG = '/uploads/demo/sol-y-sombra.jpg';
const SOL_OVL = 'rgba(14, 11, 8, 0.5)';
const SOL_PANEL = 'rgba(12, 10, 8, 0.62)';
const sol = board(SOL_BG, 1920, 1080, SOL_OVL, [
  logoEl('/uploads/demo/sol-y-sombra-logo.png', 6, 5, 10, 10),
  textEl('brand', 'SOL Y SOMBRA', 17.5, 5.2, 66, 7.5, {
    font_family: FONT_DISPLAY, font_size: 52, font_size_min: 30, font_size_max: 62,
    font_weight: '700', letter_spacing: '0.12em', text_transform: 'uppercase', color: PALETTES.sol.cream,
  }),
  textEl('tagline', 'Cocina de fuego · tacos de autor', 17.5, 13.2, 66, 4, {
    font_size: 20, font_size_min: 15, font_size_max: 24, color: PALETTES.sol.marigold,
    font_weight: '600', letter_spacing: '0.08em', text_transform: 'uppercase',
  }),
  shapeEl('panel-a', 5.5, 17, 45.5, 37, { fill: SOL_PANEL }),
  shapeEl('panel-b', 54, 17, 41.5, 37, { fill: SOL_PANEL }),
  textEl('tacos-label', 'TACOS', 9, 20, 38, 3.5, {
    font_size: 20, font_size_min: 15, font_size_max: 25, color: PALETTES.sol.marigold,
    font_weight: '700', letter_spacing: '0.22em', text_transform: 'uppercase',
  }),
  menuEl('tacos', 9, 24, 38, 27, 'Tacos', { font_size: 27, font_size_min: 19, color: PALETTES.sol.cream }),
  textEl('sharing-label', 'PARA COMPARTIR', 57.5, 20, 34, 3.5, {
    font_size: 20, font_size_min: 15, font_size_max: 25, color: PALETTES.sol.marigold,
    font_weight: '700', letter_spacing: '0.16em', text_transform: 'uppercase',
  }),
  menuEl('sharing', 57.5, 24, 34, 21, 'Para Compartir', { font_size: 27, font_size_min: 19, color: PALETTES.sol.cream }),
  textEl('chef-note', 'FUEGO · FRESCO · HECHO AQUÍ', 57.5, 46.5, 34, 4, {
    font_family: FONT_DISPLAY, font_size: 20, font_size_min: 15, font_size_max: 24,
    font_weight: '700', color: '#F7D28C', letter_spacing: '0.08em', text_transform: 'uppercase',
  }),
  shapeEl('panel-c', 5.5, 58, 90, 26, { fill: SOL_PANEL }),
  textEl('plates-label', 'PLATOS FUERTES', 9, 61, 40, 3.5, {
    font_size: 20, font_size_min: 15, font_size_max: 25, color: PALETTES.sol.marigold,
    font_weight: '700', letter_spacing: '0.18em', text_transform: 'uppercase',
  }),
  menuEl('plates', 9, 65, 82, 16, 'Platos Fuertes', { font_size: 26, font_size_min: 18, color: PALETTES.sol.cream }),
  textEl('footer', 'MAÍZ AZUL  ·  AGAVE  ·  LIMA', 5.5, 89.5, 90, 3, {
    font_size: 15, font_size_min: 12, font_size_max: 18, font_weight: '600',
    color: PALETTES.sol.muted, letter_spacing: '0.12em', text_transform: 'uppercase', align: 'center',
  }),
], ANIM.sol);

// ── 3. OLIVA — trattoria, portrait 1080×1920 ──
//    Classic trattoria wall menu: centered OLIVA masthead + logo, gold rule,
//    single left-aligned column of categories ending before the 5% margin.
const OLIVA_BG = '/uploads/demo/oliva-trattoria.jpg';
const OLIVA_OVL = 'rgba(10, 8, 10, 0.52)';
const oliva = board(OLIVA_BG, 1080, 1920, OLIVA_OVL, [
  logoEl('/uploads/demo/oliva-logo.png', 43, 4.5, 14, 7.5),
  textEl('brand', 'OLIVA', 8, 12.5, 84, 5.5, {
    font_family: FONT_DISPLAY, font_size: 52, font_size_min: 32, font_size_max: 64,
    font_weight: '700', letter_spacing: '0.35em', text_transform: 'uppercase',
    align: 'center', color: PALETTES.oliva.parchment,
  }),
  textEl('tagline', 'TRATTORIA ITALIANA · DAL 1987', 8, 18.5, 84, 3, {
    font_size: 15, font_size_min: 12, font_size_max: 18, font_weight: '600',
    color: PALETTES.oliva.amber, letter_spacing: '0.18em', text_transform: 'uppercase', align: 'center',
  }),
  shapeEl('rule', 38, 22.5, 24, 0.35, { fill: 'rgba(214, 165, 91, 0.55)', border_radius: '2px', z_index: 2 }),
  textEl('antipasti-label', 'ANTIPASTI', 8, 26.5, 84, 3, {
    font_size: 19, font_size_min: 14, font_size_max: 24, color: PALETTES.oliva.amber,
    font_weight: '700', letter_spacing: '0.24em', text_transform: 'uppercase',
  }),
  menuEl('antipasti', 8, 30, 84, 13, 'Antipasti', { font_size: 26, font_size_min: 18, color: PALETTES.oliva.parchment }),
  textEl('primi-label', 'PRIMI', 8, 46, 84, 3, {
    font_size: 19, font_size_min: 14, font_size_max: 24, color: PALETTES.oliva.amber,
    font_weight: '700', letter_spacing: '0.24em', text_transform: 'uppercase',
  }),
  menuEl('primi', 8, 49.5, 84, 13, 'Primi', { font_size: 26, font_size_min: 18, color: PALETTES.oliva.parchment }),
  textEl('secondi-label', 'SECONDI', 8, 65.5, 84, 3, {
    font_size: 19, font_size_min: 14, font_size_max: 24, color: PALETTES.oliva.amber,
    font_weight: '700', letter_spacing: '0.24em', text_transform: 'uppercase',
  }),
  menuEl('secondi', 8, 69, 84, 9, 'Secondi', { font_size: 26, font_size_min: 18, color: PALETTES.oliva.parchment }),
  textEl('dolci-label', 'DOLCI', 8, 81, 84, 3, {
    font_size: 19, font_size_min: 14, font_size_max: 24, color: PALETTES.oliva.amber,
    font_weight: '700', letter_spacing: '0.24em', text_transform: 'uppercase',
  }),
  menuEl('dolci', 8, 84.5, 84, 7, 'Dolci', { font_size: 24, font_size_min: 16, color: PALETTES.oliva.parchment }),
  textEl('footer', 'APERTO A CENA · 17:00 — 22:30', 8, 92.3, 84, 2.5, {
    font_size: 14, font_size_min: 11, font_size_max: 17, font_weight: '600',
    color: PALETTES.oliva.muted, letter_spacing: '0.14em', text_transform: 'uppercase', align: 'center',
  }),
], ANIM.oliva);

// ── Menu content. Prices corrected against 2025–26 US-metro market ranges
//    (see coffee-menu-benchmark.md §Price plausibility pass). `z` = text zone. ──
const menus = {
  ember: [
    { n: 'Espresso', d: 'Double shot · house blend', p: 3.75, c: 'Coffee', z: 'drinks', o: 1 },
    { n: 'Oat Milk Cortado', d: 'Two shots · velvety oat milk', p: 5.25, c: 'Coffee', z: 'drinks', o: 2 },
    { n: 'Maple Sea Salt Latte', d: 'Espresso · maple · flaky salt', p: 6.25, c: 'Coffee', z: 'drinks', o: 3 },
    { n: 'Cold Brew Tonic', d: 'Slow-steeped · citrus tonic', p: 6.25, c: 'Coffee', z: 'drinks', o: 4 },
    { n: 'Ceremonial Matcha', d: 'Stone-milled · oat milk', p: 6.0, c: 'Tea', z: 'noncoffee', o: 1 },
    { n: 'Ginger Citrus Tea', d: 'Fresh ginger · lemon · honey', p: 4.75, c: 'Tea', z: 'noncoffee', o: 2, a: 'sold_out' },
    { n: 'Almond Croissant', d: 'Frangipane · toasted almonds', p: 5.25, c: 'Bakes', z: 'bakes', o: 1 },
    { n: 'Cardamom Bun', d: 'Brown sugar · orange zest', p: 4.95, c: 'Bakes', z: 'bakes', o: 2 },
    { n: 'Miso Chocolate Cookie', d: 'Dark chocolate · sesame', p: 4.25, c: 'Bakes', z: 'bakes', o: 3 },
    { n: 'Seasonal Fruit Galette', d: 'Market fruit · oat crumble', p: 6.5, c: 'Bakes', z: 'bakes', o: 4 },
  ],
  oliva: [
    { n: 'Burrata e Pomodori', d: 'Burrata · heirloom tomato · basil', p: 17.0, c: 'Antipasti', z: 'antipasti', o: 1 },
    { n: 'Polpo Alla Griglia', d: 'Grilled octopus · lemon · olive', p: 21.0, c: 'Antipasti', z: 'antipasti', o: 2 },
    { n: 'Focaccia al Rosmarino', d: 'Warm focaccia · whipped ricotta', p: 10.0, c: 'Antipasti', z: 'antipasti', o: 3 },
    { n: 'Tagliatelle al Ragù', d: 'Hand-cut pasta · beef & pork sugo', p: 24.0, c: 'Primi', z: 'primi', o: 1 },
    { n: 'Cacio e Pepe', d: 'Tonnarelli · pecorino · black pepper', p: 21.0, c: 'Primi', z: 'primi', o: 2 },
    { n: 'Risotto ai Funghi', d: 'Wild mushrooms · parmigiano', p: 23.0, c: 'Primi', z: 'primi', o: 3 },
    { n: 'Branzino Arrosto', d: 'Roasted sea bass · fennel · salsa verde', p: 34.0, c: 'Secondi', z: 'secondi', o: 1 },
    { n: 'Pollo al Mattone', d: 'Pressed chicken · lemon · rosemary', p: 29.0, c: 'Secondi', z: 'secondi', o: 2, a: 'sold_out' },
    { n: 'Tiramisù della Casa', d: 'Espresso mascarpone · cocoa', p: 12.0, c: 'Dolci', z: 'dolci', o: 1 },
    { n: 'Panna Cotta', d: 'Vanilla bean · blood orange', p: 11.0, c: 'Dolci', z: 'dolci', o: 2 },
  ],
  taqueria: [
    { n: 'Camarón al Carbón', d: 'Grilled shrimp · guajillo butter', p: 6.25, c: 'Tacos', z: 'tacos', o: 1 },
    { n: 'Birria de Res', d: 'Slow-braised beef · consommé', p: 6.0, c: 'Tacos', z: 'tacos', o: 2 },
    { n: 'Pollo Adobado', d: 'Achiote marinade · salsa verde', p: 5.5, c: 'Tacos', z: 'tacos', o: 3 },
    { n: 'Hongos al Pastor', d: 'Roasted mushrooms · pineapple', p: 5.25, c: 'Tacos', z: 'tacos', o: 4 },
    { n: 'Costilla de Cerdo', d: 'Chile-morita glaze · charred scallion', p: 21.0, c: 'Platos Fuertes', z: 'plates', o: 1 },
    { n: 'Pesca del Día', d: 'Citrus escabeche · crispy potato', p: 24.0, c: 'Platos Fuertes', z: 'plates', o: 2 },
    { n: 'Enchiladas de Mole', d: 'Mole negro · crema · sesame', p: 18.5, c: 'Platos Fuertes', z: 'plates', o: 3, a: 'sold_out' },
    { n: 'Guacamole de la Casa', d: 'Avocado · serrano · lime · totopos', p: 12.0, c: 'Para Compartir', z: 'sharing', o: 1 },
    { n: 'Elote Asado', d: 'Cotija · chile ancho · lime crema', p: 9.0, c: 'Para Compartir', z: 'sharing', o: 2 },
    { n: 'Queso Fundido', d: 'Oaxaca cheese · chorizo · tortillas', p: 14.0, c: 'Para Compartir', z: 'sharing', o: 3 },
  ],
};

const schedules = {
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

// logo_url per demo restaurant (also used as the board image element src)
const logos = {
  ember: '/uploads/demo/ember-oak-logo.png',
  sol: '/uploads/demo/sol-y-sombra-logo.png',
  oliva: '/uploads/demo/oliva-logo.png',
};

module.exports = {
  FONT_SANS, FONT_DISPLAY, PALETTES,
  configs: { taqueria: sol, ember, oliva },
  menus, schedules, logos,
  textEl, menuEl, shapeEl, logoEl, board,
};