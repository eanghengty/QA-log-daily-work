export const CHECKLIST_COLUMN_TYPE = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
}

export const BASE_CHECKLIST_COLUMNS = [
  { id: 'mainTask', label: 'Main task', kind: 'base', readOnly: true },
  { id: 'subTask', label: 'Sub task', kind: 'base' },
  { id: 'status', label: 'Status', kind: 'base' },
  { id: 'comment', label: 'Comment', kind: 'base' },
]

export function normalizeChecklistColumnType(type) {
  if (type === CHECKLIST_COLUMN_TYPE.NUMBER || type === CHECKLIST_COLUMN_TYPE.DATE) {
    return type
  }
  return CHECKLIST_COLUMN_TYPE.TEXT
}

export function normalizeChecklistCustomColumns(columns) {
  return (columns || [])
    .map((column) => {
      const label = String(column?.label || column?.title || '').trim()
      if (!label) return null

      return {
        id: String(column?.id || createChecklistColumnId(label)),
        label,
        type: normalizeChecklistColumnType(column?.type),
      }
    })
    .filter(Boolean)
}

export function createChecklistColumnId(label) {
  const base = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const slug = base || 'column'
  return `col-${slug}-${Math.random().toString(16).slice(2, 8)}`
}

export function normalizeChecklistFieldValue(value, type) {
  if (value == null) return ''

  if (normalizeChecklistColumnType(type) === CHECKLIST_COLUMN_TYPE.NUMBER) {
    return String(value).trim()
  }

  if (normalizeChecklistColumnType(type) === CHECKLIST_COLUMN_TYPE.DATE) {
    return String(value).trim()
  }

  return String(value)
}
