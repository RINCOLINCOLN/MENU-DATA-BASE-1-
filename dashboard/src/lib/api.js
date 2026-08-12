import { getToken } from './token'
const API_BASE = '/api'

// Parse a response body safely. The backend always answers JSON, but a wrong
// server on the same origin (e.g. the static site server that returns HTML for
// every path) would otherwise blow up res.json() with a cryptic
// "Unexpected token '<'" — which read as a broken login. Detect non-JSON
// responses and surface a clear, actionable message instead.
async function parseResponse(res) {
  const contentType = (res.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('application/json')) {
    try {
      return await res.json()
    } catch {
      return null
    }
  }
  // Non-JSON body (HTML error page, proxy, wrong server on :3000, ...)
  const text = await res.text().catch(() => '')
  if (text && text.trim().startsWith('<')) {
    return {
      error:
        'The Lumenu service is not responding right now. ' +
        'Please check that the dashboard server is online, then try again.',
    }
  }
  return text ? { error: text } : null
}

async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const opts = { method, headers }
  if (body) opts.body = JSON.stringify(body)
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, opts)
  } catch (err) {
    // Network-level failure (server down, offline). Do not leak raw fetch
    // errors — turn them into a stable, user-facing message.
    throw new Error(
      err.name === 'AbortError'
        ? 'The request timed out. Please try again.'
        : 'Cannot reach the Lumenu service. Check your connection and try again.'
    )
  }
  const data = await parseResponse(res)
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Request failed: ${res.status}`)
  }
  return data
}
export const api = {
  // Auth
  login: (email, password) =>
    request('POST', '/auth/login', { email, password }),
  register: (name, email, password) =>
    request('POST', '/auth/register', { name, email, password }),
  me: () => request('GET', '/auth/me'),
  // Restaurants / Locations
  getRestaurants: () => request('GET', '/restaurants'),
  createRestaurant: (data) => request('POST', '/restaurants', data),
  getRestaurant: (id) => request('GET', `/restaurants/${id}`),
  // Screens
  getScreens: (restaurantId) =>
    request('GET', `/restaurants/${restaurantId}/screens`),
  getScreen: (screenId) => request('GET', `/screens/${screenId}`),
  createScreen: (restaurantId, data) =>
    request('POST', `/restaurants/${restaurantId}/screens`, data),
  updateScreen: (screenId, data) =>
    request('PATCH', `/screens/${screenId}`, data),
  getScreenHealth: (slug) => request('GET', `/screens/${slug}/health`),
  deleteScreen: (screenId) => request('DELETE', `/screens/${screenId}`),
  reorderScreens: (screenIds) =>
    request('POST', '/screens/reorder', { screen_ids: screenIds }),
  // Menu Items — backend uses /api/screens/:screenId/menu-items
  // and /api/menu-items/:id for PATCH/DELETE
  getMenuItems: (screenId) =>
    request('GET', `/screens/${screenId}/menu-items`),
  createMenuItem: (screenId, data) =>
    request('POST', `/screens/${screenId}/menu-items`, data),
  updateMenuItem: (itemId, data) =>
    request('PATCH', `/menu-items/${itemId}`, data),
  deleteMenuItem: (itemId) =>
    request('DELETE', `/menu-items/${itemId}`),
  toggleSoldOut: (itemId, availability) =>
    request('PATCH', `/menu-items/${itemId}`, { availability }),
  // Template (for preview)
  getTemplate: (screenId) => request('GET', `/screens/${screenId}/template`),
  // Template management
  getTemplates: () => request('GET', '/templates'),
  getTemplateById: (id) => request('GET', `/templates/${id}`),
  createTemplate: (data) => request('POST', '/templates', data),
  updateTemplate: (id, data) => request('PATCH', `/templates/${id}`, data),
  deleteTemplate: (id) => request('DELETE', `/templates/${id}`),
  // Template upload with a video file — multipart/form-data (multer path).
  async uploadTemplate({ name, orientation = 'landscape', video, config_json }) {
    const formData = new FormData()
    formData.append('name', name)
    formData.append('orientation', orientation)
    if (video) formData.append('video', video)
    if (config_json) formData.append('config_json', config_json)
    const headers = {}
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
    let res
    try {
      res = await fetch(`${API_BASE}/templates`, { method: 'POST', headers, body: formData })
    } catch (err) {
      throw new Error('Cannot reach the Lumenu service. Check your connection and try again.')
    }
    const data = await parseResponse(res)
    if (!res.ok) {
      throw new Error(data?.error || data?.message || `Request failed: ${res.status}`)
    }
    return data
  },
  // Screen Data (for preview — uses slug public endpoint)
  getScreenData: (slug) => request('GET', `/screens/${slug}/data`),
}
export default api
