<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import { useScopes } from '../composables/useScopes.js'
import { useActivityLog } from '../composables/useActivityLog.js'
import { db } from '../db/index.js'
import MaterialIcon from './MaterialIcon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const router = useRouter()
const { addSite } = useSites()
const { scopes } = useScopes()
const { logAction } = useActivityLog()

const form = ref(emptyForm())
const isSaving = ref(false)
const saveError = ref('')
const idError = ref('')

function close() {
  if (isSaving.value) return
  form.value = emptyForm()
  idError.value = ''
  saveError.value = ''
  emit('update:modelValue', false)
}

async function checkIdDuplicate() {
  const id = form.value.id.trim()
  if (!id) { idError.value = ''; return }
  const existing = await db.sites.get(id)
  idError.value = existing ? 'Site ID already exists. Try a different one.' : ''
}

async function save() {
  if (!form.value.id.trim() || !form.value.name.trim() || !form.value.hopReviewer.trim()) {
    alert('Site ID, site name, and HOP reviewer are required')
    return
  }
  if (idError.value) return

  isSaving.value = true
  saveError.value = ''
  const siteId = form.value.id.trim()

  try {
    await addSite({
      id: siteId,
      name: form.value.name.trim(),
      hopReviewer: form.value.hopReviewer.trim(),
      scope: form.value.scope.trim(),
      comment: form.value.comment.trim(),
      url: form.value.url.trim(),
    })

    await logAction('Site created', `${siteId} — ${form.value.name.trim()}`)
    await new Promise((resolve) => setTimeout(resolve, 2000))

    form.value = emptyForm()
    emit('update:modelValue', false)
    router.push(`/site/${siteId}`)
  } catch (err) {
    saveError.value = err.name === 'ConstraintError'
      ? 'Site ID already exists. Try a different one.'
      : 'Failed to save. Please try again.'
  } finally {
    isSaving.value = false
  }
}

function emptyForm() {
  return { id: '', name: '', hopReviewer: '', scope: '', comment: '', url: '' }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="add-site-overlay" @click.self="close">
      <div class="add-site-modal box col gap-4">
        <!-- Header -->
        <div class="between" style="align-items: center">
          <div class="title-md">Add a site</div>
          <button type="button" class="btn btn-ghost" style="padding: 4px 8px" :disabled="isSaving" @click="close">
            <MaterialIcon name="close" :size="20" />
          </button>
        </div>

        <!-- Form -->
        <div class="col gap-3">
          <div class="col gap-2">
            <div class="label">Site ID <span style="color: var(--ink-3); font-weight: 400">(required)</span></div>
            <input
              v-model="form.id"
              class="field"
              placeholder="e.g. tower-01"
              :disabled="isSaving"
              @input="idError = ''; saveError = ''"
              @blur="checkIdDuplicate"
            />
            <div v-if="idError" class="tiny" style="color: var(--issue)">{{ idError }}</div>
            <div v-else-if="saveError" class="tiny" style="color: var(--issue)">{{ saveError }}</div>
          </div>

          <div class="col gap-2">
            <div class="label">Site name <span style="color: var(--ink-3); font-weight: 400">(required)</span></div>
            <input v-model="form.name" class="field" placeholder="e.g. Tower 01 - Blacktown" :disabled="isSaving" />
          </div>

          <div class="col gap-2">
            <div class="label">HOP reviewer <span style="color: var(--ink-3); font-weight: 400">(required)</span></div>
            <input v-model="form.hopReviewer" class="field" placeholder="e.g. Alex Tan" :disabled="isSaving" />
          </div>

          <div class="col gap-2">
            <div class="label">Scope</div>
            <select v-model="form.scope" class="field" :disabled="isSaving" style="cursor: pointer">
              <option value="">— None —</option>
              <option v-for="s in (scopes || [])" :key="s.id" :value="s.name">{{ s.name }}</option>
            </select>
          </div>

          <div class="col gap-2">
            <div class="label">Location / area</div>
            <input v-model="form.url" class="field" placeholder="e.g. Western Sydney" :disabled="isSaving" />
          </div>

          <div class="col gap-2">
            <div class="label">Comment</div>
            <textarea v-model="form.comment" class="field" rows="3" placeholder="Any notes about this site" style="resize: vertical" :disabled="isSaving" />
          </div>
        </div>

        <!-- Saving status -->
        <div v-if="isSaving" class="row items-center gap-2" style="color: var(--confirm); font-size: 12px">
          <span class="spinner" />
          Setting up site…
        </div>

        <!-- Actions -->
        <div class="row gap-2" style="justify-content: flex-end">
          <button type="button" class="btn btn-ghost" :disabled="isSaving" @click="close">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="isSaving" @click="save">
            <span v-if="isSaving" class="spinner spinner-light" />
            <MaterialIcon v-else name="add" />
            {{ isSaving ? 'Adding…' : 'Add site' }}
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

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(0, 0, 0, 0.2);
  border-top-color: var(--ink-2);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
  display: inline-block;
}

.spinner-light {
  border-color: rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
