/* ── Lumenu TV Display — Application Logic ───────────────────────────
 * Vanilla JS PWA for Android TV kiosk-mode menu boards.
 * Offline-first with three-tier fallback.
 */

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────
  const POLL_INTERVAL_MS = 12 * 1000;        // 12 seconds
  const DEGRADE_AFTER_MS = 30 * 1000;         // 30 seconds offline → degraded
  const WS_RECONNECT_MS = 5 * 1000;           // WebSocket reconnect delay
  const DATA_STALE_MS = 30 * 1000;            // Data considered stale after 30s
  const API_BASE = '/api';
  const WS_BASE = (() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}`;
  })();

  // ── State ──────────────────────────────────────────────────────────────
  const state = {
    slug: null,
    screenData: null,         // Latest full data from API
    cachedData: null,         // Last-known-good data for offline use
    videoSrc: null,
    mode: 'loading',           // 'loading' | 'failsafe' | 'normal' | 'degraded'
    online: navigator.onLine,
    wsConnected: false,
    lastSync: null,            // Timestamp of last successful sync
    modeTimer: null,           // Timer for degrade delay
    pollTimer: null,           // Timer for polling
    reconnectTimer: null,      // Timer for WS reconnect
    ws: null,                  // WebSocket instance
    videoElement: null,
    videoLoaded: false,
    textZones: [],             // Current rendered text zones
    templateConfig: null,      // Parsed template config with text_zone rules
    renderMode: null,          // 'layout' | 'legacy' | null (what the renderer drew)
    bgType: 'video',           // Background type from layout ('video'|'image'|'color'|'none')
    initResolve: null,
    initPromise: null,
  };

  // ── DOM References (set on init) ─────────────────────────────────────
  let els = {};

  // ── Initialization ────────────────────────────────────────────────────
  function init() {
    // Resolve screen slug
    state.slug = resolveSlug();
    if (!state.slug) {
      state.slug = 'demo'; // Default for testing
    }

    state.initPromise = new Promise((resolve) => { state.initResolve = resolve; });

    // Cache DOM references
    els.app = document.getElementById('app');
    els.video = document.getElementById('menu-video');
    els.overlay = document.getElementById('overlay-layer');
    els.background = document.getElementById('layout-background');
    els.failsafe = document.getElementById('failsafe-layer');
    els.loading = document.getElementById('loading-screen');
    els.connectivity = document.getElementById('connectivity-indicator');
    els.connectivityDot = document.getElementById('conn-dot');
    els.connectivityLabel = document.getElementById('conn-label');
    els.modeIndicator = document.getElementById('mode-indicator');
    els.debugBar = document.getElementById('debug-bar');
    els.debugMode = document.getElementById('debug-mode');
    els.debugOnline = document.getElementById('debug-online');
    els.debugData = document.getElementById('debug-data');
    els.debugRender = document.getElementById('debug-render');

    state.videoElement = els.video;
    // Fit the board to the current viewport immediately (the device-width
    // viewport now reports the real window size, so this must run on load).
    handleResize();
    // Engage fullscreen/kiosk where the browser allows it.
    wireFullscreen();

    // Register service worker
    registerSW();

    // Start connectivity monitoring
    startConnectivityMonitor();

    // Kick off data loading
    loadInitialData().then(() => {
      state.initResolve(true);
    });

    // Optional demo override: ?demo=layout|legacy renders sample content
    // (useful for the dashboard preview link and manual testing)
    const demoMode = new URLSearchParams(location.search).get('demo');
    if (demoMode === 'layout' || demoMode === 'legacy') {
      setTimeout(() => {
        if (demoMode === 'layout') window.__simulateLayout();
        else window.__simulateLegacy();
      }, 400);
    }

    // Hide loading screen after timeout in case data never resolves
    setTimeout(() => {
      els.loading.classList.add('hidden');
    }, 8000);

    // Start the main loop
    setupVideoEvents();
    startPolling();
    connectWebSocket();
  }

  // ── Slug Resolution ─────────────────────────────────────────────────
  function resolveSlug() {
    // Check query param ?slug=xxx or URL path /screen/xxx
    const params = new URLSearchParams(location.search);
    const slugParam = params.get('slug') || params.get('screen');
    if (slugParam) return slugParam;

    const match = location.pathname.match(/\/screen\/([^/]+)/);
    if (match) return match[1];

    return null;
  }

  // ── Service Worker Registration ─────────────────────────────────────
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js')
        .then((reg) => {
          console.log('[SW] Registered scope:', reg.scope);

          // Check for updates
          reg.addEventListener('updatefound', () => {
            const newSW = reg.installing;
            newSW.addEventListener('statechange', () => {
              if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available — reload to activate
                console.log('[SW] New version available, reloading...');
                window.location.reload();
              }
            });
          });
        })
        .catch((err) => {
          console.warn('[SW] Registration failed:', err);
        });

      // Listen for SW messages
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'DATA_UPDATED') {
          console.log('[SW] Received data update from background sync');
          applyScreenData(event.data.payload);
        }
      });
    }
  }

  // ── Connectivity Monitor ────────────────────────────────────────────
  function startConnectivityMonitor() {
    window.addEventListener('online', () => {
      console.log('[Conn] Online');
      state.online = true;
      clearTimeout(state.modeTimer);
      // If we were degraded, try to reconnect immediately
      if (state.mode === 'degraded' || state.mode === 'failsafe') {
        attemptRecovery();
      }
      updateConnectivityUI();
    });

    window.addEventListener('offline', () => {
      console.log('[Conn] Offline');
      state.online = false;
      // Start degrade timer — wait 30s before switching to degraded mode.
      // Fire from any non-degraded state that has data (normal OR loading),
      // so screens whose video asset is missing still show the owner dot.
      clearTimeout(state.modeTimer);
      state.modeTimer = setTimeout(() => {
        if (!state.online && state.mode !== 'degraded' && state.mode !== 'failsafe') {
          enterDegradedMode();
        }
      }, DEGRADE_AFTER_MS);
      updateConnectivityUI();
    });

    // Initial check
    updateConnectivityUI();
  }

  function updateConnectivityUI() {
    const dot = els.connectivityDot;
    const label = els.connectivityLabel;

    if (!state.online) {
      dot.className = 'dot red';
      label.textContent = 'OFFLINE';
      els.modeIndicator.className = state.mode === 'failsafe' ? 'failsafe' : 'degraded';
    } else if (state.wsConnected) {
      dot.className = 'dot green';
      label.textContent = 'LIVE';
      els.modeIndicator.className = 'online';
    } else {
      dot.className = 'dot yellow';
      label.textContent = 'SYNCING';
      els.modeIndicator.className = state.mode === 'normal' ? 'online' : 'degraded';
    }

    updateDebugBar();
  }

  // ── Data Loading ────────────────────────────────────────────────────
  async function loadInitialData() {
    // Try to load from cache first for instant display
    const cached = await loadFromCache();
    if (cached) {
      console.log('[Data] Loaded from cache:', cached.mode);
      state.cachedData = cached;
      // Apply cached data immediately (may be failsafe placeholder)
      applyScreenData(cached, true);
    }

    // Then try to fetch fresh data from network
    try {
      const fresh = await fetchScreenData();
      if (fresh) {
        state.cachedData = fresh;
        state.lastSync = Date.now();
        applyScreenData(fresh, false);
        return;
      }
    } catch (err) {
      console.warn('[Data] Network fetch failed, using cache:', err.message);
    }

    // If we had nothing cached and network failed, use failsafe
    if (!cached) {
      enterFailsafeMode();
    }
  }

  async function loadFromCache() {
    if (!('caches' in window)) return null;
    try {
      const cache = await caches.open('lumenu-data');
      const request = new Request(`${API_BASE}/screens/${state.slug}/data`);
      const response = await cache.match(request);
      if (response && response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.warn('[Data] Cache read failed:', err);
    }
    return null;
  }

  async function fetchScreenData() {
    const url = `${API_BASE}/screens/${state.slug}/data`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  }

  // ── Screen Data Application ─────────────────────────────────────────
  function applyScreenData(data, fromCache) {
    state.screenData = data;

    if (!data || data.mode === 'failsafe') {
      enterFailsafeMode();
      return;
    }

    // Update template config
    state.templateConfig = data.template || state.templateConfig;

    // Update video source
    const videoUrl = data.template && data.template.video_url;
    if (videoUrl && videoUrl !== state.videoSrc) {
      state.videoSrc = videoUrl;
      loadVideo(videoUrl);
    }

    // Render overlays — per-screen canvas layout if present, else legacy zones
    state.renderMode = renderOverlays(data);

    // Set mode to normal if we have video and data
    if (state.videoLoaded || fromCache) {
      enterNormalMode(fromCache);
    }

    updateConnectivityUI();
    updateDebugBar();
  }

  // ── Layout / Overlay Rendering ─────────────────────────────────────
  function renderOverlays(data) {
    if (!data || !els.overlay || !window.LumenuLayout) return null;
    state.bgType = detectBgType(data);
    return window.LumenuLayout.render(data, {
      overlay: els.overlay,
      backgroundEl: els.background,
      video: els.video,
    });
  }

  function detectBgType(data) {
    if (!data || !window.LumenuLayout) return 'video';
    const layout = window.LumenuLayout.extractLayout(data);
    if (layout && layout.background && layout.background.type) {
      return layout.background.type;
    }
    return 'video';
  }

  /** Show/hide the <video> based on the active layout background type. */
  function applyBgDisplay() {
    if (!els.video) return;
    if (state.bgType === 'image' || state.bgType === 'color' || state.bgType === 'none') {
      els.video.style.display = 'none';
    } else {
      els.video.style.display = '';
    }
  }

  // ── Mode Management ─────────────────────────────────────────────────
  function enterNormalMode(fromCache) {
    if (state.mode === 'normal') return;
    console.log('[Mode] → Normal' + (fromCache ? ' (from cache)' : ''));
    state.mode = 'normal';
    els.failsafe.classList.add('hidden');
    applyBgDisplay();
    els.overlay.style.display = '';
    els.modeIndicator.className = 'online';

    if (state.videoElement && state.videoSrc && state.bgType !== 'image' && state.bgType !== 'color') {
      state.videoElement.play().catch(() => {});
    }
  }

  function enterDegradedMode() {
    if (state.mode === 'degraded' || state.mode === 'failsafe') return;
    console.log('[Mode] → Degraded (running on cache)');
    state.mode = 'degraded';
    els.modeIndicator.className = 'degraded';
    // Subtle indication only visible on the mode dot at bottom-right
    // Video keeps playing from cache seamlessly
    // Data continues showing last-known-good
    updateConnectivityUI();
  }

  function enterFailsafeMode() {
    console.log('[Mode] → Failsafe (never synced / no data)');
    state.mode = 'failsafe';
    els.failsafe.classList.remove('hidden');
    applyBgDisplay();
    els.overlay.style.display = 'none';
    els.modeIndicator.className = 'failsafe';
    hideLoading();
  }

  // ── Recovery (coming back online) ───────────────────────────────────
  async function attemptRecovery() {
    try {
      const data = await fetchScreenData();
      if (data && data.mode !== 'failsafe') {
        state.cachedData = data;
        state.lastSync = Date.now();
        applyScreenData(data, false);
        console.log('[Recovery] Successfully reconnected');
      }
    } catch (err) {
      console.warn('[Recovery] Failed:', err.message);
      // Stay in degraded mode, retry on next poll
    }
  }

  // ── Video Loading & Loop ────────────────────────────────────────────
  function loadVideo(url) {
    const video = state.videoElement;
    if (!video) return;

    // If same URL already loaded, don't reload
    if (video.getAttribute('data-src') === url && state.videoLoaded) return;

    video.setAttribute('data-src', url);
    state.videoLoaded = false;

    // Set up for seamless loop
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    video.src = url;
    video.load();

    // Handle metadata load
    video.addEventListener('loadedmetadata', function onMeta() {
      video.removeEventListener('loadedmetadata', onMeta);
      console.log('[Video] Metadata loaded, duration:', video.duration);
      state.videoLoaded = true;

      // If we're in failsafe mode but now have video, switch to normal
      if (state.mode === 'failsafe' && state.cachedData) {
        enterNormalMode(true);
      } else if (state.mode === 'loading') {
        // Still loading — we have video, wait for data
      }
    }, { once: true });

    video.addEventListener('canplaythrough', function onReady() {
      video.removeEventListener('canplaythrough', onReady);
      console.log('[Video] Ready to play through');
      state.videoLoaded = true;

      // Start playing
      video.play().catch((err) => {
        console.warn('[Video] Play failed (autoplay blocked?):', err.message);
      });

      hideLoading();
    }, { once: true });

    video.addEventListener('error', function onError(e) {
      video.removeEventListener('error', onError);
      console.error('[Video] Failed to load:', video.error ? video.error.message : 'unknown');
      // Don't enter failsafe — if we have data, stay in degraded with cached data
      if (!state.cachedData) {
        enterFailsafeMode();
      }
    }, { once: true });

    // Gapless loop: when video approaches end, check timing
    // The `loop` attribute handles seamless looping in most browsers,
    // but we add an extra check for the edge case where loop doesn't fire
    video.addEventListener('timeupdate', function onTime() {
      // If we're within 0.5s of the end, ensure loop is smooth
      if (video.duration && video.currentTime > video.duration - 0.5) {
        // The loop attribute handles this, but we're just monitoring
      }
    });

    video.addEventListener('ended', function onEnded() {
      // In case loop attribute doesn't work (rare), restart manually
      video.currentTime = 0;
      video.play().catch(() => {});
    });
  }

  // ── Text Overlay Rendering ──────────────────────────────────────────
  // Overlay rendering now lives in layout-model.js (window.LumenuLayout).
  // It renders the per-screen canvas layout when present, and falls back
  // to the legacy text-zone model (template.text_zones / config_json)
  // otherwise. Kept here for back-compat with older test pages:
  function formatPrice(price) {
    if (typeof price === 'number') {
      return '$' + price.toFixed(2);
    }
    if (typeof price === 'string') {
      return price.startsWith('$') ? price : '$' + price;
    }
    return '';
  }

  // ── Video Events Setup ──────────────────────────────────────────────
  function setupVideoEvents() {
    const video = state.videoElement;
    if (!video) return;

    // Handle stalled playback
    video.addEventListener('stalled', () => {
      console.warn('[Video] Playback stalled, attempting resume');
      setTimeout(() => {
        video.play().catch(() => {});
      }, 1000);
    });

    // Handle waiting (buffering)
    video.addEventListener('waiting', () => {
      console.warn('[Video] Buffering...');
    });

    // Resume when data loaded
    video.addEventListener('canplay', () => {
      if (video.paused && state.online) {
        video.play().catch(() => {});
      }
    });
  }

  // ── Polling (REST fallback for data sync) ───────────────────────────
  function startPolling() {
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => {
      if (state.online) {
        fetchScreenData()
          .then((data) => {
            if (data) {
              state.cachedData = data;
              state.lastSync = Date.now();
              applyScreenData(data, false);
            }
          })
          .catch((err) => {
            console.warn('[Poll] Fetch failed:', err.message);
          });
      }
    }, POLL_INTERVAL_MS);
  }

  // ── WebSocket (instant updates) ─────────────────────────────────────
  function connectWebSocket() {
    if (state.ws) {
      state.ws.close();
    }

    if (!state.online) {
      // Don't try to connect if offline — wait for 'online' event
      return;
    }

    try {
      const wsUrl = `${WS_BASE}/ws/screen/${state.slug}`;
      state.ws = new WebSocket(wsUrl);

      state.ws.addEventListener('open', () => {
        console.log('[WS] Connected');
        state.wsConnected = true;
        updateConnectivityUI();
      });

      state.ws.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WS] Message received:', data.type);

          if (data.type === 'menu_update' || data.type === 'data') {
            if (data.payload) {
              state.cachedData = data.payload;
              state.lastSync = Date.now();
              applyScreenData(data.payload, false);
            }
          }
        } catch (err) {
          console.warn('[WS] Parse error:', err.message);
        }
      });

      state.ws.addEventListener('close', (event) => {
        console.log('[WS] Disconnected (code:', event.code, ')');
        state.wsConnected = false;
        updateConnectivityUI();

        // Attempt reconnect after delay
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = setTimeout(() => {
          connectWebSocket();
        }, WS_RECONNECT_MS);
      });

      state.ws.addEventListener('error', (err) => {
        console.warn('[WS] Error:', err.message || 'unknown');
        state.wsConnected = false;
        updateConnectivityUI();
        // close event will fire after error, triggering reconnect
      });
    } catch (err) {
      console.warn('[WS] Connection failed:', err.message);
      state.wsConnected = false;
      updateConnectivityUI();
    }
  }

  // ── UI Helpers ──────────────────────────────────────────────────────
  function hideLoading() {
    els.loading.classList.add('hidden');
  }

  function updateDebugBar() {
    if (!els.debugBar || els.debugBar.classList.contains('hidden')) return;
    els.debugMode.textContent = state.mode;
    els.debugOnline.textContent = state.online ? 'YES' : 'NO';
    const dataCount = state.screenData && state.screenData.items
      ? state.screenData.items.length
      : 0;
    els.debugData.textContent = dataCount + ' items';
    if (els.debugRender) {
      els.debugRender.textContent = state.renderMode || '—';
    }
  }

  // ── Window Resize Handler (fit the 1920×1080 board to ANY viewport) ──
  function handleResize() {
    const app = els.app;
    if (!app) return;

    // Fit the board to the real viewport: scale down with a single
    // transform so the video, background, and ALL text overlays stay in
    // lockstep at any window size. Letterbox/pillarbox bars fill the rest.
    const D = window.__LUMENU_BOARD || {};   // 1920×1080 design canvas
    const BW = D.width || 1920;
    const BH = D.height || 1080;
    const ww = window.innerWidth || document.documentElement.clientWidth;
    const wh = window.innerHeight || document.documentElement.clientHeight;
    const scale = Math.min(ww / BW, wh / BH);

    app.style.width = BW + 'px';
    app.style.height = BH + 'px';
    app.style.transform = 'scale(' + scale + ')';
    app.style.transformOrigin = 'top left';
    app.style.margin = '0';
    app.style.left = Math.round((ww - BW * scale) / 2) + 'px';
    app.style.top = Math.round((wh - BH * scale) / 2) + 'px';
  }

  // ── Fullscreen / Kiosk Engagement ──────────────────────────────────
  // Hide browser chrome + address bar on TV/kiosk browsers. Degrades
  // gracefully (the full-bleed board still shows) wherever the browser
  // blocks programmatic fullscreen without a user gesture.

  function isFullscreen() {
    const doc = document;
    return !!(doc.fullscreenElement || doc.webkitFullscreenElement ||
              doc.mozFullScreenElement || doc.msFullscreenElement);
  }

  function engageFullscreen() {
    if (isFullscreen()) return; // already fullscreen
    const el = document.documentElement;
    const rfs = el.requestFullscreen ||
                el.webkitRequestFullscreen ||
                el.webkitRequestFullScreen ||
                el.mozRequestFullScreen ||
                el.msRequestFullscreen;
    if (typeof rfs !== 'function') return;
    try {
      const p = rfs.call(el);
      if (p && typeof p.catch === 'function') {
        // Blocked without a real gesture — the "Enter Fullscreen" button is
        // the discoverable fallback for the owner to tap once.
        p.catch(function () {});
      }
    } catch (e) { /* ignore */ }
  }

  function updateFullscreenButton() {
    const btn = document.getElementById('fullscreen-button');
    if (!btn) return;
    if (isFullscreen()) btn.classList.add('hidden');
    else btn.classList.remove('hidden');
  }

  function wireFullscreen() {
    // Auto-attempt (kiosk / TV browser profiles allow this without a gesture).
    window.setTimeout(engageFullscreen, 500);
    window.setTimeout(engageFullscreen, 2000);

    // Engage on the FIRST user interaction (where browsers allow fullscreen)
    // and keep retrying on every subsequent interaction, so re-entering after
    // Esc/F11 always returns to fullscreen.
    ['pointerdown', 'click', 'keydown', 'touchstart'].forEach(function (evt) {
      document.addEventListener(evt, engageFullscreen, { passive: true });
    });

    // Discoverable affordance: a tap on the button (a real user gesture)
    // enters fullscreen even where programmatic auto-fullscreen is blocked.
    const btn = document.getElementById('fullscreen-button');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        engageFullscreen();
      });
    }

    // Re-fit + toggle button visibility + (best-effort) re-engage when
    // fullscreen toggles or the viewport/orientation changes.
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange',
     'MSFullscreenChange'].forEach(function (evt) {
      document.addEventListener(evt, function () {
        window.setTimeout(handleResize, 60);
        updateFullscreenButton();
        if (!isFullscreen()) {
          // Re-request after an unexpected exit (blocked without a gesture
          // in most browsers; the button is the guaranteed fallback).
          window.setTimeout(engageFullscreen, 150);
        }
      });
    });
    ['orientationchange', 'resize'].forEach(function (evt) {
      window.addEventListener(evt, function () {
        window.setTimeout(handleResize, 60);
        updateFullscreenButton();
        window.setTimeout(engageFullscreen, 150);
      });
    });

    // Initial button state.
    updateFullscreenButton();
  }

  // ── Debug Mode Toggle ──────────────────────────────────────────────
  window.__toggleDebug = function () {
    if (els.debugBar) {
      els.debugBar.classList.toggle('hidden');
    }
  };

  window.__toggleOffline = function () {
    // For testing: simulate offline/online toggle
    if (state.online) {
      state.online = false;
      clearTimeout(state.modeTimer);
      state.modeTimer = setTimeout(() => {
        if (!state.online && state.mode !== 'degraded' && state.mode !== 'failsafe') {
          enterDegradedMode();
        }
      }, 2000); // Shortened for testing
    } else {
      state.online = true;
      clearTimeout(state.modeTimer);
      attemptRecovery();
    }
    updateConnectivityUI();
  };

  window.__simulateData = function () {
    // Back-compat: load legacy text-zone test data (kept for old test pages)
    window.__simulateLegacy();
  };

  window.__simulateLegacy = function () {
    const testData = {
      mode: 'normal',
      slug: state.slug,
      template: {
        video_url: state.videoSrc || '',
        text_zones: [
          { id: 'tz-1', x: 5, y: 10, alignment: 'left', font_size: 48, color: '#ffffff', item_ids: [] },
          { id: 'tz-2', x: 5, y: 75, alignment: 'left', font_size: 36, color: '#f6ad55', item_ids: [] },
        ],
      },
      items: makeTestItems(),
      last_updated: new Date().toISOString(),
    };
    applyScreenData(testData, false);
  };

  window.__simulateLayout = function () {
    const testData = {
      mode: 'normal',
      slug: state.slug,
      template: { video_url: state.videoSrc || '' },
      layout: {
        version: 1,
        coords: 'percent',
        width: 1920,
        height: 1080,
        background: {
          type: 'image',
          src: 'assets/fallback.svg',
          fit: 'cover',
          overlay_color: 'rgba(10, 10, 26, 0.55)',
        },
        elements: [
          {
            id: 'header', type: 'text', x: 8, y: 5, width: 84, height: 14,
            z_index: 2, align: 'center', font_family: 'Georgia, serif',
            font_size: 58, font_size_min: 28, font_size_max: 68,
            color: '#f6ad55', letter_spacing: '0.08em',
            text_transform: 'uppercase', text: 'Brew & Bean Café',
          },
          {
            id: 'menu-left', type: 'menu_items', x: 8, y: 26, width: 40, height: 58,
            z_index: 1, align: 'left', font_size: 34, font_size_min: 16, font_size_max: 42,
            color: '#ffffff', background_color: 'rgba(0,0,0,0.35)',
            padding: '16px 20px', border_radius: '10px', item_ids: ['item-1', 'item-3', 'item-4'],
          },
          {
            id: 'menu-right', type: 'menu_items', x: 52, y: 26, width: 40, height: 58,
            z_index: 1, align: 'left', font_size: 30, font_size_min: 16, font_size_max: 40,
            color: '#fefcbf', background_color: 'rgba(0,0,0,0.35)',
            padding: '16px 20px', border_radius: '10px', category: 'Specials',
          },
          {
            id: 'footer', type: 'text', x: 8, y: 88, width: 84, height: 8,
            z_index: 2, align: 'center', font_size: 24, font_size_min: 14, font_size_max: 30,
            color: '#a0aec0', text: 'Open Daily 7am – 9pm  ·  Fresh Roasted Coffee',
          },
          {
            id: 'accent', type: 'shape', x: 8, y: 20, width: 84, height: 4,
            z_index: 1, shape: 'rectangle', fill: 'rgba(246, 173, 85, 0.7)',
            border_radius: '2px',
          },
        ],
      },
      items: makeTestItems(),
      last_updated: new Date().toISOString(),
    };
    applyScreenData(testData, false);
  };

  function makeTestItems() {
    return [
      { id: 'item-1', name: 'Classic Burger', price: 14.99, availability: 'available', category: 'Lunch' },
      { id: 'item-2', name: 'Truffle Fries', price: 8.99, availability: 'available', category: 'Lunch' },
      { id: 'item-3', name: 'Margherita Pizza', price: 16.99, availability: 'sold_out', category: 'Lunch' },
      { id: 'item-4', name: 'Caesar Salad', price: 11.99, availability: 'available', category: 'Lunch' },
      { id: 'item-5', name: 'Grilled Salmon', price: 22.99, availability: 'available', category: 'Specials' },
      { id: 'item-6', name: 'Chocolate Lava Cake', price: 9.99, availability: 'available', category: 'Specials' },
    ];
  }

  // ── Start ───────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', function () {
    window.setTimeout(handleResize, 120);
  });
  // visualViewport can report a fractional / account-for-browser-chrome size.
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleResize);
  }

  // Export state for debugging
  window.__state = state;

})();