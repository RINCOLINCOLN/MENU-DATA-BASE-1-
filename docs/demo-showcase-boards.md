# Demo showcase boards

The fresh-install seed now ships three image-backed sample boards for the trial/demo experience. Each board keeps the food photography free of baked-in typography so Lumenu's editable menu data remains the only text layer.

## Sol y Sombra — Fire & Citrus

- **Cuisine:** Upscale taquería
- **Canvas:** Landscape (1920×1080)
- **Artwork:** `server/uploads/demo/sol-y-sombra.jpg`
- **Palette:** Charcoal, chile red, marigold, avocado green, warm cream
- **Type:** Georgia/Times display face for the restaurant name; Inter/system sans for menu rows
- **Rationale:** The dark stone, grill marks, blue corn and citrus accents give the menu a high-energy evening feel. The image's open left/top areas support large cream type and right-aligned prices without covering the food.

## Ember & Oak — Morning Roast

- **Cuisine:** Artisan coffee bar
- **Canvas:** Landscape (1920×1080)
- **Artwork:** `server/uploads/demo/ember-coffee.jpg`
- **Palette:** Oat cream, espresso brown, sage, muted copper
- **Type:** Georgia/Times display face for the brand and Inter/system sans for menu rows
- **Rationale:** A quiet, daylight composition creates a clean contrast to the taquería board. The pale open right side carries the roast note, while a dark scrim keeps the left menu readable over the cups and pastry.

## Oliva — Trattoria Notturna

- **Cuisine:** Italian trattoria
- **Canvas:** Portrait (1080×1920)
- **Artwork:** `server/uploads/demo/oliva-trattoria.jpg`
- **Palette:** Near-black, terracotta, basil green, candle amber, parchment
- **Type:** Georgia/Times display face for the centered wordmark; Inter/system sans for menu rows
- **Rationale:** The vertical pasta-and-candle scene is intentionally intimate and rich. Its darker upper third gives the centered OLIVA masthead breathing room, while the menu stack preserves a strong portrait reading order from antipasti through dolci.

All three backgrounds use `background.type: "image"`, `fit: "cover"`, and a dark `overlay_color` in the template's `config_json.layout`. The seed keeps its existing empty-database guard and does not mutate existing owner or snapshot data.

## Review checklist

- Fresh-install demo screens remain addressable at `brew-main-board`, `brew-bar-display`, and `trattoria-menu` so existing smoke checks keep working.
- The two landscape assets are exact 1920×1080 JPEGs; the portrait asset is 1080×1920.
- Run `npm run seed` once on a clean `server/data/` directory, then run it again to confirm the idempotent skip path.
- Verify each `/api/screens/<slug>/data` response includes `template.config_json.layout.background` and the expected menu item count before opening the TV route.

