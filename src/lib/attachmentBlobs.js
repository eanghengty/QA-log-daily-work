export async function normalizeAttachmentRecord(attachment) {
  if (!attachment || typeof attachment !== 'object') return attachment

  const blob = await normalizeAttachmentBlob(attachment.blob, attachment)
  if (!blob) return attachment

  const type = attachment.type || blob.type || attachment._blobType || ''
  const size = Number.isFinite(attachment.size) ? attachment.size : blob.size

  return {
    ...attachment,
    blob,
    type,
    size,
  }
}

export async function normalizeAttachmentRecords(attachments = []) {
  return Promise.all(attachments.map((attachment) => normalizeAttachmentRecord(attachment)))
}

export function hasUsableAttachmentBlob(attachment) {
  return attachment?.blob instanceof Blob
}

async function normalizeAttachmentBlob(value, attachment = {}) {
  if (value instanceof Blob) return value

  const type = attachment._blobType || attachment.type || ''

  if (typeof value === 'string') {
    if (value.startsWith('data:')) {
      return dataUrlToBlob(value, type)
    }

    const base64Blob = base64ToBlob(value, type)
    if (base64Blob) return base64Blob
  }

  if (value instanceof ArrayBuffer) {
    return new Blob([value], { type })
  }

  if (ArrayBuffer.isView(value)) {
    return new Blob([value], { type })
  }

  if (Array.isArray(value)) {
    return new Blob([Uint8Array.from(value)], { type })
  }

  if (value && typeof value === 'object') {
    if (typeof value.dataUrl === 'string') {
      return dataUrlToBlob(value.dataUrl, type)
    }

    if (typeof value.base64 === 'string') {
      const base64Blob = base64ToBlob(value.base64, type)
      if (base64Blob) return base64Blob
    }

    if (value.type === 'Buffer' && Array.isArray(value.data)) {
      return new Blob([Uint8Array.from(value.data)], { type })
    }

    if (Array.isArray(value.data) && value.data.every((item) => Number.isInteger(item))) {
      return new Blob([Uint8Array.from(value.data)], { type })
    }

    const numericKeys = Object.keys(value).filter((key) => /^\d+$/.test(key))
    if (numericKeys.length && numericKeys.length === Object.keys(value).length) {
      const bytes = numericKeys
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => value[key])
      return new Blob([Uint8Array.from(bytes)], { type })
    }
  }

  return null
}

function dataUrlToBlob(dataUrl, fallbackType = '') {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match) return null

  const mimeType = match[1] || fallbackType
  const isBase64 = Boolean(match[2])
  const data = match[3] || ''
  const bytes = isBase64
    ? base64ToBytes(data)
    : textToBytes(decodeURIComponent(data))

  return new Blob([bytes], { type: mimeType })
}

function base64ToBlob(base64, type = '') {
  const bytes = base64ToBytes(base64)
  if (!bytes) return null
  return new Blob([bytes], { type })
}

function base64ToBytes(base64) {
  try {
    const clean = base64.replace(/\s/g, '')
    const binary = atob(clean)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    return null
  }
}

function textToBytes(value) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value)
  }

  return Uint8Array.from([...value].map((char) => char.charCodeAt(0)))
}
