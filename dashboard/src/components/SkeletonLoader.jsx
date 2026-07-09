export default function SkeletonLoader() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 skeleton" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 skeleton" />
        ))}
      </div>
      <div className="h-48 skeleton" />
      <div className="h-32 skeleton" />
    </div>
  )
}