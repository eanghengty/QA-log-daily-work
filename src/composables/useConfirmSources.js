import { ref, watch } from 'vue'
import { db } from '../db/index.js'
import {
  addCloudConfirmSource,
  deleteCloudConfirmSource,
  isCloudTrackerEnabled,
  listCloudLookups,
} from '../lib/trackerCloud.js'
import { broadcastTrackerChange, useRealtime } from './useRealtime.js'
import { useLiveQuery } from './useLiveQuery.js'

const cloudConfirmSourcesState = {
  data: ref([]),
  loading: ref(true),
  error: ref(null),
  ready: false,
  pending: null,
}

async function loadCloudConfirmSources({ force = false } = {}) {
  if (!force && cloudConfirmSourcesState.ready) return cloudConfirmSourcesState.data.value
  if (cloudConfirmSourcesState.pending) return await cloudConfirmSourcesState.pending

  cloudConfirmSourcesState.loading.value = true
  cloudConfirmSourcesState.pending = listCloudLookups()
    .then(({ confirmSources }) => {
      cloudConfirmSourcesState.data.value = confirmSources || []
      cloudConfirmSourcesState.error.value = null
      cloudConfirmSourcesState.ready = true
      return cloudConfirmSourcesState.data.value
    })
    .catch((error) => {
      cloudConfirmSourcesState.error.value = error
      throw error
    })
    .finally(() => {
      cloudConfirmSourcesState.loading.value = false
      cloudConfirmSourcesState.pending = null
    })

  return await cloudConfirmSourcesState.pending
}

export function useConfirmSources() {
  const liveState = isCloudTrackerEnabled()
    ? {
        data: cloudConfirmSourcesState.data,
        loading: cloudConfirmSourcesState.loading,
        error: cloudConfirmSourcesState.error,
      }
    : useLiveQuery(() =>
        db.confirmSources.toArray().then((rows) => rows.sort((a, b) => a.name.localeCompare(b.name)))
      )

  if (isCloudTrackerEnabled()) {
    void loadCloudConfirmSources()
    const { trackerSyncRefreshToken } = useRealtime()
    watch(
      trackerSyncRefreshToken,
      () => {
        void loadCloudConfirmSources({ force: true })
      },
    )
  }

  const confirmSources = liveState.data

  async function addConfirmSource(name) {
    if (isCloudTrackerEnabled()) {
      const { confirmSource } = await addCloudConfirmSource(name)
      await db.confirmSources.put(confirmSource)
      cloudConfirmSourcesState.data.value = [...(cloudConfirmSourcesState.data.value || []), confirmSource]
        .sort((a, b) => a.name.localeCompare(b.name))
      cloudConfirmSourcesState.error.value = null
      cloudConfirmSourcesState.ready = true
      await broadcastTrackerChange('confirm-source-added')
      return
    }

    await db.confirmSources.add({ name: name.trim() })
  }

  async function deleteConfirmSource(id) {
    if (isCloudTrackerEnabled()) {
      const existingSource = (cloudConfirmSourcesState.data.value || []).find((source) => source.id === id)
      await deleteCloudConfirmSource(existingSource || id)
      await db.confirmSources.delete(id)
      if (existingSource?.name) {
        await db.confirmSources.where('name').equals(existingSource.name).delete()
      }
      cloudConfirmSourcesState.data.value = (cloudConfirmSourcesState.data.value || []).filter((source) => source.id !== id)
      cloudConfirmSourcesState.error.value = null
      cloudConfirmSourcesState.ready = true
      await broadcastTrackerChange('confirm-source-deleted')
      return
    }

    await db.confirmSources.delete(id)
  }

  return { confirmSources, addConfirmSource, deleteConfirmSource }
}
