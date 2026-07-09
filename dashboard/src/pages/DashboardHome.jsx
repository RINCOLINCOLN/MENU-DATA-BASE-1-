import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ScreenCard from '../components/ScreenCard'
import SkeletonLoader from '../components/SkeletonLoader'

export default function DashboardHome() {
  const [restaurants, setRestaurants] = useState([])
  const [allScreens, setAllScreens] = useState([])
  const [loading, setLoading] = useState(true)
  const [healthData, setHealthData] = useState({})

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('menuvo_token')
      const headers = { Authorization: `Bearer ${token}` }

      const res = await fetch('/api/restaurants', { headers })
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      const restaurantsList = data.restaurants || []
      setRestaurants(restaurantsList)

      const screenPromises = restaurantsList.map(async (r) => {
        const sr = await fetch(`/api/restaurants/${r.id}/screens`, { headers })
        if (!sr.ok) return []
        const sd = await sr.json()
        return (sd.screens || []).map(s => ({ ...s, restaurantName: r.name, restaurantId: r.id }))
      })
      const screenResults = await Promise.allSettled(screenPromises)
      const screens = screenResults.flatMap(r => r.status === 'fulfilled' ? r.value : [])
      setAllScreens(screens)

      // Fetch health for each screen (uses slug)
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
        if (r.status === 'fulfilled' && r.value) {
          healthMap[r.value.slug] = r.value
        }
      })
      setHealthData(healthMap)
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

  if (loading) return <SkeletonLoader />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Monitor your screens and menus at a glance</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Restaurants</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{restaurants.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Total Screens</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalCount}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Online</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{onlineCount}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Offline</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{totalCount - onlineCount}</p>
        </div>
      </div>

      {restaurants.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-gray-100">
          <div className="text-4xl mb-3">🏪</div>
          <h3 className="font-semibold text-gray-900 mb-1">Welcome to Menuvo!</h3>
          <p className="text-gray-500 text-sm mb-4">Add your first restaurant location to get started.</p>
          <Link to="/dashboard/settings" className="btn-primary inline-block">Add Location</Link>
        </div>
      ) : (
        restaurants.map(r => (
          <div key={r.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{r.name}</h3>
              </div>
              <Link to="/dashboard/screens" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                View Screens
              </Link>
            </div>
            <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {allScreens.filter(s => s.restaurantId === r.id).map(s => (
                <ScreenCard key={s.id} screen={s} health={healthData[s.unique_slug]} />
              ))}
              {allScreens.filter(s => s.restaurantId === r.id).length === 0 && (
                <p className="text-sm text-gray-400 col-span-full text-center py-4">
                  No screens yet
                </p>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}