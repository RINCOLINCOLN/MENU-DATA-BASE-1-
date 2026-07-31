import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'

export default function SettingsPage() {
  const { addToast } = useToast()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [newLocationName, setNewLocationName] = useState('')
  const [addingLocation, setAddingLocation] = useState(false)

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const token = localStorage.getItem('menuvo_token')
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      })
      if (res.ok) addToast('Profile updated', 'success')
      else addToast('Update failed', 'error')
    } catch { addToast('Network error', 'error') }
    setSaving(false)
  }

  const handleAddLocation = async (e) => {
    e.preventDefault()
    setAddingLocation(true)
    try {
      const token = localStorage.getItem('menuvo_token')
      const res = await fetch('/api/restaurants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newLocationName }),
      })
      if (res.ok) {
        addToast('Location added!', 'success')
        setNewLocationName('')
      } else {
        const data = await res.json()
        addToast(data.error || 'Failed to add location', 'error')
      }
    } catch { addToast('Network error', 'error') }
    setAddingLocation(false)
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-brand-text">Settings</h1>
        <p className="text-brand-muted mt-1 text-sm">Manage your account and locations</p>
      </div>

      {/* Profile Section */}
      <div className="bg-brand-surface rounded-xl shadow-sm border border-brand-border/40 p-6">
        <h3 className="font-semibold text-brand-text mb-4">Profile</h3>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-text/80 mb-1">Name</label>
            <input className="input-field" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Add Location */}
      <div className="bg-brand-surface rounded-xl shadow-sm border border-brand-border/40 p-6">
        <h3 className="font-semibold text-brand-text mb-1">Add Restaurant Location</h3>
        <p className="text-sm text-brand-muted mb-4">Add a new restaurant or location to manage.</p>
        <form onSubmit={handleAddLocation} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-text/80 mb-1">Restaurant Name</label>
            <input className="input-field" placeholder="e.g. Joe's Pizza Downtown"
              value={newLocationName} onChange={e => setNewLocationName(e.target.value)} required />
          </div>
          <button type="submit" disabled={addingLocation} className="btn-primary">
            {addingLocation ? 'Adding...' : 'Add Location'}
          </button>
        </form>
      </div>

      {/* Templates */}
      <div className="bg-brand-surface rounded-xl shadow-sm border border-brand-border/40 p-6">
        <h3 className="font-semibold text-brand-text mb-1">Video Templates</h3>
        <p className="text-sm text-brand-muted mb-4">
          Upload MP4 background videos and assign them to your TV screens.
        </p>
        <Link to="/dashboard/templates" className="btn-primary inline-flex items-center gap-2">
          🎬 Manage Templates
        </Link>
      </div>

      <div className="bg-brand-surface rounded-xl shadow-sm border border-brand-border/40 p-6">
        <h3 className="font-semibold text-brand-text mb-1">Account</h3>
        <button onClick={() => { localStorage.removeItem('menuvo_token'); window.location.href = '/login' }}
          className="btn-danger">Sign Out</button>
      </div>
    </div>
  )
}