import * as XLSX from 'xlsx'
import { CABLE_CHECKLIST_PROOF_TASKS, normalizeProofTasks } from '../composables/useCableChecklist.js'
import { normalizeChecklistCustomColumns } from './checklistColumns.js'

const TEMPLATE_HEADERS = [
  'LEVEL',
  'Cable label',
  'Cable ID',
  'Sweep test received',
  'Remark',
  'Cable length Est. + 10 %',
]

const BASE_EXPORT_HEADERS = [...TEMPLATE_HEADERS]

export function CABLE_CHECKLIST_EXPORT_COLS(customColumns = []) {
  return [
    { wch: 22 },
    { wch: 34 },
    { wch: 14 },
    { wch: 20 },
    { wch: 14 },
    { wch: 22 },
    ...CABLE_CHECKLIST_PROOF_TASKS.map(() => ({ wch: 32 })),
    ...normalizeChecklistCustomColumns(customColumns).map(() => ({ wch: 18 })),
    { wch: 52 },
  ]
}

export function downloadCableChecklistTemplate(customColumns = []) {
  const workbook = XLSX.utils.book_new()
  const headers = [...TEMPLATE_HEADERS, ...normalizeChecklistCustomColumns(customColumns).map((column) => column.label)]
  const worksheet = XLSX.utils.aoa_to_sheet([headers])
  worksheet['!cols'] = CABLE_CHECKLIST_EXPORT_COLS(customColumns).slice(0, headers.length)

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cable Checklist Template')
  XLSX.writeFile(workbook, 'site-cable-checklist-template.xlsx')
}

export function downloadCableChecklistExport(rows, siteName = 'site', customColumns = []) {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet(buildCableChecklistExportRows(rows, customColumns))

  worksheet['!cols'] = CABLE_CHECKLIST_EXPORT_COLS(customColumns)

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cable Checklist Export')
  XLSX.writeFile(workbook, `${toFileSlug(siteName)}-cable-checklist.xlsx`)
}

export function buildCableChecklistExportRows(rows, customColumns = []) {
  const normalizedColumns = normalizeChecklistCustomColumns(customColumns)
  return [
    [...BASE_EXPORT_HEADERS, ...CABLE_CHECKLIST_PROOF_TASKS.map((task) => task.label), ...normalizedColumns.map((column) => column.label), 'Log'],
    ...(rows || []).map((row) => {
      const proofTasks = normalizeProofTasks(row.proofTasks)
      return [
        row.level || '',
        row.cableLabel || '',
        row.cableId || '',
        row.sweepTestReceived || '',
        row.remark || '',
        row.cableLength || '',
        ...CABLE_CHECKLIST_PROOF_TASKS.map((task) => formatProofStatus(proofTasks[task.id])),
        ...normalizedColumns.map((column) => row.fieldValues?.[column.id] || ''),
        formatChangeHistory(row.changeHistory),
      ]
    }),
  ]
}

export async function parseCableChecklistSpreadsheet(file) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) throw new Error('The workbook is empty.')

  const worksheet = workbook.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    blankrows: false,
    defval: '',
  })
  if (!rows.length) throw new Error('The worksheet is empty.')

  const rawHeaderRow = rows[0].map((value) => String(value || '').trim())
  const headerRow = rawHeaderRow.map(normalizeHeader)
  const levelIndex = headerRow.findIndex((value) => value === 'level')
  const cableLabelIndex = headerRow.findIndex((value) => value === 'cablelabel')
  const cableIdIndex = headerRow.findIndex((value) => value === 'cableid')
  const sweepTestIndex = headerRow.findIndex((value) => value === 'sweeptestreceived')
  const remarkIndex = headerRow.findIndex((value) => value === 'remark')
  const cableLengthIndex = headerRow.findIndex(
    (value) => value === 'cablelengthest10' || value === 'cablelength' || value === 'length'
  )
  const proofTaskIndexes = Object.fromEntries(
    CABLE_CHECKLIST_PROOF_TASKS.map((task) => [task.id, headerRow.findIndex((value) => value === normalizeHeader(task.label))])
  )
  const knownIndexes = new Set([
    levelIndex,
    cableLabelIndex,
    cableIdIndex,
    sweepTestIndex,
    remarkIndex,
    cableLengthIndex,
    ...Object.values(proofTaskIndexes),
    headerRow.findIndex((value) => value === 'log'),
  ])

  if (
    levelIndex === -1 ||
    cableLabelIndex === -1 ||
    cableIdIndex === -1 ||
    sweepTestIndex === -1 ||
    remarkIndex === -1 ||
    cableLengthIndex === -1
  ) {
    throw new Error(
      'The file must contain LEVEL, Cable label, Cable ID, Sweep test received, Remark, and Cable length Est. + 10 % columns.'
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
      cableLabel: toCellText(row[cableLabelIndex]),
      cableId: toCellText(row[cableIdIndex]),
      sweepTestReceived: toDateCellText(row[sweepTestIndex]),
      remark: toCellText(row[remarkIndex]),
      cableLength: toCellText(row[cableLengthIndex]),
      proofTasks: Object.fromEntries(
        CABLE_CHECKLIST_PROOF_TASKS.map((task) => [task.id, normalizeImportProofStatus(row[proofTaskIndexes[task.id]])])
      ),
      fieldValues: Object.fromEntries(
        customColumns.map((column) => [column.label, toCellText(row[column.index])])
      ),
    }))
    .filter((row) =>
      [row.level, row.cableLabel, row.cableId, row.sweepTestReceived, row.remark, row.cableLength]
        .some((value) => value)
    )

  if (!parsedRows.length) {
    throw new Error('No cable checklist rows were found in the file.')
  }

  return {
    rows: parsedRows,
    customColumns,
  }
}

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function toCellText(value) {
  return String(value ?? '').trim()
}

function normalizeImportProofStatus(value) {
  const normalized = normalizeHeader(value)
  return normalized === 'received' || normalized === 'yes' ? 'received' : 'not-received'
}

function formatProofStatus(value) {
  return normalizeImportProofStatus(value) === 'received' ? 'Received' : 'Not received'
}

function toDateCellText(value) {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatIsoDate(value)
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      return [
        parsed.y,
        String(parsed.m).padStart(2, '0'),
        String(parsed.d).padStart(2, '0'),
      ].join('-')
    }
  }

  const text = String(value ?? '').trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text

  const parsedDate = new Date(text)
  if (!Number.isNaN(parsedDate.getTime())) {
    return formatIsoDate(parsedDate)
  }

  return text
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
      if (entry?.type === 'proof-task') {
        const task = CABLE_CHECKLIST_PROOF_TASKS.find((item) => item.id === entry?.taskId)
        return `${changedAt}: ${task?.label || 'Cable proof'} ${formatProofStatus(entry?.fromStatus)} -> ${formatProofStatus(entry?.toStatus)}`
      }

      const field = formatField(entry?.field)
      const fromValue = String(entry?.fromValue || '').trim() || 'Blank'
      const toValue = String(entry?.toValue || '').trim() || 'Blank'
      return `${changedAt}: ${field} ${fromValue} -> ${toValue}`
    })
    .join(' | ')
}

function formatField(value) {
  if (value === 'cableLabel') return 'Cable label'
  if (value === 'cableId') return 'Cable ID'
  if (value === 'sweepTestReceived') return 'Sweep test received'
  if (value === 'cableLength') return 'Cable length Est. + 10 %'
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

function formatIsoDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}
