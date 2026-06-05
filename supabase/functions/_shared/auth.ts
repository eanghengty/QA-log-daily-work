import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const encoder = new TextEncoder()

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

export function handleOptions(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  return null
}

export async function parseJson(req: Request) {
  const raw = await req.text()
  if (!raw.trim()) return {}

  try {
    return JSON.parse(raw)
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Invalid request body.')
  }
}

export function getAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

  if (!supabaseUrl || !serviceRoleKey) {
    throw new ApiError(500, 'SERVER_CONFIG_MISSING', 'Supabase service role configuration is missing.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export function normalizeEmail(value: unknown) {
  return `${value || ''}`.trim().toLowerCase()
}

export function normalizeName(value: unknown) {
  return `${value || ''}`.trim()
}

export function normalizePassword(value: unknown) {
  return `${value || ''}`
}

export function requireEmail(value: unknown) {
  const email = normalizeEmail(value)
  if (!email) {
    throw new ApiError(400, 'EMAIL_REQUIRED', 'Email is required.')
  }
  return email
}

export function requirePassword(value: unknown) {
  const password = normalizePassword(value)
  if (!password.trim()) {
    throw new ApiError(400, 'PASSWORD_REQUIRED', 'Password is required.')
  }
  if (password.length < 8) {
    throw new ApiError(400, 'PASSWORD_TOO_SHORT', 'Password must be at least 8 characters long.')
  }
  return password
}

export function requireRole(value: unknown) {
  const role = `${value || ''}`.trim().toLowerCase()
  if (!role) {
    throw new ApiError(400, 'ROLE_REQUIRED', 'Role is required.')
  }

  if (!['admin', 'manager', 'member'].includes(role)) {
    throw new ApiError(400, 'ROLE_INVALID', 'Role must be admin, manager, or member.')
  }

  return role
}

export function requireSessionToken(req: Request) {
  const authorization = req.headers.get('authorization') || ''
  if (authorization.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim()
    if (token) return token
  }

  const headerToken = `${req.headers.get('x-session-token') || ''}`.trim()
  if (headerToken) return headerToken

  throw new ApiError(401, 'SESSION_REQUIRED', 'A valid session token is required.')
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const value of bytes) {
    binary += String.fromCharCode(value)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false

  let result = 0
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }

  return result === 0
}

export function createRandomToken(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return bytesToBase64Url(bytes)
}

async function sha256(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input))
  return bytesToBase64Url(new Uint8Array(digest))
}

async function pbkdf2(password: string, salt: string) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 210_000,
      hash: 'SHA-256',
    },
    baseKey,
    256,
  )

  return bytesToBase64Url(new Uint8Array(bits))
}

export async function createPasswordRecord(password: string) {
  const salt = createRandomToken(16)
  const hash = await pbkdf2(password, salt)
  return { salt, hash }
}

export async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actualHash = await pbkdf2(password, salt)
  return constantTimeEqual(actualHash, expectedHash)
}

export async function hashSessionToken(token: string) {
  return await sha256(token)
}

export function publicUserRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
  }
}

export async function loadSessionContext(req: Request) {
  const admin = getAdminClient()
  const token = requireSessionToken(req)
  const tokenHash = await hashSessionToken(token)

  const { data: session, error: sessionError } = await admin
    .from('app_sessions')
    .select('id, user_id, client_id, created_at, updated_at, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (sessionError) {
    throw new ApiError(500, 'SESSION_LOOKUP_FAILED', sessionError.message)
  }

  if (!session || session.revoked_at) {
    throw new ApiError(401, 'SESSION_INVALID', 'The session is no longer valid.')
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await admin.from('app_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', session.id)
    throw new ApiError(401, 'SESSION_EXPIRED', 'The session has expired.')
  }

  const { data: user, error: userError } = await admin
    .from('app_users')
    .select('id, email, full_name, role, is_active, active_session_id')
    .eq('id', session.user_id)
    .maybeSingle()

  if (userError) {
    throw new ApiError(500, 'USER_LOOKUP_FAILED', userError.message)
  }

  if (!user || !user.is_active) {
    await admin.from('app_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', session.id)
    throw new ApiError(401, 'USER_INACTIVE', 'The account is inactive.')
  }

  if (user.active_session_id && user.active_session_id !== session.id) {
    await admin.from('app_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', session.id)
    throw new ApiError(409, 'SESSION_REPLACED', 'This session has been replaced by a newer login.')
  }

  return { admin, token, tokenHash, session, user }
}

export function requireAdminUser(user: Record<string, unknown>) {
  if (`${user?.role || ''}` !== 'admin') {
    throw new ApiError(403, 'ADMIN_REQUIRED', 'Only admin field users can manage accounts.')
  }
}

export async function markSessionSeen(admin: ReturnType<typeof createClient>, sessionId: string, userId: string, clientId: string) {
  const now = new Date().toISOString()

  const { error: sessionError } = await admin
    .from('app_sessions')
    .update({
      client_id: clientId,
      updated_at: now,
    })
    .eq('id', sessionId)

  if (sessionError) {
    throw new ApiError(500, 'SESSION_TOUCH_FAILED', sessionError.message)
  }

  const { error: userError } = await admin
    .from('app_users')
    .update({
      active_session_id: sessionId,
      active_session_seen_at: now,
    })
    .eq('id', userId)

  if (userError) {
    throw new ApiError(500, 'USER_TOUCH_FAILED', userError.message)
  }
}

export function getClientId(body: Record<string, unknown>) {
  const clientId = `${body.clientId || ''}`.trim()
  if (!clientId) {
    throw new ApiError(400, 'CLIENT_ID_REQUIRED', 'Client ID is required.')
  }
  return clientId
}

export function formatApiError(error: unknown) {
  if (error instanceof ApiError) {
    return jsonResponse(error.status, {
      error: error.message,
      code: error.code,
    })
  }

  console.error(error)
  return jsonResponse(500, {
    error: 'Unexpected server error.',
    code: 'UNEXPECTED_SERVER_ERROR',
  })
}
