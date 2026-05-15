import { db } from '../db/index.js'
import { useLiveQuery } from './useLiveQuery.js'

export function useConfirmSources() {
  const { data: confirmSources } = useLiveQuery(() =>
    db.confirmSources.toArray().then((rows) => rows.sort((a, b) => a.name.localeCompare(b.name)))
  )
  async function addConfirmSource(name) { await db.confirmSources.add({ name: name.trim() }) }
  async function deleteConfirmSource(id) { await db.confirmSources.delete(id) }
  return { confirmSources, addConfirmSource, deleteConfirmSource }
}
