/* ── Lumenu TV Display — Layout Model & Renderer ──────────────────────
 * Consumes the per-screen canvas layout model persisted by the backend:
 * a background + independently positioned/resized elements (text, menu
 * items, images, shapes) with z-index and visibility.
 *
 * The renderer is intentionally DEFENSIVE: it accepts the layout object
 * from any plausible location in the screen-data payload (top-level
 * `layout`, `screen.layout`, `screen.config_json.layout`, template
 * config, etc.) and falls back to the legacy text-zone model when no
 * layout exists — so existing screens/templates keep working unchanged.
 *
 * Vanilla JS — no framework, safe for low-end Android TV boxes.
 * See LAYOUT_MODEL.md for the full contract.
 */

(function (global) {
  'use strict';

  var DEFAULT_CANVAS = { width: 1920, height: 1080 };

  // ── Small utilities ─────────────────────────────────────────────────

  function tryParse(v) {
    if (v == null) return null;
    if (typeof v === 'object') return v;
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch (e) { return null; }
    }
    return null;
  }

  function isObj(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  /**
   * Normalize a position/size value to a percentage of the canvas.
   *   number 0..1          → fraction (×100)
   *   number 1..100        → percent
   *   "12.5%"              → percent
   *   "240px"              → px relative to canvas dimension
   * If the layout declares "coords":"percent", numbers are percents.
   */
  function toPercent(v, canvas, coords) {
    if (v == null || v === 'auto') return undefined;
    var cw = canvas && canvas.width ? canvas.width : DEFAULT_CANVAS.width;
    if (typeof v === 'number') {
      if (coords === 'percent') return v;
      return v <= 1 ? v * 100 : v;
    }
    if (typeof v === 'string') {
      var s = v.trim();
      if (s === 'auto') return undefined;
      if (s.slice(-1) === '%') return parseFloat(s);
      if (s.slice(-2) === 'px') return (parseFloat(s) / cw) * 100;
      var n = parseFloat(s);
      if (!isNaN(n)) return coords === 'percent' ? n : (n <= 1 ? n * 100 : n);
    }
    return undefined;
  }

  function clamp(n, min, max) {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  }

  function formatPrice(price) {
    if (typeof price === 'number') return '$' + price.toFixed(2);
    if (typeof price === 'string') return price.indexOf('$') === 0 ? price : '$' + price;
    return '';
  }

  function cssAlign(align) {
    var a = String(align || 'left').toLowerCase();
    if (a === 'center') return 'center';
    if (a === 'right') return 'right';
    return 'left';
  }

  // ── Layout extraction (defensive) ────────────────────────────────────

  function looksLikeLayout(c) {
    return isObj(c) && (Array.isArray(c.elements) || isObj(c.background));
  }

  /**
   * Find the per-screen layout object in the screen-data payload.
   * Tries, in order:
   *   1. data.layout
   *   2. data.screen.layout (object or JSON string)
   *   3. data.screen.config_json.layout  /  config_json itself if a layout
   *   4. data.layout_json
   *   5. template config_json.layout (template-level layout fallback)
   */
  function extractLayout(data) {
    if (!isObj(data)) return null;
    var candidates = [];

    if (isObj(data.layout)) candidates.push(data.layout);
    if (isObj(data.screen)) {
      if (isObj(data.screen.layout)) candidates.push(data.screen.layout);
      else if (typeof data.screen.layout === 'string') {
        var sl = tryParse(data.screen.layout);
        if (sl) candidates.push(sl);
      }
      var sc = tryParse(data.screen.config_json);
      if (sc) {
        if (isObj(sc.layout)) candidates.push(sc.layout);
        else if (looksLikeLayout(sc)) candidates.push(sc);
      }
    }
    if (data.layout_json) {
      var lj = tryParse(data.layout_json);
      if (lj) candidates.push(lj);
    }
    if (isObj(data.template)) {
      var tc = tryParse(data.template.config_json);
      if (tc && isObj(tc.layout)) candidates.push(tc.layout);
      if (data.template.layout) candidates.push(data.template.layout);
    }

    for (var i = 0; i < candidates.length; i++) {
      var norm = normalizeLayout(candidates[i]);
      if (norm && norm.elements && norm.elements.length) return norm;
    }
    return null;
  }

  /**
   * Extract legacy text zones (pre-layout model). Accepts:
   *   template.text_zones                    (array, preferred)
   *   template.config_json                   (array of zones)
   *   template.config_json.zones             (array)
   *   template.config_json.text_zones        (array)
   * Zones are de-duplicated by id because the API may expose the same
   * zones as both template.text_zones and template.config_json.
   */
  function extractLegacyZones(data) {
    if (!isObj(data) || !isObj(data.template)) return null;
    var t = data.template;
    var zones = [];

    if (Array.isArray(t.text_zones) && t.text_zones.length) {
      zones = zones.concat(t.text_zones);
    }

    var c = tryParse(t.config_json);
    if (c) {
      if (Array.isArray(c) && !zones.length) zones = zones.concat(c);
      if (Array.isArray(c.zones) && !zones.length) zones = zones.concat(c.zones);
      if (Array.isArray(c.text_zones) && !zones.length) zones = zones.concat(c.text_zones);
    }

    var seen = {};
    var out = [];
    zones.forEach(function (z) {
      if (!isObj(z)) return;
      var key = z.id || JSON.stringify(z);
      if (seen[key]) return;
      seen[key] = true;
      out.push(z);
    });
    return out.length ? out : null;
  }

  // ── Normalization ────────────────────────────────────────────────────

  function normalizeLayout(raw) {
    if (!isObj(raw)) return null;
    var layout = {
      version: raw.version || 1,
      coords: raw.coords || raw.coord_system || null,
      width: raw.width || DEFAULT_CANVAS.width,
      height: raw.height || DEFAULT_CANVAS.height,
      background: isObj(raw.background) ? raw.background : null,
      elements: Array.isArray(raw.elements) ? raw.elements : [],
    };
    return layout;
  }

  /**
   * Designer zone types that are text-only (never bind menu items unless
   * the zone has an explicit binding).
   */
  var DESIGNER_TEXT_TYPES = ['header', 'category_header', 'footer', 'text'];
  var DESIGNER_MENU_TYPES = ['menu_items', 'specials', 'menu'];

  /**
   * Determine the coordinate unit for a zone deterministically.
   * Designer-authored zones (dashboard Screen Designer) always use
   * PERCENT 0-100; legacy seed zones use FRACTIONS 0-1. Distinguish by
   * structural markers so pixel-consistent rendering never depends on a
   * value heuristic (a designer zone at x=0.5 is 0.5%, a legacy zone at
   * x=0.5 is 50%).
   * Returns 'percent' | 'fraction' | null (null → auto-detect per value).
   */
  function unitForZone(z) {
    if (!isObj(z)) return null;
    if (z.coords === 'percent' || z.coords === 'fraction') return z.coords;
    var t = z.type || '';
    if (DESIGNER_TEXT_TYPES.indexOf(t) !== -1 || DESIGNER_MENU_TYPES.indexOf(t) !== -1) return 'percent';
    if (z.alignment || z.min_font_size || z.max_font_size || z.bg_color ||
        z.category_filter || z.is_price !== undefined || z.font_size != null) {
      return 'percent';
    }
    return null; // legacy shape → auto-detect (<=1 treated as fraction)
  }

  /**
   * Convert legacy text zones into layout elements so the same renderer
   * path handles both models. Accepts BOTH the legacy seed shape
   * ({x:0.04, align, font_size_min, font_size_max}) and the dashboard
   * Screen Designer shape ({x:5, alignment, min_font_size, max_font_size,
   * bg_color, category_filter, is_price, type}) — see LAYOUT_MODEL.md.
   */
  function legacyZonesToElements(zones, items) {
    items = items || [];
    return zones.map(function (z, i) {
      var type = z.type || '';
      var hasBinding = (Array.isArray(z.item_ids) && z.item_ids.length > 0) ||
        !!z.category_filter || !!z.category || !!z.text_zone_id;
      var zoneItems = hasBinding
        ? bindItems({
            item_ids: z.item_ids, category: z.category_filter || z.category,
            text_zone_id: z.text_zone_id
          }, items)
        : items;

      var isTextOnly;
      if (DESIGNER_TEXT_TYPES.indexOf(type) !== -1 && !hasBinding) {
        isTextOnly = true;                    // designer header/footer/category/text
      } else if (DESIGNER_MENU_TYPES.indexOf(type) !== -1) {
        isTextOnly = false;                   // designer menu/specials
      } else {
        isTextOnly = !hasBinding && zoneItems.length === 0 &&
          (z.label || type === 'header' || type === 'category_header' || type === 'footer');
      }
      return {
        id: z.id || 'legacy-zone-' + i,
        type: isTextOnly ? 'text' : 'menu_items',
        x: z.x, y: z.y, width: z.width, height: z.height,
        coords: unitForZone(z),               // deterministic unit, not value heuristic
        z_index: i,
        align: z.align || z.alignment || 'left',
        font_size: z.font_size,
        font_size_min: z.min_font_size || z.font_size_min,
        font_size_max: z.max_font_size || z.font_size_max,
        font_family: z.font_family,
        font_weight: z.font_weight,
        color: z.color,
        letter_spacing: z.letter_spacing,
        text_transform: z.text_transform,
        line_height: z.line_height,
        background_color: z.background_color || z.bg_color,
        padding: z.padding,
        border_radius: z.border_radius,
        opacity: z.opacity,
        text: z.label || '',
        item_ids: z.item_ids || [],
        category: z.category_filter || z.category,
        text_zone_id: z.text_zone_id,
        show_price: z.is_price === false ? false : undefined,
      };
    });
  }

  // ── Rendering ────────────────────────────────────────────────────────

  /**
   * Render everything for the given screen data.
   * ctx: { overlay, backgroundEl, video, items }
   * Returns 'layout' | 'legacy' | null (what was rendered).
   */
  function render(data, ctx) {
    if (!ctx || !ctx.overlay) return null;
    var items = Array.isArray(data.items) ? data.items : (Array.isArray(data.menu_items) ? data.menu_items : []);
    var layout = extractLayout(data);
    var rendered = null;

    if (layout) {
      rendered = renderLayout(layout, items, ctx);
    } else {
      var zones = extractLegacyZones(data);
      if (zones) {
        var elements = legacyZonesToElements(zones, items);
        rendered = renderLayout(normalizeLayout({ elements: elements }), items, ctx);
        rendered = 'legacy';
      } else {
        // No layout, no zones — clear overlays and keep video background
        ctx.overlay.innerHTML = '';
        applyBackground(null, ctx);
        rendered = null;
      }
    }
    return rendered;
  }

  function renderLayout(layout, items, ctx) {
    ctx.overlay.innerHTML = '';
    applyBackground(layout.background, ctx);

    var canvas = { width: layout.width, height: layout.height };
    var elements = layout.elements.slice().sort(function (a, b) {
      return (a.z_index || 0) - (b.z_index || 0);
    });

    var prevCoords = ctx.coords;
    ctx.coords = layout.coords || null;
    try {
      elements.forEach(function (el) {
        if (el.visible === false) return;
        renderElement(el, items, canvas, ctx);
      });
    } finally {
      ctx.coords = prevCoords;
    }

    return 'layout';
  }

  function renderElement(el, items, canvas, ctx) {
    var div = document.createElement('div');
    div.className = 'layout-element lx-' + (el.type || 'text');
    if (el.id) div.setAttribute('data-el-id', el.id);

    var coords = el.coords || ctx.coords; // may be null → auto-detect per value
    var x = toPercent(el.x, canvas, coords);
    var y = toPercent(el.y, canvas, coords);
    var w = toPercent(el.width, canvas, coords);
    var h = toPercent(el.height, canvas, coords);

    if (x != null) div.style.left = x + '%';
    if (y != null) div.style.top = y + '%';
    if (w != null) div.style.width = w + '%';
    if (h != null) div.style.height = h + '%';
    div.style.zIndex = String(el.z_index || 0);
    if (el.opacity != null && el.opacity < 1) div.style.opacity = el.opacity;
    if (el.rotation) div.style.transform = 'rotate(' + el.rotation + 'deg)';
    div.style.textAlign = cssAlign(el.align);

    var type = el.type || 'text';
    if (type === 'menu_items' || type === 'menu') {
      renderMenuItemsElement(el, div, items);
    } else if (type === 'image') {
      renderImageElement(el, div);
    } else if (type === 'shape') {
      renderShapeElement(el, div);
    } else {
      renderTextElement(el, div);
    }

    ctx.overlay.appendChild(div);
  }

  function applyBoxStyles(el, div) {
    if (el.background_color && el.background_color !== 'transparent') {
      div.style.backgroundColor = el.background_color;
      div.style.padding = el.padding || '4px 8px';
      div.style.borderRadius = el.border_radius || '0px';
      div.classList.add('has-background');
    } else if (el.padding) {
      div.style.padding = el.padding;
    }
    if (el.border) div.style.border = el.border;
  }

  function applyTextStyles(el, div) {
    if (el.font_family) div.style.fontFamily = el.font_family;
    if (el.font_weight) div.style.fontWeight = el.font_weight;
    if (el.font_style && el.font_style !== 'normal') div.style.fontStyle = el.font_style;
    if (el.color) div.style.color = el.color;
    if (el.letter_spacing && el.letter_spacing !== 'normal') div.style.letterSpacing = el.letter_spacing;
    if (el.text_transform && el.text_transform !== 'none') div.style.textTransform = el.text_transform;
    if (el.line_height) div.style.lineHeight = el.line_height;

    var base = el.font_size || el.font_size_max || 48;
    var min = el.font_size_min || 20;
    var max = el.font_size_max || 72;
    base = clamp(base, min, max);
    div.style.fontSize = base + 'px';
  }

  function renderTextElement(el, div) {
    div.textContent = el.text || el.label || '';
    applyTextStyles(el, div);
    applyBoxStyles(el, div);
    if (el.text) {
      requestFit(div, el, el.text);
    }
  }

  function renderImageElement(el, div) {
    div.style.backgroundImage = el.src ? 'url("' + el.src + '")' : 'none';
    div.style.backgroundSize = el.object_fit || el.fit || 'contain';
    div.style.backgroundRepeat = 'no-repeat';
    div.style.backgroundPosition = 'center';
    if (el.background_color && el.background_color !== 'transparent') {
      div.style.backgroundColor = el.background_color;
    }
  }

  function renderShapeElement(el, div) {
    div.classList.add('lx-shape');
    div.style.backgroundColor = el.fill || el.background_color || 'transparent';
    if ((el.shape || 'rectangle') === 'circle' || el.border_radius === '50%') {
      div.style.borderRadius = '50%';
    } else if (el.border_radius) {
      div.style.borderRadius = el.border_radius;
    }
    if (el.border) div.style.border = el.border;
  }

  function bindItems(el, items) {
    if (Array.isArray(el.item_ids) && el.item_ids.length) {
      return items.filter(function (it) { return el.item_ids.indexOf(it.id) !== -1; });
    }
    if (el.text_zone_id) {
      return items.filter(function (it) { return it.text_zone_id === el.text_zone_id; });
    }
    // category_filter is the Screen Designer's field (substring, case-
    // insensitive — matches the designer's live preview); `category` is the
    // legacy exact-match alias.
    var filter = el.category_filter || el.category;
    if (filter) {
      var q = String(filter).trim().toLowerCase();
      if (q) return items.filter(function (it) { return String(it.category || '').toLowerCase().indexOf(q) !== -1; });
    }
    return items;
  }

  function renderMenuItemsElement(el, div, items) {
    applyTextStyles(el, div);
    applyBoxStyles(el, div);
    div.classList.add('menu-list');
    if (el.align === 'center') div.classList.add('menu-center');

    var bound = bindItems(el, items);
    if (!bound.length && el.text) {
      div.textContent = el.text;
      return;
    }
    bound.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'menu-row' + (item.availability === 'sold_out' ? ' sold-out-row' : '');

      var nameSpan = document.createElement('span');
      nameSpan.className = 'menu-row-name';
      nameSpan.textContent = item.name || '';
      row.appendChild(nameSpan);

      if (el.show_price !== false && item.availability !== 'sold_out' && item.price != null) {
        var priceSpan = document.createElement('span');
        priceSpan.className = 'menu-row-price';
        priceSpan.textContent = formatPrice(item.price);
        row.appendChild(priceSpan);
      }

      if (el.sold_out_badge !== false && item.availability === 'sold_out') {
        var badge = document.createElement('span');
        badge.className = 'sold-out-badge';
        badge.textContent = 'SOLD OUT';
        row.appendChild(badge);
      }

      if (el.show_description && item.description) {
        var desc = document.createElement('div');
        desc.className = 'menu-row-desc';
        desc.textContent = item.description;
        row.appendChild(desc);
      }

      div.appendChild(row);
    });

    requestFit(div, el, bound);
  }

  // ── Auto-shrink ──────────────────────────────────────────────────────

  function requestFit(div, el, content) {
    if (!content || (Array.isArray(content) && !content.length)) return;
    // Defer to after layout so clientHeight/scrollHeight are measurable.
    requestAnimationFrame(function () {
      var base = el.font_size || 48;
      var min = el.font_size_min || 20;
      var max = el.font_size_max || 72;
      var size = clamp(base, min, max);
      div.style.fontSize = size + 'px';
      var guard = 0;
      while (guard++ < 60) {
        var overflowH = div.clientHeight > 0 && div.scrollHeight > div.clientHeight + 1;
        var overflowW = div.clientWidth > 0 && div.scrollWidth > div.clientWidth + 1;
        if ((!overflowH && !overflowW) || size <= min) break;
        size = Math.max(min, size - 2);
        div.style.fontSize = size + 'px';
      }
    });
  }

  // ── Background ───────────────────────────────────────────────────────

  function applyBackground(bg, ctx) {
    var video = ctx.video;
    var bgEl = ctx.backgroundEl;
    if (!bgEl) return;

    bgEl.innerHTML = '';
    bgEl.classList.add('hidden');
    bgEl.style.cssText = '';

    var type = (bg && bg.type) || 'video';
    if (type === 'video' || type === 'none' || !bg) {
      if (video) video.style.display = '';
      return;
    }

    if (video) video.style.display = 'none';
    bgEl.classList.remove('hidden');

    if (type === 'image' && bg.src) {
      bgEl.style.backgroundImage = 'url("' + bg.src + '")';
      bgEl.style.backgroundSize = bg.fit || 'cover';
      bgEl.style.backgroundPosition = 'center';
      bgEl.style.backgroundRepeat = 'no-repeat';
    } else if (bg.color) {
      bgEl.style.backgroundColor = bg.color;
    }

    if (bg.overlay_color) {
      var ov = document.createElement('div');
      ov.className = 'layout-bg-overlay';
      ov.style.backgroundColor = bg.overlay_color;
      bgEl.appendChild(ov);
    }
  }

  // ── Export ───────────────────────────────────────────────────────────

  global.LumenuLayout = {
    extractLayout: extractLayout,
    extractLegacyZones: extractLegacyZones,
    normalizeLayout: normalizeLayout,
    legacyZonesToElements: legacyZonesToElements,
    render: render,
    renderLayout: renderLayout,
    toPercent: toPercent,
    formatPrice: formatPrice,
    DEFAULT_CANVAS: DEFAULT_CANVAS,
  };

})(typeof window !== 'undefined' ? window : globalThis);
