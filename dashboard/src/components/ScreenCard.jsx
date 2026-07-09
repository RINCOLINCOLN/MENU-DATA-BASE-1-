import { Link } from 'react-router-dom'

export default function ScreenCard({ screen, health }) {
  const isOnline = health?.is_online ?? true

  return (
    <Link to={`/dashboard/screens/${screen.id}`}
      className="block bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="font-medium text-sm text-gray-900 truncate max-w-[120px]">{screen.name}</span>
        </div>
      </div>
      <div className="text-xs text-gray-400">
        {isOnline ? (
          <>Online{health?.last_sync_at ? ` · ${timeAgo(health.last_sync_at)}` : ''}</>
        ) : (
          <>Offline{health?.last_sync_at ? ` since ${timeAgo(health.last_sync_at)}` : ''}</>
        )}
      </div>
      <div className="text-xs text-gray-400 mt-0.5">{screen.orientation}</div>
    </Link>
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