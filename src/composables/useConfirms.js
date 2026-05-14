import { db } from '../db/index.js'
import { useLiveQuery } from './useLiveQuery.js'

export function useConfirms(siteId) {
  const { data: confirms } = useLiveQuery(() =>
    db.confirms.where('siteId').equals(siteId).reverse().toArray()
  )

  async function addConfirm(confirm) {
    const siteConfirms = await db.confirms
      .where('siteId')
      .equals(confirm.siteId)
      .toArray()

    const lastNum = siteConfirms.reduce((max, item) => {
      const num = Number.parseInt(item.code?.split('-')[1], 10)
      return Number.isFinite(num) ? Math.max(max, num) : max
    }, 99)
    const nextNum = lastNum + 1
    const code = `C-${nextNum}`

    return await db.confirms.add({
      ...confirm,
      code,
      createdAt: new Date().toISOString(),
    })
  }

  async function updateConfirm(id, updates) {
    return await db.confirms.update(id, updates)
  }

  async function deleteConfirm(id) {
    await db.confirms.delete(id)
  }

  async function getConfirmById(id) {
    return await db.confirms.get(Number(id))
  }

  function useConfirmById(id) {
    return useLiveQuery(() => db.confirms.get(Number(id)))
  }

  return {
    confirms,
    addConfirm,
    updateConfirm,
    deleteConfirm,
    getConfirmById,
    useConfirmById,
  }
}
