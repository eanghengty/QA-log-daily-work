<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  SNAG_SUMMARY_CATEGORIES,
  SNAG_SUMMARY_STATUS,
  summarizeSnagSummary,
  useSnagSummary,
} from '../composables/useSnagSummary.js'
import { useSites } from '../composables/useSites.js'
import { useSnagReports } from '../composables/useSnagReports.js'
import { useActivityLog } from '../composables/useActivityLog.js'
import { getActivityActorLabel } from '../composables/useActivityActor.js'
import { buildSnagSummaryProgressText } from '../lib/snagSummaryExport.js'
import { reportNotesHtmlFromText } from '../lib/reportNotes.js'
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
  board,
  sections,
  summary,
  generateFromText,
  addSection,
  addGroup,
  addItem,
  deleteSection,
  deleteGroup,
  deleteItem,
  renameSection,
  renameGroup,
  setItemStatus,
  setItemChecking,
  setItemCategory,
} = useSnagSummary(siteId)
const { addSnagReport } = useSnagReports(siteId)
const { logAction } = useActivityLog()

const sourceText = ref('')
const statusMessage = ref('')
const statusTone = ref('confirm')
const isGenerating = ref(false)
const isSummaryHidden = ref(false)
const isGenerateCardCollapsed = ref(false)
const collapsedSectionIds = ref(new Set())
const activeHistoryItem = ref(null)
const activePartialItem = ref(null)
const isGenerateCategoryModalOpen = ref(false)
const partialCommentDraft = ref('')
const partialCommentError = ref('')
const newSectionCode = ref('')
const newSectionTitle = ref('')
const newGroupDrafts = ref({})
const newItemDrafts = ref({})
const exportCategory = ref(SNAG_SUMMARY_CATEGORIES[0])

watch(
  () => board.value?.sourceText,
  (value) => {
    if (sourceText.value.trim()) return
    sourceText.value = String(value || '')
  },
  { immediate: true }
)

const title = computed(() => (site.value ? `${site.value.name} snag summary` : 'Snag summary'))
const hasGeneratedSnag = computed(() => sections.value.length > 0)
const subtitle = computed(() => {
  const location = site.value?.url || siteId
  if (!summary.value.total) return `${location} - no snag items generated yet`
  return `${location} - ${summary.value.done} done, ${summary.value.todo} not done`
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

async function handleGenerate() {
  isGenerateCategoryModalOpen.value = true
}

async function generateWithCategory(category) {
  const nextCategory = SNAG_SUMMARY_CATEGORIES.includes(category) ? category : SNAG_SUMMARY_CATEGORIES[0]
  exportCategory.value = nextCategory
  isGenerateCategoryModalOpen.value = false
  isGenerating.value = true

  try {
    const nextSummary = await generateFromText(sourceText.value, { category: nextCategory })

    if (!nextSummary.total) {
      await logAction('snag summary cleared', `${siteId} - generated list cleared`)
      showStatus('snag summary cleared.')
      return
    }

    await logAction(
      'snag summary generated',
      `${siteId} - ${nextCategory} - ${nextSummary.sectionCount} main lists, ${nextSummary.groupCount} sub lists, ${nextSummary.total} snag items`
    )
    const duplicateMessage = nextSummary.skippedDuplicates
      ? ` ${nextSummary.skippedDuplicates} duplicate item${nextSummary.skippedDuplicates === 1 ? '' : 's'} skipped.`
      : ''
    if (nextSummary.skippedDuplicates) {
      window.alert(`${nextSummary.skippedDuplicates} duplicate snag item${nextSummary.skippedDuplicates === 1 ? '' : 's'} already existed and were skipped.`)
    }
    showStatus(
      `Generated ${nextCategory} snag summary: ${nextSummary.sectionCount} main lists, ${nextSummary.groupCount} sub lists, and ${nextSummary.total} snag items.${duplicateMessage}`
    )
  } catch (error) {
    showStatus(`Generate failed: ${error.message}`, 'issue')
  } finally {
    isGenerating.value = false
  }
}

function closeGenerateCategoryModal() {
  isGenerateCategoryModalOpen.value = false
}

async function handleExportToNewUpdate() {
  if (!summary.value.total) {
    showStatus('No snag summary items to export yet.', 'issue')
    return
  }

  try {
    const exportText = buildSnagSummaryProgressText(sections.value, exportCategory.value)
    if (exportText === 'No pending items.' || exportText === 'No snag items.' || exportText === 'No Snag items.') {
      showStatus(`No ${exportCategory.value} snag items to export yet.`, 'issue')
      return
    }

    const now = new Date()
    await addSnagReport({
      siteId,
      category: exportCategory.value,
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      notes: exportText,
      notesRich: reportNotesHtmlFromText(exportText),
    })
    logAction(
      'Snag summary exported to snag history',
      `${siteId} - ${exportCategory.value} - ${summary.value.done}/${summary.value.total} done items included`
    ).catch(() => {})
    showStatus(`${exportCategory.value} snag history saved.`)
    goBack()
  } catch (error) {
    showStatus(`Export failed: ${error.message}`, 'issue')
  }
}

function toggleGenerateCard() {
  isGenerateCardCollapsed.value = !isGenerateCardCollapsed.value
}

function toggleSummaryCards() {
  isSummaryHidden.value = !isSummaryHidden.value
}

async function handleAddSection() {
  try {
    await addSection({
      code: newSectionCode.value,
      title: newSectionTitle.value,
    })
    await logAction('snag main list added', `${siteId} - ${newSectionTitle.value.trim()}`)
    showStatus('Main list added.')
    newSectionCode.value = ''
    newSectionTitle.value = ''
  } catch (error) {
    showStatus(error.message, 'issue')
  }
}

async function handleAddGroup(section) {
  const draft = newGroupDrafts.value[section.id] || {}

  try {
    await addGroup(section.id, draft)
    await logAction('snag sub list added', `${siteId} - ${section.title} - ${String(draft.title || '').trim()}`)
    showStatus('Sub list added.')
    newGroupDrafts.value = {
      ...newGroupDrafts.value,
      [section.id]: { code: '', title: '' },
    }
  } catch (error) {
    showStatus(error.message, 'issue')
  }
}

async function handleAddItem(section, group) {
  const draft = newItemDrafts.value[group.id] || {}

  try {
    await addItem(section.id, group.id, draft)
    await logAction('snag item added', `${siteId} - ${group.title} - ${String(draft.title || '').trim()}`)
    showStatus('snag item added.')
    newItemDrafts.value = {
      ...newItemDrafts.value,
      [group.id]: { title: '' },
    }
  } catch (error) {
    showStatus(error.message, 'issue')
  }
}

async function handleDeleteSection(section) {
  try {
    await deleteSection(section.id)
    await logAction('snag main list deleted', `${siteId} - ${section.title}`)
    showStatus('Main list deleted.')
  } catch (error) {
    showStatus(error.message, 'issue')
  }
}

async function handleRenameSection(section) {
  const nextTitle = window.prompt('Rename main list', section.title)
  if (nextTitle === null) return
  const nextCode = window.prompt('Main list code', section.code || '')
  if (nextCode === null) return

  try {
    await renameSection(section.id, { title: nextTitle, code: nextCode })
    await logAction('Snag main list renamed', `${siteId} - ${nextTitle.trim()}`)
    showStatus('Main list renamed.')
  } catch (error) {
    showStatus(error.message, 'issue')
  }
}

async function handleDeleteGroup(section, group) {
  try {
    await deleteGroup(section.id, group.id)
    await logAction('snag sub list deleted', `${siteId} - ${section.title} - ${group.title}`)
    showStatus('Sub list deleted.')
  } catch (error) {
    showStatus(error.message, 'issue')
  }
}

async function handleRenameGroup(section, group) {
  const nextTitle = window.prompt('Rename sub list', group.title)
  if (nextTitle === null) return
  const nextCode = window.prompt('Sub list code', group.code || '')
  if (nextCode === null) return

  try {
    await renameGroup(section.id, group.id, { title: nextTitle, code: nextCode })
    await logAction('Snag sub list renamed', `${siteId} - ${section.title} - ${nextTitle.trim()}`)
    showStatus('Sub list renamed.')
  } catch (error) {
    showStatus(error.message, 'issue')
  }
}

async function handleDeleteItem(section, group, item) {
  try {
    await deleteItem(section.id, group.id, item.id)
    await logAction('snag item deleted', `${siteId} - ${group.title} - ${item.title}`)
    showStatus('snag item deleted.')
  } catch (error) {
    showStatus(error.message, 'issue')
  }
}

function isCollapsed(sectionId) {
  return collapsedSectionIds.value.has(sectionId)
}

function toggleSection(sectionId) {
  const next = new Set(collapsedSectionIds.value)
  if (next.has(sectionId)) next.delete(sectionId)
  else next.add(sectionId)
  collapsedSectionIds.value = next
}

function getSectionSummary(section) {
  return summarizeSnagSummary([section])
}

function getGroupSummary(group) {
  const items = group.items || []
  const done = items.filter((item) => item.status === SNAG_SUMMARY_STATUS.DONE).length
  return {
    total: items.length,
    done,
    todo: items.length - done,
  }
}

async function toggleItem(section, group, item) {
  const nextStatus =
    item.status === SNAG_SUMMARY_STATUS.DONE
      ? SNAG_SUMMARY_STATUS.TODO
      : SNAG_SUMMARY_STATUS.DONE

  await setItemStatus(section.id, group.id, item.id, nextStatus)
  await logAction(
    nextStatus === SNAG_SUMMARY_STATUS.DONE ? 'snag item done' : 'snag item not done',
    `${siteId} - ${item.title}`
  )
}

function openPartialDoneModal(section, group, item) {
  activePartialItem.value = {
    sectionId: section.id,
    sectionTitle: section.title,
    groupId: group.id,
    groupTitle: group.title,
    itemId: item.id,
    itemTitle: item.title,
    isExistingPartial: item.status === SNAG_SUMMARY_STATUS.PARTIAL,
  }
  partialCommentDraft.value = item.status === SNAG_SUMMARY_STATUS.PARTIAL ? String(item.partialComment || '') : ''
  partialCommentError.value = ''
}

function closePartialDoneModal() {
  activePartialItem.value = null
  partialCommentDraft.value = ''
  partialCommentError.value = ''
}

async function savePartialDone() {
  if (!activePartialItem.value) return

  const nextComment = String(partialCommentDraft.value || '').trim()
  if (!nextComment) {
    partialCommentError.value = 'Comment is required for partial done.'
    return
  }

  await setItemStatus(
    activePartialItem.value.sectionId,
    activePartialItem.value.groupId,
    activePartialItem.value.itemId,
    SNAG_SUMMARY_STATUS.PARTIAL,
    { partialComment: nextComment }
  )
  await logAction('snag item partial done', `${siteId} - ${activePartialItem.value.itemTitle}`)
  closePartialDoneModal()
}

async function clearPartialDone() {
  if (!activePartialItem.value) return

  await setItemStatus(
    activePartialItem.value.sectionId,
    activePartialItem.value.groupId,
    activePartialItem.value.itemId,
    SNAG_SUMMARY_STATUS.TODO
  )
  await logAction('snag item partial removed', `${siteId} - ${activePartialItem.value.itemTitle}`)
  closePartialDoneModal()
}

async function toggleItemChecking(section, group, item) {
  const nextCheckingState = !item.isChecking

  await setItemChecking(section.id, group.id, item.id, nextCheckingState)
  await logAction(
    nextCheckingState ? 'snag item flagged for checking' : 'snag item unflagged from checking',
    `${siteId} - ${item.title}`
  )
}

async function updateItemCategory(section, group, item, category) {
  await setItemCategory(section.id, group.id, item.id, category)
  await logAction('Snag item category updated', `${siteId} - ${item.title} - ${category}`)
}

function openHistoryModal(section, group, item) {
  activeHistoryItem.value = {
    sectionTitle: section.title,
    groupTitle: group.title,
    itemTitle: item.title,
    entries: [...(item.actionHistory || [])].reverse(),
  }
}

function closeHistoryModal() {
  activeHistoryItem.value = null
}

function formatCode(code) {
  return String(code || '').trim()
}

function getGroupDraft(sectionId) {
  return newGroupDrafts.value[sectionId] || { code: '', title: '' }
}

function setGroupDraft(sectionId, key, value) {
  const current = getGroupDraft(sectionId)
  newGroupDrafts.value = {
    ...newGroupDrafts.value,
    [sectionId]: {
      ...current,
      [key]: value,
    },
  }
}

function getItemDraft(groupId) {
  return newItemDrafts.value[groupId] || { title: '' }
}

function setItemDraft(groupId, value) {
  const current = getItemDraft(groupId)
  newItemDrafts.value = {
    ...newItemDrafts.value,
    [groupId]: {
      ...current,
      title: value,
    },
  }
}

function getStatusLabel(status) {
  if (status === SNAG_SUMMARY_STATUS.DONE) return 'Done'
  if (status === SNAG_SUMMARY_STATUS.PARTIAL) return 'Partial done'
  return 'Not done'
}

function getLastActionLabel(item) {
  const entries = item.actionHistory || []
  const lastEntry = entries[entries.length - 1]
  if (!lastEntry?.changedAt) return 'No action yet'
  return `Last action ${formatDateTime(lastEntry.changedAt)}`
}

function getHistoryLabel(entry) {
  if (entry?.toStatus === SNAG_SUMMARY_STATUS.PARTIAL) return 'Marked as partial done'
  if (entry?.toStatus === SNAG_SUMMARY_STATUS.DONE) return 'Ticked as done'
  return 'Returned to not done'
}

function formatDateTime(value) {
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
</script>

<template>
  <div class="col grow" style="overflow: auto">
    <Topbar :title="title" :subtitle="subtitle">
      <button type="button" class="btn btn-ghost" @click="goBack">
        <MaterialIcon name="arrow_back" />
        Back to site
      </button>
    </Topbar>

    <div class="col grow" style="overflow-y: auto; padding: 0 20px 20px">
      <div
        class="col"
        style="position: sticky; top: 0; z-index: 10; padding: 20px 12px 12px; margin: 0 -12px 20px; background: var(--paper); border-bottom: 1px solid var(--line); box-shadow: 0 6px 0 var(--paper), 0 10px 18px rgba(26, 26, 26, 0.04)"
      >
        <div class="between gap-3" style="flex-wrap: wrap; margin-bottom: 16px">
          <div class="title-md">Summary</div>
          <button type="button" class="chip" @click="toggleSummaryCards">
            <MaterialIcon :name="isSummaryHidden ? 'visibility' : 'visibility_off'" :size="14" />
            {{ isSummaryHidden ? 'Show summary' : 'Hide summary' }}
          </button>
        </div>

        <div v-if="!isSummaryHidden" class="row gap-3" style="flex-wrap: wrap; margin-bottom: 16px">
          <StatCard label="Main lists" :value="summary.sectionCount" accent="var(--confirm)" :sub="summary.total ? `${summary.completion}% complete` : 'nothing generated yet'" />
          <StatCard label="Sub lists" :value="summary.groupCount" accent="var(--confirm)" :sub="summary.total ? `${summary.total} snag items` : 'waiting for pasted text'" />
          <StatCard label="Done" :value="summary.done" accent="var(--confirm)" :sub="summary.total ? 'ticked complete' : 'no actions yet'" />
          <StatCard label="Not done" :value="summary.todo" accent="var(--pending)" :sub="summary.total ? 'still open' : 'no actions yet'" />
        </div>

        <div class="box p-4 col gap-3">
          <div class="between gap-3" style="flex-wrap: wrap">
            <div class="col gap-1">
              <div class="title-md">Generate snag summary</div>
              <div class="small">
                Paste numbered and bulleted text here. `1.` becomes a main list, `1.1` becomes a sub list, and `-` becomes a trackable snag item. New generates append to the current snag board and skip duplicate item names.
              </div>
            </div>
            <div class="row gap-2" style="flex-wrap: wrap">
              <button type="button" class="chip" @click="toggleGenerateCard">
                <MaterialIcon :name="isGenerateCardCollapsed ? 'expand_more' : 'expand_less'" :size="14" />
                {{ isGenerateCardCollapsed ? 'Expand' : 'Collapse' }}
              </button>
              <button type="button" class="btn btn-primary" :disabled="isGenerating" @click="handleGenerate">
                <MaterialIcon name="auto_fix_high" />
                {{ isGenerating ? 'Generating...' : 'Generate' }}
              </button>
            </div>
          </div>

          <textarea
            v-if="!isGenerateCardCollapsed"
            v-model="sourceText"
            class="field mono"
            rows="8"
            placeholder="Example:&#10;1.HOP photo and installation&#10;  1.1 Pole&#10;  - MCBB photos&#10;  - Flag and steel label"
            style="resize: vertical; line-height: 1.5"
          />
        </div>

        <div class="box-soft p-4 col gap-3" style="margin-top: 12px">
          <div class="col gap-1">
            <div class="title-md">Add main list manually</div>
            <div class="small">Use this if you want to build the snag summary without pasting sample text first.</div>
          </div>
          <div class="row gap-2 snag-add-row">
            <input
              v-model="newSectionCode"
              class="field mono snag-code-field"
              type="text"
              placeholder="Code e.g. 1"
            />
            <input
              v-model="newSectionTitle"
              class="field grow"
              type="text"
              placeholder="Main list name"
              @keydown.enter.prevent="handleAddSection"
            />
            <button type="button" class="btn" @click="handleAddSection">
              <MaterialIcon name="playlist_add" />
              Add main list
            </button>
          </div>
        </div>
      </div>

      <div class="col gap-4">
        <div class="between">
          <div class="title-lg">Snag list board</div>
          <div class="row gap-2" style="flex-wrap: wrap; align-items: center">
            <span class="small">{{ summary.total }} items</span>
            <label class="chip chip-neutral">
              <MaterialIcon name="category" :size="14" />
              <select v-model="exportCategory" class="snag-category-select">
                <option v-for="category in SNAG_SUMMARY_CATEGORIES" :key="category" :value="category">
                  {{ category }}
                </option>
              </select>
            </label>
            <button type="button" class="btn btn-primary" :disabled="!summary.total" @click="handleExportToNewUpdate">
              <MaterialIcon name="history_edu" />
              Save snag history
            </button>
          </div>
        </div>

        <div v-if="!sections.length" class="box-dash p-4 small">
          No snag summary list yet. Paste your text in the box above and click Generate to build the main list and sub list structure.
        </div>

        <div v-else class="col gap-4">
          <div
            v-for="section in sections"
            :key="section.id"
            class="box p-4 col gap-3"
          >
            <div class="between gap-3" style="flex-wrap: wrap; align-items: flex-start">
              <div class="col gap-2">
                <div class="row gap-2" style="flex-wrap: wrap; align-items: center">
                  <span v-if="formatCode(section.code)" class="chip chip-neutral mono">{{ formatCode(section.code) }}</span>
                  <div class="title-md">{{ section.title }}</div>
                </div>
                <div class="row gap-2" style="flex-wrap: wrap">
                  <span class="chip chip-confirm">
                    <MaterialIcon name="check_circle" :size="14" />
                    {{ getSectionSummary(section).done }} done
                  </span>
                  <span class="chip chip-pending">
                    <MaterialIcon name="pending_actions" :size="14" />
                    {{ getSectionSummary(section).todo }} not done
                  </span>
                  <span class="chip chip-neutral">
                    <MaterialIcon name="layers" :size="14" />
                    {{ section.groups?.length || 0 }} sub lists
                  </span>
                </div>
              </div>

              <button type="button" class="chip" @click="toggleSection(section.id)">
                <MaterialIcon :name="isCollapsed(section.id) ? 'expand_more' : 'expand_less'" :size="14" />
                {{ isCollapsed(section.id) ? 'Expand' : 'Collapse' }}
              </button>
              <button type="button" class="chip chip-neutral" @click="handleRenameSection(section)">
                <MaterialIcon name="edit" :size="14" />
                Rename main list
              </button>
              <button type="button" class="chip chip-pending" @click="handleDeleteSection(section)">
                <MaterialIcon name="delete" :size="14" />
                Delete main list
              </button>
            </div>

            <div v-if="!isCollapsed(section.id)" class="col gap-3">
              <div class="box-dash p-3 col gap-2">
                <div class="label">Add sub list</div>
                <div class="row gap-2 snag-add-row">
                  <input
                    :value="getGroupDraft(section.id).code"
                    class="field mono snag-code-field"
                    type="text"
                    placeholder="Code e.g. 1.1"
                    @input="setGroupDraft(section.id, 'code', $event.target.value)"
                  />
                  <input
                    :value="getGroupDraft(section.id).title"
                    class="field grow"
                    type="text"
                    placeholder="Sub list name"
                    @input="setGroupDraft(section.id, 'title', $event.target.value)"
                    @keydown.enter.prevent="handleAddGroup(section)"
                  />
                  <button type="button" class="btn" @click="handleAddGroup(section)">
                    <MaterialIcon name="playlist_add" />
                    Add sub list
                  </button>
                </div>
              </div>

              <div
                v-for="group in section.groups"
                :key="group.id"
                class="box-soft p-4 col gap-3"
              >
                <div class="between gap-3" style="flex-wrap: wrap; align-items: flex-start">
                  <div class="col gap-2">
                    <div class="row gap-2" style="flex-wrap: wrap; align-items: center">
                      <span v-if="formatCode(group.code)" class="chip chip-neutral mono">{{ formatCode(group.code) }}</span>
                      <div class="title-md">{{ group.title }}</div>
                    </div>
                    <div class="row gap-2" style="flex-wrap: wrap">
                      <span class="chip chip-confirm">
                        <MaterialIcon name="check_circle" :size="14" />
                        {{ getGroupSummary(group).done }} done
                      </span>
                      <span class="chip chip-pending">
                        <MaterialIcon name="pending_actions" :size="14" />
                        {{ getGroupSummary(group).todo }} not done
                      </span>
                    </div>
                  </div>
                  <div class="row gap-2" style="flex-wrap: wrap">
                    <span class="chip chip-neutral">
                      <MaterialIcon name="format_list_bulleted" :size="14" />
                      {{ group.items?.length || 0 }} items
                    </span>
                    <button type="button" class="chip chip-neutral" @click="handleRenameGroup(section, group)">
                      <MaterialIcon name="edit" :size="14" />
                      Rename sub list
                    </button>
                    <button type="button" class="chip chip-pending" @click="handleDeleteGroup(section, group)">
                      <MaterialIcon name="delete" :size="14" />
                      Delete sub list
                    </button>
                  </div>
                </div>

                <div class="box-dash p-3 col gap-2">
                  <div class="label">Add snag item</div>
                  <div class="row gap-2 snag-add-row">
                    <input
                      :value="getItemDraft(group.id).title"
                      class="field grow"
                      type="text"
                      placeholder="snag item name"
                      @input="setItemDraft(group.id, $event.target.value)"
                      @keydown.enter.prevent="handleAddItem(section, group)"
                    />
                    <button type="button" class="btn" @click="handleAddItem(section, group)">
                      <MaterialIcon name="playlist_add" />
                      Add item
                    </button>
                  </div>
                </div>

                <div class="col gap-2">
                  <div
                    v-for="item in group.items"
                    :key="item.id"
                    class="box p-3 row gap-3 snag-item-row"
                    :class="{ 'is-checking': item.isChecking }"
                  >
                    <label class="row gap-2 grow snag-item-check">
                      <input
                        type="checkbox"
                        :checked="item.status === SNAG_SUMMARY_STATUS.DONE"
                        @change="toggleItem(section, group, item)"
                      />
                      <div class="col gap-1 grow">
                        <div class="snag-item-title" :class="{ 'is-done': item.status === SNAG_SUMMARY_STATUS.DONE }">
                          {{ item.title }}
                        </div>
                        <div v-if="item.status === SNAG_SUMMARY_STATUS.PARTIAL && item.partialComment" class="tiny snag-partial-comment">
                          Partial done: {{ item.partialComment }}
                        </div>
                        <div class="small">{{ getLastActionLabel(item) }}</div>
                      </div>
                    </label>

                    <div class="row gap-2 snag-item-actions" style="flex-wrap: wrap">
                      <span
                        class="chip"
                        :class="item.status === SNAG_SUMMARY_STATUS.DONE ? 'chip-confirm' : item.status === SNAG_SUMMARY_STATUS.PARTIAL ? 'chip-partial' : 'chip-pending'"
                      >
                        <MaterialIcon
                          :name="item.status === SNAG_SUMMARY_STATUS.DONE ? 'check_circle' : item.status === SNAG_SUMMARY_STATUS.PARTIAL ? 'pending' : 'radio_button_unchecked'"
                          :size="14"
                        />
                        {{ getStatusLabel(item.status) }}
                      </span>
                      <label class="chip chip-neutral">
                        <MaterialIcon name="category" :size="14" />
                        <select
                          class="snag-category-select"
                          :value="item.category"
                          @change="updateItemCategory(section, group, item, $event.target.value)"
                        >
                          <option v-for="category in SNAG_SUMMARY_CATEGORIES" :key="category" :value="category">
                            {{ category }}
                          </option>
                        </select>
                      </label>
                      <button
                        type="button"
                        class="chip"
                        :class="item.status === SNAG_SUMMARY_STATUS.PARTIAL ? 'chip-partial' : 'chip-neutral'"
                        @click="openPartialDoneModal(section, group, item)"
                      >
                        <MaterialIcon :name="item.status === SNAG_SUMMARY_STATUS.PARTIAL ? 'edit_note' : 'assignment_turned_in'" :size="14" />
                        {{ item.status === SNAG_SUMMARY_STATUS.PARTIAL ? 'Edit partial' : 'Partial done' }}
                      </button>
                      <button
                        type="button"
                        class="chip"
                        :class="item.isChecking ? 'chip-checking' : 'chip-neutral'"
                        @click="toggleItemChecking(section, group, item)"
                      >
                        <MaterialIcon :name="item.isChecking ? 'flag' : 'outlined_flag'" :size="14" />
                        {{ item.isChecking ? 'Under checking' : 'Flag checking' }}
                      </button>
                      <button type="button" class="chip" @click="openHistoryModal(section, group, item)">
                        <MaterialIcon name="history" :size="14" />
                        History
                      </button>
                      <button type="button" class="chip chip-pending" @click="handleDeleteItem(section, group, item)">
                        <MaterialIcon name="delete" :size="14" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
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
        v-if="isGenerateCategoryModalOpen"
        class="snag-summary-overlay"
        @click.self="closeGenerateCategoryModal"
      >
        <div class="snag-summary-modal box col gap-4">
          <div class="between" style="align-items: center">
            <div class="title-md">Select snag type</div>
            <button type="button" class="btn btn-ghost" style="padding: 4px 8px" @click="closeGenerateCategoryModal">
              <MaterialIcon name="close" :size="20" />
            </button>
          </div>

          <div class="small">
            Choose the snag category for this generated batch. New items will be appended to the current snag board, and duplicates will be skipped.
          </div>

          <div class="row gap-2" style="flex-wrap: wrap">
            <button
              v-for="category in SNAG_SUMMARY_CATEGORIES"
              :key="category"
              type="button"
              class="btn"
              :class="exportCategory === category ? 'btn-primary' : ''"
              :disabled="isGenerating"
              @click="generateWithCategory(category)"
            >
              <MaterialIcon name="category" :size="16" />
              {{ category }}
            </button>
          </div>

          <div class="row gap-2" style="justify-content: flex-end">
            <button type="button" class="btn btn-ghost" :disabled="isGenerating" @click="closeGenerateCategoryModal">Cancel</button>
          </div>
        </div>
      </div>

      <div
        v-if="activeHistoryItem"
        class="snag-summary-overlay"
        @click.self="closeHistoryModal"
      >
        <div class="snag-summary-modal box col gap-4">
          <div class="between" style="align-items: center">
            <div class="title-md">snag item history</div>
            <button type="button" class="btn btn-ghost" style="padding: 4px 8px" @click="closeHistoryModal">
              <MaterialIcon name="close" :size="20" />
            </button>
          </div>

          <div class="col gap-2">
            <div class="label">Main list</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">{{ activeHistoryItem.sectionTitle }}</div>
          </div>

          <div class="col gap-2">
            <div class="label">Sub list</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">{{ activeHistoryItem.groupTitle }}</div>
          </div>

          <div class="col gap-2">
            <div class="label">snag item</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">{{ activeHistoryItem.itemTitle }}</div>
          </div>

          <div v-if="!activeHistoryItem.entries.length" class="box-dash p-4 small">
            No action dates recorded yet. Tick or untick this item to start the history.
          </div>

          <div v-else class="col gap-2">
            <div
              v-for="entry in activeHistoryItem.entries"
              :key="entry.id || entry.changedAt"
              class="box-soft p-3 col gap-1"
            >
              <div class="row gap-2" style="align-items: center; flex-wrap: wrap">
                <span class="chip chip-neutral">
                  <MaterialIcon name="event" :size="14" />
                  {{ formatDateTime(entry.changedAt) }}
                </span>
                <span class="small" style="color: var(--ink)">{{ getHistoryLabel(entry) }}</span>
              </div>
              <div class="tiny">
                {{ getStatusLabel(entry.fromStatus) }} -> {{ getStatusLabel(entry.toStatus) }}
              </div>
              <div v-if="entry.comment" class="tiny" style="color: var(--ink-2)">
                Comment: {{ entry.comment }}
              </div>
              <div class="tiny" style="color: var(--ink-3)">By {{ getActivityActorLabel(entry) }}</div>
            </div>
          </div>

          <div class="row gap-2" style="justify-content: flex-end">
            <button type="button" class="btn btn-primary" @click="closeHistoryModal">Close</button>
          </div>
        </div>
      </div>

      <div
        v-if="activePartialItem"
        class="snag-summary-overlay"
        @click.self="closePartialDoneModal"
      >
        <div class="snag-summary-modal box col gap-4">
          <div class="between" style="align-items: center">
            <div class="title-md">Partial done comment</div>
            <button type="button" class="btn btn-ghost" style="padding: 4px 8px" @click="closePartialDoneModal">
              <MaterialIcon name="close" :size="20" />
            </button>
          </div>

          <div class="col gap-2">
            <div class="label">Main list</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">{{ activePartialItem.sectionTitle }}</div>
          </div>

          <div class="col gap-2">
            <div class="label">Sub list</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">{{ activePartialItem.groupTitle }}</div>
          </div>

          <div class="col gap-2">
            <div class="label">snag item</div>
            <div class="box-soft p-3 small" style="color: var(--ink)">{{ activePartialItem.itemTitle }}</div>
          </div>

          <div class="col gap-2">
            <div class="label">Comment</div>
            <textarea
              v-model="partialCommentDraft"
              class="field"
              rows="4"
              placeholder="Write what is partially done here"
              style="resize: vertical"
            />
            <div v-if="partialCommentError" class="tiny" style="color: var(--issue)">{{ partialCommentError }}</div>
          </div>

          <div class="row gap-2" style="justify-content: flex-end; flex-wrap: wrap">
            <button type="button" class="btn btn-ghost" @click="closePartialDoneModal">Cancel</button>
            <button
              v-if="activePartialItem.isExistingPartial"
              type="button"
              class="btn"
              @click="clearPartialDone"
            >
              Set back to not done
            </button>
            <button type="button" class="btn btn-primary" @click="savePartialDone">
              Save partial done
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.snag-summary-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.snag-summary-modal {
  background: var(--paper);
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
}

.snag-item-row {
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

.snag-item-row.is-checking {
  border-color: #d6a13a;
  background: #fff6de;
}

.snag-item-check {
  align-items: flex-start;
  min-width: 220px;
}

.snag-item-title {
  font-size: 13px;
  color: var(--ink);
}

.snag-item-title.is-done {
  text-decoration: line-through;
  color: var(--ink-3);
}

.snag-partial-comment {
  color: #8a5a00;
}

.snag-item-actions {
  align-items: center;
}

.chip-checking {
  border-color: #d6a13a;
  background: #fff1c2;
  color: #7b5600;
}

.chip-partial {
  border-color: #c97e1b;
  background: #ffe7c2;
  color: #8a4f00;
}

.snag-category-select {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 0;
  outline: none;
}

.snag-add-row {
  flex-wrap: wrap;
}

.snag-code-field {
  width: 120px;
  flex: 0 0 120px;
}
</style>

