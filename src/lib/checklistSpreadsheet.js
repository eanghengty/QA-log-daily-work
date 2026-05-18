import * as XLSX from 'xlsx'

const TEMPLATE_HEADERS = ['Main task', 'Sub task', 'Status', 'Comment']
const EXPORT_HEADERS = ['Main task', 'Sub task', 'Status', 'Comment', 'Log']
const STATUS_DONE = 'done'
const STATUS_NOT_DONE = 'not done'
const STATUS_NA = 'n/a'

export function downloadChecklistTemplate() {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS])
  worksheet['!cols'] = [{ wch: 28 }, { wch: 40 }, { wch: 14 }, { wch: 36 }]

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Checklist Template')
  XLSX.writeFile(workbook, 'site-checklist-template.xlsx')
}

export function downloadChecklistExport(checklists, siteName = 'site') {
  const workbook = XLSX.utils.book_new()
  const rows = [
    EXPORT_HEADERS,
    ...buildChecklistRows(checklists || []),
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(rows)

  worksheet['!cols'] = [{ wch: 28 }, { wch: 40 }, { wch: 14 }, { wch: 36 }, { wch: 52 }]

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Checklist Export')
  XLSX.writeFile(workbook, `${toFileSlug(siteName)}-checklist-export.xlsx`)
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

  const headerRow = rows[0].map((value) => normalizeHeader(value))
  const mainTaskIndex = headerRow.findIndex((value) => value === 'maintask')
  const subTaskIndex = headerRow.findIndex((value) => value === 'subtask')
  const statusIndex = headerRow.findIndex((value) => value === 'status')
  const commentIndex = headerRow.findIndex((value) => value === 'comment')

  if (mainTaskIndex === -1 || subTaskIndex === -1) {
    throw new Error('The file must contain "Main task" and "Sub task" columns.')
  }

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
      groupMap.get(key).items.push({
        title: subTask,
        status: normalizeImportedStatus(rawStatus),
        comment: rawComment,
      })
    }
  })

  if (!groups.length) {
    throw new Error('No checklist rows were found in the file.')
  }

  return groups
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
  return value.trim().toLowerCase()
}

function buildChecklistRows(checklists) {
  return checklists.flatMap((checklist) => {
    const items = checklist.items || []

    if (!items.length) {
      return [[checklist.title || '', '', '', '', '']]
    }

    return items.map((item) => [
      checklist.title || '',
      item.title || '',
      formatExportStatus(item.status),
      item.comment || '',
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
