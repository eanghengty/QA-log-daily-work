import { db } from '../db/index.js'
import { getCurrentActivityActor } from './useActivityActor.js'
import { useLiveQuery } from './useLiveQuery.js'

export function useActivityLog() {
  const { data: logs } = useLiveQuery(() =>
    db.activityLog.orderBy('id').reverse().limit(200).toArray()
  )

  async function logAction(action, detail = '') {
    await db.activityLog.add({
      action,
      detail,
      ...getCurrentActivityActor(),
      at: new Date().toISOString(),
    })
  }

  async function clearLog() {
    await db.activityLog.clear()
  }

  return { logs, logAction, clearLog }
}
