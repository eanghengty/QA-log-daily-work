<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import { useReports } from '../composables/useReports.js'
import { useIssues } from '../composables/useIssues.js'
import { useAttachments } from '../composables/useAttachments.js'
import { useEmailSettings } from '../composables/useEmailSettings.js'
import { formatSiteNameWithHopReviewer } from '../lib/siteHeader.js'
import {
  buildEmailBody,
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
const { getAttachmentsByIds } = useAttachments()
const { getEmailSettings, saveEmailSettings } = useEmailSettings()
const { data: site } = useSiteById(siteId)
const { data: report } = useReportById(reportId)
const { issues } = useIssues(siteId)

const settings = ref({ includeIssues: true, includeConfirms: true, attachScreenshots: true })
const subject = ref('')
const to = ref('')
const cc = ref('')
const bodyHtml = ref('')
const status = ref('')
const bodyInitialised = ref(false)
const bodyUserEdited = ref(false)

watch(
  [report, site],
  async () => {
    if (!report.value || !site.value) return
    const saved = await getEmailSettings(siteId)
    if (saved.to) to.value = saved.to
    if (saved.cc) cc.value = saved.cc
    const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Phnom_Penh' })
    if (saved.defaultSubject) {
      const prefix = saved.defaultSubject.replace(/\s*-\s*\d{1,2}\s+\w+\s+\d{4}$/, '').trim()
      subject.value = `${prefix} - ${today}`
    } else {
      subject.value = `[${site.value.code || site.value.id}] Progress update - ${today}`
    }
  },
  { immediate: true },
)

watch(
  [report, site, settings],
  async () => {
    if (!report.value || !site.value) return
    const generated = await buildEmailBody(report.value, site.value, settings.value)
    if (!bodyInitialised.value || !bodyUserEdited.value) {
      bodyHtml.value = generated
      bodyInitialised.value = true
    }
  },
  { immediate: true, deep: true },
)

function goBack() {
  router.push(`/site/${siteId}/report/${reportId}/edit`)
}

function openEmailSettings() {
  router.push(`/site/${siteId}/email-settings`)
}

async function resetBody() {
  if (!report.value || !site.value) return
  bodyHtml.value = await buildEmailBody(report.value, site.value, settings.value)
  bodyUserEdited.value = false
}

async function saveDefaults() {
  const prefix = subject.value.replace(/\s*-\s*\d{1,2}\s+\w+\s+\d{4}$/, '').trim()
  await saveEmailSettings(siteId, { to: to.value, cc: cc.value, defaultSubject: prefix })
  status.value = 'Defaults saved'
  setTimeout(() => { status.value = '' }, 2500)
}

async function copyDraft() {
  await copyToClipboard(`Subject: ${subject.value}\nTo: ${to.value}\nCc: ${cc.value}\n\n${bodyHtml.value}`)
  status.value = 'Copied to clipboard'
  setTimeout(() => { status.value = '' }, 2500)
}

async function downloadDraft() {
  if (!report.value || !site.value) return
  const attachments = settings.value.attachScreenshots
    ? (await getAttachmentsByIds(report.value.attachmentIds || [])).filter(Boolean)
    : []
  const blob = await generateEml({
    to: to.value,
    cc: cc.value,
    from: 'site-tracker@local',
    subject: subject.value,
    htmlBody: bodyHtml.value,
    attachments,
  })
  downloadEml(blob, `${site.value.id || siteId}-progress-${report.value.date}.eml`)
  status.value = 'Draft downloaded'
  setTimeout(() => { status.value = '' }, 2500)
}
</script>

<template>
  <div class="col grow">
    <div class="between p-5" style="border-bottom: 1.5px solid var(--line)">
      <div class="col gap-1">
        <div class="title-xl">Email draft</div>
        <div class="small" style="color: var(--ink-3)">{{ formatSiteNameWithHopReviewer(site, siteId) }}</div>
      </div>
      <div class="row gap-2">
        <button type="button" class="btn btn-ghost" @click="router.push(`/site/${siteId}`)">
          <MaterialIcon name="arrow_back" />
          Back to site
        </button>
        <button type="button" class="btn btn-ghost" @click="goBack">
          <MaterialIcon name="edit" />
          Edit report
        </button>
        <button type="button" class="btn btn-ghost" @click="openEmailSettings">
          <MaterialIcon name="manage_accounts" />
          Email settings
        </button>
        <button type="button" class="btn" :disabled="!bodyHtml" @click="copyDraft">
          <MaterialIcon name="content_copy" />
          Copy
        </button>
        <button type="button" class="btn btn-primary" :disabled="!bodyHtml" @click="downloadDraft">
          <MaterialIcon name="download" />
          Download .eml
        </button>
      </div>
    </div>

    <div class="row gap-5 p-5 grow" style="overflow: auto">
      <div class="col gap-3" style="flex: 0 0 300px">
        <div class="box p-4 col gap-3">
          <div class="label">Recipients</div>

          <div class="col gap-1">
            <div class="tiny" style="color: var(--ink-3)">To</div>
            <input
              v-model="to"
              class="field"
              type="text"
              placeholder="email@example.com, ..."
            />
          </div>

          <div class="col gap-1">
            <div class="tiny" style="color: var(--ink-3)">CC</div>
            <input
              v-model="cc"
              class="field"
              type="text"
              placeholder="email@example.com, ..."
            />
          </div>
        </div>

        <div class="box p-4 col gap-3">
          <div class="label">Include</div>
          <label class="row items-center gap-2 small">
            <input v-model="settings.includeIssues" type="checkbox" />
            Open blockers
          </label>
          <label class="row items-center gap-2 small">
            <input v-model="settings.includeConfirms" type="checkbox" />
            Confirmations
          </label>
          <label class="row items-center gap-2 small">
            <input v-model="settings.attachScreenshots" type="checkbox" />
            Field attachments
          </label>
        </div>

        <button type="button" class="btn btn-ghost" @click="saveDefaults">
          <MaterialIcon name="save" />
          Save as default
        </button>

        <div v-if="status" class="chip chip-confirm">
          <MaterialIcon name="check_circle" :size="14" />
          {{ status }}
        </div>
      </div>

      <div class="col grow gap-3">
        <div v-if="!report" class="box p-4 small">Report not found.</div>
        <template v-else>
          <div class="box p-4 col gap-3">
            <div class="label">Subject</div>
            <input
              v-model="subject"
              class="field"
              type="text"
              placeholder="Enter email subject..."
            />
          </div>

          <div class="box p-4 col gap-3">
            <div class="between">
              <div class="label">Email body</div>
              <button type="button" class="chip" style="font-size: 11px" @click="resetBody">
                <MaterialIcon name="refresh" :size="12" />
                Reset
              </button>
            </div>
            <div
              contenteditable="true"
              style="min-height: 160px; outline: none; font-size: 13px; line-height: 1.6; white-space: pre-wrap"
              v-html="bodyHtml"
              @input="bodyHtml = $event.target.innerHTML; bodyUserEdited = true"
            />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
