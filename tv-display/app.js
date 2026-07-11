/* ── Menuvo TV Display — Application Logic ───────────────────────────
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

    state.videoElement = els.video;

    // Register service worker
    registerSW();

    // Start connectivity monitoring
    startConnectivityMonitor();

    // Kick off data loading
    loadInitialData().then(() => {
      state.initResolve(true);
    });

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
    const slugParam = params.get('slug');
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
      // Start degrade timer — wait 30s before switching to degraded mode
      clearTimeout(state.modeTimer);
      state.modeTimer = setTimeout(() => {
        if (!state.online && state.mode === 'normal') {
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
      const cache = await caches.open('menuvo-v1-data');
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

    // Render text overlays
    renderTextOverlays(data);

    // Set mode to normal if we have video and data
    if (state.videoLoaded || fromCache) {
      enterNormalMode(fromCache);
    }

    updateConnectivityUI();
    updateDebugBar();
  }

  // ── Mode Management ─────────────────────────────────────────────────
  function enterNormalMode(fromCache) {
    if (state.mode === 'normal') return;
    console.log('[Mode] → Normal' + (fromCache ? ' (from cache)' : ''));
    state.mode = 'normal';
    els.failsafe.classList.add('hidden');
    els.video.style.display = '';
    els.overlay.style.display = '';
    els.modeIndicator.className = 'online';

    if (state.videoElement && state.videoSrc) {
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
    els.video.style.display = 'none';
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
  function renderTextOverlays(data) {
    if (!data || !data.template || !data.template.text_zones) {
      els.overlay.innerHTML = '';
      return;
    }

    const zones = data.template.text_zones;
    const items = data.items || [];
    const container = els.overlay;

    // Clear existing zones
    container.innerHTML = '';

    zones.forEach((zone) => {
      const zoneEl = document.createElement('div');
      zoneEl.className = `text-zone align-${zone.alignment || 'left'}`;
      zoneEl.style.left = (zone.x || 0) + '%';
      zoneEl.style.top = (zone.y || 0) + '%';

      // Width and height
      if (zone.width && zone.width !== 'auto') {
        zoneEl.style.width = (typeof zone.width === 'number' ? zone.width + '%' : zone.width);
      }
      if (zone.height && zone.height !== 'auto') {
        zoneEl.style.height = (typeof zone.height === 'number' ? zone.height + '%' : zone.height);
      }

      // Font family
      if (zone.font_family) {
        zoneEl.style.fontFamily = zone.font_family;
      }

      // Font size from config with min/max range
      const baseFontSize = zone.font_size || 48;
      const minSize = zone.min_font_size || 24;
      const maxSize = zone.max_font_size || 72;

      zoneEl.style.fontSize = baseFontSize + 'px';
      zoneEl.style.color = zone.color || '#ffffff';
      zoneEl.style.fontWeight = zone.font_weight || 'normal';

      // Letter spacing
      if (zone.letter_spacing && zone.letter_spacing !== 'normal') {
        zoneEl.style.letterSpacing = zone.letter_spacing;
      }

      // Text transform
      if (zone.text_transform && zone.text_transform !== 'none') {
        zoneEl.style.textTransform = zone.text_transform;
      }

      // Line height
      if (zone.line_height) {
        zoneEl.style.lineHeight = zone.line_height;
      }

      // Background color
      if (zone.background_color && zone.background_color !== 'transparent') {
        zoneEl.style.backgroundColor = zone.background_color;
        zoneEl.style.padding = zone.padding || '4px 8px';
        zoneEl.classList.add('has-background');
        if (zone.border_radius) {
          zoneEl.style.borderRadius = zone.border_radius;
        }
      }

      // Opacity
      if (zone.opacity !== undefined && zone.opacity < 1) {
        zoneEl.style.opacity = zone.opacity;
      }

      // Padding (only if no background or already handled)
      if ((!zone.background_color || zone.background_color === 'transparent') && zone.padding && zone.padding !== '0') {
        zoneEl.style.padding = zone.padding;
      }

      // Map items to this zone
      const zoneItems = zone.item_ids && zone.item_ids.length > 0
        ? items.filter((item) => zone.item_ids.includes(item.id))
        : items;

      zoneItems.forEach((item, idx) => {
        if (idx > 0) {
          zoneEl.appendChild(document.createElement('br'));
        }

        // Item name span
        const nameSpan = document.createElement('span');
        nameSpan.className = 'item-name';
        nameSpan.textContent = item.name || '';
        zoneEl.appendChild(nameSpan);

        // Price span (if not sold out, show price)
        if (item.availability !== 'sold_out' && item.price) {
          const priceSpan = document.createElement('span');
          priceSpan.className = 'item-price';
          priceSpan.textContent = formatPrice(item.price);
          zoneEl.appendChild(priceSpan);
        }

        // Sold out badge
        if (item.availability === 'sold_out') {
          const badge = document.createElement('span');
          badge.className = 'sold-out-badge';
          badge.textContent = 'SOLD OUT';
          zoneEl.appendChild(badge);
          zoneEl.classList.add('sold-out');
        }
      });

      // Auto-shrink if content overflows
      container.appendChild(zoneEl);
      autoShrink(zoneEl, minSize, maxSize);
    });
  }

  function autoShrink(element, minSize, maxSize) {
    // We need to measure if the element overflows its container
    // Since the element is position: absolute, we check width against max-width
    const parentWidth = els.app ? els.app.offsetWidth : 1920;
    const maxWidth = parentWidth * 0.9; // 90% of screen width
    let fontSize = parseInt(window.getComputedStyle(element).fontSize, 10) || maxSize;

    // Temporarily set white-space: nowrap to measure natural width
    const originalWhiteSpace = element.style.whiteSpace;
    element.style.whiteSpace = 'nowrap';

    // Shrink until fits
    while (element.scrollWidth > maxWidth && fontSize > minSize) {
      fontSize -= 2;
      element.style.fontSize = fontSize + 'px';
    }

    element.style.whiteSpace = originalWhiteSpace;
  }

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
  }

  // ── Window Resize Handler (scale display) ──────────────────────────
  function handleResize() {
    const app = els.app;
    if (!app) return;

    // The CSS handles most of the scaling via viewport units,
    // but we ensure full-viewport coverage
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    const targetRatio = 1920 / 1080; // 16:9

    let appW, appH;
    if (ww / wh > targetRatio) {
      // Window is wider than 16:9
      appH = wh;
      appW = wh * targetRatio;
    } else {
      // Window is taller than 16:9
      appW = ww;
      appH = ww / targetRatio;
    }

    app.style.width = appW + 'px';
    app.style.height = appH + 'px';
    app.style.marginLeft = ((ww - appW) / 2) + 'px';
    app.style.marginTop = ((wh - appH) / 2) + 'px';
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
        if (!state.online && state.mode === 'normal') {
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
    // Push test data for development
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
      items: [
        { id: 'item-1', name: 'Classic Burger', price: 14.99, availability: 'available' },
        { id: 'item-2', name: 'Truffle Fries', price: 8.99, availability: 'available' },
        { id: 'item-3', name: 'Margherita Pizza', price: 16.99, availability: 'sold_out' },
        { id: 'item-4', name: 'Caesar Salad', price: 11.99, availability: 'available' },
        { id: 'item-5', name: 'Grilled Salmon', price: 22.99, availability: 'available' },
        { id: 'item-6', name: 'Chocolate Lava Cake', price: 9.99, availability: 'available' },
      ],
      last_updated: new Date().toISOString(),
    };
    applyScreenData(testData, false);
  };

  // ── Start ───────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('resize', handleResize);

  // Export state for debugging
  window.__state = state;

})();