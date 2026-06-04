<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import { CABLE_CHECK_STATUS, useCableMatrix } from '../composables/useCableMatrix.js'
import { useCableMatrixLayout } from '../composables/useCableMatrixLayout.js'
import { useActivityLog } from '../composables/useActivityLog.js'
import {
  downloadCableMatrixExport,
  downloadCableMatrixTemplate,
  parseCableMatrixSpreadsheet,
} from '../lib/cableMatrixSpreadsheet.js'
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
const { rows, summary, addRow, updateRow, deleteRow, reorderRows, setRowStatus, importRows, removeCustomColumnValues } = useCableMatrix(siteId)
const { customColumns, addCustomColumn, removeCustomColumn, mergeImportedCustomColumns } = useCableMatrixLayout(siteId)
const { logAction } = useActivityLog()

const importInputRef = ref(null)
const isImporting = ref(false)
const statusMessage = ref('')
const statusTone = ref('confirm')
const newRow = ref(createEmptyRow())
const activeStatusLog = ref(null)
const scrollContainerRef = ref(null)
const autoScrollFrame = ref(null)
const draggedRowId = ref(null)
const dropRowId = ref(null)
const showAddColumnModal = ref(false)
const newColumnName = ref('')
const newColumnType = ref(CHECKLIST_COLUMN_TYPE.TEXT)
const addColumnError = ref('')

const title = computed(() => (site.value ? `${site.value.name} cable matrix` : 'Site cable matrix'))
const subtitle = computed(() => {
  const location = site.value?.url || siteId
  return `${location} - ${summary.value.total || 0} cable rows tracked`
})
const columnTypeOptions = [
  { value: CHECKLIST_COLUMN_TYPE.TEXT, label: 'Text' },
  { value: CHECKLIST_COLUMN_TYPE.NUMBER, label: 'Number' },
  { value: CHECKLIST_COLUMN_TYPE.DATE, label: 'Date' },
]

onBeforeUnmount(() => {
  stopAutoScroll()
})

function createEmptyRow() {
  return {
    cableNumber: '',
    cableLabel: '',
    from: '',
    to: '',
    testStatus: CABLE_CHECK_STATUS.NO,
    labelOriginStatus: CABLE_CHECK_STATUS.NO,
    labelEndStatus: CABLE_CHECK_STATUS.NO,
    fieldValues: {},
  }
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
  downloadCableMatrixTemplate(customColumns.value)
  showStatus('Cable matrix template downloaded.')
}

async function handleExport() {
  if (!rows.value?.length) {
    showStatus('Add a cable row before exporting.', 'issue')
    return
  }

  downloadCableMatrixExport(rows.value, site.value?.name || siteId, customColumns.value)
  await logAction('Cable matrix exported', `${siteId} - ${rows.value.length} rows`)
  showStatus('Cable matrix export downloaded.')
}

async function createRow() {
  if (!newRow.value.cableNumber.trim() && !newRow.value.cableLabel.trim()) {
    showStatus('Enter at least a cable number or cable label.', 'issue')
    return
  }

  await addRow(newRow.value)
  await logAction('Cable matrix row added', `${siteId} - ${newRow.value.cableNumber || newRow.value.cableLabel}`)
  newRow.value = createEmptyRow()
  showStatus('Cable row added.')
}

async function handleImportFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''

  if (!file) return

  isImporting.value = true

  try {
    const parsed = await parseCableMatrixSpreadsheet(file)
    const mergedColumns = await mergeImportedCustomColumns(parsed.customColumns || [])
    const importedColumns = mergeImportedColumns(parsed.customColumns || [], mergedColumns)
    const parsedRows = remapImportedRowFieldValues(parsed.rows, parsed.customColumns || [], importedColumns)
    const result = await importRows(parsedRows)
    await logAction(
      'Cable matrix imported',
      `${siteId} - ${result.addedRows} added, ${result.updatedRows} updated`
    )
    showStatus(`Imported ${result.addedRows} new rows and updated ${result.updatedRows} rows.`)
  } catch (error) {
    showStatus(`Import failed: ${error.message}`, 'issue')
  } finally {
    isImporting.value = false
  }
}

async function handleTextChange(row, field, event) {
  const value = event.target.value
  if (value === (row[field] || '')) return
  await updateRow(row.id, { [field]: value })
}

async function handleCustomFieldChange(row, column, event) {
  const currentValue = row.fieldValues?.[column.id] || ''
  const nextValue = event.target.value
  if (nextValue === currentValue) return

  await updateRow(row.id, {
    fieldValues: {
      ...(row.fieldValues || {}),
      [column.id]: nextValue,
    },
  })
}

async function handleStatusChange(row, field, event) {
  const value = event.target.value
  if (value === row[field]) return
  await setRowStatus(row.id, field, value)
}

async function removeRow(row) {
  await deleteRow(row.id)
  await logAction('Cable matrix row deleted', `${siteId} - ${row.cableNumber || row.cableLabel}`)
  showStatus('Cable row removed.')
}

function getStatusLabel(status) {
  return status === CABLE_CHECK_STATUS.OK ? 'OK' : 'No'
}

function getSelectClass(status) {
  return status === CABLE_CHECK_STATUS.OK ? 'status-ok' : 'status-no'
}

function openStatusLogModal(row) {
  activeStatusLog.value = {
    cableNumber: row.cableNumber || 'No cable number',
    cableLabel: row.cableLabel || 'No cable label',
    entries: [...getStatusHistory(row)].reverse(),
  }
}

function closeStatusLogModal() {
  activeStatusLog.value = null
}

function getStatusHistory(row) {
  return Array.isArray(row?.statusHistory) ? row.statusHistory : []
}

function getStatusFieldLabel(field) {
  if (field === 'from') return 'From'
  if (field === 'to') return 'To'
  if (field === 'labelOriginStatus') return 'Label origin'
  if (field === 'labelEndStatus') return 'Label end'
  return 'Test'
}

function getStatusLogLabel(entry) {
  if (entry?.type === 'field') {
    return `${getStatusFieldLabel(entry?.field)}: ${entry?.fromValue || 'Blank'} -> ${entry?.toValue || 'Blank'}`
  }

  return `${getStatusFieldLabel(entry?.field)}: ${getStatusLabel(entry?.fromStatus)} -> ${getStatusLabel(entry?.toStatus)}`
}

function formatStatusLogDate(value) {
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
  await logAction('Cable matrix reordered', `${siteId} - ${moved.cableNumber || moved.cableLabel}`)
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
    await logAction('Cable matrix column added', `${siteId} - ${label}`)
    showStatus('Cable matrix column added.')
    closeAddColumnModal()
  } catch (error) {
    addColumnError.value = error.message
  }
}

async function handleRemoveColumn(column) {
  await removeCustomColumnValues(column.id)
  await removeCustomColumn(column.id)
  await logAction('Cable matrix column removed', `${siteId} - ${column.label}`)
  showStatus('Cable matrix column removed.')
}

function getCustomFieldValue(fieldValues, column) {
  return fieldValues?.[column.id] || ''
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
    (sourceColumns || []).map((column, index) => [column.id || column.label, targetColumns[index]?.id || column.id || column.label])
  )

  return (sourceRows || []).map((row) => ({
    ...row,
    fieldValues: Object.fromEntries(
      Object.entries(row.fieldValues || {}).map(([key, value]) => [columnIdMap[key] || key, value])
    ),
  }))
}
</script>

<template>
  <div class="col grow" style="overflow: auto">
    <input
      ref="importInputRef"
      type="file"
      accept=".xlsx,.xls,.csv"
      hidden
      @change="handleImportFile"
    />

    <Topbar :title="title" :subtitle="subtitle">
      <button type="button" class="btn btn-ghost" @click="openAddColumnModal">
        <MaterialIcon name="view_column" />
        Add column
      </button>
      <button type="button" class="btn btn-ghost" @click="handleExport">
        <MaterialIcon name="download_for_offline" />
        Export cable matrix
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
          <StatCard label="Test OK" :value="summary.testOk || 0" accent="var(--confirm)" />
          <StatCard label="Label origin OK" :value="summary.labelOriginOk || 0" accent="var(--confirm)" />
          <StatCard label="Label end OK" :value="summary.labelEndOk || 0" accent="var(--confirm)" :sub="`${summary.fullyChecked || 0} fully checked`" />
          <div class="box p-4 col gap-3 grow" style="min-width: 320px; flex: 1 1 420px">
            <div class="title-md">Add cable row</div>
            <div class="row gap-2" style="flex-wrap: wrap">
              <input
                v-model="newRow.cableNumber"
                class="field"
                type="text"
                placeholder="Cable Number"
                style="flex: 1 1 220px"
              />
              <input
                v-model="newRow.cableLabel"
                class="field"
                type="text"
                placeholder="Cable label at origin end destination"
                style="flex: 2 1 460px"
              />
              <input
                v-model="newRow.from"
                class="field"
                type="text"
                placeholder="From"
                style="flex: 1 1 220px"
              />
              <input
                v-model="newRow.to"
                class="field"
                type="text"
                placeholder="To"
                style="flex: 1 1 220px"
              />
            </div>
            <div class="row gap-2" style="flex-wrap: wrap">
              <select v-model="newRow.testStatus" class="field">
                <option :value="CABLE_CHECK_STATUS.NO">No</option>
                <option :value="CABLE_CHECK_STATUS.OK">OK</option>
              </select>
              <select v-model="newRow.labelOriginStatus" class="field">
                <option :value="CABLE_CHECK_STATUS.NO">No</option>
                <option :value="CABLE_CHECK_STATUS.OK">OK</option>
              </select>
              <select v-model="newRow.labelEndStatus" class="field">
                <option :value="CABLE_CHECK_STATUS.NO">No</option>
                <option :value="CABLE_CHECK_STATUS.OK">OK</option>
              </select>
            </div>
            <div v-if="customColumns.length" class="row gap-2" style="flex-wrap: wrap">
              <template v-for="column in customColumns" :key="column.id">
                <input
                  v-if="column.type === CHECKLIST_COLUMN_TYPE.TEXT"
                  v-model="newRow.fieldValues[column.id]"
                  class="field"
                  type="text"
                  :placeholder="column.label"
                  style="flex: 1 1 220px"
                />
                <input
                  v-else-if="column.type === CHECKLIST_COLUMN_TYPE.NUMBER"
                  v-model="newRow.fieldValues[column.id]"
                  class="field"
                  type="number"
                  :placeholder="column.label"
                  style="flex: 1 1 220px"
                />
                <input
                  v-else
                  v-model="newRow.fieldValues[column.id]"
                  class="field"
                  type="date"
                  style="flex: 1 1 220px"
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
        <MaterialIcon name="cable" :size="34" style="color: var(--ink-3)" />
        <div class="title-md">No cable matrix rows yet</div>
        <div class="small">Import a cable matrix sheet or add cable rows here for the field team to track.</div>
      </div>

      <div v-else class="box" style="overflow-x: auto">
        <table style="width: 100%; min-width: 980px; border-collapse: collapse">
          <thead>
            <tr>
              <th class="table-head">Cable Number</th>
              <th class="table-head">Cable label at origin end destination</th>
              <th class="table-head">From</th>
              <th class="table-head">To</th>
              <th class="table-head">Test</th>
              <th class="table-head">Label origin</th>
              <th class="table-head">Label end</th>
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
            <tr
              v-for="row in rows"
              :key="row.id"
              :style="{
                borderTop: '1px dashed var(--line)',
                opacity: draggedRowId === row.id ? 0.6 : 1,
                background:
                  dropRowId === row.id && draggedRowId !== row.id
                    ? 'color-mix(in srgb, var(--paper-2) 75%, white)'
                    : '',
              }"
              @dragover="onRowDragOver(row.id, $event)"
              @drop="onRowDrop(row.id, $event)"
              @dragend="clearRowDragState"
            >
              <td class="table-cell">
                <div class="row gap-2" style="align-items: center">
                  <button
                    type="button"
                    class="chip drag-chip"
                    draggable="true"
                    title="Drag to reorder"
                    @dragstart="startRowDrag(row.id, $event)"
                  >
                    <MaterialIcon name="drag_indicator" :size="14" />
                    Move
                  </button>
                  <input
                    class="field cable-number-field"
                    type="text"
                    :value="row.cableNumber || ''"
                    @change="handleTextChange(row, 'cableNumber', $event)"
                  />
                </div>
              </td>
              <td class="table-cell">
                <input
                  class="field cable-label-field"
                  type="text"
                  :value="row.cableLabel || ''"
                  @change="handleTextChange(row, 'cableLabel', $event)"
                />
              </td>
              <td class="table-cell">
                <input
                  class="field cable-end-field"
                  type="text"
                  :value="row.from || ''"
                  @change="handleTextChange(row, 'from', $event)"
                />
              </td>
              <td class="table-cell">
                <input
                  class="field cable-end-field"
                  type="text"
                  :value="row.to || ''"
                  @change="handleTextChange(row, 'to', $event)"
                />
              </td>
              <td class="table-cell">
                <select
                  class="field status-select"
                  :class="getSelectClass(row.testStatus)"
                  :value="row.testStatus"
                  @change="handleStatusChange(row, 'testStatus', $event)"
                >
                  <option :value="CABLE_CHECK_STATUS.NO">No</option>
                  <option :value="CABLE_CHECK_STATUS.OK">OK</option>
                </select>
              </td>
              <td class="table-cell">
                <select
                  class="field status-select"
                  :class="getSelectClass(row.labelOriginStatus)"
                  :value="row.labelOriginStatus"
                  @change="handleStatusChange(row, 'labelOriginStatus', $event)"
                >
                  <option :value="CABLE_CHECK_STATUS.NO">No</option>
                  <option :value="CABLE_CHECK_STATUS.OK">OK</option>
                </select>
              </td>
              <td class="table-cell">
                <select
                  class="field status-select"
                  :class="getSelectClass(row.labelEndStatus)"
                  :value="row.labelEndStatus"
                  @change="handleStatusChange(row, 'labelEndStatus', $event)"
                >
                  <option :value="CABLE_CHECK_STATUS.NO">No</option>
                  <option :value="CABLE_CHECK_STATUS.OK">OK</option>
                </select>
              </td>
              <td v-for="column in customColumns" :key="column.id" class="table-cell">
                <input
                  v-if="column.type === CHECKLIST_COLUMN_TYPE.TEXT"
                  class="field"
                  type="text"
                  :value="getCustomFieldValue(row.fieldValues, column)"
                  :placeholder="column.label"
                  @change="handleCustomFieldChange(row, column, $event)"
                />
                <input
                  v-else-if="column.type === CHECKLIST_COLUMN_TYPE.NUMBER"
                  class="field"
                  type="number"
                  :value="getCustomFieldValue(row.fieldValues, column)"
                  :placeholder="column.label"
                  @change="handleCustomFieldChange(row, column, $event)"
                />
                <input
                  v-else
                  class="field"
                  type="date"
                  :value="getCustomFieldValue(row.fieldValues, column)"
                  @change="handleCustomFieldChange(row, column, $event)"
                />
              </td>
              <td class="table-cell">
                <div class="row gap-2" style="flex-wrap: wrap">
                  <button type="button" class="chip" @click="openStatusLogModal(row)">
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
      <div
        v-if="showAddColumnModal"
        class="add-site-overlay"
        @click.self="closeAddColumnModal"
      >
        <div class="add-site-modal box col gap-4">
          <div class="between" style="align-items: center">
            <div class="title-md">Add cable matrix column</div>
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
              placeholder="Example: Pair ID"
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
              No added columns yet. Baseline cable matrix columns stay in place and cannot be removed here.
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
      <div
        v-if="activeStatusLog"
        class="add-site-overlay"
        @click.self="closeStatusLogModal"
      >
        <div class="add-site-modal box col gap-4">
          <div class="between" style="align-items: center">
            <div class="title-md">Cable matrix log</div>
            <button type="button" class="btn btn-ghost" style="padding: 4px 8px" @click="closeStatusLogModal">
              <MaterialIcon name="close" :size="20" />
            </button>
          </div>

          <div class="col gap-2">
            <div class="label">Cable number</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">{{ activeStatusLog.cableNumber }}</div>
          </div>

          <div class="col gap-2">
            <div class="label">Cable label at origin end destination</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">{{ activeStatusLog.cableLabel }}</div>
          </div>

          <div v-if="!activeStatusLog.entries.length" class="box-dash p-4 small">
            No status changes recorded yet. Change Test, Label origin, or Label end to start the log.
          </div>

          <div v-else class="col gap-2">
            <div
              v-for="entry in activeStatusLog.entries"
              :key="entry.id || entry.changedAt"
              class="box-soft p-3 col gap-1"
            >
              <div class="row gap-2" style="align-items: center; flex-wrap: wrap">
                <span class="chip chip-neutral">
                  <MaterialIcon name="event" :size="14" />
                  {{ formatStatusLogDate(entry.changedAt) }}
                </span>
                <span class="small" style="color: var(--ink)">{{ getStatusLogLabel(entry) }}</span>
              </div>
            </div>
          </div>

          <div class="row gap-2" style="justify-content: flex-end">
            <button type="button" class="btn btn-primary" @click="closeStatusLogModal">Close</button>
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
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
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

.cable-number-field {
  min-width: 180px;
}

.cable-label-field {
  min-width: 420px;
}

.cable-end-field {
  min-width: 180px;
}

.drag-chip {
  cursor: grab;
  flex-shrink: 0;
  white-space: nowrap;
}

.status-select {
  min-width: 108px;
  font-weight: 700;
  border-width: 2px;
}

.status-no {
  background: color-mix(in srgb, var(--pending) 18%, white);
  border-color: var(--pending);
  color: color-mix(in srgb, var(--pending) 72%, black);
}

.status-ok {
  background: color-mix(in srgb, var(--confirm) 20%, white);
  border-color: var(--confirm);
  color: color-mix(in srgb, var(--confirm) 72%, black);
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
</style>
