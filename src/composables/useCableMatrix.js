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

export const CABLE_CHECK_STATUS = {
  PENDING: 'pending',
  OK: 'ok',
}

export const CABLE_PROOF_STATUS = {
  NOT_RECEIVED: 'not-received',
  RECEIVED: 'received',
}

export const CABLE_PROOF_TASKS = [
  { id: 'preInstallLocation', label: 'Pre installation location of cable' },
  { id: 'dcplSptLabelPhotos', label: 'Photos of label at DCPL/SPT ends' },
  { id: 'antennaLabelPhotos', label: 'Photos of label at antenna end' },
  {
    id: 'longCablePhoto',
    label: 'If cable is longer than 5m, please also take another picture at any where along the cable',
  },
  { id: 'equipmentConnectorLabel', label: 'Label photos show equipment/Connector and Cable label together' },
  { id: 'penetrationPhotos', label: 'Pre and post-penetration photos for cable if applicable' },
]

export function useCableMatrix(siteId) {
  setupCloudBoardMirror(siteId)

  const { data: rows } = useLiveQuery(() =>
    db.cableMatrices.where('siteId').equals(siteId).sortBy('order')
  )

  const summary = computed(() => summarizeCableMatrix(rows.value || []))

  async function addRow(row) {
    const siteRows = await db.cableMatrices.where('siteId').equals(siteId).toArray()
    const nextOrder = siteRows.reduce((max, item) => Math.max(max, Number(item.order) || 0), 0) + 1

    const record = {
      ...(isCloudBoardMirrorEnabled() ? { id: createCloudMirrorRecordId() } : {}),
      siteId,
      order: nextOrder,
      cableNumber: String(row.cableNumber || '').trim(),
      cableLabel: String(row.cableLabel || '').trim(),
      from: String(row.from || '').trim(),
      to: String(row.to || '').trim(),
      testStatus: normalizeCheckStatus(row.testStatus),
      labelOriginStatus: normalizeCheckStatus(row.labelOriginStatus),
      labelEndStatus: normalizeCheckStatus(row.labelEndStatus),
      proofTasks: normalizeProofTasks(row.proofTasks),
      fieldValues: normalizeFieldValues(row.fieldValues),
      statusHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const id = await db.cableMatrices.add(record)
    await persistCloudBoard(siteId, 'cable-matrix-row-added')
    return id
  }

  async function updateRow(id, updates) {
    const row = await db.cableMatrices.get(localRecordKey(id))
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

    const result = await db.cableMatrices.update(localRecordKey(id), {
      ...normalizedUpdates,
      statusHistory: nextHistory,
      updatedAt: new Date().toISOString(),
    })
    await persistCloudBoard(siteId, 'cable-matrix-row-updated')
    return result
  }

  async function deleteRow(id) {
    await db.cableMatrices.delete(localRecordKey(id))
    await persistCloudBoard(siteId, 'cable-matrix-row-deleted')
  }

  async function reorderRows(orderedIds) {
    const ids = orderedIds
      .map((id) => localRecordKey(id))
      .filter((id) => id !== null && id !== undefined && id !== '')

    if (!ids.length) return

    await db.transaction('rw', db.cableMatrices, async () => {
      for (let index = 0; index < ids.length; index += 1) {
        await db.cableMatrices.update(ids[index], {
          order: index + 1,
          updatedAt: new Date().toISOString(),
        })
      }
    })
    await persistCloudBoard(siteId, 'cable-matrix-rows-reordered')
  }

  async function setRowStatus(id, field, status) {
    const row = await db.cableMatrices.get(localRecordKey(id))
    if (!row) return

    const allowedFields = new Set(['testStatus', 'labelOriginStatus', 'labelEndStatus'])
    if (!allowedFields.has(field)) return

    const nextStatus = normalizeCheckStatus(status)
    const previousStatus = normalizeCheckStatus(row[field])
    if (previousStatus === nextStatus) return

    const result = await db.cableMatrices.update(localRecordKey(id), {
      [field]: nextStatus,
      statusHistory: [
        ...(Array.isArray(row.statusHistory) ? row.statusHistory : []),
        createStatusHistoryEntry(field, previousStatus, nextStatus),
      ],
      updatedAt: new Date().toISOString(),
    })
    await persistCloudBoard(siteId, 'cable-matrix-row-updated')
    return result
  }

  async function setProofTaskStatus(id, taskId, status) {
    const row = await db.cableMatrices.get(localRecordKey(id))
    if (!row || !CABLE_PROOF_TASKS.some((task) => task.id === taskId)) return

    const proofTasks = normalizeProofTasks(row.proofTasks)
    const nextStatus = normalizeProofStatus(status)
    const previousStatus = proofTasks[taskId]
    if (previousStatus === nextStatus) return

    const result = await db.cableMatrices.update(localRecordKey(id), {
      proofTasks: {
        ...proofTasks,
        [taskId]: nextStatus,
      },
      statusHistory: [
        ...(Array.isArray(row.statusHistory) ? row.statusHistory : []),
        createProofTaskHistoryEntry(taskId, previousStatus, nextStatus),
      ],
      updatedAt: new Date().toISOString(),
    })
    await persistCloudBoard(siteId, 'cable-matrix-row-updated')
    return result
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
            fieldValues: {
              ...(existing.fieldValues || {}),
              ...(normalizedRow.fieldValues || {}),
            },
            updatedAt: new Date().toISOString(),
          }
          await db.cableMatrices.put(nextValues)
          rowMap.set(key, nextValues)
          summary.updatedRows += 1
          continue
        }

        const newRow = {
          ...(isCloudBoardMirrorEnabled() ? { id: createCloudMirrorRecordId() } : {}),
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

    await persistCloudBoard(siteId, 'cable-matrix-rows-imported')
    return summary
  }

  async function removeCustomColumnValues(columnId) {
    if (!columnId) return

    await db.transaction('rw', db.cableMatrices, async () => {
      const siteRows = await db.cableMatrices.where('siteId').equals(siteId).toArray()

      for (const row of siteRows) {
        if (!row.fieldValues || !(columnId in row.fieldValues)) continue

        const fieldValues = { ...row.fieldValues }
        delete fieldValues[columnId]

        await db.cableMatrices.update(localRecordKey(row.id), {
          fieldValues,
          updatedAt: new Date().toISOString(),
        })
      }
    })
    await persistCloudBoard(siteId, 'cable-matrix-custom-columns-updated')
  }

  return {
    rows,
    summary,
    addRow,
    updateRow,
    deleteRow,
    reorderRows,
    setRowStatus,
    setProofTaskStatus,
    importRows,
    removeCustomColumnValues,
  }
}

function setupCloudBoardMirror(siteId) {
  if (!isCloudBoardMirrorEnabled()) return

  void ensureCloudBoardMirror('cableMatrix', siteId)
  const { trackerSyncRefreshToken } = useRealtime()
  watch(trackerSyncRefreshToken, () => {
    void ensureCloudBoardMirror('cableMatrix', siteId, { force: true })
  })
}

async function persistCloudBoard(siteId, eventName) {
  if (!isCloudBoardMirrorEnabled()) return

  await saveCloudBoardMirror('cableMatrix', siteId)
  await broadcastTrackerChange(eventName)
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
  const proofReceived = rows.reduce((total, row) => {
    const proofTasks = normalizeProofTasks(row.proofTasks)
    return total + CABLE_PROOF_TASKS.filter((task) => proofTasks[task.id] === CABLE_PROOF_STATUS.RECEIVED).length
  }, 0)
  const proofTotal = total * CABLE_PROOF_TASKS.length

  return {
    total,
    testOk,
    labelOriginOk,
    labelEndOk,
    fullyChecked,
    proofReceived,
    proofTotal,
  }
}

export function normalizeCheckStatus(value) {
  return String(value || '').trim().toLowerCase() === CABLE_CHECK_STATUS.OK
    ? CABLE_CHECK_STATUS.OK
    : CABLE_CHECK_STATUS.PENDING
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
    proofTasks: normalizeProofTasks(row.proofTasks),
    fieldValues: normalizeFieldValues(row.fieldValues),
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
  if ('proofTasks' in next) next.proofTasks = normalizeProofTasks(next.proofTasks)
  if ('fieldValues' in next) next.fieldValues = normalizeFieldValues(next.fieldValues)

  return next
}

export function normalizeProofTasks(value) {
  return Object.fromEntries(
    CABLE_PROOF_TASKS.map((task) => [task.id, normalizeProofStatus(value?.[task.id])])
  )
}

export function normalizeProofStatus(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === CABLE_PROOF_STATUS.RECEIVED || normalized === 'received' || normalized === 'yes'
    ? CABLE_PROOF_STATUS.RECEIVED
    : CABLE_PROOF_STATUS.NOT_RECEIVED
}

function normalizeFieldValues(value) {
  return Object.fromEntries(
    Object.entries(value || {}).map(([key, item]) => [String(key), String(item ?? '')])
  )
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
    ...getCurrentActivityActor(),
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
    ...getCurrentActivityActor(),
    changedAt: new Date().toISOString(),
  }
}

function createProofTaskHistoryEntry(taskId, fromStatus, toStatus) {
  return {
    id: createLocalId(),
    type: 'proof-task',
    taskId,
    fromStatus: normalizeProofStatus(fromStatus),
    toStatus: normalizeProofStatus(toStatus),
    ...getCurrentActivityActor(),
    changedAt: new Date().toISOString(),
  }
}

function createLocalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `cable-history-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}
