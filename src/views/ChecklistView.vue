<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  CHECKLIST_STATUS,
  summarizeChecklistItems,
  useChecklists,
} from '../composables/useChecklists.js'
import { useSites } from '../composables/useSites.js'
import { useChecklistLayout } from '../composables/useChecklistLayout.js'
import { useActivityLog } from '../composables/useActivityLog.js'
import {
  downloadChecklistExport,
  downloadChecklistTemplate,
  parseChecklistSpreadsheet,
} from '../lib/checklistSpreadsheet.js'
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
const {
  checklists,
  summary,
  addChecklist,
  updateChecklist,
  deleteChecklist,
  renameChecklist,
  addSubItem,
  renameSubItem,
  setSubItemStatus,
  setSubItemComment,
  setSubItemFieldValue,
  deleteSubItem,
  importChecklistGroups,
  reorderChecklists,
  duplicateChecklist,
  removeCustomColumnValues,
} = useChecklists(siteId)
const {
  customColumns,
  visibleColumns,
  addCustomColumn,
  removeCustomColumn,
  mergeImportedCustomColumns,
} = useChecklistLayout(siteId)
const { logAction } = useActivityLog()

const newChecklistTitle = ref('')
const newChecklistDescription = ref('')
const newSubItemTitles = ref({})
const importInputRef = ref(null)
const statusMessage = ref('')
const statusTone = ref('confirm')
const isImporting = ref(false)
const collapsedChecklistIds = ref(new Set())
const isSummaryCollapsed = ref(false)
const hasInitializedChecklistCollapse = ref(false)
const activeCommentEditor = ref(null)
const commentDraft = ref('')
const draggedChecklistId = ref(null)
const dropChecklistId = ref(null)
const activeDuplicateChecklist = ref(null)
const duplicateChecklistName = ref('')
const activeDeleteChecklist = ref(null)
const activeStatusLog = ref(null)
const scrollContainerRef = ref(null)
const autoScrollFrame = ref(null)
const showAddColumnModal = ref(false)
const newColumnName = ref('')
const newColumnType = ref(CHECKLIST_COLUMN_TYPE.TEXT)
const addColumnError = ref('')

const title = computed(() => (site.value ? `${site.value.name} checklist` : 'Site checklist'))
const subtitle = computed(() => {
  const location = site.value?.url || siteId
  if (!summary.value?.total) return `${location} - no sub checks saved yet`
  return `${location} - ${summary.value.done} done, ${summary.value.todo} not done, ${summary.value.na} N/A`
})
const completionLabel = computed(() =>
  summary.value?.applicable
    ? `${summary.value.completion}% complete`
    : 'No applicable checks yet'
)
const checklistTableStyle = computed(() => ({
  gridTemplateColumns: [
    'minmax(140px, 1fr)',
    'minmax(220px, 1.3fr)',
    'minmax(180px, 1fr)',
    'minmax(160px, 0.9fr)',
    ...customColumns.value.map(() => 'minmax(150px, 0.9fr)'),
    'minmax(140px, 0.8fr)',
  ].join(' '),
}))
const columnTypeOptions = [
  { value: CHECKLIST_COLUMN_TYPE.TEXT, label: 'Text' },
  { value: CHECKLIST_COLUMN_TYPE.NUMBER, label: 'Number' },
  { value: CHECKLIST_COLUMN_TYPE.DATE, label: 'Date' },
]

watch(
  checklists,
  (value) => {
    if (hasInitializedChecklistCollapse.value || !value) return

    collapsedChecklistIds.value = new Set(value.map((checklist) => checklist.id))
    hasInitializedChecklistCollapse.value = true
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  stopAutoScroll()
})

function goBack() {
  router.push(buildSitePath(siteId))
}

function showStatus(message, tone = 'confirm') {
  statusMessage.value = message
  statusTone.value = tone
  window.clearTimeout(showStatus.timeoutId)
  showStatus.timeoutId = window.setTimeout(() => {
    statusMessage.value = ''
  }, 4500)
}

function openImportPicker() {
  importInputRef.value?.click()
}

function handleDownloadTemplate() {
  downloadChecklistTemplate(customColumns.value)
  showStatus('Checklist template downloaded.')
}

async function handleExportChecklist() {
  if (!checklists.value?.length) {
    showStatus('Add a main checklist before exporting.', 'issue')
    return
  }

  downloadChecklistExport(checklists.value, site.value?.name || siteId, customColumns.value)
  await logAction('Checklist exported', `${siteId} - ${checklists.value.length} main tasks`)
  showStatus('Checklist export downloaded.')
}

async function createChecklist() {
  const title = newChecklistTitle.value.trim()
  if (!title) return

  try {
    await addChecklist({
      siteId,
      title,
      description: newChecklistDescription.value.trim(),
    })
    await logAction('Checklist added', `${siteId} - ${title}`)
    newChecklistTitle.value = ''
    newChecklistDescription.value = ''
    showStatus('Main checklist added.')
  } catch (error) {
    showStatus(error.message, 'issue')
  }
}

function openDeleteChecklistModal(checklist) {
  activeDeleteChecklist.value = checklist
}

function closeDeleteChecklistModal() {
  activeDeleteChecklist.value = null
}

function openStatusLogModal(checklist, item) {
  activeStatusLog.value = {
    checklistTitle: checklist.title,
    itemTitle: item.title,
    entries: [...getStatusHistory(item)].reverse(),
  }
}

function closeStatusLogModal() {
  activeStatusLog.value = null
}

async function removeChecklist() {
  if (!activeDeleteChecklist.value) return

  const checklist = activeDeleteChecklist.value
  await deleteChecklist(checklist.id)
  await logAction('Checklist deleted', `${siteId} - ${checklist.title}`)
  showStatus('Main checklist deleted.')
  closeDeleteChecklistModal()
}

async function handleChecklistRename(checklist, event) {
  const nextTitle = event.target.value.trim()
  if (!nextTitle) {
    event.target.value = checklist.title
    return
  }

  if (nextTitle !== checklist.title) {
    try {
      await renameChecklist(checklist.id, nextTitle)
      showStatus('Main checklist name updated.')
    } catch (error) {
      event.target.value = checklist.title
      showStatus(error.message, 'issue')
    }
  }
}

async function handleChecklistDescriptionChange(checklist, event) {
  const nextDescription = event.target.value.trim()
  if (nextDescription === (checklist.description || '')) return

  await updateChecklist(checklist.id, {
    description: nextDescription,
  })
}

async function createSubItem(checklistId) {
  const nextTitle = (newSubItemTitles.value[checklistId] || '').trim()
  if (!nextTitle) return

  await addSubItem(checklistId, nextTitle, customColumns.value)
  newSubItemTitles.value = {
    ...newSubItemTitles.value,
    [checklistId]: '',
  }
}

async function handleSubItemRename(checklistId, item, event) {
  const nextTitle = event.target.value.trim()
  if (!nextTitle) {
    event.target.value = item.title
    return
  }

  if (nextTitle !== item.title) {
    await renameSubItem(checklistId, item.id, nextTitle)
  }
}

async function toggleDone(checklistId, item) {
  const nextStatus =
    item.status === CHECKLIST_STATUS.DONE ? CHECKLIST_STATUS.TODO : CHECKLIST_STATUS.DONE
  await setSubItemStatus(checklistId, item.id, nextStatus)
}

async function toggleNotApplicable(checklistId, item) {
  const nextStatus =
    item.status === CHECKLIST_STATUS.NA ? CHECKLIST_STATUS.TODO : CHECKLIST_STATUS.NA
  await setSubItemStatus(checklistId, item.id, nextStatus)
}

async function removeSubItem(checklistId, item) {
  await deleteSubItem(checklistId, item.id)
}

function openCommentModal(checklistId, item) {
  activeCommentEditor.value = {
    checklistId,
    itemId: item.id,
    itemTitle: item.title,
    comment: item.comment || '',
  }
  commentDraft.value = item.comment || ''
}

function closeCommentModal() {
  activeCommentEditor.value = null
  commentDraft.value = ''
}

async function saveComment() {
  if (!activeCommentEditor.value) return

  await updateChecklistItemComment(
    activeCommentEditor.value.checklistId,
    activeCommentEditor.value.itemId,
    commentDraft.value.trim()
  )

  showStatus('Comment saved.')
  closeCommentModal()
}

async function handleImportFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''

  if (!file) return

  isImporting.value = true

  try {
    const parsed = await parseChecklistSpreadsheet(file)
    const mergedColumns = await mergeImportedCustomColumns(parsed.customColumns || [])
    const importedColumns = mergeImportedColumns(parsed.customColumns || [], mergedColumns)
    const groups = remapImportedGroupFieldValues(parsed.groups, parsed.customColumns || [], importedColumns)
    const result = await importChecklistGroups(groups, importedColumns)
    const mainTaskCount = result.processedChecklists

    await logAction(
      'Checklist imported',
      `${siteId} - ${mainTaskCount} main tasks, ${result.addedSubItems} sub tasks added`
    )

    const skippedText = result.skippedSubItems
      ? ` ${result.skippedSubItems} duplicate sub tasks skipped.`
      : ''
    showStatus(
      `Imported ${mainTaskCount} main tasks and ${result.addedSubItems} sub tasks.${skippedText}`
    )
  } catch (error) {
    showStatus(`Import failed: ${error.message}`, 'issue')
  } finally {
    isImporting.value = false
  }
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
    await logAction('Checklist column added', `${siteId} - ${label}`)
    showStatus('Checklist column added.')
    closeAddColumnModal()
  } catch (error) {
    addColumnError.value = error.message
  }
}

async function handleRemoveColumn(column) {
  await removeCustomColumnValues(column.id)
  await removeCustomColumn(column.id)
  await logAction('Checklist column removed', `${siteId} - ${column.label}`)
  showStatus('Checklist column removed.')
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

async function handleCustomFieldChange(checklistId, item, column, event) {
  await setSubItemFieldValue(checklistId, item.id, column, event.target.value)
}

function getChecklistSummary(checklist) {
  return summarizeChecklistItems(checklist.items || [])
}

function isCollapsed(checklistId) {
  return collapsedChecklistIds.value.has(checklistId)
}

function toggleChecklist(checklistId) {
  const next = new Set(collapsedChecklistIds.value)
  if (next.has(checklistId)) next.delete(checklistId)
  else next.add(checklistId)
  collapsedChecklistIds.value = next
}

function toggleSummarySection() {
  isSummaryCollapsed.value = !isSummaryCollapsed.value
}

function startChecklistDrag(checklistId, event) {
  draggedChecklistId.value = checklistId
  dropChecklistId.value = checklistId

  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(checklistId))
  }
}

function onChecklistDragOver(checklistId, event) {
  event.preventDefault()
  if (draggedChecklistId.value === null) return
  dropChecklistId.value = checklistId
  updateAutoScroll(event)
}

async function onChecklistDrop(checklistId, event) {
  event.preventDefault()
  if (draggedChecklistId.value === null || draggedChecklistId.value === checklistId) {
    clearChecklistDragState()
    return
  }

  const current = [...(checklists.value || [])]
  const fromIndex = current.findIndex((item) => item.id === draggedChecklistId.value)
  const toIndex = current.findIndex((item) => item.id === checklistId)

  if (fromIndex === -1 || toIndex === -1) {
    clearChecklistDragState()
    return
  }

  const [moved] = current.splice(fromIndex, 1)
  current.splice(toIndex, 0, moved)

  await reorderChecklists(current.map((item) => item.id))
  await logAction('Checklist reordered', `${siteId} - ${moved.title}`)
  clearChecklistDragState()
}

function clearChecklistDragState() {
  draggedChecklistId.value = null
  dropChecklistId.value = null
  stopAutoScroll()
}

function openDuplicateChecklistModal(checklist) {
  activeDuplicateChecklist.value = checklist
  duplicateChecklistName.value = `${checklist.title} copy`
}

function closeDuplicateChecklistModal() {
  activeDuplicateChecklist.value = null
  duplicateChecklistName.value = ''
}

async function handleDuplicateChecklist() {
  if (!activeDuplicateChecklist.value) return

  const trimmedTitle = duplicateChecklistName.value.trim()
  if (!trimmedTitle) {
    showStatus('Main checklist name is required.', 'issue')
    return
  }

  try {
    await duplicateChecklist(activeDuplicateChecklist.value.id, trimmedTitle)
    await logAction('Checklist duplicated', `${siteId} - ${trimmedTitle}`)
    showStatus('Main checklist duplicated.')
    closeDuplicateChecklistModal()
  } catch (error) {
    showStatus(error.message, 'issue')
  }
}

async function updateChecklistItemComment(checklistId, itemId, comment) {
  await setSubItemComment(checklistId, itemId, comment)
}

function updateAutoScroll(event) {
  const container = scrollContainerRef.value
  if (!container || draggedChecklistId.value === null) return

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

function getStatusClass(status) {
  if (status === CHECKLIST_STATUS.DONE) return 'chip-confirm'
  if (status === CHECKLIST_STATUS.NA) return 'chip-neutral'
  return 'chip-pending'
}

function getStatusLabel(status) {
  if (status === CHECKLIST_STATUS.DONE) return 'Done'
  if (status === CHECKLIST_STATUS.NA) return 'N/A'
  return 'Not done'
}

function getStatusHistory(item) {
  return Array.isArray(item?.statusHistory) ? item.statusHistory : []
}

function getStatusLogLabel(entry) {
  const fromLabel = getStatusLabel(entry?.fromStatus)
  const toLabel = getStatusLabel(entry?.toStatus)

  if (entry?.toStatus === CHECKLIST_STATUS.DONE && entry?.fromStatus !== CHECKLIST_STATUS.DONE) {
    return 'Ticked as done'
  }

  if (entry?.toStatus === CHECKLIST_STATUS.NA && entry?.fromStatus !== CHECKLIST_STATUS.NA) {
    return 'Marked as N/A'
  }

  if (entry?.toStatus === CHECKLIST_STATUS.TODO) {
    if (entry?.fromStatus === CHECKLIST_STATUS.DONE) return 'Unticked from done'
    if (entry?.fromStatus === CHECKLIST_STATUS.NA) return 'Cleared N/A'
  }

  return `${fromLabel} to ${toLabel}`
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

function getProgressWidth(value) {
  return `${Math.min(Math.max(value || 0, 0), 100)}%`
}

function mergeImportedColumns(importedColumns, storedColumns) {
  return (importedColumns || []).map((column) => {
    const match = (storedColumns || []).find(
      (item) => item.label.toLowerCase() === column.label.toLowerCase()
    )
    return match || column
  })
}

function getCustomFieldValue(item, column) {
  return item.fieldValues?.[column.id] || ''
}

function remapImportedGroupFieldValues(groups, sourceColumns, targetColumns) {
  const columnIdMap = Object.fromEntries(
    (sourceColumns || []).map((column, index) => [column.id, targetColumns[index]?.id || column.id])
  )

  return (groups || []).map((group) => ({
    ...group,
    items: (group.items || []).map((item) => ({
      ...item,
      fieldValues: Object.fromEntries(
        Object.entries(item.fieldValues || {}).map(([key, value]) => [columnIdMap[key] || key, value])
      ),
    })),
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
      <button type="button" class="btn btn-ghost" @click="handleExportChecklist">
        <MaterialIcon name="download_for_offline" />
        Export checklist
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
      @dragover="draggedChecklistId !== null ? updateAutoScroll($event) : null"
      @dragleave="stopAutoScroll"
      @drop="stopAutoScroll"
    >
      <div
        class="col checklist-summary-shell"
        style="position: sticky; top: 0; z-index: 10; padding: 20px 12px 12px; margin: 0 -12px 20px; background: var(--paper); border-bottom: 1px solid var(--line); box-shadow: 0 6px 0 var(--paper), 0 10px 18px rgba(26, 26, 26, 0.04)"
      >
        <div class="between gap-3" style="margin-bottom: 12px; flex-wrap: wrap">
          <div class="col gap-1">
            <div class="title-md">Checklist summary</div>
            <div class="small">
              {{ summary?.checklistCount || 0 }} main checklists, {{ summary?.total || 0 }} sub checks
            </div>
          </div>
          <div class="row gap-2" style="flex-wrap: wrap">
            <span v-if="isSummaryCollapsed" class="chip chip-neutral">
              <MaterialIcon name="check_circle" :size="14" />
              {{ summary?.done || 0 }} done
            </span>
            <span v-if="isSummaryCollapsed" class="chip chip-neutral">
              <MaterialIcon name="radio_button_unchecked" :size="14" />
              {{ summary?.todo || 0 }} not done
            </span>
            <button type="button" class="chip" @click="toggleSummarySection">
              <MaterialIcon :name="isSummaryCollapsed ? 'expand_more' : 'expand_less'" :size="14" />
              {{ isSummaryCollapsed ? 'Expand top cards' : 'Collapse top cards' }}
            </button>
          </div>
        </div>

        <div v-if="!isSummaryCollapsed" class="row gap-3 checklist-summary" style="flex-wrap: wrap">
          <StatCard label="Main checklists" :value="summary?.checklistCount || 0" />
          <StatCard label="Sub checks" :value="summary?.total || 0" />
          <StatCard label="Done" :value="summary?.done || 0" accent="var(--confirm)" :sub="completionLabel" />
          <StatCard label="Not done" :value="summary?.todo || 0" accent="var(--pending)" :sub="`${summary?.na || 0} N/A`" />
          <div class="box p-4 col gap-3 grow" style="min-width: 280px; flex: 1 1 320px">
            <div class="title-md">Add main checklist</div>
            <input
              v-model="newChecklistTitle"
              class="field"
              type="text"
              placeholder="Example: Civil works"
              @keydown.enter.prevent="createChecklist"
            />
            <textarea
              v-model="newChecklistDescription"
              class="field"
              rows="2"
              placeholder="Short description for this main checklist"
              style="resize: vertical"
            />
            <button type="button" class="btn btn-primary" style="align-self: flex-start" @click="createChecklist">
              <MaterialIcon name="add" />
              Add checklist
            </button>
          </div>
        </div>
      </div>

      <div class="col gap-5">
        <div
          v-if="!checklists?.length"
          class="box-dash p-5 col center gap-3"
          style="min-height: 220px; text-align: center"
        >
          <MaterialIcon name="checklist" :size="34" style="color: var(--ink-3)" />
          <div class="title-md">No checklist saved yet</div>
          <div class="checklist-grid checklist-header" :style="checklistTableStyle">
            <div v-for="column in visibleColumns" :key="column.id">{{ column.label }}</div>
            <div>Actions</div>
          </div>
          <div class="small">Start with one main checklist, then add sub checks for the field team to track.</div>
        </div>

        <div v-else class="col gap-4">
          <div
            v-for="checklist in checklists"
            :key="checklist.id"
            class="box p-4 col gap-4"
            :style="{
              opacity: draggedChecklistId === checklist.id ? 0.6 : 1,
              borderColor: dropChecklistId === checklist.id && draggedChecklistId !== checklist.id ? 'var(--ink)' : '',
              borderStyle: dropChecklistId === checklist.id && draggedChecklistId !== checklist.id ? 'dashed' : 'solid',
            }"
            @dragover="onChecklistDragOver(checklist.id, $event)"
            @drop="onChecklistDrop(checklist.id, $event)"
            @dragend="clearChecklistDragState"
          >
            <div class="between gap-3" style="align-items: flex-start; flex-wrap: wrap">
              <div class="col grow gap-3">
                <div class="col gap-1">
                  <div class="row items-center gap-2" style="flex-wrap: wrap">
                    <button
                      type="button"
                      class="chip"
                      draggable="true"
                      title="Drag to reorder"
                      style="cursor: grab"
                      @dragstart="startChecklistDrag(checklist.id, $event)"
                    >
                      <MaterialIcon name="drag_indicator" :size="14" />
                      Move
                    </button>
                    <div class="title-md">{{ checklist.title }}</div>
                    <span class="chip chip-neutral">{{ checklist.items?.length || 0 }} sub checks</span>
                  </div>
                  <div class="small">{{ checklist.description || 'No description added yet.' }}</div>
                </div>

                <div class="col gap-2">
                  <div class="between">
                    <div class="small">Progress</div>
                    <div class="tiny">{{ getChecklistSummary(checklist).done }}/{{ getChecklistSummary(checklist).applicable }}</div>
                  </div>
                  <div
                    class="box-soft"
                    style="height: 12px; overflow: hidden; background: var(--paper-2); border-color: var(--line)"
                  >
                    <div
                      style="height: 100%; background: var(--confirm); transition: width 0.2s ease"
                      :style="{ width: getProgressWidth(getChecklistSummary(checklist).completion) }"
                    />
                  </div>
                  <div class="row gap-2" style="flex-wrap: wrap">
                    <span class="chip chip-confirm">
                      <MaterialIcon name="check_circle" :size="14" />
                      {{ getChecklistSummary(checklist).done }} done
                    </span>
                    <span class="chip chip-pending">
                      <MaterialIcon name="pending_actions" :size="14" />
                      {{ getChecklistSummary(checklist).todo }} not done
                    </span>
                    <span class="chip chip-neutral">
                      <MaterialIcon name="do_not_disturb_on" :size="14" />
                      {{ getChecklistSummary(checklist).na }} N/A
                    </span>
                  </div>
                </div>
              </div>

              <div class="row gap-2" style="flex-wrap: wrap">
                <button type="button" class="chip" @click="toggleChecklist(checklist.id)">
                  <MaterialIcon :name="isCollapsed(checklist.id) ? 'expand_more' : 'expand_less'" :size="14" />
                  {{ isCollapsed(checklist.id) ? 'Expand' : 'Collapse' }}
                </button>
                <button type="button" class="chip" @click="openDuplicateChecklistModal(checklist)">
                  <MaterialIcon name="content_copy" :size="14" />
                  Duplicate
                </button>
                <button type="button" class="chip chip-pending" @click="openDeleteChecklistModal(checklist)">
                  <MaterialIcon name="delete" :size="14" />
                  Delete
                </button>
              </div>
            </div>

            <div v-if="!isCollapsed(checklist.id)" class="col gap-3">
              <div class="col gap-2">
                <div class="label">Main checklist</div>
                <input
                  class="field"
                  type="text"
                  :value="checklist.title"
                  @change="handleChecklistRename(checklist, $event)"
                />
              </div>

              <div class="col gap-2">
                <div class="label">Description</div>
                <textarea
                  class="field"
                  rows="2"
                  :value="checklist.description || ''"
                  placeholder="Short description for this main checklist"
                  style="resize: vertical"
                  @change="handleChecklistDescriptionChange(checklist, $event)"
                />
              </div>

              <div class="between">
                <div class="label">Sub checklist items</div>
                <span class="tiny">{{ checklist.items?.length || 0 }} items</span>
              </div>

              <div class="checklist-grid checklist-header" :style="checklistTableStyle">
                <div v-for="column in visibleColumns" :key="column.id" class="header-cell">
                  <span>{{ column.label }}</span>
                  <button
                    v-if="column.kind !== 'base'"
                    type="button"
                    class="chip chip-pending header-remove"
                    @click="handleRemoveColumn(column)"
                  >
                    <MaterialIcon name="delete" :size="12" />
                    Remove
                  </button>
                </div>
                <div>Actions</div>
              </div>

              <div v-if="!checklist.items?.length" class="box-dash p-4 small">
                No sub checklist items yet. Add one below to start tracking this work area.
              </div>

              <div v-else class="col gap-2">
                <div
                  v-for="item in checklist.items"
                  :key="item.id"
                  class="box-soft p-3 checklist-grid checklist-row"
                  :style="checklistTableStyle"
                >
                  <div class="small" style="color: var(--ink)">{{ checklist.title }}</div>

                  <input
                    class="field grow"
                    type="text"
                    :value="item.title"
                    @change="handleSubItemRename(checklist.id, item, $event)"
                  />

                  <div class="row gap-2" style="flex-wrap: wrap">
                    <label class="row items-center gap-2">
                      <input
                        type="checkbox"
                        :checked="item.status === CHECKLIST_STATUS.DONE"
                        @change="toggleDone(checklist.id, item)"
                      />
                      <span class="small" style="color: var(--ink)">Done</span>
                    </label>
                    <span class="chip" :class="getStatusClass(item.status)">
                      <MaterialIcon
                        :name="item.status === CHECKLIST_STATUS.DONE ? 'check_circle' : item.status === CHECKLIST_STATUS.NA ? 'do_not_disturb_on' : 'radio_button_unchecked'"
                        :size="14"
                      />
                      {{ getStatusLabel(item.status) }}
                    </span>
                    <button
                      type="button"
                      class="chip"
                      :class="item.status === CHECKLIST_STATUS.NA ? 'chip-neutral' : ''"
                      @click="toggleNotApplicable(checklist.id, item)"
                    >
                      <MaterialIcon name="do_not_disturb_on" :size="14" />
                      {{ item.status === CHECKLIST_STATUS.NA ? 'Clear N/A' : 'Mark N/A' }}
                    </button>
                  </div>

                  <button type="button" class="chip" @click="openCommentModal(checklist.id, item)">
                    <MaterialIcon name="comment" :size="14" />
                    {{ item.comment ? 'Comment' : 'Add comment' }}
                  </button>

                  <template v-for="column in customColumns" :key="column.id">
                    <input
                      v-if="column.type === CHECKLIST_COLUMN_TYPE.TEXT"
                      class="field"
                      type="text"
                      :value="getCustomFieldValue(item, column)"
                      :placeholder="column.label"
                      @change="handleCustomFieldChange(checklist.id, item, column, $event)"
                    />
                    <input
                      v-else-if="column.type === CHECKLIST_COLUMN_TYPE.NUMBER"
                      class="field"
                      type="number"
                      :value="getCustomFieldValue(item, column)"
                      :placeholder="column.label"
                      @change="handleCustomFieldChange(checklist.id, item, column, $event)"
                    />
                    <input
                      v-else
                      class="field"
                      type="date"
                      :value="getCustomFieldValue(item, column)"
                      @change="handleCustomFieldChange(checklist.id, item, column, $event)"
                    />
                  </template>

                  <div class="row gap-2" style="flex-wrap: wrap">
                    <button type="button" class="chip" @click="openStatusLogModal(checklist, item)">
                      <MaterialIcon name="history" :size="14" />
                      Log
                    </button>
                    <button type="button" class="chip" @click="removeSubItem(checklist.id, item)">
                      <MaterialIcon name="delete" :size="14" />
                      Remove
                    </button>
                  </div>
                </div>
              </div>

              <div class="row gap-2" style="flex-wrap: wrap">
                <input
                  v-model="newSubItemTitles[checklist.id]"
                  class="field grow"
                  type="text"
                  placeholder="Example: Fence installed"
                  @keydown.enter.prevent="createSubItem(checklist.id)"
                />
                <button type="button" class="btn" @click="createSubItem(checklist.id)">
                  <MaterialIcon name="playlist_add" />
                  Add sub check
                </button>
              </div>
            </div>
          </div>
        </div>
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
            <div class="title-md">Add checklist column</div>
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
              placeholder="Example: Baseline"
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
              No added columns yet. Baseline checklist columns stay in place and cannot be removed here.
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
        v-if="activeCommentEditor"
        class="add-site-overlay"
        @click.self="closeCommentModal"
      >
        <div class="add-site-modal box col gap-4">
          <div class="between" style="align-items: center">
            <div class="title-md">Sub checklist comment</div>
            <button type="button" class="btn btn-ghost" style="padding: 4px 8px" @click="closeCommentModal">
              <MaterialIcon name="close" :size="20" />
            </button>
          </div>

          <div class="col gap-2">
            <div class="label">Sub checklist item</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">{{ activeCommentEditor.itemTitle }}</div>
          </div>

          <div class="col gap-2">
            <div class="label">Comment</div>
            <textarea
              v-model="commentDraft"
              class="field"
              rows="6"
              placeholder="Write a note, finding, or field comment for this sub checklist item"
              style="resize: vertical"
            />
          </div>

          <div class="row gap-2" style="justify-content: flex-end">
            <button type="button" class="btn btn-ghost" @click="closeCommentModal">Cancel</button>
            <button type="button" class="btn btn-primary" @click="saveComment">
              <MaterialIcon name="save" />
              Save comment
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
            <div class="title-md">Sub checklist log</div>
            <button type="button" class="btn btn-ghost" style="padding: 4px 8px" @click="closeStatusLogModal">
              <MaterialIcon name="close" :size="20" />
            </button>
          </div>

          <div class="col gap-2">
            <div class="label">Main checklist</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">{{ activeStatusLog.checklistTitle }}</div>
          </div>

          <div class="col gap-2">
            <div class="label">Sub checklist item</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">{{ activeStatusLog.itemTitle }}</div>
          </div>

          <div v-if="!activeStatusLog.entries.length" class="box-dash p-4 small">
            No status changes recorded yet. Tick, untick, or mark this sub checklist item as N/A to start the log.
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
              <div class="tiny">
                {{ getStatusLabel(entry.fromStatus) }} -> {{ getStatusLabel(entry.toStatus) }}
              </div>
            </div>
          </div>

          <div class="row gap-2" style="justify-content: flex-end">
            <button type="button" class="btn btn-primary" @click="closeStatusLogModal">Close</button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="activeDuplicateChecklist"
        class="add-site-overlay"
        @click.self="closeDuplicateChecklistModal"
      >
        <div class="add-site-modal box col gap-4">
          <div class="between" style="align-items: center">
            <div class="title-md">Duplicate main checklist</div>
            <button type="button" class="btn btn-ghost" style="padding: 4px 8px" @click="closeDuplicateChecklistModal">
              <MaterialIcon name="close" :size="20" />
            </button>
          </div>

          <div class="col gap-2">
            <div class="label">Source checklist</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">
              {{ activeDuplicateChecklist.title }}
            </div>
          </div>

          <div class="col gap-2">
            <div class="label">New main checklist name</div>
            <input
              v-model="duplicateChecklistName"
              class="field"
              type="text"
              placeholder="Enter a unique main checklist name"
              @keydown.enter.prevent="handleDuplicateChecklist"
            />
            <div class="tiny">
              The new name must be different from existing main checklist names.
            </div>
          </div>

          <div class="row gap-2" style="justify-content: flex-end">
            <button type="button" class="btn btn-ghost" @click="closeDuplicateChecklistModal">Cancel</button>
            <button type="button" class="btn btn-primary" @click="handleDuplicateChecklist">
              <MaterialIcon name="content_copy" />
              Duplicate checklist
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="activeDeleteChecklist"
        class="add-site-overlay"
        @click.self="closeDeleteChecklistModal"
      >
        <div class="add-site-modal box col gap-4">
          <div class="between" style="align-items: center">
            <div class="title-md">Delete main checklist</div>
            <button type="button" class="btn btn-ghost" style="padding: 4px 8px" @click="closeDeleteChecklistModal">
              <MaterialIcon name="close" :size="20" />
            </button>
          </div>

          <div class="col gap-2">
            <div class="label">Checklist to delete</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">
              {{ activeDeleteChecklist.title }}
            </div>
          </div>

          <div class="small">
            This will delete the main checklist and all of its sub checklist items.
          </div>

          <div class="row gap-2" style="justify-content: flex-end">
            <button type="button" class="btn btn-ghost" @click="closeDeleteChecklistModal">Cancel</button>
            <button type="button" class="btn chip-pending" @click="removeChecklist">
              <MaterialIcon name="delete" />
              Delete checklist
            </button>
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

.checklist-grid {
  display: grid;
  gap: 12px;
  align-items: center;
}

.checklist-header {
  padding: 10px 12px;
  border: 1px dashed var(--line);
  background: var(--paper-2);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.checklist-row {
  align-items: center;
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
