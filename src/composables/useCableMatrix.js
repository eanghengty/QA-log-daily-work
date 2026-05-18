import { computed } from 'vue'
import { db } from '../db/index.js'
import { useLiveQuery } from './useLiveQuery.js'

export const CABLE_CHECK_STATUS = {
  NO: 'no',
  OK: 'ok',
}

export function useCableMatrix(siteId) {
  const { data: rows } = useLiveQuery(() =>
    db.cableMatrices.where('siteId').equals(siteId).sortBy('order')
  )

  const summary = computed(() => summarizeCableMatrix(rows.value || []))

  async function addRow(row) {
    const siteRows = await db.cableMatrices.where('siteId').equals(siteId).toArray()
    const nextOrder = siteRows.reduce((max, item) => Math.max(max, Number(item.order) || 0), 0) + 1

    return await db.cableMatrices.add({
      siteId,
      order: nextOrder,
      cableNumber: String(row.cableNumber || '').trim(),
      cableLabel: String(row.cableLabel || '').trim(),
      from: String(row.from || '').trim(),
      to: String(row.to || '').trim(),
      testStatus: normalizeCheckStatus(row.testStatus),
      labelOriginStatus: normalizeCheckStatus(row.labelOriginStatus),
      labelEndStatus: normalizeCheckStatus(row.labelEndStatus),
      statusHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  async function updateRow(id, updates) {
    const row = await db.cableMatrices.get(Number(id))
    if (!row) return

    const normalizedUpdates = normalizeRowUpdates(updates)
    const nextHistory = [...(Array.isArray(row.statusHistory) ? row.statusHistory : [])]

    if ('from' in normalizedUpdates && normalizedUpdates.from !== String(row.from || '').trim()) {
      nextHistory.push(
        createFieldHistoryEntry('from', String(row.from || '').trim(), normalizedUpdates.from)
      )
    }

    if ('to' in normalizedUpdates && normalizedUpdates.to !== String(row.to || '').trim()) {
      nextHistory.push(
        createFieldHistoryEntry('to', String(row.to || '').trim(), normalizedUpdates.to)
      )
    }

    return await db.cableMatrices.update(Number(id), {
      ...normalizedUpdates,
      statusHistory: nextHistory,
      updatedAt: new Date().toISOString(),
    })
  }

  async function deleteRow(id) {
    await db.cableMatrices.delete(Number(id))
  }

  async function reorderRows(orderedIds) {
    const ids = orderedIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))

    if (!ids.length) return

    await db.transaction('rw', db.cableMatrices, async () => {
      for (let index = 0; index < ids.length; index += 1) {
        await db.cableMatrices.update(ids[index], {
          order: index + 1,
          updatedAt: new Date().toISOString(),
        })
      }
    })
  }

  async function setRowStatus(id, field, status) {
    const row = await db.cableMatrices.get(Number(id))
    if (!row) return

    const allowedFields = new Set(['testStatus', 'labelOriginStatus', 'labelEndStatus'])
    if (!allowedFields.has(field)) return

    const nextStatus = normalizeCheckStatus(status)
    const previousStatus = normalizeCheckStatus(row[field])
    if (previousStatus === nextStatus) return

    return await db.cableMatrices.update(Number(id), {
      [field]: nextStatus,
      statusHistory: [
        ...(Array.isArray(row.statusHistory) ? row.statusHistory : []),
        createStatusHistoryEntry(field, previousStatus, nextStatus),
      ],
      updatedAt: new Date().toISOString(),
    })
  }

  async function importRows(importedRows) {
    const summary = {
      addedRows: 0,
      updatedRows: 0,
      skippedRows: 0,
    }

    await db.transaction('rw', db.cableMatrices, async () => {
      const siteRows = await db.cableMatrices.where('siteId').equals(siteId).sortBy('order')
      const rowMap = new Map(siteRows.map((row) => [buildRowKey(row), row]))
      let nextOrder = siteRows.reduce((max, item) => Math.max(max, Number(item.order) || 0), 0) + 1

      for (const sourceRow of importedRows) {
        const normalizedRow = normalizeImportedRow(sourceRow)
        if (!normalizedRow.cableNumber && !normalizedRow.cableLabel) continue

        const key = buildRowKey(normalizedRow)
        const existing = rowMap.get(key)

        if (existing) {
          const nextValues = {
            ...existing,
            ...normalizedRow,
            updatedAt: new Date().toISOString(),
          }
          await db.cableMatrices.put(nextValues)
          rowMap.set(key, nextValues)
          summary.updatedRows += 1
          continue
        }

        const newRow = {
          siteId,
          order: nextOrder,
          ...normalizedRow,
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        const insertedId = await db.cableMatrices.add(newRow)
        rowMap.set(key, { ...newRow, id: insertedId })
        nextOrder += 1
        summary.addedRows += 1
      }
    })

    return summary
  }

  return {
    rows,
    summary,
    addRow,
    updateRow,
    deleteRow,
    reorderRows,
    setRowStatus,
    importRows,
  }
}

export function summarizeCableMatrix(rows) {
  const total = rows.length
  const testOk = rows.filter((row) => normalizeCheckStatus(row.testStatus) === CABLE_CHECK_STATUS.OK).length
  const labelOriginOk = rows.filter(
    (row) => normalizeCheckStatus(row.labelOriginStatus) === CABLE_CHECK_STATUS.OK
  ).length
  const labelEndOk = rows.filter(
    (row) => normalizeCheckStatus(row.labelEndStatus) === CABLE_CHECK_STATUS.OK
  ).length
  const fullyChecked = rows.filter(
    (row) =>
      normalizeCheckStatus(row.testStatus) === CABLE_CHECK_STATUS.OK &&
      normalizeCheckStatus(row.labelOriginStatus) === CABLE_CHECK_STATUS.OK &&
      normalizeCheckStatus(row.labelEndStatus) === CABLE_CHECK_STATUS.OK
  ).length

  return {
    total,
    testOk,
    labelOriginOk,
    labelEndOk,
    fullyChecked,
  }
}

function normalizeCheckStatus(value) {
  return String(value || '').trim().toLowerCase() === CABLE_CHECK_STATUS.OK
    ? CABLE_CHECK_STATUS.OK
    : CABLE_CHECK_STATUS.NO
}

function normalizeImportedRow(row) {
  return {
    cableNumber: String(row.cableNumber || '').trim(),
    cableLabel: String(row.cableLabel || '').trim(),
    from: String(row.from || '').trim(),
    to: String(row.to || '').trim(),
    testStatus: normalizeCheckStatus(row.testStatus),
    labelOriginStatus: normalizeCheckStatus(row.labelOriginStatus),
    labelEndStatus: normalizeCheckStatus(row.labelEndStatus),
  }
}

function normalizeRowUpdates(updates) {
  const next = { ...updates }

  if ('cableNumber' in next) next.cableNumber = String(next.cableNumber || '').trim()
  if ('cableLabel' in next) next.cableLabel = String(next.cableLabel || '').trim()
  if ('from' in next) next.from = String(next.from || '').trim()
  if ('to' in next) next.to = String(next.to || '').trim()
  if ('testStatus' in next) next.testStatus = normalizeCheckStatus(next.testStatus)
  if ('labelOriginStatus' in next) next.labelOriginStatus = normalizeCheckStatus(next.labelOriginStatus)
  if ('labelEndStatus' in next) next.labelEndStatus = normalizeCheckStatus(next.labelEndStatus)

  return next
}

function buildRowKey(row) {
  return [
    String(row.cableNumber || '').trim().toLowerCase(),
    String(row.cableLabel || '').trim().toLowerCase(),
    String(row.from || '').trim().toLowerCase(),
    String(row.to || '').trim().toLowerCase(),
  ].join('::')
}

function createStatusHistoryEntry(field, fromStatus, toStatus) {
  return {
    id: createLocalId(),
    type: 'status',
    field,
    fromStatus: normalizeCheckStatus(fromStatus),
    toStatus: normalizeCheckStatus(toStatus),
    changedAt: new Date().toISOString(),
  }
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

  return `cable-history-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}
