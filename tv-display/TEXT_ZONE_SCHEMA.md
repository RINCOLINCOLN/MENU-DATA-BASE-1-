# Text Zone Config Schema

Standardized configuration format for `config_json.text_zones` in Menuvo templates.

## Complete Field Reference

```json
{
  "id": "unique-zone-id",
  "type": "header|category_header|menu_items|specials|footer",

  // Positioning (required)
  "x": 5,           // X position as percentage (0-100)
  "y": 22,          // Y position as percentage (0-100)
  "width": 90,      // Width as percentage (0-100) or "auto"
  "height": "auto", // Height as percentage or "auto"

  // Typography
  "font_family": "'Helvetica Neue', Helvetica, Arial, sans-serif",
  "font_size": 38,           // Base font size in px (required)
  "min_font_size": 22,       // Minimum font size for auto-shrink
  "max_font_size": 52,       // Maximum font size for auto-shrink
  "font_weight": "normal|bold|100-900",
  "color": "#ffffff",        // Text color (hex, rgb, rgba)
  "letter_spacing": "normal|0.05em|0.1em|etc",
  "text_transform": "none|uppercase|lowercase|capitalize",
  "line_height": 1.3,        // Unitless multiplier

  // Alignment
  "alignment": "left|center|right",

  // Visual
  "background_color": "transparent|rgba(0,0,0,0.3)|#hex",
  "opacity": 1,              // 0.0 - 1.0
  "padding": "4px 8px",     // CSS padding shorthand
  "border_radius": "8px",   // CSS border-radius

  // Item binding (optional — if empty, zone shows ALL items)
  "item_ids": ["item-1", "item-2"]
}
```

## Type Reference

| Type | Purpose | Recommended Style |
|------|---------|-------------------|
| `header` | Restaurant/brand name | Large, centered, serif font |
| `category_header` | Menu category titles | Bold, uppercase, accent color |
| `menu_items` | Item list with prices | Clean sans-serif, auto-shrink |
| `specials` | Featured/special items | Highlighted with background |
| `footer` | Hours, tagline, etc. | Small, muted, bottom of screen |

## Example: Minimal Zone

```json
{
  "id": "zone-items",
  "type": "menu_items",
  "x": 5, "y": 22,
  "font_size": 38,
  "color": "#ffffff"
}
```

## Example: Styled Specials Zone

```json
{
  "id": "zone-specials",
  "type": "specials",
  "x": 50, "y": 65,
  "width": 45,
  "alignment": "center",
  "font_family": "Georgia, serif",
  "font_size": 32,
  "font_weight": "bold",
  "color": "#fc8181",
  "letter_spacing": "0.05em",
  "text_transform": "capitalize",
  "background_color": "rgba(0,0,0,0.3)",
  "padding": "12px 20px",
  "border_radius": "8px"
}
```

## Backward Compatibility

The standard format is a superset of the original format. All old fields
(`x`, `y`, `alignment`, `font_size`, `min_font_size`, `max_font_size`,
`color`, `font_weight`, `item_ids`) continue to work identically.
New fields are optional — omitting them falls back to sensible defaults.