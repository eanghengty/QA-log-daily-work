import { db } from '../db/index.js'
import {
  getCloudSiteBoard,
  isCloudTrackerEnabled,
  saveCloudSiteBoard,
} from './trackerCloud.js'

const BOARD_MIRROR_IMPORT_PREFIX = 'qa_tracker_board_mirror_imported'

export const CLOUD_BOARD_CONFIGS = Object.freeze({
  siteChecklist: {
    boardKey: 'site-checklist',
    collections: [{ tableName: 'checklists', payloadKey: 'checklists', sortBy: 'order' }],
    singles: [{ tableName: 'checklistLayouts', payloadKey: 'checklistLayout' }],
  },
  cableMatrix: {
    boardKey: 'cable-matrix',
    collections: [{ tableName: 'cableMatrices', payloadKey: 'cableMatrices', sortBy: 'order' }],
    singles: [{ tableName: 'cableMatrixLayouts', payloadKey: 'cableMatrixLayout' }],
  },
  antennaChecklist: {
    boardKey: 'antenna-checklist',
    collections: [{ tableName: 'antennaChecklists', payloadKey: 'antennaChecklists', sortBy: 'order' }],
    singles: [{ tableName: 'antennaChecklistLayouts', payloadKey: 'antennaChecklistLayout' }],
  },
  dcplChecklist: {
    boardKey: 'dcpl-checklist',
    collections: [{ tableName: 'dcplChecklists', payloadKey: 'dcplChecklists', sortBy: 'order' }],
    singles: [{ tableName: 'dcplChecklistLayouts', payloadKey: 'dcplChecklistLayout' }],
  },
  cableChecklist: {
    boardKey: 'cable-checklist',
    collections: [{ tableName: 'cableChecklists', payloadKey: 'cableChecklists', sortBy: 'order' }],
    singles: [{ tableName: 'cableChecklistLayouts', payloadKey: 'cableChecklistLayout' }],
  },
})

const pendingLoads = new Map()

export function isCloudBoardMirrorEnabled() {
  return isCloudTrackerEnabled()
}

export function localRecordKey(id) {
  const numberId = Number(id)
  return Number.isFinite(numberId) && `${numberId}` === `${id}` ? numberId : id
}

export function createCloudMirrorRecordId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `cloud-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

export async function ensureCloudBoardMirror(boardName, siteId, { force = false } = {}) {
  if (!isCloudBoardMirrorEnabled()) return null

  const config = getBoardConfig(boardName)
  const cacheKey = `${siteId}:${config.boardKey}`
  if (pendingLoads.has(cacheKey)) return await pendingLoads.get(cacheKey)

  const pending = loadCloudBoardMirror(config, siteId, { force }).finally(() => {
    pendingLoads.delete(cacheKey)
  })
  pendingLoads.set(cacheKey, pending)
  return await pending
}

export async function saveCloudBoardMirror(boardName, siteId) {
  if (!isCloudBoardMirrorEnabled()) return null

  const config = getBoardConfig(boardName)
  const payload = await readLocalBoard(config, siteId)
  const { board } = await saveCloudSiteBoard(siteId, config.boardKey, payload)
  markBoardImportComplete(siteId, config.boardKey)
  return board
}

export async function readCloudBoardPayload(boardName, siteId) {
  const config = getBoardConfig(boardName)
  return await readLocalBoard(config, siteId)
}

export function buildCloudBoardPayloads(data = {}) {
  return {
    [CLOUD_BOARD_CONFIGS.siteChecklist.boardKey]: {
      checklists: data.checklists || [],
      checklistLayout: data.checklistLayout || null,
    },
    [CLOUD_BOARD_CONFIGS.cableMatrix.boardKey]: {
      cableMatrices: data.cableMatrices || [],
      cableMatrixLayout: data.cableMatrixLayout || null,
    },
    [CLOUD_BOARD_CONFIGS.antennaChecklist.boardKey]: {
      antennaChecklists: data.antennaChecklists || [],
      antennaChecklistLayout: data.antennaChecklistLayout || null,
    },
    [CLOUD_BOARD_CONFIGS.dcplChecklist.boardKey]: {
      dcplChecklists: data.dcplChecklists || [],
      dcplChecklistLayout: data.dcplChecklistLayout || null,
    },
    [CLOUD_BOARD_CONFIGS.cableChecklist.boardKey]: {
      cableChecklists: data.cableChecklists || [],
      cableChecklistLayout: data.cableChecklistLayout || null,
    },
  }
}

async function loadCloudBoardMirror(config, siteId, { force }) {
  const [{ board }, localPayload] = await Promise.all([
    getCloudSiteBoard(siteId, config.boardKey),
    readLocalBoard(config, siteId),
  ])

  const hasCloudPayload = Boolean(board)
  const hasLocalPayload = hasBoardData(localPayload)

  if (!force && !hasBoardImportCompleted(siteId, config.boardKey) && !hasCloudPayload && hasLocalPayload) {
    const { board: importedBoard } = await saveCloudSiteBoard(siteId, config.boardKey, localPayload)
    markBoardImportComplete(siteId, config.boardKey)
    return importedBoard
  }

  await writeLocalBoard(config, siteId, board?.payload || {})
  markBoardImportComplete(siteId, config.boardKey)
  return board
}

async function readLocalBoard(config, siteId) {
  const collectionEntries = await Promise.all(
    config.collections.map(async (item) => {
      const query = db[item.tableName].where('siteId').equals(siteId)
      return [item.payloadKey, item.sortBy ? await query.sortBy(item.sortBy) : await query.toArray()]
    }),
  )

  const singleEntries = await Promise.all(
    config.singles.map(async (item) => [item.payloadKey, (await db[item.tableName].get(siteId)) || null]),
  )

  return Object.fromEntries([...collectionEntries, ...singleEntries])
}

async function writeLocalBoard(config, siteId, payload) {
  const tableHandles = [...config.collections, ...config.singles].map((item) => db[item.tableName])

  await db.transaction('rw', ...tableHandles, async () => {
    for (const item of config.collections) {
      const table = db[item.tableName]
      const existingIds = await table.where('siteId').equals(siteId).primaryKeys()
      if (existingIds.length) {
        await table.bulkDelete(existingIds)
      }

      const rows = Array.isArray(payload?.[item.payloadKey]) ? payload[item.payloadKey] : []
      if (rows.length) {
        await table.bulkPut(rows.map((row) => ({ ...row, siteId })))
      }
    }

    for (const item of config.singles) {
      const table = db[item.tableName]
      const record = payload?.[item.payloadKey] || null
      if (record) {
        await table.put({ ...record, siteId })
      } else {
        await table.delete(siteId)
      }
    }
  })
}

function hasBoardData(payload) {
  return Object.values(payload || {}).some((value) => {
    if (Array.isArray(value)) return value.length > 0
    if (!value || typeof value !== 'object') return false
    return Object.keys(value).some((key) => key !== 'siteId' && value[key] !== null && value[key] !== '')
  })
}

function getBoardConfig(boardName) {
  const config = CLOUD_BOARD_CONFIGS[boardName]
  if (!config) {
    throw new Error(`Unknown cloud board mirror: ${boardName}`)
  }
  return config
}

function boardImportStorageKey(siteId, boardKey) {
  return `${BOARD_MIRROR_IMPORT_PREFIX}:${siteId}:${boardKey}`
}

function hasBoardImportCompleted(siteId, boardKey) {
  if (typeof window === 'undefined') return true

  try {
    return window.localStorage.getItem(boardImportStorageKey(siteId, boardKey)) === '1'
  } catch {
    return true
  }
}

function markBoardImportComplete(siteId, boardKey) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(boardImportStorageKey(siteId, boardKey), '1')
  } catch {
    // If localStorage is unavailable, the cloud payload is still saved.
  }
}
