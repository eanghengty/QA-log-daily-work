<script setup>
import { ref, watch } from 'vue'
import MaterialIcon from './MaterialIcon.vue'
import { useAuth } from '../composables/useAuth.js'
import { useRealtime } from '../composables/useRealtime.js'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])

const { user, profile, currentDisplayName, isBusy, authError, authNotice, profileSyncReady, updateAccount, signOut } =
  useAuth()
const { onlineUsers } = useRealtime()

const form = ref({
  fullName: '',
  password: '',
})

watch(
  () => [props.modelValue, profile.value?.full_name, currentDisplayName.value],
  ([isOpen]) => {
    if (!isOpen) return
    form.value.fullName = `${profile.value?.full_name || currentDisplayName.value || ''}`.trim()
    form.value.password = ''
  },
  { immediate: true },
)

function close() {
  if (isBusy.value) return
  emit('update:modelValue', false)
}

async function save() {
  await updateAccount({
    fullName: form.value.fullName,
    password: form.value.password,
  })
  form.value.password = ''
}

async function handleSignOut() {
  await signOut()
  close()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="account-overlay" @click.self="close">
      <div class="account-modal box col gap-4">
        <div class="between">
          <div class="col gap-1">
            <div class="title-md">Account</div>
            <div class="tiny">Manage the signed-in field user and Supabase profile.</div>
          </div>
          <button type="button" class="btn btn-ghost" style="padding: 4px 8px" :disabled="isBusy" @click="close">
            <MaterialIcon name="close" :size="18" />
          </button>
        </div>

        <div class="box-soft col gap-2 p-3" style="background: var(--paper-2)">
          <div class="label">Signed in</div>
          <div class="title-md">{{ currentDisplayName }}</div>
          <div class="small">{{ user?.email || 'No email available' }}</div>
        </div>

        <div class="col gap-3">
          <div class="col gap-2">
            <div class="label">Full name</div>
            <input v-model="form.fullName" class="field" placeholder="Display name for presence and ownership" :disabled="isBusy" />
          </div>

          <div class="col gap-2">
            <div class="label">New password</div>
            <input
              v-model="form.password"
              class="field"
              type="password"
              placeholder="Leave blank to keep the current password"
              autocomplete="new-password"
              :disabled="isBusy"
            />
          </div>
        </div>

        <div v-if="!profileSyncReady" class="chip chip-issue">
          <MaterialIcon name="warning" :size="14" />
          Profile sync is not active until the Supabase SQL setup has been applied.
        </div>

        <div v-if="authError" class="chip chip-issue">
          <MaterialIcon name="error" :size="14" />
          {{ authError }}
        </div>
        <div v-else-if="authNotice" class="chip chip-confirm">
          <MaterialIcon name="check_circle" :size="14" />
          {{ authNotice }}
        </div>

        <div class="col gap-2">
          <div class="label">Realtime presence</div>
          <div class="box-soft col gap-2 p-3">
            <div class="small">{{ onlineUsers.length }} signed-in user{{ onlineUsers.length === 1 ? '' : 's' }} in the realtime lobby</div>
            <div v-if="onlineUsers.length === 0" class="tiny">Open another browser session after sign-in to verify the websocket presence feed.</div>
            <div v-for="member in onlineUsers" :key="`${member.userId}:${member.joinedAt}`" class="row items-center gap-2">
              <span class="chip chip-neutral">
                <MaterialIcon name="person" :size="14" />
                {{ member.userLabel }}
              </span>
              <span class="tiny">{{ member.email }}</span>
            </div>
          </div>
        </div>

        <div class="row gap-2" style="justify-content: space-between">
          <button type="button" class="btn btn-ghost" :disabled="isBusy" @click="handleSignOut">
            <MaterialIcon name="logout" :size="16" />
            Sign out
          </button>
          <div class="row gap-2">
            <button type="button" class="btn btn-ghost" :disabled="isBusy" @click="close">Close</button>
            <button type="button" class="btn btn-primary" :disabled="isBusy" @click="save">
              <span v-if="isBusy" class="btn-spinner" />
              <MaterialIcon v-else name="save" :size="16" />
              Save account
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.account-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.account-modal {
  width: min(560px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
}
</style>
