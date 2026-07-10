import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ScreenCard from '../components/ScreenCard'
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

      // If no restaurants, stop here (will show onboarding CTA)
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

      // Fetch recent menu items
      const itemPromises = screens.map(async (s) => {
        try {
          const ir = await fetch(`/api/screens/${s.id}/menu-items`, { headers })
          if (ir.ok) {
            const id = await ir.json()
            return (id.menu_items || []).slice(0, 5).map(i => ({ ...i, screenName: s.name, screenSlug: s.unique_slug }))
          }
        } catch {}
        return []
      })
      const itemResults = await Promise.allSettled(itemPromises)
      const items = itemResults.flatMap(r => r.status === 'fulfilled' ? r.value : [])
      setAllItems(items.slice(0, 10))
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

  if (loading) return <SkeletonLoader />

  return (
    <div className="space-y-6">
      {/* Header with quick actions */}
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
              className="btn-secondary text-sm flex items-center gap-1.5">
              🚀 Setup Wizard
            </button>
            <button onClick={() => navigate('/dashboard/screens')}
              className="btn-primary text-sm flex items-center gap-1.5">
              + New Screen
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">Restaurants</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{restaurants.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">Total Screens</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalCount}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">Online</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{onlineCount}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">Sold Out Items</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{soldOutCount}</p>
        </div>
      </div>

      {/* Empty state with onboarding CTA */}
      {restaurants.length === 0 ? (
        <div className="bg-white rounded-xl p-8 md:p-12 text-center shadow-sm border border-gray-100">
          <div className="text-5xl mb-4">🏪</div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Welcome to Menuvo!</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Get started with our quick setup wizard — it only takes a few minutes to create your first restaurant, add a screen, and start displaying your menu.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => navigate('/onboarding')}
              className="btn-primary text-lg px-8 py-3">
              🚀 Start Setup Wizard
            </button>
            <Link to="/dashboard/settings" className="btn-secondary text-lg px-8 py-3">
              Manual Setup
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Restaurants */}
          {restaurants.map(r => (
            <div key={r.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 text-lg">{r.name}</h3>
                <Link to="/dashboard/screens" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                  View All Screens →
                </Link>
              </div>
              <div className="p-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {allScreens.filter(s => s.restaurantId === r.id).map(s => (
                  <ScreenCard key={s.id} screen={s} health={healthData[s.unique_slug]} />
                ))}
                {allScreens.filter(s => s.restaurantId === r.id).length === 0 && (
                  <p className="text-sm text-gray-400 col-span-full text-center py-6">
                    No screens yet. Add one in <Link to="/dashboard/screens" className="text-brand-600 font-medium">Screens</Link>.
                  </p>
                )}
              </div>
            </div>
          ))}

          {/* Recent Menu Items - Desktop data table */}
          {allItems.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Recent Menu Items</h3>
                <p className="text-xs text-gray-400 mt-0.5">Across all screens</p>
              </div>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-3 font-medium text-gray-500">Name</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-500">Screen</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-500">Category</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">Price</th>
                      <th className="text-center px-5 py-3 font-medium text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {allItems.map((item, i) => (
                      <tr key={item.id || i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-900">{item.name}</td>
                        <td className="px-5 py-3 text-gray-500">{item.screenName}</td>
                        <td className="px-5 py-3 text-gray-500">{item.category || '—'}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-700">
                          ${parseFloat(item.price || 0).toFixed(2)}
                        </td>
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
                {allItems.slice(0, 5).map((item, i) => (
                  <div key={i} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{item.name}</p>
                      <p className="text-xs text-gray-400">{item.screenName}</p>
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
        </>
      )}

      {/* Keyboard shortcuts hint (desktop only) */}
      <div className="hidden md:block text-center text-xs text-gray-400 pt-2">
        <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-1 rounded mr-2 font-mono">G</span> Go to Screens
        <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-1 rounded mx-2 font-mono">H</span> Home
        <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-1 rounded mx-2 font-mono">?</span> Toggle help
      </div>
    </div>
  )
}

// Keyboard shortcut listener (attach once globally)
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
  const link = { 'g': '/dashboard/screens', 'h': '/dashboard' }[e.key.toLowerCase()]
  if (link) window.location.href = link
})