<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import MaterialIcon from '../components/MaterialIcon.vue'

const route = useRoute()
const router = useRouter()
const siteId = computed(() => route.params.id)
const isEdit = computed(() => Boolean(siteId.value))
const { addSite, updateSite, deleteSite, useSiteById } = useSites()
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
      code: value.code || '',
      url: value.url || '',
    }
  },
  { immediate: true }
)

async function save() {
  if (!form.value.id || !form.value.name) {
    alert('Site ID and name are required')
    return
  }

  if (isEdit.value) {
    await updateSite(siteId.value, {
      name: form.value.name,
      code: form.value.code,
      url: form.value.url,
    })
    router.push(`/site/${siteId.value}`)
    return
  }

  await addSite({
    id: form.value.id.trim(),
    name: form.value.name.trim(),
    code: form.value.code.trim(),
    url: form.value.url.trim(),
  })
  router.push('/')
}

async function removeSite() {
  if (!isEdit.value) return

  if (!confirmDelete.value) {
    confirmDelete.value = true
    return
  }

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
    code: '',
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

    <div class="col gap-4 p-5" style="max-width: 420px">
      <div class="col gap-2">
        <div class="label">Site ID</div>
        <input v-model="form.id" class="field" :disabled="isEdit" />
      </div>

      <div class="col gap-2">
        <div class="label">Name</div>
        <input v-model="form.name" class="field" />
      </div>

      <div class="col gap-2">
        <div class="label">Code</div>
        <input v-model="form.code" class="field" />
      </div>

      <div class="col gap-2">
        <div class="label">URL</div>
        <input v-model="form.url" class="field" />
      </div>

      <button type="button" class="btn btn-primary" @click="save" style="align-self: flex-start">
        <MaterialIcon name="save" />
        {{ primaryLabel }}
      </button>

      <div v-if="isEdit" class="box-dash p-3 col gap-2" style="margin-top: 12px">
        <div class="label">Remove site</div>
        <div class="small">Deletes this site and its reports, issues, confirmations, and email settings.</div>
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
