<script setup>
import { ref } from 'vue'
import { useAttachments } from '../composables/useAttachments.js'
import MaterialIcon from './MaterialIcon.vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue'])

const { addAttachment } = useAttachments()
const fileInputRef = ref(null)
const isDragOver = ref(false)

async function handleFiles(files) {
  for (const file of files) {
    try {
      const id = await addAttachment(file)
      emit('update:modelValue', [...props.modelValue, id])
    } catch (err) {
      console.error('Failed to save attachment:', err)
    }
  }
}

function handleDrop(event) {
  event.preventDefault()
  isDragOver.value = false
  const files = Array.from(event.dataTransfer.files)
  handleFiles(files)
}

function handlePaste(event) {
  const items = event.clipboardData?.items
  if (!items) return
  const files = []
  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  if (files.length) {
    event.preventDefault()
    handleFiles(files)
  }
}

function handleClick() {
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
      :style="{ opacity: isDragOver ? 0.7 : 1, cursor: 'pointer' }"
      tabindex="0"
    >
      <MaterialIcon name="upload_file" :size="18" />
      drop file or image
    </div>
    <input
      ref="fileInputRef"
      type="file"
      multiple
      hidden
      @change="handleInputChange"
    />
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
