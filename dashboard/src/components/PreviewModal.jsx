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
          ) : (
            <div className="w-full max-w-2xl mx-auto text-white">
              {/* Video preview area */}
              <div className="relative bg-black rounded-lg overflow-hidden mb-4" style={{ aspectRatio: screenData?.screen?.orientation === 'portrait' ? '9/16' : '16/9' }}>
                {screenData?.template?.video_url ? (
                  <video src={screenData.template.video_url} className="w-full h-full object-cover" autoPlay loop muted />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-800">
                    <div className="text-center">
                      <div className="text-4xl mb-2">🖥️</div>
                      <p className="text-lg font-medium mb-1">{screenData?.screen?.name || 'Menuvo Screen'}</p>
                      <p className="text-sm text-gray-400">No background video assigned</p>
                    </div>
                  </div>
                )}
                {/* Menu overlay */}
                <div className="absolute top-4 left-4 right-4 bottom-4 pointer-events-none">
                  {(screenData?.menu_items || []).map((item, i) => (
                    <div key={i} className="flex justify-between text-sm border-b border-gray-700/50 pb-1 mb-1"
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
              <div className="flex items-center justify-between text-xs text-gray-400">
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