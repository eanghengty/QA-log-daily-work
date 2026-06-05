import { supabaseAnonKey, supabaseUrl } from './supabase.js'

export async function callCustomAuthFunction(endpointName, { token = '', body = {} } = {}) {
  if (!supabaseUrl || !supabaseAnonKey) {
    const error = new Error('Custom backend auth is not configured.')
    error.code = 'AUTH_CONFIG_MISSING'
    throw error
  }

  let response
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/${endpointName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  } catch (cause) {
    const error = new Error(
      `Unable to reach the ${endpointName} function. Check that the Edge Function is deployed and the network connection is available.`,
    )
    error.code = 'AUTH_FUNCTION_UNREACHABLE'
    error.cause = cause
    throw error
  }

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
