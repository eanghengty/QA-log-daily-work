import { db } from '../db/index.js'
import { useLiveQuery } from './useLiveQuery.js'

export function useReports(siteId) {
  const { data: reports } = useLiveQuery(() =>
    db.reports.where('siteId').equals(siteId).reverse().toArray()
  )

  async function addReport(report) {
    return await db.reports.add({
      ...report,
      createdAt: new Date().toISOString(),
    })
  }

  async function updateReport(id, updates) {
    return await db.reports.update(id, updates)
  }

  async function deleteReport(id) {
    await db.reports.delete(id)
  }

  async function getReportById(id) {
    return await db.reports.get(Number(id))
  }

  function useReportById(id) {
    return useLiveQuery(() => db.reports.get(Number(id)))
  }

  return {
    reports,
    addReport,
    updateReport,
    deleteReport,
    getReportById,
    useReportById,
  }
}
