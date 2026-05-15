<script setup>
import { ref, nextTick } from 'vue'
import { useAttachments } from '../composables/useAttachments.js'
import MaterialIcon from './MaterialIcon.vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue'])

const { addAttachment } = useAttachments()
const fileInputRef = ref(null)
const isDragOver = ref(false)
const isUploading = ref(false)

const pendingPasteFile = ref(null)
const pendingPasteName = ref('')
const pasteNameInputRef = ref(null)

async function handleFiles(files) {
  if (!files.length) return
  isUploading.value = true
  try {
    for (const file of files) {
      try {
        const id = await addAttachment(file)
        emit('update:modelValue', [...props.modelValue, id])
      } catch (err) {
        console.error('Failed to save attachment:', err)
      }
    }
  } finally {
    isUploading.value = false
  }
}

function handleDrop(event) {
  event.preventDefault()
  isDragOver.value = false
  if (isUploading.value) return
  const files = Array.from(event.dataTransfer.files)
  handleFiles(files)
}

function handlePaste(event) {
  if (isUploading.value) return
  const items = event.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (!file) continue
      event.preventDefault()
      const ext = item.type.split('/')[1] || 'png'
      pendingPasteFile.value = file
      pendingPasteName.value = `screenshot.${ext}`
      nextTick(() => {
        pasteNameInputRef.value?.focus()
        pasteNameInputRef.value?.select()
      })
      return
    }
  }
  // non-image files — attach directly without prompting
  const files = []
  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  if (files.length) { event.preventDefault(); handleFiles(files) }
}

async function confirmPasteName() {
  if (!pendingPasteFile.value) return
  const name = pendingPasteName.value.trim() || pendingPasteFile.value.name
  const renamedFile = new File([pendingPasteFile.value], name, { type: pendingPasteFile.value.type })
  pendingPasteFile.value = null
  pendingPasteName.value = ''
  await handleFiles([renamedFile])
}

function cancelPaste() {
  pendingPasteFile.value = null
  pendingPasteName.value = ''
}

function handleClick() {
  if (isUploading.value) return
  fileInputRef.value?.click()
}

function handleInputChange(event) {
  const files = Array.from(event.target.files || [])
  handleFiles(files)
  event.target.value = ''
}

function removeAttachment(id) {
  emit('update:modelValue', props.modelValue.filter((attachmentId) => attachmentId !== id))
}
</script>

<template>
  <div class="col gap-3">
    <div
      class="img-slot gap-2"
      @dragover.prevent="isDragOver = true"
      @dragleave="isDragOver = false"
      @drop="handleDrop"
      @click="handleClick"
      @paste="handlePaste"
      :style="{
        opacity: isDragOver ? 0.7 : 1,
        cursor: isUploading ? 'default' : 'pointer',
        pointerEvents: isUploading ? 'none' : 'auto',
      }"
      tabindex="0"
    >
      <template v-if="isUploading">
        <span class="spinner" />
        <span style="font-size: 11px">Uploading…</span>
      </template>
      <template v-else>
        <MaterialIcon name="upload_file" :size="18" />
        drop file or image
      </template>
    </div>
    <input ref="fileInputRef" type="file" multiple hidden @change="handleInputChange" />

    <div v-if="pendingPasteFile" class="col gap-2 p-3" style="background: var(--paper-2); border-radius: 6px; border: 1.5px dashed var(--line-2)">
      <div class="tiny" style="color: var(--ink-2); font-weight: 600">Name this screenshot</div>
      <div class="row gap-2">
        <input
          ref="pasteNameInputRef"
          v-model="pendingPasteName"
          class="field grow"
          style="font-size: 12px"
          @keydown.enter="confirmPasteName"
          @keydown.escape="cancelPaste"
        />
        <button type="button" class="btn btn-primary" style="padding: 6px 10px; font-size: 12px" @click="confirmPasteName">
          <MaterialIcon name="check" :size="14" />
          Attach
        </button>
        <button type="button" class="btn btn-ghost" style="padding: 6px 10px; font-size: 12px" @click="cancelPaste">
          <MaterialIcon name="close" :size="14" />
        </button>
      </div>
      <div class="tiny" style="color: var(--ink-3)">Press Enter to attach · Esc to cancel</div>
    </div>
    <div class="row gap-2" style="flex-wrap: wrap">
      <div
        v-for="id in modelValue"
        :key="id"
        class="chip"
        style="background: var(--paper-2); padding: 6px 10px; gap: 8px; font-size: 11px"
      >
        <span class="row items-center gap-2">
          <MaterialIcon name="attach_file" :size="14" />
          att-{{ id }}
        </span>
        <button
          type="button"
          class="center"
          style="background: none; border: none; cursor: pointer; padding: 0; color: var(--ink-3); font-weight: 600"
          @click="removeAttachment(id)"
        >
          <MaterialIcon name="close" :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--line-2);
  border-top-color: var(--ink-2);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
