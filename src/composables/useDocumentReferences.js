import { computed } from 'vue'
import { db } from '../db/index.js'
import { useLiveQuery } from './useLiveQuery.js'

export function useDocumentReferences(siteId) {
  const { data: documentReferences } = useLiveQuery(() =>
    db.documentReferences
      .where('siteId')
      .equals(siteId)
      .reverse()
      .sortBy('createdAt')
  )

  const count = computed(() => documentReferences.value?.length || 0)

  async function addDocumentReference(values) {
    return await db.documentReferences.add({
      siteId,
      title: values.title.trim(),
      link: values.link.trim(),
      createdAt: new Date().toISOString(),
    })
  }

  async function deleteDocumentReference(id) {
    await db.documentReferences.delete(Number(id))
  }

  return {
    documentReferences,
    count,
    addDocumentReference,
    deleteDocumentReference,
  }
}
