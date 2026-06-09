import {
  formatApiError,
  handleOptions,
  jsonResponse,
  loadSessionContext,
  parseJson,
} from '../_shared/auth.ts'
import {
  mapConfirmRow,
  mapDocumentReferenceRow,
  mapEmailSettingsRow,
  mapIssueRow,
  mapPendingSummaryRow,
  mapReportRow,
  mapSnagReportRow,
  mapSnagSummaryRow,
  normalizeConfirmInput,
  normalizeDocumentReferenceInput,
  normalizeEmailSettingsInput,
  normalizeIssueInput,
  normalizePendingSummaryInput,
  normalizeReportInput,
  normalizeSnagReportInput,
  normalizeSnagSummaryInput,
  requireRecordId,
  requireSiteId,
} from '../_shared/tracker.ts'

const TRACKER_BOARD_KEYS = new Set([
  'site-checklist',
  'cable-matrix',
  'antenna-checklist',
  'dcpl-checklist',
  'cable-checklist',
])

function requireBoardKey(value: unknown) {
  const key = `${value || ''}`.trim()
  if (!TRACKER_BOARD_KEYS.has(key)) {
    const error = new Error('Unknown tracker board key.')
    error.name = 'ValidationError'
    throw error
  }
  return key
}

function mapBoardRow(row: Record<string, unknown>) {
  return {
    siteId: row.site_id,
    boardKey: row.board_key,
    payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapActivityLogRow(row: Record<string, unknown>) {
  return {
    cloudId: row.id,
    action: row.action || '',
    detail: row.detail || '',
    userId: row.user_id || '',
    userName: row.user_name || '',
    userEmail: row.user_email || '',
    at: row.created_at,
  }
}

function normalizeActivityLogInput(entry: Record<string, unknown>) {
  const action = `${entry.action || ''}`.trim()
  if (!action) {
    const error = new Error('Activity action is required.')
    error.name = 'ValidationError'
    throw error
  }

  return {
    action,
    detail: `${entry.detail || ''}`.trim(),
    userName: `${entry.userName || entry.user_name || ''}`.trim(),
    userEmail: `${entry.userEmail || entry.user_email || ''}`.trim(),
    at: `${entry.at || entry.created_at || ''}`.trim(),
  }
}

function normalizeBoardsPayload(boards: unknown) {
  if (!boards || typeof boards !== 'object') return []

  if (Array.isArray(boards)) {
    return boards
      .map((board) => {
        const source = board && typeof board === 'object' ? (board as Record<string, unknown>) : {}
        return {
          boardKey: requireBoardKey(source.boardKey || source.board_key),
          payload: source.payload && typeof source.payload === 'object' ? source.payload : {},
        }
      })
  }

  return Object.entries(boards as Record<string, unknown>).map(([boardKey, payload]) => ({
    boardKey: requireBoardKey(boardKey),
    payload: payload && typeof payload === 'object' ? payload : {},
  }))
}

async function buildNextLegacyCode(
  admin: Awaited<ReturnType<typeof loadSessionContext>>['admin'],
  tableName: 'issues' | 'confirms',
  siteId: string,
  prefix: 'I' | 'C',
  seed: number,
) {
  const { data, error } = await admin.from(tableName).select('code').eq('site_id', siteId)
  if (error) {
    throw error
  }

  const nextNumber = (data || []).reduce((max, row) => {
    const value = Number.parseInt(`${row.code || ''}`.split('-')[1] || '', 10)
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, seed) + 1

  return `${prefix}-${nextNumber}`
}

function mapImportedReports(siteId: string, reports: unknown[], userId: string) {
  return (Array.isArray(reports) ? reports : [])
    .map((row) => normalizeReportInput({ ...(row || {}), siteId }))
    .map((report) => ({
      site_id: siteId,
      report_date: report.date,
      report_time: report.time,
      notes: report.notes,
      notes_rich: report.notesRich,
      linked_issue_ids: report.linkedIssueIds,
      linked_confirm_ids: report.linkedConfirmIds,
      attachment_ids: report.attachmentIds,
      created_by: userId,
      updated_by: userId,
    }))
}

function mapImportedIssues(siteId: string, issues: unknown[], userId: string) {
  return (Array.isArray(issues) ? issues : [])
    .map((row) => ({
      ...normalizeIssueInput({ ...(row || {}), siteId }),
      code: `${row?.code || ''}`.trim(),
    }))
    .filter((issue) => issue.code)
    .map((issue) => ({
      site_id: siteId,
      code: issue.code,
      title: issue.title,
      priority: issue.priority,
      area: issue.area,
      environment: issue.environment,
      steps: issue.steps,
      status: issue.status,
      report_ref: issue.reportRef,
      attachment_ids: issue.attachmentIds,
      event_date: issue.date || null,
      created_by: userId,
      updated_by: userId,
    }))
}

function mapImportedConfirms(siteId: string, confirms: unknown[], userId: string) {
  return (Array.isArray(confirms) ? confirms : [])
    .map((row) => ({
      ...normalizeConfirmInput({ ...(row || {}), siteId }),
      code: `${row?.code || ''}`.trim(),
    }))
    .filter((confirm) => confirm.code)
    .map((confirm) => ({
      site_id: siteId,
      code: confirm.code,
      title: confirm.title,
      source: confirm.source,
      confirmed_by: confirm.confirmedBy,
      notes: confirm.notes,
      report_ref: confirm.reportRef,
      resolves_issue_ref: confirm.resolvesIssueRef,
      attachment_ids: confirm.attachmentIds,
      event_date: confirm.date || null,
      created_by: userId,
      updated_by: userId,
    }))
}

function mapImportedDocumentReferences(siteId: string, documentReferences: unknown[], userId: string) {
  return (Array.isArray(documentReferences) ? documentReferences : [])
    .map((row) => normalizeDocumentReferenceInput({ ...(row || {}), siteId }))
    .map((reference) => ({
      site_id: siteId,
      title: reference.title,
      link: reference.link,
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

    if (action === 'list-site') {
      const siteId = requireSiteId(body.siteId)
      const [
        { data: reports, error: reportsError },
        { data: issues, error: issuesError },
        { data: confirms, error: confirmsError },
        { data: documentReferences, error: documentReferencesError },
        { data: emailSettings, error: emailSettingsError },
        { data: pendingSummary, error: pendingSummaryError },
      ] = await Promise.all([
        admin
          .from('reports')
          .select(
            'id, site_id, report_date, report_time, notes, notes_rich, linked_issue_ids, linked_confirm_ids, attachment_ids, created_at, updated_at',
          )
          .eq('site_id', siteId)
          .order('report_date', { ascending: false })
          .order('created_at', { ascending: false }),
        admin
          .from('issues')
          .select(
            'id, site_id, code, title, priority, area, environment, steps, status, report_ref, attachment_ids, event_date, created_at, updated_at',
          )
          .eq('site_id', siteId)
          .order('created_at', { ascending: false }),
        admin
          .from('confirms')
          .select(
            'id, site_id, code, title, source, confirmed_by, notes, report_ref, resolves_issue_ref, attachment_ids, event_date, created_at, updated_at',
          )
          .eq('site_id', siteId)
          .order('created_at', { ascending: false }),
        admin
          .from('document_references')
          .select('id, site_id, title, link, created_at, updated_at')
          .eq('site_id', siteId)
          .order('created_at', { ascending: false }),
        admin
          .from('email_settings')
          .select('site_id, to_list, cc_list, subject_prefix, created_at, updated_at')
          .eq('site_id', siteId)
          .maybeSingle(),
        admin
          .from('pending_summaries')
          .select('site_id, source_text, sections, created_at, updated_at')
          .eq('site_id', siteId)
          .maybeSingle(),
      ])

      if (reportsError) throw reportsError
      if (issuesError) throw issuesError
      if (confirmsError) throw confirmsError
      if (documentReferencesError) throw documentReferencesError
      if (emailSettingsError) throw emailSettingsError
      if (pendingSummaryError) throw pendingSummaryError

      return jsonResponse(200, {
        reports: (reports || []).map(mapReportRow),
        issues: (issues || []).map(mapIssueRow),
        confirms: (confirms || []).map(mapConfirmRow),
        documentReferences: (documentReferences || []).map(mapDocumentReferenceRow),
        emailSettings: mapEmailSettingsRow(emailSettings || { site_id: siteId }),
        pendingSummary: pendingSummary ? mapPendingSummaryRow(pendingSummary) : null,
      })
    }

    if (action === 'list-activity-log') {
      const { data, error } = await admin
        .from('activity_log')
        .select('id, action, detail, user_id, user_name, user_email, created_at')
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) throw error
      return jsonResponse(200, { activityLog: (data || []).map(mapActivityLogRow) })
    }

    if (action === 'add-activity-log') {
      const entry = normalizeActivityLogInput(body.entry || {})
      const { data, error } = await admin
        .from('activity_log')
        .insert({
          action: entry.action,
          detail: entry.detail,
          user_id: user.id,
          user_name: entry.userName || user.full_name || user.email || 'Unknown user',
          user_email: entry.userEmail || user.email || '',
          ...(entry.at ? { created_at: entry.at } : {}),
        })
        .select('id, action, detail, user_id, user_name, user_email, created_at')
        .single()

      if (error) throw error
      return jsonResponse(200, { activityLogEntry: mapActivityLogRow(data) })
    }

    if (action === 'clear-activity-log') {
      const { error } = await admin.from('activity_log').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (error) throw error
      return jsonResponse(200, { ok: true })
    }

    if (action === 'list-reports') {
      const siteId = requireSiteId(body.siteId)
      const { data, error } = await admin
        .from('reports')
        .select(
          'id, site_id, report_date, report_time, notes, notes_rich, linked_issue_ids, linked_confirm_ids, attachment_ids, created_at, updated_at',
        )
        .eq('site_id', siteId)
        .order('report_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      return jsonResponse(200, { reports: (data || []).map(mapReportRow) })
    }

    if (action === 'get-report') {
      const id = requireRecordId(body.id, 'Report ID')
      const { data, error } = await admin
        .from('reports')
        .select(
          'id, site_id, report_date, report_time, notes, notes_rich, linked_issue_ids, linked_confirm_ids, attachment_ids, created_at, updated_at',
        )
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      return jsonResponse(200, { report: data ? mapReportRow(data) : null })
    }

    if (action === 'create-report') {
      const report = normalizeReportInput(body.report || {})
      const { data, error } = await admin
        .from('reports')
        .insert({
          site_id: report.siteId,
          report_date: report.date,
          report_time: report.time,
          notes: report.notes,
          notes_rich: report.notesRich,
          linked_issue_ids: report.linkedIssueIds,
          linked_confirm_ids: report.linkedConfirmIds,
          attachment_ids: report.attachmentIds,
          created_by: user.id,
          updated_by: user.id,
        })
        .select(
          'id, site_id, report_date, report_time, notes, notes_rich, linked_issue_ids, linked_confirm_ids, attachment_ids, created_at, updated_at',
        )
        .single()

      if (error) throw error
      return jsonResponse(200, { report: mapReportRow(data) })
    }

    if (action === 'update-report') {
      const id = requireRecordId(body.id, 'Report ID')
      const report = normalizeReportInput(body.updates || {})
      const { data, error } = await admin
        .from('reports')
        .update({
          site_id: report.siteId,
          report_date: report.date,
          report_time: report.time,
          notes: report.notes,
          notes_rich: report.notesRich,
          linked_issue_ids: report.linkedIssueIds,
          linked_confirm_ids: report.linkedConfirmIds,
          attachment_ids: report.attachmentIds,
          updated_by: user.id,
        })
        .eq('id', id)
        .select(
          'id, site_id, report_date, report_time, notes, notes_rich, linked_issue_ids, linked_confirm_ids, attachment_ids, created_at, updated_at',
        )
        .single()

      if (error) throw error
      return jsonResponse(200, { report: mapReportRow(data) })
    }

    if (action === 'delete-report') {
      const id = requireRecordId(body.id, 'Report ID')
      const { error } = await admin.from('reports').delete().eq('id', id)
      if (error) throw error
      return jsonResponse(200, { ok: true })
    }

    if (action === 'list-issues') {
      const siteId = requireSiteId(body.siteId)
      const { data, error } = await admin
        .from('issues')
        .select(
          'id, site_id, code, title, priority, area, environment, steps, status, report_ref, attachment_ids, event_date, created_at, updated_at',
        )
        .eq('site_id', siteId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return jsonResponse(200, { issues: (data || []).map(mapIssueRow) })
    }

    if (action === 'get-issue') {
      const id = requireRecordId(body.id, 'Issue ID')
      const { data, error } = await admin
        .from('issues')
        .select(
          'id, site_id, code, title, priority, area, environment, steps, status, report_ref, attachment_ids, event_date, created_at, updated_at',
        )
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      return jsonResponse(200, { issue: data ? mapIssueRow(data) : null })
    }

    if (action === 'create-issue') {
      const issue = normalizeIssueInput(body.issue || {})
      const code = await buildNextLegacyCode(admin, 'issues', issue.siteId, 'I', 199)
      const { data, error } = await admin
        .from('issues')
        .insert({
          site_id: issue.siteId,
          code,
          title: issue.title,
          priority: issue.priority,
          area: issue.area,
          environment: issue.environment,
          steps: issue.steps,
          status: issue.status,
          report_ref: issue.reportRef,
          attachment_ids: issue.attachmentIds,
          event_date: issue.date,
          created_by: user.id,
          updated_by: user.id,
        })
        .select(
          'id, site_id, code, title, priority, area, environment, steps, status, report_ref, attachment_ids, event_date, created_at, updated_at',
        )
        .single()

      if (error) throw error
      return jsonResponse(200, { issue: mapIssueRow(data) })
    }

    if (action === 'update-issue') {
      const id = requireRecordId(body.id, 'Issue ID')
      const issue = normalizeIssueInput(body.updates || {})
      const { data, error } = await admin
        .from('issues')
        .update({
          site_id: issue.siteId,
          title: issue.title,
          priority: issue.priority,
          area: issue.area,
          environment: issue.environment,
          steps: issue.steps,
          status: issue.status,
          report_ref: issue.reportRef,
          attachment_ids: issue.attachmentIds,
          event_date: issue.date,
          updated_by: user.id,
        })
        .eq('id', id)
        .select(
          'id, site_id, code, title, priority, area, environment, steps, status, report_ref, attachment_ids, event_date, created_at, updated_at',
        )
        .single()

      if (error) throw error
      return jsonResponse(200, { issue: mapIssueRow(data) })
    }

    if (action === 'delete-issue') {
      const id = requireRecordId(body.id, 'Issue ID')
      const { error } = await admin.from('issues').delete().eq('id', id)
      if (error) throw error
      return jsonResponse(200, { ok: true })
    }

    if (action === 'list-confirms') {
      const siteId = requireSiteId(body.siteId)
      const { data, error } = await admin
        .from('confirms')
        .select(
          'id, site_id, code, title, source, confirmed_by, notes, report_ref, resolves_issue_ref, attachment_ids, event_date, created_at, updated_at',
        )
        .eq('site_id', siteId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return jsonResponse(200, { confirms: (data || []).map(mapConfirmRow) })
    }

    if (action === 'get-confirm') {
      const id = requireRecordId(body.id, 'Confirmation ID')
      const { data, error } = await admin
        .from('confirms')
        .select(
          'id, site_id, code, title, source, confirmed_by, notes, report_ref, resolves_issue_ref, attachment_ids, event_date, created_at, updated_at',
        )
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      return jsonResponse(200, { confirm: data ? mapConfirmRow(data) : null })
    }

    if (action === 'create-confirm') {
      const confirm = normalizeConfirmInput(body.confirm || {})
      const code = await buildNextLegacyCode(admin, 'confirms', confirm.siteId, 'C', 99)
      const { data, error } = await admin
        .from('confirms')
        .insert({
          site_id: confirm.siteId,
          code,
          title: confirm.title,
          source: confirm.source,
          confirmed_by: confirm.confirmedBy,
          notes: confirm.notes,
          report_ref: confirm.reportRef,
          resolves_issue_ref: confirm.resolvesIssueRef,
          attachment_ids: confirm.attachmentIds,
          event_date: confirm.date,
          created_by: user.id,
          updated_by: user.id,
        })
        .select(
          'id, site_id, code, title, source, confirmed_by, notes, report_ref, resolves_issue_ref, attachment_ids, event_date, created_at, updated_at',
        )
        .single()

      if (error) throw error
      return jsonResponse(200, { confirm: mapConfirmRow(data) })
    }

    if (action === 'update-confirm') {
      const id = requireRecordId(body.id, 'Confirmation ID')
      const confirm = normalizeConfirmInput(body.updates || {})
      const { data, error } = await admin
        .from('confirms')
        .update({
          site_id: confirm.siteId,
          title: confirm.title,
          source: confirm.source,
          confirmed_by: confirm.confirmedBy,
          notes: confirm.notes,
          report_ref: confirm.reportRef,
          resolves_issue_ref: confirm.resolvesIssueRef,
          attachment_ids: confirm.attachmentIds,
          event_date: confirm.date,
          updated_by: user.id,
        })
        .eq('id', id)
        .select(
          'id, site_id, code, title, source, confirmed_by, notes, report_ref, resolves_issue_ref, attachment_ids, event_date, created_at, updated_at',
        )
        .single()

      if (error) throw error
      return jsonResponse(200, { confirm: mapConfirmRow(data) })
    }

    if (action === 'delete-confirm') {
      const id = requireRecordId(body.id, 'Confirmation ID')
      const { error } = await admin.from('confirms').delete().eq('id', id)
      if (error) throw error
      return jsonResponse(200, { ok: true })
    }

    if (action === 'get-site-board') {
      const siteId = requireSiteId(body.siteId)
      const boardKey = requireBoardKey(body.boardKey)
      const { data, error } = await admin
        .from('tracker_site_boards')
        .select('site_id, board_key, payload, created_at, updated_at')
        .eq('site_id', siteId)
        .eq('board_key', boardKey)
        .maybeSingle()

      if (error) throw error
      return jsonResponse(200, { board: data ? mapBoardRow(data) : null })
    }

    if (action === 'save-site-board') {
      const siteId = requireSiteId(body.siteId)
      const boardKey = requireBoardKey(body.boardKey)
      const payload = body.payload && typeof body.payload === 'object' ? body.payload : {}
      const { data, error } = await admin
        .from('tracker_site_boards')
        .upsert({
          site_id: siteId,
          board_key: boardKey,
          payload,
          updated_by: user.id,
        })
        .select('site_id, board_key, payload, created_at, updated_at')
        .single()

      if (error) throw error
      return jsonResponse(200, { board: mapBoardRow(data) })
    }

    if (action === 'delete-site-board') {
      const siteId = requireSiteId(body.siteId)
      const boardKey = requireBoardKey(body.boardKey)
      const { error } = await admin
        .from('tracker_site_boards')
        .delete()
        .eq('site_id', siteId)
        .eq('board_key', boardKey)

      if (error) throw error
      return jsonResponse(200, { ok: true })
    }

    if (action === 'list-document-references') {
      const siteId = requireSiteId(body.siteId)
      const { data, error } = await admin
        .from('document_references')
        .select('id, site_id, title, link, created_at, updated_at')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return jsonResponse(200, { documentReferences: (data || []).map(mapDocumentReferenceRow) })
    }

    if (action === 'add-document-reference') {
      const reference = normalizeDocumentReferenceInput(body.reference || {})
      const { data, error } = await admin
        .from('document_references')
        .insert({
          site_id: reference.siteId,
          title: reference.title,
          link: reference.link,
          created_by: user.id,
          updated_by: user.id,
        })
        .select('id, site_id, title, link, created_at, updated_at')
        .single()

      if (error) throw error
      return jsonResponse(200, { documentReference: mapDocumentReferenceRow(data) })
    }

    if (action === 'delete-document-reference') {
      const id = requireRecordId(body.id, 'Document reference ID')
      const { error } = await admin.from('document_references').delete().eq('id', id)
      if (error) throw error
      return jsonResponse(200, { ok: true })
    }

    if (action === 'get-email-settings') {
      const siteId = requireSiteId(body.siteId)
      const { data, error } = await admin
        .from('email_settings')
        .select('site_id, to_list, cc_list, subject_prefix, created_at, updated_at')
        .eq('site_id', siteId)
        .maybeSingle()

      if (error) throw error
      return jsonResponse(200, {
        emailSettings: mapEmailSettingsRow(data || { site_id: siteId }),
      })
    }

    if (action === 'save-email-settings') {
      const settings = normalizeEmailSettingsInput(body.settings || {})
      const { data, error } = await admin
        .from('email_settings')
        .upsert({
          site_id: settings.siteId,
          to_list: settings.to,
          cc_list: settings.cc,
          subject_prefix: settings.defaultSubject,
          updated_by: user.id,
        })
        .select('site_id, to_list, cc_list, subject_prefix, created_at, updated_at')
        .single()

      if (error) throw error
      return jsonResponse(200, { emailSettings: mapEmailSettingsRow(data) })
    }

    if (action === 'get-pending-summary') {
      const siteId = requireSiteId(body.siteId)
      const { data, error } = await admin
        .from('pending_summaries')
        .select('site_id, source_text, sections, created_at, updated_at')
        .eq('site_id', siteId)
        .maybeSingle()

      if (error) throw error
      return jsonResponse(200, { pendingSummary: data ? mapPendingSummaryRow(data) : null })
    }

    if (action === 'save-pending-summary') {
      const pendingSummary = normalizePendingSummaryInput(body.pendingSummary || {})
      const { data, error } = await admin
        .from('pending_summaries')
        .upsert({
          site_id: pendingSummary.siteId,
          source_text: pendingSummary.sourceText,
          sections: pendingSummary.sections,
          updated_by: user.id,
        })
        .select('site_id, source_text, sections, created_at, updated_at')
        .single()

      if (error) throw error
      return jsonResponse(200, { pendingSummary: mapPendingSummaryRow(data) })
    }

    if (action === 'delete-pending-summary') {
      const siteId = requireSiteId(body.siteId)
      const { error } = await admin.from('pending_summaries').delete().eq('site_id', siteId)
      if (error) throw error
      return jsonResponse(200, { ok: true })
    }

    if (action === 'get-snag-summary') {
      const siteId = requireSiteId(body.siteId)
      const { data, error } = await admin
        .from('snag_summaries')
        .select('site_id, source_text, sections, created_at, updated_at')
        .eq('site_id', siteId)
        .maybeSingle()

      if (error) throw error
      return jsonResponse(200, { snagSummary: data ? mapSnagSummaryRow(data) : null })
    }

    if (action === 'save-snag-summary') {
      const snagSummary = normalizeSnagSummaryInput(body.snagSummary || {})
      const { data, error } = await admin
        .from('snag_summaries')
        .upsert({
          site_id: snagSummary.siteId,
          source_text: snagSummary.sourceText,
          sections: snagSummary.sections,
          updated_by: user.id,
        })
        .select('site_id, source_text, sections, created_at, updated_at')
        .single()

      if (error) throw error
      return jsonResponse(200, { snagSummary: mapSnagSummaryRow(data) })
    }

    if (action === 'delete-snag-summary') {
      const siteId = requireSiteId(body.siteId)
      const { error } = await admin.from('snag_summaries').delete().eq('site_id', siteId)
      if (error) throw error
      return jsonResponse(200, { ok: true })
    }

    if (action === 'list-snag-reports') {
      const siteId = requireSiteId(body.siteId)
      const { data, error } = await admin
        .from('snag_reports')
        .select('id, site_id, category, report_date, report_time, notes, notes_rich, created_at, updated_at')
        .eq('site_id', siteId)
        .order('report_date', { ascending: false })
        .order('report_time', { ascending: false })

      if (error) throw error
      return jsonResponse(200, { snagReports: (data || []).map(mapSnagReportRow) })
    }

    if (action === 'create-snag-report') {
      const snagReport = normalizeSnagReportInput(body.snagReport || {})
      const { data, error } = await admin
        .from('snag_reports')
        .insert({
          site_id: snagReport.siteId,
          category: snagReport.category,
          report_date: snagReport.date,
          report_time: snagReport.time,
          notes: snagReport.notes,
          notes_rich: snagReport.notesRich,
          created_by: user.id,
          updated_by: user.id,
        })
        .select('id, site_id, category, report_date, report_time, notes, notes_rich, created_at, updated_at')
        .single()

      if (error) throw error
      return jsonResponse(200, { snagReport: mapSnagReportRow(data) })
    }

    if (action === 'update-snag-report') {
      const id = requireRecordId(body.id)
      const updates = body.updates || {}
      const category = `${updates.category || 'GDC'}`.trim()
      const { data, error } = await admin
        .from('snag_reports')
        .update({
          category: ['GDC', 'PTA', 'Nokia'].includes(category) ? category : 'GDC',
          ...(typeof updates.notes === 'string' ? { notes: updates.notes } : {}),
          ...(typeof updates.notesRich === 'string' ? { notes_rich: updates.notesRich } : {}),
          updated_by: user.id,
        })
        .eq('id', id)
        .select('id, site_id, category, report_date, report_time, notes, notes_rich, created_at, updated_at')
        .single()

      if (error) throw error
      return jsonResponse(200, { snagReport: mapSnagReportRow(data) })
    }

    if (action === 'delete-snag-report') {
      const id = requireRecordId(body.id)
      const { error } = await admin.from('snag_reports').delete().eq('id', id)
      if (error) throw error
      return jsonResponse(200, { ok: true })
    }

    if (action === 'import-site-core') {
      const siteId = requireSiteId(body.siteId)
      const reportsToInsert = mapImportedReports(siteId, body.reports, user.id)
      const issuesToInsert = mapImportedIssues(siteId, body.issues, user.id)
      const confirmsToInsert = mapImportedConfirms(siteId, body.confirms, user.id)
      const documentReferencesToInsert = mapImportedDocumentReferences(siteId, body.documentReferences, user.id)
      const emailSettings = body.emailSettings
        ? normalizeEmailSettingsInput({ ...(body.emailSettings || {}), siteId })
        : null
      const pendingSummary = body.pendingSummary
        ? normalizePendingSummaryInput({ ...(body.pendingSummary || {}), siteId })
        : null
      const boards = normalizeBoardsPayload(body.boards)

      const { error: deleteReportsError } = await admin.from('reports').delete().eq('site_id', siteId)
      if (deleteReportsError) throw deleteReportsError

      const { error: deleteIssuesError } = await admin.from('issues').delete().eq('site_id', siteId)
      if (deleteIssuesError) throw deleteIssuesError

      const { error: deleteConfirmsError } = await admin.from('confirms').delete().eq('site_id', siteId)
      if (deleteConfirmsError) throw deleteConfirmsError

      const { error: deleteDocumentReferencesError } = await admin
        .from('document_references')
        .delete()
        .eq('site_id', siteId)
      if (deleteDocumentReferencesError) throw deleteDocumentReferencesError

      if (reportsToInsert.length) {
        const { error } = await admin.from('reports').insert(reportsToInsert)
        if (error) throw error
      }

      if (issuesToInsert.length) {
        const { error } = await admin.from('issues').insert(issuesToInsert)
        if (error) throw error
      }

      if (confirmsToInsert.length) {
        const { error } = await admin.from('confirms').insert(confirmsToInsert)
        if (error) throw error
      }

      if (documentReferencesToInsert.length) {
        const { error } = await admin.from('document_references').insert(documentReferencesToInsert)
        if (error) throw error
      }

      if (emailSettings) {
        const { error } = await admin.from('email_settings').upsert({
          site_id: siteId,
          to_list: emailSettings.to,
          cc_list: emailSettings.cc,
          subject_prefix: emailSettings.defaultSubject,
          updated_by: user.id,
        })
        if (error) throw error
      } else {
        const { error } = await admin.from('email_settings').delete().eq('site_id', siteId)
        if (error) throw error
      }

      if (pendingSummary) {
        const { error } = await admin.from('pending_summaries').upsert({
          site_id: siteId,
          source_text: pendingSummary.sourceText,
          sections: pendingSummary.sections,
          updated_by: user.id,
        })
        if (error) throw error
      } else {
        const { error } = await admin.from('pending_summaries').delete().eq('site_id', siteId)
        if (error) throw error
      }

      const { error: deleteBoardsError } = await admin.from('tracker_site_boards').delete().eq('site_id', siteId)
      if (deleteBoardsError) throw deleteBoardsError

      if (boards.length) {
        const { error } = await admin.from('tracker_site_boards').insert(
          boards.map((board) => ({
            site_id: siteId,
            board_key: board.boardKey,
            payload: board.payload,
            created_by: user.id,
            updated_by: user.id,
          })),
        )
        if (error) throw error
      }

      return jsonResponse(200, {
        imported: {
          reports: reportsToInsert.length,
          issues: issuesToInsert.length,
          confirms: confirmsToInsert.length,
          documentReferences: documentReferencesToInsert.length,
          emailSettings: emailSettings ? 1 : 0,
          pendingSummary: pendingSummary ? 1 : 0,
          boards: boards.length,
        },
      })
    }

    return jsonResponse(400, {
      error: 'Unknown tracker core action.',
      code: 'UNKNOWN_TRACKER_CORE_ACTION',
    })
  } catch (error) {
    return formatApiError(error)
  }
})
