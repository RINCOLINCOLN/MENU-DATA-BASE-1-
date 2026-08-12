import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'
import SkeletonLoader from './SkeletonLoader'
import api from '../lib/api'

/* ─────────────────────────────────────────────────────────────
   Zone presets & constants (shared vocabulary with the TV PWA)
   ───────────────────────────────────────────────────────────── */
const FONT_FAMILIES = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
  'Playfair Display', 'Oswald', 'Poppins', 'Raleway', 'Merriweather',
  'Ubuntu', 'Lobster', 'Bebas Neue', 'Pacifico', 'Dancing Script',
]

const TEXT_COLORS = [
  { label: 'White', color: '#ffffff' },
  { label: 'Black', color: '#000000' },
  { label: 'Warm Gold', color: '#D4A574' },
  { label: 'Amber', color: '#F6AD55' },
  { label: 'Red', color: '#E53E3E' },
  { label: 'Light Red', color: '#FC8181' },
  { label: 'Green', color: '#22C55E' },
  { label: 'Leaf Green', color: '#48BB78' },
  { label: 'Cream', color: '#FFF8DC' },
  { label: 'Beige', color: '#FAF5EF' },
]

const BG_COLORS = [
  { label: 'None', color: 'transparent' },
  { label: 'Dark', color: 'rgba(10,10,15,0.65)' },
  { label: 'Black 80%', color: 'rgba(0,0,0,0.8)' },
  { label: 'Black 60%', color: 'rgba(0,0,0,0.6)' },
  { label: 'Green', color: '#22543D' },
  { label: 'Green Light', color: '#22C55E' },
  { label: 'Red', color: '#9B2C2C' },
  { label: 'Amber', color: '#744210' },
  { label: 'Warm Gold', color: '#7B5E3B' },
]

const ZONE_TYPES = [
  { value: 'menu_items', label: 'Menu Items', icon: '🍽️', desc: 'Live item list with prices' },
  { value: 'header', label: 'Header / Text', icon: '🔤', desc: 'Heading or free text' },
  { value: 'category_header', label: 'Category Title', icon: '🏷️', desc: 'Bold category heading' },
  { value: 'specials', label: 'Specials', icon: '⭐', desc: 'Featured items, highlighted' },
  { value: 'footer', label: 'Footer', icon: 'ℹ️', desc: 'Hours, tagline, small text' },
]

const SAMPLE_HEADERS = {
  header: 'Brew & Bean Café',
  category_header: 'All Day Favorites',
  footer: 'Open daily 7am – 10pm · est. 2012',
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

/* ─────────────────────────────────────────────────────────────
   NumberField — draft-state controlled numeric input.
   Fixes "can't type into the designer" on tablet/desktop:
   - While focused, the field holds exactly what the user types
     (including empty), so clearing and replacing values works.
   - Commits (clamped) on blur or Enter; Escape reverts; dragging
     zones on the canvas syncs the field when it is not focused.
   ───────────────────────────────────────────────────────────── */
function NumberField({ value, onCommit, min, max, className, step = 1 }) {
  const [draft, setDraft] = useState(String(value))
  const [focused, setFocused] = useState(false)
  const skipCommit = useRef(false)

  // External changes (drag, undo, load) push into the field when idle
  useEffect(() => {
    if (!focused) setDraft(String(value))
  }, [value, focused])

  const commit = () => {
    const raw = parseFloat(draft)
    let v = Number.isNaN(raw) ? (min ?? 0) : raw
    if (typeof min === 'number') v = Math.max(min, v)
    if (typeof max === 'number') v = Math.min(max, v)
    const next = Number.isNaN(raw) ? v : Math.round(v * 100) / 100
    setDraft(String(next))
    if (next !== value) onCommit(next)
  }

  const handleBlur = () => {
    if (skipCommit.current) { skipCommit.current = false; return }
    setFocused(false)
    commit()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
    else if (e.key === 'Escape') {
      e.preventDefault()
      skipCommit.current = true
      setFocused(false)
      setDraft(String(value))
      e.currentTarget.blur()
    }
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      className={className}
      value={draft}
      onFocus={e => { setFocused(true); e.target.select() }}
      onChange={e => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  )
}

function defaultZone(type, index, orientation) {
  const isPortrait = orientation === 'portrait'
  return {
    id: `zone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    type: type || 'menu_items',
    label: type === 'menu_items' ? 'Menu Items' : (SAMPLE_HEADERS[type] || 'Text'),
    x: 5,
    y: isPortrait ? 12 + (index % 4) * 22 : 15 + (index % 3) * 28,
    width: isPortrait ? 90 : 90,
    height: isPortrait ? 18 : 24,
    alignment: type === 'header' || type === 'footer' || type === 'category_header' ? 'center' : 'left',
    font_size: type === 'footer' ? 20 : type === 'category_header' ? 40 : type === 'header' ? 48 : 34,
    min_font_size: 14,
    max_font_size: 64,
    font_weight: type === 'category_header' || type === 'header' ? 'bold' : 'normal',
    font_family: 'Inter',
    color: '#ffffff',
    bg_color: type === 'specials' ? 'rgba(214,158,46,0.25)' : 'transparent',
    is_price: type === 'menu_items',
    category_filter: '',
    item_ids: [],
  }
}

/* Parse template config_json into a flat zones array (any historical shape) */
function parseZones(configJson) {
  if (!configJson) return []
  let parsed = configJson
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { return [] }
  }
  if (Array.isArray(parsed)) return parsed
  if (parsed && Array.isArray(parsed.text_zones)) return parsed.text_zones
  if (parsed && Array.isArray(parsed.zones)) return parsed.zones
  return []
}

/* ─────────────────────────────────────────────────────────────
   Live zone preview — renders exactly what the TV will show
   ───────────────────────────────────────────────────────────── */
function zoneItems(zone, items) {
  if (Array.isArray(zone.item_ids) && zone.item_ids.length > 0) {
    return items.filter(i => zone.item_ids.includes(i.id))
  }
  if (zone.category_filter && zone.category_filter.trim()) {
    const q = zone.category_filter.trim().toLowerCase()
    return items.filter(i => (i.category || '').toLowerCase().includes(q))
  }
  return items
}

function ZoneContent({ zone, items }) {
  const style = {
    fontFamily: zone.font_family || 'Inter',
    fontSize: `${zone.font_size || 34}px`,
    color: zone.color || '#ffffff',
    fontWeight: zone.font_weight || 'normal',
    textAlign: zone.alignment || 'left',
    letterSpacing: zone.letter_spacing || 'normal',
    textTransform: zone.text_transform || 'none',
    lineHeight: zone.line_height || 1.25,
  }
  const isMenu = zone.type === 'menu_items' || zone.type === 'specials'
  const isText = zone.type === 'header' || zone.type === 'footer' || zone.type === 'category_header' || zone.type === 'text'

  if (isMenu) {
    const rows = zoneItems(zone, items)
    return (
      <div className="w-full h-full flex flex-col justify-center overflow-hidden" style={style}>
        {rows.length === 0 ? (
          <div className="opacity-40 italic" style={{ fontSize: '0.55em' }}>
            {zone.type === 'specials' ? '⭐ Specials will appear here' : '🍽️ Menu items will appear here'}
          </div>
        ) : (
          <ul className="space-y-[0.18em]">
            {rows.slice(0, 12).map(item => (
              <li key={item.id} className="flex items-baseline gap-2">
                <span className={`truncate ${item.availability === 'sold_out' ? 'line-through opacity-60' : ''}`}>
                  {item.name}
                  {item.availability === 'sold_out' && (
                    <span className="ml-1.5 text-[0.5em] font-bold tracking-wider bg-red-500/80 text-white px-1.5 py-0.5 rounded align-middle">
                      SOLD OUT
                    </span>
                  )}
                </span>
                {typeof item.price === 'number' && (
                  <span
                    className="ml-auto shrink-0"
                    style={zone.is_price ? { backgroundColor: 'rgba(34,197,94,0.35)', padding: '0.05em 0.35em', borderRadius: '0.25em' } : undefined}
                  >
                    ${Number(item.price).toFixed(2)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // Text-ish zones render their label (sample) live
  const text = zone.label || SAMPLE_HEADERS[zone.type] || 'Sample text'
  return (
    <div className="w-full h-full flex items-center justify-center overflow-hidden" style={style}>
      <span className="truncate">{text}</span>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Main designer
   ───────────────────────────────────────────────────────────── */
export default function ScreenDesigner() {
  const { screenId } = useParams()
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [screen, setScreen] = useState(null)
  const [templates, setTemplates] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [zones, setZones] = useState([])
  const [templateId, setTemplateId] = useState('')      // working background template
  const [selectedId, setSelectedId] = useState(null)
  const [gesture, setGesture] = useState(null)          // {mode:'move'|'resize', id, startX, startY, rect}
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const canvasRef = useRef(null)

  // Load screen + templates + menu items
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [s, t] = await Promise.all([
          api.getScreen(screenId),
          api.getTemplates(),
        ])
        if (cancelled) return
        setScreen(s.screen)
        setTemplateId(s.screen?.template_id || '')
        setTemplates(t.templates || [])
        const template = (t.templates || []).find(tm => tm.id === s.screen?.template_id)
        setZones(parseZones(template?.config_json))
        if (s.screen?.id) {
          const mi = await api.getMenuItems(s.screen.id)
          if (!cancelled) setMenuItems(mi.menu_items || [])
        }
      } catch (err) {
        if (!cancelled) addToast(err.message || 'Could not load screen', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenId])

  const selectedZone = zones.find(z => z.id === selectedId)
  const orientation = screen?.orientation || 'landscape'
  const isPortrait = orientation === 'portrait'
  const workingTemplate = templates.find(t => t.id === templateId) || null
  const categories = useMemo(
    () => [...new Set(menuItems.map(i => i.category).filter(Boolean))].sort(),
    [menuItems]
  )

  /* ── zone mutations ── */
  const updateZone = useCallback((id, patch) => {
    setZones(prev => prev.map(z => (z.id === id ? { ...z, ...patch } : z)))
  }, [])

  const addZone = (type) => {
    const zone = defaultZone(type, zones.length, orientation)
    setZones(prev => [...prev, zone])
    setSelectedId(zone.id)
  }

  const duplicateZone = (id) => {
    setZones(prev => {
      const src = prev.find(z => z.id === id)
      if (!src) return prev
      const copy = { ...src, id: `zone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, x: (src.x || 0) + 4, y: (src.y || 0) + 4 }
      setSelectedId(copy.id)
      return [...prev, copy]
    })
  }

  const deleteZone = (id) => {
    setZones(prev => prev.filter(z => z.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const moveZoneDepth = (id, dir) => {
    setZones(prev => {
      const idx = prev.findIndex(z => z.id === id)
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  const selectTemplate = (id) => {
    setTemplateId(id)
    // Loading a different background replaces the canvas zones with that
    // background's zones — but only if the user has made no local edits yet.
    setZones(prev => {
      if (prev.length > 0) return prev
      const t = templates.find(tm => tm.id === id)
      return parseZones(t?.config_json)
    })
  }

  /* ── drag / resize (Pointer Events unify mouse + touch) ── */
  const startGesture = (e, id, mode) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* noop */ }
    setSelectedId(id)
    // Snapshot the zone at gesture start so resize can scale typography
    // proportionally with the box without drift or clobbering saved values.
    const zone = zones.find(z => z.id === id)
    setGesture({
      mode, id, startX: e.clientX, startY: e.clientY, rect,
      startWidth: zone?.width || 80,
      startHeight: zone?.height || 15,
      startFontSize: zone?.font_size || 34,
      startMinFont: zone?.min_font_size || 14,
      startMaxFont: zone?.max_font_size || 64,
    })
  }

  useEffect(() => {
    if (!gesture) return
    const onMove = (e) => {
      const {
        mode, id, startX, startY, rect,
        startWidth, startHeight, startFontSize, startMinFont, startMaxFont,
      } = gesture
      const dx = ((e.clientX - startX) / rect.width) * 100
      const dy = ((e.clientY - startY) / rect.height) * 100
      if (mode === 'move') {
        setZones(prev => prev.map(z => {
          if (z.id !== id) return z
          const w = z.width || 80
          const h = z.height || 15
          return { ...z, x: clamp((z.x || 0) + dx, 0, 100 - w), y: clamp((z.y || 0) + dy, 0, 100 - h) }
        }))
      } else if (mode === 'resize') {
        setZones(prev => prev.map(z => {
          if (z.id !== id) return z
          const newWidth = clamp((z.width || 80) + dx, 6, 100 - (z.x || 0))
          const newHeight = clamp((z.height || 15) + dy, 3, 100 - (z.y || 0))
          // Scale typography with the box: geometric mean of the linear
          // width/height ratios, bounded by the zone's explicit min/max
          // auto-shrink controls (both preserved from gesture start).
          const scale = Math.sqrt(
            (newWidth / (startWidth || 80)) * (newHeight / (startHeight || 15))
          )
          const lower = Math.min(startMinFont, startMaxFont)
          const upper = Math.max(startMinFont, startMaxFont)
          const newFont = clamp(Math.round((startFontSize || 34) * scale), lower, upper)
          return { ...z, width: newWidth, height: newHeight, font_size: newFont }
        }))
      }
      setGesture(g => (g ? { ...g, startX: e.clientX, startY: e.clientY } : g))
    }
    const onUp = () => setGesture(null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [gesture])

  /* ── save ── */
  const handleSave = async () => {
    if (zones.length === 0 && templateId) {
      addToast('Add at least one zone before saving', 'error')
      return
    }
    setSaving(true)
    try {
      const configJson = JSON.stringify(zones)
      let savedTemplateId = templateId

      if (savedTemplateId) {
        await api.updateTemplate(savedTemplateId, { config_json: configJson })
      } else {
        // No background assigned: create a private solid-background layout
        const created = await api.createTemplate({
          name: `${screen?.name || 'Screen'} Layout`,
          orientation,
          config_json: configJson,
        })
        savedTemplateId = created.template.id
        setTemplateId(savedTemplateId)
      }

      // Assign the background to the screen (covers new-screen / switched cases)
      if (savedTemplateId !== screen?.template_id) {
        await api.updateScreen(screen.id, { template_id: savedTemplateId })
      }

      addToast('Screen layout saved — live on TV within seconds', 'success')
      navigate(`/dashboard/screens/${screen.unique_slug || screenId}`)
    } catch (err) {
      addToast(err.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <SkeletonLoader />
  if (!screen) return <div className="text-center py-12 text-brand-muted">Screen not found</div>

  const aspectRatio = isPortrait ? '9 / 16' : '16 / 9'
  const numInput = 'w-full input-field text-xs'

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] min-h-[640px]">
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-brand-border/50 bg-brand-surface/80 backdrop-blur rounded-xl">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate(`/dashboard/screens/${screen.unique_slug || screenId}`)}
            className="p-2 hover:bg-brand-surface-alt/70 rounded-lg text-brand-muted shrink-0">← Back</button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-brand-text truncate leading-tight">Screen Designer</h1>
            <p className="text-xs text-brand-muted truncate">
              {screen.name} · {orientation} ·{' '}
              {workingTemplate ? `bg: ${workingTemplate.name}` : 'no background yet'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Background template picker */}
          <label className="hidden md:flex items-center gap-1.5 text-xs text-brand-muted">
            Background
            <select className="input-field text-xs w-auto max-w-[180px]" value={templateId}
              onChange={e => selectTemplate(e.target.value)}>
              <option value="">Solid (dark) — create own layout</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} {t.orientation ? `(${t.orientation})` : ''}</option>
              ))}
            </select>
          </label>
          <button onClick={handleSave} disabled={saving}
            className="btn-primary text-sm flex items-center gap-2 touch-manipulation">
            {saving && <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
            {saving ? 'Saving...' : '💾 Save Layout'}
          </button>
        </div>
      </div>

      {/* ── Body: canvas + properties ── */}
      <div className="flex-1 flex flex-col md:flex-row gap-3 mt-3 overflow-hidden min-h-0">
        {/* Canvas */}
        <div className="flex-1 bg-brand-surface rounded-xl border border-brand-border/40 p-3 md:p-4 flex items-center justify-center overflow-auto min-h-0">
          <div
            ref={canvasRef}
            className="relative w-full max-w-[900px] rounded-lg overflow-hidden shadow-2xl select-none touch-none"
            style={{ aspectRatio, backgroundColor: '#0b0b10', backgroundImage: 'radial-gradient(ellipse at 50% 35%, #171720 0%, #0b0b10 70%)' }}
          >
            {/* Background video (designer preview) */}
            {workingTemplate?.video_url ? (
              <video key={workingTemplate.id} className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                src={workingTemplate.video_url} autoPlay muted loop playsInline />
            ) : (
              <div className="absolute inset-0 pointer-events-none opacity-60"
                style={{ backgroundImage: 'radial-gradient(ellipse at 30% 20%, rgba(214,158,46,0.22), transparent 55%), radial-gradient(ellipse at 75% 80%, rgba(139,92,246,0.16), transparent 55%)' }} />
            )}

            {/* Grid */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.07]"
              style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '10% 10%' }} />

            {/* Zones */}
            {zones.map((zone, i) => {
              const selected = zone.id === selectedId
              const zoneBg = zone.bg_color && zone.bg_color !== 'transparent' ? zone.bg_color : undefined
              return (
                <div key={zone.id}
                  onPointerDown={e => startGesture(e, zone.id, 'move')}
                  className={`absolute border-2 cursor-move ${selected ? 'border-amber-400 bg-amber-400/10 ring-2 ring-amber-400/30' : 'border-white/30 hover:border-white/60 bg-black/10'}`}
                  style={{
                    left: `${zone.x || 0}%`,
                    top: `${zone.y || 0}%`,
                    width: `${zone.width || 80}%`,
                    height: `${zone.height || 15}%`,
                    zIndex: i,
                    touchAction: 'none',
                    padding: zoneBg ? '0.4em 0.6em' : '0.3em 0.4em',
                    backgroundColor: zoneBg || 'rgba(0,0,0,0.15)',
                    borderRadius: selected ? '6px' : '4px',
                  }}
                >
                  {/* live preview */}
                  <div className="w-full h-full overflow-hidden pointer-events-none">
                    <ZoneContent zone={zone} items={menuItems} />
                  </div>

                  {/* zone label chip */}
                  <div className={`absolute -top-0 left-0 -translate-y-full px-1.5 py-0.5 rounded-t text-[10px] font-medium whitespace-nowrap ${selected ? 'bg-amber-400 text-black' : 'bg-black/70 text-white/80'}`}>
                    {zone.label || zone.type} · {zone.font_size}px
                  </div>

                  {/* resize handle */}
                  <div
                    onPointerDown={e => startGesture(e, zone.id, 'resize')}
                    className="absolute bottom-0 right-0 w-5 h-5 bg-amber-400 rounded-sm cursor-se-resize shadow"
                    style={{ touchAction: 'none' }}
                  >
                    <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 border-r-2 border-b-2 border-black/70" />
                  </div>
                </div>
              )
            })}

            {zones.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/40 pointer-events-none">
                <div className="text-3xl">🖌️</div>
                <div className="text-sm">Add your first element below to start designing</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Properties panel ── */}
        <div className="w-full md:w-[340px] shrink-0 bg-brand-surface rounded-xl border border-brand-border/40 overflow-y-auto min-h-0">
          <div className="px-4 py-3 border-b border-brand-border/40">
            <h3 className="font-semibold text-brand-text text-sm">Elements</h3>
          </div>

          {/* Add elements */}
          <div className="px-3 py-3 border-b border-brand-border/30 grid grid-cols-1 gap-1.5">
            {ZONE_TYPES.map(t => (
              <button key={t.value} onClick={() => addZone(t.value)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-brand-border/50 hover:border-amber-400/50 hover:bg-amber-400/5 transition-colors text-left touch-manipulation">
                <span className="text-lg">{t.icon}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-brand-text">{t.label}</span>
                  <span className="block text-[10px] text-brand-muted truncate">{t.desc}</span>
                </span>
                <span className="ml-auto text-brand-muted/50 text-xs">＋</span>
              </button>
            ))}
          </div>

          {/* Selected zone properties */}
          {selectedZone ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-brand-text">Zone properties</h4>
                <div className="flex gap-1">
                  <button onClick={() => moveZoneDepth(selectedZone.id, -1)} title="Bring forward" className="w-8 h-8 rounded-lg border border-brand-border/50 text-brand-muted hover:text-brand-text">▲</button>
                  <button onClick={() => moveZoneDepth(selectedZone.id, 1)} title="Send backward" className="w-8 h-8 rounded-lg border border-brand-border/50 text-brand-muted hover:text-brand-text">▼</button>
                  <button onClick={() => duplicateZone(selectedZone.id)} title="Duplicate" className="w-8 h-8 rounded-lg border border-brand-border/50 text-brand-muted hover:text-brand-text">⧉</button>
                  <button onClick={() => deleteZone(selectedZone.id)} title="Delete" className="w-8 h-8 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10">🗑</button>
                </div>
              </div>

              {/* Label / sample text */}
              <div>
                <label className="block text-xs font-medium text-brand-muted mb-1">Label / sample text</label>
                <input className="input-field text-xs" value={selectedZone.label || ''}
                  onChange={e => updateZone(selectedZone.id, { label: e.target.value })} />
              </div>

              {/* Position & size — precise (NumberField: type, clear & replace) */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { key: 'x', label: 'X %', min: 0, max: 100 - (selectedZone.width || 0) },
                  { key: 'y', label: 'Y %', min: 0, max: 100 - (selectedZone.height || 0) },
                  { key: 'width', label: 'W %', min: 6, max: 100 - (selectedZone.x || 0) },
                  { key: 'height', label: 'H %', min: 3, max: 100 - (selectedZone.y || 0) },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-[10px] font-medium text-brand-muted mb-1">{f.label}</label>
                    <NumberField
                      className={numInput}
                      value={selectedZone[f.key] ?? 0}
                      min={f.min}
                      max={f.max}
                      onCommit={v => updateZone(selectedZone.id, { [f.key]: v })}
                    />
                  </div>
                ))}
              </div>

              {/* Typography */}
              <div>
                <label className="block text-xs font-medium text-brand-muted mb-1">Font</label>
                <select className="input-field text-xs" value={selectedZone.font_family || 'Inter'}
                  onChange={e => updateZone(selectedZone.id, { font_family: e.target.value })}
                  style={{ fontFamily: selectedZone.font_family || 'Inter' }}>
                  {FONT_FAMILIES.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                </select>
              </div>

              <div>
                <label className="flex justify-between text-xs font-medium text-brand-muted mb-1">
                  <span>Font size</span><span className="font-mono text-brand-glow">{selectedZone.font_size || 34}px</span>
                </label>
                <input type="range" min="12" max="160" value={selectedZone.font_size || 34}
                  onChange={e => updateZone(selectedZone.id, { font_size: parseInt(e.target.value, 10) })}
                  className="w-full accent-amber-400" />
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className="block text-[10px] text-brand-muted mb-0.5">Min (auto-shrink)</label>
                    <NumberField className={numInput} value={selectedZone.min_font_size || 14} min={8} max={120}
                      onCommit={v => updateZone(selectedZone.id, { min_font_size: v })} />
                  </div>
                  <div>
                    <label className="block text-[10px] text-brand-muted mb-0.5">Max (auto-shrink)</label>
                    <NumberField className={numInput} value={selectedZone.max_font_size || 72} min={8} max={200}
                      onCommit={v => updateZone(selectedZone.id, { max_font_size: v })} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-brand-muted mb-1">Weight</label>
                  <select className="input-field text-xs" value={selectedZone.font_weight || 'normal'}
                    onChange={e => updateZone(selectedZone.id, { font_weight: e.target.value })}>
                    <option value="normal">Normal</option>
                    <option value="bold">Bold</option>
                    <option value="600">Semibold</option>
                    <option value="300">Light</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-brand-muted mb-1">Alignment</label>
                  <select className="input-field text-xs" value={selectedZone.alignment || 'left'}
                    onChange={e => updateZone(selectedZone.id, { alignment: e.target.value })}>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              </div>

              {/* Colors */}
              <div>
                <label className="block text-xs font-medium text-brand-muted mb-1">Text color</label>
                <div className="flex flex-wrap gap-1.5">
                  {TEXT_COLORS.map(c => (
                    <button key={c.color} title={c.label}
                      onClick={() => updateZone(selectedZone.id, { color: c.color })}
                      className={`w-6 h-6 rounded-full border-2 ${selectedZone.color === c.color ? 'border-amber-400 scale-110' : 'border-white/20'} ${c.color === '#ffffff' ? 'shadow-inner' : ''}`}
                      style={{ backgroundColor: c.color }} />
                  ))}
                  <input type="color" className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                    value={/^#[0-9a-fA-F]{6}$/.test(selectedZone.color || '') ? selectedZone.color : '#ffffff'}
                    onChange={e => updateZone(selectedZone.id, { color: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-brand-muted mb-1">Zone background</label>
                <div className="flex flex-wrap gap-1.5">
                  {BG_COLORS.map(c => (
                    <button key={c.label} title={c.label}
                      onClick={() => updateZone(selectedZone.id, { bg_color: c.color === 'transparent' ? '' : c.color })}
                      className={`w-6 h-6 rounded-full border-2 ${(selectedZone.bg_color || '') === (c.color === 'transparent' ? '' : c.color) ? 'border-amber-400 scale-110' : 'border-white/20'}`}
                      style={{ backgroundColor: c.color === 'transparent' ? 'transparent' : c.color, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)' }}>
                      {c.color === 'transparent' && <span className="text-[9px] text-brand-muted font-bold">∅</span>}
                    </button>
                  ))}
                  <input type="color" className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                    value={/^#[0-9a-fA-F]{6}$/.test(selectedZone.bg_color || '') ? selectedZone.bg_color : '#000000'}
                    onChange={e => updateZone(selectedZone.id, { bg_color: e.target.value })} />
                </div>
              </div>

              {/* Menu binding */}
              {(selectedZone.type === 'menu_items' || selectedZone.type === 'specials') && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-brand-muted mb-1">Show by category</label>
                    <select className="input-field text-xs" value={selectedZone.category_filter || ''}
                      onChange={e => updateZone(selectedZone.id, { category_filter: e.target.value })}>
                      <option value="">All categories</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center justify-between text-xs font-medium text-brand-muted mb-1">
                      <span>Show specific items</span>
                      <button onClick={() => updateZone(selectedZone.id, { item_ids: [] })}
                        className="text-[10px] text-amber-400/80 hover:text-amber-400">clear ({selectedZone.item_ids?.length || 0})</button>
                    </label>
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-brand-border/40 divide-y divide-brand-border/20">
                      {menuItems.length === 0 && (
                        <div className="p-3 text-[11px] text-brand-muted/70">No menu items on this screen yet.</div>
                      )}
                      {menuItems.map(item => {
                        const checked = selectedZone.item_ids?.includes(item.id)
                        return (
                          <label key={item.id} className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-brand-surface-alt/60">
                            <input type="checkbox" className="accent-amber-400" checked={!!checked}
                              onChange={() => updateZone(selectedZone.id, {
                                item_ids: checked
                                  ? (selectedZone.item_ids || []).filter(id => id !== item.id)
                                  : [...(selectedZone.item_ids || []), item.id],
                              })} />
                            <span className="text-[11px] text-brand-text/90 truncate flex-1">
                              {item.name}
                              {item.availability === 'sold_out' && <span className="ml-1 text-[9px] text-red-400">SOLD OUT</span>}
                            </span>
                            <span className="text-[11px] text-brand-muted shrink-0">
                              {typeof item.price === 'number' ? `$${Number(item.price).toFixed(2)}` : ''}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}

              <label className="flex items-center gap-2.5 rounded-lg border border-brand-border/40 p-2.5 cursor-pointer">
                <input type="checkbox" className="accent-amber-400" checked={!!selectedZone.is_price}
                  onChange={e => updateZone(selectedZone.id, { is_price: e.target.checked })} />
                <span className="text-xs text-brand-text/85">💰 Highlight prices (green pill)</span>
              </label>
            </div>
          ) : (
            <div className="p-8 text-center text-brand-muted/60 text-sm">
              <div className="text-3xl mb-2">👆</div>
              Tap a zone on the canvas — or add one above — to edit its
              position, size, font and content.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
