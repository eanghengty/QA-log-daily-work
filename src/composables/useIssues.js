import { db } from '../db/index.js'
import { useLiveQuery } from './useLiveQuery.js'

export function useIssues(siteId) {
  const { data: issues } = useLiveQuery(() =>
    db.issues.where('siteId').equals(siteId).toArray()
  )

  const { data: pendingIssues } = useLiveQuery(() =>
    db.issues
      .where('siteId')
      .equals(siteId)
      .filter((i) => i.status === 'open')
      .toArray()
  )

  async function addIssue(issue) {
    const siteIssues = await db.issues
      .where('siteId')
      .equals(issue.siteId)
      .toArray()

    const lastNum = siteIssues.reduce((max, item) => {
      const num = Number.parseInt(item.code?.split('-')[1], 10)
      return Number.isFinite(num) ? Math.max(max, num) : max
    }, 199)
    const nextNum = lastNum + 1
    const code = `I-${nextNum}`

    return await db.issues.add({
      ...issue,
      code,
      createdAt: new Date().toISOString(),
    })
  }

  async function updateIssue(id, updates) {
    return await db.issues.update(id, updates)
  }

  async function deleteIssue(id) {
    await db.issues.delete(id)
  }

  async function getIssueById(id) {
    return await db.issues.get(Number(id))
  }

  function useIssueById(id) {
    return useLiveQuery(() => db.issues.get(Number(id)))
  }

  return {
    issues,
    pendingIssues,
    addIssue,
    updateIssue,
    deleteIssue,
    getIssueById,
    useIssueById,
  }
}
