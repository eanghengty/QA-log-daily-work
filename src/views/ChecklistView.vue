<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  CHECKLIST_STATUS,
  summarizeChecklistItems,
  useChecklists,
} from '../composables/useChecklists.js'
import { useSites } from '../composables/useSites.js'
import { useActivityLog } from '../composables/useActivityLog.js'
import {
  downloadChecklistTemplate,
  parseChecklistSpreadsheet,
} from '../lib/checklistSpreadsheet.js'
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
  deleteChecklist,
  renameChecklist,
  addSubItem,
  renameSubItem,
  setSubItemStatus,
  deleteSubItem,
  importChecklistGroups,
} = useChecklists(siteId)
const { logAction } = useActivityLog()

const newChecklistTitle = ref('')
const newSubItemTitles = ref({})
const importInputRef = ref(null)
const statusMessage = ref('')
const statusTone = ref('confirm')
const isImporting = ref(false)

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

function goBack() {
  router.push(`/site/${siteId}`)
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
  downloadChecklistTemplate()
  showStatus('Checklist template downloaded.')
}

async function createChecklist() {
  const title = newChecklistTitle.value.trim()
  if (!title) return

  await addChecklist({ siteId, title })
  await logAction('Checklist added', `${siteId} - ${title}`)
  newChecklistTitle.value = ''
}

async function removeChecklist(checklist) {
  const confirmed = window.confirm(`Delete checklist "${checklist.title}" and all of its sub checks?`)
  if (!confirmed) return

  await deleteChecklist(checklist.id)
  await logAction('Checklist deleted', `${siteId} - ${checklist.title}`)
}

async function handleChecklistRename(checklist, event) {
  const nextTitle = event.target.value.trim()
  if (!nextTitle) {
    event.target.value = checklist.title
    return
  }

  if (nextTitle !== checklist.title) {
    await renameChecklist(checklist.id, nextTitle)
  }
}

async function createSubItem(checklistId) {
  const nextTitle = (newSubItemTitles.value[checklistId] || '').trim()
  if (!nextTitle) return

  await addSubItem(checklistId, nextTitle)
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

async function handleImportFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''

  if (!file) return

  isImporting.value = true

  try {
    const groups = await parseChecklistSpreadsheet(file)
    const result = await importChecklistGroups(groups)
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

function getChecklistSummary(checklist) {
  return summarizeChecklistItems(checklist.items || [])
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

function getProgressWidth(value) {
  return `${Math.min(Math.max(value || 0, 0), 100)}%`
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

    <div class="col gap-5 p-5 grow" style="overflow-y: auto">
      <div class="row gap-3">
        <StatCard label="Main checklists" :value="summary?.checklistCount || 0" />
        <StatCard label="Sub checks" :value="summary?.total || 0" />
        <StatCard label="Done" :value="summary?.done || 0" accent="var(--confirm)" :sub="completionLabel" />
        <StatCard label="Not done" :value="summary?.todo || 0" accent="var(--pending)" :sub="`${summary?.na || 0} N/A`" />
      </div>

      <div class="box p-4 col gap-3">
        <div class="title-md">Add main checklist</div>
        <div class="small">Create a main checklist, then add the sub checklist items underneath it.</div>
        <div class="row gap-2" style="flex-wrap: wrap">
          <input
            v-model="newChecklistTitle"
            class="field grow"
            type="text"
            placeholder="Example: Civil works"
            @keydown.enter.prevent="createChecklist"
          />
          <button type="button" class="btn btn-primary" @click="createChecklist">
            <MaterialIcon name="add" />
            Add checklist
          </button>
        </div>
      </div>

      <div class="box p-4 col gap-3">
        <div class="title-md">Import from Excel</div>
        <div class="small">Use the template columns `Main task` and `Sub task`. Repeated rows with the same main task will be grouped into one checklist, and matching existing main task names will merge into the same checklist.</div>
        <div class="row gap-2" style="flex-wrap: wrap">
          <button type="button" class="btn" @click="handleDownloadTemplate">
            <MaterialIcon name="file_download" />
            Download Excel template
          </button>
          <button type="button" class="btn btn-primary" :disabled="isImporting" @click="openImportPicker">
            <MaterialIcon name="upload_file" />
            {{ isImporting ? 'Importing...' : 'Choose Excel file' }}
          </button>
        </div>
      </div>

      <div
        v-if="!checklists?.length"
        class="box-dash p-5 col center gap-3"
        style="min-height: 220px; text-align: center"
      >
        <MaterialIcon name="checklist" :size="34" style="color: var(--ink-3)" />
        <div class="title-md">No checklist saved yet</div>
        <div class="small">Start with one main checklist, then add sub checks for the field team to track.</div>
      </div>

      <div v-else class="col gap-4">
        <div v-for="checklist in checklists" :key="checklist.id" class="box p-4 col gap-4">
          <div class="between gap-3" style="align-items: flex-start; flex-wrap: wrap">
            <div class="col grow gap-3">
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

            <button type="button" class="chip chip-pending" @click="removeChecklist(checklist)">
              <MaterialIcon name="delete" :size="14" />
              Delete
            </button>
          </div>

          <div class="col gap-3">
            <div class="between">
              <div class="label">Sub checklist items</div>
              <span class="tiny">{{ checklist.items?.length || 0 }} items</span>
            </div>

            <div v-if="!checklist.items?.length" class="box-dash p-4 small">
              No sub checklist items yet. Add one below to start tracking this work area.
            </div>

            <div v-else class="col gap-2">
              <div
                v-for="item in checklist.items"
                :key="item.id"
                class="box-soft p-3 row gap-3"
                style="align-items: center; flex-wrap: wrap"
              >
                <label class="row items-center gap-2" style="min-width: 120px">
                  <input
                    type="checkbox"
                    :checked="item.status === CHECKLIST_STATUS.DONE"
                    @change="toggleDone(checklist.id, item)"
                  />
                  <span class="small" style="color: var(--ink)">Tick</span>
                </label>

                <input
                  class="field grow"
                  type="text"
                  :value="item.title"
                  @change="handleSubItemRename(checklist.id, item, $event)"
                />

                <div class="row gap-2" style="flex-wrap: wrap">
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

    <div
      v-if="statusMessage"
      class="chip"
      :class="statusTone === 'issue' ? 'chip-issue' : 'chip-confirm'"
      style="position: fixed; bottom: 20px; right: 20px; z-index: 100; padding: 8px 14px"
    >
      <MaterialIcon :name="statusTone === 'issue' ? 'error' : 'check_circle'" :size="14" />
      {{ statusMessage }}
    </div>
  </div>
</template>
