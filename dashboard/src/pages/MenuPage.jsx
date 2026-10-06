import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'
import SkeletonLoader from '../components/SkeletonLoader'
import { FONT_FAMILIES, TEXT_COLORS, FONT_SIZES } from '../components/TextZoneEditor'
import api from '../lib/api'

const WEIGHTS = ['normal', 'bold', 'italic']

/* Parse a template config_json (any historical shape) into a flat zone list */
function parseTemplateZones(configJson) {
  if (!configJson) return []
  let parsed = configJson
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { return [] }
  }
  if (Array.isArray(parsed)) return parsed
  if (parsed && Array.isArray(parsed.text_zones)) return parsed.text_zones
  return []
}

/* Shared per-item typography controls (overrides the zone defaults).
   Empty value = inherit the zone's font/color. Compact, mobile-first. */
function TypographyFields({ value, onChange }) {
  const set = (patch) => onChange({ ...(value || {}), ...patch })
  return (
    <details className="rounded-lg border border-brand-border/40 bg-brand-surface-alt/40 px-3 py-2">
      <summary className="text-xs font-semibold text-brand-muted cursor-pointer select-none">
        Typography (optional — overrides the zone)
      </summary>
      <div className="mt-2 space-y-2.5">
        <div>
          <label className="block text-[11px] font-medium text-brand-muted mb-1">Font family</label>
          <select className="input-field text-sm" value={value.font_family || ''}
            onChange={e => set({ font_family: e.target.value })}>
            <option value="">Inherit zone</option>
            {FONT_FAMILIES.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-medium text-brand-muted mb-1">Font size</label>
            <select className="input-field text-sm" value={value.font_size ?? ''}
              onChange={e => set({ font_size: e.target.value === '' ? '' : Number(e.target.value) })}>
              <option value="">Inherit zone</option>
              {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-brand-muted mb-1">Weight</label>
            <select className="input-field text-sm" value={value.font_weight || ''}
              onChange={e => set({ font_weight: e.target.value })}>
              <option value="">Inherit zone</option>
              {WEIGHTS.map(w => <option key={w} value={w} style={{ fontWeight: w === 'italic' ? 'normal' : w, fontStyle: w === 'italic' ? 'italic' : undefined }}>{w}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-brand-muted mb-1">Color</label>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" title="Inherit zone"
              onClick={() => set({ color: '' })}
              className={`w-7 h-7 rounded-full border text-[10px] font-bold ${!value.color ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-brand-border/60 text-brand-muted'}`}>A</button>
            {TEXT_COLORS.map(c => (
              <button key={c.label} type="button" title={c.label}
                onClick={() => set({ color: c.color })}
                className={`w-7 h-7 rounded-full border ${value.color === c.color ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-white/10'}`}
                style={{ backgroundColor: c.color }} />
            ))}
          </div>
        </div>
      </div>
    </details>
  )
}

/* Zone attachment: dropdown of the screen's template text zones, with a small
   "+ custom ID" fallback when the list is empty (or for power users). */
function TextZoneField({ zones, value, onChange }) {
  const [showCustom, setShowCustom] = useState(false)
  if (zones.length === 0 || showCustom) {
    return (
      <div>
        <label className="block text-[11px] font-medium text-brand-muted mb-1">Text zone ID (optional)</label>
        <input className="input-field text-sm" placeholder="zone-id (add zones in Screen Designer)" value={value}
          onChange={e => onChange(e.target.value)} />
        <p className="text-[10px] text-brand-muted/60 mt-0.5">
          {zones.length === 0
            ? 'No zones saved on this screen yet — create some in the Screen Designer, or paste an ID.'
            : <button type="button" className="underline" onClick={() => setShowCustom(false)}>← back to zone list</button>}
        </p>
      </div>
    )
  }
  const selected = zones.find(z => z.id === value)
  return (
    <div>
      <label className="block text-[11px] font-medium text-brand-muted mb-1">Text zone</label>
      <div className="flex gap-1.5">
        <select className="input-field text-sm flex-1 min-w-0"
          value={zones.some(z => z.id === value) ? value : ''}
          onChange={e => onChange(e.target.value)}>
          <option value="">None</option>
          {zones.map(z => (
            <option key={z.id} value={z.id}>
              {z.label || z.type === 'menu_items' ? 'Menu items' : z.type || 'Text zone'} · {z.id.slice(0, 12)}…
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setShowCustom(true)}
          className="shrink-0 text-xs px-2 rounded-lg border border-brand-border/50 text-brand-muted hover:text-brand-text">+ custom</button>
      </div>
      {selected && <p className="text-[10px] text-brand-muted/60 mt-0.5">Attached to “{selected.label || selected.type}”</p>}
    </div>
  )
}

export default function MenuPage() {
  const { screenId } = useParams()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [items, setItems] = useState([])
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [screenUuid, setScreenUuid] = useState(null) // UUID for API calls

  // Fetch screen to get UUID, then fetch menu items + template text zones
  const fetchScreenAndItems = async () => {
    try {
      const sData = await api.getScreen(screenId)
      const uuid = sData.screen?.id
      setScreenUuid(uuid)

      // Template text zones (for the zone dropdown) — public TV data endpoint
      const tData = await api.getScreenData(screenId)
      setZones(parseTemplateZones(tData?.template?.config_json))

      if (uuid) {
        const data = await api.getMenuItems(uuid)
        setItems(data.menu_items || [])
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchScreenAndItems() }, [screenId])

  const handleToggle = async (item) => {
    const newAvail = item.availability === 'sold_out' ? 'available' : 'sold_out'
    const prev = items
    // Optimistic UI — flip instantly, persist in background, revert on failure.
    setItems(items.map(i => i.id === item.id ? { ...i, availability: newAvail } : i))
    try {
      const updated = await api.toggleSoldOut(item.id, newAvail)
      setItems(prevItems => prevItems.map(i =>
        i.id === item.id ? (updated.menu_item || i) : i
      ))
    } catch (err) {
      setItems(prev)
      addToast(err.message || 'Toggle failed', 'error')
    }
  }

  const handleSaveItem = async (itemId, data) => {
    try {
      await api.updateMenuItem(itemId, data)
      addToast('Item updated', 'success')
      setEditingId(null)
      fetchScreenAndItems()
    } catch (err) { addToast(err.message || 'Save failed', 'error') }
  }

  const handleAddItem = async (data) => {
    try {
      await api.createMenuItem(screenUuid, data)
      addToast('Item added', 'success')
      setAddOpen(false)
      fetchScreenAndItems()
    } catch (err) { addToast(err.message || 'Failed to add item', 'error') }
  }

  const handleDelete = async (itemId) => {
    if (!confirm('Delete this item?')) return
    try {
      await api.deleteMenuItem(itemId)
      addToast('Item deleted', 'success')
      fetchScreenAndItems()
    } catch (err) { addToast(err.message || 'Delete failed', 'error') }
  }

  if (loading) return <SkeletonLoader />

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/dashboard/screens/${screenId}`)}
          className="p-2 hover:bg-brand-surface-alt/70 rounded-lg text-brand-muted">← Back</button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-brand-text">Edit Menu</h1>
          <p className="text-sm text-brand-muted">Screen ID: {screenId?.substring(0, 8)}...</p>
        </div>
        <button onClick={() => setAddOpen(true)}
          className="btn-primary flex items-center gap-1.5">+ Add Item</button>
      </div>

      <div className="bg-brand-surface rounded-xl shadow-sm border border-brand-border/40 overflow-hidden">
        <div className="px-5 py-3 border-b border-brand-border/40 flex items-center justify-between">
          <h3 className="font-semibold text-brand-text">Menu Items</h3>
          <span className="text-sm text-brand-muted/60">{items.length} items</span>
        </div>
        <div className="divide-y divide-brand-border/20">
          {items.length === 0 ? (
            <div className="p-8 text-center text-brand-muted/60 text-sm">
              No items yet. Click "Add Item" to get started.
            </div>
          ) : (
            items.map((item, idx) => (
              <div key={item.id} className="px-5 py-3.5 hover:bg-brand-surface-alt/50">
                {editingId === item.id ? (
                  <InlineEditForm item={item} zones={zones}
                    onSave={(data) => handleSaveItem(item.id, data)}
                    onCancel={() => setEditingId(null)} />
                ) : (
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-brand-muted/60 w-6">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {item.name ? (
                          <h4 className="font-medium text-brand-text">{item.name}</h4>
                        ) : (
                          <h4 className="font-semibold text-brand-text">${parseFloat(item.price || 0).toFixed(2)}</h4>
                        )}
                        {item.availability === 'sold_out' && <span className="badge-red text-xs">Sold Out</span>}
                      </div>
                      <div className="text-sm text-brand-muted truncate">{item.description || ''}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-brand-muted/60 flex-wrap">
                        <span className="font-semibold text-brand-text/80">
                          {item.name ? `$${parseFloat(item.price || 0).toFixed(2)}` : ''}
                        </span>
                        {item.category && <span>· {item.category}</span>}
                        {item.text_zone_id && <span>· Zone: {item.text_zone_id.slice(0, 14)}…</span>}
                        {(item.font_family || item.font_size || item.font_weight || item.color) && (
                          <span className="text-brand-glow/80" style={{ fontFamily: item.font_family || undefined, fontWeight: item.font_weight || undefined }}>✎ styled</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleToggle(item)}
                        className={`h-8 px-3 rounded-lg text-xs font-bold ${
                          item.availability === 'sold_out'
                            ? 'bg-green-400 hover:bg-green-500 text-white'
                            : 'bg-red-500 hover:bg-red-600 text-white'
                        }`}>
                        {item.availability === 'sold_out' ? 'Avail' : 'Sold'}
                      </button>
                      <button onClick={() => setEditingId(item.id)}
                        className="p-1.5 hover:bg-gray-200 rounded text-brand-muted">✏️</button>
                      <button onClick={() => handleDelete(item.id)}
                        className="p-1.5 hover:bg-red-100 rounded text-red-400">🗑️</button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {addOpen && (
        <AddItemModal zones={zones} onSave={handleAddItem} onClose={() => setAddOpen(false)} />
      )}
    </div>
  )
}

function InlineEditForm({ item, zones, onSave, onCancel }) {
  const [name, setName] = useState(item.name || '')
  const [price, setPrice] = useState(item.price ?? '')
  const [description, setDescription] = useState(item.description || '')
  const [category, setCategory] = useState(item.category || '')
  const [textZoneId, setTextZoneId] = useState(item.text_zone_id || '')
  const [typography, setTypography] = useState({
    font_family: item.font_family || '',
    font_size: item.font_size ?? '',
    font_weight: item.font_weight || '',
    color: item.color || '',
  })

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    const body = { name: name.trim(), price: parseFloat(price) || 0, description, category }
    if (textZoneId) body.text_zone_id = textZoneId
    if (typography.font_family) body.font_family = typography.font_family
    if (typography.font_size !== '' && typography.font_size != null) body.font_size = Number(typography.font_size)
    if (typography.font_weight) body.font_weight = typography.font_weight
    if (typography.color) body.color = typography.color
    onSave(body)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input className="input-field text-sm" placeholder="Item name (optional — price only)" value={name}
          onChange={e => setName(e.target.value)} />
        <input className="input-field text-sm" placeholder="0.00" type="number" step="0.01" value={price}
          onChange={e => setPrice(e.target.value)} required />
      </div>
      <input className="input-field text-sm" placeholder="Description (optional)" value={description}
        onChange={e => setDescription(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <input className="input-field text-sm" placeholder="Category (e.g. Entrees)" value={category}
          onChange={e => setCategory(e.target.value)} />
        <TextZoneField zones={zones} value={textZoneId} onChange={setTextZoneId} />
      </div>
      <TypographyFields value={typography} onChange={setTypography} />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm py-1.5 px-3">Cancel</button>
        <button type="submit" className="btn-primary text-sm py-1.5 px-3">Save</button>
      </div>
    </form>
  )
}

function AddItemModal({ zones, onSave, onClose }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [textZoneId, setTextZoneId] = useState('')
  const [typography, setTypography] = useState({ font_family: '', font_size: '', font_weight: '', color: '' })

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    const body = { name: name.trim(), price: parseFloat(price) || 0, description, category }
    if (textZoneId) body.text_zone_id = textZoneId
    if (typography.font_family) body.font_family = typography.font_family
    if (typography.font_size !== '' && typography.font_size != null) body.font_size = Number(typography.font_size)
    if (typography.font_weight) body.font_weight = typography.font_weight
    if (typography.color) body.color = typography.color
    onSave(body)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-brand-surface rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-brand-text mb-4">Add Menu Item</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input className="input-field" placeholder="Item name (optional — price only)" value={name}
            onChange={e => setName(e.target.value)} autoFocus />
          <input className="input-field" placeholder="Price ($0.00)" type="number" step="0.01" min="0" value={price}
            onChange={e => setPrice(e.target.value)} required />
          <input className="input-field" placeholder="Description (optional)" value={description}
            onChange={e => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <input className="input-field" placeholder="Category" value={category}
              onChange={e => setCategory(e.target.value)} />
            <TextZoneField zones={zones} value={textZoneId} onChange={setTextZoneId} />
          </div>
          <TypographyFields value={typography} onChange={setTypography} />
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Add Item</button>
          </div>
        </form>
      </div>
    </div>
  )
}