import { computed } from 'vue'
import { db } from '../db/index.js'
import { assertValidSiteId } from '../lib/siteRouting.js'
import { useLiveQuery } from './useLiveQuery.js'

export function useSites() {
  const { data: sites, loading } = useLiveQuery(() => db.sites.toArray())
  const { data: allIssues } = useLiveQuery(() => db.issues.toArray())
  const { data: allConfirms } = useLiveQuery(() => db.confirms.toArray())

  const sitesWithCounts = computed(() => {
    if (!sites.value || !allIssues.value || !allConfirms.value) return []
    return sites.value.map((site) => {
      const pending = allIssues.value.filter(
        (i) => i.siteId === site.id && i.status === 'open'
      ).length
      const confirms = allConfirms.value.filter((c) => c.siteId === site.id).length
      return { ...site, pending, confirms }
    })
  })

  async function addSite(site) {
    assertValidSiteId(site.id)

    return await db.sites.add({
      ...site,
      createdAt: new Date().toISOString(),
    })
  }

  async function updateSite(id, updates) {
    return await db.sites.update(id, updates)
  }

  async function deleteSite(id) {
    // Delete all related data
    await db.reports.where('siteId').equals(id).delete()
    await db.issues.where('siteId').equals(id).delete()
    await db.confirms.where('siteId').equals(id).delete()
    await db.checklists.where('siteId').equals(id).delete()
    await db.checklistLayouts.delete(id)
    await db.cableMatrixLayouts.delete(id)
    await db.antennaChecklistLayouts.delete(id)
    await db.dcplChecklistLayouts.delete(id)
    await db.cableChecklistLayouts.delete(id)
    await db.cableMatrices.where('siteId').equals(id).delete()
    await db.antennaChecklists.where('siteId').equals(id).delete()
    await db.dcplChecklists.where('siteId').equals(id).delete()
    await db.cableChecklists.where('siteId').equals(id).delete()
    await db.documentReferences.where('siteId').equals(id).delete()
    await db.pendingSummaries.delete(id)
    await db.emailSettings.delete(id)
    await db.sites.delete(id)
  }

  function useSiteById(id) {
    return useLiveQuery(() => db.sites.get(id))
  }

  return { sites: sitesWithCounts, loading, addSite, updateSite, deleteSite, useSiteById }
}

export function useSiteStats(siteId) {
  const { data: pendingCount } = useLiveQuery(() =>
    db.issues
      .where('siteId')
      .equals(siteId)
      .filter((i) => i.status === 'open')
      .count()
  )

  const { data: confirmCount } = useLiveQuery(() =>
    db.confirms.where('siteId').equals(siteId).count()
  )

  return { pendingCount, confirmCount }
}
