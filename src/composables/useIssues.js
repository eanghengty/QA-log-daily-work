import { computed, ref, watch } from 'vue'
import { db } from '../db/index.js'
import {
  createCloudIssue,
  deleteCloudIssue,
  isCloudTrackerEnabled,
  listCloudIssues,
  updateCloudIssue,
} from '../lib/trackerCloud.js'
import { broadcastTrackerChange, useRealtime } from './useRealtime.js'
import { useLiveQuery } from './useLiveQuery.js'

const cloudIssuesBySite = new Map()

function createCloudIssuesState() {
  return {
    data: ref([]),
    loading: ref(true),
    error: ref(null),
    ready: false,
    pending: null,
  }
}

function getCloudIssuesState(siteId) {
  if (!cloudIssuesBySite.has(siteId)) {
    cloudIssuesBySite.set(siteId, createCloudIssuesState())
  }
  return cloudIssuesBySite.get(siteId)
}

function localRecordKey(id) {
  const numberId = Number(id)
  return Number.isFinite(numberId) && `${numberId}` === `${id}` ? numberId : id
}

async function loadCloudIssues(siteId, state, { force = false } = {}) {
  if (!force && state.ready) return state.data.value
  if (state.pending) return await state.pending

  state.loading.value = true
  state.pending = listCloudIssues(siteId)
    .then(async ({ issues }) => {
      state.data.value = issues || []
      state.error.value = null
      state.ready = true
      if (issues?.length) {
        await db.issues.bulkPut(issues)
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

export function useIssues(siteId) {
  const cloudState = isCloudTrackerEnabled() ? getCloudIssuesState(siteId) : null
  const liveState = isCloudTrackerEnabled()
    ? {
        data: cloudState.data,
        loading: cloudState.loading,
        error: cloudState.error,
      }
    : useLiveQuery(() =>
        db.issues.where('siteId').equals(siteId).toArray()
      )

  if (cloudState) {
    void loadCloudIssues(siteId, cloudState)
    const { trackerSyncRefreshToken } = useRealtime()
    watch(
      trackerSyncRefreshToken,
      () => {
        void loadCloudIssues(siteId, cloudState, { force: true })
      },
    )
  }

  const issues = liveState.data

  const pendingIssues = isCloudTrackerEnabled()
    ? computed(() => (issues.value || []).filter((i) => i.status === 'open'))
    : useLiveQuery(() =>
        db.issues
          .where('siteId')
          .equals(siteId)
          .filter((i) => i.status === 'open')
          .toArray()
      ).data

  async function addIssue(issue) {
    if (isCloudTrackerEnabled()) {
      const { issue: savedIssue } = await createCloudIssue(issue)
      await db.issues.put(savedIssue)
      const state = getCloudIssuesState(siteId)
      state.data.value = [savedIssue, ...(state.data.value || [])]
      state.error.value = null
      state.ready = true
      state.loading.value = false
      await broadcastTrackerChange('issue-added')
      return savedIssue.id
    }

    const siteIssues = await db.issues
      .where('siteId')
      .equals(issue.siteId)
      .toArray()

    const lastNum = siteIssues.reduce((max, item) => {
      const num = Number.parseInt(item.code?.split('-')[1], 10)
      return Number.isFinite(num) ? Math.max(max, num) : max
    }, 199)
    const nextNum = lastNum + 1
    const code = `I-${nextNum}`

    return await db.issues.add({
      ...issue,
      code,
      createdAt: new Date().toISOString(),
    })
  }

  async function updateIssue(id, updates) {
    if (isCloudTrackerEnabled()) {
      const { issue } = await updateCloudIssue(id, updates)
      await db.issues.put(issue)
      const state = getCloudIssuesState(siteId)
      state.data.value = (state.data.value || []).map((row) => (row.id === id ? issue : row))
      state.error.value = null
      await broadcastTrackerChange('issue-updated')
      return 1
    }

    return await db.issues.update(id, updates)
  }

  async function deleteIssue(id) {
    if (isCloudTrackerEnabled()) {
      await deleteCloudIssue(id)
      await db.issues.delete(id)
      const state = getCloudIssuesState(siteId)
      state.data.value = (state.data.value || []).filter((row) => row.id !== id)
      state.error.value = null
      await broadcastTrackerChange('issue-deleted')
      return
    }

    await db.issues.delete(id)
  }

  async function getIssueById(id) {
    if (isCloudTrackerEnabled()) {
      const state = getCloudIssuesState(siteId)
      const issues = await loadCloudIssues(siteId, state)
      return issues.find((issue) => issue.id === id) || null
    }

    return await db.issues.get(localRecordKey(id))
  }

  function useIssueById(id) {
    if (isCloudTrackerEnabled()) {
      const state = getCloudIssuesState(siteId)
      void loadCloudIssues(siteId, state)
      return {
        data: computed(() => (state.data.value || []).find((issue) => issue.id === id) || null),
        loading: state.loading,
        error: state.error,
      }
    }

    return useLiveQuery(() => db.issues.get(localRecordKey(id)))
  }

  return {
    issues,
    pendingIssues,
    addIssue,
    updateIssue,
    deleteIssue,
    getIssueById,
    useIssueById,
  }
}
