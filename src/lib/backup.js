import { db } from '../db/index.js'

const FULL_BACKUP_TABLES = [
  'sites',
  'reports',
  'issues',
  'confirms',
  'emailSettings',
  'attachments',
  'scopes',
  'activityLog',
  'confirmSources',
  'checklists',
  'cableMatrices',
  'antennaChecklists',
  'dcplChecklists',
  'cableChecklists',
]

const SITE_SCOPED_TABLES = [
  'reports',
  'issues',
  'confirms',
  'checklists',
  'cableMatrices',
  'antennaChecklists',
  'dcplChecklists',
  'cableChecklists',
]

export async function exportBackup() {
  const snapshot = await loadFullBackupSnapshot()
  const backup = {
    _version: 2,
    _exportedAt: new Date().toISOString(),
    ...snapshot,
    attachments: await serializeAttachments(snapshot.attachments || []),
  }

  downloadJson(
    backup,
    `qa-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`,
  )
}

export async function exportSite(siteId) {
  const [
    site,
    reports,
    issues,
    confirms,
    emailSettings,
    checklists,
    cableMatrices,
    antennaChecklists,
    dcplChecklists,
    cableChecklists,
  ] = await Promise.all([
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
    ...reports.flatMap((report) => report.attachmentIds || []),
    ...issues.flatMap((issue) => issue.attachmentIds || []),
    ...confirms.flatMap((confirm) => confirm.attachmentIds || []),
  ]
  const uniqueAttachmentIds = [...new Set(allAttachmentIds)]
  const attachments = (await db.attachments.bulkGet(uniqueAttachmentIds)).filter(Boolean)

  const payload = {
    _version: 2,
    _type: 'site',
    _exportedAt: new Date().toISOString(),
    summary: buildSiteSummary({
      reports,
      issues,
      confirms,
      checklists,
      cableMatrices,
      antennaChecklists,
      dcplChecklists,
      cableChecklists,
      emailSettings,
      attachments,
    }),
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
    attachments: await serializeAttachments(attachments),
  }

  downloadJson(payload, `site-${siteId}-${new Date().toISOString().slice(0, 10)}.json`)
}

export async function importSite(jsonOrObject) {
  const data = parseJsonInput(jsonOrObject, 'Invalid file — could not parse JSON.')

  if (data._type !== 'site' || !data.site) {
    throw new Error('Not a site export file.')
  }

  const attachmentsRestored = await restoreAttachments(data.attachments || [])
  const siteId = data.site.id
  const existingIds = Object.fromEntries(
    await Promise.all(
      SITE_SCOPED_TABLES.map(async (tableName) => [
        tableName,
        await db[tableName].where('siteId').equals(siteId).primaryKeys(),
      ]),
    ),
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
      await db.sites.put(data.site)

      await Promise.all(
        SITE_SCOPED_TABLES.map((tableName) =>
          db[tableName].bulkDelete(existingIds[tableName] || []),
        ),
      )

      await Promise.all(
        SITE_SCOPED_TABLES.map((tableName) => db[tableName].bulkPut(data[tableName] || [])),
      )

      await db.attachments.bulkPut(attachmentsRestored)

      if (data.emailSettings) {
        await db.emailSettings.put(data.emailSettings)
      } else {
        await db.emailSettings.delete(siteId)
      }
    },
  )

  return siteId
}

export async function importBackup(jsonOrObject) {
  const data = parseJsonInput(jsonOrObject, 'Invalid backup file — could not parse JSON.')

  if (!data.sites || !data.reports) {
    throw new Error('Invalid backup file — missing required tables.')
  }

  const attachmentsRestored = await restoreAttachments(data.attachments || [])

  await db.transaction(
    'rw',
    db.sites,
    db.reports,
    db.issues,
    db.confirms,
    db.emailSettings,
    db.attachments,
    db.scopes,
    db.activityLog,
    db.confirmSources,
    db.checklists,
    db.cableMatrices,
    db.antennaChecklists,
    db.dcplChecklists,
    db.cableChecklists,
    async () => {
      await Promise.all(FULL_BACKUP_TABLES.map((tableName) => db[tableName].clear()))

      await Promise.all([
        db.sites.bulkPut(data.sites || []),
        db.reports.bulkPut(data.reports || []),
        db.issues.bulkPut(data.issues || []),
        db.confirms.bulkPut(data.confirms || []),
        db.emailSettings.bulkPut(data.emailSettings || []),
        db.attachments.bulkPut(attachmentsRestored),
        db.scopes.bulkPut(data.scopes || []),
        db.activityLog.bulkPut(data.activityLog || []),
        db.confirmSources.bulkPut(data.confirmSources || []),
        db.checklists.bulkPut(data.checklists || []),
        db.cableMatrices.bulkPut(data.cableMatrices || []),
        db.antennaChecklists.bulkPut(data.antennaChecklists || []),
        db.dcplChecklists.bulkPut(data.dcplChecklists || []),
        db.cableChecklists.bulkPut(data.cableChecklists || []),
      ])
    },
  )
}

async function loadFullBackupSnapshot() {
  const rows = await Promise.all(
    FULL_BACKUP_TABLES.map((tableName) => db[tableName].toArray()),
  )

  return Object.fromEntries(
    FULL_BACKUP_TABLES.map((tableName, index) => [tableName, rows[index]]),
  )
}

function parseJsonInput(jsonOrObject, errorMessage) {
  if (typeof jsonOrObject === 'string') {
    try {
      return JSON.parse(jsonOrObject)
    } catch {
      throw new Error(errorMessage)
    }
  }

  return jsonOrObject
}

function downloadJson(data, filename) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

async function serializeAttachments(attachments) {
  return Promise.all(
    attachments.map(async (attachment) => {
      if (attachment.blob instanceof Blob) {
        const base64 = await blobToBase64(attachment.blob)
        return { ...attachment, blob: base64, _blobType: attachment.blob.type }
      }

      return attachment
    }),
  )
}

async function restoreAttachments(attachments) {
  return Promise.all(
    attachments.map(async (attachment) => {
      if (typeof attachment.blob === 'string' && attachment.blob.startsWith('data:')) {
        const blob = await base64ToBlob(
          attachment.blob,
          attachment._blobType || 'application/octet-stream',
        )
        const { _blobType, ...rest } = attachment
        return { ...rest, blob }
      }

      return attachment
    }),
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

async function base64ToBlob(base64) {
  const response = await fetch(base64)
  return response.blob()
}

function buildSiteSummary(data) {
  return {
    reports: data.reports?.length || 0,
    issues: data.issues?.length || 0,
    confirms: data.confirms?.length || 0,
    checklists: data.checklists?.length || 0,
    cableMatrices: data.cableMatrices?.length || 0,
    antennaChecklists: data.antennaChecklists?.length || 0,
    dcplChecklists: data.dcplChecklists?.length || 0,
    cableChecklists: data.cableChecklists?.length || 0,
    emailSettings: data.emailSettings ? 1 : 0,
    attachments: data.attachments?.length || 0,
  }
}
