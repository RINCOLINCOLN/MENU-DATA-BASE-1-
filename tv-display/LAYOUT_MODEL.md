# Lumenu Screen Layout Model (TV Display Contract)

The TV Display PWA renders **per-screen canvas layouts**: a background plus
independently positioned/resized elements (text, menu lists, images, shapes).
This document is the contract the TV renderer consumes (`layout-model.js`).
Backend persistence and the dashboard designer should produce this shape.

## Where the layout lives in the API response

The renderer finds the layout **defensively** — the backend may expose it
through any of these paths (checked in order):

1. `data.layout` — top-level layout object
2. `data.screen.layout` — per-screen layout (object or JSON string)
3. `data.screen.config_json.layout` — layout nested in screen config
4. `data.screen.config_json` — the whole object if it *looks like* a layout
   (has `elements` or `background`)
5. `data.layout_json` — serialized layout string
6. `data.template.config_json.layout` — template-level layout (fallback)

If **no** layout is found, the renderer falls back to the legacy text-zone
model (`template.text_zones`, `template.config_json` array, or
`template.config_json.zones` / `.text_zones`) — so existing screens and
templates keep working unchanged.

## Layout object

```json
{
  "version": 1,
  "coords": "percent",           // optional: "percent" (0-100) | "fraction" (0-1)
                                 // default: numbers <= 1 treated as fraction, > 1 as percent
  "width": 1920,                 // design-time canvas width (px, for px conversion)
  "height": 1080,                // design-time canvas height (px)
  "background": {
    "type": "video|image|color|none",
    "src": "/uploads/bg.jpg",    // for type image (also used with video poster)
    "color": "#1a1a2e",          // for type color, or fallback color
    "fit": "cover|contain",      // default cover
    "opacity": 1,                // 0-1
    "overlay_color": "rgba(0,0,0,0.35)"  // optional darkening layer over bg
  },
  "elements": [ ... ]
}
```

When `background` is omitted (or `type: "video"`), the screen's template
video keeps playing as the background. `type: "image"` swaps the video for
an image; `type: "color"` uses a flat color; `type: "none"` is black.

## Element object

All `x`, `y`, `width`, `height` are **percentages of the canvas** (0-100).
Fractions (0-1) are auto-detected unless `coords: "percent"` is set.
`"240px"` strings convert relative to the canvas `width`.

```json
{
  "id": "el-1",                    // unique within the layout
  "type": "text|menu_items|image|shape",

  "x": 8, "y": 26,                 // position (%)
  "width": 40, "height": 58,       // size (%; height optional → auto)
  "z_index": 1,                    // stacking order (higher = on top)
  "visible": true,                 // false hides the element
  "opacity": 1,                    // 0-1
  "rotation": 0,                   // degrees
  "align": "left|center|right",    // text alignment
  "valign": "top|middle|bottom",   // vertical alignment (reserved)

  // ── text & menu_items binding ──────────────────────────────────────
  "text": "Welcome",               // static text for type "text"
  "item_ids": ["a", "b"],          // bind specific menu items (in order)
  "text_zone_id": "zone-menu",     // bind items whose text_zone_id matches
  "category": "Specials",          // bind items whose category matches
  "show_price": true,              // default true
  "show_description": false,       // default false
  "sold_out_badge": true,          // default true (red SOLD OUT chip)

  // ── typography ─────────────────────────────────────────────────────
  "font_family": "Georgia, serif",
  "font_size": 38,                 // base size (px in design space)
  "font_size_min": 22,             // auto-shrink floor
  "font_size_max": 52,             // auto-shrink ceiling
  "font_weight": "normal|bold|100-900",
  "font_style": "normal|italic",
  "color": "#ffffff",
  "letter_spacing": "0.05em",
  "text_transform": "none|uppercase|lowercase|capitalize",
  "line_height": 1.2,

  // ── box / visual ───────────────────────────────────────────────────
  "background_color": "transparent|rgba(0,0,0,0.3)|#hex",
  "padding": "16px 20px",
  "border_radius": "10px",
  "border": "2px solid #f6ad55",

  // ── image type ─────────────────────────────────────────────────────
  "src": "/uploads/logo.png",
  "object_fit": "contain|cover|fill",   // default contain

  // ── shape type ─────────────────────────────────────────────────────
  "shape": "rectangle|circle",
  "fill": "rgba(255,255,255,0.1)"
}
```

## Element types

| type        | renders                                                        |
|-------------|----------------------------------------------------------------|
| `text`      | static text (`text`/`label`) with typography + box styles      |
| `menu_items`| bound menu items: name + price rows, SOLD OUT badges, optional description; auto-shrinks font to fit |
| `image`     | background-image element (src, fit, center)                    |
| `shape`     | rectangle or circle filled with `fill`/`background_color`      |

## Rendering rules

- Elements render in `z_index` order (stable for equal z-index).
- Text auto-shrinks between `font_size_min` and `font_size_max` until it
  fits the element box (measured against the element's width/height).
- `menu_items` with no binding shows **all** screen items; with `item_ids`
  shows those items in that order; `text_zone_id`/`category` filter items.
- Sold-out items: name dimmed + red `SOLD OUT` badge (price hidden).
- The whole canvas scales to any physical screen while preserving aspect
  ratio (elements are %-based, so layout is resolution-independent).

## Legacy compatibility (no layout data) — zones in `template.config_json`

Existing templates keep working through the fallback path. Zones are a
**bare array** stored in `templates.config_json` (the dashboard Screen
Designer writes exactly this; the API normalizes it to `template.text_zones`).

The TV renderer accepts BOTH historical shapes deterministically:

**1. Legacy seed shape — FRACTION coordinates (0-1), auto-detected:**

```json
[{
  "id": "zone-menu",
  "x": 0.04, "y": 0.18, "width": 0.44, "height": 0.74,   // fractions
  "align": "left",                                       // legacy field
  "font_size_min": 14, "font_size_max": 42,
  "color": "#ffffff", "label": "Main Menu Items"
}]
```

**2. Screen Designer shape — PERCENT coordinates (0-100):**

```json
[{
  "id": "zone-msp1…",
  "type": "header | category_header | footer | text | menu_items | specials",
  "label": "Brew & Bean Café",
  "x": 5, "y": 15, "width": 90, "height": 24,            // percent 0-100
  "alignment": "center",                                  // NOT `align`
  "font_size": 48, "min_font_size": 14, "max_font_size": 64,
  "font_weight": "bold", "font_family": "Inter",
  "color": "#ffffff", "bg_color": "transparent",         // NOT `background_color`
  "is_price": false,                                      // price visibility
  "category_filter": "",                                  // substring match
  "item_ids": []
}]
```

### Coordinate-unit rule (pixel consistency — IMPORTANT)

Designer zones are **percent**; legacy seeds are **fractions**. The
renderer decides per-zone, structurally (never by a value heuristic, so a
designer zone at `x:0.5` is 0.5% and a legacy zone at `x:0.5` is 50%):

- `coords: "percent" | "fraction"` on the zone wins explicitly.
- Zones with designer markers (`type` in the designer set, `alignment`,
  `min_font_size`, `max_font_size`, `bg_color`, `category_filter`,
  `is_price`, or `font_size`) → **percent**.
- Otherwise (legacy `align` / `font_size_min` shape) → **auto-detect**
  (numbers ≤ 1 are fractions, > 1 are percents).

### Field aliases accepted by the renderer

| Canonical | Aliases (legacy / designer) |
|-----------|------------------------------|
| `align`   | `alignment`                   |
| `font_size_min` / `font_size_max` | `min_font_size` / `max_font_size` |
| `background_color` | `bg_color`             |
| `category` (exact match) | `category_filter` (substring, case-insensitive) |
| `show_price` | `is_price` (false → hide prices) |

### Type → rendering

- `header`, `category_header`, `footer`, `text` → static text (the zone's
  `label`); NEVER binds menu items unless the zone explicitly sets
  `item_ids`/`category_filter`.
- `menu_items`, `specials` → menu list (name + price rows, SOLD OUT
  badges). `specials` typically carries a `bg_color` highlight.
- Legacy zones (no `type`) with items available → menu list of all items;
  with no items and a label → static text (original behavior preserved).

## Testing

- Open the TV app (`/tv/?slug=<slug>`), press `d` for the debug bar.
- **Load Layout Demo** (`__simulateLayout()`) — full canvas layout.
- **Load Legacy Demo** (`__simulateLegacy()`) — legacy zones fallback.
- Live designer-authored screen: `/tv/?slug=browser-e2e-board` (2 zones
  persisted by the dashboard Screen Designer — header text + menu).
- `test.html` includes layout + legacy + offline coverage.

See `layout-model.js` for the reference implementation.
