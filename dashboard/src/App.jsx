import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import OnboardingWizard from './pages/OnboardingWizard'
import DashboardLayout from './components/DashboardLayout'
import DashboardHome from './pages/DashboardHome'
import MenuPage from './pages/MenuPage'
import ScreensPage from './pages/ScreensPage'
import ScreenDetailPage from './pages/ScreenDetailPage'
import SettingsPage from './pages/SettingsPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-brand-500 border-t-transparent rounded-full" /></div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function DashboardRoute() {
  const [checked, setChecked] = useState(false)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    const check = async () => {
      try {
        const token = localStorage.getItem('menuvo_token')
        const res = await fetch('/api/restaurants', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          const restaurants = data.restaurants || []
          setNeedsOnboarding(restaurants.length === 0)
        }
      } catch { /* server not available */ }
      setChecked(true)
    }
    check()
  }, [user])

  if (!checked) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-brand-500 border-t-transparent rounded-full" /></div>
  if (needsOnboarding) return <Navigate to="/onboarding" replace />
  return <DashboardLayout />
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/onboarding" element={<ProtectedRoute><OnboardingWizard /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardRoute /></ProtectedRoute>}>
        <Route index element={<DashboardHome />} />
        <Route path="screens" element={<ScreensPage />} />
        <Route path="screens/:screenId" element={<ScreenDetailPage />} />
        <Route path="screens/:screenId/menu" element={<MenuPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}