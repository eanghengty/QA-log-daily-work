<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useActivityLog } from '../composables/useActivityLog.js'
import { useSites } from '../composables/useSites.js'
import { SNAG_SUMMARY_CATEGORIES } from '../composables/useSnagSummary.js'
import { useSnagReports } from '../composables/useSnagReports.js'
import {
  reportNotesHtmlFromText,
  reportNotesPlainTextFromHtml,
  sanitizeReportNotesHtml,
} from '../lib/reportNotes.js'
import { formatSiteNameWithHopReviewer } from '../lib/siteHeader.js'
import { buildSitePath } from '../lib/siteRouting.js'
import MaterialIcon from '../components/MaterialIcon.vue'
import Topbar from '../components/Topbar.vue'

const route = useRoute()
const router = useRouter()
const siteId = route.params.id
const snagReportId = computed(() => route.params.snagReportId)

const { useSiteById } = useSites()
const { data: site } = useSiteById(siteId)
const { updateSnagReport, useSnagReportById } = useSnagReports(siteId)
const { data: snagReport } = useSnagReportById(snagReportId.value)
const { logAction } = useActivityLog()

const notesEditor = ref(null)
const form = ref({
  date: '',
  time: '',
  category: SNAG_SUMMARY_CATEGORIES[0],
  notes: '',
  notesRich: reportNotesHtmlFromText(''),
})

const pageTitle = computed(() => 'Edit snag history')
const pageSubtitle = computed(() => `${formatSiteNameWithHopReviewer(site.value, siteId)} - ${form.value.category}`)

watch(
  snagReport,
  (value) => {
    if (!value) return
    form.value = {
      date: value.date || '',
      time: value.time || '',
      category: normalizeCategory(value.category),
      notes: value.notes || '',
      notesRich: sanitizeReportNotesHtml(value.notesRich || reportNotesHtmlFromText(value.notes || '')),
    }
  },
  { immediate: true },
)

watch(
  () => form.value.notesRich,
  async (value) => {
    await nextTick()
    if (!notesEditor.value) return
    const sanitized = sanitizeReportNotesHtml(value)
    if (notesEditor.value.innerHTML !== sanitized) {
      notesEditor.value.innerHTML = sanitized
    }
  },
  { immediate: true },
)

async function save() {
  syncNotesFromEditor()
  await updateSnagReport(snagReportId.value, {
    category: form.value.category,
    notes: form.value.notes,
    notesRich: form.value.notesRich,
  })
  await logAction('Snag history edited', `${siteId} - ${form.value.category}`)
  router.push(buildSitePath(siteId))
}

function goBack() {
  router.push(buildSitePath(siteId))
}

function syncNotesFromEditor() {
  if (!notesEditor.value) return
  const sanitized = sanitizeReportNotesHtml(notesEditor.value.innerHTML)
  form.value.notesRich = sanitized
  form.value.notes = reportNotesPlainTextFromHtml(sanitized)
  if (notesEditor.value.innerHTML !== sanitized) {
    notesEditor.value.innerHTML = sanitized
  }
}

function onNotesInput() {
  syncNotesFromEditor()
}

function onNotesPaste(event) {
  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain') || ''
  document.execCommand('insertText', false, text)
  syncNotesFromEditor()
}

function applyHighlight() {
  wrapSelectionWithHighlight()
  syncNotesFromEditor()
}

function clearHighlight() {
  if (!notesEditor.value) return
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  if (!notesEditor.value.contains(range.commonAncestorContainer)) return

  const marks = Array.from(notesEditor.value.querySelectorAll('mark.report-note-highlight'))
  const closestMark = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer.closest?.('mark.report-note-highlight')
    : range.startContainer.parentElement?.closest?.('mark.report-note-highlight')

  if (range.collapsed && closestMark) {
    unwrapHighlight(closestMark)
    syncNotesFromEditor()
    return
  }

  marks.filter((mark) => range.intersectsNode(mark)).forEach(unwrapHighlight)
  syncNotesFromEditor()
}

function wrapSelectionWithHighlight() {
  if (!notesEditor.value) return

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  if (range.collapsed || !notesEditor.value.contains(range.commonAncestorContainer)) return

  const fragment = range.extractContents()
  const mark = document.createElement('mark')
  mark.className = 'report-note-highlight'
  mark.append(fragment)
  range.insertNode(mark)

  selection.removeAllRanges()
  const nextRange = document.createRange()
  nextRange.selectNodeContents(mark)
  selection.addRange(nextRange)
}

function unwrapHighlight(mark) {
  const parent = mark.parentNode
  if (!parent) return
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
  parent.removeChild(mark)
}

function normalizeCategory(category) {
  const normalized = String(category || '').trim().toLowerCase()
  return SNAG_SUMMARY_CATEGORIES.find((option) => option.toLowerCase() === normalized) || SNAG_SUMMARY_CATEGORIES[0]
}
</script>

<template>
  <div class="col grow">
    <Topbar :title="pageTitle" :subtitle="pageSubtitle">
      <button type="button" class="btn btn-ghost" @click="goBack">Cancel</button>
      <button type="button" class="btn btn-primary" @click="save">
        Save snag history
        <MaterialIcon name="save" />
      </button>
    </Topbar>

    <div class="col gap-5 p-5 grow" style="overflow: auto">
      <div class="row gap-3" style="flex-wrap: wrap">
        <div class="col gap-2" style="flex: 0 1 180px">
          <div class="label">Date</div>
          <div class="field row items-center gap-2">
            <MaterialIcon name="calendar_today" :size="16" />
            <span>{{ form.date || 'No date' }}</span>
          </div>
        </div>

        <div class="col gap-2" style="flex: 0 1 160px">
          <div class="label">Time</div>
          <div class="field row items-center gap-2">
            <MaterialIcon name="schedule" :size="16" />
            <span>{{ form.time || 'No time' }}</span>
          </div>
        </div>

        <div class="col gap-2" style="flex: 0 1 220px">
          <div class="label">Snag category</div>
          <select v-model="form.category" class="field">
            <option v-for="category in SNAG_SUMMARY_CATEGORIES" :key="category" :value="category">
              {{ category }}
            </option>
          </select>
        </div>
      </div>

      <div class="col gap-2 grow">
        <div class="between">
          <div class="label">Snag history notes</div>
          <div class="tiny">edit this saved snag record only</div>
        </div>
        <div class="box p-3 col gap-3 grow">
          <div class="row gap-2" style="flex-wrap: wrap">
            <button type="button" class="chip" @click="applyHighlight">
              <MaterialIcon name="ink_highlighter" :size="14" />
              Highlight
            </button>
            <button type="button" class="chip" @click="clearHighlight">
              <MaterialIcon name="format_color_reset" :size="14" />
              Unhighlight
            </button>
          </div>
          <div
            ref="notesEditor"
            class="field grow snag-notes-editor"
            contenteditable="true"
            spellcheck="false"
            style="font-size: 13px; padding: 16px; min-height: 320px; overflow: auto"
            @input="onNotesInput"
            @paste="onNotesPaste"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.snag-notes-editor {
  white-space: pre-wrap;
  line-height: 1.5;
  outline: none;
}

.snag-notes-editor :deep(mark.report-note-highlight) {
  background: #fff1a8;
  color: inherit;
  padding: 0 2px;
  border-radius: 4px;
}
</style>
