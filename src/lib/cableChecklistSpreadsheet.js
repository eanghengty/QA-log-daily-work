import * as XLSX from 'xlsx'

const TEMPLATE_HEADERS = [
  'LEVEL',
  'Cable label',
  'Cable ID',
  'HOP Criteria',
  'Sweep test received',
  'Remark',
  'Cable length Est. + 10 %',
]

const EXPORT_HEADERS = [...TEMPLATE_HEADERS, 'Log']

export function downloadCableChecklistTemplate() {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS])
  worksheet['!cols'] = [
    { wch: 22 },
    { wch: 34 },
    { wch: 14 },
    { wch: 58 },
    { wch: 20 },
    { wch: 14 },
    { wch: 22 },
  ]

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cable Checklist Template')
  XLSX.writeFile(workbook, 'site-cable-checklist-template.xlsx')
}

export function downloadCableChecklistExport(rows, siteName = 'site') {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([
    EXPORT_HEADERS,
    ...rows.map((row) => [
      row.level || '',
      row.cableLabel || '',
      row.cableId || '',
      row.hopCriteria || '',
      row.sweepTestReceived || '',
      row.remark || '',
      row.cableLength || '',
      formatChangeHistory(row.changeHistory),
    ]),
  ])

  worksheet['!cols'] = [
    { wch: 22 },
    { wch: 34 },
    { wch: 14 },
    { wch: 58 },
    { wch: 20 },
    { wch: 14 },
    { wch: 22 },
    { wch: 52 },
  ]

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cable Checklist Export')
  XLSX.writeFile(workbook, `${toFileSlug(siteName)}-cable-checklist.xlsx`)
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

  const headerRow = rows[0].map(normalizeHeader)
  const levelIndex = headerRow.findIndex((value) => value === 'level')
  const cableLabelIndex = headerRow.findIndex((value) => value === 'cablelabel')
  const cableIdIndex = headerRow.findIndex((value) => value === 'cableid')
  const hopCriteriaIndex = headerRow.findIndex((value) => value === 'hopcriteria')
  const sweepTestIndex = headerRow.findIndex((value) => value === 'sweeptestreceived')
  const remarkIndex = headerRow.findIndex((value) => value === 'remark')
  const cableLengthIndex = headerRow.findIndex(
    (value) => value === 'cablelengthest10' || value === 'cablelength' || value === 'length'
  )

  if (
    levelIndex === -1 ||
    cableLabelIndex === -1 ||
    cableIdIndex === -1 ||
    hopCriteriaIndex === -1 ||
    sweepTestIndex === -1 ||
    remarkIndex === -1 ||
    cableLengthIndex === -1
  ) {
    throw new Error(
      'The file must contain LEVEL, Cable label, Cable ID, HOP Criteria, Sweep test received, Remark, and Cable length Est. + 10 % columns.'
    )
  }

  const parsedRows = rows
    .slice(1)
    .map((row) => ({
      level: toCellText(row[levelIndex]),
      cableLabel: toCellText(row[cableLabelIndex]),
      cableId: toCellText(row[cableIdIndex]),
      hopCriteria: toCellText(row[hopCriteriaIndex]),
      sweepTestReceived: toDateCellText(row[sweepTestIndex]),
      remark: toCellText(row[remarkIndex]),
      cableLength: toCellText(row[cableLengthIndex]),
    }))
    .filter((row) => Object.values(row).some((value) => value))

  if (!parsedRows.length) {
    throw new Error('No cable checklist rows were found in the file.')
  }

  return parsedRows
}

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function toCellText(value) {
  return String(value ?? '').trim()
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
  if (value === 'hopCriteria') return 'HOP Criteria'
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
