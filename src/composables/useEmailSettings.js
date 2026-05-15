import { db } from '../db/index.js'
import { useLiveQuery } from './useLiveQuery.js'

const DEFAULTS = { to: '', cc: '', defaultSubject: '' }

export function useEmailSettings() {
  function useLiveEmailSettings(siteId) {
    return useLiveQuery(
      () => db.emailSettings.get(siteId).then((rec) => rec ?? { ...DEFAULTS, siteId }),
      [siteId],
    )
  }

  async function getEmailSettings(siteId) {
    const rec = await db.emailSettings.get(siteId)
    return rec ?? { ...DEFAULTS, siteId }
  }

  async function saveEmailSettings(siteId, { to, cc, defaultSubject }) {
    await db.emailSettings.put({ siteId, to, cc, defaultSubject })
  }

  return { useLiveEmailSettings, getEmailSettings, saveEmailSettings }
}
