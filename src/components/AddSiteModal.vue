<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import MaterialIcon from './MaterialIcon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const router = useRouter()
const { addSite } = useSites()

const form = ref(emptyForm())

function close() {
  form.value = emptyForm()
  emit('update:modelValue', false)
}

async function save() {
  if (!form.value.id.trim() || !form.value.name.trim()) {
    alert('Site ID and site name are required')
    return
  }

  await addSite({
    id: form.value.id.trim(),
    name: form.value.name.trim(),
    scope: form.value.scope.trim(),
    comment: form.value.comment.trim(),
    url: form.value.url.trim(),
  })

  close()
  router.push(`/site/${form.value.id.trim()}`)
}

function emptyForm() {
  return { id: '', name: '', scope: '', comment: '', url: '' }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="add-site-overlay" @click.self="close">
      <div class="add-site-modal box col gap-4">
        <!-- Header -->
        <div class="between" style="align-items: center">
          <div class="title-md">Add a site</div>
          <button type="button" class="btn btn-ghost" style="padding: 4px 8px" @click="close">
            <MaterialIcon name="close" :size="20" />
          </button>
        </div>

        <!-- Form -->
        <div class="col gap-3">
          <div class="col gap-2">
            <div class="label">Site ID <span style="color: var(--ink-3); font-weight: 400">(required)</span></div>
            <input v-model="form.id" class="field" placeholder="e.g. tower-01" />
          </div>

          <div class="col gap-2">
            <div class="label">Site name <span style="color: var(--ink-3); font-weight: 400">(required)</span></div>
            <input v-model="form.name" class="field" placeholder="e.g. Tower 01 - Blacktown" />
          </div>

          <div class="col gap-2">
            <div class="label">Scope</div>
            <input v-model="form.scope" class="field" placeholder="e.g. Full build / Upgrade / Audit" />
          </div>

          <div class="col gap-2">
            <div class="label">Location / area</div>
            <input v-model="form.url" class="field" placeholder="e.g. Western Sydney" />
          </div>

          <div class="col gap-2">
            <div class="label">Comment</div>
            <textarea v-model="form.comment" class="field" rows="3" placeholder="Any notes about this site" style="resize: vertical" />
          </div>
        </div>

        <!-- Actions -->
        <div class="row gap-2" style="justify-content: flex-end">
          <button type="button" class="btn btn-ghost" @click="close">Cancel</button>
          <button type="button" class="btn btn-primary" @click="save">
            <MaterialIcon name="add" />
            Add site
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.add-site-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.add-site-modal {
  background: var(--paper);
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
}
</style>
