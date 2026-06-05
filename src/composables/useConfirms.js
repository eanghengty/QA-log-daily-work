import { computed, ref, watch } from 'vue'
import { db } from '../db/index.js'
import {
  createCloudConfirm,
  deleteCloudConfirm,
  isCloudTrackerEnabled,
  listCloudConfirms,
  updateCloudConfirm,
} from '../lib/trackerCloud.js'
import { broadcastTrackerChange, useRealtime } from './useRealtime.js'
import { useLiveQuery } from './useLiveQuery.js'

const cloudConfirmsBySite = new Map()

function createCloudConfirmsState() {
  return {
    data: ref([]),
    loading: ref(true),
    error: ref(null),
    ready: false,
    pending: null,
  }
}

function getCloudConfirmsState(siteId) {
  if (!cloudConfirmsBySite.has(siteId)) {
    cloudConfirmsBySite.set(siteId, createCloudConfirmsState())
  }
  return cloudConfirmsBySite.get(siteId)
}

function localRecordKey(id) {
  const numberId = Number(id)
  return Number.isFinite(numberId) && `${numberId}` === `${id}` ? numberId : id
}

async function loadCloudConfirms(siteId, state, { force = false } = {}) {
  if (!force && state.ready) return state.data.value
  if (state.pending) return await state.pending

  state.loading.value = true
  state.pending = listCloudConfirms(siteId)
    .then(async ({ confirms }) => {
      state.data.value = confirms || []
      state.error.value = null
      state.ready = true
      if (confirms?.length) {
        await db.confirms.bulkPut(confirms)
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

export function useConfirms(siteId) {
  const cloudState = isCloudTrackerEnabled() ? getCloudConfirmsState(siteId) : null
  const liveState = isCloudTrackerEnabled()
    ? {
        data: cloudState.data,
        loading: cloudState.loading,
        error: cloudState.error,
      }
    : useLiveQuery(() =>
        db.confirms.where('siteId').equals(siteId).reverse().toArray()
      )

  if (cloudState) {
    void loadCloudConfirms(siteId, cloudState)
    const { trackerSyncRefreshToken } = useRealtime()
    watch(
      trackerSyncRefreshToken,
      () => {
        void loadCloudConfirms(siteId, cloudState, { force: true })
      },
    )
  }

  const confirms = liveState.data

  async function addConfirm(confirm) {
    if (isCloudTrackerEnabled()) {
      const { confirm: savedConfirm } = await createCloudConfirm(confirm)
      await db.confirms.put(savedConfirm)
      const state = getCloudConfirmsState(siteId)
      state.data.value = [savedConfirm, ...(state.data.value || [])]
      state.error.value = null
      state.ready = true
      state.loading.value = false
      await broadcastTrackerChange('confirm-added')
      return savedConfirm.id
    }

    const siteConfirms = await db.confirms
      .where('siteId')
      .equals(confirm.siteId)
      .toArray()

    const lastNum = siteConfirms.reduce((max, item) => {
      const num = Number.parseInt(item.code?.split('-')[1], 10)
      return Number.isFinite(num) ? Math.max(max, num) : max
    }, 99)
    const nextNum = lastNum + 1
    const code = `C-${nextNum}`

    return await db.confirms.add({
      ...confirm,
      code,
      createdAt: new Date().toISOString(),
    })
  }

  async function updateConfirm(id, updates) {
    if (isCloudTrackerEnabled()) {
      const { confirm } = await updateCloudConfirm(id, updates)
      await db.confirms.put(confirm)
      const state = getCloudConfirmsState(siteId)
      state.data.value = (state.data.value || []).map((row) => (row.id === id ? confirm : row))
      state.error.value = null
      await broadcastTrackerChange('confirm-updated')
      return 1
    }

    return await db.confirms.update(id, updates)
  }

  async function deleteConfirm(id) {
    if (isCloudTrackerEnabled()) {
      await deleteCloudConfirm(id)
      await db.confirms.delete(id)
      const state = getCloudConfirmsState(siteId)
      state.data.value = (state.data.value || []).filter((row) => row.id !== id)
      state.error.value = null
      await broadcastTrackerChange('confirm-deleted')
      return
    }

    await db.confirms.delete(id)
  }

  async function getConfirmById(id) {
    if (isCloudTrackerEnabled()) {
      const state = getCloudConfirmsState(siteId)
      const confirms = await loadCloudConfirms(siteId, state)
      return confirms.find((confirm) => confirm.id === id) || null
    }

    return await db.confirms.get(localRecordKey(id))
  }

  function useConfirmById(id) {
    if (isCloudTrackerEnabled()) {
      const state = getCloudConfirmsState(siteId)
      void loadCloudConfirms(siteId, state)
      return {
        data: computed(() => (state.data.value || []).find((confirm) => confirm.id === id) || null),
        loading: state.loading,
        error: state.error,
      }
    }

    return useLiveQuery(() => db.confirms.get(localRecordKey(id)))
  }

  return {
    confirms,
    addConfirm,
    updateConfirm,
    deleteConfirm,
    getConfirmById,
    useConfirmById,
  }
}
