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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">TV Preview</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">✕</button>
        </div>
        <div className="p-4 bg-gray-900 flex items-center justify-center" style={{ minHeight: '50vh' }}>
          {loading ? (
            <div className="text-white text-center">
              <div className="animate-spin h-8 w-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-sm text-gray-400">Loading preview...</p>
            </div>
          ) : screenData?.template?.video_url ? (
            <video src={screenData.template.video_url} className="max-w-full max-h-[70vh] rounded-lg" autoPlay loop muted />
          ) : (
            <div className="text-white text-center">
              <div className="text-4xl mb-2">🖥️</div>
              <p className="text-lg font-medium mb-2">{screenData?.screen?.name || 'Menuvo Screen'}</p>
              <div className="space-y-2 max-w-md mx-auto">
                {(screenData?.menu_items || []).slice(0, 5).map((item, i) => (
                  <div key={i} className="flex justify-between text-sm border-b border-gray-700 pb-1">
                    <span className={item.availability === 'sold_out' ? 'line-through text-red-400' : ''}>
                      {item.name}
                    </span>
                    <span className={item.availability === 'sold_out' ? 'text-red-400' : ''}>
                      {item.availability === 'sold_out' ? 'SOLD OUT' : `$${parseFloat(item.price || 0).toFixed(2)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}