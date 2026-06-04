<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import { useReports } from '../composables/useReports.js'
import { useIssues } from '../composables/useIssues.js'
import { useConfirms } from '../composables/useConfirms.js'
import { useChecklists } from '../composables/useChecklists.js'
import { useCableMatrix } from '../composables/useCableMatrix.js'
import { useAntennaChecklist } from '../composables/useAntennaChecklist.js'
import { useDcplChecklist } from '../composables/useDcplChecklist.js'
import { useCableChecklist } from '../composables/useCableChecklist.js'
import { usePendingSummary } from '../composables/usePendingSummary.js'
import { exportSite, importSite } from '../lib/backup.js'
import { reportNotesHtmlFromText, reportNotesPlainTextFromHtml, sanitizeReportNotesHtml } from '../lib/reportNotes.js'
import { formatSiteNameWithHopReviewer } from '../lib/siteHeader.js'
import { shouldShowAntennaChecklist, shouldShowDcplChecklist } from '../lib/siteScope.js'
import { exportSiteWorkbook } from '../lib/siteWorkbookSpreadsheet.js'
import { useActivityLog } from '../composables/useActivityLog.js'
import DocumentReferenceModal from '../components/DocumentReferenceModal.vue'
import Topbar from '../components/Topbar.vue'
import StatCard from '../components/StatCard.vue'
import MaterialIcon from '../components/MaterialIcon.vue'

const route = useRoute()
const router = useRouter()
const siteId = route.params.id

const { useSiteById } = useSites()
const { data: site } = useSiteById(siteId)
const { reports, deleteReport } = useReports(siteId)
const { issues, pendingIssues, deleteIssue } = useIssues(siteId)
const { confirms, deleteConfirm } = useConfirms(siteId)
const { summary: checklistSummary } = useChecklists(siteId)
const { summary: cableMatrixSummary } = useCableMatrix(siteId)
const { summary: antennaChecklistSummary } = useAntennaChecklist(siteId)
const { summary: dcplChecklistSummary } = useDcplChecklist(siteId)
const { summary: cableChecklistSummary } = useCableChecklist(siteId)
const { summary: pendingProgressSummary } = usePendingSummary(siteId)
const { logAction } = useActivityLog()

const sortedReports = computed(() => [...(reports.value || [])].sort(compareReportsDesc))
const latestReport = computed(() => sortedReports.value[0] || null)
const reportsThisMonth = computed(() =>
  (reports.value || []).filter((report) => isInCurrentMonth(report.date)).length
)
const highPendingCount = computed(() =>
  (pendingIssues.value || []).filter((issue) => issue.priority === 'high').length
)
const medPendingCount = computed(() =>
  (pendingIssues.value || []).filter((issue) => issue.priority === 'med').length
)
const pendingSummary = computed(() =>
  pendingIssues.value?.length
    ? `${highPendingCount.value} high - ${medPendingCount.value} med`
    : 'none open'
)
const latestReportLabel = computed(() =>
  latestReport.value ? `last: ${formatDate(latestReport.value.date)}` : 'no updates yet'
)
const checklistValue = computed(() =>
  `${checklistSummary.value?.done || 0}/${checklistSummary.value?.applicable || 0}`
)
const checklistLabel = computed(() => {
  if (!checklistSummary.value?.total) return 'no sub checks yet'

  const todo = checklistSummary.value.todo || 0
  const na = checklistSummary.value.na || 0
  return `${todo} not done - ${na} N/A`
})
const cableMatrixValue = computed(() =>
  `${cableMatrixSummary.value?.fullyChecked || 0}/${cableMatrixSummary.value?.total || 0}`
)
const cableMatrixLabel = computed(() => {
  if (!cableMatrixSummary.value?.total) return 'no cable rows yet'

  const testRemaining =
    (cableMatrixSummary.value?.total || 0) - (cableMatrixSummary.value?.testOk || 0)
  const originRemaining =
    (cableMatrixSummary.value?.total || 0) - (cableMatrixSummary.value?.labelOriginOk || 0)
  const endRemaining =
    (cableMatrixSummary.value?.total || 0) - (cableMatrixSummary.value?.labelEndOk || 0)

  return `${testRemaining} test no - ${originRemaining} origin no - ${endRemaining} end no`
})
const antennaChecklistValue = computed(() => antennaChecklistSummary.value?.total || 0)
const antennaChecklistLabel = computed(() => {
  if (!antennaChecklistSummary.value?.total) return 'no antenna rows yet'

  return `${antennaChecklistSummary.value?.withSerialNumber || 0} serial no. - ${antennaChecklistSummary.value?.withModel || 0} model`
})
const shouldRenderAntennaChecklist = computed(() => shouldShowAntennaChecklist(site.value?.scope))
const shouldRenderDcplChecklist = computed(() => shouldShowDcplChecklist(site.value?.scope))
const dcplChecklistValue = computed(() => dcplChecklistSummary.value?.total || 0)
const dcplChecklistLabel = computed(() => {
  if (!dcplChecklistSummary.value?.total) return 'no DCPL rows yet'

  return `${dcplChecklistSummary.value?.withSerialNumber || 0} serial no. - ${dcplChecklistSummary.value?.withModel || 0} model`
})
const cableChecklistValue = computed(() => cableChecklistSummary.value?.total || 0)
const cableChecklistLabel = computed(() => {
  if (!cableChecklistSummary.value?.total) return 'no cable rows yet'

  return `${formatCountLength(cableChecklistSummary.value?.totalLength || 0)} total length - ${cableChecklistSummary.value?.withSweepTest || 0} sweep test`
})
const pendingProgressValue = computed(() =>
  `${pendingProgressSummary.value?.done || 0}/${pendingProgressSummary.value?.total || 0}`
)
const pendingProgressLabel = computed(() => {
  if (!pendingProgressSummary.value?.total) return 'no pending items yet'

  return `${pendingProgressSummary.value?.todo || 0} not done - ${pendingProgressSummary.value?.groupCount || 0} sub lists`
})
const topbarTitle = computed(() => formatSiteNameWithHopReviewer(site.value, siteId))
const topbarSubtitle = computed(() =>
  `${site.value?.url || siteId} - ${latestReportLabel.value}`
)

function newReport() {
  router.push(`/site/${siteId}/report/new`)
}

function logIssue() {
  router.push(`/site/${siteId}/issue/new`)
}

function saveConfirm() {
  router.push(`/site/${siteId}/confirm/new`)
}

function openSettings() {
  router.push(`/site/${siteId}/settings`)
}

function openChecklist() {
  router.push(`/site/${siteId}/checklist`)
}

function openCableMatrix() {
  router.push(`/site/${siteId}/cable-matrix`)
}

function openAntennaChecklist() {
  router.push(`/site/${siteId}/antenna-checklist`)
}

function openDcplChecklist() {
  router.push(`/site/${siteId}/dcpl-checklist`)
}

function openCableChecklist() {
  router.push(`/site/${siteId}/cable-checklist`)
}

function openPendingSummary() {
  router.push(`/site/${siteId}/pending-summary`)
}

function openLatestEmailDraft() {
  if (!latestReport.value) return
  router.push(`/site/${siteId}/report/${latestReport.value.id}/email`)
}

function openReportEmail(reportId) {
  router.push(`/site/${siteId}/report/${reportId}/email`)
}

function editIssue(issueId) {
  router.push(`/site/${siteId}/issue/${issueId}/edit`)
}

function editConfirm(confirmId) {
  router.push(`/site/${siteId}/confirm/${confirmId}/edit`)
}

const pendingDelete = ref(null)

function requestDelete(key) { pendingDelete.value = key }
function cancelDelete() { pendingDelete.value = null }

async function confirmDeleteReport(report) {
  pendingDelete.value = null
  await deleteReport(report.id)
  await logAction('Progress update deleted', `${report.date || 'unknown date'} — ${siteId}`)
}
async function confirmDeleteIssue(issue) {
  pendingDelete.value = null
  await deleteIssue(issue.id)
  await logAction('Blocker deleted', `${issue.title || issue.code || 'Untitled'} — ${siteId}`)
}
async function confirmDeleteConfirm(confirm) {
  pendingDelete.value = null
  await deleteConfirm(confirm.id)
  await logAction('Confirmation deleted', `${confirm.title || confirm.code || 'Untitled'} — ${siteId}`)
}

const expandedReports = ref(new Set())
function toggleReport(id) {
  const s = new Set(expandedReports.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedReports.value = s
}

const importFileRef = ref(null)
const siteStatus = ref('')
const showDocumentReferenceModal = ref(false)

async function handleExportSite() {
  await exportSite(siteId)
  await logAction('Site exported', `${siteId} — ${site.value?.name || ''}`)
}

async function handleExportSiteWorkbook() {
  await exportSiteWorkbook(siteId)
  await logAction('Site Excel exported', `${siteId} — ${site.value?.name || ''}`)
}

function triggerImportSite() {
  importFileRef.value?.click()
}

async function handleImportFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  event.target.value = ''

  let data
  try {
    data = JSON.parse(await file.text())
  } catch {
    siteStatus.value = 'Import failed: invalid JSON file.'
    setTimeout(() => { siteStatus.value = '' }, 4000)
    return
  }

  if (data._type !== 'site' || !data.site) {
    siteStatus.value = 'Import failed: not a site export file.'
    setTimeout(() => { siteStatus.value = '' }, 4000)
    return
  }

  const incomingId = data.site.id
  const incomingName = data.site.name
  if (incomingId !== siteId || incomingName !== site.value?.name) {
    siteStatus.value = `Import rejected: file is for "${incomingName}" (${incomingId}), not this site.`
    setTimeout(() => { siteStatus.value = '' }, 5000)
    return
  }

  const importSummary = summarizeImportPayload(data)
  if (!window.confirm(`Import will replace all data for "${site.value?.name}" including updates, blockers, confirmations, site checklist, cable matrix, antenna checklist, DCPL checklist, cable checklist, pending summary, and document references.

Incoming file: ${importSummary}

Your current data will be exported first as a backup. Continue?`)) return

  try {
    await exportSite(siteId)
    await importSite(data)
    await logAction('Site imported', `${siteId} ??? ${site.value?.name || ''}`)
    siteStatus.value = `Imported successfully ??? ${importSummary}. Current data was backed up first.`
    setTimeout(() => { siteStatus.value = '' }, 4000)
  } catch (err) {
    siteStatus.value = `Import failed: ${err.message}`
    setTimeout(() => { siteStatus.value = '' }, 4000)
  }
}

function compareReportsDesc(a, b) {
  return `${b.date || ''} ${b.time || ''}`.localeCompare(`${a.date || ''} ${a.time || ''}`)
}

function isInCurrentMonth(dateString) {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

function formatDate(dateString) {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return 'No date'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date)
}

function formatCountLength(value) {
  return Number.isFinite(value) ? value.toFixed(value % 1 === 0 ? 0 : 2) : '0'
}

function reportNotesPreviewHtml(report) {
  const html = report?.notesRich || reportNotesHtmlFromText(report?.notes || '')
  return sanitizeReportNotesHtml(html)
}

function reportNotesPreviewText(report) {
  return reportNotesPlainTextFromHtml(report?.notesRich || reportNotesHtmlFromText(report?.notes || ''))
}

function reportHasLongNotes(report) {
  const notes = reportNotesPreviewText(report)
  return notes.split('\n').length > 3 || notes.length > 160
}

function summarizeImportPayload(data) {
  const summary = data?.summary || {}
  const reports = summary.reports ?? data?.reports?.length ?? 0
  const issues = summary.issues ?? data?.issues?.length ?? 0
  const confirms = summary.confirms ?? data?.confirms?.length ?? 0
  const checklists = summary.checklists ?? data?.checklists?.length ?? 0
  const checklistLayout = summary.checklistLayout ?? data?.checklistLayout?.customColumns?.length ?? 0
  const cableMatrixLayout = summary.cableMatrixLayout ?? data?.cableMatrixLayout?.customColumns?.length ?? 0
  const antennaChecklistLayout = summary.antennaChecklistLayout ?? data?.antennaChecklistLayout?.customColumns?.length ?? 0
  const dcplChecklistLayout = summary.dcplChecklistLayout ?? data?.dcplChecklistLayout?.customColumns?.length ?? 0
  const cableChecklistLayout = summary.cableChecklistLayout ?? data?.cableChecklistLayout?.customColumns?.length ?? 0
  const cableMatrices = summary.cableMatrices ?? data?.cableMatrices?.length ?? 0
  const antennaChecklists = summary.antennaChecklists ?? data?.antennaChecklists?.length ?? 0
  const dcplChecklists = summary.dcplChecklists ?? data?.dcplChecklists?.length ?? 0
  const cableChecklists = summary.cableChecklists ?? data?.cableChecklists?.length ?? 0
  const pendingSummaries = summary.pendingSummaries ?? data?.pendingSummaries?.length ?? 0
  const pendingSummarySections =
    summary.pendingSummarySections ??
    data?.pendingSummaries?.reduce((total, board) => total + (board.sections?.length || 0), 0) ??
    0
  const pendingSummaryItems =
    summary.pendingSummaryItems ??
    data?.pendingSummaries?.reduce(
      (total, board) =>
        total +
        (board.sections || []).reduce(
          (sectionTotal, section) =>
            sectionTotal +
            (section.groups || []).reduce(
              (groupTotal, group) => groupTotal + (group.items?.length || 0),
              0
            ),
          0
        ),
      0
    ) ??
    0
  const documentReferences = summary.documentReferences ?? data?.documentReferences?.length ?? 0
  const emailSettings = summary.emailSettings ?? (data?.emailSettings ? 1 : 0)
  const attachments = summary.attachments ?? data?.attachments?.length ?? 0

  return `${reports} updates, ${issues} blockers, ${confirms} confirmations, ${checklists} site checklist items, ${checklistLayout} custom checklist columns, ${cableMatrices} cable matrix rows, ${cableMatrixLayout} custom cable matrix columns, ${antennaChecklists} antenna rows, ${antennaChecklistLayout} custom antenna checklist columns, ${dcplChecklists} DCPL rows, ${dcplChecklistLayout} custom DCPL checklist columns, ${cableChecklists} cable checklist rows, ${cableChecklistLayout} custom cable checklist columns, ${pendingSummaries} pending summary board, ${pendingSummarySections} pending sub lists, ${pendingSummaryItems} pending items, ${documentReferences} document references, ${attachments} attachments, ${emailSettings} email settings record`
}
</script>

<template>
  <div class="col grow scroll" style="overflow: auto">
    <input ref="importFileRef" type="file" accept=".json" hidden @change="handleImportFile" />
    <DocumentReferenceModal v-model="showDocumentReferenceModal" :site-id="siteId" />
    <Topbar :title="topbarTitle" :subtitle="topbarSubtitle">
      <button type="button" class="btn btn-ghost" @click="triggerImportSite">
        <MaterialIcon name="upload" />
        Import
      </button>
      <button type="button" class="btn btn-ghost" @click="showDocumentReferenceModal = true">
        <MaterialIcon name="link" />
        Document Reference
      </button>
      <button type="button" class="btn btn-ghost" @click="handleExportSiteWorkbook">
        <MaterialIcon name="table_view" />
        Export Excel
      </button>
      <button type="button" class="btn btn-ghost" @click="handleExportSite">
        <MaterialIcon name="download" />
        Export JSON
      </button>
      <button type="button" class="btn btn-ghost" @click="openSettings">
        <MaterialIcon name="settings" />
        Site settings
      </button>
      <button
        type="button"
        class="btn btn-ghost"
        :disabled="!latestReport"
        @click="openLatestEmailDraft"
      >
        <MaterialIcon name="mail" />
        Email draft
      </button>
      <button type="button" class="btn btn-primary" @click="newReport">
        <MaterialIcon name="add" />
        New update
      </button>
    </Topbar>

    <div class="col gap-5 p-5 grow" style="overflow-y: auto">
      <div class="row gap-3">
        <StatCard label="Open blockers" :value="pendingIssues?.length || 0" accent="var(--issue)" :sub="pendingSummary" />
        <StatCard label="Confirmations" :value="confirms?.length || 0" accent="var(--confirm)" sub="all time" />
        <StatCard label="Progress updates" :value="reportsThisMonth" :sub="latestReportLabel" />
        <StatCard label="Checklist progress" :value="checklistValue" accent="var(--confirm)" :sub="checklistLabel" />
        <StatCard label="Cable matrix" :value="cableMatrixValue" accent="var(--confirm)" :sub="cableMatrixLabel" />
        <StatCard
          v-if="shouldRenderAntennaChecklist"
          label="Antenna checklist"
          :value="antennaChecklistValue"
          accent="var(--confirm)"
          :sub="antennaChecklistLabel"
        />
        <StatCard
          v-if="shouldRenderDcplChecklist"
          label="DCPL checklist"
          :value="dcplChecklistValue"
          accent="var(--confirm)"
          :sub="dcplChecklistLabel"
        />
        <StatCard label="Cable checklist" :value="cableChecklistValue" accent="var(--confirm)" :sub="cableChecklistLabel" />
        <StatCard label="Pending summary" :value="pendingProgressValue" accent="var(--confirm)" :sub="pendingProgressLabel" />
      </div>

      <div class="col gap-3">
        <div class="label">Quick actions</div>
        <div class="row gap-3" style="flex-wrap: wrap">
          <button type="button" class="box p-4 col gap-2" style="flex: 1 1 180px; text-align: left; cursor: pointer" @click="newReport">
            <div class="row items-center gap-2">
              <div class="box center icon-box">
                <MaterialIcon name="edit_note" />
              </div>
              <div class="title-md">New progress update</div>
            </div>
            <div class="small">site progress notes</div>
          </button>
          <button type="button" class="box p-4 col gap-2" style="flex: 1 1 180px; border-style: dashed; text-align: left; cursor: pointer" @click="logIssue">
            <div class="row items-center gap-2">
              <div class="box center icon-box" style="border-color: var(--line-2)">
                <MaterialIcon name="flag" />
              </div>
              <div class="title-md">Log blocker</div>
            </div>
            <div class="small">risk or delay</div>
          </button>
          <button type="button" class="box p-4 col gap-2" style="flex: 1 1 180px; border-style: dashed; text-align: left; cursor: pointer" @click="saveConfirm">
            <div class="row items-center gap-2">
              <div class="box center icon-box" style="border-color: var(--line-2)">
                <MaterialIcon name="verified" />
              </div>
              <div class="title-md">Save confirmation</div>
            </div>
            <div class="small">capture sign-off</div>
          </button>
          <button type="button" class="box p-4 col gap-2" style="flex: 1 1 180px; border-style: dashed; text-align: left; cursor: pointer" @click="openChecklist">
            <div class="row items-center gap-2">
              <div class="box center icon-box" style="border-color: var(--line-2)">
                <MaterialIcon name="checklist" />
              </div>
              <div class="title-md">Site checklist</div>
            </div>
            <div class="small">main and sub checks</div>
          </button>
          <button type="button" class="box p-4 col gap-2" style="flex: 1 1 180px; border-style: dashed; text-align: left; cursor: pointer" @click="openCableMatrix">
            <div class="row items-center gap-2">
              <div class="box center icon-box" style="border-color: var(--line-2)">
                <MaterialIcon name="cable" />
              </div>
              <div class="title-md">Cable matrix</div>
            </div>
            <div class="small">cable checks and labels</div>
          </button>
          <button
            v-if="shouldRenderAntennaChecklist"
            type="button"
            class="box p-4 col gap-2"
            style="flex: 1 1 180px; border-style: dashed; text-align: left; cursor: pointer"
            @click="openAntennaChecklist"
          >
            <div class="row items-center gap-2">
              <div class="box center icon-box" style="border-color: var(--line-2)">
                <MaterialIcon name="settings_input_antenna" />
              </div>
              <div class="title-md">Antenna checklist</div>
            </div>
            <div class="small">antenna assets and comments</div>
          </button>
          <button
            v-if="shouldRenderDcplChecklist"
            type="button"
            class="box p-4 col gap-2"
            style="flex: 1 1 180px; border-style: dashed; text-align: left; cursor: pointer"
            @click="openDcplChecklist"
          >
            <div class="row items-center gap-2">
              <div class="box center icon-box" style="border-color: var(--line-2)">
                <MaterialIcon name="tune" />
              </div>
              <div class="title-md">DCPL checklist</div>
            </div>
            <div class="small">DCPL assets and comments</div>
          </button>
          <button type="button" class="box p-4 col gap-2" style="flex: 1 1 180px; border-style: dashed; text-align: left; cursor: pointer" @click="openCableChecklist">
            <div class="row items-center gap-2">
              <div class="box center icon-box" style="border-color: var(--line-2)">
                <MaterialIcon name="checklist" />
              </div>
              <div class="title-md">Cable checklist</div>
            </div>
            <div class="small">cable labels, HOP, and length</div>
          </button>
          <button type="button" class="box p-4 col gap-2" style="flex: 1 1 180px; border-style: dashed; text-align: left; cursor: pointer" @click="openPendingSummary">
            <div class="row items-center gap-2">
              <div class="box center icon-box" style="border-color: var(--line-2)">
                <MaterialIcon name="format_list_bulleted" />
              </div>
              <div class="title-md">Pending summary</div>
            </div>
            <div class="small">generate layered pending lists</div>
          </button>
        </div>
      </div>

      <div class="col gap-3">
        <div class="between">
          <div class="title-lg">Progress history</div>
          <span class="small">viewing {{ sortedReports.length }}</span>
        </div>
        <div class="box p-4 col">
          <div v-if="sortedReports.length === 0" class="small">No progress updates saved yet.</div>
          <div
            v-for="report in sortedReports.slice(0, 4)"
            :key="report.id"
            class="row items-start gap-3"
            style="padding: 12px 0; border-bottom: 1px dashed var(--line)"
          >
            <div class="mono small" style="width: 90px">{{ report.date }}</div>
            <div class="col grow gap-2">
              <div
                class="report-history-notes"
                :style="expandedReports.has(report.id) ? {} : { overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }"
                @click="toggleReport(report.id)"
                v-html="reportNotesPreviewHtml(report)"
              />
              <button
                v-if="reportHasLongNotes(report)"
                type="button"
                class="chip"
                style="align-self: flex-start; font-size: 11px"
                @click="toggleReport(report.id)"
              >
                <MaterialIcon :name="expandedReports.has(report.id) ? 'expand_less' : 'expand_more'" :size="13" />
                {{ expandedReports.has(report.id) ? 'Show less' : 'Show more' }}
              </button>
              <div class="row gap-2">
                <span class="chip chip-issue">
                  <MaterialIcon name="flag" :size="14" />
                  {{ report.linkedIssueIds?.length || 0 }}
                </span>
                <span class="chip chip-confirm">
                  <MaterialIcon name="verified" :size="14" />
                  {{ report.linkedConfirmIds?.length || 0 }}
                </span>
                <button type="button" class="chip" @click="openReportEmail(report.id)">
                  <MaterialIcon name="mail" :size="14" />
                  email draft
                </button>
              </div>
            </div>
            <div class="col gap-1" style="flex-shrink: 0; align-self: center">
              <template v-if="pendingDelete === `report-${report.id}`">
                <div class="tiny" style="color: var(--issue); text-align: center; white-space: nowrap">Delete?</div>
                <div class="row gap-1">
                  <button type="button" class="chip chip-issue" style="font-size: 11px" @click="confirmDeleteReport(report)">Yes</button>
                  <button type="button" class="chip" style="font-size: 11px" @click="cancelDelete">No</button>
                </div>
              </template>
              <button v-else type="button" class="chip" style="color: var(--ink-3)" @click="requestDelete(`report-${report.id}`)">
                <MaterialIcon name="delete" :size="14" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="row gap-4">
        <div class="col gap-3 grow" style="flex: 1 1 0%">
          <div class="between">
            <div class="title-lg">Blocker log <span class="small" style="margin-left: 8px">({{ pendingIssues?.length || 0 }} open)</span></div>
            <button type="button" class="btn btn-ghost" @click="logIssue">
              <MaterialIcon name="add" />
              Log blocker
            </button>
          </div>
          <div class="box p-4 col">
            <div v-if="!issues?.length" class="small">No blockers logged yet.</div>
            <div
              v-for="issue in issues?.slice(0, 4)"
              :key="issue.id"
              class="row items-center gap-3"
              style="padding: 10px 0; border-bottom: 1px dashed var(--line)"
            >
              <button
                type="button"
                class="row items-center gap-3 grow"
                style="border: 0; background: transparent; text-align: left; cursor: pointer; min-width: 0"
                @click="editIssue(issue.id)"
              >
                <span class="chip chip-issue mono" style="min-width: 48px; justify-content: center; flex-shrink: 0">{{ issue.code }}</span>
                <div class="col grow" style="min-width: 0">
                  <div style="font-size: 13px; font-weight: 500">{{ issue.title || 'Untitled blocker' }}</div>
                  <div class="tiny">{{ issue.date }} - {{ issue.attachmentIds?.length || 0 }} attached - priority {{ issue.priority }}</div>
                </div>
                <span class="pill" :class="issue.status === 'open' ? 'chip-issue' : 'chip-confirm'" style="border: 1.2px solid currentColor; flex-shrink: 0">{{ issue.status }}</span>
              </button>
              <div class="col gap-1" style="flex-shrink: 0; align-items: center">
                <template v-if="pendingDelete === `issue-${issue.id}`">
                  <div class="tiny" style="color: var(--issue); white-space: nowrap">Delete?</div>
                  <div class="row gap-1">
                    <button type="button" class="chip chip-issue" style="font-size: 11px" @click="confirmDeleteIssue(issue)">Yes</button>
                    <button type="button" class="chip" style="font-size: 11px" @click="cancelDelete">No</button>
                  </div>
                </template>
                <button v-else type="button" class="chip" style="color: var(--ink-3)" @click="requestDelete(`issue-${issue.id}`)">
                  <MaterialIcon name="delete" :size="14" />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="col gap-3 grow" style="flex: 1 1 0%">
          <div class="between">
            <div class="title-lg">Confirmations <span class="small" style="margin-left: 8px">({{ confirms?.length || 0 }})</span></div>
            <button type="button" class="btn btn-ghost" @click="saveConfirm">
              <MaterialIcon name="add" />
              Save confirmation
            </button>
          </div>
          <div class="box p-4 col">
            <div v-if="!confirms?.length" class="small">No confirmations yet.</div>
            <div
              v-for="confirm in confirms?.slice(0, 4)"
              :key="confirm.id"
              class="row items-center gap-3"
              style="padding: 10px 0; border-bottom: 1px dashed var(--line)"
            >
              <button
                type="button"
                class="row items-center gap-3 grow"
                style="border: 0; background: transparent; text-align: left; cursor: pointer; min-width: 0"
                @click="editConfirm(confirm.id)"
              >
                <span class="chip chip-confirm mono" style="min-width: 48px; justify-content: center; flex-shrink: 0">{{ confirm.code }}</span>
                <div class="col grow" style="min-width: 0">
                  <div style="font-size: 13px; font-weight: 500">{{ confirm.title || 'Untitled confirmation' }}</div>
                  <div class="tiny">{{ confirm.date }} - from {{ confirm.confirmedBy || 'unknown' }} - {{ confirm.attachmentIds?.length || 0 }} attached</div>
                </div>
                <span class="chip" style="flex-shrink: 0">
                  <MaterialIcon name="attach_file" :size="14" />
                  proof
                </span>
              </button>
              <div class="col gap-1" style="flex-shrink: 0; align-items: center">
                <template v-if="pendingDelete === `confirm-${confirm.id}`">
                  <div class="tiny" style="color: var(--issue); white-space: nowrap">Delete?</div>
                  <div class="row gap-1">
                    <button type="button" class="chip chip-issue" style="font-size: 11px" @click="confirmDeleteConfirm(confirm)">Yes</button>
                    <button type="button" class="chip" style="font-size: 11px" @click="cancelDelete">No</button>
                  </div>
                </template>
                <button v-else type="button" class="chip" style="color: var(--ink-3)" @click="requestDelete(`confirm-${confirm.id}`)">
                  <MaterialIcon name="delete" :size="14" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="siteStatus"
      style="position: fixed; bottom: 20px; right: 20px; z-index: 999; background: var(--ink); color: var(--paper); padding: 10px 16px; border-radius: 8px; font-size: 12px; display: flex; align-items: center; gap: 8px"
    >
      <MaterialIcon name="check_circle" :size="15" />
      {{ siteStatus }}
    </div>
  </div>
</template>

<style scoped>
.scroll {
  overflow: auto;
}

.report-history-notes {
  font-size: 13px;
  white-space: pre-wrap;
  cursor: pointer;
}

.report-history-notes:deep(div) {
  margin: 0;
}

.report-history-notes:deep(mark.report-note-highlight) {
  background: #fff1a8;
  color: inherit;
  padding: 0 2px;
  border-radius: 4px;
}
</style>
