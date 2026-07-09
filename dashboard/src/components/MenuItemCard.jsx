import { useState } from 'react'

export default function MenuItemCard({ item, onToggleSoldOut }) {
  const [toggling, setToggling] = useState(false)
  const isSoldOut = item.availability === 'sold_out'

  const handleToggle = async () => {
    if (toggling) return
    setToggling(true)
    await onToggleSoldOut()
    setToggling(false)
  }

  return (
    <div className="px-5 py-3.5 flex items-center gap-4 hover:bg-gray-50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-gray-900 truncate">{item.name}</h4>
          {isSoldOut && (
            <span className="badge-red text-xs">Sold Out</span>
          )}
        </div>
        {item.description && (
          <p className="text-sm text-gray-500 truncate mt-0.5">{item.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1">
          <span className="text-sm font-semibold text-gray-900">
            ${parseFloat(item.price || 0).toFixed(2)}
          </span>
          {item.category && (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {item.category}
            </span>
          )}
          {item.text_zone_id && (
            <span className="text-xs text-blue-500">{item.text_zone_id}</span>
          )}
        </div>
      </div>
      <button
        onClick={handleToggle}
        disabled={toggling}
        className={`min-w-[80px] h-9 rounded-lg text-xs font-bold transition-all duration-150 touch-manipulation ${
          isSoldOut
            ? 'bg-green-500 hover:bg-green-600 text-white'
            : 'bg-red-500 hover:bg-red-600 text-white'
        } ${toggling ? 'opacity-50' : ''}`}
      >
        {toggling ? '...' : isSoldOut ? 'Available' : 'Sold Out'}
      </button>
    </div>
  )
}