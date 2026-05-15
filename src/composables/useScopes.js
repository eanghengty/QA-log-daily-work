import { db } from '../db/index.js'
import { useLiveQuery } from './useLiveQuery.js'

export function useScopes() {
  const { data: scopes } = useLiveQuery(() =>
    db.scopes.toArray().then((rows) => rows.sort((a, b) => a.name.localeCompare(b.name)))
  )

  async function addScope(name) {
    await db.scopes.add({ name: name.trim() })
  }

  async function deleteScope(id) {
    await db.scopes.delete(id)
  }

  return { scopes, addScope, deleteScope }
}
