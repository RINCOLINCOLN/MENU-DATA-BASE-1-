# Menuvo TV Display PWA

Offline-first Progressive Web App for Android TV boxes. Displays cinematic animated menu boards that keep running even during internet outages.

## Architecture

```
tv-display/
├── index.html           # App shell (fullscreen 1920×1080)
├── app.js               # Main application logic (vanilla JS)
├── app.css              # Styles (kiosk mode, responsive scaling)
├── service-worker.js    # Offline-first caching strategies
├── manifest.json        # PWA manifest (standalone, landscape)
├── assets/
│   ├── fallback.svg     # Placeholder for when no data exists
│   └── (video files)    # Cached menu background videos
├── test.html            # Self-contained test suite
├── serve.js             # Local dev server (Node.js, port 3000)
└── package.json
```

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