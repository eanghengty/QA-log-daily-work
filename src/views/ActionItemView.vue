<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import { useActionItems } from '../composables/useActionItems.js'
import { useActivityLog } from '../composables/useActivityLog.js'
import { formatSiteNameWithHopReviewer } from '../lib/siteHeader.js'
import { buildSitePath } from '../lib/siteRouting.js'
import Topbar from '../components/Topbar.vue'
import AttachmentDropzone from '../components/AttachmentDropzone.vue'
import AttachmentViewer from '../components/AttachmentViewer.vue'
import MaterialIcon from '../components/MaterialIcon.vue'

const route = useRoute()
const router = useRouter()
const siteId = route.params.id
const actionItemId = computed(() => route.params.actionItemId)
const isEdit = computed(() => Boolean(actionItemId.value))

const { useSiteById } = useSites()
const { addActionItem, updateActionItem, useActionItemById } = useActionItems(siteId)
const { logAction } = useActivityLog()
const { data: site } = useSiteById(siteId)
const { data: actionItem } = useActionItemById(actionItemId.value || 0)

const form = ref(emptyForm())
const showViewer = ref(false)
const isSaving = ref(false)
const saveError = ref('')
const pageTitle = computed(() => (isEdit.value ? 'Edit action item' : 'Add action item'))
const pageSubtitle = computed(() => `${formatSiteNameWithHopReviewer(site.value, siteId)} - PE / Customer task`)

watch(
  actionItem,
  (value) => {
    if (!value) return
    form.value = {
      title: value.title || '',
      source: value.source || 'PE',
      notes: value.notes || '',
      status: value.status || 'open',
      attachmentIds: [...(value.attachmentIds || [])],
    }
  },
  { immediate: true },
)

async function save(options = {}) {
  isSaving.value = true
  saveError.value = ''
  try {
    const payload = {
      siteId,
      title: form.value.title,
      source: form.value.source,
      notes: form.value.notes,
      status: form.value.status,
      attachmentIds: [...form.value.attachmentIds],
      date: new Date().toISOString().split('T')[0],
    }

    if (isEdit.value) {
      await updateActionItem(actionItemId.value, payload)
      await logAction('Action item updated', `${payload.title || 'Untitled'} - ${siteId}`)
      router.push(buildSitePath(siteId))
      return
    }

    await addActionItem(payload)
    await logAction('Action item created', `${payload.title || 'Untitled'} - ${siteId}`)

    if (options.addAnother) {
      form.value = emptyForm()
      return
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
    source: 'PE',
    notes: '',
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
        {{ isSaving ? 'Saving...' : 'Save action item' }}
      </button>
    </Topbar>

    <div class="row gap-5 p-5 grow" style="overflow: auto">
      <div class="col gap-4 grow" style="flex: 2 1 0%">
        <div class="col gap-2">
          <div class="label">Task / action item</div>
          <input v-model="form.title" class="field" style="font-size: 14px; font-weight: 600; padding: 12px 14px" />
        </div>

        <div class="row gap-3">
          <div class="col gap-2" style="flex: 1 1 0%">
            <div class="label">From</div>
            <div class="row gap-2">
              <button type="button" class="chip" :class="{ 'chip-confirm': form.source === 'PE' }" @click="form.source = 'PE'">
                PE
                <MaterialIcon v-if="form.source === 'PE'" name="radio_button_checked" :size="14" />
              </button>
              <button type="button" class="chip" :class="{ 'chip-pending': form.source === 'Customer' }" @click="form.source = 'Customer'">
                Customer
                <MaterialIcon v-if="form.source === 'Customer'" name="radio_button_checked" :size="14" />
              </button>
            </div>
          </div>
          <div class="col gap-2" style="flex: 1 1 0%">
            <div class="label">Status</div>
            <div class="row gap-2" style="flex-wrap: wrap">
              <button type="button" class="chip" :class="{ 'chip-issue': form.status === 'open' }" @click="form.status = 'open'">
                open
                <MaterialIcon v-if="form.status === 'open'" name="radio_button_checked" :size="14" />
              </button>
              <button type="button" class="chip" :class="{ 'chip-pending': form.status === 'in progress' }" @click="form.status = 'in progress'">
                in progress
                <MaterialIcon v-if="form.status === 'in progress'" name="radio_button_checked" :size="14" />
              </button>
              <button type="button" class="chip" :class="{ 'chip-confirm': form.status === 'done' }" @click="form.status = 'done'">
                done
                <MaterialIcon v-if="form.status === 'done'" name="radio_button_checked" :size="14" />
              </button>
            </div>
          </div>
        </div>

        <div class="col gap-2">
          <div class="label">Notes / context</div>
          <textarea v-model="form.notes" class="field" style="font-size: 15px; padding: 14px; min-height: 120px; resize: none" />
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

      <div class="col gap-3" style="flex: 0 0 300px">
        <div class="box p-4 col gap-2">
          <div class="label">Action item source</div>
          <div class="small" style="color: var(--ink-2); line-height: 1.45">
            Tag each task as PE or Customer so follow-up ownership stays clear in the site record.
          </div>
        </div>
      </div>
    </div>

    <AttachmentViewer v-model="showViewer" :attachment-ids="form.attachmentIds" />
  </div>
</template>
