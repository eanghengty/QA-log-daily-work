<script setup>
import { ref, computed } from 'vue'
import { useConfirmSources } from '../composables/useConfirmSources.js'
import { useActivityLog } from '../composables/useActivityLog.js'
import MaterialIcon from './MaterialIcon.vue'

defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])

const { confirmSources, addConfirmSource, deleteConfirmSource } = useConfirmSources()
const { logAction } = useActivityLog()

const newName = ref('')
const addError = ref('')

const trimmed = computed(() => newName.value.trim())

function close() { emit('update:modelValue', false) }

async function add() {
  if (!trimmed.value) return
  const duplicate = (confirmSources.value || []).some((s) => s.name.toLowerCase() === trimmed.value.toLowerCase())
  if (duplicate) { addError.value = 'Source already exists.'; return }
  addError.value = ''
  await addConfirmSource(trimmed.value)
  await logAction('Confirmation source added', trimmed.value)
  newName.value = ''
}

function handleKeydown(e) {
  if (e.key === 'Enter') add()
}

async function removeSource(source) {
  await deleteConfirmSource(source.id)
  await logAction('Confirmation source deleted', source.name)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="cs-overlay" @click.self="close">
      <div class="cs-modal box col gap-4">
        <div class="between" style="align-items: center">
          <div class="title-md">Confirmation sources</div>
          <button type="button" class="btn btn-ghost" style="padding: 4px 8px" @click="close">
            <MaterialIcon name="close" :size="20" />
          </button>
        </div>

        <div class="col gap-1">
          <div v-if="!confirmSources?.length" class="small" style="color: var(--ink-3)">No sources yet. Add one below.</div>
          <div
            v-for="source in confirmSources"
            :key="source.id"
            class="between items-center"
            style="padding: 8px 0; border-bottom: 1px dashed var(--line)"
          >
            <span class="small">{{ source.name }}</span>
            <button
              type="button"
              class="chip"
              style="color: var(--ink-3); padding: 3px 6px"
              @click="removeSource(source)"
            >
              <MaterialIcon name="delete" :size="13" />
            </button>
          </div>
        </div>

        <div class="col gap-2">
          <div class="label">Add source</div>
          <div class="row gap-2">
            <input
              v-model="newName"
              class="field grow"
              placeholder="e.g. WhatsApp"
              @input="addError = ''"
              @keydown="handleKeydown"
            />
            <button type="button" class="btn btn-primary" :disabled="!trimmed" @click="add">
              <MaterialIcon name="add" />
              Add
            </button>
          </div>
          <div v-if="addError" class="tiny" style="color: var(--issue)">{{ addError }}</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cs-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.cs-modal {
  background: var(--paper);
  width: 100%;
  max-width: 380px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 24px;
}
</style>
