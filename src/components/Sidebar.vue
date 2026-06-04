<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import MaterialIcon from './MaterialIcon.vue'
import AddSiteModal from './AddSiteModal.vue'
import ScopeModal from './ScopeModal.vue'
import ActivityLogModal from './ActivityLogModal.vue'
import ConfirmSourceModal from './ConfirmSourceModal.vue'
import { useScopes } from '../composables/useScopes.js'
import { buildSitePath } from '../lib/siteRouting.js'

const { sites } = useSites()
const { scopes } = useScopes()
const route = useRoute()
const router = useRouter()

const activeId = computed(() => route.params.id || null)
const showAddSite = ref(false)
const showScopeModal = ref(false)
const showActivityLog = ref(false)
const showConfirmSources = ref(false)
const collapsedScopes = ref(new Set())

const groupedSites = computed(() => {
  const list = sites.value || []
  const knownScopes = new Set((scopes.value || []).map((s) => s.name))
  const groups = {}
  for (const site of list) {
    const raw = site.scope?.trim() || ''
    const key = knownScopes.has(raw) ? raw : ''
    if (!groups[key]) groups[key] = []
    groups[key].push(site)
  }
  const sorted = Object.entries(groups).sort(([a], [b]) => {
    if (!a) return 1
    if (!b) return -1
    return a.localeCompare(b)
  })
  return sorted
})

function goToSite(id) {
  router.push(buildSitePath(id))
}

function toggleScope(key) {
  const s = new Set(collapsedScopes.value)
  s.has(key) ? s.delete(key) : s.add(key)
  collapsedScopes.value = s
}

function goToAddSite() {
  showAddSite.value = true
}

function goToHome() {
  router.push('/')
}
</script>

<template>
  <div class="sidebar col">
    <div class="p-4" style="border-bottom: 1.5px solid var(--line)">
      <div class="row items-center gap-2">
        <button
          type="button"
          class="box center"
          style="width: 28px; height: 28px; border-radius: 6px; background: var(--ink); color: var(--paper); font-weight: 700; font-size: 13px; cursor: pointer"
          @click="goToHome"
        >
          T
        </button>
        <div class="col">
          <button
            type="button"
            style="background: transparent; border: 0; padding: 0; font-weight: 700; font-size: 14px; letter-spacing: 0; cursor: pointer; text-align: left"
            @click="goToHome"
          >
            SITE-LOG
          </button>
          <div class="tiny">telecom progress tracker</div>
        </div>
      </div>
    </div>

    <div class="col grow scroll" style="overflow: auto; padding-top: 8px">
      <template v-for="([scope, scopeSites]) in groupedSites" :key="scope">
        <button
          type="button"
          class="px-5 row items-center gap-1"
          style="padding-top: 10px; padding-bottom: 4px; background: transparent; border: 0; cursor: pointer; width: 100%; text-align: left"
          @click="toggleScope(scope)"
        >
          <span style="flex: 1; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3)">{{ scope || 'No scope' }}</span>
          <MaterialIcon
            :name="collapsedScopes.has(scope) ? 'chevron_right' : 'expand_more'"
            :size="13"
            style="color: var(--ink-3)"
          />
        </button>
        <template v-if="!collapsedScopes.has(scope)">
          <button
            v-for="site in scopeSites"
            :key="site.id"
            type="button"
            class="site-row"
            :class="{ active: site.id === activeId }"
            @click="goToSite(site.id)"
          >
            <span style="font-size: 11px">{{ site.id }} — {{ site.name }}</span>
            <span class="badge-count" :class="{ 'badge-zero': site.pending === 0 }">{{ site.pending || 0 }}</span>
          </button>
        </template>
      </template>
      <button type="button" class="site-row" style="color: var(--ink-3); margin-top: 6px" @click="goToAddSite">
        <span class="row items-center gap-2" style="font-size: 11px">
          <MaterialIcon name="add" :size="12" />
          Add site
        </span>
      </button>
    </div>

    <AddSiteModal v-model="showAddSite" />
    <ScopeModal v-model="showScopeModal" />
    <ActivityLogModal v-model="showActivityLog" />
    <ConfirmSourceModal v-model="showConfirmSources" />

    <div style="border-top: 1.5px solid var(--line)">
      <button
        type="button"
        class="p-4"
        style="background: transparent; border: 0; cursor: pointer; text-align: left; width: 100%"
        @click="showScopeModal = true"
      >
        <div class="row items-center gap-2">
          <div class="box center" style="width: 24px; height: 24px; border-radius: 999px; background: var(--paper-2); font-size: 11px">FT</div>
          <div class="col grow">
            <div style="font-size: 12px; font-weight: 600">Field tracker</div>
            <div class="tiny">Manage scopes</div>
          </div>
          <MaterialIcon name="tune" :size="14" style="color: var(--ink-3)" />
        </div>
      </button>
      <button
        type="button"
        class="px-4"
        style="background: transparent; border: 0; cursor: pointer; text-align: left; width: 100%; padding-bottom: 4px; display: flex; align-items: center; gap: 6px"
        @click="showActivityLog = true"
      >
        <MaterialIcon name="history" :size="14" style="color: var(--ink-3)" />
        <span class="tiny" style="color: var(--ink-3)">Activity log</span>
      </button>
      <button
        type="button"
        class="px-4"
        style="background: transparent; border: 0; cursor: pointer; text-align: left; width: 100%; padding-bottom: 12px; display: flex; align-items: center; gap: 6px"
        @click="showConfirmSources = true"
      >
        <MaterialIcon name="fact_check" :size="14" style="color: var(--ink-3)" />
        <span class="tiny" style="color: var(--ink-3)">Confirmation sources</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.scroll {
  overflow: auto;
}
</style>
