import {
  formatApiError,
  handleOptions,
  jsonResponse,
  loadSessionContext,
  parseJson,
} from '../_shared/auth.ts'
import { mapLookupRow, requireLookupName } from '../_shared/tracker.ts'

function buildUniqueLookupRows(rows: unknown[], label: string, userId: string) {
  const seen = new Set<string>()

  return (Array.isArray(rows) ? rows : [])
    .map((row) => requireLookupName((row as Record<string, unknown>)?.name, label))
    .filter((name) => {
      const key = name.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((name) => ({
      name,
      created_by: userId,
      updated_by: userId,
    }))
}

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse

  try {
    const body = await parseJson(req)
    const action = `${body.action || ''}`.trim()
    const { admin, user } = await loadSessionContext(req)

    if (action === 'list') {
      const [{ data: scopes, error: scopesError }, { data: confirmSources, error: confirmSourcesError }] =
        await Promise.all([
          admin.from('site_scopes').select('id, name, created_at, updated_at').order('name'),
          admin.from('confirm_sources').select('id, name, created_at, updated_at').order('name'),
        ])

      if (scopesError) {
        throw scopesError
      }

      if (confirmSourcesError) {
        throw confirmSourcesError
      }

      return jsonResponse(200, {
        scopes: (scopes || []).map(mapLookupRow),
        confirmSources: (confirmSources || []).map(mapLookupRow),
      })
    }

    if (action === 'add-scope') {
      const name = requireLookupName(body.name, 'Scope name')
      const { data, error } = await admin
        .from('site_scopes')
        .insert({
          name,
          created_by: user.id,
          updated_by: user.id,
        })
        .select('id, name, created_at, updated_at')
        .single()

      if (error) {
        throw error
      }

      return jsonResponse(200, { scope: mapLookupRow(data) })
    }

    if (action === 'delete-scope') {
      const id = `${body.id || ''}`.trim()
      const name = `${body.name || ''}`.trim()
      if (!id && !name) {
        return jsonResponse(400, { error: 'Scope ID or name is required.', code: 'SCOPE_ID_REQUIRED' })
      }

      let query = admin.from('site_scopes').delete()
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        query = query.eq('id', id)
      } else {
        query = query.ilike('name', name || id)
      }

      const { error } = await query
      if (error) {
        throw error
      }

      return jsonResponse(200, { ok: true })
    }

    if (action === 'add-confirm-source') {
      const name = requireLookupName(body.name, 'Confirmation source name')
      const { data, error } = await admin
        .from('confirm_sources')
        .insert({
          name,
          created_by: user.id,
          updated_by: user.id,
        })
        .select('id, name, created_at, updated_at')
        .single()

      if (error) {
        throw error
      }

      return jsonResponse(200, { confirmSource: mapLookupRow(data) })
    }

    if (action === 'delete-confirm-source') {
      const id = `${body.id || ''}`.trim()
      const name = `${body.name || ''}`.trim()
      if (!id && !name) {
        return jsonResponse(400, {
          error: 'Confirmation source ID or name is required.',
          code: 'CONFIRM_SOURCE_ID_REQUIRED',
        })
      }

      let query = admin.from('confirm_sources').delete()
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        query = query.eq('id', id)
      } else {
        query = query.ilike('name', name || id)
      }

      const { error } = await query
      if (error) {
        throw error
      }

      return jsonResponse(200, { ok: true })
    }

    if (action === 'import-local') {
      const incomingScopes = Array.isArray(body.scopes) ? body.scopes : []
      const incomingConfirmSources = Array.isArray(body.confirmSources) ? body.confirmSources : []

      const [{ data: existingScopes, error: existingScopesError }, { data: existingConfirmSources, error: existingConfirmSourcesError }] =
        await Promise.all([
          admin.from('site_scopes').select('name'),
          admin.from('confirm_sources').select('name'),
        ])

      if (existingScopesError) {
        throw existingScopesError
      }

      if (existingConfirmSourcesError) {
        throw existingConfirmSourcesError
      }

      const existingScopeNames = new Set((existingScopes || []).map((row) => `${row.name || ''}`.trim().toLowerCase()))
      const existingConfirmSourceNames = new Set(
        (existingConfirmSources || []).map((row) => `${row.name || ''}`.trim().toLowerCase()),
      )

      const scopesToInsert = incomingScopes
        .map((row) => requireLookupName(row?.name, 'Scope name'))
        .filter((name, index, all) => all.findIndex((value) => value.toLowerCase() === name.toLowerCase()) === index)
        .filter((name) => !existingScopeNames.has(name.toLowerCase()))
        .map((name) => ({
          name,
          created_by: user.id,
          updated_by: user.id,
        }))

      const confirmSourcesToInsert = incomingConfirmSources
        .map((row) => requireLookupName(row?.name, 'Confirmation source name'))
        .filter((name, index, all) => all.findIndex((value) => value.toLowerCase() === name.toLowerCase()) === index)
        .filter((name) => !existingConfirmSourceNames.has(name.toLowerCase()))
        .map((name) => ({
          name,
          created_by: user.id,
          updated_by: user.id,
        }))

      if (scopesToInsert.length) {
        const { error } = await admin.from('site_scopes').insert(scopesToInsert)
        if (error) {
          throw error
        }
      }

      if (confirmSourcesToInsert.length) {
        const { error } = await admin.from('confirm_sources').insert(confirmSourcesToInsert)
        if (error) {
          throw error
        }
      }

      return jsonResponse(200, {
        importedScopes: scopesToInsert.length,
        importedConfirmSources: confirmSourcesToInsert.length,
      })
    }

    if (action === 'restore-backup') {
      const scopesToInsert = buildUniqueLookupRows(body.scopes, 'Scope name', user.id)
      const confirmSourcesToInsert = buildUniqueLookupRows(
        body.confirmSources,
        'Confirmation source name',
        user.id,
      )

      const { error: deleteScopesError } = await admin.from('site_scopes').delete().not('id', 'is', null)
      if (deleteScopesError) {
        throw deleteScopesError
      }

      const { error: deleteConfirmSourcesError } = await admin
        .from('confirm_sources')
        .delete()
        .not('id', 'is', null)
      if (deleteConfirmSourcesError) {
        throw deleteConfirmSourcesError
      }

      if (scopesToInsert.length) {
        const { error } = await admin.from('site_scopes').insert(scopesToInsert)
        if (error) {
          throw error
        }
      }

      if (confirmSourcesToInsert.length) {
        const { error } = await admin.from('confirm_sources').insert(confirmSourcesToInsert)
        if (error) {
          throw error
        }
      }

      return jsonResponse(200, {
        restoredScopes: scopesToInsert.length,
        restoredConfirmSources: confirmSourcesToInsert.length,
      })
    }

    return jsonResponse(400, {
      error: 'Unknown tracker lookup action.',
      code: 'UNKNOWN_TRACKER_LOOKUP_ACTION',
    })
  } catch (error) {
    return formatApiError(error)
  }
})
