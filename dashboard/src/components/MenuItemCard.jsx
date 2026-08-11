export default function MenuItemCard({ item, onToggleSoldOut, syncing = false }) {
  const isSoldOut = item.availability === 'sold_out'

  return (
    <div className="px-5 py-3.5 flex items-center gap-4 hover:bg-brand-surface-alt/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-brand-text truncate">{item.name}</h4>
          {isSoldOut && (
            <span className="badge-red text-xs">Sold Out</span>
          )}
        </div>
        {item.description && (
          <p className="text-sm text-brand-muted truncate mt-0.5">{item.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1">
          <span className="text-sm font-semibold text-brand-text">
            ${parseFloat(item.price || 0).toFixed(2)}
          </span>
          {item.category && (
            <span className="text-xs text-brand-muted/60 bg-brand-surface-alt px-2 py-0.5 rounded-full">
              {item.category}
            </span>
          )}
          {item.text_zone_id && (
            <span className="text-xs text-brand-primary">{item.text_zone_id}</span>
          )}
        </div>
      </div>
      <button
        onClick={() => !syncing && onToggleSoldOut()}
        disabled={syncing}
        aria-label={isSoldOut ? 'Mark available' : 'Mark sold out'}
        className={`min-w-[80px] h-9 rounded-lg text-xs font-bold transition-all duration-150 touch-manipulation ${
          isSoldOut
            ? 'bg-green-500 hover:bg-green-600 text-white shadow-[0_0_10px_rgba(34,197,94,0.3)]'
            : 'bg-red-500 hover:bg-red-600 text-white shadow-[0_0_10px_rgba(239,68,68,0.3)]'
        } ${syncing ? 'opacity-50 cursor-default' : 'active:scale-95'}`}
      >
        {syncing ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-white/80 animate-pulse" />
            Syncing
          </span>
        ) : isSoldOut ? (
          'Available'
        ) : (
          'Sold Out'
        )}
      </button>
    </div>
  )
}
