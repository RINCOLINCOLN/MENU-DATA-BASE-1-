import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const navItems = [
  { to: '/dashboard', label: 'Home', icon: '📊', end: true },
  { to: '/dashboard/screens', label: 'Screens', icon: '🖥️', end: false },
  { to: '/dashboard/templates', label: 'Templates', icon: '🎬', end: false },
  { to: '/dashboard/settings', label: 'Settings', icon: '⚙️', end: false },
]

export default function DashboardLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        // Enter to blur input (save), Escape to blur (cancel)
        if (e.key === 'Enter') e.target.blur()
        if (e.key === 'Escape') e.target.blur()
        return
      }
      switch (e.key.toLowerCase()) {
        case 'g': navigate('/dashboard/screens'); break
        case 'h': navigate('/dashboard'); break
        case 'w': navigate('/onboarding'); break
        case '?': setShowShortcuts(prev => !prev); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Desktop Sidebar - fixed */}
      <aside className="hidden md:flex md:flex-col md:w-64 lg:w-72 bg-emerald-900 text-white shrink-0 fixed left-0 top-0 bottom-0 z-20">
        <div className="p-5 border-b border-emerald-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">M</span>
            </div>
            <div>
              <h2 className="font-bold text-sm">Menuvo</h2>
              <p className="text-emerald-300 text-xs truncate max-w-[160px]">{user?.name || 'Restaurant'}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-emerald-700 text-white' : 'text-emerald-200 hover:bg-emerald-800 hover:text-white'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-emerald-800 space-y-1">
          <button onClick={() => navigate('/onboarding')}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-emerald-300 hover:bg-emerald-800 hover:text-white w-full transition-colors">
            <span className="text-lg">🚀</span>
            Setup Wizard
          </button>
          <button onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-emerald-300 hover:bg-emerald-800 hover:text-white w-full transition-colors">
            <span className="text-lg">🚪</span>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Spacer for fixed sidebar */}
      <div className="hidden md:block md:w-64 lg:w-72 shrink-0" />

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-emerald-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold">M</span>
          </div>
          <div>
            <h2 className="font-bold text-sm">Menuvo</h2>
            <p className="text-emerald-300 text-xs">{user?.name || 'Dashboard'}</p>
          </div>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 hover:bg-emerald-800 rounded-lg">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      </div>

      {/* Mobile slide-over */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-64 bg-emerald-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-emerald-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold">M</span>
                </div>
                <span className="font-bold">Menuvo</span>
              </div>
            </div>
            <nav className="space-y-1">
              {navItems.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      isActive ? 'bg-emerald-700 text-white' : 'text-emerald-200 hover:bg-emerald-800'
                    }`
                  }
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
              <button onClick={() => { setMobileMenuOpen(false); navigate('/onboarding') }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-emerald-200 hover:bg-emerald-800 w-full">
                <span className="text-lg">🚀</span> Setup Wizard
              </button>
            </nav>
            <div className="mt-6 pt-4 border-t border-emerald-800">
              <button onClick={handleLogout}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-emerald-300 hover:bg-emerald-800 w-full">
                <span className="text-lg">🚪</span> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area - scrolls independently */}
      <main className="flex-1 pb-16 md:pb-0 pt-14 md:pt-0 min-h-screen overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 md:px-8 lg:px-10 py-4 md:py-8">
          <Outlet />
        </div>

        {/* Keyboard shortcuts help */}
        {showShortcuts && (
          <div className="fixed bottom-4 right-4 z-50 bg-gray-900 text-white rounded-xl shadow-2xl p-4 text-sm max-w-xs">
            <h4 className="font-bold mb-2">Keyboard Shortcuts</h4>
            <div className="space-y-1.5 text-gray-300">
              <p><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs">G</kbd> Go to Screens</p>
              <p><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs">H</kbd> Go to Home</p>
              <p><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs">W</kbd> Setup Wizard</p>
              <p><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs">?</kbd> Toggle shortcuts</p>
              <p className="text-xs text-gray-500 mt-2">In input fields: <kbd className="bg-gray-700 px-1.5 py-0.5 rounded">Enter</kbd> save / <kbd className="bg-gray-700 px-1.5 py-0.5 rounded">Esc</kbd> cancel</p>
            </div>
            <button onClick={() => setShowShortcuts(false)} className="mt-3 text-xs text-brand-400 hover:text-brand-300">Close</button>
          </div>
        )}
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 flex safe-area-bottom">
        {navItems.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors ${
                isActive ? 'text-emerald-600' : 'text-gray-500'
              }`
            }
          >
            <span className="text-xl mb-0.5">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}