import { ref, watch } from 'vue'
import { db } from '../db/index.js'
import {
  addCloudScope,
  deleteCloudScope,
  isCloudTrackerEnabled,
  listCloudLookups,
} from '../lib/trackerCloud.js'
import { broadcastTrackerChange, useRealtime } from './useRealtime.js'
import { useLiveQuery } from './useLiveQuery.js'

const cloudScopesState = {
  data: ref([]),
  loading: ref(true),
  error: ref(null),
  ready: false,
  pending: null,
}

async function loadCloudScopes({ force = false } = {}) {
  if (!force && cloudScopesState.ready) return cloudScopesState.data.value
  if (cloudScopesState.pending) return await cloudScopesState.pending

  cloudScopesState.loading.value = true
  cloudScopesState.pending = listCloudLookups()
    .then(({ scopes }) => {
      cloudScopesState.data.value = scopes || []
      cloudScopesState.error.value = null
      cloudScopesState.ready = true
      return cloudScopesState.data.value
    })
    .catch((error) => {
      cloudScopesState.error.value = error
      throw error
    })
    .finally(() => {
      cloudScopesState.loading.value = false
      cloudScopesState.pending = null
    })

  return await cloudScopesState.pending
}

export function useScopes() {
  const liveState = isCloudTrackerEnabled()
    ? {
        data: cloudScopesState.data,
        loading: cloudScopesState.loading,
        error: cloudScopesState.error,
      }
    : useLiveQuery(() =>
        db.scopes.toArray().then((rows) => rows.sort((a, b) => a.name.localeCompare(b.name)))
      )

  if (isCloudTrackerEnabled()) {
    void loadCloudScopes()
    const { trackerSyncRefreshToken } = useRealtime()
    watch(
      trackerSyncRefreshToken,
      () => {
        void loadCloudScopes({ force: true })
      },
    )
  }

  const scopes = liveState.data

  async function addScope(name) {
    if (isCloudTrackerEnabled()) {
      const { scope } = await addCloudScope(name)
      await db.scopes.put(scope)
      cloudScopesState.data.value = [...(cloudScopesState.data.value || []), scope]
        .sort((a, b) => a.name.localeCompare(b.name))
      cloudScopesState.error.value = null
      cloudScopesState.ready = true
      await broadcastTrackerChange('scope-added')
      return
    }

    await db.scopes.add({ name: name.trim() })
  }

  async function deleteScope(id) {
    if (isCloudTrackerEnabled()) {
      const existingScope = (cloudScopesState.data.value || []).find((scope) => scope.id === id)
      await deleteCloudScope(existingScope || id)
      await db.scopes.delete(id)
      if (existingScope?.name) {
        await db.scopes.where('name').equals(existingScope.name).delete()
      }
      cloudScopesState.data.value = (cloudScopesState.data.value || []).filter((scope) => scope.id !== id)
      cloudScopesState.error.value = null
      cloudScopesState.ready = true
      await broadcastTrackerChange('scope-deleted')
      return
    }

    await db.scopes.delete(id)
  }

  return { scopes, addScope, deleteScope }
}
