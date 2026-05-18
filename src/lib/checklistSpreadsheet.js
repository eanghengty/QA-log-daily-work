import * as XLSX from 'xlsx'

const TEMPLATE_HEADERS = ['Main task', 'Sub task']

export function downloadChecklistTemplate() {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS])
  worksheet['!cols'] = [{ wch: 28 }, { wch: 40 }]

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Checklist Template')
  XLSX.writeFile(workbook, 'site-checklist-template.xlsx')
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
      groupMap.get(key).items.push(subTask)
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
