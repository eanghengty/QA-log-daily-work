export const CUSTOM_SESSION_STORAGE_KEY = 'qa_tracker_custom_session_token'

function readStorage(storage, key) {
  try {
    return storage.getItem(key) || ''
  } catch {
    return ''
  }
}

function writeStorage(storage, key, value) {
  try {
    storage.setItem(key, value)
  } catch {
    // Ignore storage write errors and continue with the in-memory session.
  }
}

function removeStorage(storage, key) {
  try {
    storage.removeItem(key)
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function getStoredCustomSessionToken() {
  if (typeof window === 'undefined') return ''

  const localToken = readStorage(window.localStorage, CUSTOM_SESSION_STORAGE_KEY)
  if (localToken) {
    return localToken
  }

  const sessionToken = readStorage(window.sessionStorage, CUSTOM_SESSION_STORAGE_KEY)
  if (sessionToken) {
    writeStorage(window.localStorage, CUSTOM_SESSION_STORAGE_KEY, sessionToken)
    removeStorage(window.sessionStorage, CUSTOM_SESSION_STORAGE_KEY)
  }

  return sessionToken
}

export function setStoredCustomSessionToken(token) {
  if (typeof window === 'undefined') return

  writeStorage(window.localStorage, CUSTOM_SESSION_STORAGE_KEY, token)
  removeStorage(window.sessionStorage, CUSTOM_SESSION_STORAGE_KEY)
}

export function clearStoredCustomSessionToken() {
  if (typeof window === 'undefined') return

  removeStorage(window.localStorage, CUSTOM_SESSION_STORAGE_KEY)
  removeStorage(window.sessionStorage, CUSTOM_SESSION_STORAGE_KEY)
}
