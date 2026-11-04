import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react'
import { useToast } from '../contexts/ToastContext'

/**
 * Board aspect ratio for the preview frame.
 * Prefer the template's own layout dimensions (the showcase boards carry
 * { layout: { width, height } }), fall back to the screen orientation —
 * the TV spec is 1920×1080 landscape / 1080×1920 portrait.
 */
function boardRatio(screenData) {
  const layout = screenData?.template?.config_json?.layout
  const w = Number(layout?.width)
  const h = Number(layout?.height)
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return w / h
  const orientation = screenData?.screen?.orientation || screenData?.template?.orientation
  return orientation === 'portrait' ? 9 / 16 : 16 / 9
}

/**
 * Largest box with `ratio` that fits inside `avail` — the same math as
 * `object-fit: contain`. A portrait board in a landscape modal (or on a phone)
 * is scaled down instead of being cropped at the bottom.
 */
function fitInside(avail, ratio) {
  if (!avail.w || !avail.h || !ratio) return null
  const byWidth = { w: avail.w, h: avail.w / ratio }
  if (byWidth.h <= avail.h) return byWidth
  return { w: avail.h * ratio, h: avail.h }
}

export default function PreviewModal({ slug, onClose }) {
  const [screenData, setScreenData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [avail, setAvail] = useState({ w: 0, h: 0 })
  const stageRef = useRef(null)
  const { addToast } = useToast()

  const fetchPreview = useCallback(async () => {
    try {
      const res = await fetch(`/api/screens/${slug}/data`)
      if (res.ok) {
        setScreenData(await res.json())
      }
    } catch {
      addToast('Could not load preview', 'error')
    }
    setLoading(false)
  }, [slug, addToast])

  useEffect(() => { fetchPreview() }, [fetchPreview])

  // Measure the available area, not the board: the board is then sized to fit
  // it, so the modal can never clip the bottom of a tall portrait screen.
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setAvail({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [loading])

  const ratio = useMemo(() => boardRatio(screenData), [screenData])
  const box = fitInside(avail, ratio)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-brand-surface rounded-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-brand-border/50"
        onClick={e => e.stopPropagation()}>
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-brand-border/50">
          <h3 className="font-heading font-semibold text-brand-text">TV Preview</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-brand-surface-alt rounded-lg text-brand-muted hover:text-brand-text transition-colors">✕</button>
        </div>
        <div className="p-3 sm:p-4 bg-brand-bg flex-1 min-h-0 flex flex-col">
          {loading ? (
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <div className="text-brand-text text-center">
                <div className="animate-spin h-8 w-8 border-2 border-brand-primary border-t-transparent rounded-full mx-auto mb-2" />
                <p className="text-sm text-brand-muted">Loading preview...</p>
              </div>
            </div>
          ) : (
            <>
              <div ref={stageRef} className="flex-1 min-h-0 w-full flex items-center justify-center">
                {box && (
                  <div
                    className="relative rounded-lg overflow-hidden border border-brand-border/30 bg-black"
                    style={{ width: `${box.w}px`, height: `${box.h}px` }}
                  >
                    {screenData?.template?.video_url ? (
                      <video src={screenData.template.video_url} className="w-full h-full object-contain" autoPlay loop muted />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-brand-surface-alt">
                        <div className="text-center">
                          <div className="text-4xl mb-2">🖥️</div>
                          <p className="text-lg font-heading font-medium mb-1">{screenData?.screen?.name || 'Lumenu Screen'}</p>
                          <p className="text-sm text-brand-muted">No background video assigned</p>
                        </div>
                      </div>
                    )}
                    {/* Menu overlay */}
                    <div className="absolute top-4 left-4 right-4 bottom-4 pointer-events-none overflow-hidden">
                      {(screenData?.menu_items || []).map((item, i) => (
                        <div key={i} className="flex justify-between text-sm border-b border-brand-border/30 pb-1 mb-1"
                          style={{ opacity: 0.7 + (1 / (i + 1)) }}>
                          <span className={item.availability === 'sold_out' ? 'line-through text-red-400' : ''}>
                            {item.name}
                          </span>
                          <span className={item.availability === 'sold_out' ? 'text-red-400 font-bold' : 'font-medium'}>
                            {item.availability === 'sold_out' ? 'SOLD OUT' : `${parseFloat(item.price || 0).toFixed(2)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="shrink-0 pt-2 flex items-center justify-between text-xs text-brand-muted/60">
                <span>{screenData?.screen?.name}</span>
                <span>{screenData?.menu_items?.length || 0} menu items</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
