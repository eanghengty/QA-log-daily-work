import { PENDING_SUMMARY_STATUS } from '../composables/usePendingSummary.js'

export function buildPendingSummaryProgressText(sections) {
  const orderedSections = toOrderedList(sections)
  const pendingLines = []
  const doneLines = []
  let hasPendingItems = false
  let hasDoneItems = false

  orderedSections.forEach((section, sectionIndex) => {
    const orderedGroups = toOrderedList(section.groups)
    const sectionItems = orderedGroups.flatMap((group) => toOrderedList(group.items))
    const sectionDone = sectionItems.filter(isDoneItem).length
    const sectionTodo = sectionItems.length - sectionDone
    const mainLine =
      `${formatMainCode(section.code, sectionIndex)} ${formatTitle(section.title, 'Main list')} (${formatCounts(sectionDone, sectionItems.length, sectionTodo)})`
    const pendingSectionLines = []
    const doneSectionLines = []

    orderedGroups.forEach((group, groupIndex) => {
      const orderedItems = toOrderedList(group.items)
      const groupDone = orderedItems.filter(isDoneItem).length
      const groupTodo = orderedItems.length - groupDone
      const groupLine =
        `  ${formatGroupCode(sectionIndex, groupIndex, group.code)} ${formatTitle(group.title, 'Sub list')} (${formatCounts(groupDone, orderedItems.length, groupTodo)})`
      const pendingGroupItems = orderedItems.filter((item) => !isDoneItem(item))
      const doneGroupItems = orderedItems.filter(isDoneItem)

      if (pendingGroupItems.length) {
        pendingSectionLines.push(groupLine)
        pendingGroupItems.forEach((item) => {
          pendingSectionLines.push(`    - ${formatPendingItemLabel(item)}`)
        })
      }

      if (doneGroupItems.length) {
        doneSectionLines.push(groupLine)
        doneGroupItems.forEach((item) => {
          doneSectionLines.push(`    - ${formatTitle(item.title, 'Pending item')} (done)`)
        })
      }
    })

    if (pendingSectionLines.length) {
      hasPendingItems = true
      pendingLines.push(mainLine, ...pendingSectionLines)
    }

    if (doneSectionLines.length) {
      hasDoneItems = true
      doneLines.push(mainLine, ...doneSectionLines)
    }
  })

  if (!hasPendingItems && !hasDoneItems) {
    return 'No pending items.'
  }

  if (!hasDoneItems) {
    return pendingLines.join('\n')
  }

  if (!hasPendingItems) {
    return ['Pending clear today:', ...doneLines].join('\n')
  }

  return [...pendingLines, '', 'Pending clear today:', ...doneLines].join('\n')
}

function toOrderedList(collection) {
  return [...(Array.isArray(collection) ? collection : [])].sort((left, right) => {
    const leftOrder = Number(left?.order) || 0
    const rightOrder = Number(right?.order) || 0
    return leftOrder - rightOrder
  })
}

function formatMainCode(code, sectionIndex) {
  const cleanCode = String(code || '').trim().replace(/\.+$/, '')
  return cleanCode ? `${cleanCode}.` : `${sectionIndex + 1}.`
}

function formatGroupCode(sectionIndex, groupIndex, code) {
  const cleanCode = String(code || '').trim().replace(/\.+$/, '')
  return cleanCode || `${sectionIndex + 1}.${groupIndex + 1}`
}

function formatTitle(value, fallback) {
  const title = String(value || '').trim()
  return title || fallback
}

function formatCounts(done, total, todo) {
  return `done: ${done}/${total}, not done: ${todo}`
}

function formatPendingItemLabel(item) {
  const title = formatTitle(item?.title, 'Pending item')
  const status = String(item?.status || '').trim().toLowerCase()
  if (status === PENDING_SUMMARY_STATUS.PARTIAL) {
    const comment = String(item?.partialComment || '').trim()
    return comment ? `${title} (partial done: ${comment})` : `${title} (partial done)`
  }
  return `${title} (not done)`
}

function isDoneItem(item) {
  return String(item?.status || '').trim().toLowerCase() === PENDING_SUMMARY_STATUS.DONE
}
