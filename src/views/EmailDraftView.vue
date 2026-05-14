<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import { useReports } from '../composables/useReports.js'
import { useIssues } from '../composables/useIssues.js'
import { useAttachments } from '../composables/useAttachments.js'
import {
  buildEmailBody,
  buildEmailSubject,
  copyToClipboard,
  downloadEml,
  generateEml,
} from '../lib/email.js'
import MaterialIcon from '../components/MaterialIcon.vue'

const route = useRoute()
const router = useRouter()
const siteId = route.params.id
const reportId = route.params.reportId

const { useSiteById } = useSites()
const { useReportById } = useReports(siteId)
const { issues } = useIssues(siteId)
const { getAttachmentsByIds } = useAttachments()
const { data: site } = useSiteById(siteId)
const { data: report } = useReportById(reportId)

const settings = ref({
  includeIssues: true,
  includeConfirms: true,
  attachScreenshots: true,
})
const subject = ref('')
const bodyHtml = ref('')
const status = ref('')

const linkedIssues = computed(() => {
  const ids = report.value?.linkedIssueIds || []
  return (issues.value || []).filter((issue) => ids.includes(issue.id))
})

watch(
  [report, site, settings, linkedIssues],
  async () => {
    if (!report.value || !site.value) return
    bodyHtml.value = await buildEmailBody(report.value, site.value, settings.value)
    subject.value = buildEmailSubject(site.value, report.value, linkedIssues.value)
  },
  { immediate: true, deep: true }
)

function goBack() {
  router.push(`/site/${siteId}/report/${reportId}/edit`)
}

async function copyDraft() {
  await copyToClipboard(`${subject.value}\n\n${bodyHtml.value}`)
  status.value = 'Copied to clipboard'
}

async function downloadDraft() {
  if (!report.value || !site.value) return

  const attachments = settings.value.attachScreenshots
    ? (await getAttachmentsByIds(report.value.attachmentIds || [])).filter(Boolean)
    : []
  const blob = await generateEml({
    to: '',
    cc: '',
    from: 'site-tracker@local',
    subject: subject.value,
    htmlBody: bodyHtml.value,
    attachments,
  })

  downloadEml(blob, `${site.value.id || siteId}-progress-${report.value.date}.eml`)
  status.value = 'Draft downloaded'
}
</script>

<template>
  <div class="col grow">
    <div class="between p-5" style="border-bottom: 1.5px solid var(--line)">
      <div class="col gap-2">
        <div class="title-xl">Email draft</div>
        <div class="small">{{ subject || 'No report selected' }}</div>
      </div>
      <div class="row gap-2">
        <button type="button" class="btn btn-ghost" @click="goBack">
          <MaterialIcon name="edit" />
          Edit report
        </button>
        <button type="button" class="btn" :disabled="!bodyHtml" @click="copyDraft">
          <MaterialIcon name="content_copy" />
          Copy to clipboard
        </button>
        <button type="button" class="btn btn-primary" :disabled="!bodyHtml" @click="downloadDraft">
          <MaterialIcon name="download" />
          Download .eml
        </button>
      </div>
    </div>

    <div class="row gap-5 p-5 grow" style="overflow: auto">
      <div class="col gap-3" style="width: 260px">
        <div class="box p-4 col gap-3">
          <div class="label">Include</div>
          <label class="row items-center gap-2 small">
            <input v-model="settings.includeIssues" type="checkbox" />
            Open blockers
          </label>
          <label class="row items-center gap-2 small">
            <input v-model="settings.includeConfirms" type="checkbox" />
            Approvals
          </label>
          <label class="row items-center gap-2 small">
            <input v-model="settings.attachScreenshots" type="checkbox" />
            Field attachments
          </label>
        </div>
        <div v-if="status" class="chip chip-confirm">
          <MaterialIcon name="check_circle" :size="14" />
          {{ status }}
        </div>
      </div>

      <div class="col grow gap-3">
        <div v-if="!report" class="box p-4 small">Report not found.</div>
        <div v-else class="box p-4 col gap-3">
          <div class="label">Preview</div>
          <div v-html="bodyHtml" />
        </div>
      </div>
    </div>
  </div>
</template>
