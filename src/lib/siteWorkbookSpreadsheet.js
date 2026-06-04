import { db } from '../db/index.js'
import {
  buildChecklistExportRows,
  CHECKLIST_EXPORT_COLS,
} from './checklistSpreadsheet.js'
import {
  buildCableMatrixExportRows,
  CABLE_MATRIX_EXPORT_COLS,
} from './cableMatrixSpreadsheet.js'
import {
  buildAntennaChecklistExportRows,
  ANTENNA_CHECKLIST_EXPORT_COLS,
} from './antennaChecklistSpreadsheet.js'
import {
  buildDcplChecklistExportRows,
  DCPL_CHECKLIST_EXPORT_COLS,
} from './dcplChecklistSpreadsheet.js'
import {
  buildCableChecklistExportRows,
  CABLE_CHECKLIST_EXPORT_COLS,
} from './cableChecklistSpreadsheet.js'
import {
  buildPendingSummaryExportRows,
  PENDING_SUMMARY_EXPORT_COLS,
} from './pendingSummarySpreadsheet.js'

const HEADER_ROW_HEIGHT = 20
const BODY_ROW_HEIGHT = 18
const HEADER_FILL = 'FF0B2A63'
const HEADER_TEXT = 'FFFFFFFF'
const BODY_TEXT = 'FF000000'
const BORDER_COLOR = 'FF000000'

export async function exportSiteWorkbook(siteId) {
  const { default: ExcelJS } = await import('exceljs')
  const [site, checklists, checklistLayout, cableMatrixLayout, antennaChecklistLayout, dcplChecklistLayout, cableChecklistLayout, cableMatrices, antennaChecklists, dcplChecklists, cableChecklists, pendingSummary] =
    await Promise.all([
      db.sites.get(siteId),
      db.checklists.where('siteId').equals(siteId).sortBy('order'),
      db.checklistLayouts.get(siteId),
      db.cableMatrixLayouts.get(siteId),
      db.antennaChecklistLayouts.get(siteId),
      db.dcplChecklistLayouts.get(siteId),
      db.cableChecklistLayouts.get(siteId),
      db.cableMatrices.where('siteId').equals(siteId).sortBy('order'),
      db.antennaChecklists.where('siteId').equals(siteId).sortBy('order'),
      db.dcplChecklists.where('siteId').equals(siteId).sortBy('order'),
      db.cableChecklists.where('siteId').equals(siteId).sortBy('order'),
      db.pendingSummaries.get(siteId),
    ])

  if (!site) {
    throw new Error('Site not found.')
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Telecom Site Tracker'
  workbook.created = new Date()

  const checklistRows = buildChecklistExportRows(checklists, checklistLayout?.customColumns || [])
  const checklistColumns = checklistRows[0].map((_, index, row) => ({
    wch: index === row.length - 1 ? 52 : index < 4 ? [28, 40, 16, 36][index] : 22,
  }))

  appendSheet(workbook, 'Site checklist', checklistRows, checklistColumns.length ? checklistColumns : CHECKLIST_EXPORT_COLS)
  appendSheet(
    workbook,
    'Cable matrix',
    buildCableMatrixExportRows(cableMatrices, cableMatrixLayout?.customColumns || []),
    CABLE_MATRIX_EXPORT_COLS(cableMatrixLayout?.customColumns || [])
  )
  appendSheet(
    workbook,
    'Antenna checklist',
    buildAntennaChecklistExportRows(antennaChecklists, antennaChecklistLayout?.customColumns || []),
    ANTENNA_CHECKLIST_EXPORT_COLS(antennaChecklistLayout?.customColumns || [])
  )
  appendSheet(
    workbook,
    'DCPL checklist',
    buildDcplChecklistExportRows(dcplChecklists, dcplChecklistLayout?.customColumns || []),
    DCPL_CHECKLIST_EXPORT_COLS(dcplChecklistLayout?.customColumns || [])
  )
  appendSheet(
    workbook,
    'Cable checklist',
    buildCableChecklistExportRows(cableChecklists, cableChecklistLayout?.customColumns || []),
    CABLE_CHECKLIST_EXPORT_COLS(cableChecklistLayout?.customColumns || [])
  )
  appendSheet(
    workbook,
    'Pending summary',
    buildPendingSummaryExportRows(pendingSummary),
    PENDING_SUMMARY_EXPORT_COLS
  )

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob(
    [buffer],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  )
  downloadBlob(blob, `${toFileSlug(site.name || siteId)}-site-boards.xlsx`)
}

function appendSheet(workbook, name, rows, columns) {
  const worksheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  worksheet.columns = columns.map((column) => ({
    width: Number(column?.wch) || 12,
  }))

  rows.forEach((rowValues, index) => {
    const row = worksheet.addRow(rowValues)
    row.height = index === 0 ? HEADER_ROW_HEIGHT : BODY_ROW_HEIGHT

    for (let colIndex = 1; colIndex <= columns.length; colIndex += 1) {
      const cell = row.getCell(colIndex)
      cell.font = index === 0 ? buildHeaderFont() : buildBodyFont()
      cell.alignment = buildAlignment()
      cell.border = buildBorder()

      if (index === 0) {
        cell.fill = buildHeaderFill()
      }
    }
  })
}

function buildHeaderFont() {
  return {
    name: 'Tahoma',
    size: 10,
    bold: false,
    color: { argb: HEADER_TEXT },
  }
}

function buildBodyFont() {
  return {
    name: 'Tahoma',
    size: 10,
    color: { argb: BODY_TEXT },
  }
}

function buildHeaderFill() {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_FILL },
  }
}

function buildAlignment() {
  return {
    horizontal: 'left',
    vertical: 'middle',
    wrapText: false,
  }
}

function buildBorder() {
  return {
    top: { style: 'thin', color: { argb: BORDER_COLOR } },
    right: { style: 'thin', color: { argb: BORDER_COLOR } },
    bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
    left: { style: 'thin', color: { argb: BORDER_COLOR } },
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function toFileSlug(value) {
  const normalized = String(value || 'site')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'site'
}
