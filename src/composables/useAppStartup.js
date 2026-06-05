import { ref } from 'vue'
import { initDb } from '../db/index.js'
import { initAuth } from './useAuth.js'
import { initRealtime } from './useRealtime.js'

const startupPending = ref(false)
const startupReady = ref(false)
const startupError = ref('')

let startupPromise = null

async function runStartup() {
  startupPending.value = true
  startupError.value = ''

  try {
    await Promise.all([initDb(), initAuth()])
    initRealtime()
    startupReady.value = true
  } catch (error) {
    startupReady.value = false
    startupError.value = error?.message || 'Unable to open the tracker shell.'
    console.error('App startup failed.', error)
    throw error
  } finally {
    startupPending.value = false
  }
}

export function startAppStartup() {
  if (!startupPromise) {
    startupPromise = runStartup().catch((error) => {
      startupPromise = null
      return Promise.reject(error)
    })
  }

  return startupPromise
}

export function retryAppStartup() {
  startupReady.value = false
  startupPromise = null
  return startAppStartup()
}

export function useAppStartup() {
  return {
    startupPending,
    startupReady,
    startupError,
    retryAppStartup,
  }
}
