import Dexie from 'dexie'

export const db = new Dexie('qa-tracker')
const DEFAULT_SCOPES = Object.freeze([{ name: 'Macro' }])
const DEFAULT_CONFIRM_SOURCES = Object.freeze([
  { name: 'Email' },
  { name: 'Slack' },
  { name: 'Meeting' },
])

db.version(1).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
})

db.version(2).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
})

db.version(3).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
})

db.version(4).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
  scopes: '++id',
}).upgrade(async (tx) => {
  await ensureTxSeedRows(tx, 'scopes', DEFAULT_SCOPES)
})

db.version(5).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
  scopes: '++id',
  activityLog: '++id',
})

db.version(6).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
  scopes: '++id',
  activityLog: '++id',
  confirmSources: '++id',
}).upgrade(async (tx) => {
  await ensureTxSeedRows(tx, 'confirmSources', DEFAULT_CONFIRM_SOURCES)
})

db.version(7).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
  scopes: '++id',
  activityLog: '++id',
  confirmSources: '++id',
  checklists: '++id, siteId, order',
})

db.version(8).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
  scopes: '++id',
  activityLog: '++id',
  confirmSources: '++id',
  checklists: '++id, siteId, order',
  cableMatrices: '++id, siteId, order',
})

db.version(9).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
  scopes: '++id',
  activityLog: '++id',
  confirmSources: '++id',
  checklists: '++id, siteId, order',
  cableMatrices: '++id, siteId, order',
  antennaChecklists: '++id, siteId, order',
})

db.version(10).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
  scopes: '++id',
  activityLog: '++id',
  confirmSources: '++id',
  checklists: '++id, siteId, order',
  cableMatrices: '++id, siteId, order',
  antennaChecklists: '++id, siteId, order',
  dcplChecklists: '++id, siteId, order',
})

db.version(11).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
  scopes: '++id',
  activityLog: '++id',
  confirmSources: '++id',
  checklists: '++id, siteId, order',
  cableMatrices: '++id, siteId, order',
  antennaChecklists: '++id, siteId, order',
  dcplChecklists: '++id, siteId, order',
  cableChecklists: '++id, siteId, order',
})

db.version(12).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
  scopes: '++id',
  activityLog: '++id',
  confirmSources: '++id',
  checklists: '++id, siteId, order',
  cableMatrices: '++id, siteId, order',
  antennaChecklists: '++id, siteId, order',
  dcplChecklists: '++id, siteId, order',
  cableChecklists: '++id, siteId, order',
}).upgrade(async (tx) => {
  await tx.table('sites').toCollection().modify((site) => {
    if (!`${site.hopReviewer || ''}`.trim()) {
      site.hopReviewer = 'NA'
    }
  })
})

db.version(13).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
  scopes: '++id',
  activityLog: '++id',
  confirmSources: '++id',
  checklists: '++id, siteId, order',
  cableMatrices: '++id, siteId, order',
  antennaChecklists: '++id, siteId, order',
  dcplChecklists: '++id, siteId, order',
  cableChecklists: '++id, siteId, order',
  documentReferences: '++id, siteId, createdAt',
})

db.version(14).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
  scopes: '++id',
  activityLog: '++id',
  confirmSources: '++id',
  checklists: '++id, siteId, order',
  checklistLayouts: 'siteId',
  cableMatrices: '++id, siteId, order',
  antennaChecklists: '++id, siteId, order',
  dcplChecklists: '++id, siteId, order',
  cableChecklists: '++id, siteId, order',
  documentReferences: '++id, siteId, createdAt',
})

db.version(15).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
  scopes: '++id',
  activityLog: '++id',
  confirmSources: '++id',
  checklists: '++id, siteId, order',
  checklistLayouts: 'siteId',
  cableMatrixLayouts: 'siteId',
  cableMatrices: '++id, siteId, order',
  antennaChecklists: '++id, siteId, order',
  dcplChecklists: '++id, siteId, order',
  cableChecklists: '++id, siteId, order',
  documentReferences: '++id, siteId, createdAt',
})

db.version(16).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
  scopes: '++id',
  activityLog: '++id',
  confirmSources: '++id',
  checklists: '++id, siteId, order',
  checklistLayouts: 'siteId',
  cableMatrixLayouts: 'siteId',
  antennaChecklistLayouts: 'siteId',
  cableMatrices: '++id, siteId, order',
  antennaChecklists: '++id, siteId, order',
  dcplChecklists: '++id, siteId, order',
  cableChecklists: '++id, siteId, order',
  documentReferences: '++id, siteId, createdAt',
})

db.version(17).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
  scopes: '++id',
  activityLog: '++id',
  confirmSources: '++id',
  checklists: '++id, siteId, order',
  checklistLayouts: 'siteId',
  cableMatrixLayouts: 'siteId',
  antennaChecklistLayouts: 'siteId',
  dcplChecklistLayouts: 'siteId',
  cableMatrices: '++id, siteId, order',
  antennaChecklists: '++id, siteId, order',
  dcplChecklists: '++id, siteId, order',
  cableChecklists: '++id, siteId, order',
  documentReferences: '++id, siteId, createdAt',
})

db.version(18).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
  scopes: '++id',
  activityLog: '++id',
  confirmSources: '++id',
  checklists: '++id, siteId, order',
  checklistLayouts: 'siteId',
  cableMatrixLayouts: 'siteId',
  antennaChecklistLayouts: 'siteId',
  dcplChecklistLayouts: 'siteId',
  cableChecklistLayouts: 'siteId',
  cableMatrices: '++id, siteId, order',
  antennaChecklists: '++id, siteId, order',
  dcplChecklists: '++id, siteId, order',
  cableChecklists: '++id, siteId, order',
  documentReferences: '++id, siteId, createdAt',
})

db.version(19).stores({
  sites: 'id',
  reports: '++id, siteId, date',
  issues: '++id, siteId, status',
  confirms: '++id, siteId',
  attachments: '++id',
  emailSettings: 'siteId',
  scopes: '++id',
  activityLog: '++id',
  confirmSources: '++id',
  checklists: '++id, siteId, order',
  checklistLayouts: 'siteId',
  cableMatrixLayouts: 'siteId',
  antennaChecklistLayouts: 'siteId',
  dcplChecklistLayouts: 'siteId',
  cableChecklistLayouts: 'siteId',
  cableMatrices: '++id, siteId, order',
  antennaChecklists: '++id, siteId, order',
  dcplChecklists: '++id, siteId, order',
  cableChecklists: '++id, siteId, order',
  documentReferences: '++id, siteId, createdAt',
  pendingSummaries: 'siteId',
})

export async function initDb() {
  await cleanLegacyDemoData()
  await ensureLookupSeedData()
}

export async function ensureLookupSeedData() {
  await Promise.all([
    ensureTableSeedRows(db.scopes, DEFAULT_SCOPES),
    ensureTableSeedRows(db.confirmSources, DEFAULT_CONFIRM_SOURCES),
  ])
}

async function cleanLegacyDemoData() {
  const legacySiteIds = [
    'acme',
    'hub',
    'mkt',
    'admin',
    'api',
    'docs',
    'checkout',
    'billing',
  ]

  const sites = await db.sites.toArray()
  const isUntouchedLegacySeed =
    sites.length === legacySiteIds.length &&
    legacySiteIds.every((id) => sites.some((site) => site.id === id)) &&
    (await db.reports.count()) === 5 &&
    (await db.confirms.count()) === 81

  if (!isUntouchedLegacySeed) return

  await db.transaction(
    'rw',
    db.sites,
    db.reports,
    db.issues,
    db.confirms,
    db.attachments,
    db.emailSettings,
    db.checklists,
    db.checklistLayouts,
    db.cableMatrixLayouts,
    db.antennaChecklistLayouts,
    db.dcplChecklistLayouts,
    db.cableChecklistLayouts,
    db.cableMatrices,
    db.antennaChecklists,
    db.dcplChecklists,
    db.cableChecklists,
    db.documentReferences,
    db.pendingSummaries,
    async () => {
      await Promise.all([
        db.sites.clear(),
        db.reports.clear(),
        db.issues.clear(),
        db.confirms.clear(),
        db.attachments.clear(),
        db.emailSettings.clear(),
        db.checklists.clear(),
        db.checklistLayouts.clear(),
        db.cableMatrixLayouts.clear(),
        db.antennaChecklistLayouts.clear(),
        db.dcplChecklistLayouts.clear(),
        db.cableChecklistLayouts.clear(),
        db.cableMatrices.clear(),
        db.antennaChecklists.clear(),
        db.dcplChecklists.clear(),
        db.cableChecklists.clear(),
        db.documentReferences.clear(),
        db.pendingSummaries.clear(),
      ])
    }
  )
}

async function ensureTableSeedRows(table, rows) {
  const existing = await table.count()
  if (existing === 0 && rows.length) {
    await table.bulkAdd(rows)
  }
}

async function ensureTxSeedRows(tx, tableName, rows) {
  const existing = await tx.table(tableName).count()
  if (existing === 0 && rows.length) {
    await tx.table(tableName).bulkAdd(rows)
  }
}
