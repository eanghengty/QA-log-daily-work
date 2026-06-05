<script setup>
import { ref, watch } from 'vue'
import { useAttachments } from '../composables/useAttachments.js'
import { hasUsableAttachmentBlob } from '../lib/attachmentBlobs.js'
import MaterialIcon from './MaterialIcon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  attachmentIds: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const { getAttachmentsByIds } = useAttachments()

const items = ref([])
const activeIndex = ref(0)
const loading = ref(false)
const missingCount = ref(0)

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) {
      revokeAll()
      items.value = []
      activeIndex.value = 0
      missingCount.value = 0
      return
    }
    loading.value = true
    const records = await getAttachmentsByIds(props.attachmentIds)
    const usableItems = records
      .filter(Boolean)
      .filter(hasUsableAttachmentBlob)
      .map((att) => ({
        ...att,
        objectUrl: URL.createObjectURL(att.blob),
        isImage: att.type?.startsWith('image/'),
      }))
    items.value = usableItems
    missingCount.value = Math.max(0, props.attachmentIds.length - usableItems.length)
    loading.value = false
  }
)

function close() {
  emit('update:modelValue', false)
}

function revokeAll() {
  items.value.forEach((item) => {
    if (item.objectUrl) URL.revokeObjectURL(item.objectUrl)
  })
}

function download(item) {
  const a = document.createElement('a')
  a.href = item.objectUrl
  a.download = item.name
  a.click()
}

function prev() {
  if (activeIndex.value > 0) activeIndex.value--
}

function next() {
  if (activeIndex.value < items.value.length - 1) activeIndex.value++
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="attachment-overlay"
      @click.self="close"
    >
      <div class="attachment-modal box col gap-3">
        <!-- Header -->
        <div class="between" style="align-items: flex-start">
          <div class="col gap-1">
            <div class="title-md">Attachments</div>
            <div v-if="items.length > 1" class="small" style="color: var(--ink-3)">
              {{ activeIndex + 1 }} / {{ items.length }}
            </div>
          </div>
          <button type="button" class="btn btn-ghost" style="padding: 4px 8px" @click="close">
            <MaterialIcon name="close" :size="20" />
          </button>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="small" style="color: var(--ink-3); text-align: center; padding: 24px 0">
          Loading…
        </div>

        <div
          v-if="!loading && missingCount > 0"
          class="chip chip-issue"
          style="align-items: flex-start; padding: 10px 12px; line-height: 1.35"
        >
          <MaterialIcon name="warning" :size="16" />
          <span>
            {{ missingCount }} attachment file{{ missingCount === 1 ? '' : 's' }} not stored on this device.
            Reattach the field proof here, or restore a site backup that includes attachments.
          </span>
        </div>

        <!-- Empty -->
        <div v-else-if="!loading && items.length === 0" class="small" style="color: var(--ink-3); text-align: center; padding: 24px 0">
          No attachments attached yet.
        </div>

        <!-- Viewer -->
        <template v-if="!loading && items.length > 0">
          <div class="attachment-preview-area">
            <template v-if="items[activeIndex].isImage">
              <img
                :src="items[activeIndex].objectUrl"
                :alt="items[activeIndex].name"
                class="attachment-img"
              />
            </template>
            <template v-else>
              <div class="col gap-3" style="align-items: center; padding: 32px 0">
                <MaterialIcon name="attach_file" :size="48" style="color: var(--ink-3)" />
                <div class="mono small" style="word-break: break-all; text-align: center">
                  {{ items[activeIndex].name }}
                </div>
                <button type="button" class="btn btn-primary" @click="download(items[activeIndex])">
                  <MaterialIcon name="download" />
                  Download file
                </button>
              </div>
            </template>
          </div>

          <!-- File info + download -->
          <div class="between" style="align-items: center; flex-wrap: wrap; gap: 8px">
            <div class="col gap-1" style="min-width: 0">
              <div class="small mono" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis">
                {{ items[activeIndex].name }}
              </div>
              <div class="tiny" style="color: var(--ink-3)">
                {{ (items[activeIndex].size / 1024).toFixed(1) }} KB · {{ items[activeIndex].type || 'unknown type' }}
              </div>
            </div>
            <button
              v-if="items[activeIndex].isImage"
              type="button"
              class="btn btn-ghost"
              style="flex-shrink: 0"
              @click="download(items[activeIndex])"
            >
              <MaterialIcon name="download" :size="18" />
              Download
            </button>
          </div>

          <!-- Pagination -->
          <div v-if="items.length > 1" class="row gap-2" style="justify-content: center">
            <button type="button" class="btn btn-ghost" :disabled="activeIndex === 0" @click="prev">
              <MaterialIcon name="chevron_left" />
            </button>
            <button
              v-for="(item, i) in items"
              :key="i"
              type="button"
              class="btn"
              :class="i === activeIndex ? 'btn-primary' : 'btn-ghost'"
              style="min-width: 32px; padding: 4px 8px"
              @click="activeIndex = i"
            >
              {{ i + 1 }}
            </button>
            <button type="button" class="btn btn-ghost" :disabled="activeIndex === items.length - 1" @click="next">
              <MaterialIcon name="chevron_right" />
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.attachment-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.attachment-modal {
  background: var(--paper);
  width: 100%;
  max-width: 95vw;
  max-height: 95vh;
  overflow-y: auto;
  padding: 28px;
}

.attachment-preview-area {
  background: var(--paper-2);
  border: 1.5px solid var(--line);
  border-radius: 2px;
  min-height: 65vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.attachment-img {
  max-width: 100%;
  max-height: 75vh;
  object-fit: contain;
  display: block;
}
</style>
