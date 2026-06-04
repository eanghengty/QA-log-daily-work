<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import { useConfirms } from '../composables/useConfirms.js'
import { useActivityLog } from '../composables/useActivityLog.js'
import { useConfirmSources } from '../composables/useConfirmSources.js'
import { formatSiteNameWithHopReviewer } from '../lib/siteHeader.js'
import { buildSitePath } from '../lib/siteRouting.js'
import Topbar from '../components/Topbar.vue'
import AttachmentDropzone from '../components/AttachmentDropzone.vue'
import AttachmentViewer from '../components/AttachmentViewer.vue'
import MaterialIcon from '../components/MaterialIcon.vue'

const route = useRoute()
const router = useRouter()
const siteId = route.params.id
const confirmId = computed(() => route.params.confirmId)
const isEdit = computed(() => Boolean(confirmId.value))

const { useSiteById } = useSites()
const { addConfirm, updateConfirm, useConfirmById } = useConfirms(siteId)
const { logAction } = useActivityLog()
const { confirmSources } = useConfirmSources()
const { data: site } = useSiteById(siteId)
const { data: confirm } = useConfirmById(confirmId.value || 0)

const form = ref(emptyForm())
const showViewer = ref(false)
const isSaving = ref(false)
const saveError = ref('')
const hasAttachments = computed(() => form.value.attachmentIds.length > 0)
const pageTitle = computed(() => (isEdit.value ? 'Edit confirmation' : 'Save a confirmation'))
const pageSubtitle = computed(() => `${formatSiteNameWithHopReviewer(site.value, siteId)} - field sign-off`)

watch(
  confirm,
  (value) => {
    if (!value) return
    form.value = {
      title: value.title || '',
      source: value.source || 'Email',
      confirmedBy: value.confirmedBy || '',
      notes: value.notes || '',
      attachmentIds: [...(value.attachmentIds || [])],
    }
  },
  { immediate: true }
)

async function save() {
  if (!hasAttachments.value) {
    alert('At least one proof file is required')
    return
  }

  isSaving.value = true
  saveError.value = ''
  try {
    const payload = {
      siteId,
      title: form.value.title,
      source: form.value.source,
      confirmedBy: form.value.confirmedBy,
      notes: form.value.notes,
      reportId: null,
      resolvesIssueId: null,
      attachmentIds: [...form.value.attachmentIds],
      date: new Date().toISOString().split('T')[0],
    }

    if (isEdit.value) {
      await updateConfirm(Number(confirmId.value), payload)
      await logAction('Confirmation updated', `${payload.title || 'Untitled'} — ${siteId}`)
    } else {
      await addConfirm(payload)
      await logAction('Confirmation created', `${payload.title || 'Untitled'} — ${siteId}`)
    }

    router.push(buildSitePath(siteId))
  } catch {
    saveError.value = 'Failed to save. Please try again.'
  } finally {
    isSaving.value = false
  }
}

function goBack() {
  router.push(buildSitePath(siteId))
}

function emptyForm() {
  return {
    title: '',
    source: '',
    confirmedBy: '',
    notes: '',
    attachmentIds: [],
  }
}
</script>

<template>
  <div class="col grow">
    <Topbar :title="pageTitle" :subtitle="pageSubtitle">
      <div v-if="saveError" class="tiny" style="color: var(--issue)">{{ saveError }}</div>
      <button type="button" class="btn btn-ghost" :disabled="isSaving" @click="goBack">Cancel</button>
      <button type="button" class="btn btn-primary" :disabled="isSaving" @click="save">
        <span v-if="isSaving" class="btn-spinner" />
        <MaterialIcon v-else name="save" />
        {{ isSaving ? 'Saving…' : 'Save confirmation' }}
      </button>
    </Topbar>

    <div class="row gap-5 p-5 grow" style="overflow: auto">
      <div class="col gap-4 grow" style="flex: 2 1 0%">
        <div class="col gap-2">
          <div class="label">What was confirmed/agreed?</div>
          <input v-model="form.title" class="field" style="font-size: 14px; font-weight: 600; padding: 12px 14px" />
        </div>

        <div class="row gap-3">
          <div class="col gap-2" style="flex: 1 1 0%">
            <div class="label">Source</div>
            <div class="row gap-2" style="flex-wrap: wrap">
              <button
                v-for="src in (confirmSources || [])"
                :key="src.id"
                type="button"
                class="chip"
                :class="{ 'chip-confirm': form.source === src.name }"
                @click="form.source = src.name"
              >
                {{ src.name }}
                <MaterialIcon v-if="form.source === src.name" name="radio_button_checked" :size="14" />
              </button>
            </div>
          </div>
          <div class="col gap-2" style="flex: 1 1 0%">
            <div class="label">Confirmed by</div>
            <input v-model="form.confirmedBy" class="field" />
          </div>
        </div>

        <div class="col gap-2">
          <div class="label">Notes / context</div>
          <textarea v-model="form.notes" class="field" style="font-family: 'Patrick Hand', cursive; font-size: 15px; padding: 14px; min-height: 90px; resize: none" />
        </div>

        <div class="col gap-2">
          <div class="between">
            <div class="label">Proof - attach the evidence</div>
            <div class="row gap-2" style="align-items: center">
              <button
                v-if="form.attachmentIds.length > 0"
                type="button"
                class="btn btn-ghost"
                style="padding: 2px 8px; font-size: 12px"
                @click="showViewer = true"
              >
                <MaterialIcon name="visibility" :size="15" />
                View ({{ form.attachmentIds.length }})
              </button>
              <span class="tiny">photos, emails, files - required</span>
            </div>
          </div>
          <AttachmentDropzone v-model="form.attachmentIds" />
        </div>
      </div>

      <div class="col gap-3" style="flex: 0 0 300px">
        <div class="box p-4 col gap-2">
          <div class="label">Why confirmations matter</div>
          <div style="font-size: 12px; color: var(--ink-2); line-height: 1.45">When a supervisor, client, or crew lead signs off, capture the proof beside the note so the site history has a clear evidence trail.</div>
        </div>
      </div>
    </div>

    <AttachmentViewer v-model="showViewer" :attachment-ids="form.attachmentIds" />
  </div>
</template>
