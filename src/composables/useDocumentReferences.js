import { computed, ref, watch } from 'vue'
import { db } from '../db/index.js'
import {
  addCloudDocumentReference,
  deleteCloudDocumentReference,
  isCloudTrackerEnabled,
  listCloudDocumentReferences,
} from '../lib/trackerCloud.js'
import { broadcastTrackerChange, useRealtime } from './useRealtime.js'
import { useLiveQuery } from './useLiveQuery.js'

const cloudDocumentReferencesBySite = new Map()

function createCloudDocumentReferenceState() {
  return {
    data: ref([]),
    loading: ref(true),
    error: ref(null),
    ready: false,
    pending: null,
  }
}

function getCloudDocumentReferenceState(siteId) {
  if (!cloudDocumentReferencesBySite.has(siteId)) {
    cloudDocumentReferencesBySite.set(siteId, createCloudDocumentReferenceState())
  }
  return cloudDocumentReferencesBySite.get(siteId)
}

async function loadCloudDocumentReferenceState(siteId, state, { force = false } = {}) {
  if (!force && state.ready) return state.data.value
  if (state.pending) return await state.pending

  state.loading.value = true
  state.pending = listCloudDocumentReferences(siteId)
    .then(({ documentReferences }) => {
      state.data.value = documentReferences || []
      state.error.value = null
      state.ready = true
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

export function useDocumentReferences(siteId) {
  const cloudState = isCloudTrackerEnabled() ? getCloudDocumentReferenceState(siteId) : null
  const liveState = isCloudTrackerEnabled()
    ? {
        data: cloudState.data,
        loading: cloudState.loading,
        error: cloudState.error,
      }
    : useLiveQuery(() =>
        db.documentReferences
          .where('siteId')
          .equals(siteId)
          .reverse()
          .sortBy('createdAt')
      )

  if (cloudState) {
    void loadCloudDocumentReferenceState(siteId, cloudState)
    const { trackerSyncRefreshToken } = useRealtime()
    watch(
      trackerSyncRefreshToken,
      () => {
        void loadCloudDocumentReferenceState(siteId, cloudState, { force: true })
      },
    )
  }

  const documentReferences = liveState.data

  const count = computed(() => documentReferences.value?.length || 0)

  async function addDocumentReference(values) {
    if (isCloudTrackerEnabled()) {
      const { documentReference } = await addCloudDocumentReference({
        siteId,
        title: values.title.trim(),
        link: values.link.trim(),
      })
      const state = getCloudDocumentReferenceState(siteId)
      state.data.value = [documentReference, ...(state.data.value || [])]
      state.error.value = null
      state.ready = true
      state.loading.value = false
      await broadcastTrackerChange('document-reference-added')
      return documentReference?.id
    }

    return await db.documentReferences.add({
      siteId,
      title: values.title.trim(),
      link: values.link.trim(),
      createdAt: new Date().toISOString(),
    })
  }

  async function deleteDocumentReference(id) {
    if (isCloudTrackerEnabled()) {
      await deleteCloudDocumentReference(id)
      const state = getCloudDocumentReferenceState(siteId)
      state.data.value = (state.data.value || []).filter((reference) => reference.id !== id)
      state.error.value = null
      await broadcastTrackerChange('document-reference-deleted')
      return
    }

    await db.documentReferences.delete(Number(id))
  }

  return {
    documentReferences,
    count,
    addDocumentReference,
    deleteDocumentReference,
  }
}
