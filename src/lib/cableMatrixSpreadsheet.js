import * as XLSX from 'xlsx'

const TEMPLATE_HEADERS = [
  'Cable Number',
  'Cable label at origin end destination',
  'From',
  'To',
  'Test',
  'Label origin',
  'Label end',
]
const EXPORT_HEADERS = [
  'Cable Number',
  'Cable label at origin end destination',
  'From',
  'To',
  'Test',
  'Label origin',
  'Label end',
  'Log',
]

export function downloadCableMatrixTemplate() {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS])
  worksheet['!cols'] = [{ wch: 18 }, { wch: 36 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 12 }]

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cable Matrix Template')
  XLSX.writeFile(workbook, 'site-cable-matrix-template.xlsx')
}

export function downloadCableMatrixExport(rows, siteName = 'site') {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([
    EXPORT_HEADERS,
    ...rows.map((row) => [
      row.cableNumber || '',
      row.cableLabel || '',
      row.from || '',
      row.to || '',
      formatStatus(row.testStatus),
      formatStatus(row.labelOriginStatus),
      formatStatus(row.labelEndStatus),
      formatStatusHistory(row.statusHistory),
    ]),
  ])

  worksheet['!cols'] = [{ wch: 18 }, { wch: 36 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 52 }]

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cable Matrix Export')
  XLSX.writeFile(workbook, `${toFileSlug(siteName)}-cable-matrix.xlsx`)
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

  const headerRow = rows[0].map(normalizeHeader)
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
    }))
    .filter((row) => row.cableNumber || row.cableLabel)

  if (!parsedRows.length) {
    throw new Error('No cable matrix rows were found in the file.')
  }

  return parsedRows
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
  return normalizeHeader(value) === 'ok' ? 'ok' : 'no'
}

function formatStatus(value) {
  return normalizeImportStatus(value) === 'ok' ? 'OK' : 'No'
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
