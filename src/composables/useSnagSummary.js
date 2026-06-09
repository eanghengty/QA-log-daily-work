import { computed, ref, watch } from 'vue'
import { db } from '../db/index.js'
import { parsePendingSummaryInput } from '../lib/pendingSummaryParser.js'
import {
  getCloudSnagSummary,
  isCloudTrackerEnabled,
  saveCloudSnagSummary,
} from '../lib/trackerCloud.js'
import { broadcastTrackerChange, useRealtime } from './useRealtime.js'
import { useLiveQuery } from './useLiveQuery.js'
import { getCurrentActivityActor } from './useActivityActor.js'

export const SNAG_SUMMARY_STATUS = {
  TODO: 'todo',
  PARTIAL: 'partial',
  DONE: 'done',
}

export const SNAG_SUMMARY_CATEGORIES = ['GDC', 'PTA', 'Nokia']

const cloudSnagSummaryBySite = new Map()

function createCloudSnagSummaryState() {
  return {
    data: ref(null),
    loading: ref(true),
    error: ref(null),
    ready: false,
    pending: null,
  }
}

function getCloudSnagSummaryState(siteId) {
  if (!cloudSnagSummaryBySite.has(siteId)) {
    cloudSnagSummaryBySite.set(siteId, createCloudSnagSummaryState())
  }
  return cloudSnagSummaryBySite.get(siteId)
}

async function loadCloudSnagSummary(siteId, state, { force = false } = {}) {
  if (!force && state.ready) return state.data.value
  if (state.pending) return await state.pending

  state.loading.value = true
  state.pending = getCloudSnagSummary(siteId)
    .then(async ({ snagSummary }) => {
      let nextBoard = snagSummary || null

      if (!nextBoard) {
        const localBoard = await db.snagSummaries.get(siteId)
        if (localBoard) {
          const { snagSummary: savedSnagSummary } = await saveCloudSnagSummary(localBoard)
          nextBoard = savedSnagSummary || localBoard
        }
      }

      state.data.value = nextBoard
      state.error.value = null
      state.ready = true

      if (nextBoard) {
        await db.snagSummaries.put(nextBoard)
      } else {
        await db.snagSummaries.delete(siteId)
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

export function useSnagSummary(siteId) {
  const cloudState = isCloudTrackerEnabled() ? getCloudSnagSummaryState(siteId) : null
  const liveState = isCloudTrackerEnabled()
    ? {
        data: cloudState.data,
        loading: cloudState.loading,
        error: cloudState.error,
      }
    : useLiveQuery(() => db.snagSummaries.get(siteId))

  if (cloudState) {
    void loadCloudSnagSummary(siteId, cloudState)
    const { trackerSyncRefreshToken } = useRealtime()
    watch(
      trackerSyncRefreshToken,
      () => {
        void loadCloudSnagSummary(siteId, cloudState, { force: true })
      },
    )
  }

  const board = liveState.data
  const sections = computed(() => normalizeSections(board.value?.sections || []))
  const summary = computed(() => summarizeSnagSummary(sections.value))

  async function loadCurrentBoard() {
    if (isCloudTrackerEnabled()) {
      const state = getCloudSnagSummaryState(siteId)
      const currentBoard = await loadCloudSnagSummary(siteId, state)
      if (currentBoard) {
        return {
          ...currentBoard,
          sections: normalizeSections(currentBoard.sections || []),
        }
      }
      return createEmptyBoard(siteId)
    }

    const currentBoard = await db.snagSummaries.get(siteId)
    return currentBoard
      ? {
          ...currentBoard,
          sections: normalizeSections(currentBoard.sections || []),
        }
      : createEmptyBoard(siteId)
  }

  async function persistBoard(nextBoard, reason = 'snag-summary-updated') {
    if (isCloudTrackerEnabled()) {
      const { snagSummary } = await saveCloudSnagSummary(nextBoard)
      const savedBoard = snagSummary || nextBoard
      await db.snagSummaries.put(savedBoard)
      const state = getCloudSnagSummaryState(siteId)
      state.data.value = savedBoard
      state.error.value = null
      state.ready = true
      state.loading.value = false
      await broadcastTrackerChange(reason)
      return savedBoard
    }

    await db.snagSummaries.put(nextBoard)
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

  async function generateFromText(sourceText, options = {}) {
    const existingBoard = await loadCurrentBoard()
    const existingSections = normalizeSections(existingBoard?.sections || [])
    const parsed = parsePendingSummaryInput(sourceText)
    const category = normalizeCategory(options.category)
    const { sections: nextSections, skippedDuplicates } = mergeGeneratedSections(
      existingSections,
      assignCategoryToSections(parsed.sections, category),
    )
    const now = new Date().toISOString()

    await persistBoard(
      {
        siteId,
        sections: nextSections,
        sourceText: [existingBoard?.sourceText, String(sourceText || '')].filter(Boolean).join('\n\n'),
        createdAt: existingBoard?.createdAt || now,
        updatedAt: now,
      },
      'snag-summary-generated',
    )

    return {
      ...summarizeSnagSummary(nextSections),
      skippedDuplicates,
      category,
    }
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
        id: createLocalId('snag-section'),
        code: nextCode,
        title: nextTitle,
        order: (existingBoard.sections || []).length + 1,
        groups: [],
        createdAt: new Date().toISOString(),
      },
    ]

    await saveBoard(existingBoard, nextSections, 'snag-summary-section-added')
    return summarizeSnagSummary(nextSections)
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
            id: createLocalId('snag-group'),
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

    await saveBoard(existingBoard, nextSections, 'snag-summary-group-added')
    return summarizeSnagSummary(nextSections)
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
                id: createLocalId('snag-item'),
                title: nextTitle,
                category: normalizeCategory(itemData?.category),
                status: SNAG_SUMMARY_STATUS.TODO,
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

    await saveBoard(existingBoard, nextSections, 'snag-summary-item-added')
    return summarizeSnagSummary(nextSections)
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

    await saveBoard(existingBoard, nextSections, 'snag-summary-section-deleted')
    return summarizeSnagSummary(nextSections)
  }

  async function renameSection(sectionId, sectionData) {
    const existingBoard = await loadCurrentBoard()
    const nextTitle = String(sectionData?.title || '').trim()
    const nextCode = String(sectionData?.code || '').trim()

    if (!nextTitle) {
      throw new Error('Main list name is required.')
    }

    const currentSections = normalizeSections(existingBoard.sections || [])
    if (currentSections.some((section) => section.id !== sectionId && normalizeKey(section.title) === normalizeKey(nextTitle))) {
      throw new Error('Main list name already exists. Please use a different name.')
    }

    let didChange = false
    const nextSections = currentSections.map((section) => {
      if (section.id !== sectionId) return section
      didChange = true
      return {
        ...section,
        code: nextCode,
        title: nextTitle,
      }
    })

    if (!didChange) {
      throw new Error('Main list not found.')
    }

    await saveBoard(existingBoard, nextSections, 'snag-summary-section-renamed')
    return summarizeSnagSummary(nextSections)
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

    await saveBoard(existingBoard, nextSections, 'snag-summary-group-deleted')
    return summarizeSnagSummary(nextSections)
  }

  async function renameGroup(sectionId, groupId, groupData) {
    const existingBoard = await loadCurrentBoard()
    const nextTitle = String(groupData?.title || '').trim()
    const nextCode = String(groupData?.code || '').trim()

    if (!nextTitle) {
      throw new Error('Sub list name is required.')
    }

    let didChange = false
    const nextSections = normalizeSections(existingBoard.sections || []).map((section) => {
      if (section.id !== sectionId) return section

      if ((section.groups || []).some((group) => group.id !== groupId && normalizeKey(group.title) === normalizeKey(nextTitle))) {
        throw new Error('Sub list name already exists in this main list. Please use a different name.')
      }

      return {
        ...section,
        groups: (section.groups || []).map((group) => {
          if (group.id !== groupId) return group
          didChange = true
          return {
            ...group,
            code: nextCode,
            title: nextTitle,
          }
        }),
      }
    })

    if (!didChange) {
      throw new Error('Sub list not found.')
    }

    await saveBoard(existingBoard, nextSections, 'snag-summary-group-renamed')
    return summarizeSnagSummary(nextSections)
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

    await saveBoard(existingBoard, nextSections, 'snag-summary-item-deleted')
    return summarizeSnagSummary(nextSections)
  }

  async function setItemStatus(sectionId, groupId, itemId, status, options = {}) {
    const existingBoard = await loadCurrentBoard()
    if (!existingBoard) return

    const nextStatus = normalizeStatus(status)
    const nextPartialComment =
      nextStatus === SNAG_SUMMARY_STATUS.PARTIAL ? String(options.partialComment || '').trim() : ''
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

    await saveBoard(existingBoard, nextSections, 'snag-summary-status-updated')
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

    await saveBoard(existingBoard, nextSections, 'snag-summary-checking-updated')
  }

  async function setItemCategory(sectionId, groupId, itemId, category) {
    const existingBoard = await loadCurrentBoard()
    if (!existingBoard) return

    const nextCategory = normalizeCategory(category)
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
              if (normalizeCategory(item.category) === nextCategory) return item

              didChange = true
              return {
                ...item,
                category: nextCategory,
              }
            }),
          }
        }),
      }
    })

    if (!didChange) return

    await saveBoard(existingBoard, nextSections, 'snag-summary-category-updated')
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
    renameSection,
    renameGroup,
    setItemStatus,
    setItemChecking,
    setItemCategory,
  }
}

export function summarizeSnagSummary(sections) {
  const groups = sections.flatMap((section) => section.groups || [])
  const items = groups.flatMap((group) => group.items || [])
  const done = items.filter((item) => normalizeStatus(item.status) === SNAG_SUMMARY_STATUS.DONE).length
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
    id: section.id || createLocalId('snag-section'),
    code: String(section.code || '').trim(),
    title: String(section.title || '').trim(),
    order: Number(section.order) || sectionIndex + 1,
    groups: (section.groups || []).map((group, groupIndex) => ({
      ...group,
      id: group.id || createLocalId('snag-group'),
      code: String(group.code || '').trim(),
      title: String(group.title || '').trim(),
      order: Number(group.order) || groupIndex + 1,
      items: (group.items || []).map((item, itemIndex) => ({
        ...item,
        id: item.id || createLocalId('snag-item'),
        title: String(item.title || '').trim(),
        category: normalizeCategory(item.category),
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
    id: entry.id || createLocalId('snag-history'),
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
              category: normalizeCategory(existingItem?.category || item.category),
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

function assignCategoryToSections(sections, category) {
  return normalizeSections(sections).map((section) => ({
    ...section,
    groups: (section.groups || []).map((group) => ({
      ...group,
      items: (group.items || []).map((item) => ({
        ...item,
        category,
      })),
    })),
  }))
}

function mergeGeneratedSections(existingSections, generatedSections) {
  const nextSections = normalizeSections(existingSections)
  let skippedDuplicates = 0

  normalizeSections(generatedSections).forEach((section) => {
    const existingSection = findByTitle(nextSections, section.title)

    if (!existingSection) {
      nextSections.push({
        ...section,
        order: nextSections.length + 1,
        createdAt: section.createdAt || new Date().toISOString(),
      })
      return
    }

    ;(section.groups || []).forEach((group) => {
      const existingGroup = findByTitle(existingSection.groups, group.title)

      if (!existingGroup) {
        existingSection.groups.push({
          ...group,
          order: existingSection.groups.length + 1,
          createdAt: group.createdAt || new Date().toISOString(),
        })
        return
      }

      ;(group.items || []).forEach((item) => {
        if (findByTitle(existingGroup.items, item.title)) {
          skippedDuplicates += 1
          return
        }

        existingGroup.items.push({
          ...item,
          order: existingGroup.items.length + 1,
          createdAt: item.createdAt || new Date().toISOString(),
        })
      })
    })
  })

  return {
    sections: normalizeSections(nextSections),
    skippedDuplicates,
  }
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
  if (normalized === SNAG_SUMMARY_STATUS.DONE) return SNAG_SUMMARY_STATUS.DONE
  if (normalized === SNAG_SUMMARY_STATUS.PARTIAL) return SNAG_SUMMARY_STATUS.PARTIAL
  return SNAG_SUMMARY_STATUS.TODO
}

function normalizeCategory(category) {
  const normalized = String(category || '').trim().toLowerCase()
  return SNAG_SUMMARY_CATEGORIES.find((option) => option.toLowerCase() === normalized) || SNAG_SUMMARY_CATEGORIES[0]
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function createActionHistoryEntry(fromStatus, toStatus, comment = '') {
  return {
    id: createLocalId('snag-history'),
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

