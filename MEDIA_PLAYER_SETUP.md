# Lumenu media-player setup

This is the supported first hardware path for v1: **Android TV / Google TV box + Fully Kiosk Browser**. It is the lowest-friction option because Lumenu is a browser PWA, supports kiosk/landscape mode, and caches the video and last-synced menu locally for internet outages. A Raspberry Pi/Chromium setup can work later, but is not the first supported path; Fire TV is not recommended for v1 because installing and maintaining a full-screen browser is less predictable.

## Requirements

- Android TV or Google TV device with HDMI, power, and 1080p-capable display.
- Wi-Fi with internet access for the first load and sync. The phone and TV do **not** need to remain on the same network after setup; they only need internet access to reach Lumenu.
- Fully Kiosk Browser installed from Google Play (or an equivalent Android TV Chromium browser with autoplay allowed).
- A Lumenu restaurant and screen created in the dashboard.

## Pair a screen

1. On a phone, open `https://lumenu.ctonew.app/` and sign in.
2. Create/select a restaurant, then create a screen. Use a short, unique screen slug (for example `brew-main-board`) and assign a template/video and menu items.
3. Copy the screen URL shown by onboarding, or use this exact form:
   `https://lumenu.ctonew.app/tv/?slug=YOUR_SCREEN_SLUG`
4. On the TV box, install Fully Kiosk Browser, enable **Start URL**, paste the URL, allow autoplay/media, enable fullscreen/kiosk mode, hide navigation/status bars, and lock orientation to landscape.
5. Open the URL once while online. Wait for the video and menu text to appear; this primes the app shell, video, and data cache.
6. From the phone dashboard, toggle a menu item's sold-out status. The TV should update through WebSocket within seconds; polling retries every 12 seconds if WebSocket is unavailable.

## Offline and health checks

- A brief network interruption leaves the cached video and latest menu visible. After roughly 30 seconds offline, the owner-only indicator changes to degraded/offline; customers still see the menu.
- Restore connectivity and allow one sync cycle. The indicator returns to live and the TV reconnects automatically; no refresh is required.
- In the dashboard, open the screen detail page to view health. The public endpoint is `https://lumenu.ctonew.app/api/screens/YOUR_SCREEN_SLUG/health`.
- The combined TV payload endpoint is `https://lumenu.ctonew.app/api/screens/YOUR_SCREEN_SLUG/data`.

## Troubleshooting

- **Screen not found:** verify the slug exactly (case and hyphens) and that the screen exists in the selected restaurant.
- **Blank/failsafe screen:** reconnect the box, confirm the URL includes `/tv/?slug=...`, and reload once online so the first cache is populated. Confirm a video template is assigned.
- **Video but stale menu:** keep the TV online for at least one polling interval (12 seconds), then verify the dashboard health endpoint. Fully Kiosk must allow JavaScript and WebSocket connections.
- **Autoplay blocked:** in Fully Kiosk, enable autoplay/media playback and keep the device muted; Lumenu intentionally uses muted autoplay for kiosk reliability.
- **Phone edits not appearing:** verify the TV has internet access, then wait for WebSocket reconnect or the 12-second poll. Do not clear site storage unless re-pairing; clearing it removes the offline cache.
