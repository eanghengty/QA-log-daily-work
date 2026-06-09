import { ApiError } from './auth.ts'

const SITE_ID_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/

export function normalizeText(value: unknown) {
  return `${value || ''}`.trim()
}

export function requireLookupName(value: unknown, label: string) {
  const name = normalizeText(value)
  if (!name) {
    throw new ApiError(400, 'NAME_REQUIRED', `${label} is required.`)
  }
  return name
}

export function requireSiteId(value: unknown) {
  const siteId = normalizeText(value)
  if (!siteId) {
    throw new ApiError(400, 'SITE_ID_REQUIRED', 'Site ID is required.')
  }
  if (!SITE_ID_PATTERN.test(siteId)) {
    throw new ApiError(
      400,
      'INVALID_SITE_ID',
      'Use only letters, numbers, and hyphens for Site ID, for example tower-01.',
    )
  }
  return siteId
}

export function requireRecordId(value: unknown, label: string) {
  const id = normalizeText(value)
  if (!id) {
    throw new ApiError(400, 'RECORD_ID_REQUIRED', `${label} is required.`)
  }
  return id
}

export function requireDateText(value: unknown, label: string) {
  const dateText = normalizeText(value)
  if (!dateText) {
    throw new ApiError(400, 'DATE_REQUIRED', `${label} is required.`)
  }
  return dateText
}

export function normalizeReferenceArray(value: unknown) {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const normalized: Array<string | number> = []

  for (const item of value) {
    if (typeof item === 'number' && Number.isFinite(item)) {
      const key = `n:${item}`
      if (!seen.has(key)) {
        seen.add(key)
        normalized.push(item)
      }
      continue
    }

    const text = normalizeText(item)
    if (!text) continue
    const key = `s:${text}`
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(text)
  }

  return normalized
}

export function normalizeSiteInput(value: Record<string, unknown>) {
  const siteId = requireSiteId(value.id)
  const name = normalizeText(value.name)
  const hopReviewer = normalizeText(value.hopReviewer)

  if (!name) {
    throw new ApiError(400, 'SITE_NAME_REQUIRED', 'Site name is required.')
  }

  if (!hopReviewer) {
    throw new ApiError(400, 'HOP_REVIEWER_REQUIRED', 'HOP reviewer is required.')
  }

  return {
    id: siteId,
    name,
    hopReviewer,
    scope: normalizeText(value.scope),
    comment: normalizeText(value.comment),
    url: normalizeText(value.url),
  }
}

export function mapSiteRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    hopReviewer: row.hop_reviewer || '',
    scope: row.scope || '',
    comment: row.comment || '',
    url: row.url || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

export function mapLookupRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

export function normalizeReportInput(value: Record<string, unknown>) {
  return {
    siteId: requireSiteId(value.siteId),
    date: requireDateText(value.date, 'Report date'),
    time: normalizeText(value.time),
    notes: `${value.notes || ''}`,
    notesRich: `${value.notesRich || ''}`,
    linkedIssueIds: normalizeReferenceArray(value.linkedIssueIds),
    linkedConfirmIds: normalizeReferenceArray(value.linkedConfirmIds),
    attachmentIds: normalizeReferenceArray(value.attachmentIds),
  }
}

export function mapReportRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    siteId: row.site_id,
    date: row.report_date || '',
    time: row.report_time || '',
    notes: row.notes || '',
    notesRich: row.notes_rich || '',
    linkedIssueIds: normalizeReferenceArray(row.linked_issue_ids),
    linkedConfirmIds: normalizeReferenceArray(row.linked_confirm_ids),
    attachmentIds: normalizeReferenceArray(row.attachment_ids),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

export function normalizeIssueInput(value: Record<string, unknown>) {
  const priority = normalizeText(value.priority) || 'high'
  if (!['high', 'med', 'low'].includes(priority)) {
    throw new ApiError(400, 'INVALID_ISSUE_PRIORITY', 'Issue priority must be high, med, or low.')
  }

  const status = normalizeText(value.status) || 'open'
  if (!['open', 'in review', 'fixed'].includes(status)) {
    throw new ApiError(400, 'INVALID_ISSUE_STATUS', 'Issue status must be open, in review, or fixed.')
  }

  return {
    siteId: requireSiteId(value.siteId),
    title: `${value.title || ''}`.trim(),
    priority,
    area: `${value.area || ''}`.trim(),
    environment: `${value.environment || ''}`.trim(),
    steps: `${value.steps || ''}`,
    status,
    reportRef: normalizeText(value.reportId || value.reportRef),
    attachmentIds: normalizeReferenceArray(value.attachmentIds),
    date: normalizeText(value.date),
  }
}

export function mapIssueRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    siteId: row.site_id,
    code: row.code || '',
    title: row.title || '',
    priority: row.priority || 'high',
    area: row.area || '',
    environment: row.environment || '',
    steps: row.steps || '',
    status: row.status || 'open',
    reportId: row.report_ref || null,
    attachmentIds: normalizeReferenceArray(row.attachment_ids),
    date: row.event_date || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

export function normalizeConfirmInput(value: Record<string, unknown>) {
  return {
    siteId: requireSiteId(value.siteId),
    title: `${value.title || ''}`.trim(),
    source: `${value.source || ''}`.trim(),
    confirmedBy: `${value.confirmedBy || ''}`.trim(),
    notes: `${value.notes || ''}`,
    reportRef: normalizeText(value.reportId || value.reportRef),
    resolvesIssueRef: normalizeText(value.resolvesIssueId || value.resolvesIssueRef),
    attachmentIds: normalizeReferenceArray(value.attachmentIds),
    date: normalizeText(value.date),
  }
}

export function mapConfirmRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    siteId: row.site_id,
    code: row.code || '',
    title: row.title || '',
    source: row.source || '',
    confirmedBy: row.confirmed_by || '',
    notes: row.notes || '',
    reportId: row.report_ref || null,
    resolvesIssueId: row.resolves_issue_ref || null,
    attachmentIds: normalizeReferenceArray(row.attachment_ids),
    date: row.event_date || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

export function normalizeDocumentReferenceInput(value: Record<string, unknown>) {
  const siteId = requireSiteId(value.siteId)
  const title = normalizeText(value.title)
  const link = normalizeText(value.link)

  if (!title) {
    throw new ApiError(400, 'DOCUMENT_REFERENCE_TITLE_REQUIRED', 'Document reference title is required.')
  }

  if (!link) {
    throw new ApiError(400, 'DOCUMENT_REFERENCE_LINK_REQUIRED', 'Document reference link is required.')
  }

  return {
    siteId,
    title,
    link,
  }
}

export function mapDocumentReferenceRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    siteId: row.site_id,
    title: row.title || '',
    link: row.link || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

export function normalizeEmailSettingsInput(value: Record<string, unknown>) {
  return {
    siteId: requireSiteId(value.siteId),
    to: `${value.to || ''}`.trim(),
    cc: `${value.cc || ''}`.trim(),
    defaultSubject: `${value.defaultSubject || ''}`.trim(),
  }
}

export function mapEmailSettingsRow(row: Record<string, unknown>) {
  return {
    siteId: row.site_id,
    to: row.to_list || '',
    cc: row.cc_list || '',
    defaultSubject: row.subject_prefix || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

export function normalizePendingSummaryInput(value: Record<string, unknown>) {
  return {
    siteId: requireSiteId(value.siteId),
    sourceText: `${value.sourceText || ''}`,
    sections: Array.isArray(value.sections) ? value.sections : [],
  }
}

export function mapPendingSummaryRow(row: Record<string, unknown>) {
  return {
    siteId: row.site_id,
    sourceText: row.source_text || '',
    sections: Array.isArray(row.sections) ? row.sections : [],
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

export function normalizeSnagSummaryInput(value: Record<string, unknown>) {
  return normalizePendingSummaryInput(value)
}

export function mapSnagSummaryRow(row: Record<string, unknown>) {
  return mapPendingSummaryRow(row)
}

export function normalizeSnagReportInput(value: Record<string, unknown>) {
  const category = `${value.category || 'GDC'}`.trim()
  return {
    siteId: requireSiteId(value.siteId),
    category: ['GDC', 'PTA', 'Nokia'].includes(category) ? category : 'GDC',
    date: `${value.date || ''}`.trim(),
    time: `${value.time || ''}`.trim(),
    notes: `${value.notes || ''}`,
    notesRich: `${value.notesRich || ''}`,
  }
}

export function mapSnagReportRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    siteId: row.site_id,
    category: row.category || 'GDC',
    date: row.report_date || '',
    time: row.report_time || '',
    notes: row.notes || '',
    notesRich: row.notes_rich || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}
