import {
  formatApiError,
  getClientId,
  handleOptions,
  jsonResponse,
  loadSessionContext,
  markSessionSeen,
  parseJson,
  publicUserRow,
} from '../_shared/auth.ts'

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse

  try {
    const body = await parseJson(req)
    const clientId = getClientId(body)
    const { admin, session, user } = await loadSessionContext(req)

    await markSessionSeen(admin, session.id, user.id, clientId)

    return jsonResponse(200, {
      sessionId: session.id,
      expiresAt: session.expires_at,
      user: publicUserRow(user),
    })
  } catch (error) {
    return formatApiError(error)
  }
})
