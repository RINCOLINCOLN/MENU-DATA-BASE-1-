import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import SkeletonLoader from '../components/SkeletonLoader'
import { useToast } from '../contexts/ToastContext'
import { api } from '../lib/api'
import { getToken, setToken, clearToken } from '../lib/token'

export default function ScreensPage() {
  const [screens, setScreens] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const { addToast } = useToast()
  const navigate = useNavigate()

  const fetchScreens = async () => {
    try {
      const token = getToken()
      const res = await fetch('/api/restaurants', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      const restaurants = data.restaurants || []
      const allScreens = []
      for (const r of restaurants) {
        const sr = await fetch(`/api/restaurants/${r.id}/screens`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (sr.ok) {
          const sd = await sr.json()
          const screensList = sd.screens || []
          screensList.forEach(s => {
            allScreens.push({ ...s, restaurantName: r.name })
          })
        }
      }
      setScreens(allScreens)
    } catch { /* server not ready */ }
    setLoading(false)
  }

  useEffect(() => { fetchScreens() }, [])

  // Indexes of each screen within its restaurant group (contiguous in the flat list)
  const groupIndexes = useMemo(() => {
    const groups = {}
    screens.forEach((s, i) => {
      (groups[s.restaurant_id] = groups[s.restaurant_id] || []).push(i)
    })
    return groups
  }, [screens])

  const isFirstInGroup = (s) => {
    const g = groupIndexes[s.restaurant_id] || []
    return g.indexOf(screens.findIndex(x => x.id === s.id)) === 0
  }

  const isLastInGroup = (s) => {
    const g = groupIndexes[s.restaurant_id] || []
    return g.indexOf(screens.findIndex(x => x.id === s.id)) === g.length - 1
  }

  const moveScreen = async (screen, dir) => {
    if (busyId) return
    const idx = screens.findIndex(x => x.id === screen.id)
    const g = groupIndexes[screen.restaurant_id] || []
    const posInGroup = g.indexOf(idx)
    const targetPos = posInGroup + dir
    if (targetPos < 0 || targetPos >= g.length) return

    // Optimistic local swap
    const next = [...screens]
    const targetIdx = g[targetPos]
    ;[next[idx], next[targetIdx]] = [next[targetIdx], next[idx]]
    setScreens(next)

    // Persist the restaurant group's new order
    const ids = g.map(gi => next[gi].id)
    setBusyId(screen.id)
    try {
      await api.reorderScreens(ids)
      addToast('Screen order saved', 'success')
      fetchScreens()
    } catch {
      addToast('Could not save new order', 'error')
      fetchScreens() // revert to server state
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteScreen(deleteTarget.id)
      addToast(`Deleted "${deleteTarget.name}"`, 'success')
      setDeleteTarget(null)
      fetchScreens()
    } catch {
      addToast('Could not delete screen', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleScreenCreated = async (screen) => {
    setAddOpen(false)
    addToast(`"${screen.name}" created — design it now`, 'success')
    fetchScreens()
    // Jump straight into the designer for the new display
    navigate(`/dashboard/screens/${screen.unique_slug}/design`)
  }

  if (loading) return <SkeletonLoader />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-text">Screens</h1>
          <p className="text-brand-muted mt-1 text-sm">All your TV screens across locations</p>
        </div>
        <button onClick={() => setAddOpen(true)}
          className="btn-primary flex items-center gap-1.5 shrink-0">＋ Add Screen</button>
      </div>

      {screens.length === 0 ? (
        <div className="bg-brand-surface rounded-xl p-8 text-center shadow-sm border border-brand-border/40">
          <div className="text-4xl mb-3">🖥️</div>
          <h3 className="font-semibold text-brand-text mb-1">No screens yet</h3>
          <p className="text-brand-muted text-sm">Screens will appear here once they're set up.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {screens.map(s => {
            const first = isFirstInGroup(s)
            const last = isLastInGroup(s)
            const busy = busyId === s.id
            return (
              <div key={s.id}
                className="bg-brand-surface rounded-xl shadow-sm border border-brand-border/40 overflow-hidden hover:shadow-md transition-shadow">
                {/* Navigate to screen detail */}
                <Link to={`/dashboard/screens/${s.unique_slug}`}
                  className="block p-5 pb-4 hover:bg-brand-surface-alt/40 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-12 h-12 bg-brand-primary/15 rounded-xl flex items-center justify-center">
                      <span className="text-2xl">🖥️</span>
                    </div>
                    <BadgeOnline />
                  </div>
                  <h3 className="font-semibold text-brand-text group-hover:text-brand-glow">{s.name}</h3>
                  <p className="text-sm text-brand-muted mt-0.5">{s.restaurantName}</p>
                  <div className="flex items-center gap-2 mt-3 text-xs text-brand-muted/60">
                    <span>{s.orientation || 'landscape'}</span>
                    <span>·</span>
                    <span>Slug: {s.unique_slug?.substring(0, 8)}...</span>
                  </div>
                </Link>

                {/* Action row: reorder + delete */}
                <div className="flex items-center justify-between gap-2 px-3 pb-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => moveScreen(s, -1)}
                      disabled={first || busy}
                      aria-label={`Move ${s.name} up`}
                      title="Move up"
                      className="w-11 h-11 flex items-center justify-center rounded-lg border border-brand-border/60 text-brand-muted hover:text-brand-text hover:bg-brand-surface-alt hover:border-brand-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-manipulation"
                    >
                      <ChevronUpIcon />
                    </button>
                    <button
                      onClick={() => moveScreen(s, 1)}
                      disabled={last || busy}
                      aria-label={`Move ${s.name} down`}
                      title="Move down"
                      className="w-11 h-11 flex items-center justify-center rounded-lg border border-brand-border/60 text-brand-muted hover:text-brand-text hover:bg-brand-surface-alt hover:border-brand-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-manipulation"
                    >
                      <ChevronDownIcon />
                    </button>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(s)}
                    disabled={busy}
                    aria-label={`Delete screen ${s.name}`}
                    title="Delete screen"
                    className="w-11 h-11 flex items-center justify-center rounded-lg border border-brand-border/60 text-red-400/80 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-manipulation"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {deleteTarget && (
        <DeleteScreenModal
          screen={deleteTarget}
          deleting={deleting}
          onClose={() => { if (!deleting) setDeleteTarget(null) }}
          onConfirm={handleDelete}
        />
      )}

      {addOpen && (
        <AddScreenModal onClose={() => setAddOpen(false)} onCreated={handleScreenCreated} />
      )}
    </div>
  )
}

function BadgeOnline() {
  return <span className="badge-green">Unknown</span>
}

function AddScreenModal({ onClose, onCreated }) {
  const [restaurants, setRestaurants] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [restaurantId, setRestaurantId] = useState('')
  const [name, setName] = useState('')
  const [orientation, setOrientation] = useState('landscape')
  const [templateId, setTemplateId] = useState('')
  const [creating, setCreating] = useState(false)
  const { addToast } = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        const [r, t] = await Promise.all([api.getRestaurants(), api.getTemplates()])
        setRestaurants(r.restaurants || [])
        setTemplates(t.templates || [])
        if ((r.restaurants || []).length === 1) setRestaurantId(r.restaurants[0].id)
      } catch {
        addToast('Could not load locations', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) { addToast('Give the screen a name', 'error'); return }
    if (!restaurantId) { addToast('Choose a location', 'error'); return }
    setCreating(true)
    try {
      const res = await api.createScreen(restaurantId, {
        name: name.trim(),
        orientation,
        template_id: templateId || undefined,
      })
      onCreated(res.screen)
    } catch (err) {
      addToast(err.message || 'Could not create screen', 'error')
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => { if (!creating) onClose() }}>
      <div className="bg-brand-surface rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-brand-border/50 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-brand-text">Add Screen</h3>
            <p className="text-sm text-brand-muted">Create a new TV display — you can design it right after.</p>
          </div>
          <button onClick={onClose} disabled={creating}
            className="p-1.5 hover:bg-brand-surface-alt/70 rounded-lg text-brand-muted">✕</button>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-11 skeleton rounded-lg" />
            <div className="h-11 skeleton rounded-lg" />
            <div className="h-11 skeleton rounded-lg" />
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-brand-text/80 mb-1">Location</label>
              {restaurants.length === 0 ? (
                <p className="text-sm text-brand-muted/70 bg-brand-surface-alt/50 rounded-lg p-3">
                  No locations yet — <Link to="/onboarding" className="text-amber-400 hover:underline font-medium">add one first</Link>.
                </p>
              ) : (
                <select className="input-field" value={restaurantId} onChange={e => setRestaurantId(e.target.value)} required>
                  <option value="">Select a location...</option>
                  {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-text/80 mb-1">Screen name</label>
              <input className="input-field" placeholder="e.g. Drive-Thru Board, Breakfast Menu, Bar Display"
                value={name} onChange={e => setName(e.target.value)} autoFocus required />
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-text/80 mb-1">Orientation</label>
              <div className="flex gap-3">
                {[
                  { value: 'landscape', icon: '🖥️', label: 'Landscape (16:9)' },
                  { value: 'portrait', icon: '📱', label: 'Portrait (9:16)' },
                ].map(o => (
                  <button key={o.value} type="button" onClick={() => setOrientation(o.value)}
                    className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                      orientation === o.value ? 'border-amber-400 bg-amber-400/10 text-amber-300' : 'border-brand-border/50 text-brand-muted'
                    }`}>
                    <span className="mr-1.5">{o.icon}</span>{o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-text/80 mb-1">
                Background template <span className="text-brand-muted/60 font-normal">(optional — start plain, add later)</span>
              </label>
              <select className="input-field" value={templateId} onChange={e => setTemplateId(e.target.value)}>
                <option value="">No background yet</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name} {t.orientation ? `(${t.orientation})` : ''}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={onClose} disabled={creating} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={creating || !name.trim() || !restaurantId}
                className="btn-primary flex items-center gap-2 touch-manipulation">
                {creating && <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
                {creating ? 'Creating...' : 'Create Screen'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function DeleteScreenModal({ screen, deleting, onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-brand-surface rounded-2xl w-full max-w-md p-6 shadow-2xl border border-brand-border/50"
        onClick={e => e.stopPropagation()}>
        <div className="w-12 h-12 bg-red-500/15 rounded-xl flex items-center justify-center mb-3">
          <TrashIcon className="w-6 h-6 text-red-400" />
        </div>
        <h3 className="text-lg font-bold text-brand-text">Delete screen?</h3>
        <p className="text-sm text-brand-muted mt-2">
          <strong className="text-brand-text">"{screen.name}"</strong> ({screen.restaurantName}) will be
          permanently removed, along with all of its menu items and schedules.
          The TV board will stop updating immediately.
        </p>
        <div className="flex gap-3 justify-end mt-6">
          <button onClick={onClose} disabled={deleting} className="btn-secondary">Cancel</button>
          <button onClick={onConfirm} disabled={deleting}
            className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 px-5 rounded-lg transition-colors duration-150 flex items-center gap-2 touch-manipulation">
            {deleting && <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
            {deleting ? 'Deleting...' : 'Delete Screen'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChevronUpIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5 10 7.5l5 5" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 7.5 10 12.5l5-5" />
    </svg>
  )
}

function TrashIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 6.5h11M8.5 6.5V4.5h3v2M6 6.5l.6 9h6.8l.6-9M8.5 9.5v3.5M11.5 9.5v3.5" />
    </svg>
  )
}
