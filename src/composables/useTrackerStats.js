import { computed } from 'vue'
import { db } from '../db/index.js'
import { useLiveQuery } from './useLiveQuery.js'

export function useTrackerStats() {
  const { data: issues } = useLiveQuery(() => db.issues.toArray())
  const { data: confirms } = useLiveQuery(() => db.confirms.toArray())
  const { data: reports } = useLiveQuery(() => db.reports.toArray())

  const pendingTotal = computed(() =>
    issues.value?.filter((issue) => issue.status === 'open').length || 0
  )

  const confirmsTotal = computed(() => confirms.value?.length || 0)

  const reportsThisWeek = computed(() =>
    reports.value?.filter((report) => isInCurrentWeek(report.date)).length || 0
  )

  const sitesUpdatedThisWeek = computed(() => {
    const siteIds = new Set(
      reports.value
        ?.filter((report) => isInCurrentWeek(report.date))
        .map((report) => report.siteId) || []
    )
    return siteIds.size
  })

  return {
    issues,
    confirms,
    reports,
    pendingTotal,
    confirmsTotal,
    reportsThisWeek,
    sitesUpdatedThisWeek,
  }
}

function isInCurrentWeek(dateString) {
  if (!dateString) return false

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return false

  const now = new Date()
  const start = new Date(now)
  const day = start.getDay()
  const diff = start.getDate() - day + (day === 0 ? -6 : 1)
  start.setDate(diff)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(start.getDate() + 7)

  return date >= start && date < end
}
