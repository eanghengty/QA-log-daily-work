import * as XLSX from 'xlsx'

const TEMPLATE_HEADERS = [
  'LEVEL',
  'Description',
  'Make',
  'Model',
  'Label',
  'Serial Number',
  'dB',
  'Comment',
]

const EXPORT_HEADERS = [...TEMPLATE_HEADERS, 'Log']

export function downloadDcplChecklistTemplate() {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS])
  worksheet['!cols'] = [
    { wch: 22 },
    { wch: 28 },
    { wch: 18 },
    { wch: 20 },
    { wch: 14 },
    { wch: 22 },
    { wch: 10 },
    { wch: 52 },
  ]

  XLSX.utils.book_append_sheet(workbook, worksheet, 'DCPL Checklist Template')
  XLSX.writeFile(workbook, 'site-dcpl-checklist-template.xlsx')
}

export function downloadDcplChecklistExport(rows, siteName = 'site') {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([
    EXPORT_HEADERS,
    ...rows.map((row) => [
      row.level || '',
      row.description || '',
      row.make || '',
      row.model || '',
      row.label || '',
      row.serialNumber || '',
      row.dbValue || '',
      row.comment || '',
      formatChangeHistory(row.changeHistory),
    ]),
  ])

  worksheet['!cols'] = [
    { wch: 22 },
    { wch: 28 },
    { wch: 18 },
    { wch: 20 },
    { wch: 14 },
    { wch: 22 },
    { wch: 10 },
    { wch: 52 },
    { wch: 52 },
  ]

  XLSX.utils.book_append_sheet(workbook, worksheet, 'DCPL Checklist Export')
  XLSX.writeFile(workbook, `${toFileSlug(siteName)}-dcpl-checklist.xlsx`)
}

export async function parseDcplChecklistSpreadsheet(file) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) throw new Error('The workbook is empty.')

  const worksheet = workbook.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    blankrows: false,
    defval: '',
  })
  if (!rows.length) throw new Error('The worksheet is empty.')

  const headerRow = rows[0].map(normalizeHeader)
  const levelIndex = headerRow.findIndex((value) => value === 'level')
  const descriptionIndex = headerRow.findIndex((value) => value === 'description')
  const makeIndex = headerRow.findIndex((value) => value === 'make')
  const modelIndex = headerRow.findIndex((value) => value === 'model')
  const labelIndex = headerRow.findIndex((value) => value === 'label')
  const serialNumberIndex = headerRow.findIndex((value) => value === 'serialnumber' || value === 'serialno')
  const dbIndex = headerRow.findIndex((value) => value === 'db')
  const commentIndex = headerRow.findIndex(
    (value) => value === 'comment' || value === 'postinstallationphotocheck'
  )

  if (
    levelIndex === -1 ||
    descriptionIndex === -1 ||
    makeIndex === -1 ||
    modelIndex === -1 ||
    labelIndex === -1 ||
    serialNumberIndex === -1 ||
    dbIndex === -1 ||
    commentIndex === -1
  ) {
    throw new Error(
      'The file must contain LEVEL, Description, Make, Model, Label, Serial Number, dB, and Comment columns.'
    )
  }

  const parsedRows = rows
    .slice(1)
    .map((row) => ({
      level: toCellText(row[levelIndex]),
      description: toCellText(row[descriptionIndex]),
      make: toCellText(row[makeIndex]),
      model: toCellText(row[modelIndex]),
      label: toCellText(row[labelIndex]),
      serialNumber: toCellText(row[serialNumberIndex]),
      dbValue: toCellText(row[dbIndex]),
      comment: toCellText(row[commentIndex]),
    }))
    .filter((row) => Object.values(row).some((value) => value))

  if (!parsedRows.length) {
    throw new Error('No DCPL checklist rows were found in the file.')
  }

  return parsedRows
}

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function toCellText(value) {
  return String(value ?? '').trim()
}

function toFileSlug(value) {
  const normalized = String(value || 'site')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'site'
}

function formatChangeHistory(entries) {
  if (!Array.isArray(entries) || !entries.length) return ''

  return entries
    .map((entry) => {
      const changedAt = formatHistoryDate(entry?.changedAt)
      const field = formatField(entry?.field)
      const fromValue = String(entry?.fromValue || '').trim() || 'Blank'
      const toValue = String(entry?.toValue || '').trim() || 'Blank'
      return `${changedAt}: ${field} ${fromValue} -> ${toValue}`
    })
    .join(' | ')
}

function formatField(value) {
  if (value === 'serialNumber') return 'Serial Number'
  if (value === 'dbValue') return 'dB'
  return String(value || '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim()
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
