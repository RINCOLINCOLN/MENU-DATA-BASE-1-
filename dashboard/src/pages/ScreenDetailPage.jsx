import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import MenuItemCard from '../components/MenuItemCard'
import PreviewModal from '../components/PreviewModal'
import SkeletonLoader from '../components/SkeletonLoader'
import { useToast } from '../contexts/ToastContext'

export default function ScreenDetailPage() {
  const { screenId } = useParams() // can be UUID or friendly slug
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [screen, setScreen] = useState(null)
  const [screenUuid, setScreenUuid] = useState(null) // store the actual UUID for API calls
  const [menuItems, setMenuItems] = useState([])
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [templates, setTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [assigningTemplate, setAssigningTemplate] = useState(false)

  const token = localStorage.getItem('menuvo_token')
  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sRes, tRes] = await Promise.allSettled([
          fetch(`/api/screens/${screenId}`, { headers }),
          fetch('/api/templates', { headers }),
        ])
        if (sRes.status === 'fulfilled' && sRes.value.ok) {
          const data = await sRes.value.json()
          setScreen(data.screen)
          setScreenUuid(data.screen?.id) // store UUID for subsequent API calls
          setSelectedTemplateId(data.screen?.template_id || '')
          // Fetch health by slug
          const slug = data.screen?.unique_slug
          if (slug) {
            try {
              const hRes = await fetch(`/api/screens/${slug}/health`)
              if (hRes.ok) setHealth(await hRes.json())
            } catch {}
          }
          // Fetch menu items using the UUID (not slug)
          if (data.screen?.id) {
            try {
              const iRes = await fetch(`/api/screens/${data.screen.id}/menu-items`, { headers })
              if (iRes.ok) {
                const iData = await iRes.json()
                setMenuItems(iData.menu_items || [])
              }
            } catch {}
          }
        }
        if (tRes.status === 'fulfilled' && tRes.value.ok) {
          const data = await tRes.value.json()
          setTemplates(data.templates || [])
        }
      } catch { /* server not ready */ }
      setLoading(false)
    }
    fetchData()
  }, [screenId])

  const handleToggleSoldOut = async (itemId, currentAvailability) => {
    try {
      const newAvailability = currentAvailability === 'sold_out' ? 'available' : 'sold_out'
      const res = await fetch(`/api/menu-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ availability: newAvailability }),
      })
      if (res.ok) {
        const updated = await res.json()
        setMenuItems(prev => prev.map(i => i.id === itemId ? updated.menu_item : i))
        addToast(newAvailability === 'sold_out' ? 'Marked as sold out!' : 'Marked as available!', 'success')
      } else addToast('Failed to update item', 'error')
    } catch { addToast('Network error', 'error') }
  }

  const handleAssignTemplate = async (templateId) => {
    setAssigningTemplate(true)
    try {
      const res = await fetch(`/api/screens/${screenId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ template_id: templateId || null }),
      })
      if (res.ok) {
        addToast(templateId ? 'Template assigned!' : 'Template removed', 'success')
        setSelectedTemplateId(templateId)
      } else addToast('Failed to assign template', 'error')
    } catch { addToast('Network error', 'error') }
    setAssigningTemplate(false)
  }
  if (loading) return <SkeletonLoader />
  if (!screen) return <div className="text-center py-12 text-gray-500">Screen not found</div>
  const isOnline = health?.is_online ?? true
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/dashboard/screens')}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">← Back</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{screen.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-500">
              {isOnline ? 'Online' : 'Offline'}
              {health?.last_sync_at && ` · synced ${new Date(health.last_sync_at).toLocaleTimeString()}`}
            </span>
            <span className="text-xs text-gray-400">· {screen.orientation}</span>
            <span className="text-xs text-gray-400">· slug: {screen.unique_slug}</span>
          </div>
        </div>
      </div>
      <div className="flex gap-3 flex-wrap">
        <Link to={`/dashboard/screens/${screenId}/menu`}
          className="btn-primary flex items-center gap-2">✏️ Edit Menu</Link>
        {screen.unique_slug && (
          <button onClick={() => setPreviewOpen(true)}
            className="btn-secondary flex items-center gap-2">👁️ Preview TV</button>
        )}
      </div>
      {/* Template Assignment */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-sm font-medium text-gray-700">Background Template:</label>
          <select className="input-field w-auto min-w-[200px]"
            value={selectedTemplateId}
            onChange={e => handleAssignTemplate(e.target.value)}
            disabled={assigningTemplate}>
            <option value="">No template (solid background)</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} {t.orientation ? `(${t.orientation})` : ''}
              </option>
            ))}
          </select>
          {assigningTemplate && <span className="text-sm text-gray-400">Updating...</span>}
          {templates.length === 0 && (
            <Link to="/dashboard/templates" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
              + Upload a template
            </Link>
          )}
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Menu Items</h3>
          <span className="text-sm text-gray-400">{menuItems.length} items</span>
        </div>
        <div className="divide-y divide-gray-100">
          {menuItems.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              No menu items yet. Add some in Edit Menu.
            </div>
          ) : (
            menuItems.map(item => (
              <MenuItemCard
                key={item.id}
                item={item}
                onToggleSoldOut={() => handleToggleSoldOut(item.id, item.availability)}
              />
            ))
          )}
        </div>
      </div>
      {previewOpen && screen.unique_slug && (
        <PreviewModal slug={screen.unique_slug} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  )
}