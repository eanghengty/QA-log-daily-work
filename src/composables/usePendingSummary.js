import { computed, ref, watch } from 'vue'
import { db } from '../db/index.js'
import { parsePendingSummaryInput } from '../lib/pendingSummaryParser.js'
import {
  getCloudPendingSummary,
  isCloudTrackerEnabled,
  saveCloudPendingSummary,
} from '../lib/trackerCloud.js'
import { broadcastTrackerChange, useRealtime } from './useRealtime.js'
import { useLiveQuery } from './useLiveQuery.js'
import { getCurrentActivityActor } from './useActivityActor.js'

export const PENDING_SUMMARY_STATUS = {
  TODO: 'todo',
  PARTIAL: 'partial',
  DONE: 'done',
}

const cloudPendingSummaryBySite = new Map()

function createCloudPendingSummaryState() {
  return {
    data: ref(null),
    loading: ref(true),
    error: ref(null),
    ready: false,
    pending: null,
  }
}

function getCloudPendingSummaryState(siteId) {
  if (!cloudPendingSummaryBySite.has(siteId)) {
    cloudPendingSummaryBySite.set(siteId, createCloudPendingSummaryState())
  }
  return cloudPendingSummaryBySite.get(siteId)
}

async function loadCloudPendingSummary(siteId, state, { force = false } = {}) {
  if (!force && state.ready) return state.data.value
  if (state.pending) return await state.pending

  state.loading.value = true
  state.pending = getCloudPendingSummary(siteId)
    .then(async ({ pendingSummary }) => {
      let nextBoard = pendingSummary || null

      if (!nextBoard) {
        const localBoard = await db.pendingSummaries.get(siteId)
        if (localBoard) {
          const { pendingSummary: savedPendingSummary } = await saveCloudPendingSummary(localBoard)
          nextBoard = savedPendingSummary || localBoard
        }
      }

      state.data.value = nextBoard
      state.error.value = null
      state.ready = true

      if (nextBoard) {
        await db.pendingSummaries.put(nextBoard)
      } else {
        await db.pendingSummaries.delete(siteId)
      }

      return state.data.value
    })
    .catch((error) => {
      state.error.value = error
      throw error
    })
    .finally(() => {
      state.loading.value = false
      state.pending = null
    })

  return await state.pending
}

export function usePendingSummary(siteId) {
  const cloudState = isCloudTrackerEnabled() ? getCloudPendingSummaryState(siteId) : null
  const liveState = isCloudTrackerEnabled()
    ? {
        data: cloudState.data,
        loading: cloudState.loading,
        error: cloudState.error,
      }
    : useLiveQuery(() => db.pendingSummaries.get(siteId))

  if (cloudState) {
    void loadCloudPendingSummary(siteId, cloudState)
    const { trackerSyncRefreshToken } = useRealtime()
    watch(
      trackerSyncRefreshToken,
      () => {
        void loadCloudPendingSummary(siteId, cloudState, { force: true })
      },
    )
  }

  const board = liveState.data
  const sections = computed(() => normalizeSections(board.value?.sections || []))
  const summary = computed(() => summarizePendingSummary(sections.value))

  async function loadCurrentBoard() {
    if (isCloudTrackerEnabled()) {
      const state = getCloudPendingSummaryState(siteId)
      const currentBoard = await loadCloudPendingSummary(siteId, state)
      if (currentBoard) {
        return {
          ...currentBoard,
          sections: normalizeSections(currentBoard.sections || []),
        }
      }
      return createEmptyBoard(siteId)
    }

    const currentBoard = await db.pendingSummaries.get(siteId)
    return currentBoard
      ? {
          ...currentBoard,
          sections: normalizeSections(currentBoard.sections || []),
        }
      : createEmptyBoard(siteId)
  }

  async function persistBoard(nextBoard, reason = 'pending-summary-updated') {
    if (isCloudTrackerEnabled()) {
      const { pendingSummary } = await saveCloudPendingSummary(nextBoard)
      const savedBoard = pendingSummary || nextBoard
      await db.pendingSummaries.put(savedBoard)
      const state = getCloudPendingSummaryState(siteId)
      state.data.value = savedBoard
      state.error.value = null
      state.ready = true
      state.loading.value = false
      await broadcastTrackerChange(reason)
      return savedBoard
    }

    await db.pendingSummaries.put(nextBoard)
    return nextBoard
  }

  async function saveBoard(existingBoard, nextSections, reason) {
    return await persistBoard(
      {
        ...existingBoard,
        sections: nextSections,
        updatedAt: new Date().toISOString(),
      },
      reason,
    )
  }

  async function generateFromText(sourceText) {
    const existingBoard = await loadCurrentBoard()
    const existingSections = normalizeSections(existingBoard?.sections || [])

    if (existingSections.length) {
      throw new Error('Pending summary already exists. Delete all main lists before generating again.')
    }

    const parsed = parsePendingSummaryInput(sourceText)
    const nextSections = preserveExistingState(parsed.sections, existingSections)
    const now = new Date().toISOString()

    await persistBoard(
      {
        siteId,
        sections: nextSections,
        sourceText: String(sourceText || ''),
        createdAt: existingBoard?.createdAt || now,
        updatedAt: now,
      },
      'pending-summary-generated',
    )

    return summarizePendingSummary(nextSections)
  }

  async function addSection(sectionData) {
    const existingBoard = await loadCurrentBoard()
    const nextTitle = String(sectionData?.title || '').trim()
    const nextCode = String(sectionData?.code || '').trim()

    if (!nextTitle) {
      throw new Error('Main list name is required.')
    }

    if (findByTitle(existingBoard.sections, nextTitle)) {
      throw new Error('Main list name already exists. Please use a different name.')
    }

    const nextSections = [
      ...normalizeSections(existingBoard.sections || []),
      {
        id: createLocalId('pending-section'),
        code: nextCode,
        title: nextTitle,
        order: (existingBoard.sections || []).length + 1,
        groups: [],
        createdAt: new Date().toISOString(),
      },
    ]

    await saveBoard(existingBoard, nextSections, 'pending-summary-section-added')
    return summarizePendingSummary(nextSections)
  }

  async function addGroup(sectionId, groupData) {
    const existingBoard = await loadCurrentBoard()
    const nextTitle = String(groupData?.title || '').trim()
    const nextCode = String(groupData?.code || '').trim()

    if (!nextTitle) {
      throw new Error('Sub list name is required.')
    }

    let didChange = false
    const nextSections = normalizeSections(existingBoard.sections || []).map((section) => {
      if (section.id !== sectionId) return section

      if (findByTitle(section.groups, nextTitle)) {
        throw new Error('Sub list name already exists in this main list. Please use a different name.')
      }

      didChange = true
      return {
        ...section,
        groups: [
          ...(section.groups || []),
          {
            id: createLocalId('pending-group'),
            code: nextCode,
            title: nextTitle,
            order: (section.groups || []).length + 1,
            items: [],
            createdAt: new Date().toISOString(),
          },
        ],
      }
    })

    if (!didChange) {
      throw new Error('Main list not found.')
    }

    await saveBoard(existingBoard, nextSections, 'pending-summary-group-added')
    return summarizePendingSummary(nextSections)
  }

  async function addItem(sectionId, groupId, itemData) {
    const existingBoard = await loadCurrentBoard()
    const nextTitle = String(itemData?.title || '').trim()

    if (!nextTitle) {
      throw new Error('Pending item name is required.')
    }

    let didChange = false
    const nextSections = normalizeSections(existingBoard.sections || []).map((section) => {
      if (section.id !== sectionId) return section

      return {
        ...section,
        groups: (section.groups || []).map((group) => {
          if (group.id !== groupId) return group

          if (findByTitle(group.items, nextTitle)) {
            throw new Error('Pending item already exists in this sub list. Please use a different name.')
          }

          didChange = true
          return {
            ...group,
            items: [
              ...(group.items || []),
              {
                id: createLocalId('pending-item'),
                title: nextTitle,
                status: PENDING_SUMMARY_STATUS.TODO,
                order: (group.items || []).length + 1,
                actionHistory: [],
                createdAt: new Date().toISOString(),
              },
            ],
          }
        }),
      }
    })

    if (!didChange) {
      throw new Error('Sub list not found.')
    }

    await saveBoard(existingBoard, nextSections, 'pending-summary-item-added')
    return summarizePendingSummary(nextSections)
  }

  async function deleteSection(sectionId) {
    const existingBoard = await loadCurrentBoard()
    const currentSections = normalizeSections(existingBoard.sections || [])
    const nextSections = currentSections
      .filter((section) => section.id !== sectionId)
      .map((section, index) => ({
        ...section,
        order: index + 1,
      }))

    if (nextSections.length === currentSections.length) {
      throw new Error('Main list not found.')
    }

    await saveBoard(existingBoard, nextSections, 'pending-summary-section-deleted')
    return summarizePendingSummary(nextSections)
  }

  async function deleteGroup(sectionId, groupId) {
    const existingBoard = await loadCurrentBoard()
    let didChange = false

    const nextSections = normalizeSections(existingBoard.sections || []).map((section) => {
      if (section.id !== sectionId) return section

      const nextGroups = (section.groups || [])
        .filter((group) => group.id !== groupId)
        .map((group, index) => ({
          ...group,
          order: index + 1,
        }))

      if (nextGroups.length !== (section.groups || []).length) {
        didChange = true
      }

      return {
        ...section,
        groups: nextGroups,
      }
    })

    if (!didChange) {
      throw new Error('Sub list not found.')
    }

    await saveBoard(existingBoard, nextSections, 'pending-summary-group-deleted')
    return summarizePendingSummary(nextSections)
  }

  async function deleteItem(sectionId, groupId, itemId) {
    const existingBoard = await loadCurrentBoard()
    let didChange = false

    const nextSections = normalizeSections(existingBoard.sections || []).map((section) => {
      if (section.id !== sectionId) return section

      return {
        ...section,
        groups: (section.groups || []).map((group) => {
          if (group.id !== groupId) return group

          const nextItems = (group.items || [])
            .filter((item) => item.id !== itemId)
            .map((item, index) => ({
              ...item,
              order: index + 1,
            }))

          if (nextItems.length !== (group.items || []).length) {
            didChange = true
          }

          return {
            ...group,
            items: nextItems,
          }
        }),
      }
    })

    if (!didChange) {
      throw new Error('Pending item not found.')
    }

    await saveBoard(existingBoard, nextSections, 'pending-summary-item-deleted')
    return summarizePendingSummary(nextSections)
  }

  async function setItemStatus(sectionId, groupId, itemId, status, options = {}) {
    const existingBoard = await loadCurrentBoard()
    if (!existingBoard) return

    const nextStatus = normalizeStatus(status)
    const nextPartialComment =
      nextStatus === PENDING_SUMMARY_STATUS.PARTIAL ? String(options.partialComment || '').trim() : ''
    let didChange = false

    const nextSections = normalizeSections(existingBoard.sections || []).map((section) => {
      if (section.id !== sectionId) return section

      return {
        ...section,
        groups: (section.groups || []).map((group) => {
          if (group.id !== groupId) return group

          return {
            ...group,
            items: (group.items || []).map((item) => {
              if (item.id !== itemId) return item

              const previousStatus = normalizeStatus(item.status)
              const previousComment = String(item.partialComment || '').trim()
              if (previousStatus === nextStatus && previousComment === nextPartialComment) return item

              didChange = true
              return {
                ...item,
                status: nextStatus,
                partialComment: nextPartialComment,
                actionHistory: [
                  ...(Array.isArray(item.actionHistory) ? item.actionHistory : []),
                  createActionHistoryEntry(previousStatus, nextStatus, nextPartialComment),
                ],
              }
            }),
          }
        }),
      }
    })

    if (!didChange) return

    await saveBoard(existingBoard, nextSections, 'pending-summary-status-updated')
  }

  async function setItemChecking(sectionId, groupId, itemId, isChecking) {
    const existingBoard = await loadCurrentBoard()
    if (!existingBoard) return

    const nextCheckingState = Boolean(isChecking)
    let didChange = false

    const nextSections = normalizeSections(existingBoard.sections || []).map((section) => {
      if (section.id !== sectionId) return section

      return {
        ...section,
        groups: (section.groups || []).map((group) => {
          if (group.id !== groupId) return group

          return {
            ...group,
            items: (group.items || []).map((item) => {
              if (item.id !== itemId) return item
              if (Boolean(item.isChecking) === nextCheckingState) return item

              didChange = true
              return {
                ...item,
                isChecking: nextCheckingState,
              }
            }),
          }
        }),
      }
    })

    if (!didChange) return

    await saveBoard(existingBoard, nextSections, 'pending-summary-checking-updated')
  }

  return {
    board,
    sections,
    summary,
    generateFromText,
    addSection,
    addGroup,
    addItem,
    deleteSection,
    deleteGroup,
    deleteItem,
    setItemStatus,
    setItemChecking,
  }
}

export function summarizePendingSummary(sections) {
  const groups = sections.flatMap((section) => section.groups || [])
  const items = groups.flatMap((group) => group.items || [])
  const done = items.filter((item) => normalizeStatus(item.status) === PENDING_SUMMARY_STATUS.DONE).length
  const todo = items.length - done

  return {
    sectionCount: sections.length,
    groupCount: groups.length,
    total: items.length,
    done,
    todo,
    completion: items.length ? Math.round((done / items.length) * 100) : 0,
  }
}

function normalizeSections(sections) {
  return (sections || []).map((section, sectionIndex) => ({
    ...section,
    id: section.id || createLocalId('pending-section'),
    code: String(section.code || '').trim(),
    title: String(section.title || '').trim(),
    order: Number(section.order) || sectionIndex + 1,
    groups: (section.groups || []).map((group, groupIndex) => ({
      ...group,
      id: group.id || createLocalId('pending-group'),
      code: String(group.code || '').trim(),
      title: String(group.title || '').trim(),
      order: Number(group.order) || groupIndex + 1,
      items: (group.items || []).map((item, itemIndex) => ({
        ...item,
        id: item.id || createLocalId('pending-item'),
        title: String(item.title || '').trim(),
        status: normalizeStatus(item.status),
        isChecking: Boolean(item.isChecking),
        partialComment: String(item.partialComment || '').trim(),
        order: Number(item.order) || itemIndex + 1,
        actionHistory: normalizeActionHistory(item.actionHistory || []),
      })),
    })),
  }))
}

function normalizeActionHistory(entries) {
  return (entries || []).map((entry) => ({
    id: entry.id || createLocalId('pending-history'),
    fromStatus: normalizeStatus(entry.fromStatus),
    toStatus: normalizeStatus(entry.toStatus),
    comment: String(entry.comment || '').trim(),
    userId: String(entry.userId || '').trim(),
    userName: String(entry.userName || '').trim(),
    userEmail: String(entry.userEmail || '').trim(),
    changedAt: entry.changedAt || new Date().toISOString(),
  }))
}

function preserveExistingState(nextSections, existingSections) {
  return normalizeSections(nextSections).map((section) => {
    const existingSection = findByTitle(existingSections, section.title)

    return {
      ...section,
      id: existingSection?.id || section.id,
      createdAt: existingSection?.createdAt || new Date().toISOString(),
      groups: (section.groups || []).map((group) => {
        const existingGroup = findByTitle(existingSection?.groups, group.title)

        return {
          ...group,
          id: existingGroup?.id || group.id,
          createdAt: existingGroup?.createdAt || new Date().toISOString(),
          items: (group.items || []).map((item) => {
            const existingItem = findByTitle(existingGroup?.items, item.title)

            return {
              ...item,
              id: existingItem?.id || item.id,
              status: normalizeStatus(existingItem?.status || item.status),
              isChecking: Boolean(existingItem?.isChecking),
              partialComment: String(existingItem?.partialComment || item.partialComment || '').trim(),
              actionHistory: normalizeActionHistory(existingItem?.actionHistory || item.actionHistory || []),
              createdAt: existingItem?.createdAt || new Date().toISOString(),
            }
          }),
        }
      }),
    }
  })
}

function findByTitle(collection, title) {
  const key = normalizeKey(title)
  return (collection || []).find((item) => normalizeKey(item.title) === key)
}

function createEmptyBoard(siteId) {
  const now = new Date().toISOString()
  return {
    siteId,
    sections: [],
    sourceText: '',
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeStatus(status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === PENDING_SUMMARY_STATUS.DONE) return PENDING_SUMMARY_STATUS.DONE
  if (normalized === PENDING_SUMMARY_STATUS.PARTIAL) return PENDING_SUMMARY_STATUS.PARTIAL
  return PENDING_SUMMARY_STATUS.TODO
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function createActionHistoryEntry(fromStatus, toStatus, comment = '') {
  return {
    id: createLocalId('pending-history'),
    fromStatus: normalizeStatus(fromStatus),
    toStatus: normalizeStatus(toStatus),
    comment: String(comment || '').trim(),
    ...getCurrentActivityActor(),
    changedAt: new Date().toISOString(),
  }
}

function createLocalId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}
