import * as XLSX from 'xlsx'
import { normalizeChecklistCustomColumns } from './checklistColumns.js'

const TEMPLATE_HEADERS = [
  'LEVEL',
  'Description',
  'Make',
  'Model',
  'Serial Number',
  'Asset Tag / Label',
  'Comment',
]

const BASE_EXPORT_HEADERS = [...TEMPLATE_HEADERS]

export function ANTENNA_CHECKLIST_EXPORT_COLS(customColumns = []) {
  return [
    { wch: 22 },
    { wch: 26 },
    { wch: 18 },
    { wch: 24 },
    { wch: 22 },
    { wch: 22 },
    { wch: 48 },
    ...normalizeChecklistCustomColumns(customColumns).map(() => ({ wch: 18 })),
    { wch: 52 },
  ]
}

export function downloadAntennaChecklistTemplate(customColumns = []) {
  const workbook = XLSX.utils.book_new()
  const headers = [...TEMPLATE_HEADERS, ...normalizeChecklistCustomColumns(customColumns).map((column) => column.label)]
  const worksheet = XLSX.utils.aoa_to_sheet([headers])
  worksheet['!cols'] = ANTENNA_CHECKLIST_EXPORT_COLS(customColumns).slice(0, headers.length)

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Antenna Checklist Template')
  XLSX.writeFile(workbook, 'site-antenna-checklist-template.xlsx')
}

export function downloadAntennaChecklistExport(rows, siteName = 'site', customColumns = []) {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet(buildAntennaChecklistExportRows(rows, customColumns))

  worksheet['!cols'] = ANTENNA_CHECKLIST_EXPORT_COLS(customColumns)

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Antenna Checklist Export')
  XLSX.writeFile(workbook, `${toFileSlug(siteName)}-antenna-checklist.xlsx`)
}

export function buildAntennaChecklistExportRows(rows, customColumns = []) {
  const normalizedColumns = normalizeChecklistCustomColumns(customColumns)
  return [
    [...BASE_EXPORT_HEADERS, ...normalizedColumns.map((column) => column.label), 'Log'],
    ...(rows || []).map((row) => [
      row.level || '',
      row.description || '',
      row.make || '',
      row.model || '',
      row.serialNumber || '',
      row.assetTag || '',
      row.comment || '',
      ...normalizedColumns.map((column) => row.fieldValues?.[column.id] || ''),
      formatChangeHistory(row.changeHistory),
    ]),
  ]
}

export async function parseAntennaChecklistSpreadsheet(file) {
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

  const rawHeaderRow = rows[0].map((value) => String(value || '').trim())
  const headerRow = rawHeaderRow.map(normalizeHeader)
  const levelIndex = headerRow.findIndex((value) => value === 'level')
  const descriptionIndex = headerRow.findIndex((value) => value === 'description')
  const makeIndex = headerRow.findIndex((value) => value === 'make')
  const modelIndex = headerRow.findIndex((value) => value === 'model')
  const serialNumberIndex = headerRow.findIndex(
    (value) => value === 'serialnumber' || value === 'serialno'
  )
  const assetTagIndex = headerRow.findIndex(
    (value) => value === 'assettaglabel' || value === 'assettag' || value === 'label'
  )
  const commentIndex = headerRow.findIndex((value) => value === 'comment')
  const knownIndexes = new Set([
    levelIndex,
    descriptionIndex,
    makeIndex,
    modelIndex,
    serialNumberIndex,
    assetTagIndex,
    commentIndex,
    headerRow.findIndex((value) => value === 'log'),
  ])

  if (
    levelIndex === -1 ||
    descriptionIndex === -1 ||
    makeIndex === -1 ||
    modelIndex === -1 ||
    serialNumberIndex === -1 ||
    assetTagIndex === -1 ||
    commentIndex === -1
  ) {
    throw new Error(
      'The file must contain LEVEL, Description, Make, Model, Serial Number, Asset Tag / Label, and Comment columns.'
    )
  }

  const customColumns = rawHeaderRow
    .map((label, index) => ({ label, index }))
    .filter(({ label, index }) => label && !knownIndexes.has(index))
    .map(({ label, index }) => ({
      id: label,
      label,
      index,
      type: 'text',
    }))

  const parsedRows = rows
    .slice(1)
    .map((row) => ({
      level: toCellText(row[levelIndex]),
      description: toCellText(row[descriptionIndex]),
      make: toCellText(row[makeIndex]),
      model: toCellText(row[modelIndex]),
      serialNumber: toCellText(row[serialNumberIndex]),
      assetTag: toCellText(row[assetTagIndex]),
      comment: toCellText(row[commentIndex]),
      fieldValues: Object.fromEntries(
        customColumns.map((column) => [column.label, toCellText(row[column.index])])
      ),
    }))
    .filter((row) =>
      [row.level, row.description, row.make, row.model, row.serialNumber, row.assetTag, row.comment]
        .some((value) => value)
    )

  if (!parsedRows.length) {
    throw new Error('No antenna checklist rows were found in the file.')
  }

  return {
    rows: parsedRows,
    customColumns,
  }
}

function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
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
  if (value === 'assetTag') return 'Asset Tag / Label'
  if (value === 'description') return 'Description'
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
