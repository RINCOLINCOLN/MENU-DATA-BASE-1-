/* MenuLoop TV Display — Service Worker
 * Cache-first strategy for video assets, network-first for data
 * Three-tier offline fallback with background sync retry
 */

const CACHE_VERSION = 'menuloop-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const VIDEO_CACHE = `${CACHE_VERSION}-video`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/app.css',
  '/app.js',
  '/manifest.json',
  '/assets/fallback.svg',
];

/** Maximum age for cached data before we consider it stale (30 seconds) */
const DATA_STALE_MS = 30 * 1000;

// ── Install: precache app shell and video ────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const staticCache = await caches.open(STATIC_CACHE);
      await staticCache.addAll(PRECACHE_URLS);

      // Precache a placeholder data blob so we never start cold
      const dataCache = await caches.open(DATA_CACHE);
      const initData = {
        mode: 'failsafe',
        slug: '',
        template: { video_url: '', text_zones: [] },
        items: [],
        last_updated: null,
      };
      dataCache.put(
        '/api/screens/init/data',
        new Response(JSON.stringify(initData), {
          headers: { 'Content-Type': 'application/json' },
        })
      );

      return self.skipWaiting();
    })()
  );
});

// ── Activate: clean old caches ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      const oldCaches = cacheNames.filter(
        (name) => name.startsWith('menuloop-') && name !== STATIC_CACHE && name !== VIDEO_CACHE && name !== DATA_CACHE
      );
      await Promise.all(oldCaches.map((name) => caches.delete(name)));
      return self.clients.claim();
    })()
  );
});

// ── Fetch Strategy ──────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const path = url.pathname;

  // API data requests use network-first with cache fallback
  if (path.startsWith('/api/')) {
    event.respondWith(networkFirstWithFallback(event.request, DATA_CACHE));
    return;
  }

  // Video assets use cache-first (large files, never re-fetch if cached)
  if (path.match(/\.(mp4|webm|ogg)$/i)) {
    event.respondWith(cacheFirst(event.request, VIDEO_CACHE));
    return;
  }

  // Static assets use stale-while-revalidate for freshness + speed
  if (path.match(/\.(css|js|json|png|jpg|jpeg|svg|ico)$/i) || path === '/index.html' || path === '/') {
    event.respondWith(staleWhileRevalidate(event.request, STATIC_CACHE));
    return;
  }

  // Everything else: network, fallback to cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ── Cache Strategies ────────────────────────────────────────────────────

/** Cache-first: respond from cache if available, fetch and store otherwise */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      // Don't cache cross-origin videos in the same cache to avoid opaque responses
      if (request.url.startsWith(self.location.origin)) {
        cache.put(request, response.clone());
      }
    }
    return response;
  } catch (err) {
    // If we can't fetch and have no cache, return a fallback
    if (request.destination === 'video') {
      return new Response('', { status: 503 });
    }
    throw err;
  }
}

/** Network-first: try network, fall back to cache, save to cache on success */
async function networkFirstWithFallback(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Ultimate fallback: return empty data in failsafe mode
    return new Response(
      JSON.stringify({
        mode: 'failsafe',
        slug: '',
        template: { video_url: '', text_zones: [] },
        items: [],
        last_updated: null,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/** Stale-while-revalidate: serve cached instantly, update in background */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

// ── Background Sync ─────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-menu-data') {
    event.waitUntil(syncMenuData());
  }
});

async function syncMenuData() {
  const clients = await self.clients.matchAll();
  if (clients.length === 0) return;

  try {
    const response = await fetch('/api/screens/current/data');
    if (response.ok) {
      const data = await response.json();
      const cache = await caches.open(DATA_CACHE);
      await cache.put('/api/screens/current/data', new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
      }));
      // Notify all clients of fresh data
      clients.forEach((client) => {
        client.postMessage({ type: 'DATA_UPDATED', payload: data });
      });
    }
  } catch (err) {
    // Will retry on next sync event
    console.warn('[SW] Background sync failed, will retry:', err);
  }
}

// Handle incoming messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'REGISTER_SLUG') {
    // Store the screen slug for API calls
    self.__slug = event.data.slug;
  }
});