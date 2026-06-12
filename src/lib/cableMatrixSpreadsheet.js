import * as XLSX from 'xlsx'

import { CABLE_PROOF_TASKS, normalizeProofTasks } from '../composables/useCableMatrix.js'
import { normalizeChecklistCustomColumns } from './checklistColumns.js'

const TEMPLATE_HEADERS = [
  'Cable Number',
  'Cable label at origin end destination',
  'From',
  'To',
  'Test',
  'Label origin',
  'Label end',
]
const BASE_EXPORT_HEADERS = [...TEMPLATE_HEADERS]

export function CABLE_MATRIX_EXPORT_COLS(customColumns = []) {
  return [
    { wch: 18 },
    { wch: 36 },
    { wch: 22 },
    { wch: 22 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    ...CABLE_PROOF_TASKS.map(() => ({ wch: 32 })),
    ...normalizeChecklistCustomColumns(customColumns).map(() => ({ wch: 18 })),
    { wch: 52 },
  ]
}

export function downloadCableMatrixTemplate(customColumns = []) {
  const workbook = XLSX.utils.book_new()
  const headers = [...TEMPLATE_HEADERS, ...normalizeChecklistCustomColumns(customColumns).map((column) => column.label)]
  const worksheet = XLSX.utils.aoa_to_sheet([headers])
  worksheet['!cols'] = CABLE_MATRIX_EXPORT_COLS(customColumns).slice(0, headers.length)

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cable Matrix Template')
  XLSX.writeFile(workbook, 'site-cable-matrix-template.xlsx')
}

export function downloadCableMatrixExport(rows, siteName = 'site', customColumns = []) {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet(buildCableMatrixExportRows(rows, customColumns))

  worksheet['!cols'] = CABLE_MATRIX_EXPORT_COLS(customColumns)

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cable Matrix Export')
  XLSX.writeFile(workbook, `${toFileSlug(siteName)}-cable-matrix.xlsx`)
}

export function buildCableMatrixExportRows(rows, customColumns = []) {
  const normalizedColumns = normalizeChecklistCustomColumns(customColumns)
  return [
    [...BASE_EXPORT_HEADERS, ...CABLE_PROOF_TASKS.map((task) => task.label), ...normalizedColumns.map((column) => column.label), 'Log'],
    ...(rows || []).map((row) => {
      const proofTasks = normalizeProofTasks(row.proofTasks)
      return [
        row.cableNumber || '',
        row.cableLabel || '',
        row.from || '',
        row.to || '',
        formatStatus(row.testStatus),
        formatStatus(row.labelOriginStatus),
        formatStatus(row.labelEndStatus),
        ...CABLE_PROOF_TASKS.map((task) => formatProofStatus(proofTasks[task.id])),
        ...normalizedColumns.map((column) => row.fieldValues?.[column.id] || ''),
        formatStatusHistory(row.statusHistory),
      ]
    }),
  ]
}

export async function parseCableMatrixSpreadsheet(file) {
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
  const cableNumberIndex = headerRow.findIndex((value) => value === 'cablenumber')
  const cableLabelIndex = headerRow.findIndex(
    (value) =>
      value === 'cablelabelatoriginenddestination' ||
      value === 'cablelabel' ||
      value === 'label'
  )
  const fromIndex = headerRow.findIndex((value) => value === 'from')
  const toIndex = headerRow.findIndex((value) => value === 'to')
  const testIndex = headerRow.findIndex((value) => value === 'test')
  const labelOriginIndex = headerRow.findIndex((value) => value === 'labelorigin')
  const labelEndIndex = headerRow.findIndex((value) => value === 'labelend')
  const proofTaskIndexes = Object.fromEntries(
    CABLE_PROOF_TASKS.map((task) => [task.id, headerRow.findIndex((value) => value === normalizeHeader(task.label))])
  )
  const knownIndexes = new Set([
    cableNumberIndex,
    cableLabelIndex,
    fromIndex,
    toIndex,
    testIndex,
    labelOriginIndex,
    labelEndIndex,
    ...Object.values(proofTaskIndexes),
    headerRow.findIndex((value) => value === 'log'),
  ])

  if (
    cableNumberIndex === -1 ||
    cableLabelIndex === -1 ||
    fromIndex === -1 ||
    toIndex === -1 ||
    testIndex === -1 ||
    labelOriginIndex === -1 ||
    labelEndIndex === -1
  ) {
    throw new Error(
      'The file must contain Cable Number, Cable label at origin end destination, From, To, Test, Label origin, and Label end columns.'
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
      cableNumber: toCellText(row[cableNumberIndex]),
      cableLabel: toCellText(row[cableLabelIndex]),
      from: toCellText(row[fromIndex]),
      to: toCellText(row[toIndex]),
      testStatus: normalizeImportStatus(row[testIndex]),
      labelOriginStatus: normalizeImportStatus(row[labelOriginIndex]),
      labelEndStatus: normalizeImportStatus(row[labelEndIndex]),
      proofTasks: Object.fromEntries(
        CABLE_PROOF_TASKS.map((task) => [task.id, normalizeImportProofStatus(row[proofTaskIndexes[task.id]])])
      ),
      fieldValues: Object.fromEntries(
        customColumns.map((column) => [column.label, toCellText(row[column.index])])
      ),
    }))
    .filter((row) => row.cableNumber || row.cableLabel)

  if (!parsedRows.length) {
    throw new Error('No cable matrix rows were found in the file.')
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

function normalizeImportStatus(value) {
  return normalizeHeader(value) === 'ok' ? 'ok' : 'pending'
}

function formatStatus(value) {
  return normalizeImportStatus(value) === 'ok' ? 'OK' : 'Pending'
}

function normalizeImportProofStatus(value) {
  const normalized = normalizeHeader(value)
  return normalized === 'received' || normalized === 'yes' ? 'received' : 'not-received'
}

function formatProofStatus(value) {
  return normalizeImportProofStatus(value) === 'received' ? 'Received' : 'Not received'
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
      if (entry?.type === 'proof-task') {
        const task = CABLE_PROOF_TASKS.find((item) => item.id === entry?.taskId)
        return `${changedAt}: ${task?.label || 'Cable proof'} ${formatProofStatus(entry?.fromStatus)} -> ${formatProofStatus(entry?.toStatus)}`
      }

      const field = formatField(entry?.field)
      if (entry?.type === 'field') {
        const fromValue = String(entry?.fromValue || '').trim() || 'Blank'
        const toValue = String(entry?.toValue || '').trim() || 'Blank'
        return `${changedAt}: ${field} ${fromValue} -> ${toValue}`
      }

      const fromStatus = formatStatus(entry?.fromStatus)
      const toStatus = formatStatus(entry?.toStatus)
      return `${changedAt}: ${field} ${fromStatus} -> ${toStatus}`
    })
    .join(' | ')
}

function formatField(value) {
  if (value === 'labelOriginStatus') return 'Label origin'
  if (value === 'labelEndStatus') return 'Label end'
  return 'Test'
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
