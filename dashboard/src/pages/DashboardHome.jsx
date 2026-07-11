import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import SkeletonLoader from '../components/SkeletonLoader'
import { useAuth } from '../contexts/AuthContext'

export default function DashboardHome() {
  const [restaurants, setRestaurants] = useState([])
  const [allScreens, setAllScreens] = useState([])
  const [loading, setLoading] = useState(true)
  const [healthData, setHealthData] = useState({})
  const [allItems, setAllItems] = useState([])
  const { user } = useAuth()
  const navigate = useNavigate()

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('menuvo_token')
      const headers = { Authorization: `Bearer ${token}` }

      const res = await fetch('/api/restaurants', { headers })
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      const restaurantsList = data.restaurants || []
      setRestaurants(restaurantsList)

      if (restaurantsList.length === 0) { setLoading(false); return }

      const screenPromises = restaurantsList.map(async (r) => {
        const sr = await fetch(`/api/restaurants/${r.id}/screens`, { headers })
        if (!sr.ok) return []
        const sd = await sr.json()
        return (sd.screens || []).map(s => ({ ...s, restaurantName: r.name, restaurantId: r.id }))
      })
      const screenResults = await Promise.allSettled(screenPromises)
      const screens = screenResults.flatMap(r => r.status === 'fulfilled' ? r.value : [])
      setAllScreens(screens)

      // Fetch health for each screen
      const healthPromises = screens.map(async (s) => {
        try {
          const hr = await fetch(`/api/screens/${s.unique_slug}/health`, { headers })
          if (hr.ok) {
            const hd = await hr.json()
            return { slug: s.unique_slug, ...hd }
          }
        } catch {}
        return { slug: s.unique_slug, is_online: false, last_sync_at: null }
      })
      const healthResults = await Promise.allSettled(healthPromises)
      const healthMap = {}
      healthResults.forEach(r => {
        if (r.status === 'fulfilled' && r.value) healthMap[r.value.slug] = r.value
      })
      setHealthData(healthMap)

      // Fetch menu items for each screen
      const itemPromises = screens.map(async (s) => {
        try {
          const ir = await fetch(`/api/screens/${s.id}/menu-items`, { headers })
          if (ir.ok) {
            const id = await ir.json()
            return (id.menu_items || []).map(i => ({ ...i, screenName: s.name, screenUuid: s.id, screenSlug: s.unique_slug }))
          }
        } catch {}
        return []
      })
      const itemResults = await Promise.allSettled(itemPromises)
      const items = itemResults.flatMap(r => r.status === 'fulfilled' ? r.value : [])
      setAllItems(items)
    } catch { /* server not ready */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const onlineCount = allScreens.filter(s => healthData[s.unique_slug]?.is_online).length
  const totalCount = allScreens.length
  const soldOutCount = allItems.filter(i => i.availability === 'sold_out').length
  const totalItemsCount = allItems.length
  const avgItemsPerScreen = totalCount > 0 ? Math.round(totalItemsCount / totalCount) : 0

  if (loading) return <SkeletonLoader />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Welcome{user?.name ? `, ${user.name}` : ''} 👋
          </h1>
          <p className="text-gray-500 mt-1">Monitor your screens and menus at a glance</p>
        </div>
        {restaurants.length > 0 && (
          <div className="flex gap-2">
            <button onClick={() => navigate('/onboarding')}
              className="btn-secondary text-sm flex items-center gap-1.5">🚀 Setup Wizard</button>
            <button onClick={() => navigate('/dashboard/screens')}
              className="btn-primary text-sm flex items-center gap-1.5">+ New Screen</button>
          </div>
        )}
      </div>

      {/* Summary Cards - richer metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Restaurants</p>
            <span className="text-lg">🏪</span>
          </div>
          <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-2">{restaurants.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Screens</p>
            <span className="text-lg">🖥️</span>
          </div>
          <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-2">{totalCount}</p>
          <p className="text-xs text-gray-400 mt-1">{avgItemsPerScreen} items/screen avg</p>
        </div>
        <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Online</p>
            <span className={`inline-block w-3 h-3 rounded-full ${onlineCount > 0 ? 'bg-green-500' : 'bg-gray-300'}`} />
          </div>
          <p className="text-2xl md:text-3xl font-bold text-green-600 mt-2">{onlineCount} / {totalCount}</p>
          <p className="text-xs text-gray-400 mt-1">{totalCount > 0 ? Math.round(onlineCount / totalCount * 100) : 0}% uptime</p>
        </div>
        <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Items</p>
            <span className="text-lg">📝</span>
          </div>
          <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-2">{totalItemsCount}</p>
          <p className="text-xs text-red-500 mt-1">{soldOutCount} sold out</p>
        </div>
      </div>

      {/* Screen Health Grid */}
      {allScreens.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Screen Health</h3>
              <p className="text-xs text-gray-400 mt-0.5">Real-time status of all your TV displays</p>
            </div>
          </div>
          {/* Desktop grid */}
          <div className="hidden md:overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Screen</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Location</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Items</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Last Synced</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Orientation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {allScreens.map(s => {
                  const h = healthData[s.unique_slug]
                  const isOnline = h?.is_online ?? true
                  const itemCount = allItems.filter(i => i.screenUuid === s.id).length
                  return (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/dashboard/screens/${s.unique_slug}`)}>
                      <td className="px-5 py-3">
                        <span className="font-medium text-gray-900">{s.name}</span>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{s.restaurantName}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 ${isOnline ? 'text-green-600' : 'text-red-500'}`}>
                          <span className={`inline-block w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{itemCount}</td>
                      <td className="px-5 py-3 text-gray-400">
                        {h?.last_sync_at ? timeAgo(h.last_sync_at) : 'Never'}
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-500">
                          {s.orientation || 'landscape'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {allScreens.map(s => {
              const h = healthData[s.unique_slug]
              const isOnline = h?.is_online ?? true
              return (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between"
                  onClick={() => navigate(`/dashboard/screens/${s.unique_slug}`)}>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.restaurantName}</p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                      isOnline ? 'text-green-600' : 'text-red-500'
                    }`}>
                      <span className={`inline-block w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {h?.last_sync_at ? timeAgo(h.last_sync_at) : ''}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Menu Items Data Table (desktop only) */}
      {allItems.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">All Menu Items</h3>
            <p className="text-xs text-gray-400 mt-0.5">{totalItemsCount} items across {totalCount} screens</p>
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Name</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Screen</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Category</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">Price</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Zone</th>
                  <th className="text-center px-5 py-3 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {allItems.map((item, i) => (
                  <tr key={item.id || i} className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/dashboard/screens/${item.screenSlug}/menu`)}>
                    <td className="px-5 py-3 font-medium text-gray-900">{item.name}</td>
                    <td className="px-5 py-3 text-gray-500">{item.screenName}</td>
                    <td className="px-5 py-3 text-gray-500">{item.category || '—'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-700">
                      ${parseFloat(item.price || 0).toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{item.text_zone_id || '—'}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`badge ${item.availability === 'sold_out' ? 'badge-red' : 'badge-green'}`}>
                        {item.availability === 'sold_out' ? 'Sold Out' : 'Available'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile list */}
          <div className="md:hidden divide-y divide-gray-100">
            {allItems.slice(0, 8).map((item, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.screenName}{item.category ? ` · ${item.category}` : ''}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-700">${parseFloat(item.price || 0).toFixed(2)}</p>
                  {item.availability === 'sold_out' && <span className="badge-red text-xs">Sold Out</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state with onboarding */}
      {restaurants.length === 0 && (
        <div className="bg-white rounded-xl p-8 md:p-12 text-center shadow-sm border border-gray-100">
          <div className="text-5xl mb-4">🏪</div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Welcome to Menuvo!</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Get started with our quick setup wizard — it only takes a few minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => navigate('/onboarding')}
              className="btn-primary text-lg px-8 py-3">🚀 Start Setup Wizard</button>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts footer */}
      <div className="hidden md:block text-center text-xs text-gray-400 pt-2">
        <span
          className="inline-flex items-center gap-1 bg-gray-100 px-2 py-1 rounded cursor-default">
          <kbd className="font-mono">?</kbd> Keyboard shortcuts
        </span>
      </div>
    </div>
  )
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1m ago'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs === 1) return '1h ago'
  return `${hrs}h ago`
}