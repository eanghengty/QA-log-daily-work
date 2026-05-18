import { computed } from 'vue'
import { db } from '../db/index.js'
import { useLiveQuery } from './useLiveQuery.js'

export const CHECKLIST_STATUS = {
  TODO: 'todo',
  DONE: 'done',
  NA: 'na',
}

export function useChecklists(siteId) {
  const { data: checklists } = useLiveQuery(() =>
    db.checklists.where('siteId').equals(siteId).sortBy('order')
  )

  const summary = computed(() => summarizeChecklists(checklists.value || []))

  async function addChecklist(checklist) {
    const siteChecklists = await db.checklists.where('siteId').equals(checklist.siteId).toArray()
    const nextOrder =
      siteChecklists.reduce((max, item) => Math.max(max, Number(item.order) || 0), 0) + 1

    return await db.checklists.add({
      siteId: checklist.siteId,
      title: checklist.title.trim(),
      order: nextOrder,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  async function updateChecklist(id, updates) {
    return await db.checklists.update(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    })
  }

  async function deleteChecklist(id) {
    await db.checklists.delete(id)
  }

  async function renameChecklist(id, title) {
    return await updateChecklist(id, { title: title.trim() })
  }

  async function addSubItem(checklistId, title) {
    const checklist = await db.checklists.get(Number(checklistId))
    if (!checklist) return

    const items = [
      ...(checklist.items || []),
      {
        id: createItemId(),
        title: title.trim(),
        status: CHECKLIST_STATUS.TODO,
      },
    ]

    return await updateChecklist(checklist.id, { items })
  }

  async function updateSubItem(checklistId, itemId, updates) {
    const checklist = await db.checklists.get(Number(checklistId))
    if (!checklist) return

    const items = (checklist.items || []).map((item) =>
      item.id === itemId ? { ...item, ...updates } : item
    )

    return await updateChecklist(checklist.id, { items })
  }

  async function renameSubItem(checklistId, itemId, title) {
    return await updateSubItem(checklistId, itemId, { title: title.trim() })
  }

  async function setSubItemStatus(checklistId, itemId, status) {
    return await updateSubItem(checklistId, itemId, {
      status: normalizeStatus(status),
    })
  }

  async function deleteSubItem(checklistId, itemId) {
    const checklist = await db.checklists.get(Number(checklistId))
    if (!checklist) return

    const items = (checklist.items || []).filter((item) => item.id !== itemId)
    return await updateChecklist(checklist.id, { items })
  }

  async function importChecklistGroups(groups) {
    const summary = {
      processedChecklists: 0,
      addedChecklists: 0,
      updatedChecklists: 0,
      addedSubItems: 0,
      skippedSubItems: 0,
    }

    await db.transaction('rw', db.checklists, async () => {
      const siteChecklists = await db.checklists.where('siteId').equals(siteId).sortBy('order')
      const checklistMap = new Map(
        siteChecklists.map((checklist) => [normalizeKey(checklist.title), checklist])
      )
      let nextOrder =
        siteChecklists.reduce((max, checklist) => Math.max(max, Number(checklist.order) || 0), 0) +
        1

      for (const group of groups) {
        const title = group.title?.trim()
        if (!title) continue
        summary.processedChecklists += 1

        const existing = checklistMap.get(normalizeKey(title))
        const normalizedItems = uniqueTitles(group.items || [])

        if (existing) {
          const existingItemKeys = new Set((existing.items || []).map((item) => normalizeKey(item.title)))
          const freshItems = normalizedItems
            .filter((itemTitle) => !existingItemKeys.has(normalizeKey(itemTitle)))
            .map((itemTitle) => ({
              id: createItemId(),
              title: itemTitle,
              status: CHECKLIST_STATUS.TODO,
            }))

          summary.skippedSubItems += normalizedItems.length - freshItems.length

          if (freshItems.length) {
            const items = [...(existing.items || []), ...freshItems]
            const updatedChecklist = {
              ...existing,
              items,
              updatedAt: new Date().toISOString(),
            }
            await db.checklists.put(updatedChecklist)
            checklistMap.set(normalizeKey(title), updatedChecklist)
            summary.updatedChecklists += 1
            summary.addedSubItems += freshItems.length
          }
          continue
        }

        const newChecklist = {
          siteId,
          title,
          order: nextOrder,
          items: normalizedItems.map((itemTitle) => ({
            id: createItemId(),
            title: itemTitle,
            status: CHECKLIST_STATUS.TODO,
          })),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        const insertedId = await db.checklists.add(newChecklist)
        checklistMap.set(normalizeKey(title), { ...newChecklist, id: insertedId })
        nextOrder += 1
        summary.addedChecklists += 1
        summary.addedSubItems += normalizedItems.length
      }
    })

    return summary
  }

  return {
    checklists,
    summary,
    addChecklist,
    updateChecklist,
    deleteChecklist,
    renameChecklist,
    addSubItem,
    renameSubItem,
    setSubItemStatus,
    deleteSubItem,
    importChecklistGroups,
  }
}

export function summarizeChecklists(checklists) {
  const items = checklists.flatMap((checklist) => checklist.items || [])
  return summarizeChecklistItems(items, checklists.length)
}

export function summarizeChecklistItems(items, checklistCount = null) {
  const summary = items.reduce(
    (totals, item) => {
      const status = normalizeStatus(item.status)
      if (status === CHECKLIST_STATUS.DONE) totals.done += 1
      else if (status === CHECKLIST_STATUS.NA) totals.na += 1
      else totals.todo += 1
      return totals
    },
    {
      checklistCount,
      done: 0,
      todo: 0,
      na: 0,
      total: items.length,
      applicable: 0,
      completion: 0,
    }
  )

  summary.applicable = summary.done + summary.todo
  summary.completion = summary.applicable
    ? Math.round((summary.done / summary.applicable) * 100)
    : 0

  return summary
}

function normalizeStatus(status) {
  if (status === CHECKLIST_STATUS.DONE || status === CHECKLIST_STATUS.NA) {
    return status
  }
  return CHECKLIST_STATUS.TODO
}

function createItemId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `item-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function uniqueTitles(items) {
  const seen = new Set()
  const unique = []

  for (const item of items) {
    const title = String(item || '').trim()
    if (!title) continue

    const key = normalizeKey(title)
    if (seen.has(key)) continue

    seen.add(key)
    unique.push(title)
  }

  return unique
}
