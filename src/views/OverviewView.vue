<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import { useTrackerStats } from '../composables/useTrackerStats.js'
import Topbar from '../components/Topbar.vue'
import StatCard from '../components/StatCard.vue'
import MaterialIcon from '../components/MaterialIcon.vue'
import AddSiteModal from '../components/AddSiteModal.vue'
import { exportBackup, importBackup } from '../lib/backup.js'
import { buildSitePath } from '../lib/siteRouting.js'
import { useActivityLog } from '../composables/useActivityLog.js'
import { refreshCloudBackedTrackerData } from '../composables/useRealtime.js'

const router = useRouter()
const { logAction } = useActivityLog()
const showAddSite = ref(false)
const restoreStatus = ref('')
const isRestoring = ref(false)
const { sites } = useSites()
const {
  reports,
  pendingTotal,
  confirmsTotal,
  reportsThisWeek,
  sitesUpdatedThisWeek,
} = useTrackerStats()

const siteRows = computed(() =>
  (sites.value || []).map((site) => {
    const siteReports = (reports.value || [])
      .filter((report) => report.siteId === site.id)
      .sort(compareReportsDesc)
    const lastReport = siteReports[0]

    return {
      ...site,
      lastReportLabel: lastReport ? formatDate(lastReport.date) : 'No updates',
      statusLabel: getStatusLabel(site.pending),
    }
  })
)

const subtitle = computed(() => {
  const count = siteRows.value.length
  const label = count === 1 ? 'site tracked' : 'sites tracked'
  return `${count} ${label} - ${reportsThisWeek.value} updates this week`
})

function goToSite(siteId) {
  router.push(buildSitePath(siteId))
}

function addSite() {
  showAddSite.value = true
}

function newReport(siteId) {
  router.push(buildSitePath(siteId, '/report/new'))
}

function exportWeek() {
  const header = ['Site', 'Location / area', 'Last update', 'Open blockers', 'Confirmations', 'Status']
  const rows = siteRows.value.map((site) => [
    site.name,
    site.url || '',
    site.lastReportLabel,
    site.pending || 0,
    site.confirms || 0,
    site.statusLabel,
  ])
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `site-progress-week-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function compareReportsDesc(a, b) {
  return `${b.date || ''} ${b.time || ''}`.localeCompare(`${a.date || ''} ${a.time || ''}`)
}

function formatDate(dateString) {
  if (!dateString) return 'No updates'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return 'No updates'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date)
}

function getStatusLabel(pending) {
  if (!pending) return 'on track'
  if (pending >= 5) return 'blocked'
  return 'watching'
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

async function backup() {
  await exportBackup()
  await logAction('Full backup exported', '')
}

function triggerRestore() {
  if (isRestoring.value) return
  document.getElementById('restore-file-input').click()
}

async function handleRestoreFile(event) {
  const file = event.target.files[0]
  if (!file) return
  event.target.value = ''

  const confirmed = window.confirm(
    'This will replace ALL existing data with the backup. This cannot be undone. Continue?',
  )
  if (!confirmed) return

  isRestoring.value = true
  restoreStatus.value = ''

  try {
    const text = await file.text()
    const result = await importBackup(text)
    await refreshCloudBackedTrackerData('full-backup-restore')
    const remapDetail = formatSiteIdRemaps(result?.remappedSiteIds)
    const attachmentDetail = formatAttachmentRestoreStatus(result)
    await logAction('Full backup restored', remapDetail)
    restoreStatus.value = [
      'Restore complete.',
      attachmentDetail,
      remapDetail ? `Renamed legacy Site IDs: ${remapDetail}` : '',
    ].filter(Boolean).join(' ')
    setTimeout(() => { restoreStatus.value = '' }, remapDetail ? 8000 : 3000)
  } catch (error) {
    restoreStatus.value = `Restore failed: ${error.message}`
    setTimeout(() => { restoreStatus.value = '' }, 5000)
  } finally {
    isRestoring.value = false
  }
}

function formatSiteIdRemaps(remappedSiteIds = []) {
  return remappedSiteIds
    .map((item) => `${item.from} -> ${item.to}`)
    .join(', ')
}

function formatAttachmentRestoreStatus(result = {}) {
  if (!result.attachmentsExpected) return ''

  return `${result.attachmentsRestored || 0}/${result.attachmentsExpected} attachment files restored.`
}
</script>

<template>
  <div class="col grow">
    <Topbar title="Your sites" :subtitle="subtitle">
      <button type="button" class="btn btn-ghost" @click="exportWeek">
        <MaterialIcon name="download" />
        Export week
      </button>
      <button type="button" class="btn btn-ghost" :disabled="isRestoring" @click="backup">
        <MaterialIcon name="backup" />
        Backup
      </button>
      <button type="button" class="btn btn-ghost" :disabled="isRestoring" @click="triggerRestore">
        <span v-if="isRestoring" class="restore-button-spinner" />
        <MaterialIcon v-else name="restore" />
        {{ isRestoring ? 'Restoring' : 'Restore' }}
      </button>
      <button type="button" class="btn btn-primary" :disabled="isRestoring" @click="addSite">
        <MaterialIcon name="add" />
        Add site
      </button>
    </Topbar>

    <div class="col gap-5 p-5 grow" style="overflow: auto">
      <div class="row gap-3">
        <StatCard label="Sites tracked" :value="siteRows.length || 0" />
        <StatCard
          label="Open blockers"
          :value="pendingTotal"
          accent="var(--issue)"
          :sub="`across ${siteRows.filter((site) => site.pending > 0).length} sites`"
        />
        <StatCard label="Confirmations" :value="confirmsTotal" accent="var(--confirm)" sub="all time" />
        <StatCard
          label="Updates this week"
          :value="reportsThisWeek"
          :sub="`${sitesUpdatedThisWeek} sites updated`"
        />
      </div>

      <div class="box col" style="overflow: hidden">
        <div class="row" style="padding: 10px 16px; background: var(--paper-2); border-bottom: 1.5px solid var(--line)">
          <div class="label" style="flex: 2 1 0%">Site</div>
          <div class="label" style="flex: 1 1 0%">Last update</div>
          <div class="label" style="flex: 1 1 0%">Open blockers</div>
          <div class="label" style="flex: 1 1 0%">Confirmations</div>
          <div class="label" style="flex: 1 1 0%">Status</div>
          <div class="label" style="width: 110px">Quick</div>
        </div>

        <div
          v-if="siteRows.length === 0"
          class="col center gap-3"
          style="padding: 44px 20px; color: var(--ink-3)"
        >
          <MaterialIcon name="domain_add" :size="32" />
          <div class="title-md">No sites yet</div>
          <button type="button" class="btn btn-primary" @click="addSite">
            <MaterialIcon name="add" />
            Add first site
          </button>
        </div>

        <div
          v-for="site in siteRows"
          :key="site.id"
          class="row items-center"
          style="padding: 12px 16px; border-bottom: 1px dashed var(--line); cursor: pointer"
          @click="goToSite(site.id)"
        >
          <div class="row items-center gap-3" style="flex: 2 1 0%">
            <div class="box center mono" style="width: 30px; height: 30px; font-size: 11px; background: var(--paper-2)">
              {{ site.code || site.name?.slice(0, 2).toUpperCase() }}
            </div>
            <div class="col">
              <div class="title-md">{{ site.name }}</div>
              <div class="tiny">{{ site.url || site.id }}</div>
            </div>
          </div>
          <div style="flex: 1 1 0%" class="small">{{ site.lastReportLabel }}</div>
          <div style="flex: 1 1 0%">
            <span class="chip" :class="{ 'chip-issue': site.pending > 0 }">
              <MaterialIcon name="flag" :size="14" />
              {{ site.pending || 0 }}
            </span>
          </div>
          <div style="flex: 1 1 0%">
            <span class="chip chip-confirm">
              <MaterialIcon name="verified" :size="14" />
              {{ site.confirms || 0 }}
            </span>
          </div>
          <div style="flex: 1 1 0%">
            <span
              class="pill"
              :class="site.pending === 0 ? 'chip-confirm' : site.pending >= 5 ? 'chip-pending' : 'chip-issue'"
              style="border: 1.2px solid currentColor"
            >
              {{ site.statusLabel }}
            </span>
          </div>
          <div style="width: 110px" class="row gap-2">
            <button
              type="button"
              class="btn"
              style="padding: 3px 8px; font-size: 11px"
              @click.stop="newReport(site.id)"
            >
              <MaterialIcon name="note_add" :size="14" />
              Update
            </button>
          </div>
        </div>
      </div>
    </div>

    <AddSiteModal v-model="showAddSite" />

    <input
      id="restore-file-input"
      type="file"
      accept=".json"
      style="display: none"
      @change="handleRestoreFile"
    />

    <div
      v-if="restoreStatus"
      class="chip"
      :class="restoreStatus.startsWith('Restore failed') ? 'chip-issue' : 'chip-confirm'"
      style="position: fixed; bottom: 20px; right: 20px; z-index: 100; padding: 8px 14px"
    >
      <MaterialIcon :name="restoreStatus.startsWith('Restore failed') ? 'error' : 'check_circle'" :size="14" />
      {{ restoreStatus }}
    </div>

    <div v-if="isRestoring" class="restore-overlay" role="status" aria-live="polite">
      <div class="restore-panel box col gap-3">
        <span class="restore-spinner" />
        <div class="title-md">Restoring backup</div>
        <div class="small">Please keep this page open while the tracker data and attachments are restored.</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.restore-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(247, 243, 232, 0.78);
  backdrop-filter: blur(2px);
}

.restore-panel {
  width: min(340px, 100%);
  align-items: center;
  padding: 26px;
  text-align: center;
  background: var(--paper);
}

.restore-spinner,
.restore-button-spinner {
  border-radius: 50%;
  border-style: solid;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

.restore-spinner {
  width: 34px;
  height: 34px;
  border-width: 3px;
  border-color: var(--line-2);
  border-top-color: var(--ink);
}

.restore-button-spinner {
  width: 14px;
  height: 14px;
  border-width: 2px;
  border-color: var(--line-2);
  border-top-color: var(--ink);
}
</style>
