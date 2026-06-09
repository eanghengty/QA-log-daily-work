<script setup>
import { watch } from 'vue'
import { useActivityLog } from '../composables/useActivityLog.js'
import { getActivityActorLabel } from '../composables/useActivityActor.js'
import MaterialIcon from './MaterialIcon.vue'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])

const { logs, clearLog, refreshLog } = useActivityLog()

function close() { emit('update:modelValue', false) }

function formatTime(iso) {
  return new Date(iso).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Phnom_Penh',
  })
}

const iconMap = {
  'Site created': 'add_circle',
  'Site updated': 'edit',
  'Site deleted': 'delete',
  'Site exported': 'download',
  'Site imported': 'upload',
  'Report created': 'edit_note',
  'Report updated': 'edit_note',
  'Report deleted': 'delete',
  'Blocker created': 'flag',
  'Blocker updated': 'flag',
  'Blocker deleted': 'delete',
  'Confirmation created': 'verified',
  'Confirmation updated': 'verified',
  'Confirmation deleted': 'delete',
  'Scope added': 'label',
  'Scope deleted': 'label_off',
  'Email settings saved': 'mail',
  'User signed in': 'login',
  'User signed out': 'logout',
  'First account created': 'person_add',
  'Account details updated': 'manage_accounts',
  'Field user created': 'person_add',
  'Field user role updated': 'admin_panel_settings',
  'Attachment sync run': 'cloud_sync',
  'Full backup exported': 'backup',
  'Full backup restored': 'restore',
}

function iconFor(action) { return iconMap[action] || 'history' }

async function confirmClear() {
  if (!window.confirm('Clear all activity log entries? This cannot be undone.')) return
  await clearLog()
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) void refreshLog()
  },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="al-overlay" @click.self="close">
      <div class="al-modal box col gap-0">
        <div class="between p-5" style="border-bottom: 1.5px solid var(--line); align-items: center">
          <div class="col gap-1">
            <div class="title-md">Activity log</div>
            <div class="tiny" style="color: var(--ink-3)">Shared activity visible to signed-in field users</div>
          </div>
          <div class="row gap-2">
            <button type="button" class="btn btn-ghost" style="font-size: 11px; padding: 4px 8px" @click="confirmClear">
              <MaterialIcon name="delete_sweep" :size="14" />
              Clear
            </button>
            <button type="button" class="btn btn-ghost" style="padding: 4px 8px" @click="close">
              <MaterialIcon name="close" :size="20" />
            </button>
          </div>
        </div>

        <div class="col grow" style="overflow-y: auto">
          <div v-if="!logs?.length" class="p-5 small" style="color: var(--ink-3)">No activity recorded yet.</div>
          <div
            v-for="log in logs"
            :key="log.id"
            class="row gap-3 items-start"
            style="padding: 10px 20px; border-bottom: 1px dashed var(--line)"
          >
            <MaterialIcon :name="iconFor(log.action)" :size="15" style="color: var(--ink-3); flex-shrink: 0; margin-top: 2px" />
            <div class="col grow gap-1">
              <div style="font-size: 12px; font-weight: 600">{{ log.action }}</div>
              <div v-if="log.detail" class="tiny" style="color: var(--ink-2)">{{ log.detail }}</div>
              <div class="tiny" style="color: var(--ink-3)">By {{ getActivityActorLabel(log) }}</div>
            </div>
            <div class="tiny" style="color: var(--ink-3); white-space: nowrap; flex-shrink: 0">{{ formatTime(log.at) }}</div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.al-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.al-modal {
  background: var(--paper);
  width: 100%;
  max-width: 560px;
  height: 80vh;
  overflow: hidden;
}
</style>
