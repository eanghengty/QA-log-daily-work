import {
  formatApiError,
  handleOptions,
  jsonResponse,
  loadSessionContext,
  parseJson,
} from '../_shared/auth.ts'
import { mapSiteRow, normalizeSiteInput, requireSiteId } from '../_shared/tracker.ts'

function normalizeRestoredSiteInput(value: Record<string, unknown>) {
  return normalizeSiteInput({
    ...value,
    hopReviewer: `${value?.hopReviewer || value?.hop_reviewer || 'NA'}`.trim() || 'NA',
  })
}

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse

  try {
    const body = await parseJson(req)
    const action = `${body.action || ''}`.trim()
    const { admin, user } = await loadSessionContext(req)

    if (action === 'list') {
      const { data, error } = await admin
        .from('sites')
        .select('id, name, hop_reviewer, scope, comment, url, created_at, updated_at')
        .order('id')

      if (error) {
        throw error
      }

      return jsonResponse(200, {
        sites: (data || []).map(mapSiteRow),
      })
    }

    if (action === 'get') {
      const id = requireSiteId(body.id)
      const { data, error } = await admin
        .from('sites')
        .select('id, name, hop_reviewer, scope, comment, url, created_at, updated_at')
        .eq('id', id)
        .maybeSingle()

      if (error) {
        throw error
      }

      return jsonResponse(200, {
        site: data ? mapSiteRow(data) : null,
      })
    }

    if (action === 'create') {
      const site = normalizeSiteInput(body.site || {})
      const { data, error } = await admin
        .from('sites')
        .insert({
          id: site.id,
          name: site.name,
          hop_reviewer: site.hopReviewer,
          scope: site.scope,
          comment: site.comment,
          url: site.url,
          created_by: user.id,
          updated_by: user.id,
        })
        .select('id, name, hop_reviewer, scope, comment, url, created_at, updated_at')
        .single()

      if (error) {
        throw error
      }

      return jsonResponse(200, { site: mapSiteRow(data) })
    }

    if (action === 'update') {
      const id = requireSiteId(body.id)
      const updates = normalizeSiteInput({
        id,
        ...(body.updates || {}),
      })

      const { data, error } = await admin
        .from('sites')
        .update({
          name: updates.name,
          hop_reviewer: updates.hopReviewer,
          scope: updates.scope,
          comment: updates.comment,
          url: updates.url,
          updated_by: user.id,
        })
        .eq('id', id)
        .select('id, name, hop_reviewer, scope, comment, url, created_at, updated_at')
        .single()

      if (error) {
        throw error
      }

      return jsonResponse(200, { site: mapSiteRow(data) })
    }

    if (action === 'upsert') {
      const site = normalizeSiteInput(body.site || {})
      const { data, error } = await admin
        .from('sites')
        .upsert({
          id: site.id,
          name: site.name,
          hop_reviewer: site.hopReviewer,
          scope: site.scope,
          comment: site.comment,
          url: site.url,
          updated_by: user.id,
        })
        .select('id, name, hop_reviewer, scope, comment, url, created_at, updated_at')
        .single()

      if (error) {
        throw error
      }

      return jsonResponse(200, { site: mapSiteRow(data) })
    }

    if (action === 'delete') {
      const id = requireSiteId(body.id)
      const { error } = await admin.from('sites').delete().eq('id', id)

      if (error) {
        throw error
      }

      return jsonResponse(200, { ok: true })
    }

    if (action === 'import-local') {
      const incomingSites = Array.isArray(body.sites) ? body.sites : []
      const normalizedSites = incomingSites
        .map((site) => normalizeSiteInput(site || {}))
        .filter((site, index, all) => all.findIndex((value) => value.id === site.id) === index)

      if (!normalizedSites.length) {
        return jsonResponse(200, { importedSites: 0 })
      }

      const { data: existingSites, error: existingSitesError } = await admin
        .from('sites')
        .select('id')
        .in(
          'id',
          normalizedSites.map((site) => site.id),
        )

      if (existingSitesError) {
        throw existingSitesError
      }

      const existingIds = new Set((existingSites || []).map((row) => row.id))
      const sitesToInsert = normalizedSites
        .filter((site) => !existingIds.has(site.id))
        .map((site) => ({
          id: site.id,
          name: site.name,
          hop_reviewer: site.hopReviewer,
          scope: site.scope,
          comment: site.comment,
          url: site.url,
          created_by: user.id,
          updated_by: user.id,
        }))

      if (sitesToInsert.length) {
        const { error } = await admin.from('sites').insert(sitesToInsert)
        if (error) {
          throw error
        }
      }

      return jsonResponse(200, { importedSites: sitesToInsert.length })
    }

    if (action === 'restore-backup') {
      const incomingSites = Array.isArray(body.sites) ? body.sites : []
      const normalizedSites = incomingSites
        .map((site) => normalizeRestoredSiteInput(site || {}))
        .filter((site, index, all) => all.findIndex((value) => value.id === site.id) === index)
        .map((site) => ({
          id: site.id,
          name: site.name,
          hop_reviewer: site.hopReviewer,
          scope: site.scope,
          comment: site.comment,
          url: site.url,
          created_by: user.id,
          updated_by: user.id,
        }))

      const { error: deleteSitesError } = await admin.from('sites').delete().not('id', 'is', null)
      if (deleteSitesError) {
        throw deleteSitesError
      }

      if (normalizedSites.length) {
        const { error } = await admin.from('sites').insert(normalizedSites)
        if (error) {
          throw error
        }
      }

      return jsonResponse(200, { restoredSites: normalizedSites.length })
    }

    return jsonResponse(400, {
      error: 'Unknown tracker site action.',
      code: 'UNKNOWN_TRACKER_SITE_ACTION',
    })
  } catch (error) {
    return formatApiError(error)
  }
})
