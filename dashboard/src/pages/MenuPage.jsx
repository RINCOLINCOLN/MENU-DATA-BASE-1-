import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'
import SkeletonLoader from '../components/SkeletonLoader'

export default function MenuPage() {
  const { screenId } = useParams()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [addOpen, setAddOpen] = useState(false)

  const token = localStorage.getItem('menuvo_token')
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const fetchItems = async () => {
    try {
      const res = await fetch(`/api/screens/${screenId}/menu-items`, { headers })
      if (res.ok) {
        const data = await res.json()
        setItems(data.menu_items || [])
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchItems() }, [screenId])

  const handleToggle = async (item) => {
    const newAvail = item.availability === 'sold_out' ? 'available' : 'sold_out'
    const optim = items.map(i => i.id === item.id ? { ...i, availability: newAvail } : i)
    setItems(optim)
    try {
      const res = await fetch(`/api/menu-items/${item.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ availability: newAvail }),
      })
      if (!res.ok) { fetchItems(); addToast('Toggle failed', 'error') }
    } catch { fetchItems(); addToast('Network error', 'error') }
  }

  const handleSaveItem = async (itemId, data) => {
    try {
      const res = await fetch(`/api/menu-items/${itemId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(data),
      })
      if (res.ok) {
        addToast('Item updated', 'success')
        setEditingId(null)
        fetchItems()
      } else {
        addToast('Save failed', 'error')
      }
    } catch { addToast('Network error', 'error') }
  }

  const handleAddItem = async (data) => {
    try {
      const res = await fetch(`/api/screens/${screenId}/menu-items`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      })
      if (res.ok) {
        addToast('Item added', 'success')
        setAddOpen(false)
        fetchItems()
      } else {
        addToast('Failed to add item', 'error')
      }
    } catch { addToast('Network error', 'error') }
  }

  const handleDelete = async (itemId) => {
    if (!confirm('Delete this item?')) return
    try {
      const res = await fetch(`/api/menu-items/${itemId}`, { method: 'DELETE', headers })
      if (res.ok) {
        addToast('Item deleted', 'success')
        fetchItems()
      }
    } catch { addToast('Delete failed', 'error') }
  }

  if (loading) return <SkeletonLoader />

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/dashboard/screens/${screenId}`)}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">← Back</button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Edit Menu</h1>
          <p className="text-sm text-gray-500">Screen ID: {screenId?.substring(0, 8)}...</p>
        </div>
        <button onClick={() => setAddOpen(true)}
          className="btn-primary flex items-center gap-1.5">+ Add Item</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Menu Items</h3>
          <span className="text-sm text-gray-400">{items.length} items</span>
        </div>
        <div className="divide-y divide-gray-100">
          {items.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              No items yet. Click "Add Item" to get started.
            </div>
          ) : (
            items.map((item, idx) => (
              <div key={item.id} className="px-5 py-3.5 hover:bg-gray-50">
                {editingId === item.id ? (
                  <InlineEditForm item={item}
                    onSave={(data) => handleSaveItem(item.id, data)}
                    onCancel={() => setEditingId(null)} />
                ) : (
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-400 w-6">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-gray-900">{item.name}</h4>
                        {item.availability === 'sold_out' && <span className="badge-red text-xs">Sold Out</span>}
                      </div>
                      <div className="text-sm text-gray-500 truncate">{item.description || ''}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                        <span className="font-semibold text-gray-700">${parseFloat(item.price || 0).toFixed(2)}</span>
                        {item.category && <span>· {item.category}</span>}
                        {item.text_zone_id && <span>· Zone: {item.text_zone_id}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleToggle(item)}
                        className={`h-8 px-3 rounded-lg text-xs font-bold ${
                          item.availability === 'sold_out'
                            ? 'bg-green-500 hover:bg-green-600 text-white'
                            : 'bg-red-500 hover:bg-red-600 text-white'
                        }`}>
                        {item.availability === 'sold_out' ? 'Avail' : 'Sold'}
                      </button>
                      <button onClick={() => setEditingId(item.id)}
                        className="p-1.5 hover:bg-gray-200 rounded text-gray-500">✏️</button>
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
        <AddItemModal onSave={handleAddItem} onClose={() => setAddOpen(false)} />
      )}
    </div>
  )
}

function InlineEditForm({ item, onSave, onCancel }) {
  const [name, setName] = useState(item.name || '')
  const [price, setPrice] = useState(item.price || '')
  const [description, setDescription] = useState(item.description || '')
  const [category, setCategory] = useState(item.category || '')
  const [textZoneId, setTextZoneId] = useState(item.text_zone_id || '')

  const handleSubmit = (e) => {
    e.preventDefault()
    const body = { name, price: parseFloat(price) || 0, description, category }
    if (textZoneId) body.text_zone_id = textZoneId
    onSave(body)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input className="input-field text-sm" placeholder="Item name" value={name}
          onChange={e => setName(e.target.value)} required />
        <input className="input-field text-sm" placeholder="0.00" type="number" step="0.01" value={price}
          onChange={e => setPrice(e.target.value)} required />
      </div>
      <input className="input-field text-sm" placeholder="Description (optional)" value={description}
        onChange={e => setDescription(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <input className="input-field text-sm" placeholder="Category (e.g. Entrees)" value={category}
          onChange={e => setCategory(e.target.value)} />
        <input className="input-field text-sm" placeholder="Text zone ID (optional)" value={textZoneId}
          onChange={e => setTextZoneId(e.target.value)} />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm py-1.5 px-3">Cancel</button>
        <button type="submit" className="btn-primary text-sm py-1.5 px-3">Save</button>
      </div>
    </form>
  )
}

function AddItemModal({ onSave, onClose }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [textZoneId, setTextZoneId] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const body = { name, price: parseFloat(price) || 0, description, category }
    if (textZoneId) body.text_zone_id = textZoneId
    onSave(body)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-4">Add Menu Item</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input className="input-field" placeholder="Item name" value={name}
            onChange={e => setName(e.target.value)} required autoFocus />
          <input className="input-field" placeholder="Price ($0.00)" type="number" step="0.01" min="0" value={price}
            onChange={e => setPrice(e.target.value)} required />
          <input className="input-field" placeholder="Description (optional)" value={description}
            onChange={e => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <input className="input-field" placeholder="Category" value={category}
              onChange={e => setCategory(e.target.value)} />
            <input className="input-field" placeholder="Text zone ID (optional)" value={textZoneId}
              onChange={e => setTextZoneId(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Add Item</button>
          </div>
        </form>
      </div>
    </div>
  )
}