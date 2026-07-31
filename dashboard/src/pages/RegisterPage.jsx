import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { register } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 6) {
      addToast('Password must be at least 6 characters', 'error')
      return
    }
    setSubmitting(true)
    try {
      await register(name, email, password)
      addToast('Account created! Welcome to Lumenu.', 'success')
      navigate('/dashboard')
    } catch (err) {
      addToast(err.message || 'Registration failed', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh bg-brand-bg font-body flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-[35%] h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-primary/[0.05] blur-[120px]"
          style={{ animation: 'pulse 8s ease-in-out infinite' }}
        />
        <div
          className="absolute right-[5%] top-[55%] h-[300px] w-[300px] rounded-full bg-brand-primary/[0.04] blur-[90px]"
          style={{ animation: 'pulse 10s ease-in-out infinite', animationDelay: '3s' }}
        />
        <div className="absolute left-1/2 top-[5%] h-[150px] w-[350px] -translate-x-1/2 rounded-full bg-brand-glow/[0.03] blur-[70px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.6)_100%)]" />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-brand-border/50 to-brand-primary/10 opacity-50" />
        <div className="relative rounded-2xl bg-brand-surface p-8 shadow-2xl border border-brand-border/30">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-5">
              <svg width="56" height="56" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="4" width="112" height="112" rx="20" stroke="url(#reg-logo-grad)" strokeWidth="2.5" />
                <rect x="14" y="14" width="92" height="92" rx="10" fill="#1A1A1A" stroke="#2A2A2A" strokeWidth="1" />
                <polygon points="52,42 52,78 78,60" fill="url(#reg-logo-grad)" />
                <defs>
                  <linearGradient id="reg-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#F59E0B" />
                    <stop offset="100%" stopColor="#FBBF24" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <h1 className="font-heading text-2xl font-bold text-brand-text">Get Started</h1>
            <p className="text-brand-muted mt-1 text-sm">Create your Lumenu account</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-brand-text mb-1.5">Restaurant Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="Joe's Pizza"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-text mb-1.5">Email</label>
              <input
                type="email"
                className="input-field"
                placeholder="you@restaurant.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-text mb-1.5">Password</label>
              <input
                type="password"
                className="input-field"
                placeholder="At least 6 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3"
            >
              {submitting ? (
                <span className="inline-block h-4 w-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : null}
              {submitting ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-brand-muted mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-primary hover:text-brand-glow font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
