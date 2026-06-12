import { computed, watch } from 'vue'
import { db } from '../db/index.js'
import { useLiveQuery } from './useLiveQuery.js'
import {
  normalizeChecklistCustomColumns,
  normalizeChecklistFieldValue,
} from '../lib/checklistColumns.js'
import {
  createCloudMirrorRecordId,
  ensureCloudBoardMirror,
  isCloudBoardMirrorEnabled,
  localRecordKey,
  saveCloudBoardMirror,
} from '../lib/cloudBoardMirror.js'
import { broadcastTrackerChange, useRealtime } from './useRealtime.js'
import { getCurrentActivityActor } from './useActivityActor.js'

export const CHECKLIST_STATUS = {
  TODO: 'todo',
  DONE: 'done',
  NA: 'na',
}

export function useChecklists(siteId) {
  setupCloudBoardMirror(siteId)

  const { data: checklists } = useLiveQuery(() =>
    db.checklists.where('siteId').equals(siteId).sortBy('order')
  )

  const summary = computed(() => summarizeChecklists(checklists.value || []))

  async function addChecklist(checklist) {
    await assertChecklistTitleUnique(checklist.siteId, checklist.title)

    const siteChecklists = await db.checklists.where('siteId').equals(checklist.siteId).toArray()
    const nextOrder =
      siteChecklists.reduce((max, item) => Math.max(max, Number(item.order) || 0), 0) + 1

    const record = {
      ...(isCloudBoardMirrorEnabled() ? { id: createCloudMirrorRecordId() } : {}),
      siteId: checklist.siteId,
      title: checklist.title.trim(),
      description: checklist.description?.trim() || '',
      order: nextOrder,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const id = await db.checklists.add(record)
    await persistCloudBoard(siteId, 'site-checklist-added')
    return id
  }

  async function updateChecklist(id, updates) {
    const result = await db.checklists.update(localRecordKey(id), {
      ...updates,
      updatedAt: new Date().toISOString(),
    })
    await persistCloudBoard(siteId, 'site-checklist-updated')
    return result
  }

  async function deleteChecklist(id) {
    await db.checklists.delete(localRecordKey(id))
    await persistCloudBoard(siteId, 'site-checklist-deleted')
  }

  async function renameChecklist(id, title) {
    const checklist = await db.checklists.get(localRecordKey(id))
    if (!checklist) return

    await assertChecklistTitleUnique(checklist.siteId, title, checklist.id)
    return await updateChecklist(id, { title: title.trim() })
  }

  async function addSubItem(checklistId, title, customColumns = []) {
    const checklist = await db.checklists.get(localRecordKey(checklistId))
    if (!checklist) return

    const items = [
      ...(checklist.items || []),
      {
        id: createItemId(),
        title: title.trim(),
        status: CHECKLIST_STATUS.TODO,
        comment: '',
        statusHistory: [],
        fieldValues: createEmptyFieldValues(customColumns),
      },
    ]

    return await updateChecklist(checklist.id, { items })
  }

  async function updateSubItem(checklistId, itemId, updates) {
    const checklist = await db.checklists.get(localRecordKey(checklistId))
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
    const checklist = await db.checklists.get(localRecordKey(checklistId))
    if (!checklist) return

    const nextStatus = normalizeStatus(status)
    const items = (checklist.items || []).map((item) => {
      if (item.id !== itemId) return item

      const previousStatus = normalizeStatus(item.status)
      if (previousStatus === nextStatus) return item

      return {
        ...item,
        status: nextStatus,
        statusHistory: [
          ...(Array.isArray(item.statusHistory) ? item.statusHistory : []),
          createStatusHistoryEntry(previousStatus, nextStatus),
        ],
      }
    })

    return await updateChecklist(checklist.id, { items })
  }

  async function setSubItemComment(checklistId, itemId, comment) {
    return await updateSubItem(checklistId, itemId, {
      comment: String(comment || '').trim(),
    })
  }

  async function addChildSubItem(checklistId, itemId, title) {
    const checklist = await db.checklists.get(localRecordKey(checklistId))
    if (!checklist) return

    const childTitle = String(title || '').trim()
    if (!childTitle) return

    const items = addChildItemById(checklist.items || [], itemId, childTitle)

    return await updateChecklist(checklist.id, { items })
  }

  async function renameChildSubItem(checklistId, itemId, childItemId, title) {
    const childTitle = String(title || '').trim()
    if (!childTitle) return

    return await updateChildSubItem(checklistId, itemId, childItemId, { title: childTitle })
  }

  async function setChildSubItemStatus(checklistId, itemId, childItemId, status) {
    const checklist = await db.checklists.get(localRecordKey(checklistId))
    if (!checklist) return

    const nextStatus = normalizeStatus(status)
    const items = updateNestedItemById(checklist.items || [], childItemId, (childItem) => {
      const previousStatus = normalizeStatus(childItem.status)
      if (previousStatus === nextStatus) return childItem

      return {
        ...childItem,
        status: nextStatus,
        statusHistory: [
          ...(Array.isArray(childItem.statusHistory) ? childItem.statusHistory : []),
          createStatusHistoryEntry(previousStatus, nextStatus),
        ],
      }
    })

    return await updateChecklist(checklist.id, { items })
  }

  async function updateChildSubItem(checklistId, itemId, childItemId, updates) {
    const checklist = await db.checklists.get(localRecordKey(checklistId))
    if (!checklist) return

    const items = updateNestedItemById(checklist.items || [], childItemId, (childItem) => ({
      ...childItem,
      ...updates,
    }))

    return await updateChecklist(checklist.id, { items })
  }

  async function deleteChildSubItem(checklistId, itemId, childItemId) {
    const checklist = await db.checklists.get(localRecordKey(checklistId))
    if (!checklist) return

    const items = deleteNestedItemById(checklist.items || [], childItemId)

    return await updateChecklist(checklist.id, { items })
  }

  async function setSubItemFieldValue(checklistId, itemId, column, value) {
    const checklist = await db.checklists.get(localRecordKey(checklistId))
    if (!checklist) return

    const items = (checklist.items || []).map((item) => {
      if (item.id !== itemId) return item

      return {
        ...item,
        fieldValues: {
          ...(item.fieldValues || {}),
          [column.id]: normalizeChecklistFieldValue(value, column.type),
        },
      }
    })

    return await updateChecklist(checklist.id, { items })
  }

  async function deleteSubItem(checklistId, itemId) {
    const checklist = await db.checklists.get(localRecordKey(checklistId))
    if (!checklist) return

    const items = (checklist.items || []).filter((item) => item.id !== itemId)
    return await updateChecklist(checklist.id, { items })
  }

  async function importChecklistGroups(groups, customColumns = []) {
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
      const normalizedCustomColumns = normalizeChecklistCustomColumns(customColumns)

      for (const group of groups) {
        const title = group.title?.trim()
        if (!title) continue
        summary.processedChecklists += 1

        const existing = checklistMap.get(normalizeKey(title))
        const normalizedItems = uniqueItems(group.items || [])

        if (existing) {
          const existingItemKeys = new Set((existing.items || []).map((item) => normalizeKey(item.title)))
          const freshItems = normalizedItems
            .filter((item) => !existingItemKeys.has(normalizeKey(item.title)))
            .map((item) => ({
              id: createItemId(),
              title: item.title,
              status: normalizeStatus(item.status),
              comment: String(item.comment || '').trim(),
              statusHistory: [],
              fieldValues: normalizeItemFieldValues(item.fieldValues, normalizedCustomColumns),
              childItems: normalizeImportedChildItems(item.childItems, normalizedCustomColumns),
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
          items: normalizedItems.map((item) => ({
            id: createItemId(),
            title: item.title,
            status: normalizeStatus(item.status),
            comment: String(item.comment || '').trim(),
            statusHistory: [],
            fieldValues: normalizeItemFieldValues(item.fieldValues, normalizedCustomColumns),
            childItems: normalizeImportedChildItems(item.childItems, normalizedCustomColumns),
          })),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        if (isCloudBoardMirrorEnabled()) {
          newChecklist.id = createCloudMirrorRecordId()
        }
        const insertedId = await db.checklists.add(newChecklist)
        checklistMap.set(normalizeKey(title), { ...newChecklist, id: insertedId })
        nextOrder += 1
        summary.addedChecklists += 1
        summary.addedSubItems += normalizedItems.length
      }
    })

    await persistCloudBoard(siteId, 'site-checklists-imported')
    return summary
  }

  async function reorderChecklists(orderedIds) {
    const ids = orderedIds
      .map((id) => localRecordKey(id))
      .filter((id) => id !== null && id !== undefined && id !== '')

    if (!ids.length) return

    await db.transaction('rw', db.checklists, async () => {
      for (let index = 0; index < ids.length; index += 1) {
        await db.checklists.update(ids[index], {
          order: index + 1,
          updatedAt: new Date().toISOString(),
        })
      }
    })
    await persistCloudBoard(siteId, 'site-checklists-reordered')
  }

  async function duplicateChecklist(id, newTitle) {
    const checklist = await db.checklists.get(localRecordKey(id))
    if (!checklist) return

    await assertChecklistTitleUnique(checklist.siteId, newTitle)

    const siteChecklists = await db.checklists.where('siteId').equals(checklist.siteId).toArray()
    const nextOrder =
      siteChecklists.reduce((max, item) => Math.max(max, Number(item.order) || 0), 0) + 1

    const record = {
      ...(isCloudBoardMirrorEnabled() ? { id: createCloudMirrorRecordId() } : {}),
      siteId: checklist.siteId,
      title: newTitle.trim(),
      description: checklist.description || '',
      order: nextOrder,
      items: (checklist.items || []).map((item) => ({
        id: createItemId(),
        title: item.title,
        status: item.status || CHECKLIST_STATUS.TODO,
        comment: item.comment || '',
        statusHistory: [],
        fieldValues: { ...(item.fieldValues || {}) },
        childItems: cloneChildItems(item.childItems),
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const newId = await db.checklists.add(record)
    await persistCloudBoard(siteId, 'site-checklist-duplicated')
    return newId
  }

  async function removeCustomColumnValues(columnId) {
    if (!columnId) return

    await db.transaction('rw', db.checklists, async () => {
      const siteChecklists = await db.checklists.where('siteId').equals(siteId).toArray()

      for (const checklist of siteChecklists) {
        const items = (checklist.items || []).map((item) => {
          if (!item.fieldValues || !(columnId in item.fieldValues)) return item

          const nextFieldValues = { ...item.fieldValues }
          delete nextFieldValues[columnId]

          return {
            ...item,
            fieldValues: nextFieldValues,
          }
        })

        await db.checklists.update(localRecordKey(checklist.id), {
          items,
          updatedAt: new Date().toISOString(),
        })
      }
    })
    await persistCloudBoard(siteId, 'site-checklist-custom-columns-updated')
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
    setSubItemComment,
    setSubItemFieldValue,
    addChildSubItem,
    renameChildSubItem,
    setChildSubItemStatus,
    deleteChildSubItem,
    deleteSubItem,
    importChecklistGroups,
    reorderChecklists,
    duplicateChecklist,
    removeCustomColumnValues,
  }
}

function setupCloudBoardMirror(siteId) {
  if (!isCloudBoardMirrorEnabled()) return

  void ensureCloudBoardMirror('siteChecklist', siteId)
  const { trackerSyncRefreshToken } = useRealtime()
  watch(trackerSyncRefreshToken, () => {
    void ensureCloudBoardMirror('siteChecklist', siteId, { force: true })
  })
}

async function persistCloudBoard(siteId, eventName) {
  if (!isCloudBoardMirrorEnabled()) return

  await saveCloudBoardMirror('siteChecklist', siteId)
  await broadcastTrackerChange(eventName)
}

export function summarizeChecklists(checklists) {
  const items = checklists.flatMap((checklist) => flattenChecklistItems(checklist.items || []))
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

function flattenChecklistItems(items) {
  return (items || []).flatMap((item) => {
    const childItems = Array.isArray(item.childItems) ? item.childItems : []
    return childItems.length ? flattenChecklistItems(childItems) : [item]
  })
}

function addChildItemById(items, targetId, title) {
  return (items || []).map((item) => {
    if (item.id === targetId) {
      return {
        ...item,
        childItems: [
          ...(Array.isArray(item.childItems) ? item.childItems : []),
          {
            id: createItemId(),
            title,
            status: CHECKLIST_STATUS.TODO,
            statusHistory: [],
            childItems: [],
          },
        ],
      }
    }

    return {
      ...item,
      childItems: addChildItemById(item.childItems || [], targetId, title),
    }
  })
}

function updateNestedItemById(items, targetId, updater) {
  return (items || []).map((item) => {
    const nextItem = item.id === targetId ? updater(item) : item

    return {
      ...nextItem,
      childItems: updateNestedItemById(nextItem.childItems || [], targetId, updater),
    }
  })
}

function deleteNestedItemById(items, targetId) {
  return (items || [])
    .filter((item) => item.id !== targetId)
    .map((item) => ({
      ...item,
      childItems: deleteNestedItemById(item.childItems || [], targetId),
    }))
}

function createItemId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `item-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function createStatusHistoryEntry(fromStatus, toStatus) {
  return {
    id: createItemId(),
    fromStatus: normalizeStatus(fromStatus),
    toStatus: normalizeStatus(toStatus),
    ...getCurrentActivityActor(),
    changedAt: new Date().toISOString(),
  }
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function uniqueItems(items) {
  const seen = new Set()
  const unique = []

  for (const item of items) {
    const title = String(item?.title || item || '').trim()
    if (!title) continue

    const key = normalizeKey(title)
    if (seen.has(key)) continue

    seen.add(key)
    unique.push({
      title,
      status: normalizeStatus(item?.status),
      comment: String(item?.comment || '').trim(),
      fieldValues: { ...(item?.fieldValues || {}) },
      childItems: Array.isArray(item?.childItems) ? item.childItems : [],
    })
  }

  return unique
}

async function assertChecklistTitleUnique(siteId, title, excludeId = null) {
  const normalizedTitle = normalizeKey(title)
  if (!normalizedTitle) {
    throw new Error('Main checklist name is required.')
  }

  const siteChecklists = await db.checklists.where('siteId').equals(siteId).toArray()
  const duplicate = siteChecklists.find(
    (item) => item.id !== excludeId && normalizeKey(item.title) === normalizedTitle
  )

  if (duplicate) {
    throw new Error('Main checklist name already exists. Please use a different name.')
  }
}

function createEmptyFieldValues(columns) {
  return Object.fromEntries(
    normalizeChecklistCustomColumns(columns).map((column) => [column.id, ''])
  )
}

function cloneChildItems(childItems) {
  return (Array.isArray(childItems) ? childItems : []).map((childItem) => ({
    id: createItemId(),
    title: childItem.title || '',
    status: normalizeStatus(childItem.status),
    statusHistory: [],
    childItems: cloneChildItems(childItem.childItems),
  }))
}

function normalizeImportedChildItems(childItems, customColumns) {
  return (Array.isArray(childItems) ? childItems : []).map((childItem) => ({
    id: createItemId(),
    title: String(childItem?.title || '').trim(),
    status: normalizeStatus(childItem?.status),
    comment: String(childItem?.comment || '').trim(),
    statusHistory: [],
    fieldValues: normalizeItemFieldValues(childItem?.fieldValues, customColumns),
    childItems: normalizeImportedChildItems(childItem?.childItems, customColumns),
  })).filter((childItem) => childItem.title)
}

function normalizeItemFieldValues(values, customColumns) {
  const entries = normalizeChecklistCustomColumns(customColumns).map((column) => [
    column.id,
    normalizeChecklistFieldValue(values?.[column.id] || '', column.type),
  ])

  return Object.fromEntries(entries)
}
