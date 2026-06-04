import { db, ensureLookupSeedData } from '../db/index.js'
import { toSiteFileSlug } from './siteRouting.js'

const FULL_BACKUP_TABLES = Object.freeze(db.tables.map((table) => table.name))
const FULL_BACKUP_TABLE_HANDLES = Object.freeze(FULL_BACKUP_TABLES.map((tableName) => db[tableName]))
const LOCAL_MIGRATION_COUNT_TABLES = Object.freeze([
  'sites',
  'reports',
  'issues',
  'confirms',
  'attachments',
  'emailSettings',
  'checklists',
  'checklistLayouts',
  'cableMatrixLayouts',
  'antennaChecklistLayouts',
  'dcplChecklistLayouts',
  'cableChecklistLayouts',
  'cableMatrices',
  'antennaChecklists',
  'dcplChecklists',
  'cableChecklists',
  'documentReferences',
  'pendingSummaries',
])

const SITE_COLLECTION_EXPORTS = Object.freeze([
  { tableName: 'reports', payloadKey: 'reports' },
  { tableName: 'issues', payloadKey: 'issues' },
  { tableName: 'confirms', payloadKey: 'confirms' },
  { tableName: 'checklists', payloadKey: 'checklists', sortBy: 'order' },
  { tableName: 'cableMatrices', payloadKey: 'cableMatrices', sortBy: 'order' },
  { tableName: 'antennaChecklists', payloadKey: 'antennaChecklists', sortBy: 'order' },
  { tableName: 'dcplChecklists', payloadKey: 'dcplChecklists', sortBy: 'order' },
  { tableName: 'cableChecklists', payloadKey: 'cableChecklists', sortBy: 'order' },
  { tableName: 'documentReferences', payloadKey: 'documentReferences', sortBy: 'createdAt', reverse: true },
])

const SITE_SINGLE_EXPORTS = Object.freeze([
  { tableName: 'emailSettings', payloadKey: 'emailSettings' },
  { tableName: 'checklistLayouts', payloadKey: 'checklistLayout' },
  { tableName: 'cableMatrixLayouts', payloadKey: 'cableMatrixLayout' },
  { tableName: 'antennaChecklistLayouts', payloadKey: 'antennaChecklistLayout' },
  { tableName: 'dcplChecklistLayouts', payloadKey: 'dcplChecklistLayout' },
  { tableName: 'cableChecklistLayouts', payloadKey: 'cableChecklistLayout' },
  {
    tableName: 'pendingSummaries',
    payloadKey: 'pendingSummaries',
    serialize: (record) => (record ? [record] : []),
    deserialize: (value) => (Array.isArray(value) ? value[0] || null : value || null),
  },
])

const SITE_ATTACHMENT_SOURCE_PAYLOAD_KEYS = Object.freeze(['reports', 'issues', 'confirms'])
const SITE_EXCLUDED_SCHEMA_TABLES = Object.freeze([
  'sites',
  'attachments',
  'scopes',
  'activityLog',
  'confirmSources',
])
const SITE_TRANSACTION_TABLE_HANDLES = Object.freeze(
  [...SITE_COLLECTION_EXPORTS, ...SITE_SINGLE_EXPORTS].map((config) => db[config.tableName]),
)

export async function exportBackup() {
  assertBackupCoverage()
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

export async function getLocalMigrationSummary() {
  const counts = Object.fromEntries(
    await Promise.all(
      LOCAL_MIGRATION_COUNT_TABLES.map(async (tableName) => [tableName, await db[tableName].count()]),
    ),
  )

  const totalRecords = Object.values(counts).reduce((total, count) => total + count, 0)

  return {
    hasData: totalRecords > 0,
    totalRecords,
    counts,
  }
}

export async function clearLocalTrackerData() {
  assertBackupCoverage()

  await db.transaction(
    'rw',
    ...FULL_BACKUP_TABLE_HANDLES,
    async () => {
      await Promise.all(FULL_BACKUP_TABLES.map((tableName) => db[tableName].clear()))
    },
  )

  await ensureLookupSeedData()
}

export async function exportSite(siteId) {
  assertBackupCoverage()

  const site = await db.sites.get(siteId)
  if (!site) {
    throw new Error('Site not found.')
  }

  const siteCollections = await Promise.all(
    SITE_COLLECTION_EXPORTS.map(async (config) => [
      config.payloadKey,
      await loadSiteCollection(config, siteId),
    ]),
  )
  const siteSingles = await Promise.all(
    SITE_SINGLE_EXPORTS.map(async (config) => [
      config.payloadKey,
      await loadSiteSingle(config, siteId),
    ]),
  )
  const siteData = Object.fromEntries([...siteCollections, ...siteSingles])

  const allAttachmentIds = SITE_ATTACHMENT_SOURCE_PAYLOAD_KEYS.flatMap((payloadKey) =>
    (siteData[payloadKey] || []).flatMap((record) => record.attachmentIds || []),
  )
  const uniqueAttachmentIds = [...new Set(allAttachmentIds)]
  const attachments = (await db.attachments.bulkGet(uniqueAttachmentIds)).filter(Boolean)

  const payload = {
    _version: 2,
    _type: 'site',
    _exportedAt: new Date().toISOString(),
    summary: buildSiteSummary({
      ...siteData,
      attachments,
    }),
    site,
    ...siteData,
    attachments: await serializeAttachments(attachments),
  }

  downloadJson(payload, `site-${toSiteFileSlug(siteId)}-${new Date().toISOString().slice(0, 10)}.json`)
}

export async function importSite(jsonOrObject) {
  assertBackupCoverage()
  const data = parseJsonInput(jsonOrObject, 'Invalid file - could not parse JSON.')

  if (data._type !== 'site' || !data.site) {
    throw new Error('Not a site export file.')
  }

  const attachmentsRestored = await restoreAttachments(data.attachments || [])
  const siteId = data.site.id
  const existingIds = Object.fromEntries(
    await Promise.all(
      SITE_COLLECTION_EXPORTS.map(async (config) => [
        config.tableName,
        await db[config.tableName].where('siteId').equals(siteId).primaryKeys(),
      ]),
    ),
  )

  await db.transaction(
    'rw',
    db.sites,
    db.attachments,
    ...SITE_TRANSACTION_TABLE_HANDLES,
    async () => {
      await db.sites.put(data.site)

      await Promise.all(
        SITE_COLLECTION_EXPORTS.map((config) =>
          db[config.tableName].bulkDelete(existingIds[config.tableName] || []),
        ),
      )

      await Promise.all(
        SITE_COLLECTION_EXPORTS.map((config) =>
          db[config.tableName].bulkPut(data[config.payloadKey] || []),
        ),
      )

      await db.attachments.bulkPut(attachmentsRestored)

      await Promise.all(
        SITE_SINGLE_EXPORTS.map(async (config) => {
          const nextValue = config.deserialize
            ? config.deserialize(data[config.payloadKey])
            : data[config.payloadKey] || null

          if (nextValue) {
            await db[config.tableName].put(nextValue)
          } else {
            await db[config.tableName].delete(siteId)
          }
        }),
      )
    },
  )

  return siteId
}

export async function importBackup(jsonOrObject) {
  assertBackupCoverage()
  const data = parseJsonInput(jsonOrObject, 'Invalid backup file - could not parse JSON.')

  if (!data.sites || !data.reports) {
    throw new Error('Invalid backup file - missing required tables.')
  }

  const attachmentsRestored = await restoreAttachments(data.attachments || [])

  await db.transaction(
    'rw',
    ...FULL_BACKUP_TABLE_HANDLES,
    async () => {
      await Promise.all(FULL_BACKUP_TABLES.map((tableName) => db[tableName].clear()))

      await Promise.all(
        FULL_BACKUP_TABLES.map((tableName) =>
          db[tableName].bulkPut(
            tableName === 'attachments'
              ? attachmentsRestored
              : data[tableName] || [],
          ),
        ),
      )
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

async function loadSiteCollection(config, siteId) {
  const query = db[config.tableName].where('siteId').equals(siteId)
  const collection = config.reverse ? query.reverse() : query
  return config.sortBy ? collection.sortBy(config.sortBy) : collection.toArray()
}

async function loadSiteSingle(config, siteId) {
  const record = await db[config.tableName].get(siteId)
  if (config.serialize) {
    return config.serialize(record)
  }
  return record || null
}

function assertBackupCoverage() {
  const schemaTableNames = db.tables.map((table) => table.name)
  const schemaTableNameSet = new Set(schemaTableNames)

  const unknownSiteConfigTables = [
    ...SITE_COLLECTION_EXPORTS.map((config) => config.tableName),
    ...SITE_SINGLE_EXPORTS.map((config) => config.tableName),
    ...SITE_EXCLUDED_SCHEMA_TABLES,
  ].filter((tableName) => !schemaTableNameSet.has(tableName))

  if (unknownSiteConfigTables.length) {
    throw new Error(`Backup configuration references unknown tables: ${unknownSiteConfigTables.join(', ')}`)
  }

  const siteCoverageNames = new Set([
    ...SITE_COLLECTION_EXPORTS.map((config) => config.tableName),
    ...SITE_SINGLE_EXPORTS.map((config) => config.tableName),
    ...SITE_EXCLUDED_SCHEMA_TABLES,
  ])
  const uncoveredSiteTables = schemaTableNames.filter((tableName) => !siteCoverageNames.has(tableName))

  if (uncoveredSiteTables.length) {
    throw new Error(`Backup coverage needs review for new schema tables: ${uncoveredSiteTables.join(', ')}`)
  }
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
        const blob = await base64ToBlob(attachment.blob)
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
    checklistLayout: data.checklistLayout?.customColumns?.length || 0,
    cableMatrixLayout: data.cableMatrixLayout?.customColumns?.length || 0,
    antennaChecklistLayout: data.antennaChecklistLayout?.customColumns?.length || 0,
    dcplChecklistLayout: data.dcplChecklistLayout?.customColumns?.length || 0,
    cableChecklistLayout: data.cableChecklistLayout?.customColumns?.length || 0,
    cableMatrices: data.cableMatrices?.length || 0,
    antennaChecklists: data.antennaChecklists?.length || 0,
    dcplChecklists: data.dcplChecklists?.length || 0,
    cableChecklists: data.cableChecklists?.length || 0,
    documentReferences: data.documentReferences?.length || 0,
    pendingSummaries: data.pendingSummaries?.length || 0,
    pendingSummarySections:
      data.pendingSummaries?.reduce((total, board) => total + (board.sections?.length || 0), 0) || 0,
    pendingSummaryItems:
      data.pendingSummaries?.reduce(
        (total, board) =>
          total +
          (board.sections || []).reduce(
            (sectionTotal, section) =>
              sectionTotal +
              (section.groups || []).reduce(
                (groupTotal, group) => groupTotal + (group.items?.length || 0),
                0,
              ),
            0,
          ),
        0,
      ) || 0,
    emailSettings: data.emailSettings ? 1 : 0,
    attachments: data.attachments?.length || 0,
  }
}
