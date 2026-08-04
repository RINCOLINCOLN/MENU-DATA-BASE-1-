import { useState, useRef, useEffect } from 'react'

/**
 * TemplatePreview — renders a clear, schematic "mini TV" example of a menu
 * template. Templates with text-zone configs get a faithful layout mockup with
 * their zones positioned exactly where they will appear on the real board.
 * Video-only templates keep the live video preview; templates with neither
 * show a clean starter example.
 */
export default function TemplatePreview({ template }) {
  const zones = parseConfig(template?.config_json)
  const portrait = template?.orientation === 'portrait'

  if (zones.length > 0) {
    return <ZoneSchematic zones={zones} portrait={portrait} />
  }
  if (template?.video_url) {
    return <VideoPreview template={template} portrait={portrait} />
  }
  return <ZoneSchematic zones={[]} portrait={portrait} />
}

/* ── Config parsing ─────────────────────────────────────────────── */

function parseConfig(configJson) {
  if (!configJson) return []
  let parsed = configJson
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { return [] }
  }
  const raw = Array.isArray(parsed) ? parsed : parsed?.zones
  if (!Array.isArray(raw)) return []
  return raw
    .filter(z => z && typeof z === 'object')
    .map(normalizeZone)
    .filter(z => z.width > 0 && z.height > 0)
}

/** Seed configs store x/y/width/height as 0–1 fractions; the zone editor
 *  stores them as 0–100 percentages. Normalize to percentages either way. */
function toPercent(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback
  const n = Number(v)
  if (Number.isNaN(n)) return fallback
  return n <= 1 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10
}

function normalizeZone(z) {
  return {
    ...z,
    x: toPercent(z.x, 5),
    y: toPercent(z.y, 5),
    width: toPercent(z.width, 90),
    height: toPercent(z.height, 15),
    alignment: z.alignment || z.align || 'left',
    color: z.color || '#ffffff',
    fontFamily: z.font_family || 'Inter, sans-serif',
    fontWeight: z.font_weight || 'normal',
    label: z.label || z.id || 'Text zone',
    type: (z.type || '').toLowerCase(),
    isPrice: !!z.is_price,
  }
}

/* ── Sample content ─────────────────────────────────────────────── */

const SAMPLE_MENU = [
  { name: 'Espresso', price: '3.50' },
  { name: 'Latte', price: '4.75' },
  { name: 'Cold Brew', price: '4.50' },
  { name: 'Matcha Latte', price: '5.25' },
]

const SAMPLE_SPECIALS = [
  { name: 'Avocado Toast', price: '8.50', soldOut: true },
  { name: 'Smoothie Bowl', price: '9.00' },
]

const SAMPLE_CENTERED = [
  { name: 'House Old Fashioned', price: '14.00' },
  { name: 'Espresso Martini', price: '15.00' },
  { name: 'Negroni', price: '13.00' },
  { name: 'Draft IPA', price: '7.50' },
]

function zoneKind(zone) {
  const hay = `${zone.type} ${zone.id} ${zone.label}`.toLowerCase()
  if (hay.includes('special')) return 'specials'
  if (
    hay.includes('header') || hay.includes('tagline') ||
    hay.includes('title') || hay.includes('restaurant')
  ) return 'header'
  return 'menu'
}

function ZoneContent({ zone, kind }) {
  const align = zone.alignment === 'center' ? 'center' : zone.alignment === 'right' ? 'right' : 'left'

  if (kind === 'header') {
    const isTagline = `${zone.id} ${zone.label}`.toLowerCase().includes('tagline')
    return (
      <div className="w-full h-full flex flex-col items-center justify-center px-1">
        <div
          className="font-bold uppercase leading-tight truncate w-full text-center"
          style={{
            color: zone.color || '#F6AD55',
            fontSize: zone.height <= 10 ? 9 : 12,
            letterSpacing: '0.12em',
            fontFamily: zone.fontFamily,
          }}
        >
          {isTagline ? 'HAPPY HOUR · 4–7PM' : 'BREW & BEAN CAFÉ'}
        </div>
        {!isTagline && (
          <div className="text-[6px] uppercase tracking-[0.25em] mt-0.5 truncate w-full text-center text-brand-glow/70">
            Est. 2015 · Fresh daily
          </div>
        )}
      </div>
    )
  }

  const items = kind === 'specials'
    ? SAMPLE_SPECIALS
    : (zone.height >= 40 || zone.width >= 60 ? SAMPLE_MENU : SAMPLE_CENTERED)

  const lineHeight = Math.max(7, Math.min(11, zone.height * 0.24))

  return (
    <div className="w-full h-full overflow-hidden px-1.5 py-1">
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-baseline gap-1" style={{ lineHeight: `${lineHeight + 3}px` }}>
            <span
              className="truncate"
              style={{
                color: zone.color || '#F5F0E8',
                fontSize: lineHeight,
                fontFamily: zone.fontFamily,
                fontWeight: zone.fontWeight,
              }}
            >
              {item.name}
            </span>
            <span className="flex-1 border-b border-dotted border-white/25 min-w-1" />
            <span
              className="font-semibold shrink-0"
              style={{
                color: zone.color || '#F5F0E8',
                fontSize: lineHeight,
                fontFamily: zone.fontFamily,
              }}
            >
              {item.soldOut
                ? <span className="inline-flex items-center gap-1">
                    <span className="text-red-400">SOLD</span>
                    <span className="text-red-400 font-bold">OUT</span>
                  </span>
                : `$${item.price}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Schematic preview (zones) ──────────────────────────────────── */

function ZoneSchematic({ zones, portrait }) {
  return (
    <div className={`relative w-full overflow-hidden bg-brand-bg ${portrait ? 'aspect-[9/16] mx-auto max-h-52' : 'aspect-video'}`}>
      <PreviewBackdrop portrait={portrait} />

      {zones.length > 0 ? (
        zones.map((zone, i) => {
          const kind = zoneKind(zone)
          return (
            <div
              key={zone.id || i}
              className="absolute rounded-md overflow-hidden"
              style={{
                left: `${zone.x}%`,
                top: `${zone.y}%`,
                width: `${zone.width}%`,
                height: `${zone.height}%`,
                zIndex: i + 1,
                border: '1px dashed rgba(167,139,250,0.45)',
                background: zone.isPrice
                  ? 'rgba(34,197,94,0.10)'
                  : 'rgba(139,92,246,0.07)',
              }}
            >
              {/* Zone label chip */}
              <div className="absolute left-0.5 top-0.5 z-10 max-w-[75%]">
                <span className="inline-block max-w-full truncate rounded bg-black/55 px-1 py-px text-[6.5px] font-semibold uppercase tracking-[0.1em] text-brand-glow border border-brand-border/60">
                  {zone.label}
                </span>
              </div>
              <div className="w-full h-full" style={{ textAlign: zone.alignment === 'center' ? 'center' : 'left' }}>
                <ZoneContent zone={zone} kind={kind} />
              </div>
            </div>
          )
        })
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center">
          <div className="w-full max-w-[75%] rounded-lg border-2 border-dashed border-brand-border/80 px-3 py-2">
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-brand-glow mb-1">
              Your Menu Here
            </div>
            <div className="space-y-1">
              {SAMPLE_MENU.slice(0, 3).map((item, i) => (
                <div key={i} className="flex items-baseline gap-1 text-[8px] text-brand-text/80">
                  <span className="truncate">{item.name}</span>
                  <span className="flex-1 border-b border-dotted border-white/20" />
                  <span>${item.price}</span>
                </div>
              ))}
            </div>
          </div>
          <span className="rounded-full bg-brand-surface/80 border border-brand-border/70 px-2 py-0.5 text-[7.5px] text-brand-muted">
            No text zones yet — click “Edit Zones” to place text areas
          </span>
        </div>
      )}

      <div className="absolute bottom-1 right-2 text-[6px] font-semibold tracking-[0.3em] text-brand-glow/45 pointer-events-none">
        LUMENU
      </div>
    </div>
  )
}

function PreviewBackdrop({ portrait }) {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 8%, rgba(139,92,246,0.20) 0%, rgba(139,92,246,0) 55%),' +
            'linear-gradient(160deg, #1E1830 0%, #0B0812 55%, #151122 100%)',
        }}
      />
      {/* Guide grid */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(245,240,232,0.5) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(245,240,232,0.5) 1px, transparent 1px)',
          backgroundSize: '12.5% 12.5%',
        }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(90% 90% at 50% 50%, transparent 60%, rgba(5,3,10,0.55) 100%)' }}
      />
    </>
  )
}

/* ── Live video preview (video-only templates) ──────────────────── */

function VideoPreview({ template, portrait }) {
  const [failed, setFailed] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    setFailed(false)
    timerRef.current = setTimeout(() => setFailed(true), 4000)
    return () => clearTimeout(timerRef.current)
  }, [template.video_url])

  if (failed) {
    return <ZoneSchematic zones={[]} portrait={portrait} />
  }

  return (
    <div className={`relative w-full overflow-hidden bg-black ${portrait ? 'aspect-[9/16] mx-auto max-h-52' : 'aspect-video'}`}>
      <video
        src={template.video_url}
        className="w-full h-full object-cover"
        muted
        loop
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
        onLoadedData={() => clearTimeout(timerRef.current)}
        onMouseEnter={e => e.target.play()}
        onMouseLeave={e => e.target.pause()}
      />
      <div className="absolute inset-0 bg-black/10 pointer-events-none" />
      <div className="absolute bottom-1 right-2 text-[6px] font-semibold tracking-[0.3em] text-white/50 pointer-events-none">
        LUMENU
      </div>
    </div>
  )
}
