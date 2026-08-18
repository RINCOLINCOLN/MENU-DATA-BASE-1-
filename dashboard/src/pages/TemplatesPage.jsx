import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'
import SkeletonLoader from '../components/SkeletonLoader'
import TextZoneEditor from '../components/TextZoneEditor'
import TemplatePreview from '../components/TemplatePreview'
import api from '../lib/api'

/** Count configured text zones, tolerating string / array / {zones: []} configs. */
function zoneCount(configJson) {
  if (!configJson) return 0
  let parsed = configJson
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { return 0 }
  }
  const zones = Array.isArray(parsed) ? parsed : parsed?.zones
  return Array.isArray(zones) ? zones.length : 0
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const { addToast } = useToast()
  const navigate = useNavigate()

  const fetchTemplates = async () => {
    try {
      const data = await api.getTemplates()
      setTemplates(data.templates || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchTemplates() }, [])

  const handleDelete = async (templateId) => {
    if (!confirm('Delete this template? Screens using it will be unassigned.')) return
    try {
      await api.deleteTemplate(templateId)
      addToast('Template deleted', 'success')
      fetchTemplates()
    } catch (err) { addToast(err.message || 'Delete failed', 'error') }
  }

  if (loading) return <SkeletonLoader />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-text">Templates</h1>
          <p className="text-brand-muted mt-1 text-sm">Manage background videos for your TV screens</p>
        </div>
        <button onClick={() => setUploadOpen(true)}
          className="btn-primary flex items-center gap-1.5">+ Upload Video</button>
      </div>

      {templates.length === 0 ? (
        <div className="bg-brand-surface rounded-xl p-8 text-center shadow-sm border border-brand-border/40">
          <div className="text-4xl mb-3">🎬</div>
          <h3 className="font-semibold text-brand-text mb-1">No templates yet</h3>
          <p className="text-brand-muted text-sm mb-4">Upload MP4 background videos to create cinematic menu boards.</p>
          <button onClick={() => setUploadOpen(true)}
            className="btn-primary">Upload Your First Video</button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(t => (
            <div key={t.id} className="bg-brand-surface rounded-xl shadow-sm border border-brand-border/40 overflow-hidden hover:shadow-md transition-shadow">
              {/* Visual preview */}
              <TemplatePreview template={t} />
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-brand-text">{t.name}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs">
                      <span className="bg-brand-surface-alt/70 px-1.5 py-0.5 rounded text-brand-muted/70">{t.orientation || 'landscape'}</span>
                      {t.video_url && <span className="bg-brand-surface-alt/70 px-1.5 py-0.5 rounded text-brand-muted/70">MP4</span>}
                      {zoneCount(t.config_json) > 0 ? (
                        <span className="bg-brand-primary/15 text-brand-glow px-1.5 py-0.5 rounded font-medium">
                          {zoneCount(t.config_json)} text zone{zoneCount(t.config_json) !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="bg-brand-surface-alt/70 px-1.5 py-0.5 rounded text-brand-muted/70">No text zones</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => { setEditingTemplate(t); setEditorOpen(true) }}
                    className="flex-1 text-xs btn-secondary py-1.5">Edit Zones</button>
                  <button onClick={() => { setSelectedTemplate(t); setAssignOpen(true) }}
                    className="flex-1 text-xs btn-secondary py-1.5">Assign</button>
                  <button onClick={() => handleDelete(t.id)}
                    className="text-xs py-1.5 px-3 text-red-500 hover:bg-red-50 rounded-lg transition-colors">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onSuccess={fetchTemplates} />}
      {assignOpen && selectedTemplate && (
        <AssignModal template={selectedTemplate} onClose={() => { setAssignOpen(false); setSelectedTemplate(null) }} />
      )}
      {editorOpen && editingTemplate && (
        <TextZoneEditor template={editingTemplate}
          onClose={() => { setEditorOpen(false); setEditingTemplate(null) }}
          onSaved={fetchTemplates} />
      )}
    </div>
  )
}

function UploadModal({ onClose, onSuccess }) {
  const [name, setName] = useState('')
  const [orientation, setOrientation] = useState('landscape')
  const [videoFile, setVideoFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [configJson, setConfigJson] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const fileInputRef = useRef(null)
  const { addToast } = useToast()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || !videoFile) {
      addToast('Name and video file are required', 'error')
      return
    }
    // Reject files over the server's 500MB limit locally before uploading
    const MAX_VIDEO_BYTES = 500 * 1024 * 1024
    if (videoFile.size > MAX_VIDEO_BYTES) {
      addToast(`File is too large. Maximum video size is 500MB.`, 'error')
      return
    }
    // Validate config JSON if provided
    if (configJson.trim()) {
      try { JSON.parse(configJson) } catch {
        addToast('Text zone config must be valid JSON', 'error')
        return
      }
    }
    setUploading(true)
    try {
      await api.uploadTemplate({
        name: name.trim(),
        orientation,
        video: videoFile,
        config_json: configJson.trim() || undefined,
      })
      addToast('Template uploaded!', 'success')
      onSuccess()
      onClose()
    } catch (err) {
      addToast(err.message || 'Upload failed', 'error')
    }
    setUploading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-brand-surface rounded-2xl w-full max-w-lg p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-brand-text">Upload Video Template</h3>
          <button onClick={onClose} className="p-1 hover:bg-brand-surface-alt/70 rounded-lg text-brand-muted">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-text/80 mb-1">Template Name</label>
            <input className="input-field" placeholder="e.g. Summer Menu Loop"
              value={name} onChange={e => setName(e.target.value)} required autoFocus />
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-text/80 mb-1">Orientation</label>
            <div className="flex gap-3">
              {['landscape', 'portrait'].map(o => (
                <button key={o} type="button" onClick={() => setOrientation(o)}
                  className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                    orientation === o ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-brand-border/50 text-brand-muted'
                  }`}>
                  {o === 'landscape' ? '🔄 Landscape (16:9)' : '📱 Portrait (9:16)'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-text/80 mb-1">Video File (MP4, max 500MB)</label>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); setVideoFile(e.dataTransfer.files[0]) }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              {videoFile ? (
                <div>
                  <span className="text-2xl">🎬</span>
                  <p className="font-medium text-brand-text mt-1">{videoFile.name}</p>
                  <p className="text-xs text-brand-muted/60 mt-1">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</p>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setVideoFile(null) }}
                    className="text-xs text-red-500 mt-1 hover:underline">Remove</button>
                </div>
              ) : (
                <div>
                  <span className="text-3xl">📁</span>
                  <p className="font-medium text-brand-text/80 mt-2">Drop video here or click to browse</p>
                  <p className="text-xs text-brand-muted/60 mt-1">MP4, WebM, MOV (max 500MB)</p>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept=".mp4,.webm,.mov,.avi,.mkv" className="hidden"
                onChange={e => setVideoFile(e.target.files[0])} />
            </div>
          </div>

          {/* Text zone config */}
          <div>
            <button type="button" onClick={() => setShowConfig(!showConfig)}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
              {showConfig ? '▼' : '▶'} Text Zone Configuration
            </button>
            {showConfig && (
              <div className="mt-2">
                <label className="block text-xs text-brand-muted mb-1">
                  JSON array of text zones. Each zone: {`{ "id": "zone1", "x": 0.1, "y": 0.2, "width": 0.8, "height": 0.6, "font_size": 24, "color": "#ffffff", "align": "left" }`}
                </label>
                <textarea className="input-field font-mono text-xs h-28 resize-y"
                  placeholder='[{"id":"zone1","x":0.1,"y":0.2,"width":0.8,"height":0.6,"font_size":24,"color":"#ffffff","align":"left"}]'
                  value={configJson} onChange={e => setConfigJson(e.target.value)} />
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={uploading || !name.trim() || !videoFile}
              className="btn-primary flex items-center gap-2">
              {uploading && <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
              {uploading ? 'Uploading...' : 'Upload Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AssignModal({ template, onClose }) {
  const [screens, setScreens] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedScreenId, setSelectedScreenId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const { addToast } = useToast()

  useEffect(() => {
    const fetchScreens = async () => {
      try {
        const data = await api.getRestaurants()
        const restaurants = data.restaurants || []
        const allScreens = []
        for (const r of restaurants) {
          try {
            const sr = await api.getScreens(r.id)
            ;(sr.screens || []).forEach(s => allScreens.push({ ...s, restaurantName: r.name }))
          } catch {}
        }
        setScreens(allScreens)
      } catch {}
      setLoading(false)
    }
    fetchScreens()
  }, [])

  const handleAssign = async () => {
    if (!selectedScreenId) { addToast('Select a screen', 'error'); return }
    setAssigning(true)
    try {
      await api.updateScreen(selectedScreenId, { template_id: template.id })
      addToast(`Assigned "${template.name}" to screen!`, 'success')
      onClose()
    } catch (err) { addToast(err.message || 'Assign failed', 'error') }
    setAssigning(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-brand-surface rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-brand-text mb-1">Assign Template</h3>
        <p className="text-sm text-brand-muted mb-4">Assign "<strong>{template.name}</strong>" to a screen</p>

        {loading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-10 skeleton" />
            <div className="h-10 skeleton" />
          </div>
        ) : screens.length === 0 ? (
          <p className="text-brand-muted/60 text-sm text-center py-4">No screens available. Create one first.</p>
        ) : (
          <div className="space-y-3">
            <select className="input-field" value={selectedScreenId}
              onChange={e => setSelectedScreenId(e.target.value)}>
              <option value="">Select a screen...</option>
              {screens.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.restaurantName})</option>
              ))}
            </select>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={onClose} className="btn-secondary">Cancel</button>
              <button onClick={handleAssign} disabled={assigning || !selectedScreenId}
                className="btn-primary">{assigning ? 'Assigning...' : 'Assign'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}