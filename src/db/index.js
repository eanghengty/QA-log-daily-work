import Dexie from 'dexie'

export const db = new Dexie('qa-tracker')

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
  const existing = await tx.table('scopes').count()
  if (existing === 0) {
    await tx.table('scopes').bulkAdd([{ name: 'Macro' }])
  }
})

export async function initDb() {
  await cleanLegacyDemoData()
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
    async () => {
      await Promise.all([
        db.sites.clear(),
        db.reports.clear(),
        db.issues.clear(),
        db.confirms.clear(),
        db.attachments.clear(),
        db.emailSettings.clear(),
      ])
    }
  )
}
