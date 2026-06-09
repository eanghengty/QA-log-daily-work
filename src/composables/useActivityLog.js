import { computed } from 'vue'
import { db } from '../db/index.js'
import {
  addCloudActivityLog,
  clearCloudActivityLog,
  isCloudTrackerEnabled,
} from '../lib/trackerCloud.js'
import { syncActivityLogFromCloud } from '../lib/activityLogSync.js'
import { getCurrentActivityActor } from './useActivityActor.js'
import { useLiveQuery } from './useLiveQuery.js'

export function useActivityLog() {
  const { data: logs } = useLiveQuery(() =>
    db.activityLog.toArray()
  )
  const sortedLogs = computed(() =>
    [...(logs.value || [])]
      .sort((a, b) => {
        const dateCompare = new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()
        if (dateCompare !== 0) return dateCompare
        return Number(b.id || 0) - Number(a.id || 0)
      })
      .slice(0, 200),
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

  return { logs: sortedLogs, logAction, clearLog, refreshLog: syncActivityLogFromCloud }
}
