import { computed, ref, watch } from 'vue'
import { db } from '../db/index.js'
import {
  createCloudActionItem,
  deleteCloudActionItem,
  isCloudTrackerEnabled,
  listCloudActionItems,
  updateCloudActionItem,
} from '../lib/trackerCloud.js'
import { broadcastTrackerChange, useRealtime } from './useRealtime.js'
import { useLiveQuery } from './useLiveQuery.js'

const cloudActionItemsBySite = new Map()

function createCloudActionItemsState() {
  return {
    data: ref([]),
    loading: ref(true),
    error: ref(null),
    ready: false,
    pending: null,
  }
}

function getCloudActionItemsState(siteId) {
  if (!cloudActionItemsBySite.has(siteId)) {
    cloudActionItemsBySite.set(siteId, createCloudActionItemsState())
  }
  return cloudActionItemsBySite.get(siteId)
}

function localRecordKey(id) {
  const numberId = Number(id)
  return Number.isFinite(numberId) && `${numberId}` === `${id}` ? numberId : id
}

async function loadCloudActionItems(siteId, state, { force = false } = {}) {
  if (!force && state.ready) return state.data.value
  if (state.pending) return await state.pending

  state.loading.value = true
  state.pending = listCloudActionItems(siteId)
    .then(async ({ actionItems }) => {
      state.data.value = actionItems || []
      state.error.value = null
      state.ready = true
      if (actionItems?.length) {
        await db.actionItems.bulkPut(actionItems)
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

export function useActionItems(siteId) {
  const cloudState = isCloudTrackerEnabled() ? getCloudActionItemsState(siteId) : null
  const liveState = isCloudTrackerEnabled()
    ? {
        data: cloudState.data,
        loading: cloudState.loading,
        error: cloudState.error,
      }
    : useLiveQuery(() => db.actionItems.where('siteId').equals(siteId).reverse().toArray())

  if (cloudState) {
    void loadCloudActionItems(siteId, cloudState)
    const { trackerSyncRefreshToken } = useRealtime()
    watch(
      trackerSyncRefreshToken,
      () => {
        void loadCloudActionItems(siteId, cloudState, { force: true })
      },
    )
  }

  const actionItems = liveState.data
  const openActionItems = isCloudTrackerEnabled()
    ? computed(() => (actionItems.value || []).filter((item) => item.status !== 'done'))
    : useLiveQuery(() =>
        db.actionItems
          .where('siteId')
          .equals(siteId)
          .filter((item) => item.status !== 'done')
          .toArray()
      ).data

  async function addActionItem(actionItem) {
    if (isCloudTrackerEnabled()) {
      const { actionItem: savedActionItem } = await createCloudActionItem(actionItem)
      await db.actionItems.put(savedActionItem)
      const state = getCloudActionItemsState(siteId)
      state.data.value = [savedActionItem, ...(state.data.value || [])]
      state.error.value = null
      state.ready = true
      state.loading.value = false
      await broadcastTrackerChange('action-item-added')
      return savedActionItem.id
    }

    const siteItems = await db.actionItems.where('siteId').equals(actionItem.siteId).toArray()
    const lastNum = siteItems.reduce((max, item) => {
      const num = Number.parseInt(item.code?.split('-')[1], 10)
      return Number.isFinite(num) ? Math.max(max, num) : max
    }, 99)
    const code = `A-${lastNum + 1}`

    return await db.actionItems.add({
      ...actionItem,
      code,
      createdAt: new Date().toISOString(),
    })
  }

  async function updateActionItem(id, updates) {
    if (isCloudTrackerEnabled()) {
      const { actionItem } = await updateCloudActionItem(id, updates)
      await db.actionItems.put(actionItem)
      const state = getCloudActionItemsState(siteId)
      state.data.value = (state.data.value || []).map((row) => (row.id === id ? actionItem : row))
      state.error.value = null
      await broadcastTrackerChange('action-item-updated')
      return 1
    }

    return await db.actionItems.update(id, updates)
  }

  async function deleteActionItem(id) {
    if (isCloudTrackerEnabled()) {
      await deleteCloudActionItem(id)
      await db.actionItems.delete(id)
      const state = getCloudActionItemsState(siteId)
      state.data.value = (state.data.value || []).filter((row) => row.id !== id)
      state.error.value = null
      await broadcastTrackerChange('action-item-deleted')
      return
    }

    await db.actionItems.delete(id)
  }

  function useActionItemById(id) {
    if (isCloudTrackerEnabled()) {
      const state = getCloudActionItemsState(siteId)
      void loadCloudActionItems(siteId, state)
      return {
        data: computed(() => (state.data.value || []).find((item) => item.id === id) || null),
        loading: state.loading,
        error: state.error,
      }
    }

    return useLiveQuery(() => db.actionItems.get(localRecordKey(id)))
  }

  return {
    actionItems,
    openActionItems,
    addActionItem,
    updateActionItem,
    deleteActionItem,
    useActionItemById,
  }
}
