import { computed, ref, watch } from 'vue'
import { db } from '../db/index.js'
import {
  createCloudSnagReport,
  deleteCloudSnagReport,
  isCloudTrackerEnabled,
  listCloudSnagReports,
  updateCloudSnagReport,
} from '../lib/trackerCloud.js'
import { SNAG_SUMMARY_CATEGORIES } from './useSnagSummary.js'
import { broadcastTrackerChange, useRealtime } from './useRealtime.js'
import { useLiveQuery } from './useLiveQuery.js'

const cloudSnagReportsBySite = new Map()

function createCloudSnagReportsState() {
  return {
    data: ref([]),
    loading: ref(true),
    error: ref(null),
    ready: false,
    pending: null,
  }
}

function getCloudSnagReportsState(siteId) {
  if (!cloudSnagReportsBySite.has(siteId)) {
    cloudSnagReportsBySite.set(siteId, createCloudSnagReportsState())
  }
  return cloudSnagReportsBySite.get(siteId)
}

async function loadCloudSnagReports(siteId, state, { force = false } = {}) {
  if (!force && state.ready) return state.data.value
  if (state.pending) return await state.pending

  state.loading.value = true
  state.pending = listCloudSnagReports(siteId)
    .then(async ({ snagReports }) => {
      state.data.value = snagReports || []
      state.error.value = null
      state.ready = true
      if (snagReports?.length) await db.snagReports.bulkPut(snagReports)
      return state.data.value
    })
    .finally(() => {
      state.loading.value = false
      state.pending = null
    })

  return await state.pending
}

export function useSnagReports(siteId) {
  const cloudState = isCloudTrackerEnabled() ? getCloudSnagReportsState(siteId) : null
  const liveState = isCloudTrackerEnabled()
    ? { data: cloudState.data, loading: cloudState.loading, error: cloudState.error }
    : useLiveQuery(() => db.snagReports.where('siteId').equals(siteId).reverse().toArray())

  if (cloudState) {
    void loadCloudSnagReports(siteId, cloudState)
    const { trackerSyncRefreshToken } = useRealtime()
    watch(trackerSyncRefreshToken, () => {
      void loadCloudSnagReports(siteId, cloudState, { force: true })
    })
  }

  const snagReports = liveState.data

  async function addSnagReport(snagReport) {
    const payload = {
      ...snagReport,
      category: normalizeCategory(snagReport.category),
    }

    if (isCloudTrackerEnabled()) {
      const { snagReport: savedSnagReport } = await createCloudSnagReport(payload)
      await db.snagReports.put(savedSnagReport)
      const state = getCloudSnagReportsState(siteId)
      state.data.value = [savedSnagReport, ...(state.data.value || [])]
      state.ready = true
      state.loading.value = false
      await broadcastTrackerChange('snag-report-added')
      return savedSnagReport.id
    }

    return await db.snagReports.add({
      ...payload,
      createdAt: new Date().toISOString(),
    })
  }

  async function updateSnagReport(id, updates) {
    const payload = {
      ...updates,
      ...(updates.category ? { category: normalizeCategory(updates.category) } : {}),
    }

    if (isCloudTrackerEnabled()) {
      const { snagReport } = await updateCloudSnagReport(id, payload)
      await db.snagReports.put(snagReport)
      const state = getCloudSnagReportsState(siteId)
      state.data.value = (state.data.value || []).map((row) => (row.id === id ? snagReport : row))
      await broadcastTrackerChange('snag-report-updated')
      return
    }

    await db.snagReports.update(id, payload)
  }

  async function deleteSnagReport(id) {
    if (isCloudTrackerEnabled()) {
      await deleteCloudSnagReport(id)
      await db.snagReports.delete(id)
      const state = getCloudSnagReportsState(siteId)
      state.data.value = (state.data.value || []).filter((row) => row.id !== id)
      await broadcastTrackerChange('snag-report-deleted')
      return
    }

    await db.snagReports.delete(id)
  }

  return {
    snagReports,
    addSnagReport,
    updateSnagReport,
    deleteSnagReport,
    summary: computed(() => ({
      total: snagReports.value?.length || 0,
    })),
  }
}

function normalizeCategory(category) {
  const normalized = String(category || '').trim().toLowerCase()
  return SNAG_SUMMARY_CATEGORIES.find((option) => option.toLowerCase() === normalized) || SNAG_SUMMARY_CATEGORIES[0]
}
