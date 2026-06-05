import { db, ensureLookupSeedData } from '../db/index.js'
import { hasUsableAttachmentBlob, normalizeAttachmentRecord, normalizeAttachmentRecords } from './attachmentBlobs.js'
import { buildCloudBoardPayloads } from './cloudBoardMirror.js'
import { isValidSiteId, toSafeSiteId, toSiteFileSlug } from './siteRouting.js'
import {
  importCloudSiteCoreData,
  refreshTrackerSetupMirror,
  restoreCloudLookups,
  restoreCloudSites,
  isCloudTrackerEnabled,
  upsertCloudSite,
} from './trackerCloud.js'

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
  const data = normalizeBackupSiteIds(parseJsonInput(jsonOrObject, 'Invalid file - could not parse JSON.'))

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

  if (isCloudTrackerEnabled()) {
    await upsertCloudSite(data.site)
    await importCloudSiteCoreData({
      siteId,
      reports: data.reports || [],
      issues: data.issues || [],
      confirms: data.confirms || [],
      documentReferences: data.documentReferences || [],
      emailSettings: data.emailSettings || null,
      pendingSummary: data.pendingSummaries?.[0] || null,
      boards: buildCloudBoardPayloads(data),
    })
  }

  return {
    siteId,
    remappedSiteIds: data._remappedSiteIds || [],
    attachmentsRestored: countUsableAttachments(attachmentsRestored),
    attachmentsExpected: (data.attachments || []).length,
  }
}

export async function importBackup(jsonOrObject) {
  assertBackupCoverage()
  const data = normalizeBackupSiteIds(parseJsonInput(jsonOrObject, 'Invalid backup file - could not parse JSON.'))

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

  if (isCloudTrackerEnabled()) {
    await Promise.all([
      restoreCloudLookups({
        scopes: data.scopes || [],
        confirmSources: data.confirmSources || [],
      }),
      restoreCloudSites(data.sites || []),
    ])

    await Promise.all(
      (data.sites || []).map((site) =>
        importCloudSiteCoreData({
          siteId: site.id,
          reports: (data.reports || []).filter((row) => row.siteId === site.id),
          issues: (data.issues || []).filter((row) => row.siteId === site.id),
          confirms: (data.confirms || []).filter((row) => row.siteId === site.id),
          documentReferences: (data.documentReferences || []).filter((row) => row.siteId === site.id),
          emailSettings:
            (data.emailSettings || []).find((row) => row.siteId === site.id) ||
            (data.emailSettings?.siteId === site.id ? data.emailSettings : null),
          pendingSummary:
            (data.pendingSummaries || []).find((row) => row.siteId === site.id) ||
            (data.pendingSummaries?.siteId === site.id ? data.pendingSummaries : null),
          boards: buildCloudBoardPayloads({
            checklists: (data.checklists || []).filter((row) => row.siteId === site.id),
            checklistLayout:
              (data.checklistLayouts || []).find((row) => row.siteId === site.id) ||
              (data.checklistLayouts?.siteId === site.id ? data.checklistLayouts : null),
            cableMatrices: (data.cableMatrices || []).filter((row) => row.siteId === site.id),
            cableMatrixLayout:
              (data.cableMatrixLayouts || []).find((row) => row.siteId === site.id) ||
              (data.cableMatrixLayouts?.siteId === site.id ? data.cableMatrixLayouts : null),
            antennaChecklists: (data.antennaChecklists || []).filter((row) => row.siteId === site.id),
            antennaChecklistLayout:
              (data.antennaChecklistLayouts || []).find((row) => row.siteId === site.id) ||
              (data.antennaChecklistLayouts?.siteId === site.id ? data.antennaChecklistLayouts : null),
            dcplChecklists: (data.dcplChecklists || []).filter((row) => row.siteId === site.id),
            dcplChecklistLayout:
              (data.dcplChecklistLayouts || []).find((row) => row.siteId === site.id) ||
              (data.dcplChecklistLayouts?.siteId === site.id ? data.dcplChecklistLayouts : null),
            cableChecklists: (data.cableChecklists || []).filter((row) => row.siteId === site.id),
            cableChecklistLayout:
              (data.cableChecklistLayouts || []).find((row) => row.siteId === site.id) ||
              (data.cableChecklistLayouts?.siteId === site.id ? data.cableChecklistLayouts : null),
          }),
        }),
      ),
    )

    await refreshTrackerSetupMirror()
  }

  return {
    remappedSiteIds: data._remappedSiteIds || [],
    attachmentsRestored: countUsableAttachments(attachmentsRestored),
    attachmentsExpected: (data.attachments || []).length,
  }
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

function normalizeBackupSiteIds(data) {
  if (!data || typeof data !== 'object') return data

  const siteIdMap = buildSiteIdMap(data)
  if (!siteIdMap.size) return data

  const remappedSiteIds = []

  if (data.site?.id && siteIdMap.has(String(data.site.id).trim())) {
    const oldId = String(data.site.id).trim()
    const newId = siteIdMap.get(oldId)
    data.site = { ...data.site, id: newId }
    if (oldId !== newId) remappedSiteIds.push({ from: oldId, to: newId })
  }

  if (Array.isArray(data.sites)) {
    data.sites = data.sites.map((site) => {
      if (!site || typeof site !== 'object') return site
      const oldId = String(site.id ?? '').trim()
      const newId = siteIdMap.get(oldId)
      if (!newId) return site
      if (oldId !== newId) remappedSiteIds.push({ from: oldId, to: newId })
      return { ...site, id: newId }
    })
  }

  for (const key of Object.keys(data)) {
    if (key === 'site' || key === 'sites' || key.startsWith('_')) continue
    data[key] = remapSiteIdReferences(data[key], siteIdMap)
  }

  data._remappedSiteIds = dedupeRemappedSiteIds(remappedSiteIds)
  return data
}

function buildSiteIdMap(data) {
  const siteRecords = Array.isArray(data.sites)
    ? data.sites
    : data.site
      ? [data.site]
      : []
  const siteIdMap = new Map()
  const usedSiteIds = new Set()

  for (const site of siteRecords) {
    const siteId = String(site?.id ?? '').trim()
    if (siteId && isValidSiteId(siteId)) {
      usedSiteIds.add(siteId)
      siteIdMap.set(siteId, siteId)
    }
  }

  for (const site of siteRecords) {
    const siteId = String(site?.id ?? '').trim()
    if (!siteId || siteIdMap.has(siteId)) continue

    const safeSiteId = makeUniqueSiteId(toSafeSiteId(siteId), usedSiteIds)
    usedSiteIds.add(safeSiteId)
    siteIdMap.set(siteId, safeSiteId)
  }

  return siteIdMap
}

function makeUniqueSiteId(baseSiteId, usedSiteIds) {
  let siteId = baseSiteId
  let suffix = 2

  while (usedSiteIds.has(siteId)) {
    siteId = `${baseSiteId}-${suffix}`
    suffix += 1
  }

  return siteId
}

function remapSiteIdReferences(value, siteIdMap) {
  if (Array.isArray(value)) {
    return value.map((item) => remapSiteIdReferences(item, siteIdMap))
  }

  if (!value || typeof value !== 'object') return value

  const nextValue = { ...value }
  const oldSiteId = String(nextValue.siteId ?? '').trim()
  if (oldSiteId && siteIdMap.has(oldSiteId)) {
    nextValue.siteId = siteIdMap.get(oldSiteId)
  }

  return nextValue
}

function dedupeRemappedSiteIds(remappedSiteIds) {
  const seen = new Set()
  return remappedSiteIds.filter((item) => {
    const key = `${item.from}->${item.to}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
      const normalized = await normalizeAttachmentRecord(attachment)
      if (normalized?.blob instanceof Blob) {
        const base64 = await blobToBase64(normalized.blob)
        return { ...normalized, blob: base64, _blobType: normalized.blob.type }
      }

      return normalized
    }),
  )
}

async function restoreAttachments(attachments) {
  const normalized = await normalizeAttachmentRecords(attachments)
  return normalized.map((attachment) => {
    if (!attachment || typeof attachment !== 'object') return attachment
    const { _blobType, ...rest } = attachment
    return rest
  })
}

function countUsableAttachments(attachments = []) {
  return attachments.filter(hasUsableAttachmentBlob).length
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
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
