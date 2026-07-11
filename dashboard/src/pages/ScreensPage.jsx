import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import SkeletonLoader from '../components/SkeletonLoader'

export default function ScreensPage() {
  const [screens, setScreens] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchScreens = async () => {
      try {
        const token = localStorage.getItem('menuvo_token')
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
    fetchScreens()
  }, [])

  if (loading) return <SkeletonLoader />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Screens</h1>
        <p className="text-gray-500 mt-1 text-sm">All your TV screens across locations</p>
      </div>

      {screens.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-gray-100">
          <div className="text-4xl mb-3">🖥️</div>
          <h3 className="font-semibold text-gray-900 mb-1">No screens yet</h3>
          <p className="text-gray-500 text-sm">Screens will appear here once they're set up.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {screens.map(s => (
            <Link key={s.id} to={`/dashboard/screens/${s.unique_slug}`}
              className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:border-brand-200 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">🖥️</span>
                </div>
                <BadgeOnline />
              </div>
              <h3 className="font-semibold text-gray-900">{s.name}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{s.restaurantName}</p>
              <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
                <span>{s.orientation || 'landscape'}</span>
                <span>·</span>
                <span>Slug: {s.unique_slug?.substring(0, 8)}...</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function BadgeOnline() {
  return <span className="badge-green">Unknown</span>
}