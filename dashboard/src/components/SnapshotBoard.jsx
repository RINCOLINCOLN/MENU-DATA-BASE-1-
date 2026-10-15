import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

/**
 * SnapshotBoard — renders the "rebuilt" Lumenu board from a snapshot's AI
 * mockup. Prices are NOT baked into the design: each menu row ends in an
 * editable price box (the Lumenu price-editing affordance), so the owner
 * changes prices from their phone.
 *
 * Layout mirrors what the TV renders: the template's text zones are positioned
 * exactly (percent-based), fonts use the zone config, and the price font size
 * follows the measured price_font_ratio (price glyphs ÷ item-name glyphs from
 * the original photo). Price placement (right column vs dot-leader inline) and
 * alignment respect the AI's suggestion, flagged with "AI noticed" details by
 * the parent page.
 *
 * Props:
 *   zones          — template.text_zones (percent-based zone configs)
 *   items          — [{ id?, name, price, category?, availability?, font overrides? }]
 *   portrait       — board orientation
 *   restaurantName — header text (optional)
 *   priceLayout    — { position, align, font_ratio, bold, leader, margin_right }
 *   editable       — prices are editable inputs (default true)
 *   onPriceChange(id, price) — called as soon as the owner edits a price
 */
export default function SnapshotBoard({
  zones = [],
  items = [],
  portrait = false,
  restaurantName = '',
  priceLayout = {},
  editable = true,
  onPriceChange = null,
}) {
  const containerRef = useRef(null)
  const [boardW, setBoardW] = useState(0)

  // Measure the container so fonts scale with the rendered board width.
  // Font sizes in zone configs are authored for a ~1200px-wide board; the
  // schematic keeps them proportional to the actual preview width.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBoardW(el.clientWidth))
    ro.observe(el)
    setBoardW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const fontScale = boardW > 0 ? boardW / 1200 : 0

  return (
    <div ref={containerRef} className="w-full">
      {boardW === 0 ? (
        <div className={`${portrait ? 'aspect-[9/16]' : 'aspect-video'} w-full skeleton`} />
      ) : (
        <Board
          boardW={boardW}
          fontScale={fontScale}
          zones={zones}
          items={items}
          portrait={portrait}
          restaurantName={restaurantName}
          priceLayout={priceLayout}
          editable={editable}
          onPriceChange={onPriceChange}
        />
      )}
    </div>
  )
}

function Board({ boardW, fontScale, zones, items, portrait, restaurantName, priceLayout, editable, onPriceChange }) {
  const design = portrait ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 }
  const boardH = (boardW * design.h) / design.w

  const zoneList = useMemo(() => (Array.isArray(zones) ? zones : []), [zones])
  const menuZone = zoneList.find((z) => (z.type || '').toLowerCase().includes('menu'))
  const headerZones = zoneList.filter((z) => (z.type || '').toLowerCase().includes('header'))
  const otherZones = zoneList.filter(
    (z) => !(z.type || '').toLowerCase().includes('menu') && !(z.type || '').toLowerCase().includes('header')
  )

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-brand-border/40 shadow-2xl shadow-black/40"
      style={{ height: boardH, background: boardBackdrop, aspectRatio: portrait ? '9/16' : '16/9' }}
    >
      {/* guide grid + vignette (same cinematic backdrop the TV shows) */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(245,240,232,0.5) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(245,240,232,0.5) 1px, transparent 1px)',
          backgroundSize: '12.5% 12.5%',
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(90% 90% at 50% 50%, transparent 60%, rgba(5,3,10,0.5) 100%)' }}
      />

      {/* header / title zones */}
      {headerZones.map((z, i) => (
        <div
          key={z.id || `h${i}`}
          className="absolute flex items-center justify-center px-[2%]"
          style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.width}%`, height: `${z.height}%` }}
        >
          <span
            className="truncate font-bold uppercase tracking-[0.14em] text-center"
            style={{
              color: z.color || '#ffffff',
              fontFamily: z.font_family || undefined,
              fontWeight: z.font_weight || 'bold',
              fontSize: (z.font_size || 42) * fontScale,
              letterSpacing: '0.14em',
            }}
          >
            {restaurantName || zoneFallbackText(z)}
          </span>
        </div>
      ))}

      {/* the menu zone — real OCR'd items, prices as editable boxes */}
      {menuZone ? (
        <MenuZone
          zone={menuZone}
          fontScale={fontScale}
          items={items}
          priceLayout={priceLayout}
          editable={editable}
          onPriceChange={onPriceChange}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-brand-muted text-sm">
          Menu zone not found in template
        </div>
      )}

      {/* any other zones — rendered as labeled placeholders */}
      {otherZones.map((z, i) => (
        <div
          key={z.id || `o${i}`}
          className="absolute flex items-center justify-center overflow-hidden"
          style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.width}%`, height: `${z.height}%` }}
        >
          <span
            className="truncate px-[4%] text-center"
            style={{ color: z.color || 'rgba(255,255,255,0.55)', fontSize: (z.font_size || 24) * fontScale * 0.8, fontFamily: z.font_family || undefined }}
          >
            {z.label || z.id}
          </span>
        </div>
      ))}

      <div className="absolute bottom-1 right-2 text-[7px] font-semibold tracking-[0.3em] text-white/30 pointer-events-none select-none">
        LUMENU
      </div>
    </div>
  )
}

function MenuZone({ zone, fontScale, items, priceLayout, editable, onPriceChange }) {
  const baseFont = zone.font_size || 34
  const ratio = priceLayout.font_ratio ?? 0.9
  const align = priceLayout.align === 'right' ? 'right' : 'left'
  const leader = !!priceLayout.leader
  const rightColumn = (priceLayout.position || 'right_column') === 'right_column'
  const bold = priceLayout.bold ? 'bold' : zone.font_weight || '600'

  // Group rows: category headers + items, in original order.
  const rows = useMemo(() => {
    const out = []
    const cats = []
    for (const it of items || []) {
      if (it.category && !cats.includes(it.category)) {
        cats.push(it.category)
        out.push({ kind: 'category', label: it.category })
      }
      out.push({ kind: 'item', item: it })
    }
    return out
  }, [items])

  // Auto-shrink: if the rows don't fit the zone height, scale the font down
  // (never below ~55% of the zone default) — same spirit as the TV fallback.
  const fz = useMemo(() => {
    const lineH = baseFont * 1.5
    const avail = zone.height
    const needed = rows.length * (lineH / 100) + (rows.length ? baseFont * 0.9 / 100 : 0)
    if (needed <= avail) return baseFont
    return Math.max(baseFont * 0.55, (baseFont * avail) / needed)
  }, [baseFont, rows, zone.height])

  const px = (v) => v * fontScale
  const family = zone.font_family || 'Inter, sans-serif'
  const color = zone.color || '#f5f0e8'

  return (
    <div
      className="absolute overflow-hidden"
      style={{
        left: `${zone.x}%`,
        top: `${zone.y}%`,
        width: `${zone.width}%`,
        height: `${zone.height}%`,
        color,
        fontFamily: family,
      }}
    >
      <div className="w-full h-full overflow-hidden px-[3%] py-[2%]" style={{ fontSize: px(fz) }}>
        {rows.map((row, i) =>
          row.kind === 'category' ? (
            <div
              key={`c${i}`}
              className="flex items-center gap-[4%] whitespace-nowrap"
              style={{ fontSize: px(fz * 0.86), fontWeight: 'bold', lineHeight: `${px(fz * 1.45)}px`, letterSpacing: '0.12em', color: 'rgba(251,191,36,0.9)' }}
            >
              <span className="uppercase truncate">{row.label}</span>
              <span className="flex-1 h-px min-w-[5%]" style={{ background: 'rgba(255,255,255,0.14)' }} />
            </div>
          ) : (
            <MenuRow
              key={row.item.id || `i${i}`}
              item={row.item}
              editable={editable}
              fontPx={px(fz)}
              ratio={ratio}
              bold={bold}
              align={align}
              leader={leader}
              rightColumn={rightColumn}
              onPriceChange={onPriceChange}
            />
          )
        )}
      </div>
    </div>
  )
}

function MenuRow({ item, editable, fontPx, ratio, bold, align, leader, rightColumn, onPriceChange }) {
  const pricePx = fontPx * ratio
  const soldOut = item.availability === 'sold_out'
  const showLeader = rightColumn || leader
  const [val, setVal] = useState(item.price != null ? String(Number(item.price).toFixed(2)) : '')
  useEffect(() => { setVal(item.price != null ? String(Number(item.price).toFixed(2)) : '') }, [item.price])

  // Local edit only — persisted on blur/Enter (mobile keyboard "done").
  const commit = (next) => {
    setVal(next)
    const num = parseFloat(next)
    if (num >= 0 && onPriceChange && item.id) onPriceChange(item.id, Math.round(num * 100) / 100)
  }

  return (
    <div
      className="flex items-baseline w-full whitespace-nowrap"
      style={{ lineHeight: `${fontPx * 1.5}px`, minHeight: `${fontPx * 1.5}px` }}
    >
      {/* name — dotted leader runs between name and price when the original
          photo used right-column or dot-leader layout */}
      {showLeader ? (
        <>
          <span className="truncate" style={{ fontSize: fontPx, fontWeight: 'normal' }}>{item.name}</span>
          <span className="mx-[0.75ch] flex-1 h-px self-center min-w-[2ch]" style={{ background: 'rgba(255,255,255,0.16)' }} />
        </>
      ) : (
        <span className="truncate" style={{ fontSize: fontPx, fontWeight: 'normal' }}>{item.name}</span>
      )}

      <span
        className="shrink-0 inline-flex items-center gap-[2px]"
        style={{
          fontSize: pricePx,
          fontWeight: bold,
          marginLeft: rightColumn ? 0 : '0.6ch',
          paddingLeft: rightColumn ? 0 : '0.3ch',
          textAlign: align,
        }}
      >
        {soldOut ? (
          <span className="inline-flex items-center font-bold" style={{ color: '#f87171', fontSize: pricePx * 0.92 }}>
            SOLD&nbsp;OUT
          </span>
        ) : editable ? (
          <PriceBox value={val} onChange={setVal} onCommit={commit} fontSize={pricePx} bold={bold} align={align} />
        ) : (
          <span style={{ fontWeight: bold }}>${val}</span>
        )}
      </span>
    </div>
  )
}

/**
 * The Lumenu price-editing box — a gold chip with a `$` prefix and an inline
 * number input. Tap it to change the price from the phone; it commits through
 * onPriceChange (optimistic UI handled by the parent page).
 */
function PriceBox({ value, onChange, onCommit, fontSize, bold, align }) {
  const [focused, setFocused] = useState(false)
  const widthCh = Math.max(4, String(value || '0.00').length + 1)
  const finish = () => {
    const n = parseFloat(value)
    const clean = Number.isNaN(n) ? '0.00' : n.toFixed(2)
    onChange(clean)
    if (onCommit && !Number.isNaN(n)) onCommit(Number(clean))
  }
  return (
    <span
      className={`inline-flex items-center rounded-md border px-[0.5ch] transition-all ${
        focused ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-amber-400/50'
      }`}
      style={{
        background: 'rgba(234,179,8,0.14)',
        boxShadow: '0 0 10px rgba(234,179,8,0.15)',
        fontSize: fontSize * (align === 'right' ? 1 : 0.96),
      }}
    >
      <span style={{ fontWeight: bold, color: '#fbbf24' }}>$</span>
      <input
        inputMode="decimal"
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); finish() }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
        onChange={(e) => {
          // Allow only digits + one dot, up to 2 decimals — keep it light.
          let v = e.target.value.replace(/[^\d.]/g, '')
          const dot = v.indexOf('.')
          if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2)
          onChange(v)
        }}
        className="bg-transparent outline-none text-amber-300 font-semibold tabular-nums"
        style={{
          width: `${widthCh}ch`,
          fontWeight: bold,
          fontSize: 'inherit',
          padding: '0',
          textAlign: align === 'right' ? 'right' : 'left',
        }}
        aria-label="Edit price"
        enterKeyHint="done"
      />
    </span>
  )
}

const boardBackdrop =
  'radial-gradient(120% 90% at 50% 8%, rgba(139,92,246,0.18) 0%, rgba(139,92,246,0) 55%),' +
  'linear-gradient(160deg, #1E1830 0%, #0B0812 55%, #151122 100%)'

function zoneFallbackText(z) {
  const hay = `${z.type} ${z.id} ${z.label}`.toLowerCase()
  if (hay.includes('tagline')) return 'FRESH · DAILY · LOCAL'
  return 'YOUR MENU'
}