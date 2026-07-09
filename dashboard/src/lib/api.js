const API_BASE = '/api'

function getToken() {
  return localStorage.getItem('menuvo_token')
}

async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const opts = { method, headers }
  if (body) opts.body = JSON.stringify(body)

  const res = await fetch(`${API_BASE}${path}`, opts)
  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed: ${res.status}`)
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
  getScreenHealth: (slug) => request('GET', `/screens/${slug}/health`),

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

  // Screen Data (for preview — uses slug public endpoint)
  getScreenData: (slug) => request('GET', `/screens/${slug}/data`),
}

export default api