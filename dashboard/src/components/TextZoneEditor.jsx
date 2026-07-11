import { useState, useRef, useEffect } from 'react'
import { useToast } from '../contexts/ToastContext'

const DEFAULT_ZONE = {
  id: '', x: 5, y: 5, width: 90, height: 20,
  alignment: 'left', font_size: 48, min_font_size: 24, max_font_size: 72,
  color: '#ffffff', font_weight: 'normal', font_family: 'Inter',
  bg_color: '', label: '', type: 'text',
  is_price: false, category_filter: '', item_ids: [],
}

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
  { label: 'Gray', color: '#A0AEC0' },
  { label: 'Dark Gray', color: '#718096' },
  { label: 'Cream', color: '#FFF8DC' },
  { label: 'Beige', color: '#FAF5EF' },
]

const BG_COLORS = [
  { label: 'None', color: '' },
  { label: 'Dark', color: '#1a202c' },
  { label: 'Green', color: '#22543D' },
  { label: 'Green Light', color: '#22C55E' },
  { label: 'Red', color: '#9B2C2C' },
  { label: 'Dark Red', color: '#742A2A' },
  { label: 'Amber', color: '#744210' },
  { label: 'Warm Gold', color: '#7B5E3B' },
  { label: 'Black 80%', color: '#1a1a1acc' },
  { label: 'Black 60%', color: '#1a1a1a99' },
]

const FONT_SIZES = [14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 56, 64, 72]
const MIN_SIZES = [10, 12, 14, 16, 18, 20, 24, 28]
const MAX_SIZES = [48, 56, 64, 72, 84, 96, 120, 144]
const ALIGNMENTS = ['left', 'center', 'right']

export default function TextZoneEditor({ template, onClose, onSaved }) {
  const [zones, setZones] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [resizing, setResizing] = useState(null)
  const [saving, setSaving] = useState(false)
  const canvasRef = useRef(null)
  const { addToast } = useToast()
  const token = localStorage.getItem('menuvo_token')

  useEffect(() => {
    if (template?.config_json) {
      try {
        const config = typeof template.config_json === 'string'
          ? JSON.parse(template.config_json)
          : template.config_json
        setZones(Array.isArray(config) ? config : config.zones || [])
      } catch { setZones([]) }
    }
  }, [template])

  const selectedZone = zones.find(z => z.id === selectedId)
  const nextId = () => `zone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  const addZone = () => {
    const id = nextId()
    setZones(prev => [...prev, {
      ...DEFAULT_ZONE, id, label: `Zone ${prev.length + 1}`,
      x: 10 + (prev.length * 5) % 80, y: 10 + (prev.length * 10) % 70,
    }])
    setSelectedId(id)
  }

  const deleteZone = (id) => {
    setZones(prev => prev.filter(z => z.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const updateZone = (id, updates) => {
    setZones(prev => prev.map(z => z.id === id ? { ...z, ...updates } : z))
  }

  const startDrag = (e, id) => {
    e.preventDefault()
    const rect = canvasRef.current.getBoundingClientRect()
    setDragging({ id, startX: e.clientX, startY: e.clientY, rect })
  }

  const startResize = (e, id) => {
    e.preventDefault(); e.stopPropagation()
    const rect = canvasRef.current.getBoundingClientRect()
    setResizing({ id, startX: e.clientX, startY: e.clientY, rect })
  }

  useEffect(() => {
    if (!dragging && !resizing) return
    const handler = (e) => {
      if (dragging) {
        const dx = ((e.clientX - dragging.startX) / dragging.rect.width) * 100
        const dy = ((e.clientY - dragging.startY) / dragging.rect.height) * 100
        updateZone(dragging.id, {
          x: Math.max(0, Math.min(90, (zones.find(z => z.id === dragging.id)?.x || 0) + dx)),
          y: Math.max(0, Math.min(90, (zones.find(z => z.id === dragging.id)?.y || 0) + dy)),
        })
        setDragging({ ...dragging, startX: e.clientX, startY: e.clientY })
      }
      if (resizing) {
        const dw = ((e.clientX - resizing.startX) / resizing.rect.width) * 100
        const dh = ((e.clientY - resizing.startY) / resizing.rect.height) * 100
        const z = zones.find(z => z.id === resizing.id)
        updateZone(resizing.id, {
          width: Math.max(10, Math.min(95, (z?.width || 30) + dw)),
          height: Math.max(5, Math.min(80, (z?.height || 20) + dh)),
        })
        setResizing({ ...resizing, startX: e.clientX, startY: e.clientY })
      }
    }
    const upHandler = () => { setDragging(null); setResizing(null) }
    window.addEventListener('mousemove', handler)
    window.addEventListener('mouseup', upHandler)
    window.addEventListener('touchmove', handler, { passive: false })
    window.addEventListener('touchend', upHandler)
    return () => {
      window.removeEventListener('mousemove', handler)
      window.removeEventListener('mouseup', upHandler)
      window.removeEventListener('touchmove', handler)
      window.removeEventListener('touchend', upHandler)
    }
  }, [dragging, resizing, zones])

  const moveZone = (id, direction) => {
    setZones(prev => {
      const idx = prev.findIndex(z => z.id === id)
      if ((direction === 'up' && idx <= 0) || (direction === 'down' && idx >= prev.length - 1)) return prev
      const arr = [...prev]
      const swap = direction === 'up' ? idx - 1 : idx + 1;
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]]
      return arr
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const configJson = JSON.stringify({ zones })
      const res = await fetch(`/api/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ config_json: configJson }),
      })
      if (res.ok) { addToast('Text zones saved!', 'success'); onSaved?.(); onClose() }
      else addToast('Save failed', 'error')
    } catch { addToast('Network error', 'error') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Text Zone Editor</h3>
            <p className="text-sm text-gray-500">{template.name} · {zones.length} zone{zones.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={addZone} className="btn-primary text-sm flex items-center gap-1">+ Add Zone</button>
            <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Canvas */}
          <div className="flex-1 bg-gray-900 p-4 flex items-center justify-center">
            <div ref={canvasRef} className="relative bg-black w-full max-w-4xl aspect-video rounded-lg overflow-hidden shadow-lg"
              style={{
                backgroundImage: template?.video_url ? `url(${template.video_url})` : undefined,
                backgroundSize: 'cover',
              }}>
              {/* Grid */}
              <div className="absolute inset-0 opacity-10"
                style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.2) 1px, transparent 1px)', backgroundSize: '10% 10%' }} />
              {/* Zones */}
              {zones.map((zone, i) => (
                <div key={zone.id}
                  onMouseDown={e => { setSelectedId(zone.id); startDrag(e, zone.id) }}
                  onTouchStart={e => { setSelectedId(zone.id); startDrag(e, zone.id) }}
                  className={`absolute border-2 cursor-move transition-colors ${
                    selectedId === zone.id ? 'border-brand-500 bg-brand-500/15' : 'border-white/40 hover:border-white/60 bg-white/5'
                  }`}
                  style={{
                    left: `${zone.x}%`, top: `${zone.y}%`,
                    width: `${zone.width || 80}%`, height: `${zone.height || 15}%`,
                    zIndex: i,
                    color: zone.color || '#ffffff',
                    fontFamily: zone.font_family || 'Inter',
                    fontWeight: zone.font_weight || 'normal',
                    backgroundColor: zone.is_price && !zone.bg_color ? 'rgba(34,197,94,0.2)' : zone.bg_color || 'transparent',
                  }}>
                  <div className="p-2 text-xs truncate pointer-events-none flex items-center justify-between">
                    <span>{zone.label || zone.id} {zone.is_price ? '💰' : ''}</span>
                    <span className="opacity-50">{zone.font_size}px · {zone.font_family}</span>
                  </div>
                  {/* Resize handle */}
                  <div onMouseDown={e => startResize(e, zone.id)}
                    onTouchStart={e => startResize(e, zone.id)}
                    className="absolute bottom-0 right-0 w-4 h-4 bg-brand-500 cursor-se-resize rounded-sm"
                    style={{ touchAction: 'none' }} />
                </div>
              ))}
              {zones.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">
                  Click "Add Zone" to start placing text areas
                </div>
              )}
            </div>
          </div>

          {/* Properties Panel */}
          <div className="w-80 border-l border-gray-200 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {selectedZone ? (
              <>
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-gray-900 text-sm">Zone Properties</h4>
                    <span className="text-xs text-gray-400 font-mono">{selectedZone.id.split('-').pop()}</span>
                  </div>
                  <input className="input-field text-sm mt-2" placeholder="Zone label"
                    value={selectedZone.label || ''}
                    onChange={e => updateZone(selectedZone.id, { label: e.target.value })} />
                </div>

                {/* Position & Size */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">X%</label>
                    <input type="number" className="input-field text-xs" value={Math.round(selectedZone.x)}
                      onChange={e => updateZone(selectedZone.id, { x: Math.max(0, Math.min(90, parseInt(e.target.value) || 0)) })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Y%</label>
                    <input type="number" className="input-field text-xs" value={Math.round(selectedZone.y)}
                      onChange={e => updateZone(selectedZone.id, { y: Math.max(0, Math.min(90, parseInt(e.target.value) || 0)) })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Width%</label>
                    <input type="number" className="input-field text-xs" value={Math.round(selectedZone.width || 80)}
                      onChange={e => updateZone(selectedZone.id, { width: Math.max(10, Math.min(95, parseInt(e.target.value) || 80)) })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Height%</label>
                    <input type="number" className="input-field text-xs" value={Math.round(selectedZone.height || 15)}
                      onChange={e => updateZone(selectedZone.id, { height: Math.max(5, Math.min(80, parseInt(e.target.value) || 15)) })} />
                  </div>
                </div>

                {/* Alignment */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Alignment</label>
                  <div className="flex gap-1">
                    {ALIGNMENTS.map(a => (
                      <button key={a} onClick={() => updateZone(selectedZone.id, { alignment: a })}
                        className={`flex-1 py-1.5 rounded text-xs font-medium border ${
                          selectedZone.alignment === a ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500'
                        }`}>{a === 'left' ? '≡ Left' : a === 'center' ? '≡ Center' : '≡ Right'}</button>
                    ))}
                  </div>
                </div>

                {/* Font Family */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Font Family</label>
                  <div className="relative">
                    <select className="input-field text-sm appearance-none"
                      value={selectedZone.font_family || 'Inter'}
                      onChange={e => updateZone(selectedZone.id, { font_family: e.target.value })}
                      style={{ fontFamily: selectedZone.font_family || 'Inter' }}>
                      {FONT_FAMILIES.map(f => (
                        <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Font Size */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Size</label>
                    <select className="input-field text-xs"
                      value={selectedZone.font_size}
                      onChange={e => updateZone(selectedZone.id, { font_size: parseInt(e.target.value) })}>
                      {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Min</label>
                    <select className="input-field text-xs"
                      value={selectedZone.min_font_size}
                      onChange={e => updateZone(selectedZone.id, { min_font_size: parseInt(e.target.value) })}>
                      {MIN_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Max</label>
                    <select className="input-field text-xs"
                      value={selectedZone.max_font_size}
                      onChange={e => updateZone(selectedZone.id, { max_font_size: parseInt(e.target.value) })}>
                      {MAX_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
                    </select>
                  </div>
                </div>

                {/* Font Weight */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Font Weight</label>
                  <div className="flex gap-2">
                    <button onClick={() => updateZone(selectedZone.id, { font_weight: 'normal' })}
                      className={`flex-1 py-1.5 rounded text-xs font-medium border ${
                        selectedZone.font_weight === 'normal' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500'
                      }`}>Normal</button>
                    <button onClick={() => updateZone(selectedZone.id, { font_weight: 'bold' })}
                      className={`flex-1 py-1.5 rounded text-xs font-bold border ${
                        selectedZone.font_weight === 'bold' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500'
                      }`}>Bold</button>
                  </div>
                </div>

                {/* Text Color - Preset swatches */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Text Color</label>
                  <div className="flex flex-wrap gap-1.5">
                    {TEXT_COLORS.map(({ label, color }) => (
                      <button key={color} title={label}
                        onClick={() => updateZone(selectedZone.id, { color })}
                        className={`w-7 h-7 rounded-full border-2 ${selectedZone.color === color ? 'border-gray-900 scale-110 ring-2 ring-brand-500' : 'border-gray-300'} ${color === '#ffffff' || color === '#FFF8DC' || color === '#FAF5EF' ? 'shadow-inner' : ''}`}
                        style={{ backgroundColor: color }} />
                    ))}
                    <input type="color" className="w-7 h-7 rounded cursor-pointer border-0"
                      value={selectedZone.color}
                      onChange={e => updateZone(selectedZone.id, { color: e.target.value })} />
                  </div>
                </div>

                {/* Background Color */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Background Color</label>
                  <div className="flex flex-wrap gap-1.5">
                    {BG_COLORS.map(({ label, color }) => (
                      <button key={label} title={label}
                        onClick={() => updateZone(selectedZone.id, { bg_color: color })}
                        className={`w-7 h-7 rounded-full border-2 ${selectedZone.bg_color === color ? 'border-gray-900 scale-110 ring-2 ring-brand-500' : 'border-gray-300'} ${!color ? 'flex items-center justify-center text-[8px] font-bold text-gray-400' : ''}`}
                        style={{ backgroundColor: color || '#fff' }}>
                        {!color ? 'X' : ''}
                      </button>
                    ))}
                    <input type="color" className="w-7 h-7 rounded cursor-pointer border-0"
                      value={selectedZone.bg_color || '#000000'}
                      onChange={e => updateZone(selectedZone.id, { bg_color: e.target.value })} />
                  </div>
                </div>

                {/* Price Box Toggle */}
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={selectedZone.is_price || false}
                      onChange={e => updateZone(selectedZone.id, { is_price: e.target.checked })}
                      className="w-4 h-4 text-green-500 rounded" />
                    <div>
                      <span className="text-sm font-medium text-gray-700">💰 Price Box Highlighting</span>
                      <p className="text-xs text-gray-400">Displays prices on a green background</p>
                    </div>
                  </label>
                </div>

                {/* Category Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category Filter</label>
                  <input className="input-field text-xs" placeholder="e.g. Entrees, Drinks (empty = all)"
                    value={selectedZone.category_filter || ''}
                    onChange={e => updateZone(selectedZone.id, { category_filter: e.target.value })} />
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t border-gray-200">
                  <button onClick={() => moveZone(selectedZone.id, 'up')} className="btn-secondary text-xs flex-1 py-1.5">↑ Up</button>
                  <button onClick={() => moveZone(selectedZone.id, 'down')} className="btn-secondary text-xs flex-1 py-1.5">↓ Down</button>
                  <button onClick={() => deleteZone(selectedZone.id)} className="btn-danger text-xs flex-1 py-1.5">🗑 Delete</button>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-gray-400 text-sm">
                <div className="text-3xl mb-2">👆</div>
                Select a zone on the canvas to edit
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between bg-white">
          <div className="text-xs text-gray-400">
            Drag zones to position · Corner handle to resize · Double-tap zone to select
          </div>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving && <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
            {saving ? 'Saving...' : '💾 Save & Close'}
          </button>
        </div>
      </div>
    </div>
  )
}