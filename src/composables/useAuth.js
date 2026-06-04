import { computed, ref } from 'vue'
import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

const authEnabled = ref(isSupabaseConfigured)
const initialized = ref(false)
const isBusy = ref(false)
const authError = ref('')
const authNotice = ref('')
const session = ref(null)
const profile = ref(null)
const profileSyncReady = ref(true)

let initPromise = null
let authListener = null

function buildFallbackProfile(user) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email || '',
    full_name: `${user.user_metadata?.full_name || ''}`.trim(),
    role: 'member',
  }
}

async function syncProfile(user) {
  if (!user || !supabase) {
    profile.value = null
    return
  }

  const fallbackProfile = buildFallbackProfile(user)
  profile.value = fallbackProfile

  try {
    const payload = {
      id: user.id,
      email: user.email || '',
      full_name: fallbackProfile?.full_name || '',
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase.from('profiles').upsert(payload, {
      onConflict: 'id',
    })

    if (upsertError) throw upsertError

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, created_at, updated_at')
      .eq('id', user.id)
      .maybeSingle()

    if (error) throw error

    profile.value = data || fallbackProfile
    profileSyncReady.value = true
    authNotice.value = ''
  } catch (error) {
    profile.value = fallbackProfile
    profileSyncReady.value = false
    authNotice.value =
      'Profile sync is waiting on the Supabase SQL setup. Run supabase/001_auth_profiles.sql to enable profile storage and user management.'
    console.warn('Supabase profile sync is not ready yet.', error)
  }
}

async function applySession(nextSession) {
  session.value = nextSession
  authError.value = ''
  await syncProfile(nextSession?.user ?? null)
}

export async function initAuth() {
  if (initPromise) return initPromise

  initPromise = (async () => {
    if (!supabase || !isSupabaseConfigured) {
      initialized.value = true
      return
    }

    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      await applySession(data.session)
    } catch (error) {
      authError.value = error.message || 'Failed to restore the user session.'
      session.value = null
      profile.value = null
    }

    if (!authListener) {
      const { data } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        await applySession(nextSession)
        initialized.value = true
      })
      authListener = data.subscription
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

  async function signInWithPassword({ email, password }) {
    if (!supabase) return
    isBusy.value = true
    authError.value = ''
    authNotice.value = ''

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: `${email || ''}`.trim(),
        password,
      })
      if (error) throw error
    } catch (error) {
      authError.value = error.message || 'Unable to sign in.'
      throw error
    } finally {
      isBusy.value = false
    }
  }

  async function signUp({ email, password, fullName }) {
    if (!supabase) return
    isBusy.value = true
    authError.value = ''
    authNotice.value = ''

    try {
      const { error } = await supabase.auth.signUp({
        email: `${email || ''}`.trim(),
        password,
        options: {
          data: {
            full_name: `${fullName || ''}`.trim(),
          },
        },
      })
      if (error) throw error

      authNotice.value =
        'Account created. If email confirmation is enabled in Supabase, check your inbox before signing in.'
    } catch (error) {
      authError.value = error.message || 'Unable to create the account.'
      throw error
    } finally {
      isBusy.value = false
    }
  }

  async function requestPasswordReset(email) {
    if (!supabase) return
    isBusy.value = true
    authError.value = ''
    authNotice.value = ''

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(`${email || ''}`.trim(), {
        redirectTo: window.location.origin,
      })
      if (error) throw error

      authNotice.value = 'Password reset email sent. Open the link from the same browser to update the password.'
    } catch (error) {
      authError.value = error.message || 'Unable to send the reset email.'
      throw error
    } finally {
      isBusy.value = false
    }
  }

  async function updateAccount({ fullName, password }) {
    if (!supabase || !user.value) return
    isBusy.value = true
    authError.value = ''
    authNotice.value = ''

    try {
      const payload = {
        data: {
          full_name: `${fullName || ''}`.trim(),
        },
      }

      if (`${password || ''}`.trim()) {
        payload.password = password
      }

      const { data, error } = await supabase.auth.updateUser(payload)
      if (error) throw error

      await syncProfile(data.user || user.value)
      authNotice.value = 'Account details saved.'
    } catch (error) {
      authError.value = error.message || 'Unable to save the account details.'
      throw error
    } finally {
      isBusy.value = false
    }
  }

  async function signOut() {
    if (!supabase) return
    isBusy.value = true
    authError.value = ''
    authNotice.value = ''

    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      session.value = null
      profile.value = null
    } catch (error) {
      authError.value = error.message || 'Unable to sign out.'
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
    currentDisplayName,
    signInWithPassword,
    signUp,
    requestPasswordReset,
    updateAccount,
    signOut,
    clearAuthFeedback,
  }
}
