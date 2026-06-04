import {
  ApiError,
  createPasswordRecord,
  createRandomToken,
  formatApiError,
  getAdminClient,
  getClientId,
  handleOptions,
  hashSessionToken,
  jsonResponse,
  normalizeName,
  parseJson,
  publicUserRow,
  requireEmail,
  requirePassword,
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
    const fullName = normalizeName(body.fullName)

    const { count, error: countError } = await admin.from('app_users').select('id', { count: 'exact', head: true })
    if (countError) {
      throw new ApiError(500, 'USER_COUNT_FAILED', countError.message)
    }
    if (Number(count || 0) > 0) {
      throw new ApiError(409, 'BOOTSTRAP_CLOSED', 'The first account has already been created.')
    }

    const { salt, hash } = await createPasswordRecord(password)
    const { data: user, error: createUserError } = await admin
      .from('app_users')
      .insert({
        email,
        full_name: fullName,
        role: 'admin',
        password_salt: salt,
        password_hash: hash,
      })
      .select('id, email, full_name, role')
      .single()

    if (createUserError) {
      throw new ApiError(500, 'USER_CREATE_FAILED', createUserError.message)
    }

    const sessionToken = createRandomToken(32)
    const tokenHash = await hashSessionToken(sessionToken)
    const now = new Date().toISOString()

    const { data: session, error: createSessionError } = await admin
      .from('app_sessions')
      .insert({
        user_id: user.id,
        client_id: clientId,
        token_hash: tokenHash,
      })
      .select('id, expires_at')
      .single()

    if (createSessionError) {
      throw new ApiError(500, 'SESSION_CREATE_FAILED', createSessionError.message)
    }

    const { error: updateUserError } = await admin
      .from('app_users')
      .update({
        active_session_id: session.id,
        active_session_seen_at: now,
      })
      .eq('id', user.id)

    if (updateUserError) {
      throw new ApiError(500, 'USER_SESSION_LINK_FAILED', updateUserError.message)
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
