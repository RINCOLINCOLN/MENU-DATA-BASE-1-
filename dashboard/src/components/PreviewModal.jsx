import { useState, useEffect, useCallback } from 'react'
import { useToast } from '../contexts/ToastContext'

export default function PreviewModal({ slug, onClose }) {
  const [screenData, setScreenData] = useState(null)
  const [loading, setLoading] = useState(true)
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-brand-surface rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl border border-brand-border/50"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-brand-border/50">
          <h3 className="font-heading font-semibold text-brand-text">TV Preview</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-brand-surface-alt rounded-lg text-brand-muted hover:text-brand-text transition-colors">✕</button>
        </div>
        <div className="p-4 bg-brand-bg flex items-center justify-center" style={{ minHeight: '50vh' }}>
          {loading ? (
            <div className="text-brand-text text-center">
              <div className="animate-spin h-8 w-8 border-2 border-brand-primary border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-sm text-brand-muted">Loading preview...</p>
            </div>
          ) : (
            <div className="w-full max-w-2xl mx-auto text-brand-text">
              {/* Video preview area */}
              <div className="relative rounded-lg overflow-hidden mb-4 border border-brand-border/30" style={{ aspectRatio: screenData?.screen?.orientation === 'portrait' ? '9/16' : '16/9' }}>
                {screenData?.template?.video_url ? (
                  <video src={screenData.template.video_url} className="w-full h-full object-cover" autoPlay loop muted />
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
                <div className="absolute top-4 left-4 right-4 bottom-4 pointer-events-none">
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
              <div className="flex items-center justify-between text-xs text-brand-muted/60">
                <span>{screenData?.screen?.name}</span>
                <span>{screenData?.menu_items?.length || 0} menu items</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
