<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import MaterialIcon from './MaterialIcon.vue'

const { sites } = useSites()
const route = useRoute()
const router = useRouter()

const activeId = computed(() => route.params.id || null)

function goToSite(id) {
  router.push(`/site/${id}`)
}

function goToAddSite() {
  router.push('/site/new')
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

    <div class="px-5" style="padding-top: 14px; padding-bottom: 8px">
      <div class="label">Your sites</div>
    </div>
    <div class="col grow scroll" style="overflow: auto">
      <button
        v-for="site in sites"
        :key="site.id"
        type="button"
        class="site-row"
        :class="{ active: site.id === activeId }"
        @click="goToSite(site.id)"
      >
        <span>{{ site.name }}</span>
        <span class="badge-count" :class="{ 'badge-zero': site.pending === 0 }">{{ site.pending || 0 }}</span>
      </button>
      <button type="button" class="site-row" style="color: var(--ink-3); margin-top: 6px; cursor: pointer" @click="goToAddSite">
        <span class="row items-center gap-2">
          <MaterialIcon name="add" :size="14" />
          Add site
        </span>
      </button>
    </div>

    <div class="p-4" style="border-top: 1.5px solid var(--line)">
      <div class="row items-center gap-2">
        <div class="box center" style="width: 24px; height: 24px; border-radius: 999px; background: var(--paper-2); font-size: 11px">FT</div>
        <div class="col">
          <div style="font-size: 12px; font-weight: 600">Field tracker</div>
          <div class="tiny">local site log</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scroll {
  overflow: auto;
}
</style>
