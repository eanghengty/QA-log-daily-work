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

export function useCableChecklist(siteId) {
  setupCloudBoardMirror(siteId)

  const { data: rows } = useLiveQuery(() =>
    db.cableChecklists.where('siteId').equals(siteId).sortBy('order')
  )

  const summary = computed(() => summarizeCableChecklist(rows.value || []))

  async function addRow(row) {
    const siteRows = await db.cableChecklists.where('siteId').equals(siteId).toArray()
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
    const id = await db.cableChecklists.add(record)
    await persistCloudBoard(siteId, 'cable-checklist-row-added')
    return id
  }

  async function updateRow(id, updates) {
    const row = await db.cableChecklists.get(localRecordKey(id))
    if (!row) return

    const normalizedUpdates = normalizeRowUpdates(updates)
    const nextHistory = [...(Array.isArray(row.changeHistory) ? row.changeHistory : [])]

    for (const field of CABLE_FIELDS) {
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

    const result = await db.cableChecklists.update(localRecordKey(id), {
      ...normalizedUpdates,
      changeHistory: nextHistory,
      updatedAt: new Date().toISOString(),
    })
    await persistCloudBoard(siteId, 'cable-checklist-row-updated')
    return result
  }

  async function deleteRow(id) {
    await db.cableChecklists.delete(localRecordKey(id))
    await persistCloudBoard(siteId, 'cable-checklist-row-deleted')
  }

  async function reorderRows(orderedIds) {
    const ids = orderedIds
      .map((id) => localRecordKey(id))
      .filter((id) => id !== null && id !== undefined && id !== '')
    if (!ids.length) return

    await db.transaction('rw', db.cableChecklists, async () => {
      for (let index = 0; index < ids.length; index += 1) {
        await db.cableChecklists.update(ids[index], {
          order: index + 1,
          updatedAt: new Date().toISOString(),
        })
      }
    })
    await persistCloudBoard(siteId, 'cable-checklist-rows-reordered')
  }

  async function importRows(importedRows) {
    const summary = {
      addedRows: 0,
      updatedRows: 0,
    }

    await db.transaction('rw', db.cableChecklists, async () => {
      const siteRows = await db.cableChecklists.where('siteId').equals(siteId).sortBy('order')
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
          await db.cableChecklists.put(nextValues)
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

        const insertedId = await db.cableChecklists.add(newRow)
        rowMap.set(key, { ...newRow, id: insertedId })
        nextOrder += 1
        summary.addedRows += 1
      }
    })

    await persistCloudBoard(siteId, 'cable-checklist-rows-imported')
    return summary
  }

  async function removeCustomColumnValues(columnId) {
    if (!columnId) return

    await db.transaction('rw', db.cableChecklists, async () => {
      const siteRows = await db.cableChecklists.where('siteId').equals(siteId).toArray()

      for (const row of siteRows) {
        if (!row.fieldValues || !(columnId in row.fieldValues)) continue

        const fieldValues = { ...row.fieldValues }
        delete fieldValues[columnId]

        await db.cableChecklists.update(localRecordKey(row.id), {
          fieldValues,
          updatedAt: new Date().toISOString(),
        })
      }
    })
    await persistCloudBoard(siteId, 'cable-checklist-custom-columns-updated')
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

  void ensureCloudBoardMirror('cableChecklist', siteId)
  const { trackerSyncRefreshToken } = useRealtime()
  watch(trackerSyncRefreshToken, () => {
    void ensureCloudBoardMirror('cableChecklist', siteId, { force: true })
  })
}

async function persistCloudBoard(siteId, eventName) {
  if (!isCloudBoardMirrorEnabled()) return

  await saveCloudBoardMirror('cableChecklist', siteId)
  await broadcastTrackerChange(eventName)
}

export function summarizeCableChecklist(rows) {
  const total = rows.length
  const platformLevel = rows.filter((row) => normalizeLevel(row.level) === 'platform').length
  const groundLevel = rows.filter((row) => normalizeLevel(row.level) === 'ground').length
  const totalLength = rows.reduce((sum, row) => sum + parseCableLength(row.cableLength), 0)
  const withSweepTest = rows.filter((row) => String(row.sweepTestReceived || '').trim()).length
  const otherLevels = total - platformLevel - groundLevel

  return {
    total,
    platformLevel,
    groundLevel,
    totalLength,
    withSweepTest,
    otherLevels,
  }
}

const CABLE_FIELDS = ['level', 'cableLabel', 'cableId', 'hopCriteria', 'sweepTestReceived', 'remark', 'cableLength']

function normalizeRowValues(row) {
  return {
    level: String(row.level || '').trim(),
    cableLabel: String(row.cableLabel || '').trim(),
    cableId: String(row.cableId || '').trim(),
    hopCriteria: String(row.hopCriteria || '').trim(),
    sweepTestReceived: normalizeDateValue(row.sweepTestReceived),
    remark: String(row.remark || '').trim(),
    cableLength: String(row.cableLength || '').trim(),
    fieldValues: normalizeFieldValues(row.fieldValues),
  }
}

function normalizeRowUpdates(updates) {
  const next = { ...updates }
  if ('level' in next) next.level = String(next.level || '').trim()
  if ('cableLabel' in next) next.cableLabel = String(next.cableLabel || '').trim()
  if ('cableId' in next) next.cableId = String(next.cableId || '').trim()
  if ('hopCriteria' in next) next.hopCriteria = String(next.hopCriteria || '').trim()
  if ('sweepTestReceived' in next) next.sweepTestReceived = normalizeDateValue(next.sweepTestReceived)
  if ('remark' in next) next.remark = String(next.remark || '').trim()
  if ('cableLength' in next) next.cableLength = String(next.cableLength || '').trim()
  if ('fieldValues' in next) next.fieldValues = normalizeFieldValues(next.fieldValues)

  return next
}

function normalizeFieldValues(value) {
  return Object.fromEntries(
    Object.entries(value || {}).map(([key, item]) => [String(key), String(item ?? '')])
  )
}

function hasAnyValue(row) {
  return CABLE_FIELDS.some((field) => String(row[field] || '').trim())
}

function buildRowKey(row) {
  return [
    String(row.cableId || '').trim().toLowerCase(),
    String(row.cableLabel || '').trim().toLowerCase(),
  ].join('::')
}

function normalizeLevel(value) {
  const text = String(value || '').trim().toLowerCase()
  if (text.includes('platform')) return 'platform'
  if (text.includes('ground')) return 'ground'
  return 'other'
}

function parseCableLength(value) {
  const cleaned = String(value || '').trim().replace(/,/g, '')
  const number = Number.parseFloat(cleaned)
  return Number.isFinite(number) ? number : 0
}

function normalizeDateValue(value) {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDate(value)
  }

  const text = String(value).trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (/^\d{5}$/.test(text)) {
    const excelDate = excelSerialToDate(Number(text))
    return excelDate ? toIsoDate(excelDate) : text
  }

  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) {
    return toIsoDate(parsed)
  }

  return text
}

function excelSerialToDate(serial) {
  if (!Number.isFinite(serial)) return null
  const utcDays = Math.floor(serial - 25569)
  const utcValue = utcDays * 86400
  const dateInfo = new Date(utcValue * 1000)
  const fractionalDay = serial - Math.floor(serial) + 0.0000001
  let totalSeconds = Math.floor(86400 * fractionalDay)

  const seconds = totalSeconds % 60
  totalSeconds -= seconds

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor(totalSeconds / 60) % 60

  return new Date(Date.UTC(dateInfo.getUTCFullYear(), dateInfo.getUTCMonth(), dateInfo.getUTCDate(), hours, minutes, seconds))
}

function toIsoDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function createFieldHistoryEntry(field, fromValue, toValue) {
  return {
    id: createLocalId(),
    type: 'field',
    field,
    fromValue: String(fromValue || '').trim(),
    toValue: String(toValue || '').trim(),
    changedAt: new Date().toISOString(),
  }
}

function createLocalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `cable-checklist-history-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}
