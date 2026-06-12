import * as XLSX from 'xlsx'
import {
  BASE_CHECKLIST_COLUMNS,
  CHECKLIST_COLUMN_TYPE,
  normalizeChecklistCustomColumns,
  normalizeChecklistFieldValue,
} from './checklistColumns.js'

const TEMPLATE_HEADERS = BASE_CHECKLIST_COLUMNS.map((column) => column.label)
const STATUS_DONE = 'done'
const STATUS_NOT_DONE = 'not done'
const STATUS_NA = 'n/a'
const BASE_WIDTHS = [28, 40, 16, 36]
const EXPORT_FIXED_WIDTHS = [28, 16, 36]
const TASK_LEVEL_WIDTH = 40
const CUSTOM_COLUMN_WIDTH = 22
const LOG_COLUMN_WIDTH = 52
const TEMPLATE_TASK_DEPTH = 2

export const CHECKLIST_EXPORT_HEADERS = [...TEMPLATE_HEADERS, 'Log']
export const CHECKLIST_EXPORT_COLS = buildChecklistColumnWidths([])

export function downloadChecklistTemplate(customColumns = []) {
  const workbook = XLSX.utils.book_new()
  const normalizedCustomColumns = normalizeChecklistCustomColumns(customColumns)
  const worksheet = XLSX.utils.aoa_to_sheet([
    [
      'Main task',
      ...buildTaskLevelHeaders(TEMPLATE_TASK_DEPTH),
      'Status',
      'Comment',
      ...normalizedCustomColumns.map((column) => column.label),
    ],
  ])
  worksheet['!cols'] = buildChecklistColumnWidths(normalizedCustomColumns, false, TEMPLATE_TASK_DEPTH)

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Checklist Template')
  XLSX.writeFile(workbook, 'site-checklist-template.xlsx')
}

export function downloadChecklistExport(checklists, siteName = 'site', customColumns = []) {
  const workbook = XLSX.utils.book_new()
  const normalizedCustomColumns = normalizeChecklistCustomColumns(customColumns)
  const rows = buildChecklistExportRows(checklists || [], normalizedCustomColumns)
  const worksheet = XLSX.utils.aoa_to_sheet(rows)

  worksheet['!cols'] = buildChecklistColumnWidths(
    normalizedCustomColumns,
    true,
    getExportDepthFromRows(rows)
  )

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Checklist Export')
  XLSX.writeFile(workbook, `${toFileSlug(siteName)}-checklist-export.xlsx`)
}

export function buildChecklistExportRows(checklists, customColumns = []) {
  const normalizedCustomColumns = normalizeChecklistCustomColumns(customColumns)
  const taskDepth = getMaxChecklistDepth(checklists || [])
  const exportHeaders = [
    'Main task',
    ...buildTaskLevelHeaders(taskDepth),
    'Status',
    'Comment',
    ...normalizedCustomColumns.map((column) => column.label),
    'Log',
  ]
  return [exportHeaders, ...buildChecklistRows(checklists || [], normalizedCustomColumns, taskDepth)]
}

export async function parseChecklistSpreadsheet(file) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]

  if (!firstSheetName) {
    throw new Error('The workbook is empty.')
  }

  const worksheet = workbook.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    blankrows: false,
    defval: '',
  })

  if (!rows.length) {
    throw new Error('The worksheet is empty.')
  }

  const headerCells = rows[0].map((value) => String(value || '').trim())
  const normalizedHeaders = headerCells.map((value) => normalizeHeader(value))
  const mainTaskIndex = normalizedHeaders.findIndex((value) => value === 'maintask')
  const subTaskIndex = normalizedHeaders.findIndex((value) => value === 'subtask')
  const subTaskLevelIndexes = normalizedHeaders
    .map((value, index) => ({ value, index }))
    .filter((column) => /^subtasklevel\d*$/.test(column.value))
    .map((column) => column.index)
  const statusIndex = normalizedHeaders.findIndex((value) => value === 'status')
  const commentIndex = normalizedHeaders.findIndex((value) => value === 'comment')
  const logIndex = normalizedHeaders.findIndex((value) => value === 'log')

  if (mainTaskIndex === -1 || subTaskIndex === -1) {
    throw new Error('The file must contain "Main task" and "Sub task" columns.')
  }

  const customColumns = headerCells
    .map((header, index) => ({ header, normalized: normalizedHeaders[index], index }))
    .filter((column) =>
      column.header &&
      !['maintask', 'subtask', 'status', 'comment', 'log'].includes(column.normalized)
    )
    .map((column) => ({
      id: createImportColumnId(column.normalized || column.header),
      label: column.header,
      type: CHECKLIST_COLUMN_TYPE.TEXT,
      sourceIndex: column.index,
    }))

  const groups = []
  const groupMap = new Map()
  let lastMainTask = ''

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2
    const rawMainTask = toCellText(row[mainTaskIndex])
    const taskPath = [subTaskIndex, ...subTaskLevelIndexes]
      .map((columnIndex) => toCellText(row[columnIndex]))
      .filter(Boolean)
    const rawStatus = statusIndex === -1 ? '' : toCellText(row[statusIndex])
    const rawComment = commentIndex === -1 ? '' : toCellText(row[commentIndex])

    if (rawMainTask) {
      lastMainTask = rawMainTask
    }

    const mainTask = rawMainTask || lastMainTask

    if (!mainTask && !taskPath.length) return

    if (!mainTask) {
      throw new Error(`Row ${rowNumber} is missing a main task.`)
    }

    const key = normalizeKey(mainTask)
    if (!groupMap.has(key)) {
      const group = { title: mainTask, items: [] }
      groupMap.set(key, group)
      groups.push(group)
    }

    if (taskPath.length) {
      const fieldValues = Object.fromEntries(
        customColumns.map((column) => [
          column.id,
          normalizeChecklistFieldValue(row[column.sourceIndex], CHECKLIST_COLUMN_TYPE.TEXT),
        ])
      )

      addParsedChecklistItem(groupMap.get(key).items, taskPath, {
        status: normalizeImportedStatus(rawStatus),
        comment: rawComment,
        fieldValues,
      })
    }
  })

  if (!groups.length) {
    throw new Error('No checklist rows were found in the file.')
  }

  return {
    groups,
    customColumns: customColumns.map(({ sourceIndex, ...column }) => column),
  }
}

function buildChecklistColumnWidths(customColumns, includeLog = true, taskDepth = 1) {
  const widths = [
    ...(taskDepth > 1
      ? [28, ...Array.from({ length: Math.max(taskDepth, 1) }, () => TASK_LEVEL_WIDTH), ...EXPORT_FIXED_WIDTHS]
      : BASE_WIDTHS),
    ...customColumns.map(() => CUSTOM_COLUMN_WIDTH),
  ]
  if (includeLog) widths.push(LOG_COLUMN_WIDTH)
  return widths.map((wch) => ({ wch }))
}

function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function toCellText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function addParsedChecklistItem(items, path, itemData) {
  const [title, ...restPath] = path
  if (!title) return

  let item = items.find((entry) => normalizeKey(entry.title) === normalizeKey(title))
  if (!item) {
    item = {
      title,
      status: STATUS_NOT_DONE,
      comment: '',
      fieldValues: {},
      childItems: [],
    }
    items.push(item)
  }

  if (!restPath.length) {
    item.status = itemData.status
    item.comment = itemData.comment
    item.fieldValues = itemData.fieldValues
    return
  }

  item.childItems = Array.isArray(item.childItems) ? item.childItems : []
  addParsedChecklistItem(item.childItems, restPath, itemData)
}

function buildChecklistRows(checklists, customColumns, exportDepth) {
  return checklists.flatMap((checklist) => {
    const items = checklist.items || []

    if (!items.length) {
      return [[
        checklist.title || '',
        ...Array.from({ length: exportDepth }, () => ''),
        '',
        '',
        ...customColumns.map(() => ''),
        '',
      ]]
    }

    return items.flatMap((item) =>
      buildChecklistItemRows(checklist.title, item, customColumns, [item.title], exportDepth)
    )
  })
}

function buildChecklistItemRows(mainTask, item, customColumns, path, exportDepth) {
  return [
    buildChecklistItemRow(mainTask, item, customColumns, path, exportDepth),
    ...getChildItems(item).flatMap((childItem) =>
      buildChecklistItemRows(
        mainTask,
        childItem,
        customColumns,
        [...path, childItem.title],
        exportDepth
      )
    ),
  ]
}

function buildChecklistItemRow(mainTask, item, customColumns, path, exportDepth) {
  return [
    mainTask || '',
    ...Array.from({ length: exportDepth }, (_, index) => path[index] || ''),
    formatExportStatus(item.status),
    item.comment || '',
    ...customColumns.map((column) => item.fieldValues?.[column.id] || ''),
    formatStatusHistory(item.statusHistory),
  ]
}

function getChildItems(item) {
  return Array.isArray(item?.childItems) ? item.childItems : []
}

function getMaxChecklistDepth(checklists) {
  return Math.max(
    1,
    ...(checklists || []).flatMap((checklist) =>
      (checklist.items || []).map((item) => getItemDepth(item))
    )
  )
}

function getItemDepth(item) {
  const childDepths = getChildItems(item).map((childItem) => getItemDepth(childItem))
  return 1 + (childDepths.length ? Math.max(...childDepths) : 0)
}

function buildTaskLevelHeaders(taskDepth) {
  return Array.from({ length: Math.max(taskDepth, 1) }, (_, index) =>
    index === 0 ? 'Sub task' : `Subtask level ${index + 1}`
  )
}

function getExportDepthFromRows(rows) {
  const header = rows?.[0] || []
  const statusIndex = header.findIndex((value) => value === 'Status')
  return statusIndex > 0 ? statusIndex - 1 : 1
}

function formatExportStatus(status) {
  const normalizedStatus = normalizeImportedStatus(status)

  if (normalizedStatus === STATUS_DONE) return 'Done'
  if (normalizedStatus === STATUS_NA) return 'N/A'
  return 'Not done'
}

function normalizeImportedStatus(value) {
  const normalized = normalizeHeader(value)

  if (normalized === 'done' || normalized === 'complete' || normalized === 'completed') {
    return STATUS_DONE
  }

  if (normalized === 'na' || normalized === 'nota' || normalized === 'notapplicable') {
    return STATUS_NA
  }

  return STATUS_NOT_DONE
}

function toFileSlug(value) {
  const normalized = String(value || 'site')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'site'
}

function formatStatusHistory(entries) {
  if (!Array.isArray(entries) || !entries.length) return ''

  return entries
    .map((entry) => {
      const changedAt = formatHistoryDate(entry?.changedAt)
      const fromStatus = formatExportStatus(entry?.fromStatus)
      const toStatus = formatExportStatus(entry?.toStatus)
      return `${changedAt}: ${fromStatus} -> ${toStatus}`
    })
    .join(' | ')
}

function formatHistoryDate(value) {
  if (!value) return 'Unknown date'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function createImportColumnId(value) {
  const slug = normalizeHeader(value) || 'column'
  return `import-${slug}`
}
