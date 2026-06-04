<script setup>
import { computed } from 'vue'
import { RouterView } from 'vue-router'
import Sidebar from './components/Sidebar.vue'
import AuthView from './components/AuthView.vue'
import { useAuth } from './composables/useAuth.js'

const { authEnabled, initialized, user, pendingLocalMigration } = useAuth()

const showLoadingState = computed(() => authEnabled.value && !initialized.value)
const showAuthGate = computed(() => authEnabled.value && initialized.value && !user.value)
const showMigrationGate = computed(
  () => authEnabled.value && initialized.value && !!user.value && !!pendingLocalMigration.value,
)
</script>

<template>
  <AuthView v-if="showLoadingState" loading />
  <AuthView v-else-if="showAuthGate || showMigrationGate" :migration-summary="pendingLocalMigration" />
  <div v-else class="wf row">
    <Sidebar />
    <RouterView :key="$route.fullPath" />
  </div>
</template>
