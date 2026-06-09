import {
  ApiError,
  createPasswordRecord,
  formatApiError,
  handleOptions,
  jsonResponse,
  loadSessionContext,
  normalizeName,
  parseJson,
  publicUserRow,
  requireAdminUser,
  requireEmail,
  requirePassword,
  requireRole,
} from '../_shared/auth.ts'

function formatManagedUser(row: Record<string, unknown>) {
  return {
    ...publicUserRow(row),
    isActive: Boolean(row.is_active),
    lastSeenAt: row.active_session_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function requireUserId(value: unknown) {
  const userId = `${value || ''}`.trim()
  if (!userId) {
    throw new ApiError(400, 'USER_ID_REQUIRED', 'User ID is required.')
  }
  return userId
}

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse

  try {
    const body = await parseJson(req)
    const { admin, user } = await loadSessionContext(req)
    requireAdminUser(user)

    const action = `${body.action || 'list'}`.trim()

    if (action === 'list') {
      const { data, error } = await admin
        .from('app_users')
        .select('id, email, full_name, role, is_active, active_session_seen_at, created_at, updated_at')
        .order('created_at', { ascending: true })

      if (error) {
        throw new ApiError(500, 'USER_LIST_FAILED', error.message)
      }

      return jsonResponse(200, {
        users: (data || []).map(formatManagedUser),
      })
    }

    if (action === 'create') {
      const email = requireEmail(body.email)
      const password = requirePassword(body.password)
      const fullName = normalizeName(body.fullName)
      const role = requireRole(body.role)
      const { salt, hash } = await createPasswordRecord(password)

      const { data, error } = await admin
        .from('app_users')
        .insert({
          email,
          full_name: fullName,
          role,
          password_salt: salt,
          password_hash: hash,
        })
        .select('id, email, full_name, role, is_active, active_session_seen_at, created_at, updated_at')
        .single()

      if (error) {
        if (`${error.code || ''}` === '23505') {
          throw new ApiError(409, 'EMAIL_EXISTS', 'That email address already belongs to a field-user account.')
        }

        throw new ApiError(500, 'USER_CREATE_FAILED', error.message)
      }

      return jsonResponse(200, {
        user: formatManagedUser(data),
      })
    }

    if (action === 'update-role') {
      const userId = requireUserId(body.userId)
      const role = requireRole(body.role)

      const { data: existingUser, error: existingUserError } = await admin
        .from('app_users')
        .select('id, role')
        .eq('id', userId)
        .maybeSingle()

      if (existingUserError) {
        throw new ApiError(500, 'USER_LOOKUP_FAILED', existingUserError.message)
      }

      if (!existingUser) {
        throw new ApiError(404, 'USER_NOT_FOUND', 'That field-user account no longer exists.')
      }

      if (userId === user.id && role !== 'admin') {
        throw new ApiError(409, 'SELF_ADMIN_REQUIRED', 'Keep your signed-in account as admin.')
      }

      if (existingUser.role === 'admin' && role !== 'admin') {
        const { count, error: countError } = await admin
          .from('app_users')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'admin')

        if (countError) {
          throw new ApiError(500, 'ADMIN_COUNT_FAILED', countError.message)
        }

        if (Number(count || 0) <= 1) {
          throw new ApiError(409, 'LAST_ADMIN_REQUIRED', 'At least one admin field user must remain.')
        }
      }

      const { data, error } = await admin
        .from('app_users')
        .update({ role })
        .eq('id', userId)
        .select('id, email, full_name, role, is_active, active_session_seen_at, created_at, updated_at')
        .single()

      if (error) {
        throw new ApiError(500, 'ROLE_UPDATE_FAILED', error.message)
      }

      return jsonResponse(200, {
        user: formatManagedUser(data),
      })
    }

    throw new ApiError(400, 'INVALID_ACTION', 'Unsupported auth-users action.')
  } catch (error) {
    return formatApiError(error)
  }
})
