import {
  ApiError,
  createRandomToken,
  formatApiError,
  getAdminClient,
  getClientId,
  handleOptions,
  hashSessionToken,
  jsonResponse,
  parseJson,
  publicUserRow,
  requireEmail,
  requirePassword,
  verifyPassword,
} from '../_shared/auth.ts'

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse

  try {
    const admin = getAdminClient()
    const body = await parseJson(req)
    const clientId = getClientId(body)
    const email = requireEmail(body.email)
    const password = requirePassword(body.password)

    const { data: user, error: userError } = await admin
      .from('app_users')
      .select('id, email, full_name, role, is_active, password_salt, password_hash')
      .eq('email', email)
      .maybeSingle()

    if (userError) {
      throw new ApiError(500, 'USER_LOOKUP_FAILED', userError.message)
    }

    if (!user || !user.is_active) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')
    }

    const isValidPassword = await verifyPassword(password, user.password_salt, user.password_hash)
    if (!isValidPassword) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')
    }

    const now = new Date().toISOString()
    const { error: revokeError } = await admin
      .from('app_sessions')
      .update({ revoked_at: now, updated_at: now })
      .eq('user_id', user.id)
      .is('revoked_at', null)

    if (revokeError) {
      throw new ApiError(500, 'SESSION_REVOKE_FAILED', revokeError.message)
    }

    const sessionToken = createRandomToken(32)
    const tokenHash = await hashSessionToken(sessionToken)
    const { data: session, error: sessionError } = await admin
      .from('app_sessions')
      .insert({
        user_id: user.id,
        client_id: clientId,
        token_hash: tokenHash,
      })
      .select('id, expires_at')
      .single()

    if (sessionError) {
      throw new ApiError(500, 'SESSION_CREATE_FAILED', sessionError.message)
    }

    const { error: activeSessionError } = await admin
      .from('app_users')
      .update({
        active_session_id: session.id,
        active_session_seen_at: now,
      })
      .eq('id', user.id)

    if (activeSessionError) {
      throw new ApiError(500, 'ACTIVE_SESSION_UPDATE_FAILED', activeSessionError.message)
    }

    return jsonResponse(200, {
      sessionToken,
      sessionId: session.id,
      expiresAt: session.expires_at,
      user: publicUserRow(user),
    })
  } catch (error) {
    return formatApiError(error)
  }
})
