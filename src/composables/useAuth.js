import { computed, ref } from 'vue'
import { supabaseAnonKey, supabaseUrl, isSupabaseConfigured } from '../lib/supabase.js'
import { clearLocalTrackerData, exportBackup, getLocalMigrationSummary } from '../lib/backup.js'

const CUSTOM_SESSION_STORAGE_KEY = 'qa_tracker_custom_session_token'
const CUSTOM_AUTH_EVENT_KEY = 'qa_tracker_custom_auth_event'
const SESSION_POLL_INTERVAL_MS = 5000

const authEnabled = ref(isSupabaseConfigured)
const initialized = ref(false)
const isBusy = ref(false)
const authError = ref('')
const authNotice = ref('')
const session = ref(null)
const profile = ref(null)
const profileSyncReady = ref(true)
const pendingLocalMigration = ref(null)
const bootstrapStatus = ref({
  checked: false,
  hasUsers: true,
  userCount: 0,
})

const clientInstanceId =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`

let initPromise = null
let sessionPollTimer = null
let storageBridgeStarted = false
let visibilityBridgeStarted = false

function safeSessionStorageGet(key) {
  if (typeof window === 'undefined') return ''

  try {
    return window.sessionStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function safeSessionStorageSet(key, value) {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // Ignore storage write errors and continue with the in-memory session.
  }
}

function safeSessionStorageRemove(key) {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // Ignore storage cleanup failures.
  }
}

function broadcastAuthEvent(event) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      CUSTOM_AUTH_EVENT_KEY,
      JSON.stringify({
        ...event,
        clientId: clientInstanceId,
        at: new Date().toISOString(),
      }),
    )
  } catch {
    // Ignore broadcast failures and fall back to server-side session polling.
  }
}

function buildUser(userPayload) {
  if (!userPayload?.id) return null

  const fullName = `${userPayload.fullName || ''}`.trim()
  return {
    id: userPayload.id,
    email: userPayload.email || '',
    role: userPayload.role || 'member',
    user_metadata: {
      full_name: fullName,
    },
  }
}

function buildProfile(userPayload) {
  if (!userPayload?.id) return null

  return {
    id: userPayload.id,
    email: userPayload.email || '',
    full_name: `${userPayload.fullName || ''}`.trim(),
    role: userPayload.role || 'member',
  }
}

function applySessionData({ token, sessionId, expiresAt, user: userPayload }) {
  const nextUser = buildUser(userPayload)
  const nextProfile = buildProfile(userPayload)

  session.value = nextUser
    ? {
        id: sessionId || '',
        token,
        expiresAt: expiresAt || '',
        user: nextUser,
      }
    : null
  profile.value = nextProfile
  profileSyncReady.value = true
}

function stopSessionPolling() {
  if (sessionPollTimer) {
    window.clearInterval(sessionPollTimer)
    sessionPollTimer = null
  }
}

function startSessionPolling() {
  if (typeof window === 'undefined') return

  stopSessionPolling()
  sessionPollTimer = window.setInterval(() => {
    void refreshActiveSession({ quiet: true })
  }, SESSION_POLL_INTERVAL_MS)
}

function clearSessionState({ clearStoredToken = true, notice } = {}) {
  stopSessionPolling()
  session.value = null
  profile.value = null
  pendingLocalMigration.value = null

  if (clearStoredToken) {
    safeSessionStorageRemove(CUSTOM_SESSION_STORAGE_KEY)
  }

  if (typeof notice === 'string') {
    authNotice.value = notice
  }
}

function buildSessionFailureNotice(error) {
  if (error?.code === 'SESSION_REPLACED') {
    return 'This session was closed because the account became active in another tab, browser, or device.'
  }

  if (error?.code === 'SESSION_EXPIRED') {
    return 'Your session has expired. Please sign in again.'
  }

  if (error?.status === 401) {
    return 'Your session is no longer valid. Please sign in again.'
  }

  return error?.message || 'Unable to restore the signed-in session.'
}

async function callAuthEndpoint(endpointName, { token = '', body = {} } = {}) {
  if (!supabaseUrl || !supabaseAnonKey) {
    const error = new Error('Custom backend auth is not configured.')
    error.code = 'AUTH_CONFIG_MISSING'
    throw error
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${endpointName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

  const payload = await response
    .json()
    .catch(() => ({}))

  if (!response.ok) {
    const error = new Error(payload.error || 'Request failed.')
    error.status = response.status
    error.code = payload.code || 'AUTH_REQUEST_FAILED'
    throw error
  }

  return payload
}

async function refreshBootstrapStatus() {
  if (!authEnabled.value) {
    bootstrapStatus.value = {
      checked: true,
      hasUsers: true,
      userCount: 0,
    }
    return
  }

  try {
    const data = await callAuthEndpoint('auth-bootstrap-status')
    bootstrapStatus.value = {
      checked: true,
      hasUsers: Boolean(data.hasUsers),
      userCount: Number(data.userCount || 0),
    }
  } catch (error) {
    bootstrapStatus.value = {
      checked: true,
      hasUsers: true,
      userCount: 0,
    }
    console.warn('Unable to load custom auth bootstrap status.', error)
  }
}

async function refreshPendingLocalMigration(nextUser) {
  if (!authEnabled.value || !nextUser?.id) {
    pendingLocalMigration.value = null
    return
  }

  try {
    const summary = await getLocalMigrationSummary()
    pendingLocalMigration.value = summary.hasData ? summary : null
  } catch (error) {
    pendingLocalMigration.value = null
    console.warn('Unable to inspect local IndexedDB data before opening the custom backend shell.', error)
  }
}

async function restoreSessionFromToken(token, { quiet = false } = {}) {
  if (!token) {
    clearSessionState({ clearStoredToken: true })
    return false
  }

  try {
    const data = await callAuthEndpoint('auth-session', {
      token,
      body: {
        clientId: clientInstanceId,
      },
    })

    applySessionData({
      token,
      ...data,
    })
    startSessionPolling()
    await refreshPendingLocalMigration(buildUser(data.user))
    return true
  } catch (error) {
    const shouldShowNotice =
      !quiet || error?.code === 'SESSION_REPLACED' || error?.code === 'SESSION_EXPIRED' || error?.status === 401

    clearSessionState({
      clearStoredToken: true,
      notice: shouldShowNotice ? buildSessionFailureNotice(error) : undefined,
    })
    return false
  }
}

async function refreshActiveSession({ quiet = false } = {}) {
  const token = session.value?.token || safeSessionStorageGet(CUSTOM_SESSION_STORAGE_KEY)
  if (!token) return false
  return await restoreSessionFromToken(token, { quiet })
}

function ensureStorageBridge() {
  if (storageBridgeStarted || typeof window === 'undefined') return
  storageBridgeStarted = true

  window.addEventListener('storage', (event) => {
    if (event.key !== CUSTOM_AUTH_EVENT_KEY || !event.newValue) return

    try {
      const payload = JSON.parse(event.newValue)
      if (payload.clientId === clientInstanceId) return
      if (!session.value?.user?.id) return
      if (payload.userId !== session.value.user.id) return

      if (payload.type === 'login') {
        clearSessionState({
          clearStoredToken: true,
          notice: 'This session was closed because the account became active in another tab, browser, or device.',
        })
      }
    } catch {
      // Ignore malformed cross-tab events.
    }
  })
}

function ensureVisibilityBridge() {
  if (visibilityBridgeStarted || typeof document === 'undefined') return
  visibilityBridgeStarted = true

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void refreshActiveSession({ quiet: true })
    }
  })
}

export async function initAuth() {
  if (initPromise) return initPromise

  initPromise = (async () => {
    ensureStorageBridge()
    ensureVisibilityBridge()

    if (!authEnabled.value) {
      initialized.value = true
      return
    }

    await refreshBootstrapStatus()

    const storedToken = safeSessionStorageGet(CUSTOM_SESSION_STORAGE_KEY)
    if (storedToken) {
      await restoreSessionFromToken(storedToken, { quiet: true })
    }

    initialized.value = true
  })()

  return initPromise
}

export function useAuth() {
  const user = computed(() => session.value?.user ?? null)
  const currentDisplayName = computed(() => {
    const profileName = `${profile.value?.full_name || ''}`.trim()
    const metadataName = `${user.value?.user_metadata?.full_name || ''}`.trim()
    return profileName || metadataName || user.value?.email || 'Unknown user'
  })
  const canCreateFirstUser = computed(
    () => authEnabled.value && bootstrapStatus.value.checked && !bootstrapStatus.value.hasUsers,
  )

  async function signInWithPassword({ email, password }) {
    if (!authEnabled.value) return

    isBusy.value = true
    authError.value = ''
    authNotice.value = ''

    try {
      const data = await callAuthEndpoint('auth-login', {
        body: {
          email: `${email || ''}`.trim(),
          password,
          clientId: clientInstanceId,
        },
      })

      safeSessionStorageSet(CUSTOM_SESSION_STORAGE_KEY, data.sessionToken)
      applySessionData({
        token: data.sessionToken,
        ...data,
      })
      startSessionPolling()
      await refreshBootstrapStatus()
      await refreshPendingLocalMigration(buildUser(data.user))
      broadcastAuthEvent({
        type: 'login',
        userId: data.user?.id || '',
        sessionId: data.sessionId || '',
      })
    } catch (error) {
      authError.value = error.message || 'Unable to sign in.'
      throw error
    } finally {
      isBusy.value = false
    }
  }

  async function signUp({ email, password, fullName }) {
    if (!authEnabled.value) return

    isBusy.value = true
    authError.value = ''
    authNotice.value = ''

    try {
      const data = await callAuthEndpoint('auth-create-first-user', {
        body: {
          email: `${email || ''}`.trim(),
          password,
          fullName: `${fullName || ''}`.trim(),
          clientId: clientInstanceId,
        },
      })

      safeSessionStorageSet(CUSTOM_SESSION_STORAGE_KEY, data.sessionToken)
      applySessionData({
        token: data.sessionToken,
        ...data,
      })
      startSessionPolling()
      await refreshBootstrapStatus()
      await refreshPendingLocalMigration(buildUser(data.user))
      broadcastAuthEvent({
        type: 'login',
        userId: data.user?.id || '',
        sessionId: data.sessionId || '',
      })
    } catch (error) {
      authError.value = error.message || 'Unable to create the first account.'
      throw error
    } finally {
      isBusy.value = false
    }
  }

  async function requestPasswordReset() {
    authError.value = ''
    authNotice.value =
      'Password reset emails are not available in custom backend mode. Sign in and change the password from Account.'
  }

  async function updateAccount({ fullName, password }) {
    if (!authEnabled.value || !session.value?.token) return

    isBusy.value = true
    authError.value = ''
    authNotice.value = ''

    try {
      const data = await callAuthEndpoint('auth-update-account', {
        token: session.value.token,
        body: {
          fullName: `${fullName || ''}`.trim(),
          password,
        },
      })

      applySessionData({
        token: session.value.token,
        sessionId: session.value.id,
        expiresAt: session.value.expiresAt,
        user: data.user,
      })
      authNotice.value = 'Account details saved.'
    } catch (error) {
      authError.value = error.message || 'Unable to save the account details.'
      throw error
    } finally {
      isBusy.value = false
    }
  }

  async function signOut() {
    const activeToken = session.value?.token || safeSessionStorageGet(CUSTOM_SESSION_STORAGE_KEY)

    isBusy.value = true
    authError.value = ''
    authNotice.value = ''

    try {
      if (activeToken) {
        await callAuthEndpoint('auth-logout', { token: activeToken })
      }
    } catch (error) {
      console.warn('Custom backend sign-out cleanup failed.', error)
    } finally {
      const signedOutUserId = session.value?.user?.id || ''
      clearSessionState({ clearStoredToken: true })
      if (signedOutUserId) {
        broadcastAuthEvent({
          type: 'logout',
          userId: signedOutUserId,
        })
      }
      isBusy.value = false
    }
  }

  async function completeLocalMigration({ downloadBackup }) {
    if (!user.value) return

    isBusy.value = true
    authError.value = ''
    authNotice.value = ''

    try {
      if (downloadBackup) {
        await exportBackup()
      }

      await clearLocalTrackerData()
      pendingLocalMigration.value = null
    } catch (error) {
      authError.value = error.message || 'Unable to finish the local data migration step.'
      throw error
    } finally {
      isBusy.value = false
    }
  }

  function clearAuthFeedback() {
    authError.value = ''
    authNotice.value = ''
  }

  return {
    authEnabled,
    initialized,
    isBusy,
    authError,
    authNotice,
    session,
    user,
    profile,
    profileSyncReady,
    pendingLocalMigration,
    currentDisplayName,
    canCreateFirstUser,
    bootstrapStatus,
    signInWithPassword,
    signUp,
    requestPasswordReset,
    updateAccount,
    completeLocalMigration,
    signOut,
    clearAuthFeedback,
  }
}
