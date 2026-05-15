<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import { useIssues } from '../composables/useIssues.js'
import Topbar from '../components/Topbar.vue'
import AttachmentDropzone from '../components/AttachmentDropzone.vue'
import AttachmentViewer from '../components/AttachmentViewer.vue'
import MaterialIcon from '../components/MaterialIcon.vue'

const route = useRoute()
const router = useRouter()
const siteId = route.params.id
const issueId = computed(() => route.params.issueId)
const isEdit = computed(() => Boolean(issueId.value))

const { useSiteById } = useSites()
const { addIssue, updateIssue, useIssueById } = useIssues(siteId)
const { data: site } = useSiteById(siteId)
const { data: issue } = useIssueById(issueId.value || 0)

const form = ref(emptyForm())
const showViewer = ref(false)
const isSaving = ref(false)
const saveError = ref('')
const pageTitle = computed(() => (isEdit.value ? 'Edit blocker' : 'Log a blocker'))
const pageSubtitle = computed(() => `${site.value?.name || siteId} - field risk or delay`)

watch(
  issue,
  (value) => {
    if (!value) return
    form.value = {
      title: value.title || '',
      priority: value.priority || 'high',
      area: value.area || '',
      environment: value.environment || '',
      steps: value.steps || '',
      status: value.status || 'open',
      attachmentIds: [...(value.attachmentIds || [])],
    }
  },
  { immediate: true }
)

async function save(options = {}) {
  isSaving.value = true
  saveError.value = ''
  try {
    const payload = {
      siteId,
      title: form.value.title,
      priority: form.value.priority,
      area: form.value.area,
      environment: form.value.environment,
      steps: form.value.steps,
      status: form.value.status,
      reportId: null,
      attachmentIds: [...form.value.attachmentIds],
      date: new Date().toISOString().split('T')[0],
    }

    if (isEdit.value) {
      await updateIssue(Number(issueId.value), payload)
      router.push(`/site/${siteId}`)
      return
    }

    await addIssue(payload)

    if (options.addAnother) {
      form.value = emptyForm()
      return
    }

    router.push(`/site/${siteId}`)
  } catch {
    saveError.value = 'Failed to save. Please try again.'
  } finally {
    isSaving.value = false
  }
}

function goBack() {
  router.push(`/site/${siteId}`)
}

function emptyForm() {
  return {
    title: '',
    priority: 'high',
    area: '',
    environment: '',
    steps: '',
    status: 'open',
    attachmentIds: [],
  }
}
</script>

<template>
  <div class="col grow">
    <Topbar :title="pageTitle" :subtitle="pageSubtitle">
      <div v-if="saveError" class="tiny" style="color: var(--issue)">{{ saveError }}</div>
      <button type="button" class="btn btn-ghost" :disabled="isSaving" @click="goBack">Cancel</button>
      <button v-if="!isEdit" type="button" class="btn" :disabled="isSaving" @click="save({ addAnother: true })">Save & add another</button>
      <button type="button" class="btn btn-primary" :disabled="isSaving" @click="save()">
        <span v-if="isSaving" class="btn-spinner" />
        <MaterialIcon v-else name="save" />
        {{ isSaving ? 'Saving…' : 'Save blocker' }}
      </button>
    </Topbar>

    <div class="row gap-5 p-5 grow" style="overflow: auto">
      <div class="col gap-4 grow" style="flex: 2 1 0%">
        <div class="col gap-2">
          <div class="label">Blocker / risk</div>
          <input v-model="form.title" class="field" style="font-size: 14px; font-weight: 600; padding: 12px 14px" />
        </div>

        <div class="row gap-3">
          <div class="col gap-2" style="flex: 1 1 0%">
            <div class="label">Priority</div>
            <div class="row gap-2">
              <button type="button" class="chip" :class="{ 'chip-pending': form.priority === 'high' }" @click="form.priority = 'high'">
                high
                <MaterialIcon v-if="form.priority === 'high'" name="radio_button_checked" :size="14" />
              </button>
              <button type="button" class="chip" :class="{ 'chip-pending': form.priority === 'med' }" @click="form.priority = 'med'">
                med
                <MaterialIcon v-if="form.priority === 'med'" name="radio_button_checked" :size="14" />
              </button>
              <button type="button" class="chip" :class="{ 'chip-pending': form.priority === 'low' }" @click="form.priority = 'low'">
                low
                <MaterialIcon v-if="form.priority === 'low'" name="radio_button_checked" :size="14" />
              </button>
            </div>
          </div>
          <div class="col gap-2" style="flex: 1 1 0%">
            <div class="label">Work area</div>
            <input v-model="form.area" class="field" />
          </div>
          <div class="col gap-2" style="flex: 1 1 0%">
            <div class="label">Site zone / crew</div>
            <input v-model="form.environment" class="field" />
          </div>
        </div>

        <div class="col gap-2">
          <div class="label">Details / impact</div>
          <textarea v-model="form.steps" class="field col gap-2" style="font-family: 'Patrick Hand', cursive; font-size: 15px; padding: 14px; min-height: 140px; resize: none" />
        </div>

        <div class="col gap-2">
          <div class="between">
            <div class="label">Field proof - photos & files</div>
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
              <span class="tiny">drag in, paste, or click</span>
            </div>
          </div>
          <AttachmentDropzone v-model="form.attachmentIds" />
        </div>
      </div>

      <div class="col gap-3" style="width: 280px">
        <div class="box p-4 col gap-3">
          <div class="label">Status</div>
          <div class="row gap-2" style="flex-wrap: wrap">
            <button type="button" class="chip" :class="{ 'chip-issue': form.status === 'open' }" @click="form.status = 'open'">
              open
              <MaterialIcon v-if="form.status === 'open'" name="radio_button_checked" :size="14" />
            </button>
            <button type="button" class="chip" :class="{ 'chip-issue': form.status === 'in review' }" @click="form.status = 'in review'">
              in review
              <MaterialIcon v-if="form.status === 'in review'" name="radio_button_checked" :size="14" />
            </button>
            <button type="button" class="chip" :class="{ 'chip-confirm': form.status === 'fixed' }" @click="form.status = 'fixed'">
              fixed
              <MaterialIcon v-if="form.status === 'fixed'" name="radio_button_checked" :size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <AttachmentViewer v-model="showViewer" :attachment-ids="form.attachmentIds" />
  </div>
</template>
