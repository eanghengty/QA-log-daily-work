<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import MaterialIcon from './MaterialIcon.vue'
import AddSiteModal from './AddSiteModal.vue'
import ScopeModal from './ScopeModal.vue'

const { sites } = useSites()
const route = useRoute()
const router = useRouter()

const activeId = computed(() => route.params.id || null)
const showAddSite = ref(false)
const showScopeModal = ref(false)

const groupedSites = computed(() => {
  const list = sites.value || []
  const groups = {}
  for (const site of list) {
    const key = site.scope?.trim() || ''
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
  router.push(`/site/${id}`)
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
        <div
          class="px-5"
          style="padding-top: 10px; padding-bottom: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3)"
        >{{ scope || 'No scope' }}</div>
        <button
          v-for="site in scopeSites"
          :key="site.id"
          type="button"
          class="site-row"
          :class="{ active: site.id === activeId }"
          @click="goToSite(site.id)"
        >
          <span>{{ site.name }}</span>
          <span class="badge-count" :class="{ 'badge-zero': site.pending === 0 }">{{ site.pending || 0 }}</span>
        </button>
      </template>
      <button type="button" class="site-row" style="color: var(--ink-3); margin-top: 6px" @click="goToAddSite">
        <span class="row items-center gap-2">
          <MaterialIcon name="add" :size="14" />
          Add site
        </span>
      </button>
    </div>

    <AddSiteModal v-model="showAddSite" />
    <ScopeModal v-model="showScopeModal" />

    <button
      type="button"
      class="p-4"
      style="border-top: 1.5px solid var(--line); background: transparent; border-left: 0; border-right: 0; border-bottom: 0; cursor: pointer; text-align: left; width: 100%"
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
  </div>
</template>

<style scoped>
.scroll {
  overflow: auto;
}
</style>
