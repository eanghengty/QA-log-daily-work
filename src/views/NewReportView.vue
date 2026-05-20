<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import { useReports } from '../composables/useReports.js'
import { useIssues } from '../composables/useIssues.js'
import { useConfirms } from '../composables/useConfirms.js'
import { useActivityLog } from '../composables/useActivityLog.js'
import { formatSiteNameWithHopReviewer } from '../lib/siteHeader.js'
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
      linkedIssueIds: [...(value.linkedIssueIds || [])],
      linkedConfirmIds: [...(value.linkedConfirmIds || [])],
      attachmentIds: [...(value.attachmentIds || [])],
    }
  },
  { immediate: true }
)

async function save(options = {}) {
  const payload = {
    siteId,
    date: form.value.date || today,
    time: form.value.time || currentTime(),
    notes: form.value.notes,
    linkedIssueIds: [...form.value.linkedIssueIds],
    linkedConfirmIds: [...form.value.linkedConfirmIds],
    attachmentIds: [...form.value.attachmentIds],
  }

  const savedId = isEdit.value
    ? Number(reportId.value)
    : await addReport(payload)

  if (isEdit.value) {
    await updateReport(Number(reportId.value), payload)
    await logAction('Progress update edited', `${payload.date} — ${siteId}`)
  } else {
    await logAction('Progress update created', `${payload.date} — ${siteId}`)
  }

  if (options.generateEmail) {
    router.push(`/site/${siteId}/report/${savedId}/email`)
    return
  }

  router.push(`/site/${siteId}`)
}

function goBack() {
  router.push(`/site/${siteId}`)
}

function logIssue() {
  router.push(`/site/${siteId}/issue/new`)
}

function saveConfirm() {
  router.push(`/site/${siteId}/confirm/new`)
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
          <textarea
            v-model="form.notes"
            class="field grow"
            style="font-family: 'Patrick Hand', cursive; font-size: 16px; padding: 16px; min-height: 240px; resize: none"
          />
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
