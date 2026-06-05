import { computed, watch } from 'vue'
import { db } from '../db/index.js'
import {
  createCloudMirrorRecordId,
  ensureCloudBoardMirror,
  isCloudBoardMirrorEnabled,
  localRecordKey,
  saveCloudBoardMirror,
} from '../lib/cloudBoardMirror.js'
import { useLiveQuery } from './useLiveQuery.js'
import { broadcastTrackerChange, useRealtime } from './useRealtime.js'
import { getCurrentActivityActor } from './useActivityActor.js'

export function useAntennaChecklist(siteId) {
  setupCloudBoardMirror(siteId)

  const { data: rows } = useLiveQuery(() =>
    db.antennaChecklists.where('siteId').equals(siteId).sortBy('order')
  )

  const summary = computed(() => summarizeAntennaChecklist(rows.value || []))

  async function addRow(row) {
    const siteRows = await db.antennaChecklists.where('siteId').equals(siteId).toArray()
    const nextOrder = siteRows.reduce((max, item) => Math.max(max, Number(item.order) || 0), 0) + 1

    const record = {
      ...(isCloudBoardMirrorEnabled() ? { id: createCloudMirrorRecordId() } : {}),
      siteId,
      order: nextOrder,
      ...normalizeRowValues(row),
      fieldValues: normalizeFieldValues(row.fieldValues),
      changeHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const id = await db.antennaChecklists.add(record)
    await persistCloudBoard(siteId, 'antenna-checklist-row-added')
    return id
  }

  async function updateRow(id, updates) {
    const row = await db.antennaChecklists.get(localRecordKey(id))
    if (!row) return

    const normalizedUpdates = normalizeRowUpdates(updates)
    const nextHistory = [...(Array.isArray(row.changeHistory) ? row.changeHistory : [])]

    for (const field of ANTENNA_FIELDS) {
      if (!(field in normalizedUpdates)) continue

      const previousValue = String(row[field] || '').trim()
      const nextValue = String(normalizedUpdates[field] || '').trim()
      if (previousValue === nextValue) continue

      nextHistory.push(createFieldHistoryEntry(field, previousValue, nextValue))
    }

    if ('fieldValues' in normalizedUpdates) {
      const previousFieldValues = row.fieldValues || {}
      for (const [field, nextValueRaw] of Object.entries(normalizedUpdates.fieldValues || {})) {
        const previousValue = String(previousFieldValues[field] || '').trim()
        const nextValue = String(nextValueRaw || '').trim()
        if (previousValue === nextValue) continue
        nextHistory.push(createFieldHistoryEntry(field, previousValue, nextValue))
      }
    }

    const result = await db.antennaChecklists.update(localRecordKey(id), {
      ...normalizedUpdates,
      changeHistory: nextHistory,
      updatedAt: new Date().toISOString(),
    })
    await persistCloudBoard(siteId, 'antenna-checklist-row-updated')
    return result
  }

  async function deleteRow(id) {
    await db.antennaChecklists.delete(localRecordKey(id))
    await persistCloudBoard(siteId, 'antenna-checklist-row-deleted')
  }

  async function reorderRows(orderedIds) {
    const ids = orderedIds
      .map((id) => localRecordKey(id))
      .filter((id) => id !== null && id !== undefined && id !== '')

    if (!ids.length) return

    await db.transaction('rw', db.antennaChecklists, async () => {
      for (let index = 0; index < ids.length; index += 1) {
        await db.antennaChecklists.update(ids[index], {
          order: index + 1,
          updatedAt: new Date().toISOString(),
        })
      }
    })
    await persistCloudBoard(siteId, 'antenna-checklist-rows-reordered')
  }

  async function importRows(importedRows) {
    const summary = {
      addedRows: 0,
      updatedRows: 0,
    }

    await db.transaction('rw', db.antennaChecklists, async () => {
      const siteRows = await db.antennaChecklists.where('siteId').equals(siteId).sortBy('order')
      const rowMap = new Map(siteRows.map((row) => [buildRowKey(row), row]))
      let nextOrder = siteRows.reduce((max, item) => Math.max(max, Number(item.order) || 0), 0) + 1

      for (const sourceRow of importedRows) {
        const normalizedRow = normalizeRowValues(sourceRow)
        if (!hasAnyValue(normalizedRow)) continue

        const key = buildRowKey(normalizedRow)
        const existing = rowMap.get(key)

        if (existing) {
          const nextValues = {
            ...existing,
            ...normalizedRow,
            fieldValues: {
              ...(existing.fieldValues || {}),
              ...(normalizedRow.fieldValues || {}),
            },
            updatedAt: new Date().toISOString(),
          }
          await db.antennaChecklists.put(nextValues)
          rowMap.set(key, nextValues)
          summary.updatedRows += 1
          continue
        }

        const newRow = {
          ...(isCloudBoardMirrorEnabled() ? { id: createCloudMirrorRecordId() } : {}),
          siteId,
          order: nextOrder,
          ...normalizedRow,
          changeHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        const insertedId = await db.antennaChecklists.add(newRow)
        rowMap.set(key, { ...newRow, id: insertedId })
        nextOrder += 1
        summary.addedRows += 1
      }
    })

    await persistCloudBoard(siteId, 'antenna-checklist-rows-imported')
    return summary
  }

  async function removeCustomColumnValues(columnId) {
    if (!columnId) return

    await db.transaction('rw', db.antennaChecklists, async () => {
      const siteRows = await db.antennaChecklists.where('siteId').equals(siteId).toArray()

      for (const row of siteRows) {
        if (!row.fieldValues || !(columnId in row.fieldValues)) continue

        const fieldValues = { ...row.fieldValues }
        delete fieldValues[columnId]

        await db.antennaChecklists.update(localRecordKey(row.id), {
          fieldValues,
          updatedAt: new Date().toISOString(),
        })
      }
    })
    await persistCloudBoard(siteId, 'antenna-checklist-custom-columns-updated')
  }

  return {
    rows,
    summary,
    addRow,
    updateRow,
    deleteRow,
    reorderRows,
    importRows,
    removeCustomColumnValues,
  }
}

function setupCloudBoardMirror(siteId) {
  if (!isCloudBoardMirrorEnabled()) return

  void ensureCloudBoardMirror('antennaChecklist', siteId)
  const { trackerSyncRefreshToken } = useRealtime()
  watch(trackerSyncRefreshToken, () => {
    void ensureCloudBoardMirror('antennaChecklist', siteId, { force: true })
  })
}

async function persistCloudBoard(siteId, eventName) {
  if (!isCloudBoardMirrorEnabled()) return

  await saveCloudBoardMirror('antennaChecklist', siteId)
  await broadcastTrackerChange(eventName)
}

export function summarizeAntennaChecklist(rows) {
  const total = rows.length
  const platformLevel = rows.filter((row) => normalizeLevel(row.level) === 'platform').length
  const groundLevel = rows.filter((row) => normalizeLevel(row.level) === 'ground').length
  const withSerialNumber = rows.filter((row) => String(row.serialNumber || '').trim()).length
  const withModel = rows.filter((row) => String(row.model || '').trim()).length
  const otherLevels = total - platformLevel - groundLevel

  return {
    total,
    platformLevel,
    groundLevel,
    otherLevels,
    withSerialNumber,
    withModel,
  }
}

const ANTENNA_FIELDS = ['level', 'description', 'make', 'model', 'serialNumber', 'assetTag', 'comment']

function normalizeRowValues(row) {
  return {
    level: String(row.level || '').trim(),
    description: String(row.description || '').trim(),
    make: String(row.make || '').trim(),
    model: String(row.model || '').trim(),
    serialNumber: String(row.serialNumber || '').trim(),
    assetTag: String(row.assetTag || '').trim(),
    comment: String(row.comment || '').trim(),
    fieldValues: normalizeFieldValues(row.fieldValues),
  }
}

function normalizeRowUpdates(updates) {
  const next = { ...updates }

  if ('level' in next) next.level = String(next.level || '').trim()
  if ('description' in next) next.description = String(next.description || '').trim()
  if ('make' in next) next.make = String(next.make || '').trim()
  if ('model' in next) next.model = String(next.model || '').trim()
  if ('serialNumber' in next) next.serialNumber = String(next.serialNumber || '').trim()
  if ('assetTag' in next) next.assetTag = String(next.assetTag || '').trim()
  if ('comment' in next) next.comment = String(next.comment || '').trim()
  if ('fieldValues' in next) next.fieldValues = normalizeFieldValues(next.fieldValues)

  return next
}

function normalizeFieldValues(value) {
  return Object.fromEntries(
    Object.entries(value || {}).map(([key, item]) => [String(key), String(item ?? '')])
  )
}

function hasAnyValue(row) {
  return ANTENNA_FIELDS.some((field) => String(row[field] || '').trim())
}

function buildRowKey(row) {
  return [
    String(row.serialNumber || '').trim().toLowerCase(),
    String(row.assetTag || '').trim().toLowerCase(),
    String(row.description || '').trim().toLowerCase(),
  ].join('::')
}

function normalizeLevel(value) {
  const text = String(value || '').trim().toLowerCase()
  if (text.includes('platform')) return 'platform'
  if (text.includes('ground')) return 'ground'
  return 'other'
}

function createFieldHistoryEntry(field, fromValue, toValue) {
  return {
    id: createLocalId(),
    type: 'field',
    field,
    fromValue: String(fromValue || '').trim(),
    toValue: String(toValue || '').trim(),
    ...getCurrentActivityActor(),
    changedAt: new Date().toISOString(),
  }
}

function createLocalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `antenna-history-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}
