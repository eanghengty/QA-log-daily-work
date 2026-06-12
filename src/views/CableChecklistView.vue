<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import {
  CABLE_CHECKLIST_PROOF_STATUS,
  CABLE_CHECKLIST_PROOF_TASKS,
  normalizeProofTasks,
  useCableChecklist,
} from '../composables/useCableChecklist.js'
import { useCableChecklistLayout } from '../composables/useCableChecklistLayout.js'
import { useActivityLog } from '../composables/useActivityLog.js'
import { getActivityActorLabel } from '../composables/useActivityActor.js'
import {
  downloadCableChecklistExport,
  downloadCableChecklistTemplate,
  parseCableChecklistSpreadsheet,
} from '../lib/cableChecklistSpreadsheet.js'
import { CHECKLIST_COLUMN_TYPE } from '../lib/checklistColumns.js'
import { buildSitePath } from '../lib/siteRouting.js'
import Topbar from '../components/Topbar.vue'
import StatCard from '../components/StatCard.vue'
import MaterialIcon from '../components/MaterialIcon.vue'

const route = useRoute()
const router = useRouter()
const siteId = route.params.id

const { useSiteById } = useSites()
const { data: site } = useSiteById(siteId)
const { rows, summary, addRow, updateRow, deleteRow, reorderRows, setProofTaskStatus, importRows, removeCustomColumnValues } = useCableChecklist(siteId)
const { customColumns, addCustomColumn, removeCustomColumn, mergeImportedCustomColumns } = useCableChecklistLayout(siteId)
const { logAction } = useActivityLog()

const importInputRef = ref(null)
const isImporting = ref(false)
const statusMessage = ref('')
const statusTone = ref('confirm')
const newRow = ref(createEmptyRow())
const activeChangeLog = ref(null)
const scrollContainerRef = ref(null)
const autoScrollFrame = ref(null)
const draggedRowId = ref(null)
const dropRowId = ref(null)
const rowDrafts = ref({})
const showAddColumnModal = ref(false)
const newColumnName = ref('')
const newColumnType = ref(CHECKLIST_COLUMN_TYPE.TEXT)
const addColumnError = ref('')
const collapsedProofRows = ref(new Set())
const showCableSummaryModal = ref(false)
const areAllProofRowsCollapsed = computed(() => {
  const currentRows = rows.value || []
  return currentRows.length > 0 && currentRows.every((row) => collapsedProofRows.value.has(row.id))
})
const cableProofSummary = computed(() => buildCableProofSummary(rows.value || []))

const title = computed(() => (site.value ? `${site.value.name} cable checklist` : 'Site cable checklist'))
const subtitle = computed(() => {
  const location = site.value?.url || siteId
  return `${location} - ${summary.value.total || 0} cable checklist rows tracked`
})
const columnTypeOptions = [
  { value: CHECKLIST_COLUMN_TYPE.TEXT, label: 'Text' },
  { value: CHECKLIST_COLUMN_TYPE.NUMBER, label: 'Number' },
  { value: CHECKLIST_COLUMN_TYPE.DATE, label: 'Date' },
]

onBeforeUnmount(() => {
  stopAutoScroll()
})

watch(
  rows,
  (nextRows) => {
    const nextDrafts = { ...rowDrafts.value }
    const activeIds = new Set((nextRows || []).map((row) => String(row.id)))

    for (const row of nextRows || []) {
      const rowId = String(row.id)
      if (!nextDrafts[rowId]) nextDrafts[rowId] = createRowDraft(row)
    }

    for (const rowId of Object.keys(nextDrafts)) {
      if (!activeIds.has(rowId)) delete nextDrafts[rowId]
    }

    rowDrafts.value = nextDrafts
  },
  { immediate: true }
)

function createEmptyRow() {
  return {
    level: '',
    cableLabel: '',
    cableId: '',
    sweepTestReceived: '',
    remark: '',
    cableLength: '',
    proofTasks: normalizeProofTasks(),
    fieldValues: {},
  }
}

function createRowDraft(row) {
  return {
    level: row?.level || '',
    cableLabel: row?.cableLabel || '',
    cableId: row?.cableId || '',
    sweepTestReceived: normalizeDateInputValue(row?.sweepTestReceived),
    remark: row?.remark || '',
    cableLength: row?.cableLength || '',
    fieldValues: { ...(row?.fieldValues || {}) },
  }
}

function getRowDraft(row) {
  const rowId = String(row.id)
  if (!rowDrafts.value[rowId]) {
    rowDrafts.value = { ...rowDrafts.value, [rowId]: createRowDraft(row) }
  }
  return rowDrafts.value[rowId]
}

function showStatus(message, tone = 'confirm') {
  statusMessage.value = message
  statusTone.value = tone
  window.clearTimeout(showStatus.timeoutId)
  showStatus.timeoutId = window.setTimeout(() => {
    statusMessage.value = ''
  }, 4500)
}

function goBack() {
  router.push(buildSitePath(siteId))
}

function openImportPicker() {
  importInputRef.value?.click()
}

function handleDownloadTemplate() {
  downloadCableChecklistTemplate(customColumns.value)
  showStatus('Cable checklist template downloaded.')
}

async function handleExport() {
  if (!rows.value?.length) {
    showStatus('Add a cable checklist row before exporting.', 'issue')
    return
  }

  downloadCableChecklistExport(rows.value, site.value?.name || siteId, customColumns.value)
  await logAction('Cable checklist exported', `${siteId} - ${rows.value.length} rows`)
  showStatus('Cable checklist export downloaded.')
}

async function createRow() {
  if (!newRow.value.cableLabel.trim() && !newRow.value.cableId.trim()) {
    showStatus('Enter at least a cable label or cable ID.', 'issue')
    return
  }

  await addRow(newRow.value)
  await logAction('Cable checklist row added', `${siteId} - ${newRow.value.cableLabel || newRow.value.cableId}`)
  newRow.value = createEmptyRow()
  showStatus('Cable checklist row added.')
}

async function handleImportFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  isImporting.value = true
  try {
    const parsed = await parseCableChecklistSpreadsheet(file)
    const mergedColumns = await mergeImportedCustomColumns(parsed.customColumns || [])
    const importedColumns = mergeImportedColumns(parsed.customColumns || [], mergedColumns)
    const parsedRows = remapImportedRowFieldValues(parsed.rows, parsed.customColumns || [], importedColumns)
    const result = await importRows(parsedRows)
    await logAction('Cable checklist imported', `${siteId} - ${result.addedRows} added, ${result.updatedRows} updated`)
    showStatus(`Imported ${result.addedRows} new rows and updated ${result.updatedRows} rows.`)
  } catch (error) {
    showStatus(`Import failed: ${error.message}`, 'issue')
  } finally {
    isImporting.value = false
  }
}

async function saveDraftField(row, field) {
  const draft = getRowDraft(row)
  const value = draft[field] || ''
  if (value === (row[field] || '')) return
  await updateRow(row.id, { [field]: value })
}

async function saveDraftCustomField(row, column) {
  const draft = getRowDraft(row)
  const currentValue = row.fieldValues?.[column.id] || ''
  const nextValue = draft.fieldValues?.[column.id] || ''
  if (nextValue === currentValue) return

  await updateRow(row.id, {
    fieldValues: {
      ...(row.fieldValues || {}),
      [column.id]: nextValue,
    },
  })
}

async function handleProofTaskChange(row, task, event) {
  const status = event.target.checked ? CABLE_CHECKLIST_PROOF_STATUS.RECEIVED : CABLE_CHECKLIST_PROOF_STATUS.NOT_RECEIVED
  await setProofTaskStatus(row.id, task.id, status)
}

function toggleProofTasks(rowId) {
  const next = new Set(collapsedProofRows.value)
  if (next.has(rowId)) {
    next.delete(rowId)
  } else {
    next.add(rowId)
  }
  collapsedProofRows.value = next
}

function toggleAllProofTasks() {
  const currentRows = rows.value || []
  collapsedProofRows.value = areAllProofRowsCollapsed.value
    ? new Set()
    : new Set(currentRows.map((row) => row.id))
}

function isProofTasksCollapsed(rowId) {
  return collapsedProofRows.value.has(rowId)
}

function getProofTasks(row) {
  return normalizeProofTasks(row?.proofTasks)
}

function getProofTaskSummary(row) {
  const proofTasks = getProofTasks(row)
  const received = CABLE_CHECKLIST_PROOF_TASKS.filter((task) => proofTasks[task.id] === CABLE_CHECKLIST_PROOF_STATUS.RECEIVED).length
  return `${received}/${CABLE_CHECKLIST_PROOF_TASKS.length} received`
}

async function removeRow(row) {
  await deleteRow(row.id)
  const nextDrafts = { ...rowDrafts.value }
  delete nextDrafts[String(row.id)]
  rowDrafts.value = nextDrafts
  await logAction('Cable checklist row deleted', `${siteId} - ${row.cableLabel || row.cableId}`)
  showStatus('Cable checklist row removed.')
}

function openChangeLogModal(row) {
  activeChangeLog.value = {
    cableLabel: row.cableLabel || 'No cable label',
    cableId: row.cableId || 'No cable ID',
    entries: [...getChangeHistory(row)].reverse(),
  }
}

function closeChangeLogModal() {
  activeChangeLog.value = null
}

function getChangeHistory(row) {
  return Array.isArray(row?.changeHistory) ? row.changeHistory : []
}

function getFieldLabel(field) {
  if (field === 'cableLabel') return 'Cable label'
  if (field === 'cableId') return 'Cable ID'
  if (field === 'sweepTestReceived') return 'Sweep test received'
  if (field === 'cableLength') return 'Cable length Est. + 10 %'
  return String(field || '').replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()).trim()
}

function getChangeLogLabel(entry) {
  if (entry?.type === 'proof-task') {
    const task = CABLE_CHECKLIST_PROOF_TASKS.find((item) => item.id === entry.taskId)
    return `${task?.label || 'Cable proof'}: ${getProofStatusLabel(entry?.fromStatus)} -> ${getProofStatusLabel(entry?.toStatus)}`
  }

  return `${getFieldLabel(entry?.field)}: ${entry?.fromValue || 'Blank'} -> ${entry?.toValue || 'Blank'}`
}

function getProofStatusLabel(status) {
  return status === CABLE_CHECKLIST_PROOF_STATUS.RECEIVED ? 'Received' : 'Not received'
}

function formatChangeLogDate(value) {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatLength(value) {
  return Number.isFinite(value) ? value.toFixed(value % 1 === 0 ? 0 : 2) : '0'
}

function normalizeDateInputValue(value) {
  if (!value) return ''

  const text = String(value).trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (/^\d{5}$/.test(text)) {
    const serial = Number(text)
    const parsed = new Date((serial - 25569) * 86400 * 1000)
    if (!Number.isNaN(parsed.getTime())) {
      return [
        parsed.getUTCFullYear(),
        String(parsed.getUTCMonth() + 1).padStart(2, '0'),
        String(parsed.getUTCDate()).padStart(2, '0'),
      ].join('-')
    }
  }

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return ''

  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0'),
  ].join('-')
}

function startRowDrag(rowId, event) {
  draggedRowId.value = rowId
  dropRowId.value = rowId
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(rowId))
  }
}

function onRowDragOver(rowId, event) {
  event.preventDefault()
  if (draggedRowId.value === null) return
  dropRowId.value = rowId
  updateAutoScroll(event)
}

async function onRowDrop(rowId, event) {
  event.preventDefault()
  if (draggedRowId.value === null || draggedRowId.value === rowId) {
    clearRowDragState()
    return
  }

  const current = [...(rows.value || [])]
  const fromIndex = current.findIndex((item) => item.id === draggedRowId.value)
  const toIndex = current.findIndex((item) => item.id === rowId)
  if (fromIndex === -1 || toIndex === -1) {
    clearRowDragState()
    return
  }

  const [moved] = current.splice(fromIndex, 1)
  current.splice(toIndex, 0, moved)

  await reorderRows(current.map((item) => item.id))
  await logAction('Cable checklist reordered', `${siteId} - ${moved.cableLabel || moved.cableId}`)
  clearRowDragState()
}

function clearRowDragState() {
  draggedRowId.value = null
  dropRowId.value = null
  stopAutoScroll()
}

function updateAutoScroll(event) {
  const container = scrollContainerRef.value
  if (!container || draggedRowId.value === null) return

  const rect = container.getBoundingClientRect()
  const threshold = 90
  const maxSpeed = 18
  let delta = 0

  if (event.clientY < rect.top + threshold) {
    delta = -Math.max(6, ((rect.top + threshold - event.clientY) / threshold) * maxSpeed)
  } else if (event.clientY > rect.bottom - threshold) {
    delta = Math.max(6, ((event.clientY - (rect.bottom - threshold)) / threshold) * maxSpeed)
  }

  if (delta === 0) {
    stopAutoScroll()
    return
  }

  if (autoScrollFrame.value) cancelAnimationFrame(autoScrollFrame.value)
  const step = () => {
    container.scrollTop += delta
    autoScrollFrame.value = requestAnimationFrame(step)
  }

  autoScrollFrame.value = requestAnimationFrame(step)
}

function stopAutoScroll() {
  if (autoScrollFrame.value) {
    cancelAnimationFrame(autoScrollFrame.value)
    autoScrollFrame.value = null
  }
}

function openAddColumnModal() {
  showAddColumnModal.value = true
}

function openCableSummaryModal() {
  showCableSummaryModal.value = true
}

function closeCableSummaryModal() {
  showCableSummaryModal.value = false
}

async function copyCableSummary(type) {
  const entries = type === 'cleared' ? cableProofSummary.value.cleared : cableProofSummary.value.pending
  const heading = type === 'cleared' ? 'Cable Checklist cleared summary:' : 'Cable Checklist pending summary:'
  const text = formatCableSummaryText(heading, entries)

  if (!text.trim()) {
    showStatus(`No ${type} cable checklist summary to copy.`, 'issue')
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    showStatus(`${type === 'cleared' ? 'Cleared' : 'Pending'} cable checklist summary copied.`)
  } catch (error) {
    showStatus('Copy failed. Select the summary text and copy manually.', 'issue')
  }
}

function closeAddColumnModal() {
  showAddColumnModal.value = false
  newColumnName.value = ''
  newColumnType.value = CHECKLIST_COLUMN_TYPE.TEXT
  addColumnError.value = ''
}

async function handleAddColumn() {
  const label = newColumnName.value.trim()
  if (!label) {
    addColumnError.value = 'Column name is required.'
    return
  }

  try {
    await addCustomColumn({
      label,
      type: newColumnType.value,
    })
    await logAction('Cable checklist column added', `${siteId} - ${label}`)
    showStatus('Cable checklist column added.')
    closeAddColumnModal()
  } catch (error) {
    addColumnError.value = error.message
  }
}

async function handleRemoveColumn(column) {
  await removeCustomColumnValues(column.id)
  await removeCustomColumn(column.id)
  await logAction('Cable checklist column removed', `${siteId} - ${column.label}`)
  showStatus('Cable checklist column removed.')
}

function mergeImportedColumns(importedColumns, storedColumns) {
  return (importedColumns || []).map((column) => {
    const match = (storedColumns || []).find(
      (item) => item.label.toLowerCase() === column.label.toLowerCase()
    )
    return match || column
  })
}

function remapImportedRowFieldValues(sourceRows, sourceColumns, targetColumns) {
  const columnIdMap = Object.fromEntries(
    (sourceColumns || []).map((column, index) => [
      column.id || column.label,
      targetColumns[index]?.id || column.id || column.label,
    ])
  )

  return (sourceRows || []).map((row) => ({
    ...row,
    fieldValues: Object.fromEntries(
      Object.entries(row.fieldValues || {}).map(([key, value]) => [columnIdMap[key] || key, value])
    ),
  }))
}

function buildCableProofSummary(sourceRows) {
  const pendingGroups = new Map()
  const clearedGroups = new Map()

  ;(sourceRows || []).forEach((row) => {
    const proofTasks = getProofTasks(row)
    const pendingTasks = CABLE_CHECKLIST_PROOF_TASKS.filter((task) => proofTasks[task.id] !== CABLE_CHECKLIST_PROOF_STATUS.RECEIVED)
    const clearedTasks = CABLE_CHECKLIST_PROOF_TASKS.filter((task) => proofTasks[task.id] === CABLE_CHECKLIST_PROOF_STATUS.RECEIVED)
    const cableLabel = row.cableLabel || row.cableId || `Cable row ${row.order || row.id || ''}`.trim()

    if (pendingTasks.length === CABLE_CHECKLIST_PROOF_TASKS.length) {
      addCableSummaryGroup(pendingGroups, 'all', cableLabel, [], 'all not yet received')
    } else if (pendingTasks.length > 0) {
      addCableSummaryGroup(
        pendingGroups,
        pendingTasks.map((task) => task.id).join('|'),
        cableLabel,
        pendingTasks.map((task) => task.label)
      )
    }

    if (clearedTasks.length === CABLE_CHECKLIST_PROOF_TASKS.length) {
      addCableSummaryGroup(clearedGroups, 'all', cableLabel, [], 'all received')
    } else if (clearedTasks.length > 0) {
      addCableSummaryGroup(
        clearedGroups,
        clearedTasks.map((task) => task.id).join('|'),
        cableLabel,
        clearedTasks.map((task) => task.label)
      )
    }
  })

  return {
    pending: formatCableSummaryGroups(pendingGroups),
    cleared: formatCableSummaryGroups(clearedGroups),
  }
}

function addCableSummaryGroup(groups, key, cableLabel, tasks, suffix = '') {
  if (!groups.has(key)) {
    groups.set(key, {
      cables: [],
      tasks,
      suffix,
    })
  }

  groups.get(key).cables.push(cableLabel)
}

function formatCableSummaryGroups(groups) {
  return [...groups.values()].map((group, index) => {
    const cableLines = chunkCableLabels(group.cables, 6).map((cables, lineIndex) =>
      `${lineIndex === 0 ? `${index + 1}. ` : ''}${cables.join(',')}`
    )

    return {
      id: `${index}-${group.cables.join('-')}-${group.suffix || group.tasks.join('-')}`,
      cableLines,
      suffix: group.suffix,
      tasks: group.tasks,
    }
  })
}

function chunkCableLabels(cables, size) {
  const chunks = []
  for (let index = 0; index < cables.length; index += size) {
    chunks.push(cables.slice(index, index + size))
  }
  return chunks
}

function formatCableSummaryText(heading, entries) {
  if (!entries.length) return ''

  return [
    heading,
    ...entries.flatMap((entry) => [
      `${entry.cableLines.join('\n')}${entry.suffix ? ` (${entry.suffix})` : ''}`,
      ...entry.tasks.map((task) => `- ${task}`),
      '',
    ]),
  ].join('\n').trim()
}
</script>

<template>
  <div class="col grow" style="overflow: auto">
    <input ref="importInputRef" type="file" accept=".xlsx,.xls,.csv" hidden @change="handleImportFile" />

    <Topbar :title="title" :subtitle="subtitle">
      <button type="button" class="btn btn-ghost" @click="openAddColumnModal">
        <MaterialIcon name="view_column" />
        Add column
      </button>
      <button type="button" class="btn btn-ghost" :disabled="!rows?.length" @click="openCableSummaryModal">
        <MaterialIcon name="summarize" />
        Cable summary
      </button>
      <button type="button" class="btn btn-ghost" :disabled="!rows?.length" @click="toggleAllProofTasks">
        <MaterialIcon :name="areAllProofRowsCollapsed ? 'unfold_more' : 'unfold_less'" />
        {{ areAllProofRowsCollapsed ? 'Show subtasks' : 'Hide subtasks' }}
      </button>
      <button type="button" class="btn btn-ghost" @click="handleExport">
        <MaterialIcon name="download_for_offline" />
        Export cable checklist
      </button>
      <button type="button" class="btn btn-ghost" @click="handleDownloadTemplate">
        <MaterialIcon name="download" />
        Download template
      </button>
      <button type="button" class="btn btn-ghost" :disabled="isImporting" @click="openImportPicker">
        <MaterialIcon name="upload_file" />
        {{ isImporting ? 'Importing...' : 'Import Excel' }}
      </button>
      <button type="button" class="btn btn-ghost" @click="goBack">
        <MaterialIcon name="arrow_back" />
        Back to site
      </button>
    </Topbar>

    <div
      ref="scrollContainerRef"
      class="col grow"
      style="overflow-y: auto; padding: 0 20px 20px"
      @dragover="draggedRowId !== null ? updateAutoScroll($event) : null"
      @dragleave="stopAutoScroll"
      @drop="stopAutoScroll"
    >
      <div
        class="col"
        style="position: sticky; top: 0; z-index: 10; padding: 20px 12px 12px; margin: 0 -12px 20px; background: var(--paper); border-bottom: 1px solid var(--line); box-shadow: 0 6px 0 var(--paper), 0 10px 18px rgba(26, 26, 26, 0.04)"
      >
        <div class="row gap-3" style="flex-wrap: wrap">
          <StatCard label="Cable rows" :value="summary.total || 0" />
          <StatCard label="Platform level" :value="summary.platformLevel || 0" accent="var(--confirm)" />
          <StatCard label="Ground level" :value="summary.groundLevel || 0" accent="var(--confirm)" />
          <StatCard label="Length total" :value="formatLength(summary.totalLength || 0)" :sub="`${summary.withSweepTest || 0} sweep test`" />
          <StatCard label="Cable proof" :value="summary.proofReceived || 0" accent="var(--confirm)" :sub="`${summary.proofTotal || 0} total subtasks`" />
          <div class="box p-4 col gap-3 grow" style="min-width: 320px; flex: 1 1 720px">
            <div class="title-md">Add cable checklist row</div>
            <div class="row gap-2" style="flex-wrap: wrap">
              <input v-model="newRow.level" class="field" type="text" placeholder="LEVEL" style="flex: 1 1 160px" />
              <input v-model="newRow.cableLabel" class="field" type="text" placeholder="Cable label" style="flex: 2 1 300px" />
              <input v-model="newRow.cableId" class="field" type="text" placeholder="Cable ID" style="flex: 1 1 140px" />
              <input v-model="newRow.sweepTestReceived" class="field" type="date" style="flex: 1 1 180px" />
              <input v-model="newRow.remark" class="field" type="text" placeholder="Remark" style="flex: 1 1 140px" />
              <input v-model="newRow.cableLength" class="field" type="text" placeholder="Cable length Est. + 10 %" style="flex: 1 1 180px" />
              <template v-for="column in customColumns" :key="column.id">
                <input
                  v-if="column.type === CHECKLIST_COLUMN_TYPE.TEXT"
                  v-model="newRow.fieldValues[column.id]"
                  class="field"
                  type="text"
                  :placeholder="column.label"
                  style="flex: 1 1 180px"
                />
                <input
                  v-else-if="column.type === CHECKLIST_COLUMN_TYPE.NUMBER"
                  v-model="newRow.fieldValues[column.id]"
                  class="field"
                  type="number"
                  :placeholder="column.label"
                  style="flex: 1 1 180px"
                />
                <input
                  v-else
                  v-model="newRow.fieldValues[column.id]"
                  class="field"
                  type="date"
                  style="flex: 1 1 180px"
                />
              </template>
            </div>
            <button type="button" class="btn btn-primary" style="align-self: flex-start" @click="createRow">
              <MaterialIcon name="add" />
              Add row
            </button>
          </div>
        </div>
      </div>

      <div v-if="!rows?.length" class="box-dash p-5 col center gap-3" style="min-height: 220px; text-align: center">
        <MaterialIcon name="checklist" :size="34" style="color: var(--ink-3)" />
        <div class="title-md">No cable checklist rows yet</div>
        <div class="small">Import a cable checklist sheet or add cable rows here for the field team to track.</div>
      </div>

      <div v-else class="box" style="overflow-x: auto">
        <table style="width: 100%; min-width: 1480px; border-collapse: collapse">
          <thead>
            <tr>
              <th class="table-head">LEVEL</th>
              <th class="table-head">Cable label</th>
              <th class="table-head">Cable ID</th>
              <th class="table-head">Sweep test received</th>
              <th class="table-head">Remark</th>
              <th class="table-head">Cable length Est. + 10 %</th>
              <th v-for="column in customColumns" :key="column.id" class="table-head">
                <div class="header-cell">
                  <span>{{ column.label }}</span>
                  <button type="button" class="chip chip-pending header-remove" @click="handleRemoveColumn(column)">
                    <MaterialIcon name="delete" :size="12" />
                    Remove
                  </button>
                </div>
              </th>
              <th class="table-head">Action</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in rows" :key="row.id">
            <tr
                :style="{
                  borderTop: '1px dashed var(--line)',
                  opacity: draggedRowId === row.id ? 0.6 : 1,
                  background: dropRowId === row.id && draggedRowId !== row.id ? 'color-mix(in srgb, var(--paper-2) 75%, white)' : '',
                }"
                @dragover="onRowDragOver(row.id, $event)"
                @drop="onRowDrop(row.id, $event)"
                @dragend="clearRowDragState"
              >
              <td class="table-cell">
                <div class="row gap-2" style="align-items: center">
                  <button type="button" class="chip drag-chip" draggable="true" title="Drag to reorder" @dragstart="startRowDrag(row.id, $event)">
                    <MaterialIcon name="drag_indicator" :size="14" />
                    Move
                  </button>
                  <input class="field level-field" type="text" v-model="getRowDraft(row).level" @blur="saveDraftField(row, 'level')" />
                </div>
              </td>
              <td class="table-cell"><input class="field cable-label-field" type="text" v-model="getRowDraft(row).cableLabel" @blur="saveDraftField(row, 'cableLabel')" /></td>
              <td class="table-cell"><input class="field cable-id-field" type="text" v-model="getRowDraft(row).cableId" @blur="saveDraftField(row, 'cableId')" /></td>
              <td class="table-cell"><input class="field sweep-field" type="date" v-model="getRowDraft(row).sweepTestReceived" @blur="saveDraftField(row, 'sweepTestReceived')" /></td>
              <td class="table-cell"><input class="field remark-field" type="text" v-model="getRowDraft(row).remark" @blur="saveDraftField(row, 'remark')" /></td>
              <td class="table-cell"><input class="field length-field" type="text" v-model="getRowDraft(row).cableLength" @blur="saveDraftField(row, 'cableLength')" /></td>
              <td v-for="column in customColumns" :key="column.id" class="table-cell">
                <input
                  v-if="column.type === CHECKLIST_COLUMN_TYPE.TEXT"
                  class="field custom-field"
                  type="text"
                  v-model="getRowDraft(row).fieldValues[column.id]"
                  @blur="saveDraftCustomField(row, column)"
                />
                <input
                  v-else-if="column.type === CHECKLIST_COLUMN_TYPE.NUMBER"
                  class="field custom-field"
                  type="number"
                  v-model="getRowDraft(row).fieldValues[column.id]"
                  @blur="saveDraftCustomField(row, column)"
                />
                <input
                  v-else
                  class="field custom-field"
                  type="date"
                  v-model="getRowDraft(row).fieldValues[column.id]"
                  @blur="saveDraftCustomField(row, column)"
                />
              </td>
              <td class="table-cell">
                <div class="row gap-2" style="flex-wrap: wrap">
                  <button type="button" class="chip" @click="toggleProofTasks(row.id)">
                    <MaterialIcon :name="isProofTasksCollapsed(row.id) ? 'expand_more' : 'expand_less'" :size="14" />
                    {{ isProofTasksCollapsed(row.id) ? 'Show subtasks' : 'Hide subtasks' }}
                  </button>
                  <span class="chip chip-neutral">
                    {{ getProofTaskSummary(row) }}
                  </span>
                  <button type="button" class="chip" @click="openChangeLogModal(row)">
                    <MaterialIcon name="history" :size="14" />
                    Log
                  </button>
                  <button type="button" class="chip" @click="removeRow(row)">
                    <MaterialIcon name="delete" :size="14" />
                    Remove
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!isProofTasksCollapsed(row.id)" class="proof-task-row">
              <td class="table-cell" :colspan="7 + customColumns.length">
                <div class="proof-task-panel">
                  <label
                    v-for="task in CABLE_CHECKLIST_PROOF_TASKS"
                    :key="task.id"
                    class="proof-task-item"
                  >
                    <input
                      type="checkbox"
                      :checked="getProofTasks(row)[task.id] === CABLE_CHECKLIST_PROOF_STATUS.RECEIVED"
                      @change="handleProofTaskChange(row, task, $event)"
                    />
                    <span>{{ task.label }}</span>
                    <span
                      class="chip"
                      :class="getProofTasks(row)[task.id] === CABLE_CHECKLIST_PROOF_STATUS.RECEIVED ? 'chip-confirm' : 'chip-pending'"
                    >
                      {{ getProofTasks(row)[task.id] === CABLE_CHECKLIST_PROOF_STATUS.RECEIVED ? 'Received' : 'Not received' }}
                    </span>
                  </label>
                </div>
              </td>
            </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <div
      v-if="statusMessage"
      class="chip"
      :class="statusTone === 'issue' ? 'chip-issue' : 'chip-confirm'"
      style="position: fixed; bottom: 20px; right: 20px; z-index: 100; padding: 8px 14px"
    >
      <MaterialIcon :name="statusTone === 'issue' ? 'error' : 'check_circle'" :size="14" />
      {{ statusMessage }}
    </div>

    <Teleport to="body">
      <div v-if="showAddColumnModal" class="add-site-overlay" @click.self="closeAddColumnModal">
        <div class="add-site-modal box col gap-4">
          <div class="between" style="align-items: center">
            <div class="title-md">Add cable checklist column</div>
            <button type="button" class="btn btn-ghost" style="padding: 4px 8px" @click="closeAddColumnModal">
              <MaterialIcon name="close" :size="20" />
            </button>
          </div>

          <div class="col gap-2">
            <div class="label">Column name</div>
            <input
              v-model="newColumnName"
              class="field"
              type="text"
              placeholder="Example: Drum ID"
              @input="addColumnError = ''"
            />
          </div>

          <div class="col gap-2">
            <div class="label">Column type</div>
            <select v-model="newColumnType" class="field" style="cursor: pointer">
              <option v-for="option in columnTypeOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>

          <div v-if="addColumnError" class="tiny" style="color: var(--issue)">{{ addColumnError }}</div>

          <div class="col gap-2">
            <div class="label">Custom columns</div>
            <div v-if="!customColumns.length" class="box-soft p-3 small" style="color: var(--ink)">
              No added columns yet. Baseline cable checklist columns stay in place and cannot be removed here.
            </div>
            <div v-else class="col gap-2">
              <div
                v-for="column in customColumns"
                :key="column.id"
                class="box-soft p-3 row gap-2"
                style="justify-content: space-between; align-items: center; flex-wrap: wrap"
              >
                <div class="col gap-1">
                  <div class="small" style="color: var(--ink)">{{ column.label }}</div>
                  <div class="tiny">{{ column.type }}</div>
                </div>
                <button type="button" class="chip chip-pending" @click="handleRemoveColumn(column)">
                  <MaterialIcon name="delete" :size="14" />
                  Remove
                </button>
              </div>
            </div>
          </div>

          <div class="row gap-2" style="justify-content: flex-end">
            <button type="button" class="btn btn-ghost" @click="closeAddColumnModal">Cancel</button>
            <button type="button" class="btn btn-primary" @click="handleAddColumn">
              <MaterialIcon name="save" />
              Add column
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showCableSummaryModal" class="add-site-overlay" @click.self="closeCableSummaryModal">
        <div class="add-site-modal cable-summary-modal box col gap-4">
          <div class="between" style="align-items: center">
            <div class="title-md">Cable checklist summary</div>
            <button type="button" class="btn btn-ghost" style="padding: 4px 8px" @click="closeCableSummaryModal">
              <MaterialIcon name="close" :size="20" />
            </button>
          </div>

          <div class="col gap-3">
            <div class="between">
              <div class="title-md">Cable Checklist pending summary:</div>
              <div class="row gap-2" style="align-items: center">
                <span class="small">{{ cableProofSummary.pending.length }} groups</span>
                <button
                  type="button"
                  class="chip"
                  :disabled="!cableProofSummary.pending.length"
                  @click="copyCableSummary('pending')"
                >
                  <MaterialIcon name="content_copy" :size="14" />
                  Copy
                </button>
              </div>
            </div>
            <div v-if="!cableProofSummary.pending.length" class="box-dash p-4 small">
              No pending cable proof subtasks.
            </div>
            <div v-else class="box p-4 col cable-summary-list">
              <div
                v-for="entry in cableProofSummary.pending"
                :key="entry.id"
                class="cable-summary-entry"
              >
                <div class="small cable-summary-title">
                  <div
                    v-for="line in entry.cableLines"
                    :key="line"
                    class="cable-summary-line"
                  >
                    {{ line }}
                  </div>
                  <span v-if="entry.suffix">({{ entry.suffix }})</span>
                </div>
                <div v-for="task in entry.tasks" :key="task" class="small cable-summary-task">- {{ task }}</div>
              </div>
            </div>
          </div>

          <div class="summary-divider" />

          <div class="col gap-3">
            <div class="between">
              <div class="title-md">Cable Checklist cleared summary:</div>
              <div class="row gap-2" style="align-items: center">
                <span class="small">{{ cableProofSummary.cleared.length }} groups</span>
                <button
                  type="button"
                  class="chip"
                  :disabled="!cableProofSummary.cleared.length"
                  @click="copyCableSummary('cleared')"
                >
                  <MaterialIcon name="content_copy" :size="14" />
                  Copy
                </button>
              </div>
            </div>
            <div v-if="!cableProofSummary.cleared.length" class="box-dash p-4 small">
              No cleared cable proof subtasks.
            </div>
            <div v-else class="box p-4 col cable-summary-list">
              <div
                v-for="entry in cableProofSummary.cleared"
                :key="entry.id"
                class="cable-summary-entry"
              >
                <div class="small cable-summary-title">
                  <div
                    v-for="line in entry.cableLines"
                    :key="line"
                    class="cable-summary-line"
                  >
                    {{ line }}
                  </div>
                  <span v-if="entry.suffix">({{ entry.suffix }})</span>
                </div>
                <div v-for="task in entry.tasks" :key="task" class="small cable-summary-task">- {{ task }}</div>
              </div>
            </div>
          </div>

          <div class="row gap-2" style="justify-content: flex-end">
            <button type="button" class="btn btn-primary" @click="closeCableSummaryModal">Close</button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="activeChangeLog" class="add-site-overlay" @click.self="closeChangeLogModal">
        <div class="add-site-modal box col gap-4">
          <div class="between" style="align-items: center">
            <div class="title-md">Cable checklist log</div>
            <button type="button" class="btn btn-ghost" style="padding: 4px 8px" @click="closeChangeLogModal">
              <MaterialIcon name="close" :size="20" />
            </button>
          </div>

          <div class="col gap-2">
            <div class="label">Cable label</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">{{ activeChangeLog.cableLabel }}</div>
          </div>

          <div class="col gap-2">
            <div class="label">Cable ID</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">{{ activeChangeLog.cableId }}</div>
          </div>

          <div v-if="!activeChangeLog.entries.length" class="box-dash p-4 small">
            No row changes recorded yet. Edit any cable checklist column to start the log.
          </div>

          <div v-else class="col gap-2">
            <div v-for="entry in activeChangeLog.entries" :key="entry.id || entry.changedAt" class="box-soft p-3 col gap-1">
              <div class="row gap-2" style="align-items: center; flex-wrap: wrap">
                <span class="chip chip-neutral">
                  <MaterialIcon name="event" :size="14" />
                  {{ formatChangeLogDate(entry.changedAt) }}
                </span>
                <span class="small" style="color: var(--ink)">{{ getChangeLogLabel(entry) }}</span>
              </div>
              <div class="tiny" style="color: var(--ink-3)">By {{ getActivityActorLabel(entry) }}</div>
            </div>
          </div>

          <div class="row gap-2" style="justify-content: flex-end">
            <button type="button" class="btn btn-primary" @click="closeChangeLogModal">Close</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.add-site-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.add-site-modal {
  background: var(--paper);
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
}

.cable-summary-modal {
  max-width: 760px;
}

.cable-summary-list {
  max-height: 32vh;
  overflow-y: auto;
}

.cable-summary-entry {
  padding: 12px 0;
  border-bottom: 1px dashed var(--line);
}

.cable-summary-entry:last-child {
  border-bottom: 0;
}

.cable-summary-title {
  color: var(--ink);
  font-weight: 700;
}

.cable-summary-line + .cable-summary-line {
  margin-top: 2px;
}

.cable-summary-task {
  margin-top: 6px;
  padding-left: 16px;
  color: var(--ink-2);
}

.summary-divider {
  border-top: 2px dashed var(--line);
}

.table-head {
  padding: 14px 12px;
  text-align: left;
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.table-cell {
  padding: 12px;
  vertical-align: top;
}

.level-field,
.cable-id-field,
.remark-field,
.length-field {
  min-width: 140px;
}

.cable-label-field {
  min-width: 260px;
}

.sweep-field {
  min-width: 180px;
}

.custom-field {
  min-width: 180px;
}

.drag-chip {
  cursor: grab;
  flex-shrink: 0;
  white-space: nowrap;
}

.header-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.header-remove {
  padding: 2px 8px;
  font-size: 10px;
}

.proof-task-row {
  background: color-mix(in srgb, var(--paper-2) 72%, white);
}

.proof-task-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.proof-task-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px dashed var(--line);
  background: var(--paper);
}

.proof-task-item input {
  width: 18px;
  height: 18px;
  accent-color: var(--confirm);
}

.proof-task-item span {
  min-width: 0;
}
</style>
