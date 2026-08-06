// Centralized auth token storage.
//
// The app previously stored its JWT under the legacy `menuvo_token` key
// (pre-rebrand). We now store under `lumenu_token` and migrate existing
// sessions in place so no one gets logged out by the rename: the first read
// copies the old value to the new key and removes the legacy key.
const TOKEN_KEY = 'lumenu_token'
const LEGACY_TOKEN_KEY = 'menuvo_token'

function migrateLegacyToken() {
  try {
    if (!localStorage.getItem(TOKEN_KEY) && localStorage.getItem(LEGACY_TOKEN_KEY)) {
      localStorage.setItem(TOKEN_KEY, localStorage.getItem(LEGACY_TOKEN_KEY))
      localStorage.removeItem(LEGACY_TOKEN_KEY)
    }
  } catch {
    // Storage unavailable (private mode etc.) — ignore, reads fall through.
  }
}

export function getToken() {
  migrateLegacyToken()
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY)
  } catch {
    // ignore
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY)
  } catch {
    // ignore
  }
}
