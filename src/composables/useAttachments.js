import { db } from '../db/index.js'
import { hasUsableAttachmentBlob, normalizeAttachmentRecord } from '../lib/attachmentBlobs.js'
import { getCloudAttachment, isCloudTrackerEnabled, uploadCloudAttachment } from '../lib/trackerCloud.js'

export function useAttachments() {
  async function addAttachment(file) {
    const blob = file.blob || file
    const id = isCloudTrackerEnabled() && typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : undefined
    const attachment = await normalizeAttachmentRecord({
      ...(id ? { id } : {}),
      blob,
      name: file.name,
      size: file.size,
      type: file.type,
      createdAt: new Date().toISOString(),
    })

    if (isCloudTrackerEnabled()) {
      await uploadAttachmentToCloud(attachment)
      await db.attachments.put({
        ...attachment,
        cloudSyncedAt: new Date().toISOString(),
      })
      return attachment.id
    }

    return await db.attachments.add(attachment)
  }

  async function getAttachmentById(id) {
    const attachment = await getAttachmentByFlexibleId(id)
    const repaired = await repairAttachmentBlob(attachment)
    if (hasUsableAttachmentBlob(repaired)) return repaired

    const cloudAttachment = await getAttachmentFromCloud(id)
    if (!cloudAttachment) return repaired

    await db.attachments.put({
      ...cloudAttachment,
      cloudSyncedAt: cloudAttachment.cloudSyncedAt || new Date().toISOString(),
    })
    return cloudAttachment
  }

  async function deleteAttachment(id) {
    await db.attachments.delete(id)
  }

  async function getAttachmentsByIds(ids) {
    const attachments = await Promise.all(
      (ids || []).map((id) => getAttachmentById(id)),
    )
    return attachments
  }

  return {
    addAttachment,
    getAttachmentById,
    deleteAttachment,
    getAttachmentsByIds,
  }
}

export async function uploadAttachmentToCloud(attachment) {
  if (!isCloudTrackerEnabled() || !attachment) return null

  const normalized = await normalizeAttachmentRecord(attachment)
  if (!hasUsableAttachmentBlob(normalized)) return null

  const blob = await blobToBase64(normalized.blob)
  const { attachment: savedAttachment } = await uploadCloudAttachment({
    id: normalized.id,
    name: normalized.name,
    type: normalized.type || normalized.blob.type || '',
    size: normalized.size || normalized.blob.size || 0,
    blob,
  })

  return savedAttachment || null
}

export async function syncLocalAttachmentsToCloud({ force = false } = {}) {
  if (!isCloudTrackerEnabled()) return { uploaded: 0, skipped: 0, failed: 0, errors: [] }

  const attachments = await db.attachments.toArray()
  let uploaded = 0
  let skipped = 0
  let failed = 0
  const errors = []

  for (const attachment of attachments) {
    if (!force && attachment.cloudSyncedAt) {
      skipped += 1
      continue
    }

    if (!hasUsableAttachmentBlob(attachment)) {
      skipped += 1
      continue
    }

    try {
      const saved = await uploadAttachmentToCloud(attachment)
      if (saved) {
        uploaded += 1
        await db.attachments.put({
          ...attachment,
          cloudSyncedAt: new Date().toISOString(),
        })
      } else {
        skipped += 1
      }
    } catch (error) {
      failed += 1
      if (errors.length < 5) {
        errors.push({
          id: attachment?.id ?? '',
          name: attachment?.name || `att-${attachment?.id ?? ''}`,
          message: formatAttachmentSyncError(error),
          code: error?.code || '',
          status: error?.status || '',
        })
      }
      console.warn('Unable to sync local attachment to cloud.', error)
    }
  }

  return { uploaded, skipped, failed, errors }
}

async function getAttachmentByFlexibleId(id) {
  const attachment = await db.attachments.get(id)
  if (attachment) return attachment

  const numericId = Number(id)
  if (Number.isInteger(numericId) && `${numericId}` === `${id}`) {
    return await db.attachments.get(numericId)
  }

  return null
}

async function getAttachmentFromCloud(id) {
  if (!isCloudTrackerEnabled() || id === null || id === undefined || id === '') return null

  try {
    const { attachment } = await getCloudAttachment(id)
    const normalized = await normalizeAttachmentRecord(attachment)
    return hasUsableAttachmentBlob(normalized)
      ? {
          ...normalized,
          cloudSyncedAt: normalized.cloudSyncedAt || new Date().toISOString(),
        }
      : null
  } catch (error) {
    if (error?.code === 'TRACKER_SESSION_REQUIRED' || error?.status === 404) return null
    console.warn('Unable to load attachment from cloud.', error)
    return null
  }
}

async function repairAttachmentBlob(attachment) {
  if (!attachment) return attachment

  const normalized = await normalizeAttachmentRecord(attachment)
  if (hasUsableAttachmentBlob(attachment) || !hasUsableAttachmentBlob(normalized)) {
    return normalized
  }

  await db.attachments.put(normalized)
  return normalized
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function formatAttachmentSyncError(error) {
  const code = error?.code ? ` (${error.code})` : ''
  const status = error?.status ? ` HTTP ${error.status}` : ''
  return `${error?.message || 'Unknown sync error'}${status}${code}`
}
