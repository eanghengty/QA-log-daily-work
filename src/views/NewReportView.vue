<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import { useReports } from '../composables/useReports.js'
import { useIssues } from '../composables/useIssues.js'
import { useConfirms } from '../composables/useConfirms.js'
import { useActivityLog } from '../composables/useActivityLog.js'
import {
  reportNotesHtmlFromText,
  reportNotesPlainTextFromHtml,
  sanitizeReportNotesHtml,
} from '../lib/reportNotes.js'
import { formatSiteNameWithHopReviewer } from '../lib/siteHeader.js'
import { buildSitePath } from '../lib/siteRouting.js'
import Topbar from '../components/Topbar.vue'
import AttachmentDropzone from '../components/AttachmentDropzone.vue'
import MaterialIcon from '../components/MaterialIcon.vue'

const route = useRoute()
const router = useRouter()
const siteId = route.params.id
const reportId = computed(() => route.params.reportId)
const isEdit = computed(() => Boolean(reportId.value))

const { useSiteById } = useSites()
const { addReport, updateReport, useReportById } = useReports(siteId)
const { issues } = useIssues(siteId)
const { confirms } = useConfirms(siteId)
const { data: site } = useSiteById(siteId)
const { data: report } = useReportById(reportId.value || 0)
const { logAction } = useActivityLog()

const today = new Date().toISOString().split('T')[0]
const form = ref(emptyForm())
const notesEditor = ref(null)
const initialPrefillNotes =
  !isEdit.value && typeof window !== 'undefined'
    ? String(window.history.state?.reportPrefillNotes || '')
    : ''

if (initialPrefillNotes) {
  form.value = {
    ...form.value,
    notes: initialPrefillNotes,
    notesRich: reportNotesHtmlFromText(initialPrefillNotes),
  }
}

const pageTitle = computed(() => (isEdit.value ? 'Edit progress update' : 'New progress update'))
const pageSubtitle = computed(() => `${formatSiteNameWithHopReviewer(site.value, siteId)} - ${form.value.date || today}`)

watch(
  report,
  (value) => {
    if (!value) return
    form.value = {
      date: value.date || today,
      time: value.time || currentTime(),
      notes: value.notes || '',
      notesRich: sanitizeReportNotesHtml(value.notesRich || reportNotesHtmlFromText(value.notes || '')),
      linkedIssueIds: [...(value.linkedIssueIds || [])],
      linkedConfirmIds: [...(value.linkedConfirmIds || [])],
      attachmentIds: [...(value.attachmentIds || [])],
    }
  },
  { immediate: true }
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
  { immediate: true }
)

async function save(options = {}) {
  syncNotesFromEditor()

  const payload = {
    siteId,
    date: form.value.date || today,
    time: form.value.time || currentTime(),
    notes: form.value.notes,
    notesRich: form.value.notesRich,
    linkedIssueIds: [...form.value.linkedIssueIds],
    linkedConfirmIds: [...form.value.linkedConfirmIds],
    attachmentIds: [...form.value.attachmentIds],
  }

  const savedId = isEdit.value
    ? reportId.value
    : await addReport(payload)

  if (isEdit.value) {
    await updateReport(reportId.value, payload)
    await logAction('Progress update edited', `${payload.date} — ${siteId}`)
  } else {
    await logAction('Progress update created', `${payload.date} — ${siteId}`)
  }

  if (options.generateEmail) {
    router.push(buildSitePath(siteId, `/report/${savedId}/email`))
    return
  }

  router.push(buildSitePath(siteId))
}

function goBack() {
  router.push(buildSitePath(siteId))
}

function logIssue() {
  router.push(buildSitePath(siteId, '/issue/new'))
}

function saveConfirm() {
  router.push(buildSitePath(siteId, '/confirm/new'))
}

function toggleIssue(issueId) {
  toggleId(form.value.linkedIssueIds, issueId)
}

function toggleConfirm(confirmId) {
  toggleId(form.value.linkedConfirmIds, confirmId)
}

function toggleId(list, id) {
  const index = list.indexOf(id)
  if (index >= 0) {
    list.splice(index, 1)
    return
  }
  list.push(id)
}

function emptyForm() {
  return {
    date: today,
    time: currentTime(),
    notes: '',
    notesRich: reportNotesHtmlFromText(''),
    linkedIssueIds: [],
    linkedConfirmIds: [],
    attachmentIds: [],
  }
}

function currentTime() {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
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

  marks
    .filter((mark) => range.intersectsNode(mark))
    .forEach(unwrapHighlight)

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

  while (mark.firstChild) {
    parent.insertBefore(mark.firstChild, mark)
  }

  parent.removeChild(mark)
}
</script>

<template>
  <div class="col grow">
    <Topbar :title="pageTitle" :subtitle="pageSubtitle">
      <button type="button" class="btn btn-ghost" @click="goBack">Cancel</button>
      <button type="button" class="btn" @click="save()">Save update</button>
      <button type="button" class="btn btn-primary" @click="save({ generateEmail: true })">
        Save & generate email
        <MaterialIcon name="arrow_forward" />
      </button>
    </Topbar>

    <div class="row gap-5 p-5 grow" style="overflow: auto">
      <div class="col gap-4 grow" style="flex: 2 1 0%">
        <div class="col gap-2">
          <div class="label">Date</div>
          <div class="row gap-2">
            <label class="field row items-center gap-2" style="width: 190px">
              <MaterialIcon name="calendar_today" :size="16" />
              <input v-model="form.date" type="date" style="border: 0; background: transparent; width: 100%; font: inherit; color: inherit" />
            </label>
            <label class="field row items-center gap-2" style="width: 140px">
              <MaterialIcon name="schedule" :size="16" />
              <input v-model="form.time" type="time" style="border: 0; background: transparent; width: 100%; font: inherit; color: inherit" />
            </label>
          </div>
        </div>

        <div class="col gap-2 grow">
          <div class="between">
            <div class="label">Progress notes - what happened on site?</div>
            <div class="tiny">work completed, delays, next steps</div>
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
              <div class="tiny" style="color: var(--ink-3)">Highlight stays in the update editor and is removed from the generated email.</div>
            </div>
            <div
              ref="notesEditor"
              class="field grow report-notes-editor"
              contenteditable="true"
              spellcheck="false"
              style="font-size: 13px; padding: 16px; min-height: 240px; overflow: auto"
              @input="onNotesInput"
              @paste="onNotesPaste"
            />
          </div>
        </div>

        <div class="row gap-3">
          <div class="box-dash p-3 col gap-2 grow">
            <div class="label">Link blockers / risks</div>
            <div class="row gap-2" style="flex-wrap: wrap">
              <button
                v-for="issue in issues?.slice(0, 4)"
                :key="issue.id"
                type="button"
                class="chip"
                :class="{ 'chip-issue': form.linkedIssueIds.includes(issue.id) }"
                @click="toggleIssue(issue.id)"
              >
                <MaterialIcon name="flag" :size="14" />
                {{ issue.code }}
              </button>
              <button type="button" class="chip btn-ghost" @click="logIssue">
                <MaterialIcon name="add" :size="14" />
                Log new
              </button>
            </div>
          </div>
          <div class="box-dash p-3 col gap-2 grow">
            <div class="label">Link confirmations / agreements</div>
            <div class="row gap-2" style="flex-wrap: wrap">
              <button
                v-for="confirm in confirms?.slice(0, 4)"
                :key="confirm.id"
                type="button"
                class="chip"
                :class="{ 'chip-confirm': form.linkedConfirmIds.includes(confirm.id) }"
                @click="toggleConfirm(confirm.id)"
              >
                <MaterialIcon name="verified" :size="14" />
                {{ confirm.code }}
              </button>
              <button type="button" class="chip btn-ghost" @click="saveConfirm">
                <MaterialIcon name="add" :size="14" />
                Save new
              </button>
            </div>
          </div>
        </div>

        <div class="col gap-2">
          <div class="label">Field proof (optional)</div>
          <AttachmentDropzone v-model="form.attachmentIds" />
        </div>
      </div>

      <div class="col gap-3" style="flex: 0 0 320px">
        <div class="box p-4 col gap-3">
          <div class="label">After save</div>
          <div class="row items-center gap-2" style="font-size: 12px">
            <MaterialIcon name="mail" :size="16" />
            email draft can be generated
          </div>
          <div class="row items-center gap-2" style="font-size: 12px">
            <MaterialIcon name="flag" :size="16" />
            linked blockers stay attached
          </div>
          <div class="row items-center gap-2" style="font-size: 12px">
            <MaterialIcon name="timeline" :size="16" />
            update appears in history
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.report-notes-editor {
  white-space: pre-wrap;
  line-height: 1.5;
  outline: none;
}

.report-notes-editor :deep(mark.report-note-highlight) {
  background: #fff1a8;
  color: inherit;
  padding: 0 2px;
  border-radius: 4px;
}
</style>
