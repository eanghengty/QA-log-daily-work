<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import { useDcplChecklist } from '../composables/useDcplChecklist.js'
import { useActivityLog } from '../composables/useActivityLog.js'
import {
  downloadDcplChecklistExport,
  downloadDcplChecklistTemplate,
  parseDcplChecklistSpreadsheet,
} from '../lib/dcplChecklistSpreadsheet.js'
import Topbar from '../components/Topbar.vue'
import StatCard from '../components/StatCard.vue'
import MaterialIcon from '../components/MaterialIcon.vue'

const route = useRoute()
const router = useRouter()
const siteId = route.params.id

const { useSiteById } = useSites()
const { data: site } = useSiteById(siteId)
const { rows, summary, addRow, updateRow, deleteRow, reorderRows, importRows } = useDcplChecklist(siteId)
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

const title = computed(() => (site.value ? `${site.value.name} DCPL checklist` : 'Site DCPL checklist'))
const subtitle = computed(() => {
  const location = site.value?.url || siteId
  return `${location} - ${summary.value.total || 0} DCPL rows tracked`
})

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
    description: '',
    make: '',
    model: '',
    label: '',
    serialNumber: '',
    dbValue: '',
    comment: '',
  }
}

function createRowDraft(row) {
  return {
    level: row?.level || '',
    description: row?.description || '',
    make: row?.make || '',
    model: row?.model || '',
    label: row?.label || '',
    serialNumber: row?.serialNumber || '',
    dbValue: row?.dbValue || '',
    comment: row?.comment || '',
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
  router.push(`/site/${siteId}`)
}

function openImportPicker() {
  importInputRef.value?.click()
}

function handleDownloadTemplate() {
  downloadDcplChecklistTemplate()
  showStatus('DCPL checklist template downloaded.')
}

async function handleExport() {
  if (!rows.value?.length) {
    showStatus('Add a DCPL row before exporting.', 'issue')
    return
  }

  downloadDcplChecklistExport(rows.value, site.value?.name || siteId)
  await logAction('DCPL checklist exported', `${siteId} - ${rows.value.length} rows`)
  showStatus('DCPL checklist export downloaded.')
}

async function createRow() {
  if (!newRow.value.description.trim() && !newRow.value.serialNumber.trim() && !newRow.value.label.trim()) {
    showStatus('Enter at least a description, serial number, or label.', 'issue')
    return
  }

  await addRow(newRow.value)
  await logAction('DCPL checklist row added', `${siteId} - ${newRow.value.description || newRow.value.label || newRow.value.serialNumber}`)
  newRow.value = createEmptyRow()
  showStatus('DCPL row added.')
}

async function handleImportFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  isImporting.value = true
  try {
    const parsedRows = await parseDcplChecklistSpreadsheet(file)
    const result = await importRows(parsedRows)
    await logAction('DCPL checklist imported', `${siteId} - ${result.addedRows} added, ${result.updatedRows} updated`)
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

async function removeRow(row) {
  await deleteRow(row.id)
  const nextDrafts = { ...rowDrafts.value }
  delete nextDrafts[String(row.id)]
  rowDrafts.value = nextDrafts
  await logAction('DCPL checklist row deleted', `${siteId} - ${row.description || row.label || row.serialNumber}`)
  showStatus('DCPL row removed.')
}

function openChangeLogModal(row) {
  activeChangeLog.value = {
    description: row.description || 'No description',
    serialNumber: row.serialNumber || 'No serial number',
    label: row.label || 'No label',
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
  if (field === 'serialNumber') return 'Serial Number'
  if (field === 'dbValue') return 'dB'
  return String(field || '').replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()).trim()
}

function getChangeLogLabel(entry) {
  return `${getFieldLabel(entry?.field)}: ${entry?.fromValue || 'Blank'} -> ${entry?.toValue || 'Blank'}`
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
  await logAction('DCPL checklist reordered', `${siteId} - ${moved.description || moved.label || moved.serialNumber}`)
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
</script>

<template>
  <div class="col grow" style="overflow: auto">
    <input ref="importInputRef" type="file" accept=".xlsx,.xls,.csv" hidden @change="handleImportFile" />

    <Topbar :title="title" :subtitle="subtitle">
      <button type="button" class="btn btn-ghost" @click="handleExport">
        <MaterialIcon name="download_for_offline" />
        Export DCPL checklist
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
          <StatCard label="DCPL rows" :value="summary.total || 0" />
          <StatCard label="Platform level" :value="summary.platformLevel || 0" accent="var(--confirm)" />
          <StatCard label="Ground level" :value="summary.groundLevel || 0" accent="var(--confirm)" />
          <StatCard label="Serial numbers" :value="`${summary.withSerialNumber || 0}/${summary.total || 0}`" :sub="`${summary.withModel || 0} model`" />
          <div class="box p-4 col gap-3 grow" style="min-width: 320px; flex: 1 1 620px">
            <div class="title-md">Add DCPL row</div>
            <div class="row gap-2" style="flex-wrap: wrap">
              <input v-model="newRow.level" class="field" type="text" placeholder="LEVEL" style="flex: 1 1 160px" />
              <input v-model="newRow.description" class="field" type="text" placeholder="Description" style="flex: 2 1 260px" />
              <input v-model="newRow.make" class="field" type="text" placeholder="Make" style="flex: 1 1 150px" />
              <input v-model="newRow.model" class="field" type="text" placeholder="Model" style="flex: 1 1 180px" />
              <input v-model="newRow.label" class="field" type="text" placeholder="Label" style="flex: 1 1 140px" />
              <input v-model="newRow.serialNumber" class="field" type="text" placeholder="Serial Number" style="flex: 1 1 200px" />
              <input v-model="newRow.dbValue" class="field" type="text" placeholder="dB" style="flex: 0 1 100px" />
              <input v-model="newRow.comment" class="field" type="text" placeholder="Comment" style="flex: 2 1 320px" />
            </div>
            <button type="button" class="btn btn-primary" style="align-self: flex-start" @click="createRow">
              <MaterialIcon name="add" />
              Add row
            </button>
          </div>
        </div>
      </div>

      <div v-if="!rows?.length" class="box-dash p-5 col center gap-3" style="min-height: 220px; text-align: center">
        <MaterialIcon name="tune" :size="34" style="color: var(--ink-3)" />
        <div class="title-md">No DCPL checklist rows yet</div>
        <div class="small">Import a DCPL checklist sheet or add DCPL rows here for the field team to track.</div>
      </div>

      <div v-else class="box" style="overflow-x: auto">
        <table style="width: 100%; min-width: 1380px; border-collapse: collapse">
          <thead>
            <tr>
              <th class="table-head">LEVEL</th>
              <th class="table-head">Description</th>
              <th class="table-head">Make</th>
              <th class="table-head">Model</th>
              <th class="table-head">Label</th>
              <th class="table-head">Serial Number</th>
              <th class="table-head">dB</th>
              <th class="table-head">Comment</th>
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
              <td class="table-cell"><input class="field description-field" type="text" v-model="getRowDraft(row).description" @blur="saveDraftField(row, 'description')" /></td>
              <td class="table-cell"><input class="field make-field" type="text" v-model="getRowDraft(row).make" @blur="saveDraftField(row, 'make')" /></td>
              <td class="table-cell"><input class="field model-field" type="text" v-model="getRowDraft(row).model" @blur="saveDraftField(row, 'model')" /></td>
              <td class="table-cell"><input class="field label-field" type="text" v-model="getRowDraft(row).label" @blur="saveDraftField(row, 'label')" /></td>
              <td class="table-cell"><input class="field serial-field" type="text" v-model="getRowDraft(row).serialNumber" @blur="saveDraftField(row, 'serialNumber')" /></td>
              <td class="table-cell"><input class="field db-field" type="text" v-model="getRowDraft(row).dbValue" @blur="saveDraftField(row, 'dbValue')" /></td>
              <td class="table-cell"><textarea class="field comment-field" rows="3" v-model="getRowDraft(row).comment" @blur="saveDraftField(row, 'comment')" /></td>
              <td class="table-cell">
                <div class="row gap-2" style="flex-wrap: wrap">
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
      <div v-if="activeChangeLog" class="add-site-overlay" @click.self="closeChangeLogModal">
        <div class="add-site-modal box col gap-4">
          <div class="between" style="align-items: center">
            <div class="title-md">DCPL checklist log</div>
            <button type="button" class="btn btn-ghost" style="padding: 4px 8px" @click="closeChangeLogModal">
              <MaterialIcon name="close" :size="20" />
            </button>
          </div>

          <div class="col gap-2">
            <div class="label">Description</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">{{ activeChangeLog.description }}</div>
          </div>

          <div class="col gap-2">
            <div class="label">Serial Number</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">{{ activeChangeLog.serialNumber }}</div>
          </div>

          <div class="col gap-2">
            <div class="label">Label</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">{{ activeChangeLog.label }}</div>
          </div>

          <div v-if="!activeChangeLog.entries.length" class="box-dash p-4 small">
            No row changes recorded yet. Edit any DCPL column to start the log.
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
.label-field,
.db-field {
  min-width: 120px;
}

.description-field {
  min-width: 220px;
}

.make-field {
  min-width: 150px;
}

.model-field,
.serial-field {
  min-width: 180px;
}

.comment-field {
  min-width: 360px;
  resize: vertical;
}

.drag-chip {
  cursor: grab;
  flex-shrink: 0;
  white-space: nowrap;
}
</style>
