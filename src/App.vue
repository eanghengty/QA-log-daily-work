<script setup>
import { computed } from 'vue'
import { RouterView } from 'vue-router'
import Sidebar from './components/Sidebar.vue'
import AuthView from './components/AuthView.vue'
import MaterialIcon from './components/MaterialIcon.vue'
import { useAppStartup } from './composables/useAppStartup.js'
import { useAuth } from './composables/useAuth.js'

const { authEnabled, initialized, user } = useAuth()
const { startupPending, startupError, retryAppStartup } = useAppStartup()

const showStartupLoading = computed(() => startupPending.value && !startupError.value)
const showStartupError = computed(() => Boolean(startupError.value))
const showLoadingState = computed(() => authEnabled.value && !initialized.value)
const showAuthGate = computed(() => authEnabled.value && initialized.value && !user.value)
</script>

<template>
  <div
    v-if="showStartupError"
    class="wf center"
    style="padding: 24px; background: linear-gradient(135deg, #ecebe5 0%, #f8f6ef 55%, #e4e0d1 100%)"
  >
    <div class="box col gap-4 startup-panel">
      <div class="row items-center gap-3">
        <div class="box center" style="width: 42px; height: 42px; background: var(--ink); color: var(--paper)">
          <MaterialIcon name="error" :size="22" />
        </div>
        <div class="col">
          <div class="title-lg">Tracker startup failed</div>
          <div class="small">The shell could not finish opening, so the app stayed on a safe fallback screen.</div>
        </div>
      </div>

      <div class="chip chip-issue">
        <MaterialIcon name="warning" :size="14" />
        {{ startupError }}
      </div>

      <div class="row gap-2" style="justify-content: flex-end">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="startupPending"
          @click="retryAppStartup"
        >
          <span v-if="startupPending" class="btn-spinner" />
          <MaterialIcon v-else name="refresh" :size="16" />
          Retry startup
        </button>
      </div>
    </div>
  </div>
  <AuthView v-else-if="showStartupLoading || showLoadingState" loading />
  <AuthView v-else-if="showAuthGate" />
  <div v-else class="wf row">
    <Sidebar />
    <RouterView :key="$route.fullPath" />
  </div>
</template>

<style scoped>
.startup-panel {
  width: min(520px, 100%);
  padding: 28px;
  background:
    radial-gradient(circle at top right, rgba(255, 242, 168, 0.5), transparent 30%),
    linear-gradient(180deg, rgba(250, 250, 247, 0.98), rgba(241, 240, 234, 0.98));
  box-shadow: 0 18px 40px rgba(26, 26, 26, 0.08);
}
</style>
