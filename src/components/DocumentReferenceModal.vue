<script setup>
import { computed, ref } from 'vue'
import { useDocumentReferences } from '../composables/useDocumentReferences.js'
import { useActivityLog } from '../composables/useActivityLog.js'
import MaterialIcon from './MaterialIcon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  siteId: { type: String, required: true },
})

const emit = defineEmits(['update:modelValue'])

const { documentReferences, addDocumentReference, deleteDocumentReference } = useDocumentReferences(props.siteId)
const { logAction } = useActivityLog()

const form = ref(emptyForm())
const error = ref('')

const canSave = computed(() => form.value.title.trim() && form.value.link.trim())

function close() {
  form.value = emptyForm()
  error.value = ''
  emit('update:modelValue', false)
}

async function save() {
  if (!canSave.value) {
    error.value = 'Title and link are required.'
    return
  }

  const normalizedLink = normalizeLink(form.value.link)
  await addDocumentReference({
    title: form.value.title,
    link: normalizedLink,
  })
  await logAction('Document reference added', `${form.value.title.trim()} - ${props.siteId}`)
  form.value = emptyForm()
  error.value = ''
}

async function removeReference(reference) {
  await deleteDocumentReference(reference.id)
  await logAction('Document reference deleted', `${reference.title} - ${props.siteId}`)
}

function emptyForm() {
  return {
    title: '',
    link: '',
  }
}

function normalizeLink(link) {
  const value = link.trim()
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) return value
  return `https://${value}`
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="dr-overlay" @click.self="close">
      <div class="dr-modal box col gap-4">
        <div class="between" style="align-items: center">
          <div class="title-md">Document references</div>
          <button type="button" class="btn btn-ghost" style="padding: 4px 8px" @click="close">
            <MaterialIcon name="close" :size="20" />
          </button>
        </div>

        <div class="col gap-3">
          <div class="col gap-2">
            <div class="label">Title</div>
            <input v-model="form.title" class="field" placeholder="e.g. HOP pack" @input="error = ''" />
          </div>
          <div class="col gap-2">
            <div class="label">Link</div>
            <input v-model="form.link" class="field" placeholder="e.g. sharepoint.company.com/..." @input="error = ''" />
          </div>
          <div v-if="error" class="tiny" style="color: var(--issue)">{{ error }}</div>
          <div class="row gap-2" style="justify-content: flex-end">
            <button type="button" class="btn btn-primary" :disabled="!canSave" @click="save">
              <MaterialIcon name="add_link" />
              Add reference
            </button>
          </div>
        </div>

        <div class="col gap-2">
          <div class="label">Saved links</div>
          <div v-if="!documentReferences?.length" class="small" style="color: var(--ink-3)">
            No document references saved for this site yet.
          </div>
          <div
            v-for="reference in documentReferences"
            :key="reference.id"
            class="box-dash p-3 col gap-2"
          >
            <div class="between items-center gap-2">
              <div class="title-md" style="font-size: 14px">{{ reference.title }}</div>
              <button
                type="button"
                class="chip"
                style="color: var(--ink-3); padding: 3px 6px"
                @click="removeReference(reference)"
              >
                <MaterialIcon name="delete" :size="13" />
              </button>
            </div>
            <a
              :href="reference.link"
              target="_blank"
              rel="noreferrer"
              class="small"
              style="color: var(--ink); word-break: break-all"
            >
              {{ reference.link }}
            </a>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dr-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.dr-modal {
  background: var(--paper);
  width: 100%;
  max-width: 540px;
  max-height: 85vh;
  overflow-y: auto;
  padding: 24px;
}
</style>
