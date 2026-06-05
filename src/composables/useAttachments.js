import { db } from '../db/index.js'
import { hasUsableAttachmentBlob, normalizeAttachmentRecord } from '../lib/attachmentBlobs.js'

export function useAttachments() {
  async function addAttachment(file) {
    const blob = file.blob || file
    const attachment = await normalizeAttachmentRecord({
      blob,
      name: file.name,
      size: file.size,
      type: file.type,
      createdAt: new Date().toISOString(),
    })
    return await db.attachments.add(attachment)
  }

  async function getAttachmentById(id) {
    const attachment = await getAttachmentByFlexibleId(id)
    return await repairAttachmentBlob(attachment)
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

async function getAttachmentByFlexibleId(id) {
  const attachment = await db.attachments.get(id)
  if (attachment) return attachment

  const numericId = Number(id)
  if (Number.isInteger(numericId) && `${numericId}` === `${id}`) {
    return await db.attachments.get(numericId)
  }

  return null
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
