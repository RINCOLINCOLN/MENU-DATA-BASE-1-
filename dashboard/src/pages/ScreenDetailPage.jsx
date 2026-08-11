import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import MenuItemCard from '../components/MenuItemCard'
import PreviewModal from '../components/PreviewModal'
import SkeletonLoader from '../components/SkeletonLoader'
import { useToast } from '../contexts/ToastContext'
import api from '../lib/api'

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
  const [syncingIds, setSyncingIds] = useState(new Set())

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sRes, tRes] = await Promise.allSettled([
          api.getScreen(screenId),
          api.getTemplates(),
        ])
        if (sRes.status === 'fulfilled') {
          const data = sRes.value
          setScreen(data.screen)
          setScreenUuid(data.screen?.id)
          setSelectedTemplateId(data.screen?.template_id || '')
          const slug = data.screen?.unique_slug
          if (slug) {
            try {
              const hRes = await api.getScreenHealth(slug)
              setHealth(hRes)
            } catch {}
          }
          if (data.screen?.id) {
            try {
              const iData = await api.getMenuItems(data.screen.id)
              setMenuItems(iData.menu_items || [])
            } catch {}
          }
        }
        if (tRes.status === 'fulfilled') {
          setTemplates(tRes.value.templates || [])
        }
      } catch { /* server not ready */ }
      setLoading(false)
    }
    fetchData()
  }, [screenId])

  const handleToggleSoldOut = async (itemId, currentAvailability) => {
    const newAvailability = currentAvailability === 'sold_out' ? 'available' : 'sold_out'
    const prev = menuItems
    // Optimistic UI — flip instantly, then persist. Mid-rush this must feel instant.
    setMenuItems(prevItems => prevItems.map(i =>
      i.id === itemId ? { ...i, availability: newAvailability } : i
    ))
    setSyncingIds(prev => new Set(prev).add(itemId))
    try {
      const updated = await api.toggleSoldOut(itemId, newAvailability)
      setMenuItems(prevItems => prevItems.map(i =>
        i.id === itemId ? (updated.menu_item || i) : i
      ))
      addToast(newAvailability === 'sold_out' ? 'Marked as sold out!' : 'Marked as available!', 'success')
    } catch (err) {
      // Server sync failed — revert to the last known server state.
      setMenuItems(prev)
      addToast(err.message || 'Failed to update item', 'error')
    } finally {
      setSyncingIds(prev => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const handleAssignTemplate = async (templateId) => {
    setAssigningTemplate(true)
    try {
      await api.updateScreen(screenUuid || screenId, { template_id: templateId || null })
      addToast(templateId ? 'Template assigned!' : 'Template removed', 'success')
      setSelectedTemplateId(templateId)
    } catch (err) {
      addToast(err.message || 'Failed to assign template', 'error')
    }
    setAssigningTemplate(false)
  }
  if (loading) return <SkeletonLoader />
  if (!screen) return <div className="text-center py-12 text-brand-muted">Screen not found</div>
  const isOnline = health?.is_online ?? true
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/dashboard/screens')}
          className="p-2 hover:bg-brand-surface-alt/70 rounded-lg text-brand-muted">← Back</button>
        <div>
          <h1 className="text-2xl font-bold text-brand-text">{screen.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-500'}`} />
            <span className="text-sm text-brand-muted">
              {isOnline ? 'Online' : 'Offline'}
              {health?.last_sync_at && ` · synced ${new Date(health.last_sync_at).toLocaleTimeString()}`}
            </span>
            <span className="text-xs text-brand-muted/60">· {screen.orientation}</span>
            <span className="text-xs text-brand-muted/60">· slug: {screen.unique_slug}</span>
          </div>
        </div>
      </div>
      <div className="flex gap-3 flex-wrap">
        <Link to={`/dashboard/screens/${screenId}/design`}
          className="btn-primary flex items-center gap-2">🎨 Design Screen</Link>
        <Link to={`/dashboard/screens/${screenId}/menu`}
          className="btn-secondary flex items-center gap-2">✏️ Edit Menu</Link>
        {screen.unique_slug && (
          <button onClick={() => setPreviewOpen(true)}
            className="btn-secondary flex items-center gap-2">👁️ Preview TV</button>
        )}
      </div>
      {/* Template Assignment */}
      <div className="bg-brand-surface rounded-xl shadow-sm border border-brand-border/40 p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-sm font-medium text-brand-text/80">Background Template:</label>
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
          {assigningTemplate && <span className="text-sm text-brand-muted/60">Updating...</span>}
          {templates.length === 0 && (
            <Link to="/dashboard/templates" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
              + Upload a template
            </Link>
          )}
        </div>
      </div>
      <div className="bg-brand-surface rounded-xl shadow-sm border border-brand-border/40">
        <div className="px-5 py-3 border-b border-brand-border/40 flex items-center justify-between">
          <h3 className="font-semibold text-brand-text">Menu Items</h3>
          <span className="text-sm text-brand-muted/60">{menuItems.length} items</span>
        </div>
        <div className="divide-y divide-brand-border/20">
          {menuItems.length === 0 ? (
            <div className="p-8 text-center text-brand-muted/60 text-sm">
              No menu items yet. Add some in Edit Menu.
            </div>
          ) : (
            menuItems.map(item => (
              <MenuItemCard
                key={item.id}
                item={item}
                syncing={syncingIds.has(item.id)}
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