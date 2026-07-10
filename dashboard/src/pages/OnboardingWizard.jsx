import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'

const STEPS = ['Restaurant', 'Screen', 'Menu Items', 'TV Setup']

export default function OnboardingWizard() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [restaurantId, setRestaurantId] = useState(null)
  const [screenId, setScreenId] = useState(null)
  const [screenSlug, setScreenSlug] = useState(null)
  const [items, setItems] = useState([])

  const token = localStorage.getItem('menuvo_token')
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const handleCreateRestaurant = async (name) => {
    setLoading(true)
    try {
      const res = await fetch('/api/restaurants', { method: 'POST', headers, body: JSON.stringify({ name }) })
      const data = await res.json()
      if (res.ok) {
        setRestaurantId(data.restaurant.id)
        addToast('Restaurant created!', 'success')
        setStep(1)
      } else addToast(data.error || 'Failed', 'error')
    } catch { addToast('Network error', 'error') }
    setLoading(false)
  }

  const handleCreateScreen = async (name, orientation) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/screens`, {
        method: 'POST', headers,
        body: JSON.stringify({ name, orientation: orientation || 'landscape' })
      })
      const data = await res.json()
      if (res.ok) {
        setScreenId(data.screen.id)
        setScreenSlug(data.screen.unique_slug)
        addToast('Screen created!', 'success')
        setStep(2)
      } else addToast(data.error || 'Failed', 'error')
    } catch { addToast('Network error', 'error') }
    setLoading(false)
  }

  const handleAddItem = async (itemData) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/screens/${screenId}/menu-items`, {
        method: 'POST', headers, body: JSON.stringify(itemData)
      })
      const data = await res.json()
      if (res.ok) {
        setItems(prev => [...prev, data.menu_item])
        addToast(`${itemData.name} added!`, 'success')
      } else addToast(data.error || 'Failed', 'error')
    } catch { addToast('Network error', 'error') }
    setLoading(false)
  }

  const handleSkip = () => {
    addToast('You can always set things up later!', 'info')
    navigate('/dashboard')
  }

  const handleFinish = () => {
    addToast('Your Menuvo is ready! 🎉', 'success')
    navigate('/dashboard')
  }

  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-1.5 bg-gray-100">
          <div className="h-full bg-brand-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        <div className="p-6 md:p-8">
          {/* Step indicator dots */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  i <= step ? 'bg-brand-500 text-white' : 'bg-gray-200 text-gray-400'
                }`}>{i + 1}</div>
                {i < STEPS.length - 1 && <div className={`w-8 h-0.5 ${i < step ? 'bg-brand-500' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>

          {/* Step title */}
          <h2 className="text-center text-sm font-medium text-gray-400 mb-6 uppercase tracking-wider">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </h2>

          {/* Step content */}
          {step === 0 && (
            <RestaurantStep onNext={handleCreateRestaurant} loading={loading} onSkip={handleSkip} />
          )}
          {step === 1 && (
            <ScreenStep onNext={handleCreateScreen} loading={loading} onSkip={handleSkip} />
          )}
          {step === 2 && (
            <ItemsStep items={items} onAdd={handleAddItem} loading={loading} onNext={() => setStep(3)} onSkip={handleSkip} />
          )}
          {step === 3 && (
            <TvSetupStep screenSlug={screenSlug} onFinish={handleFinish} onSkip={handleSkip} />
          )}

          {/* Skip button (always visible) */}
          <div className="text-center mt-6 pt-4 border-t border-gray-100">
            <button onClick={handleSkip} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
              Skip setup → Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RestaurantStep({ onNext, loading, onSkip }) {
  const [name, setName] = useState('')
  const handleSubmit = (e) => { e.preventDefault(); if (name.trim()) onNext(name.trim()) }
  return (
    <div className="py-4">
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">🏪</div>
        <h3 className="text-xl font-bold text-gray-900">Name Your Restaurant</h3>
        <p className="text-gray-500 text-sm mt-1">What's your restaurant called?</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
        <input className="input-field text-lg py-3 text-center" placeholder="e.g. Joe's Pizza"
          value={name} onChange={e => setName(e.target.value)} autoFocus required />
        <button type="submit" disabled={loading || !name.trim()}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3">
          {loading && <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
          {loading ? 'Creating...' : 'Create Restaurant'}
        </button>
      </form>
    </div>
  )
}

function ScreenStep({ onNext, loading }) {
  const [name, setName] = useState('')
  const [orientation, setOrientation] = useState('landscape')
  const handleSubmit = (e) => { e.preventDefault(); if (name.trim()) onNext(name.trim(), orientation) }
  return (
    <div className="py-4">
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">🖥️</div>
        <h3 className="text-xl font-bold text-gray-900">Add Your Screen</h3>
        <p className="text-gray-500 text-sm mt-1">Name the TV display for your menu</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
        <input className="input-field text-lg py-3 text-center" placeholder="e.g. Main Board"
          value={name} onChange={e => setName(e.target.value)} autoFocus required />
        <div className="flex gap-3">
          {['landscape', 'portrait'].map(o => (
            <button key={o} type="button" onClick={() => setOrientation(o)}
              className={`flex-1 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                orientation === o ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {o === 'landscape' ? '🔄 Landscape' : '📱 Portrait'}
            </button>
          ))}
        </div>
        <button type="submit" disabled={loading || !name.trim()}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3">
          {loading && <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
          {loading ? 'Creating...' : 'Create Screen'}
        </button>
      </form>
    </div>
  )
}

function ItemsStep({ items, onAdd, loading, onNext }) {
  const [itemName, setItemName] = useState('')
  const [itemPrice, setItemPrice] = useState('')
  const [itemCategory, setItemCategory] = useState('')
  const handleSubmit = (e) => {
    e.preventDefault()
    if (itemName.trim()) {
      onAdd({ name: itemName.trim(), price: parseFloat(itemPrice) || 0, category: itemCategory || null })
      setItemName(''); setItemPrice(''); setItemCategory('')
    }
  }
  return (
    <div className="py-4">
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">📝</div>
        <h3 className="text-xl font-bold text-gray-900">Add Menu Items</h3>
        <p className="text-gray-500 text-sm mt-1">Quick-add your first items. You can add more later.</p>
      </div>
      <div className="max-w-md mx-auto">
        <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
          <input className="input-field flex-1" placeholder="Item name" value={itemName}
            onChange={e => setItemName(e.target.value)} required />
          <input className="input-field w-24" placeholder="$0.00" type="number" step="0.01" min="0"
            value={itemPrice} onChange={e => setItemPrice(e.target.value)} />
          <button type="submit" disabled={loading || !itemName.trim()}
            className="btn-primary whitespace-nowrap">+ Add</button>
        </form>
        <input className="input-field mb-4" placeholder="Category (optional, e.g. Entrees)"
          value={itemCategory} onChange={e => setItemCategory(e.target.value)} />
        <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No items yet. Add a few or continue.</p>
          ) : items.map((item, i) => (
            <div key={item.id || i} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
              <div>
                <span className="font-medium text-gray-900">{item.name}</span>
                {item.category && <span className="text-xs text-gray-400 ml-2 bg-gray-200 px-1.5 py-0.5 rounded">{item.category}</span>}
              </div>
              <span className="font-semibold text-gray-700">${parseFloat(item.price || 0).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <button onClick={onNext} className="btn-secondary w-full">
          {items.length > 0 ? `Continue (${items.length} item${items.length > 1 ? 's' : ''})` : 'Skip'}
        </button>
      </div>
    </div>
  )
}

function TvSetupStep({ screenSlug, onFinish }) {
  const steps = [
    { icon: '📺', title: 'Get an Android TV Box', desc: 'Connect it to your TV via HDMI and power it on.' },
    { icon: '🌐', title: 'Connect to WiFi', desc: 'Make sure the TV box is on the same network as this device.' },
    { icon: '🔍', title: 'Open Fully Kiosk Browser', desc: 'Install and open the Fully Kiosk Browser app from the Play Store.' },
    { icon: '🔗', title: 'Enter Your Screen URL', desc: `Type or scan this URL into the browser:` },
  ]

  return (
    <div className="py-4">
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">📺</div>
        <h3 className="text-xl font-bold text-gray-900">TV Setup Instructions</h3>
        <p className="text-gray-500 text-sm mt-1">Follow these steps to get your menu on the TV</p>
      </div>
      <div className="max-w-md mx-auto space-y-4">
        {steps.map((s, i) => (
          <div key={i} className="flex gap-4 bg-gray-50 rounded-xl p-4">
            <div className="text-2xl shrink-0">{s.icon}</div>
            <div>
              <h4 className="font-semibold text-gray-900 text-sm">Step {i + 1}: {s.title}</h4>
              <p className="text-sm text-gray-500 mt-0.5">{s.desc}</p>
              {s.title === 'Enter Your Screen URL' && screenSlug && (
                <div className="mt-2 bg-white border border-gray-200 rounded-lg px-4 py-2.5 font-mono text-sm text-brand-600 break-all select-all">
                  https://menuvo.app/?screen={screenSlug}
                </div>
              )}
            </div>
          </div>
        ))}
        <button onClick={onFinish} className="btn-primary w-full py-3 mt-2">
          Done — Go to Dashboard 🎉
        </button>
      </div>
    </div>
  )
}