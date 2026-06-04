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

const router = useRouter()
const { logAction } = useActivityLog()
const showAddSite = ref(false)
const restoreStatus = ref('')
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

  try {
    const text = await file.text()
    await importBackup(text)
    await logAction('Full backup restored', '')
    restoreStatus.value = 'Restore complete'
    setTimeout(() => { restoreStatus.value = '' }, 3000)
  } catch (error) {
    restoreStatus.value = `Restore failed: ${error.message}`
    setTimeout(() => { restoreStatus.value = '' }, 5000)
  }
}
</script>

<template>
  <div class="col grow">
    <Topbar title="Your sites" :subtitle="subtitle">
      <button type="button" class="btn btn-ghost" @click="exportWeek">
        <MaterialIcon name="download" />
        Export week
      </button>
      <button type="button" class="btn btn-ghost" @click="backup">
        <MaterialIcon name="backup" />
        Backup
      </button>
      <button type="button" class="btn btn-ghost" @click="triggerRestore">
        <MaterialIcon name="restore" />
        Restore
      </button>
      <button type="button" class="btn btn-primary" @click="addSite">
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
  </div>
</template>
