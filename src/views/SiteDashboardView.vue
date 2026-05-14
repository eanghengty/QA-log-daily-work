<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import { useReports } from '../composables/useReports.js'
import { useIssues } from '../composables/useIssues.js'
import { useConfirms } from '../composables/useConfirms.js'
import Topbar from '../components/Topbar.vue'
import StatCard from '../components/StatCard.vue'
import MaterialIcon from '../components/MaterialIcon.vue'

const route = useRoute()
const router = useRouter()
const siteId = route.params.id

const { useSiteById } = useSites()
const { data: site } = useSiteById(siteId)
const { reports } = useReports(siteId)
const { issues, pendingIssues } = useIssues(siteId)
const { confirms } = useConfirms(siteId)

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
  latestReport.value ? `last: ${formatDate(latestReport.value.date)}` : 'no reports yet'
)
const cadenceLabel = computed(() => {
  const dates = sortedReports.value
    .map((report) => new Date(report.date))
    .filter((date) => !Number.isNaN(date.getTime()))

  if (dates.length < 2) return 'n/a'

  const gaps = []
  for (let index = 0; index < dates.length - 1; index += 1) {
    const diff = Math.abs(dates[index] - dates[index + 1])
    gaps.push(diff / 86400000)
  }
  const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
  return `${average.toFixed(1)}d`
})
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
    <Topbar :title="topbarTitle" :subtitle="topbarSubtitle">
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
        New report
      </button>
    </Topbar>

    <div class="col gap-5 p-5 grow" style="overflow-y: auto">
      <div class="row gap-3">
        <StatCard label="Issues pending" :value="pendingIssues?.length || 0" accent="var(--issue)" :sub="pendingSummary" />
        <StatCard label="Confirmations" :value="confirms?.length || 0" accent="var(--confirm)" sub="all time" />
        <StatCard label="Reports this month" :value="reportsThisMonth" :sub="latestReportLabel" />
        <StatCard label="Avg. cadence" :value="cadenceLabel" sub="between reports" />
      </div>

      <div class="col gap-3">
        <div class="label">Quick actions</div>
        <div class="row gap-3" style="flex-wrap: wrap">
          <button type="button" class="box p-4 col gap-2" style="flex: 1 1 180px; text-align: left; cursor: pointer" @click="newReport">
            <div class="row items-center gap-2">
              <div class="box center icon-box">
                <MaterialIcon name="edit_note" />
              </div>
              <div class="title-md">New report</div>
            </div>
            <div class="small">free-form notes</div>
          </button>
          <button type="button" class="box p-4 col gap-2" style="flex: 1 1 180px; border-style: dashed; text-align: left; cursor: pointer" @click="logIssue">
            <div class="row items-center gap-2">
              <div class="box center icon-box" style="border-color: var(--line-2)">
                <MaterialIcon name="flag" />
              </div>
              <div class="title-md">Log issue</div>
            </div>
            <div class="small">cross-check finding</div>
          </button>
          <button type="button" class="box p-4 col gap-2" style="flex: 1 1 180px; border-style: dashed; text-align: left; cursor: pointer" @click="saveConfirm">
            <div class="row items-center gap-2">
              <div class="box center icon-box" style="border-color: var(--line-2)">
                <MaterialIcon name="verified" />
              </div>
              <div class="title-md">Save confirmation</div>
            </div>
            <div class="small">capture approval</div>
          </button>
        </div>
      </div>

      <div class="col gap-3">
        <div class="between">
          <div class="title-lg">Report history</div>
          <span class="small">viewing {{ sortedReports.length }}</span>
        </div>
        <div class="box p-4 col">
          <div v-if="sortedReports.length === 0" class="small">No reports saved yet.</div>
          <div
            v-for="report in sortedReports.slice(0, 4)"
            :key="report.id"
            class="row items-start gap-3"
            style="padding: 12px 0; border-bottom: 1px dashed var(--line)"
          >
            <div class="mono small" style="width: 90px">{{ report.date }}</div>
            <div class="col grow gap-2">
              <div style="font-size: 13px; white-space: pre-wrap">{{ report.notes || 'No notes captured.' }}</div>
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
          </div>
        </div>
      </div>

      <div class="row gap-4">
        <div class="col gap-3 grow" style="flex: 1 1 0%">
          <div class="between">
            <div class="title-lg">Issue log <span class="small" style="margin-left: 8px">({{ pendingIssues?.length || 0 }} pending)</span></div>
            <button type="button" class="btn btn-ghost" @click="logIssue">
              <MaterialIcon name="add" />
              Log issue
            </button>
          </div>
          <div class="box p-4 col">
            <div v-if="!issues?.length" class="small">No issues logged yet.</div>
            <button
              v-for="issue in issues?.slice(0, 4)"
              :key="issue.id"
              type="button"
              class="row items-center gap-3"
              style="padding: 10px 0; border: 0; border-bottom: 1px dashed var(--line); background: transparent; text-align: left; cursor: pointer"
              @click="editIssue(issue.id)"
            >
              <span class="chip chip-issue mono" style="min-width: 48px; justify-content: center">{{ issue.code }}</span>
              <div class="col grow">
                <div style="font-size: 13px; font-weight: 500">{{ issue.title || 'Untitled issue' }}</div>
                <div class="tiny">{{ issue.date }} - {{ issue.attachmentIds?.length || 0 }} attached - priority {{ issue.priority }}</div>
              </div>
              <span class="pill" :class="issue.status === 'open' ? 'chip-issue' : 'chip-confirm'" style="border: 1.2px solid currentColor">{{ issue.status }}</span>
            </button>
          </div>
        </div>
        <div class="col gap-3 grow" style="flex: 1 1 0%">
          <div class="between">
            <div class="title-lg">Confirmations <span class="small" style="margin-left: 8px">({{ confirms?.length || 0 }})</span></div>
            <button type="button" class="btn btn-ghost" @click="saveConfirm">
              <MaterialIcon name="add" />
              Save confirm
            </button>
          </div>
          <div class="box p-4 col">
            <div v-if="!confirms?.length" class="small">No confirmations captured yet.</div>
            <button
              v-for="confirm in confirms?.slice(0, 4)"
              :key="confirm.id"
              type="button"
              class="row items-center gap-3"
              style="padding: 10px 0; border: 0; border-bottom: 1px dashed var(--line); background: transparent; text-align: left; cursor: pointer"
              @click="editConfirm(confirm.id)"
            >
              <span class="chip chip-confirm mono" style="min-width: 48px; justify-content: center">{{ confirm.code }}</span>
              <div class="col grow">
                <div style="font-size: 13px; font-weight: 500">{{ confirm.title || 'Untitled confirmation' }}</div>
                <div class="tiny">{{ confirm.date }} - from {{ confirm.confirmedBy || 'unknown' }} - {{ confirm.attachmentIds?.length || 0 }} attached</div>
              </div>
              <span class="chip">
                <MaterialIcon name="attach_file" :size="14" />
                proof
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scroll {
  overflow: auto;
}
</style>
