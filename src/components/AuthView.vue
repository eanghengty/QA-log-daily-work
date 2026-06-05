<script setup>
import { computed, ref } from 'vue'
import MaterialIcon from './MaterialIcon.vue'
import { useAuth } from '../composables/useAuth.js'

const props = defineProps({
  loading: {
    type: Boolean,
    default: false,
  },
})

const mode = ref('sign-in')
const form = ref({
  fullName: '',
  email: '',
  password: '',
})

const { isBusy, authError, authNotice, signInWithPassword, signUp, clearAuthFeedback, canCreateFirstUser } =
  useAuth()

const modeLabel = computed(() => {
  if (props.loading) return 'Connecting'
  if (mode.value === 'sign-up') return 'Create first account'
  return 'Sign in'
})

const submitLabel = computed(() => {
  if (props.loading) return 'Connecting...'
  if (mode.value === 'sign-up') return 'Create first account'
  return 'Sign in'
})

function setMode(nextMode) {
  if (nextMode === 'sign-up' && !canCreateFirstUser.value) return
  mode.value = nextMode
  clearAuthFeedback()
}

async function submit() {
  if (props.loading || isBusy.value) return

  if (mode.value === 'sign-up') {
    await signUp({
      fullName: form.value.fullName,
      email: form.value.email,
      password: form.value.password,
    })
    return
  }

  await signInWithPassword({
    email: form.value.email,
    password: form.value.password,
  })
}
</script>

<template>
  <div class="wf center" style="padding: 24px; background: linear-gradient(135deg, #ecebe5 0%, #f8f6ef 55%, #e4e0d1 100%)">
    <div class="auth-panel box col gap-4">
      <div class="col gap-3">
        <div class="row items-center gap-3">
          <div class="box center" style="width: 42px; height: 42px; background: var(--ink); color: var(--paper)">
            <MaterialIcon name="cell_tower" :size="22" />
          </div>
          <div class="col">
            <div class="title-lg">Telecom site tracker</div>
            <div class="small">Custom backend access and realtime shell</div>
          </div>
        </div>
        <div class="squiggle" />
      </div>

      <div class="col gap-2">
        <div class="label">{{ modeLabel }}</div>
        <div class="small">
          <template v-if="loading">
            Restoring the active session and preparing realtime.
          </template>
          <template v-else-if="mode === 'sign-up'">
            Create the first field-user account for the custom backend. Once one account exists, this screen returns to sign-in only.
          </template>
          <template v-else>
            Sign in with the custom backend account to open the tracker shell.
          </template>
        </div>
      </div>

      <div class="col gap-3">
        <div v-if="mode === 'sign-up'" class="col gap-2">
          <div class="label">Full name</div>
          <input
            v-model="form.fullName"
            class="field"
            placeholder="e.g. Alex Tan"
            :disabled="loading || isBusy"
          />
        </div>

        <div class="col gap-2">
          <div class="label">Email</div>
          <input
            v-model="form.email"
            class="field"
            type="email"
            placeholder="name@company.com"
            autocomplete="email"
            :disabled="loading || isBusy"
          />
        </div>

        <div class="col gap-2">
          <div class="label">Password</div>
          <input
            v-model="form.password"
            class="field"
            type="password"
            placeholder="••••••••"
            :autocomplete="mode === 'sign-up' ? 'new-password' : 'current-password'"
            :disabled="loading || isBusy"
          />
        </div>
      </div>

      <div v-if="authError" class="chip chip-issue">
        <MaterialIcon name="error" :size="14" />
        {{ authError }}
      </div>

      <div v-else-if="authNotice" class="chip chip-confirm">
        <MaterialIcon name="check_circle" :size="14" />
        {{ authNotice }}
      </div>

      <div class="row gap-2" style="justify-content: flex-end; flex-wrap: wrap">
        <button
          type="button"
          class="btn btn-ghost"
          :disabled="loading || isBusy || mode === 'sign-in'"
          @click="setMode('sign-in')"
        >
          Sign in
        </button>
        <button
          v-if="canCreateFirstUser"
          type="button"
          class="btn btn-ghost"
          :disabled="loading || isBusy || mode === 'sign-up'"
          @click="setMode('sign-up')"
        >
          Create first account
        </button>
      </div>

      <div class="row gap-2" style="justify-content: flex-end">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="loading || isBusy"
          @click="submit"
        >
          <span v-if="loading || isBusy" class="btn-spinner" />
          <MaterialIcon v-else :name="mode === 'sign-up' ? 'person_add' : 'login'" :size="16" />
          {{ submitLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-panel {
  width: min(460px, 100%);
  padding: 28px;
  background:
    radial-gradient(circle at top right, rgba(255, 242, 168, 0.5), transparent 30%),
    linear-gradient(180deg, rgba(250, 250, 247, 0.98), rgba(241, 240, 234, 0.98));
  box-shadow: 0 18px 40px rgba(26, 26, 26, 0.08);
}
</style>
