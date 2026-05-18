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

const HEADER_ROW_HEIGHT = 20
const BODY_ROW_HEIGHT = 18
const HEADER_FILL = 'FF0B2A63'
const HEADER_TEXT = 'FFFFFFFF'
const BODY_TEXT = 'FF000000'
const BORDER_COLOR = 'FF000000'

export async function exportSiteWorkbook(siteId) {
  const { default: ExcelJS } = await import('exceljs')
  const [site, checklists, cableMatrices, antennaChecklists, dcplChecklists, cableChecklists] =
    await Promise.all([
      db.sites.get(siteId),
      db.checklists.where('siteId').equals(siteId).sortBy('order'),
      db.cableMatrices.where('siteId').equals(siteId).sortBy('order'),
      db.antennaChecklists.where('siteId').equals(siteId).sortBy('order'),
      db.dcplChecklists.where('siteId').equals(siteId).sortBy('order'),
      db.cableChecklists.where('siteId').equals(siteId).sortBy('order'),
    ])

  if (!site) {
    throw new Error('Site not found.')
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Telecom Site Tracker'
  workbook.created = new Date()

  appendSheet(workbook, 'Site checklist', buildChecklistExportRows(checklists), CHECKLIST_EXPORT_COLS)
  appendSheet(workbook, 'Cable matrix', buildCableMatrixExportRows(cableMatrices), CABLE_MATRIX_EXPORT_COLS)
  appendSheet(
    workbook,
    'Antenna checklist',
    buildAntennaChecklistExportRows(antennaChecklists),
    ANTENNA_CHECKLIST_EXPORT_COLS
  )
  appendSheet(
    workbook,
    'DCPL checklist',
    buildDcplChecklistExportRows(dcplChecklists),
    DCPL_CHECKLIST_EXPORT_COLS
  )
  appendSheet(
    workbook,
    'Cable checklist',
    buildCableChecklistExportRows(cableChecklists),
    CABLE_CHECKLIST_EXPORT_COLS
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
