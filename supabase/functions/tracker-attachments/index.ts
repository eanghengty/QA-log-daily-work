import {
  ApiError,
  formatApiError,
  handleOptions,
  jsonResponse,
  loadSessionContext,
  parseJson,
} from '../_shared/auth.ts'
import { normalizeText, requireRecordId } from '../_shared/tracker.ts'

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const DATA_URL_PATTERN = /^data:([^;,]+)?;base64,(.*)$/s

function normalizeAttachmentId(value: unknown) {
  const id = normalizeText(value)
  if (!id) return crypto.randomUUID()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) {
    throw new ApiError(400, 'INVALID_ATTACHMENT_ID', 'Attachment ID is invalid.')
  }
  return id
}

function normalizeBase64(value: unknown) {
  const raw = `${value || ''}`.trim()
  const match = raw.match(DATA_URL_PATTERN)
  const base64 = (match ? match[2] : raw).replace(/\s+/g, '')
  if (!base64) {
    throw new ApiError(400, 'ATTACHMENT_DATA_REQUIRED', 'Attachment file data is required.')
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new ApiError(400, 'INVALID_ATTACHMENT_DATA', 'Attachment file data is invalid.')
  }
  return {
    base64,
    contentType: normalizeText(match?.[1]),
  }
}

function normalizeAttachmentInput(value: Record<string, unknown>) {
  const id = normalizeAttachmentId(value.id)
  const name = normalizeText(value.name || value.fileName) || `attachment-${id}`
  const { base64, contentType } = normalizeBase64(value.blob || value.base64 || value.dataUrl || value.dataURL)
  const size = Number(value.size ?? Math.floor((base64.length * 3) / 4))

  if (!Number.isFinite(size) || size < 0) {
    throw new ApiError(400, 'INVALID_ATTACHMENT_SIZE', 'Attachment size is invalid.')
  }
  if (size > MAX_ATTACHMENT_BYTES) {
    throw new ApiError(413, 'ATTACHMENT_TOO_LARGE', 'Attachment files must be 20 MB or smaller.')
  }

  return {
    id,
    name,
    type: normalizeText(value.type) || contentType || 'application/octet-stream',
    size: Math.round(size),
    base64,
  }
}

function mapAttachmentRow(row: Record<string, unknown>, includeData = false) {
  return {
    id: row.id,
    name: row.file_name || '',
    type: row.content_type || '',
    size: Number(row.size_bytes || 0),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    ...(includeData
      ? {
          blob: row.data_base64 || '',
          _blobType: row.content_type || '',
        }
      : {}),
  }
}

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse

  try {
    const body = await parseJson(req)
    const action = `${body.action || ''}`.trim()
    const { admin, user } = await loadSessionContext(req)

    if (action === 'upload') {
      const attachment = normalizeAttachmentInput(body.attachment || {})
      const { error } = await admin
        .from('tracker_attachments')
        .upsert({
          id: attachment.id,
          file_name: attachment.name,
          content_type: attachment.type,
          size_bytes: attachment.size,
          data_base64: attachment.base64,
          created_by: user.id,
          updated_by: user.id,
        })

      if (error) {
        throw new ApiError(500, error.code || 'ATTACHMENT_UPLOAD_FAILED', error.message || 'Attachment upload failed.')
      }
      return jsonResponse(200, {
        attachment: {
          id: attachment.id,
          name: attachment.name,
          type: attachment.type,
          size: attachment.size,
        },
      })
    }

    if (action === 'get') {
      const id = requireRecordId(body.id, 'Attachment ID')
      const { data, error } = await admin
        .from('tracker_attachments')
        .select('id, file_name, content_type, size_bytes, data_base64, created_at, updated_at')
        .eq('id', id)
        .maybeSingle()

      if (error) {
        throw new ApiError(500, error.code || 'ATTACHMENT_LOOKUP_FAILED', error.message || 'Attachment lookup failed.')
      }
      return jsonResponse(200, { attachment: data ? mapAttachmentRow(data, true) : null })
    }

    return jsonResponse(400, {
      error: 'Unknown tracker attachment action.',
      code: 'UNKNOWN_TRACKER_ATTACHMENT_ACTION',
    })
  } catch (error) {
    return formatApiError(error)
  }
})
