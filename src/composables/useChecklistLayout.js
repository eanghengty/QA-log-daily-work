import { computed, watch } from 'vue'
import { db } from '../db/index.js'
import { useLiveQuery } from './useLiveQuery.js'
import {
  ensureCloudBoardMirror,
  isCloudBoardMirrorEnabled,
  saveCloudBoardMirror,
} from '../lib/cloudBoardMirror.js'
import {
  BASE_CHECKLIST_COLUMNS,
  createChecklistColumnId,
  normalizeChecklistColumnType,
  normalizeChecklistCustomColumns,
} from '../lib/checklistColumns.js'
import { broadcastTrackerChange, useRealtime } from './useRealtime.js'

export function useChecklistLayout(siteId) {
  setupCloudBoardMirror(siteId)

  const { data: layout } = useLiveQuery(() => db.checklistLayouts.get(siteId))

  const customColumns = computed(() =>
    normalizeChecklistCustomColumns(layout.value?.customColumns || [])
  )

  const visibleColumns = computed(() => [...BASE_CHECKLIST_COLUMNS, ...customColumns.value])

  async function addCustomColumn(column) {
    const label = String(column?.label || '').trim()
    if (!label) {
      throw new Error('Column name is required.')
    }

    const existing = customColumns.value.find(
      (item) => item.label.toLowerCase() === label.toLowerCase()
    )
    if (existing) {
      throw new Error('Column name already exists.')
    }

    const nextColumns = [
      ...customColumns.value,
      {
        id: createChecklistColumnId(label),
        label,
        type: normalizeChecklistColumnType(column?.type),
      },
    ]

    await saveCustomColumns(nextColumns)
  }

  async function mergeImportedCustomColumns(columns) {
    const normalized = normalizeChecklistCustomColumns(columns)
    if (!normalized.length) return customColumns.value

    const merged = [...customColumns.value]

    for (const column of normalized) {
      const exists = merged.find((item) => item.label.toLowerCase() === column.label.toLowerCase())
      if (!exists) {
        merged.push({
          id: createChecklistColumnId(column.label),
          label: column.label,
          type: normalizeChecklistColumnType(column.type),
        })
      }
    }

    await saveCustomColumns(merged)
    return merged
  }

  async function removeCustomColumn(columnId) {
    const nextColumns = customColumns.value.filter((column) => column.id !== columnId)
    await saveCustomColumns(nextColumns)
    return nextColumns
  }

  async function saveCustomColumns(columns) {
    await db.checklistLayouts.put({
      siteId,
      customColumns: normalizeChecklistCustomColumns(columns),
      updatedAt: new Date().toISOString(),
    })
    await persistCloudBoard(siteId, 'site-checklist-layout-updated')
  }

  return {
    layout,
    customColumns,
    visibleColumns,
    addCustomColumn,
    removeCustomColumn,
    mergeImportedCustomColumns,
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
