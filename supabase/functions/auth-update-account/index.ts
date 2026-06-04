import {
  ApiError,
  createPasswordRecord,
  formatApiError,
  handleOptions,
  jsonResponse,
  loadSessionContext,
  normalizeName,
  normalizePassword,
  parseJson,
  publicUserRow,
} from '../_shared/auth.ts'

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse

  try {
    const body = await parseJson(req)
    const { admin, user } = await loadSessionContext(req)
    const fullName = normalizeName(body.fullName)
    const password = normalizePassword(body.password)

    const updates: Record<string, unknown> = {
      full_name: fullName,
    }

    if (password.trim()) {
      if (password.length < 8) {
        throw new ApiError(400, 'PASSWORD_TOO_SHORT', 'Password must be at least 8 characters long.')
      }

      const { salt, hash } = await createPasswordRecord(password)
      updates.password_salt = salt
      updates.password_hash = hash
    }

    const { data: updatedUser, error } = await admin
      .from('app_users')
      .update(updates)
      .eq('id', user.id)
      .select('id, email, full_name, role')
      .single()

    if (error) {
      throw new ApiError(500, 'ACCOUNT_UPDATE_FAILED', error.message)
    }

    return jsonResponse(200, {
      user: publicUserRow(updatedUser),
    })
  } catch (error) {
    return formatApiError(error)
  }
})
