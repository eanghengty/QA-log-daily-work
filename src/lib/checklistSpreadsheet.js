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
const CUSTOM_COLUMN_WIDTH = 22
const LOG_COLUMN_WIDTH = 52

export const CHECKLIST_EXPORT_HEADERS = [...TEMPLATE_HEADERS, 'Log']
export const CHECKLIST_EXPORT_COLS = buildChecklistColumnWidths([])

export function downloadChecklistTemplate(customColumns = []) {
  const workbook = XLSX.utils.book_new()
  const normalizedCustomColumns = normalizeChecklistCustomColumns(customColumns)
  const worksheet = XLSX.utils.aoa_to_sheet([
    [...TEMPLATE_HEADERS, ...normalizedCustomColumns.map((column) => column.label)],
  ])
  worksheet['!cols'] = buildChecklistColumnWidths(normalizedCustomColumns, false)

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Checklist Template')
  XLSX.writeFile(workbook, 'site-checklist-template.xlsx')
}

export function downloadChecklistExport(checklists, siteName = 'site', customColumns = []) {
  const workbook = XLSX.utils.book_new()
  const normalizedCustomColumns = normalizeChecklistCustomColumns(customColumns)
  const rows = buildChecklistExportRows(checklists || [], normalizedCustomColumns)
  const worksheet = XLSX.utils.aoa_to_sheet(rows)

  worksheet['!cols'] = buildChecklistColumnWidths(normalizedCustomColumns, true)

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Checklist Export')
  XLSX.writeFile(workbook, `${toFileSlug(siteName)}-checklist-export.xlsx`)
}

export function buildChecklistExportRows(checklists, customColumns = []) {
  const normalizedCustomColumns = normalizeChecklistCustomColumns(customColumns)
  const exportHeaders = [
    ...TEMPLATE_HEADERS,
    ...normalizedCustomColumns.map((column) => column.label),
    'Log',
  ]
  return [exportHeaders, ...buildChecklistRows(checklists || [], normalizedCustomColumns)]
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
    const rawSubTask = toCellText(row[subTaskIndex])
    const rawStatus = statusIndex === -1 ? '' : toCellText(row[statusIndex])
    const rawComment = commentIndex === -1 ? '' : toCellText(row[commentIndex])

    if (rawMainTask) {
      lastMainTask = rawMainTask
    }

    const mainTask = rawMainTask || lastMainTask
    const subTask = rawSubTask

    if (!mainTask && !subTask) return

    if (!mainTask) {
      throw new Error(`Row ${rowNumber} is missing a main task.`)
    }

    const key = normalizeKey(mainTask)
    if (!groupMap.has(key)) {
      const group = { title: mainTask, items: [] }
      groupMap.set(key, group)
      groups.push(group)
    }

    if (subTask) {
      const fieldValues = Object.fromEntries(
        customColumns.map((column) => [
          column.id,
          normalizeChecklistFieldValue(row[column.sourceIndex], CHECKLIST_COLUMN_TYPE.TEXT),
        ])
      )

      groupMap.get(key).items.push({
        title: subTask,
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

function buildChecklistColumnWidths(customColumns, includeLog = true) {
  const widths = [...BASE_WIDTHS, ...customColumns.map(() => CUSTOM_COLUMN_WIDTH)]
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

function buildChecklistRows(checklists, customColumns) {
  return checklists.flatMap((checklist) => {
    const items = checklist.items || []

    if (!items.length) {
      return [[
        checklist.title || '',
        '',
        '',
        '',
        ...customColumns.map(() => ''),
        '',
      ]]
    }

    return items.map((item) => [
      checklist.title || '',
      item.title || '',
      formatExportStatus(item.status),
      item.comment || '',
      ...customColumns.map((column) => item.fieldValues?.[column.id] || ''),
      formatStatusHistory(item.statusHistory),
    ])
  })
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
