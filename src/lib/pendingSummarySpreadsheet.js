import { PENDING_SUMMARY_STATUS } from '../composables/usePendingSummary.js'

export const PENDING_SUMMARY_EXPORT_COLS = [
  { wch: 28 },
  { wch: 28 },
  { wch: 52 },
  { wch: 14 },
  { wch: 24 },
  { wch: 60 },
]

export function buildPendingSummaryExportRows(board) {
  const rows = [['Main list', 'Sub list', 'Pending item', 'Status', 'Last action', 'Log']]

  for (const section of board?.sections || []) {
    for (const group of section.groups || []) {
      for (const item of group.items || []) {
        const entries = item.actionHistory || []
        const lastEntry = entries[entries.length - 1] || null

        rows.push([
          section.title || '',
          group.title || '',
          item.title || '',
          item.status === PENDING_SUMMARY_STATUS.DONE ? 'Done' : 'Not done',
          lastEntry?.changedAt || '',
          entries.map(formatHistoryEntry).join(' | '),
        ])
      }
    }
  }

  return rows
}

function formatHistoryEntry(entry) {
  const label = entry?.toStatus === PENDING_SUMMARY_STATUS.DONE ? 'Done' : 'Not done'
  return `${entry?.changedAt || ''}: ${label}`.trim()
}
