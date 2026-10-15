import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import SnapshotBoard from '../components/SnapshotBoard'

/**
 * SnapshotPage — the "Snapshot-to-digital" perk, gated behind signup.
 *
 * Flow (all mobile-first, phone-camera friendly):
 *   1. capture — take / choose a photo of the current menu
 *   2. setup   — pick the location (or create one / preview-only) + pick a
 *                path: AI mockup (rebuilds the board, prices → editable
 *                boxes) or owner redesign (request handed to the Lumenu team)
 *   3. processing — POST /api/snapshots, poll GET /:id until ready|failed
 *   4. result  — the rebuilt Lumenu board preview; prices are editable boxes
 *                that save straight through to the created screen's menu
 *
 * Route: /snapshot (protected). Reachable from the dashboard nav and from the
 * onboarding wizard (step 1) via ?restaurant=<id>.
 */
const POLL_MS = 2500
const POLL_TIMEOUT_MS = 160000
const MAX_PHOTO_BYTES = 20 * 1024 * 1024
const PROCESSING_LINES = [
  'Reading your menu…',
  'Finding every price…',
  'Rebuilding it as a Lumenu board…',
  'Making the prices editable…',
]

export default function SnapshotPage() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()

  // ── flow state ────────────────────────────────────────────────
  const [step, setStep] = useState('capture') // capture | setup | processing | result | redesign | failed
  const [photo, setPhoto] = useState(null) // { file, url }
  const [restaurants, setRestaurants] = useState([])
  const [restaurantId, setRestaurantId] = useState(null) // uuid | 'new' | 'none'
  const [newRestaurantName, setNewRestaurantName] = useState('')
  const [creatingLocation, setCreatingLocation] = useState(false)
  const [path, setPath] = useState('ai') // 'ai' | 'manual'
  const [uploading, setUploading] = useState(false)
  const [snapshot, setSnapshot] = useState(null) // payload from GET /api/snapshots/:id
  const [items, setItems] = useState([])
  const [failedMessage, setFailedMessage] = useState('')
  const [showOriginal, setShowOriginal] = useState(false)

  // ── history ───────────────────────────────────────────────────
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
  const pollTimer = useRef(null)

  // Load the user's restaurants + snapshot history on mount.
  useEffect(() => {
    let alive = true
    api.getRestaurants()
      .then((d) => { if (alive) setRestaurants(d.restaurants || []) })
      .catch(() => {})
    api.getSnapshots()
      .then((d) => { if (alive) setHistory(d.snapshots || []); setHistoryLoading(false) })
      .catch(() => { if (alive) setHistoryLoading(false) })
    return () => { alive = false }
  }, [])

  // Preselect a restaurant passed from the onboarding wizard.
  const preselect = searchParams.get('restaurant')
  useEffect(() => {
    if (preselect && restaurants.some((r) => r.id === preselect)) setRestaurantId(preselect)
  }, [restaurants, preselect])

  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current) }, [])

  const reset = () => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    setSnapshot(null)
    setItems([])
    setFailedMessage('')
    setPath('ai')
    setShowOriginal(false)
    setPhoto(null)
    setStep('capture')
  }

  // ── capture ───────────────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file) return
    if (!/^image\//.test(file.type || '')) {
      addToast('Please choose a photo (JPG, PNG, or WebP).', 'error')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      addToast('That photo is larger than 20MB — try a smaller one.', 'error')
      return
    }
    setPhoto({ file, url: URL.createObjectURL(file) })
    setRestaurantId(restaurants.length === 1 ? restaurants[0].id : null)
    setStep('setup')
  }, [addToast, restaurants])

  useEffect(() => () => {
    if (photo?.url) URL.revokeObjectURL(photo.url)
  }, [photo])

  // ── upload + poll ─────────────────────────────────────────────
  const stopPolling = () => { if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null } }

  const openHistoryResult = async (snap) => {
    setHistoryLoading(true)
    try {
      const payload = await api.getSnapshot(snap.snapshot_id)
      if (payload.status === 'ready') loadResult(payload)
      else if (payload.status === 'failed') { setFailedMessage(payload.message || 'That snapshot could not be processed.'); setStep('failed') }
      else startPolling(payload.snapshot_id)
    } catch (err) { addToast(err.message || 'Could not open that snapshot.', 'error') }
    setHistoryLoading(false)
  }

  const loadResult = useCallback(async (payload) => {
    setSnapshot(payload)
    setItems(payload.menu_items || [])
    // When a screen was created, fetch its live menu rows so price edits
    // persist (they carry ids + availability).
    if (payload.screen && payload.screen.id) {
      try {
        const d = await api.getMenuItems(payload.screen.id)
        if (d && Array.isArray(d.menu_items) && d.menu_items.length) setItems(d.menu_items)
      } catch { /* fall back to snapshot.menu_items */ }
    }
    setStep(payload.needs_redesign ? 'redesign' : 'result')
  }, [])

  const startPolling = useCallback((snapshotId) => {
    stopPolling()
    setStep('processing')
    const startedAt = Date.now()
    pollTimer.current = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        stopPolling()
        setFailedMessage('That took longer than expected. Please try again.')
        setStep('failed')
        return
      }
      try {
        const payload = await api.getSnapshot(snapshotId)
        if (payload.status === 'ready') { stopPolling(); loadResult(payload) }
        else if (payload.status === 'failed') {
          stopPolling()
          setFailedMessage(payload.message || 'That snapshot could not be processed.')
          setStep('failed')
        }
        // 'processing' → keep polling
      } catch { /* transient — keep polling */ }
    }, POLL_MS)
  }, [loadResult])

  const handleStart = async (choice) => {
    if (!photo) return
    setUploading(true)
    setPath(choice)
    try {
      const rid = restaurantId && restaurantId !== 'none' && restaurantId !== 'new' ? restaurantId : null
      const { snapshot_id } = await api.uploadSnapshot(photo.file, rid)
      if (choice === 'manual') {
        // Owner-redesign path: flag the snapshot for the services team. The AI
        // pipeline still runs in the background; the result step lets the owner
        // switch to the AI mockup preview if they want.
        try { await api.markSnapshotRedesign(snapshot_id) } catch { /* non-fatal */ }
      }
      refreshHistory()
      startPolling(snapshot_id)
    } catch (err) {
      addToast(err.message || 'Upload failed — please try again.', 'error')
    }
    setUploading(false)
  }

  const refreshHistory = async () => {
    try { const d = await api.getSnapshots(); setHistory(d.snapshots || []) } catch { /* ignore */ }
  }

  const createRestaurant = async () => {
    const name = newRestaurantName.trim()
    if (!name) return
    setCreatingLocation(true)
    try {
      const d = await api.createRestaurant({ name })
      const r = d.restaurant
      setRestaurants((prev) => [...prev, r])
      setRestaurantId(r.id)
      setNewRestaurantName('')
      addToast(`Created ${r.name}!`, 'success')
    } catch (err) { addToast(err.message || 'Could not create location.', 'error') }
    setCreatingLocation(false)
  }

  // ── price editing (optimistic, saves to the live screen) ──────
  const handlePriceChange = useCallback(async (itemId, price) => {
    const prev = items
    setItems((cur) => cur.map((it) => (it.id === itemId ? { ...it, price } : it)))
    try {
      await api.updateMenuItem(itemId, { price })
      addToast('Price updated — your screens will refresh automatically.', 'success', 2200)
    } catch {
      setItems(prev)
      addToast('Could not save that price. Check your connection.', 'error')
    }
  }, [items, addToast])

  // Derived: the rebuilt board's pieces.
  const zones = snapshot?.template?.text_zones || []
  const portrait = snapshot?.orientation === 'portrait'
  const priceLayout = {
    position: snapshot?.suggested_price_zone || 'right_column',
    align: snapshot?.price_align || 'right',
    font_ratio: snapshot?.price_font_ratio ?? 0.9,
    bold: snapshot?.price_bold,
    leader: snapshot?.price_leader,
  }
  const restaurantName = useMemo(() => {
    const fromScreen = snapshot?.screen?.name ? snapshot.screen.name.replace(/ Menu$/, '') : ''
    const fromTemplate = snapshot?.template?.name ? snapshot.template.name.replace(/^Snapshot — /, '') : ''
    return fromScreen || fromTemplate || ''
  }, [snapshot])

  const hasScreen = !!snapshot?.screen

  // ── render ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-bg via-[#17112f] to-[#24144a] flex flex-col">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.16),transparent_60%)]" />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-brand-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand-primary rounded-lg flex items-center justify-center shadow-[0_0_12px_rgba(139,92,246,0.3)]">
            <span className="text-white font-bold text-sm">L</span>
          </div>
          <div>
            <h1 className="font-heading font-bold text-sm text-brand-text leading-tight">Snapshot to digital</h1>
            <p className="text-[11px] text-brand-muted leading-tight">Bring your menu — we rebuild it</p>
          </div>
        </div>
        <button onClick={() => navigate('/dashboard')}
          className="text-brand-muted hover:text-brand-text text-xs font-medium px-3 py-2 rounded-lg hover:bg-brand-surface-alt transition-colors">
          Exit
        </button>
      </header>

      <main className="relative z-10 flex-1 w-full max-w-2xl mx-auto px-4 py-6 pb-16">
        {step === 'capture' && (
          <CaptureStep
            onFile={handleFile}
            cameraRef={cameraRef}
            galleryRef={galleryRef}
            history={history}
            historyLoading={historyLoading}
            onOpenHistory={openHistoryResult}
            userName={user?.name}
          />
        )}

        {step === 'setup' && photo && (
          <SetupStep
            photo={photo}
            onRetake={() => setStep('capture')}
            restaurants={restaurants}
            restaurantId={restaurantId}
            setRestaurantId={setRestaurantId}
            newRestaurantName={newRestaurantName}
            setNewRestaurantName={setNewRestaurantName}
            createRestaurant={createRestaurant}
            creatingLocation={creatingLocation}
            path={path}
            setPath={setPath}
            uploading={uploading}
            onStart={() => handleStart(path)}
          />
        )}

        {step === 'processing' && (
          <ProcessingStep
            onCancel={() => { stopPolling(); setStep('setup') }}
            onShowOriginal={() => setShowOriginal(true)}
          />
        )}

        {step === 'failed' && (
          <FailedStep message={failedMessage} onRetry={reset} onHome={() => navigate('/dashboard')} />
        )}

        {step === 'redesign' && snapshot && (
          <RedesignStep
            snapshot={snapshot}
            restaurantName={restaurantName}
            onPreviewAi={() => loadResult({ ...snapshot, needs_redesign: false })}
            onHome={() => navigate('/dashboard')}
            onNew={reset}
          />
        )}

        {step === 'result' && snapshot && (
          <ResultStep
            snapshot={snapshot}
            zones={zones}
            items={items}
            portrait={portrait}
            priceLayout={priceLayout}
            restaurantName={restaurantName}
            hasScreen={hasScreen}
            onPriceChange={handlePriceChange}
            showOriginal={showOriginal}
            setShowOriginal={setShowOriginal}
            onNew={reset}
            onEditMenu={() => navigate(`/dashboard/screens/${snapshot.screen.id}/menu`)}
            onViewScreen={() => navigate(`/dashboard/screens/${snapshot.screen.id}`)}
            onWatchTv={() => window.open(`/tv/?slug=${snapshot.screen.slug}`, '_blank')}
            onAddLocation={() => { addToast('Upload the same photo again with a location selected to make it live.', 'info'); reset() }}
          />
        )}
      </main>
    </div>
  )
}

/* ── Step 1: capture ─────────────────────────────────────────── */

function CaptureStep({ onFile, cameraRef, galleryRef, history, historyLoading, onOpenHistory, userName }) {
  return (
    <div className="space-y-5">
      <div className="text-center py-2">
        <div className="text-4xl mb-3">📸</div>
        <h2 className="text-xl font-heading font-bold text-brand-text">Bring your menu</h2>
        <p className="text-brand-muted text-sm mt-1 max-w-md mx-auto">
          {userName ? `${userName.split(' ')[0]}, snap a photo of the menu you use today.` : 'Snap a photo of the menu board you use today.'}{' '}
          We'll rebuild it as a Lumenu board — prices become editable boxes on your phone.
        </p>
      </div>

      {/* Photo actions */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => cameraRef.current?.click()}
          className="btn-primary py-4 flex flex-col items-center gap-1.5 text-sm">
          <span className="text-2xl">🤳</span>
          <span className="font-semibold">Take a photo</span>
          <span className="text-[11px] opacity-70 font-normal">opens your camera</span>
        </button>
        <button onClick={() => galleryRef.current?.click()}
          className="btn-secondary py-4 flex flex-col items-center gap-1.5 text-sm">
          <span className="text-2xl">🖼️</span>
          <span className="font-semibold">Choose from gallery</span>
          <span className="text-[11px] opacity-70 font-normal">photos already saved</span>
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => onFile(e.target.files?.[0])} />
      <input ref={galleryRef} type="file" accept="image/*" hidden
        onChange={(e) => onFile(e.target.files?.[0])} />

      {/* Tips */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-brand-muted">
        <span className="rounded-full bg-brand-surface-alt/70 border border-brand-border/50 px-2.5 py-1">☀️ Good lighting</span>
        <span className="rounded-full bg-brand-surface-alt/70 border border-brand-border/50 px-2.5 py-1">↔️ Straight-on shot</span>
        <span className="rounded-full bg-brand-surface-alt/70 border border-brand-border/50 px-2.5 py-1">🚫 No glare</span>
      </div>

      {/* History */}
      <HistoryStrip history={history} loading={historyLoading} onOpen={onOpenHistory} />
    </div>
  )
}

function HistoryStrip({ history, loading, onOpen }) {
  if (loading) {
    return <div className="space-y-2"><div className="h-24 rounded-xl skeleton" /><div className="h-24 rounded-xl skeleton" /></div>
  }
  if (!history || history.length === 0) return null
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-muted/70 mb-2">Your snapshots</h3>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4">
        {history.map((s) => (
          <button key={s.snapshot_id} onClick={() => onOpen(s)}
            className="shrink-0 w-24 rounded-xl overflow-hidden border border-brand-border/50 bg-brand-surface-alt group transition-all hover:border-brand-primary/50">
            <div className="aspect-[4/3] bg-black/40 relative">
              <img src={s.original_url} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" loading="lazy" />
              <span className={`absolute bottom-1 left-1 rounded-md px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${
                s.status === 'ready' ? 'bg-green-500/90 text-white' :
                s.status === 'failed' ? 'bg-red-500/90 text-white' :
                'bg-amber-400/90 text-black'}`}>
                {s.status === 'ready' ? 'Ready' : s.status === 'failed' ? 'Failed' : 'Working…'}
              </span>
            </div>
            <div className="px-1.5 py-1 text-[10px] text-brand-muted truncate">{s.created_at?.slice(0, 10) || '—'}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Step 2: setup (location + path) ─────────────────────────── */

function SetupStep({ photo, onRetake, restaurants, restaurantId, setRestaurantId, newRestaurantName, setNewRestaurantName, createRestaurant, creatingLocation, path, setPath, uploading, onStart }) {
  const showNewForm = restaurantId === 'new' || (restaurants.length === 0 && restaurantId !== 'none')
  return (
    <div className="space-y-5">
      {/* Photo preview + retake */}
      <div className="flex items-center gap-3">
        <div className="w-20 h-20 rounded-xl overflow-hidden border border-brand-border/60 shrink-0 bg-black/40">
          <img src={photo.url} alt="Your menu" className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-brand-text truncate">{photo.file.name || 'menu photo'}</p>
          <p className="text-xs text-brand-muted mt-0.5">{(photo.file.size / 1024 / 1024).toFixed(1)}MB · ready to rebuild</p>
          <button onClick={onRetake} className="mt-1.5 text-xs text-brand-primary hover:text-brand-glow font-medium">Use a different photo</button>
        </div>
      </div>

      {/* Location */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-semibold text-brand-text">Where does this menu live?</label>
          <span className="text-[10px] text-brand-muted/70">picks the screen</span>
        </div>
        {restaurants.length > 0 && (
          <select value={restaurantId || ''} onChange={(e) => setRestaurantId(e.target.value === '' ? null : e.target.value)}
            className="input-field mb-2">
            <option value="">Choose a location…</option>
            {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            <option value="new">➕ New location…</option>
            <option value="none">Just preview for now</option>
          </select>
        )}
        {showNewForm && (
          <div className="flex gap-2 mb-2">
            <input className="input-field flex-1" placeholder={restaurants.length === 0 ? 'Name your restaurant' : 'New location name'}
              value={newRestaurantName} onChange={(e) => setNewRestaurantName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createRestaurant() } }} autoFocus />
            <button onClick={createRestaurant} disabled={creatingLocation || !newRestaurantName.trim()}
              className="btn-primary whitespace-nowrap text-sm">
              {creatingLocation ? '…' : 'Create'}
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {restaurants.map((r) => (
            <button key={r.id} type="button" onClick={() => setRestaurantId(r.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                restaurantId === r.id ? 'border-amber-400 bg-amber-400/15 text-amber-300' : 'border-brand-border/60 text-brand-muted hover:border-brand-primary/50'
              }`}>{r.name}</button>
          ))}
          <button type="button" onClick={() => setRestaurantId('none')}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
              restaurantId === 'none' ? 'border-amber-400 bg-amber-400/15 text-amber-300' : 'border-brand-border/60 text-brand-muted'
            }`}>Preview only</button>
        </div>
        {restaurantId === 'none' && (
          <p className="text-[11px] text-brand-muted mt-2">You'll see the rebuilt board, but it won't be a live screen yet. Choose a location to make it editable &amp; on your TV.</p>
        )}
      </div>

      {/* Path */}
      <div>
        <label className="text-sm font-semibold text-brand-text block mb-2">How do you want to rebuild it?</label>
        <div className="space-y-2.5">
          <PathCard
            selected={path === 'ai'} onClick={() => setPath('ai')}
            icon="✨" title="AI mockup — rebuild it for me" badge="Included · fastest"
            desc="We scan the photo and rebuild it into a Lumenu board in seconds. Prices are removed from the design and become editable boxes you change from your phone." />
          <PathCard
            selected={path === 'manual'} onClick={() => setPath('manual')}
            icon="🎨" title="Lumenu redesigns it by hand" badge="Designer touch"
            desc="Prefer a human eye? Our design team rebuilds your menu for you. We'll take it from your photo and craft a custom board." />
        </div>
      </div>

      {/* CTA */}
      <button onClick={onStart} disabled={uploading}
        className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2">
        {uploading && <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
        {uploading ? 'Uploading…' : path === 'ai' ? 'Build my menu board →' : 'Send to the design team →'}
      </button>
      <p className="text-[11px] text-center text-brand-muted/70">Free with your trial · prices never leave your control</p>
    </div>
  )
}

function PathCard({ selected, onClick, icon, title, badge, desc }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
        selected
          ? 'border-amber-400 bg-amber-400/[0.07] shadow-[0_0_18px_rgba(251,191,36,0.12)]'
          : 'border-brand-border/60 bg-brand-surface hover:border-brand-primary/50'
      }`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${selected ? 'text-amber-300' : 'text-brand-text'}`}>{title}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
              badge.includes('Included') ? 'bg-green-500/15 text-green-400' : 'bg-brand-primary/15 text-brand-primary'
            }`}>{badge}</span>
          </div>
          <p className="text-xs text-brand-muted mt-1 leading-relaxed">{desc}</p>
        </div>
        <span className={`mt-1 h-4 w-4 rounded-full border-2 shrink-0 ${selected ? 'border-amber-400 bg-amber-400' : 'border-brand-muted/40'}`} />
      </div>
    </button>
  )
}

/* ── Step 3: processing ──────────────────────────────────────── */

function ProcessingStep({ onCancel }) {
  const [line, setLine] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setLine((l) => (l + 1) % PROCESSING_LINES.length), 2600)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="py-10 text-center">
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 rounded-full border-4 border-brand-primary/20" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-amber-400 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center text-3xl">🪄</div>
      </div>
      <h2 className="text-lg font-heading font-bold text-brand-text">Rebuilding your menu</h2>
      <p className="text-brand-muted text-sm mt-2 h-5 animate-pulse" key={line}>{PROCESSING_LINES[line]}</p>
      <p className="text-[11px] text-brand-muted/60 mt-6">Takes a few seconds · stay on this page</p>
      <button onClick={onCancel} className="mt-6 text-xs text-brand-muted hover:text-brand-text underline">Cancel</button>
    </div>
  )
}

/* ── Step 4a: failed ─────────────────────────────────────────── */

function FailedStep({ message, onRetry, onHome }) {
  return (
    <div className="card text-center py-10 px-6 border-red-500/30">
      <div className="text-4xl mb-3">😕</div>
      <h2 className="text-lg font-heading font-bold text-brand-text">We couldn't read that menu</h2>
      <p className="text-sm text-brand-muted mt-2 max-w-sm mx-auto">{message}</p>
      <div className="mt-4 text-xs text-brand-muted/70">Tips: brighter lighting · hold the phone straight-on · avoid glare and shadows.</div>
      <div className="flex flex-col sm:flex-row gap-2.5 mt-6 max-w-xs mx-auto">
        <button onClick={onRetry} className="btn-primary flex-1">Try another photo</button>
        <button onClick={onHome} className="btn-secondary flex-1">Back to dashboard</button>
      </div>
    </div>
  )
}

/* ── Step 4b: redesign requested ─────────────────────────────── */

function RedesignStep({ snapshot, restaurantName, onPreviewAi, onHome, onNew }) {
  return (
    <div className="space-y-5">
      <div className="card text-center py-8 px-5">
        <div className="text-4xl mb-3">🎨</div>
        <h2 className="text-lg font-heading font-bold text-brand-text">Redesign request sent!</h2>
        <p className="text-sm text-brand-muted mt-2 max-w-sm mx-auto">
          Our design team will rebuild your menu by hand{restaurantName ? ` for ${restaurantName}` : ''}. We'll notify you when your custom board is ready.
        </p>
        <div className="mx-auto mt-5 w-28 h-28 rounded-xl overflow-hidden border border-brand-border/60 bg-black/40">
          <img src={snapshot.original_url} alt="Your menu" className="w-full h-full object-cover" />
        </div>
      </div>
      <div className="space-y-2">
        <button onClick={onPreviewAi} className="btn-secondary w-full">✨ Preview the AI mockup instead</button>
        <button onClick={onNew} className="btn-secondary w-full">📸 Start another snapshot</button>
        <button onClick={onHome} className="btn-primary w-full">Done — go to dashboard</button>
      </div>
    </div>
  )
}

/* ── Step 4c: result (AI mockup ready) ───────────────────────── */

function ResultStep({ snapshot, zones, items, portrait, priceLayout, restaurantName, hasScreen, onPriceChange, showOriginal, setShowOriginal, onNew, onEditMenu, onViewScreen, onWatchTv, onAddLocation }) {
  const foundDetails = []
  if (snapshot.suggested_price_zone === 'right_column') foundDetails.push('Prices right-aligned')
  else if (snapshot.price_leader) foundDetails.push('Dot-leader prices')
  else foundDetails.push('Prices inline')
  if (snapshot.price_font_ratio) foundDetails.push(`Price size ≈ ${Math.round(snapshot.price_font_ratio * 100)}% of item text`)
  if (snapshot.price_bold) foundDetails.push('Prices look bold')
  if (snapshot.price_margin_right != null) { /* whole board margin — skip chip */ }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center pt-1">
        <div className="text-4xl mb-2">🎉</div>
        <h2 className="text-xl font-heading font-bold text-brand-text">Your menu, rebuilt</h2>
        <p className="text-brand-muted text-sm mt-1">
          {hasScreen ? `Live on “${snapshot.screen.name}”${restaurantName ? ` · ${restaurantName}` : ''}` : 'Mockup ready — prices are editable below'}
        </p>
      </div>

      {/* Live banner */}
      {hasScreen && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 flex items-start gap-2.5">
          <span className="text-lg">✅</span>
          <div className="text-xs text-green-300">
            <p className="font-semibold">Screen created &amp; prices are editable.</p>
            <p className="text-green-400/80 mt-0.5">Edit a price below — the change saves instantly and syncs to your board.</p>
          </div>
        </div>
      )}

      {/* Original ↔ rebuilt toggle */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setShowOriginal(!showOriginal)}
          className="text-xs font-medium text-brand-muted hover:text-brand-text flex items-center gap-1.5 transition-colors">
          {showOriginal ? '◀ See the rebuilt board' : '▶ Compare with the original photo'}
        </button>
        {hasScreen && (
          <button onClick={onWatchTv} className="text-xs font-medium text-brand-primary hover:text-brand-glow flex items-center gap-1.5 transition-colors">
            📺 Watch on the TV
          </button>
        )}
      </div>

      {/* Board / original */}
      <div className="relative">
        {showOriginal ? (
          <div className="rounded-xl overflow-hidden border border-brand-border/50 bg-black/40 max-h-[420px] flex items-center justify-center">
            <img src={snapshot.original_url} alt="Original menu" className="w-full h-auto max-h-[420px] object-contain" />
            <span className="absolute top-2 left-2 rounded-md bg-black/70 border border-brand-border/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-muted">Original</span>
          </div>
        ) : (
          <div>
            <SnapshotBoard
              zones={zones}
              items={items}
              portrait={portrait}
              restaurantName={restaurantName}
              priceLayout={priceLayout}
              editable
              onPriceChange={onPriceChange}
            />
            <span className="absolute top-2 left-2 rounded-md bg-black/70 border border-amber-400/40 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">Rebuilt · prices editable</span>
          </div>
        )}
      </div>

      {/* AI noticed */}
      {!showOriginal && foundDetails.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-muted/60">AI noticed:</span>
          {foundDetails.map((d) => (
            <span key={d} className="rounded-full bg-brand-surface-alt border border-brand-border/60 px-2.5 py-1 text-[11px] text-brand-muted">🔍 {d}</span>
          ))}
        </div>
      )}

      {/* Items count */}
      {!showOriginal && (
        <p className="text-[11px] text-brand-muted/70">
          {items.length} item{items.length === 1 ? '' : 's'} found · tap any gold price box to change it
        </p>
      )}

      {/* Actions */}
      <div className="space-y-2">
        {hasScreen ? (
          <>
            <button onClick={onEditMenu} className="btn-primary w-full py-3.5">✏️ Edit menu &amp; prices</button>
            <button onClick={onViewScreen} className="btn-secondary w-full">🖥️ View the new screen</button>
          </>
        ) : (
          <>
            <button onClick={onAddLocation} className="btn-primary w-full py-3.5">📍 Add this to a location</button>
            <p className="text-[11px] text-center text-brand-muted/70">Upload the same photo again with a location selected to make it a live screen.</p>
          </>
        )}
        <button onClick={onNew} className="btn-secondary w-full">📸 Start another snapshot</button>
      </div>
    </div>
  )
}