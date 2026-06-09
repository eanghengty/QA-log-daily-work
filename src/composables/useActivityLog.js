import { db } from '../db/index.js'
import {
  addCloudActivityLog,
  clearCloudActivityLog,
  isCloudTrackerEnabled,
  listCloudActivityLog,
} from '../lib/trackerCloud.js'
import { getCurrentActivityActor } from './useActivityActor.js'
import { useLiveQuery } from './useLiveQuery.js'

let syncPromise = null

function activityKey(entry) {
  return [
    entry.action || '',
    entry.detail || '',
    entry.userId || '',
    entry.userName || '',
    entry.userEmail || '',
    entry.at || '',
  ].join('\u001f')
}

async function syncActivityLogFromCloud() {
  if (!isCloudTrackerEnabled()) return
  if (syncPromise) return syncPromise

  syncPromise = (async () => {
    try {
      let { activityLog = [] } = await listCloudActivityLog()
      const localLogs = await db.activityLog.orderBy('id').toArray()
      const cloudKeys = new Set(activityLog.map(activityKey))
      const localOnlyLogs = localLogs.filter((entry) => !entry.cloudId && !cloudKeys.has(activityKey(entry)))

      if (localOnlyLogs.length) {
        for (const entry of localOnlyLogs) {
          await addCloudActivityLog({
            action: entry.action || '',
            detail: entry.detail || '',
            userId: entry.userId || '',
            userName: entry.userName || '',
            userEmail: entry.userEmail || '',
            at: entry.at || new Date().toISOString(),
          })
        }

        ;({ activityLog = [] } = await listCloudActivityLog())
      }

      await db.transaction('rw', db.activityLog, async () => {
        await db.activityLog.clear()
        if (activityLog.length) {
          await db.activityLog.bulkAdd(
            activityLog.map((entry) => ({
              cloudId: entry.cloudId || '',
              action: entry.action || '',
              detail: entry.detail || '',
              userId: entry.userId || '',
              userName: entry.userName || '',
              userEmail: entry.userEmail || '',
              at: entry.at || new Date().toISOString(),
            })),
          )
        }
      })
    } catch (error) {
      console.warn('Unable to sync shared activity log.', error)
    } finally {
      syncPromise = null
    }
  })()

  return syncPromise
}

export function useActivityLog() {
  const { data: logs } = useLiveQuery(() =>
    db.activityLog.orderBy('id').reverse().limit(200).toArray()
  )

  void syncActivityLogFromCloud()

  async function logAction(action, detail = '') {
    const entry = {
      action,
      detail,
      ...getCurrentActivityActor(),
      at: new Date().toISOString(),
    }

    if (isCloudTrackerEnabled()) {
      try {
        await addCloudActivityLog(entry)
        await syncActivityLogFromCloud()
        return
      } catch (error) {
        console.warn('Unable to save shared activity log entry.', error)
      }
    }

    await db.activityLog.add(entry)
  }

  async function clearLog() {
    if (isCloudTrackerEnabled()) {
      try {
        await clearCloudActivityLog()
      } catch (error) {
        console.warn('Unable to clear shared activity log.', error)
      }
    }
    await db.activityLog.clear()
  }

  return { logs, logAction, clearLog, refreshLog: syncActivityLogFromCloud }
}
