<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import { useScopes } from '../composables/useScopes.js'
import { useActivityLog } from '../composables/useActivityLog.js'
import MaterialIcon from '../components/MaterialIcon.vue'

const route = useRoute()
const router = useRouter()
const siteId = computed(() => route.params.id)
const isEdit = computed(() => Boolean(siteId.value))
const { addSite, updateSite, deleteSite, useSiteById } = useSites()
const { scopes } = useScopes()
const { logAction } = useActivityLog()
const { data: site } = useSiteById(siteId.value || '')

const form = ref(emptyForm())
const confirmDelete = ref(false)
const pageTitle = computed(() => (isEdit.value ? 'Site settings' : 'Add a site'))
const primaryLabel = computed(() => (isEdit.value ? 'Save changes' : 'Add site'))

watch(
  site,
  (value) => {
    if (!value) return
    form.value = {
      id: value.id || '',
      name: value.name || '',
      scope: value.scope || '',
      comment: value.comment || '',
      url: value.url || '',
    }
  },
  { immediate: true }
)

async function save() {
  if (!form.value.id || !form.value.name) {
    alert('Site ID and site name are required')
    return
  }

  if (isEdit.value) {
    await updateSite(siteId.value, {
      name: form.value.name,
      scope: form.value.scope,
      comment: form.value.comment,
      url: form.value.url,
    })
    await logAction('Site updated', `${siteId.value} — ${form.value.name}`)
    router.push(`/site/${siteId.value}`)
    return
  }

  await addSite({
    id: form.value.id.trim(),
    name: form.value.name.trim(),
    scope: form.value.scope.trim(),
    comment: form.value.comment.trim(),
    url: form.value.url.trim(),
  })
  await logAction('Site created', `${form.value.id.trim()} — ${form.value.name.trim()}`)
  router.push('/')
}

async function removeSite() {
  if (!isEdit.value) return

  if (!confirmDelete.value) {
    confirmDelete.value = true
    return
  }

  await logAction('Site deleted', `${siteId.value} — ${site.value?.name || ''}`)
  await deleteSite(siteId.value)
  router.push('/')
}

function goBack() {
  router.push(isEdit.value ? `/site/${siteId.value}` : '/')
}

function emptyForm() {
  return {
    id: '',
    name: '',
    scope: '',
    comment: '',
    url: '',
  }
}
</script>

<template>
  <div class="col grow">
    <div class="between p-5" style="border-bottom: 1.5px solid var(--line)">
      <div class="title-xl">{{ pageTitle }}</div>
      <div class="row gap-2">
        <button type="button" class="btn btn-ghost" @click="goBack">Cancel</button>
        <button type="button" class="btn btn-primary" @click="save">
          <MaterialIcon name="save" />
          {{ primaryLabel }}
        </button>
      </div>
    </div>

    <div class="col gap-4 p-5">
      <div class="col gap-2">
        <div class="label">Site ID</div>
        <input v-model="form.id" class="field" :disabled="isEdit" />
      </div>

      <div class="col gap-2">
        <div class="label">Site name</div>
        <input v-model="form.name" class="field" />
      </div>

      <div class="col gap-2">
        <div class="label">Scope</div>
        <select v-model="form.scope" class="field" style="cursor: pointer">
          <option value="">— None —</option>
          <option v-for="s in (scopes || [])" :key="s.id" :value="s.name">{{ s.name }}</option>
        </select>
      </div>

      <div class="col gap-2">
        <div class="label">Comment</div>
        <textarea v-model="form.comment" class="field" rows="3" placeholder="Any notes about this site" style="resize: vertical" />
      </div>

      <div class="col gap-2">
        <div class="label">Location / area</div>
        <input v-model="form.url" class="field" />
      </div>

      <button type="button" class="btn btn-primary" @click="save" style="align-self: flex-start">
        <MaterialIcon name="save" />
        {{ primaryLabel }}
      </button>

      <div v-if="isEdit" class="box-dash p-3 col gap-2" style="margin-top: 12px">
        <div class="label">Remove site</div>
        <div class="small">Deletes this site and its progress updates, blockers, confirmations, checklists, cable matrix rows, and email settings.</div>
        <button
          type="button"
          class="btn"
          :class="confirmDelete ? 'chip-pending' : 'btn-ghost'"
          style="align-self: flex-start"
          @click="removeSite"
        >
          <MaterialIcon name="delete" />
          {{ confirmDelete ? 'Confirm delete' : 'Delete site' }}
        </button>
      </div>
    </div>
  </div>
</template>
