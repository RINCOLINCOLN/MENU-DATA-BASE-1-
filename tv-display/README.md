# Lumenu TV Display PWA

Offline-first Progressive Web App for Android TV boxes. Displays cinematic animated menu boards that keep running even during internet outages.

## Architecture

```
tv-display/
├── index.html           # App shell (fullscreen 1920×1080)
├── app.js               # Main application logic (vanilla JS)
├── layout-model.js      # Canvas layout model + renderer (background + elements)
├── app.css              # Styles (kiosk mode, responsive scaling)
├── service-worker.js    # Offline-first caching strategies
├── manifest.json        # PWA manifest (standalone, landscape)
├── assets/
│   ├── fallback.svg     # Placeholder for when no data exists
│   └── (video files)    # Cached menu background videos
├── test.html            # Self-contained test suite
├── LAYOUT_MODEL.md      # Contract for the per-screen canvas layout model
├── serve.js             # Local dev server (Node.js, port 3000)
└── package.json
```

## Rendering models

The display renders in one of two modes (see `LAYOUT_MODEL.md` for the full
contract):

1. **Canvas layout** (new) — per-screen `layout` with a background
   (`video | image | color | none`) plus independently positioned/resized
   elements: `text`, `menu_items`, `image`, `shape`. Elements support
   z-index, visibility, opacity, alignment, typography, and auto-shrink.
2. **Legacy text zones** (fallback) — existing screens/templates without
   layout data keep working via `template.text_zones` /
   `template.config_json` (array or `.zones`).

Press **D** for the debug bar: it shows the active render mode and has
**Load Layout Demo** / **Load Legacy Demo** buttons.

## Offline Modes

| Mode | Indicator | Trigger | Behavior |
|------|-----------|---------|----------|
| **Normal** | Green dot | Online, data synced | Video from cache, live text overlays, WebSocket updates |
| **Degraded** | Red dot | 30s offline | Video loops from cache, shows last-known-good data, tiny "degraded" dot for owner |
| **Failsafe** | N/A (full screen) | Never synced | Static branded image: "Menu Coming Soon" |

## Key Technical Decisions

- **Vanilla JS** — no frameworks for maximum compatibility on low-end Android TV boxes
- **Cache-first for video** — videos are large (50-200MB), never re-fetched after first download
- **Network-first for data** — data changes often (prices, sold-out), but cached as fallback
- **30-second offline grace period** — brief network blips don't trigger mode switch
- **12-second polling** + **WebSocket** — dual-channel sync for reliability
- **Auto-scaling** — 1920×1080 viewport scales to any screen while maintaining 16:9

## API Integration

The TV app fetches from:
- `GET /api/screens/:slug/data` — JSON with template config + menu items
- `WS /ws/screen/:slug` — Real-time updates via WebSocket

Expected data shape:

```json
{
  "mode": "normal",
  "slug": "restaurant-1",
  "template": {
    "video_url": "/assets/menu-bg.mp4",
    "text_zones": [
      { "id": "tz-1", "x": 5, "y": 10, "alignment": "left",
        "font_size": 48, "min_font_size": 24, "max_font_size": 72,
        "color": "#ffffff", "item_ids": ["item-1", "item-2"] }
    ]
  },
  "items": [
    { "id": "item-1", "name": "Classic Burger", "price": 14.99, "availability": "available" },
    { "id": "item-2", "name": "Caesar Salad", "price": 11.99, "availability": "sold_out" }
  ],
  "last_updated": "2026-07-09T12:00:00Z"
}
```

## Testing

1. Start server: `node serve.js`
2. Open http://localhost:3000/test.html
3. Click "Run All Tests" to run the automated test suite
4. Use "Load Test Menu Data" to populate the display with sample items
5. Toggle offline to verify video keeps playing and data stays visible

## Development

Press **D** on any TV display page to toggle the debug bar with manual controls.

## Deployment

The backend Express server serves this directory as static files at the TV display route.