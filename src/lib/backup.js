import { db } from '../db/index.js'

export async function exportBackup() {
  const [sites, reports, issues, confirms, emailSettings, attachments, checklists, cableMatrices, antennaChecklists, dcplChecklists, cableChecklists] = await Promise.all([
    db.sites.toArray(),
    db.reports.toArray(),
    db.issues.toArray(),
    db.confirms.toArray(),
    db.emailSettings.toArray(),
    db.attachments.toArray(),
    db.checklists.toArray(),
    db.cableMatrices.toArray(),
    db.antennaChecklists.toArray(),
    db.dcplChecklists.toArray(),
    db.cableChecklists.toArray(),
  ])

  const attachmentsWithBase64 = await Promise.all(
    attachments.map(async (att) => {
      if (att.blob instanceof Blob) {
        const base64 = await blobToBase64(att.blob)
        return { ...att, blob: base64, _blobType: att.blob.type }
      }
      return att
    }),
  )

  const backup = {
    _version: 1,
    _exportedAt: new Date().toISOString(),
    sites,
    reports,
    issues,
    confirms,
    emailSettings,
    attachments: attachmentsWithBase64,
    checklists,
    cableMatrices,
    antennaChecklists,
    dcplChecklists,
    cableChecklists,
  }

  const json = JSON.stringify(backup, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `qa-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportSite(siteId) {
  const [site, reports, issues, confirms, emailSettings, checklists, cableMatrices, antennaChecklists, dcplChecklists, cableChecklists] = await Promise.all([
    db.sites.get(siteId),
    db.reports.where('siteId').equals(siteId).toArray(),
    db.issues.where('siteId').equals(siteId).toArray(),
    db.confirms.where('siteId').equals(siteId).toArray(),
    db.emailSettings.get(siteId),
    db.checklists.where('siteId').equals(siteId).sortBy('order'),
    db.cableMatrices.where('siteId').equals(siteId).sortBy('order'),
    db.antennaChecklists.where('siteId').equals(siteId).sortBy('order'),
    db.dcplChecklists.where('siteId').equals(siteId).sortBy('order'),
    db.cableChecklists.where('siteId').equals(siteId).sortBy('order'),
  ])

  const allAttachmentIds = [
    ...reports.flatMap((r) => r.attachmentIds || []),
    ...issues.flatMap((i) => i.attachmentIds || []),
    ...confirms.flatMap((c) => c.attachmentIds || []),
  ]
  const uniqueIds = [...new Set(allAttachmentIds)]
  const attachments = (await db.attachments.bulkGet(uniqueIds)).filter(Boolean)

  const attachmentsWithBase64 = await Promise.all(
    attachments.map(async (att) => {
      if (att.blob instanceof Blob) {
        const base64 = await blobToBase64(att.blob)
        return { ...att, blob: base64, _blobType: att.blob.type }
      }
      return att
    }),
  )

  const payload = {
    _version: 1,
    _type: 'site',
    _exportedAt: new Date().toISOString(),
    site,
    reports,
    issues,
    confirms,
    checklists,
    cableMatrices,
    antennaChecklists,
    dcplChecklists,
    cableChecklists,
    emailSettings: emailSettings || null,
    attachments: attachmentsWithBase64,
  }

  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `site-${siteId}-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importSite(jsonOrObject) {
  let data
  if (typeof jsonOrObject === 'string') {
    try { data = JSON.parse(jsonOrObject) } catch { throw new Error('Invalid file — could not parse JSON.') }
  } else {
    data = jsonOrObject
  }

  if (data._type !== 'site' || !data.site) {
    throw new Error('Not a site export file.')
  }

  const attachmentsRestored = await Promise.all(
    (data.attachments || []).map(async (att) => {
      if (typeof att.blob === 'string' && att.blob.startsWith('data:')) {
        const blob = await base64ToBlob(att.blob, att._blobType || 'application/octet-stream')
        const { _blobType, ...rest } = att
        return { ...rest, blob }
      }
      return att
    }),
  )

  const siteId = data.site.id
  const existingIds = {
    reports: (await db.reports.where('siteId').equals(siteId).primaryKeys()),
    issues: (await db.issues.where('siteId').equals(siteId).primaryKeys()),
    confirms: (await db.confirms.where('siteId').equals(siteId).primaryKeys()),
    checklists: (await db.checklists.where('siteId').equals(siteId).primaryKeys()),
    cableMatrices: (await db.cableMatrices.where('siteId').equals(siteId).primaryKeys()),
    antennaChecklists: (await db.antennaChecklists.where('siteId').equals(siteId).primaryKeys()),
    dcplChecklists: (await db.dcplChecklists.where('siteId').equals(siteId).primaryKeys()),
    cableChecklists: (await db.cableChecklists.where('siteId').equals(siteId).primaryKeys()),
  }

  await db.transaction(
    'rw',
    db.sites, db.reports, db.issues, db.confirms, db.emailSettings, db.attachments, db.checklists, db.cableMatrices, db.antennaChecklists, db.dcplChecklists, db.cableChecklists,
    async () => {
      await db.sites.put(data.site)
      await Promise.all([
        db.reports.bulkDelete(existingIds.reports),
        db.issues.bulkDelete(existingIds.issues),
        db.confirms.bulkDelete(existingIds.confirms),
        db.checklists.bulkDelete(existingIds.checklists),
        db.cableMatrices.bulkDelete(existingIds.cableMatrices),
        db.antennaChecklists.bulkDelete(existingIds.antennaChecklists),
        db.dcplChecklists.bulkDelete(existingIds.dcplChecklists),
        db.cableChecklists.bulkDelete(existingIds.cableChecklists),
      ])
      await Promise.all([
        db.reports.bulkPut(data.reports || []),
        db.issues.bulkPut(data.issues || []),
        db.confirms.bulkPut(data.confirms || []),
        db.attachments.bulkPut(attachmentsRestored),
        db.checklists.bulkPut(data.checklists || []),
        db.cableMatrices.bulkPut(data.cableMatrices || []),
        db.antennaChecklists.bulkPut(data.antennaChecklists || []),
        db.dcplChecklists.bulkPut(data.dcplChecklists || []),
        db.cableChecklists.bulkPut(data.cableChecklists || []),
      ])
      if (data.emailSettings) await db.emailSettings.put(data.emailSettings)
    },
  )

  return siteId
}

export async function importBackup(json) {
  let data
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('Invalid backup file — could not parse JSON.')
  }

  if (!data.sites || !data.reports) {
    throw new Error('Invalid backup file — missing required tables.')
  }

  const attachmentsRestored = await Promise.all(
    (data.attachments || []).map(async (att) => {
      if (typeof att.blob === 'string' && att.blob.startsWith('data:')) {
        const blob = await base64ToBlob(att.blob, att._blobType || 'application/octet-stream')
        const { _blobType, ...rest } = att
        return { ...rest, blob }
      }
      return att
    }),
  )

  await db.transaction(
    'rw',
    db.sites,
    db.reports,
    db.issues,
    db.confirms,
    db.emailSettings,
    db.attachments,
    db.checklists,
    db.cableMatrices,
    db.antennaChecklists,
    db.dcplChecklists,
    db.cableChecklists,
    async () => {
      await Promise.all([
        db.sites.clear(),
        db.reports.clear(),
        db.issues.clear(),
        db.confirms.clear(),
        db.emailSettings.clear(),
        db.attachments.clear(),
        db.checklists.clear(),
        db.cableMatrices.clear(),
        db.antennaChecklists.clear(),
        db.dcplChecklists.clear(),
        db.cableChecklists.clear(),
      ])
      await Promise.all([
        db.sites.bulkPut(data.sites),
        db.reports.bulkPut(data.reports),
        db.issues.bulkPut(data.issues || []),
        db.confirms.bulkPut(data.confirms || []),
        db.emailSettings.bulkPut(data.emailSettings || []),
        db.attachments.bulkPut(attachmentsRestored),
        db.checklists.bulkPut(data.checklists || []),
        db.cableMatrices.bulkPut(data.cableMatrices || []),
        db.antennaChecklists.bulkPut(data.antennaChecklists || []),
        db.dcplChecklists.bulkPut(data.dcplChecklists || []),
        db.cableChecklists.bulkPut(data.cableChecklists || []),
      ])
    },
  )
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function base64ToBlob(base64, type) {
  const res = await fetch(base64)
  return res.blob()
}
