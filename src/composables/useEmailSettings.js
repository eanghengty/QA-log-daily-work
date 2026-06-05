import { ref, watch } from 'vue'
import { db } from '../db/index.js'
import {
  getCloudEmailSettings,
  isCloudTrackerEnabled,
  saveCloudEmailSettings,
} from '../lib/trackerCloud.js'
import { broadcastTrackerChange, useRealtime } from './useRealtime.js'
import { useLiveQuery } from './useLiveQuery.js'

const DEFAULTS = { to: '', cc: '', defaultSubject: '' }
const cloudEmailSettingsBySite = new Map()

function createCloudEmailSettingsState(siteId) {
  return {
    data: ref({ ...DEFAULTS, siteId }),
    loading: ref(true),
    error: ref(null),
    ready: false,
    pending: null,
  }
}

function getCloudEmailSettingsState(siteId) {
  if (!cloudEmailSettingsBySite.has(siteId)) {
    cloudEmailSettingsBySite.set(siteId, createCloudEmailSettingsState(siteId))
  }
  return cloudEmailSettingsBySite.get(siteId)
}

async function loadCloudEmailSettingsState(siteId, state, { force = false } = {}) {
  if (!force && state.ready) return state.data.value
  if (state.pending) return await state.pending

  state.loading.value = true
  state.pending = getCloudEmailSettings(siteId)
    .then(({ emailSettings }) => {
      state.data.value = emailSettings ?? { ...DEFAULTS, siteId }
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

export function useEmailSettings() {
  function useLiveEmailSettings(siteId) {
    if (isCloudTrackerEnabled()) {
      const state = getCloudEmailSettingsState(siteId)
      void loadCloudEmailSettingsState(siteId, state)
      const { trackerSyncRefreshToken } = useRealtime()
      watch(
        trackerSyncRefreshToken,
        () => {
          void loadCloudEmailSettingsState(siteId, state, { force: true })
        },
      )
      return {
        data: state.data,
        loading: state.loading,
        error: state.error,
      }
    }

    return useLiveQuery(
      () => db.emailSettings.get(siteId).then((rec) => rec ?? { ...DEFAULTS, siteId }),
      [siteId],
    )
  }

  async function getEmailSettings(siteId) {
    if (isCloudTrackerEnabled()) {
      const state = getCloudEmailSettingsState(siteId)
      return await loadCloudEmailSettingsState(siteId, state)
    }

    const rec = await db.emailSettings.get(siteId)
    return rec ?? { ...DEFAULTS, siteId }
  }

  async function saveEmailSettings(siteId, { to, cc, defaultSubject }) {
    if (isCloudTrackerEnabled()) {
      const { emailSettings } = await saveCloudEmailSettings({
        siteId,
        to,
        cc,
        defaultSubject,
      })
      const state = getCloudEmailSettingsState(siteId)
      state.data.value = emailSettings ?? { ...DEFAULTS, siteId }
      state.error.value = null
      state.ready = true
      state.loading.value = false
      await broadcastTrackerChange('email-settings-saved')
      return
    }

    await db.emailSettings.put({ siteId, to, cc, defaultSubject })
  }

  return { useLiveEmailSettings, getEmailSettings, saveEmailSettings }
}
