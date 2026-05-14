import { db } from '../db/index.js'

export function useAttachments() {
  async function addAttachment(file) {
    const blob = file.blob || file
    return await db.attachments.add({
      blob,
      name: file.name,
      size: file.size,
      type: file.type,
      createdAt: new Date().toISOString(),
    })
  }

  async function getAttachmentById(id) {
    return await db.attachments.get(id)
  }

  async function deleteAttachment(id) {
    await db.attachments.delete(id)
  }

  async function getAttachmentsByIds(ids) {
    return await db.attachments.bulkGet(ids)
  }

  return {
    addAttachment,
    getAttachmentById,
    deleteAttachment,
    getAttachmentsByIds,
  }
}
