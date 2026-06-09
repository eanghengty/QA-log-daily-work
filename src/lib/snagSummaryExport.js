import { SNAG_SUMMARY_STATUS } from '../composables/useSnagSummary.js'

export function buildSnagSummaryProgressText(sections, category = '') {
  const orderedSections = toOrderedList(sections)
  const pendingLines = []
  const doneLines = []
  const categoryFilter = String(category || '').trim()

  orderedSections.forEach((section, sectionIndex) => {
    const orderedGroups = toOrderedList(section.groups)
    const sectionItems = orderedGroups.flatMap((group) => filterByCategory(toOrderedList(group.items), categoryFilter))
    const sectionDone = sectionItems.filter(isDoneItem).length
    const sectionTodo = sectionItems.length - sectionDone
    const pendingMainLine =
      `${formatMainCode(section.code, sectionIndex)} ${formatTitle(section.title, 'Main list')} (${formatNotDoneCount(sectionTodo)})`
    const doneMainLine =
      `${formatMainCode(section.code, sectionIndex)} ${formatTitle(section.title, 'Main list')} (${formatDoneCount(sectionDone)})`
    const pendingSectionLines = []
    const doneSectionLines = []

    orderedGroups.forEach((group, groupIndex) => {
      const orderedItems = filterByCategory(toOrderedList(group.items), categoryFilter)
      const groupLine = `  ${formatGroupCode(sectionIndex, groupIndex, group.code)} ${formatTitle(group.title, 'Sub list')}`
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
          doneSectionLines.push(`    - ${formatTitle(item.title, 'Snag item')} (done)`)
        })
      }
    })

    if (pendingSectionLines.length) {
      pendingLines.push(pendingMainLine, ...pendingSectionLines)
    }

    if (doneSectionLines.length) {
      doneLines.push(doneMainLine, ...doneSectionLines)
    }
  })

  const hasPendingItems = pendingLines.length > 0
  const hasDoneItems = doneLines.length > 0

  if (!hasPendingItems && !hasDoneItems) {
    return 'No Snag items.'
  }

  if (!hasDoneItems) {
    return pendingLines.join('\n')
  }

  if (!hasPendingItems) {
    return ['Pending clear today:', ...doneLines].join('\n')
  }

  return [...pendingLines, '', 'Pending clear today:', ...doneLines].join('\n')
}

function filterByCategory(items, category) {
  if (!category) return items
  const normalized = category.toLowerCase()
  return items.filter((item) => String(item?.category || 'GDC').trim().toLowerCase() === normalized)
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

function formatNotDoneCount(count) {
  return `not done: ${count}`
}

function formatDoneCount(count) {
  return `done: ${count}`
}

function formatPendingItemLabel(item) {
  const title = formatTitle(item?.title, 'Snag item')
  const status = String(item?.status || '').trim().toLowerCase()
  if (status === SNAG_SUMMARY_STATUS.PARTIAL) {
    const comment = String(item?.partialComment || '').trim()
    return comment ? `${title} (partial done: ${comment})` : `${title} (partial done)`
  }
  return title
}

function isDoneItem(item) {
  return String(item?.status || '').trim().toLowerCase() === SNAG_SUMMARY_STATUS.DONE
}

