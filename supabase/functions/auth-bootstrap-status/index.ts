import { formatApiError, getAdminClient, handleOptions, jsonResponse } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse

  try {
    const admin = getAdminClient()
    const { count, error } = await admin.from('app_users').select('id', { count: 'exact', head: true })

    if (error) {
      throw error
    }

    const userCount = Number(count || 0)

    return jsonResponse(200, {
      hasUsers: userCount > 0,
      userCount,
    })
  } catch (error) {
    return formatApiError(error)
  }
})
