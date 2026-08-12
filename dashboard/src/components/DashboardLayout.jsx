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
    <div className="min-h-screen bg-brand-bg flex flex-col md:flex-row">
      {/* Tablet + Desktop Sidebar (fixed).
          Interaction strategy:
          - <768px  phone            : top header + hamburger + bottom tab bar (thumbs).
          - 768-1023 tablet portrait : ICON RAIL (w-16). Sidebar collapses to icons so
            content keeps the width on an iPad held in portrait; 44px+ tap targets;
            title tooltips aid mouse hover. Labels return at lg.
          - >=1024px desktop         : full labeled sidebar.
          Never relies on hover to be discoverable — active state is always visible. */}
      <aside className="hidden md:flex md:flex-col md:w-16 lg:w-72 bg-brand-surface text-brand-text shrink-0 fixed left-0 top-0 bottom-0 z-20 border-r border-brand-border/50">
        {/* Sidebar header — logo only on rail, wordmark at lg */}
        <div className="p-3 lg:p-5 border-b border-brand-border/50 flex items-center justify-center lg:justify-start">
          <div className="w-10 h-10 shrink-0 bg-brand-primary rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.25)]">
            <span className="text-white font-bold text-lg">L</span>
          </div>
          <div className="hidden lg:block ml-3 min-w-0">
            <h2 className="font-heading font-bold text-sm text-brand-text">Lumenu</h2>
            <p className="text-brand-muted text-xs truncate max-w-[160px]">{user?.name || 'Restaurant'}</p>
          </div>
        </div>

        {/* Nav items — icon rail on tablet, icon + label on desktop */}
        <nav className="flex-1 p-2 lg:p-3 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={item.label} /* tooltip for tablet rail hover */
              className={({ isActive }) =>
                `flex items-center justify-center lg:justify-start gap-3 px-2 lg:px-3 py-3 lg:py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-brand-primary/20 text-brand-primary shadow-[0_0_10px_rgba(139,92,246,0.15)]'
                    : 'text-brand-muted hover:bg-brand-surface-alt hover:text-brand-text'
                }`
              }
            >
              <span className="text-lg shrink-0">{item.icon}</span>
              <span className="hidden lg:inline">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer buttons */}
        <div className="p-2 lg:p-3 border-t border-brand-border/50 space-y-1">
          <button onClick={() => navigate('/onboarding')} title="Setup Wizard"
            className="flex items-center justify-center lg:justify-start gap-3 px-2 lg:px-3 py-3 lg:py-2.5 min-h-[44px] rounded-lg text-sm text-brand-muted hover:bg-brand-surface-alt hover:text-brand-text w-full transition-colors">
            <span className="text-lg shrink-0">🚀</span>
            <span className="hidden lg:inline">Setup Wizard</span>
          </button>
          <button onClick={handleLogout} title="Sign Out"
            className="flex items-center justify-center lg:justify-start gap-3 px-2 lg:px-3 py-3 lg:py-2.5 min-h-[44px] rounded-lg text-sm text-brand-muted hover:bg-brand-surface-alt hover:text-brand-text w-full transition-colors">
            <span className="text-lg shrink-0">🚪</span>
            <span className="hidden lg:inline">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Spacer for fixed sidebar */}
      <div className="hidden md:block md:w-16 lg:w-72 shrink-0" />

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-brand-surface/95 backdrop-blur-sm border-b border-brand-border/50 text-brand-text px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-primary rounded-xl flex items-center justify-center shadow-[0_0_12px_rgba(139,92,246,0.25)]">
            <span className="text-white font-bold">L</span>
          </div>
          <div>
            <h2 className="font-heading font-bold text-sm">Lumenu</h2>
            <p className="text-brand-muted text-xs">{user?.name || 'Dashboard'}</p>
          </div>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 hover:bg-brand-surface-alt rounded-lg">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      </div>

      {/* Mobile slide-over */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-brand-surface p-5 shadow-2xl border-l border-brand-border/50">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-brand-border/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.25)]">
                  <span className="text-white font-bold">L</span>
                </div>
                <span className="font-heading font-bold text-brand-text">Lumenu</span>
              </div>
            </div>
            <nav className="space-y-1">
              {navItems.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-brand-primary/20 text-brand-primary'
                        : 'text-brand-muted hover:bg-brand-surface-alt hover:text-brand-text'
                    }`
                  }
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
              <button onClick={() => { setMobileMenuOpen(false); navigate('/onboarding') }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-brand-muted hover:bg-brand-surface-alt hover:text-brand-text w-full">
                <span className="text-lg">🚀</span> Setup Wizard
              </button>
            </nav>
            <div className="mt-6 pt-4 border-t border-brand-border/50">
              <button onClick={handleLogout}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-brand-muted hover:bg-brand-surface-alt hover:text-brand-text w-full">
                <span className="text-lg">🚪</span> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 pb-16 md:pb-0 pt-14 md:pt-0 min-h-screen overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 md:px-8 lg:px-10 py-4 md:py-8">
          <Outlet />
        </div>

        {/* Keyboard shortcuts help */}
        {showShortcuts && (
          <div className="fixed bottom-4 right-4 z-50 bg-brand-surface border border-brand-border/50 rounded-xl shadow-2xl p-4 text-sm max-w-xs">
            <h4 className="font-heading font-bold mb-2 text-brand-text">Keyboard Shortcuts</h4>
            <div className="space-y-1.5 text-brand-muted">
              <p><kbd className="bg-brand-surface-alt px-1.5 py-0.5 rounded text-xs text-brand-muted">G</kbd> Go to Screens</p>
              <p><kbd className="bg-brand-surface-alt px-1.5 py-0.5 rounded text-xs text-brand-muted">H</kbd> Go to Home</p>
              <p><kbd className="bg-brand-surface-alt px-1.5 py-0.5 rounded text-xs text-brand-muted">W</kbd> Setup Wizard</p>
              <p><kbd className="bg-brand-surface-alt px-1.5 py-0.5 rounded text-xs text-brand-muted">?</kbd> Toggle shortcuts</p>
              <p className="text-xs text-brand-muted/50 mt-2">In input fields: <kbd className="bg-brand-surface-alt px-1.5 py-0.5 rounded">Enter</kbd> save / <kbd className="bg-brand-surface-alt px-1.5 py-0.5 rounded">Esc</kbd> cancel</p>
            </div>
            <button onClick={() => setShowShortcuts(false)} className="mt-3 text-xs text-brand-primary hover:text-brand-glow">Close</button>
          </div>
        )}
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-brand-surface/95 backdrop-blur-sm border-t border-brand-border/50 flex safe-area-bottom">
        {navItems.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors ${
                isActive ? 'text-brand-primary' : 'text-brand-muted'
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
