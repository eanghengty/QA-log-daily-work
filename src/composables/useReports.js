import { computed, ref, watch } from 'vue'
import { db } from '../db/index.js'
import {
  createCloudReport,
  deleteCloudReport,
  isCloudTrackerEnabled,
  listCloudReports,
  updateCloudReport,
} from '../lib/trackerCloud.js'
import { broadcastTrackerChange, useRealtime } from './useRealtime.js'
import { useLiveQuery } from './useLiveQuery.js'

const cloudReportsBySite = new Map()

function createCloudReportsState() {
  return {
    data: ref([]),
    loading: ref(true),
    error: ref(null),
    ready: false,
    pending: null,
  }
}

function getCloudReportsState(siteId) {
  if (!cloudReportsBySite.has(siteId)) {
    cloudReportsBySite.set(siteId, createCloudReportsState())
  }
  return cloudReportsBySite.get(siteId)
}

function localRecordKey(id) {
  const numberId = Number(id)
  return Number.isFinite(numberId) && `${numberId}` === `${id}` ? numberId : id
}

async function loadCloudReports(siteId, state, { force = false } = {}) {
  if (!force && state.ready) return state.data.value
  if (state.pending) return await state.pending

  state.loading.value = true
  state.pending = listCloudReports(siteId)
    .then(async ({ reports }) => {
      state.data.value = reports || []
      state.error.value = null
      state.ready = true
      if (reports?.length) {
        await db.reports.bulkPut(reports)
      }
      return state.data.value
    })
    .catch((error) => {
      state.error.value = error
      throw error
    })
    .finally(() => {
      state.loading.value = false
      state.pending = null
    })

  return await state.pending
}

export function useReports(siteId) {
  const cloudState = isCloudTrackerEnabled() ? getCloudReportsState(siteId) : null
  const liveState = isCloudTrackerEnabled()
    ? {
        data: cloudState.data,
        loading: cloudState.loading,
        error: cloudState.error,
      }
    : useLiveQuery(() =>
        db.reports.where('siteId').equals(siteId).reverse().toArray()
      )

  if (cloudState) {
    void loadCloudReports(siteId, cloudState)
    const { trackerSyncRefreshToken } = useRealtime()
    watch(
      trackerSyncRefreshToken,
      () => {
        void loadCloudReports(siteId, cloudState, { force: true })
      },
    )
  }

  const reports = liveState.data

  async function addReport(report) {
    if (isCloudTrackerEnabled()) {
      const { report: savedReport } = await createCloudReport(report)
      await db.reports.put(savedReport)
      const state = getCloudReportsState(siteId)
      state.data.value = [savedReport, ...(state.data.value || [])]
      state.error.value = null
      state.ready = true
      state.loading.value = false
      await broadcastTrackerChange('report-added')
      return savedReport.id
    }

    return await db.reports.add({
      ...report,
      createdAt: new Date().toISOString(),
    })
  }

  async function updateReport(id, updates) {
    if (isCloudTrackerEnabled()) {
      const { report } = await updateCloudReport(id, updates)
      await db.reports.put(report)
      const state = getCloudReportsState(siteId)
      state.data.value = (state.data.value || []).map((row) => (row.id === id ? report : row))
      state.error.value = null
      await broadcastTrackerChange('report-updated')
      return 1
    }

    return await db.reports.update(id, updates)
  }

  async function deleteReport(id) {
    if (isCloudTrackerEnabled()) {
      await deleteCloudReport(id)
      await db.reports.delete(id)
      const state = getCloudReportsState(siteId)
      state.data.value = (state.data.value || []).filter((row) => row.id !== id)
      state.error.value = null
      await broadcastTrackerChange('report-deleted')
      return
    }

    await db.reports.delete(id)
  }

  async function getReportById(id) {
    if (isCloudTrackerEnabled()) {
      const state = getCloudReportsState(siteId)
      const reports = await loadCloudReports(siteId, state)
      return reports.find((report) => report.id === id) || null
    }

    return await db.reports.get(localRecordKey(id))
  }

  function useReportById(id) {
    if (isCloudTrackerEnabled()) {
      const state = getCloudReportsState(siteId)
      void loadCloudReports(siteId, state)
      return {
        data: computed(() => (state.data.value || []).find((report) => report.id === id) || null),
        loading: state.loading,
        error: state.error,
      }
    }

    return useLiveQuery(() => db.reports.get(localRecordKey(id)))
  }

  return {
    reports,
    addReport,
    updateReport,
    deleteReport,
    getReportById,
    useReportById,
  }
}
