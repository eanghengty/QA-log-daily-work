<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import { useReports } from '../composables/useReports.js'
import { useIssues } from '../composables/useIssues.js'
import { useConfirms } from '../composables/useConfirms.js'
import { exportSite, importSite } from '../lib/backup.js'
import { useActivityLog } from '../composables/useActivityLog.js'
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
const topbarTitle = computed(() =>
  site.value ? `${site.value.code || ''} ${site.value.name}`.trim() : 'Site'
)
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

async function handleExportSite() {
  await exportSite(siteId)
  await logAction('Site exported', `${siteId} — ${site.value?.name || ''}`)
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

  if (!window.confirm(`Import will replace all data for "${site.value?.name}". Your current data will be exported first as a backup. Continue?`)) return

  try {
    await exportSite(siteId)
    await importSite(data)
    await logAction('Site imported', `${siteId} — ${site.value?.name || ''}`)
    siteStatus.value = 'Imported successfully — current data was backed up first.'
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
</script>

<template>
  <div class="col grow scroll" style="overflow: auto">
    <input ref="importFileRef" type="file" accept=".json" hidden @change="handleImportFile" />
    <Topbar :title="topbarTitle" :subtitle="topbarSubtitle">
      <button type="button" class="btn btn-ghost" @click="triggerImportSite">
        <MaterialIcon name="upload" />
        Import
      </button>
      <button type="button" class="btn btn-ghost" @click="handleExportSite">
        <MaterialIcon name="download" />
        Export
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
                style="font-size: 13px; white-space: pre-wrap; cursor: pointer"
                :style="expandedReports.has(report.id) ? {} : { overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }"
                @click="toggleReport(report.id)"
              >{{ report.notes || 'No notes captured.' }}</div>
              <button
                v-if="report.notes && report.notes.split('\n').length > 3 || (report.notes && report.notes.length > 160)"
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
</style>
