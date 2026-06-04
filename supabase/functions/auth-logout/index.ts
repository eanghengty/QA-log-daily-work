import {
  formatApiError,
  handleOptions,
  jsonResponse,
  loadSessionContext,
} from '../_shared/auth.ts'

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse

  try {
    const { admin, session, user } = await loadSessionContext(req)
    const now = new Date().toISOString()

    const { error: sessionError } = await admin
      .from('app_sessions')
      .update({
        revoked_at: now,
        updated_at: now,
      })
      .eq('id', session.id)

    if (sessionError) {
      throw sessionError
    }

    if (user.active_session_id === session.id) {
      const { error: userError } = await admin
        .from('app_users')
        .update({
          active_session_id: null,
          active_session_seen_at: now,
        })
        .eq('id', user.id)

      if (userError) {
        throw userError
      }
    }

    return jsonResponse(200, { ok: true })
  } catch (error) {
    return formatApiError(error)
  }
})
