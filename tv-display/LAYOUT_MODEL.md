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

## Legacy compatibility (no layout data)

Existing templates keep working through the fallback path:

```json
// template.text_zones  OR  template.config_json (array)  OR  config_json.zones
[{
  "id": "zone-menu",
  "x": 4, "y": 18, "width": 44, "height": 74,   // % or fraction (0-1)
  "align": "left",                              // or "alignment"
  "font_size": 38, "font_size_min": 14, "font_size_max": 42,
  "color": "#ffffff", "label": "Main Menu"
}]
```

Zones with item bindings (or items present) render as menu lists; zones
with only a `label` render as static text.

## Testing

- Open the TV app (`/tv/?slug=<slug>`), press `d` for the debug bar.
- **Load Layout Demo** (`__simulateLayout()`) — full canvas layout.
- **Load Legacy Demo** (`__simulateLegacy()`) — legacy zones fallback.
- `test.html` includes layout + legacy + offline coverage.

See `layout-model.js` for the reference implementation.
