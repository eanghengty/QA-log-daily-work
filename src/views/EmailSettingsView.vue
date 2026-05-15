<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSites } from '../composables/useSites.js'
import { useEmailSettings } from '../composables/useEmailSettings.js'
import Topbar from '../components/Topbar.vue'
import MaterialIcon from '../components/MaterialIcon.vue'

const route = useRoute()
const router = useRouter()
const siteId = route.params.id

const { useSiteById, sites } = useSites()
const { data: site } = useSiteById(siteId)
const { getEmailSettings, saveEmailSettings } = useEmailSettings()

const to = ref('')
const cc = ref('')
const defaultSubject = ref('')
const status = ref('')
const loaded = ref(false)

const copyFromSiteId = ref('')
const otherSites = computed(() => (sites.value || []).filter((s) => s.id !== siteId))

watch(
  () => siteId,
  async () => {
    const saved = await getEmailSettings(siteId)
    to.value = saved.to ?? ''
    cc.value = saved.cc ?? ''
    defaultSubject.value = saved.defaultSubject ?? ''
    loaded.value = true
  },
  { immediate: true },
)

async function copyFromSite() {
  if (!copyFromSiteId.value) return
  const saved = await getEmailSettings(copyFromSiteId.value)
  to.value = saved.to ?? ''
  cc.value = saved.cc ?? ''
  defaultSubject.value = saved.defaultSubject ?? ''
  status.value = `Copied from ${otherSites.value.find((s) => s.id === copyFromSiteId.value)?.name || copyFromSiteId.value} — review and save`
  setTimeout(() => { status.value = '' }, 4000)
}

async function save() {
  const prefix = defaultSubject.value.replace(/\s*-\s*\d{1,2}\s+\w+\s+\d{4}$/, '').trim()
  await saveEmailSettings(siteId, { to: to.value, cc: cc.value, defaultSubject: prefix })
  defaultSubject.value = prefix
  status.value = 'Saved'
  setTimeout(() => { status.value = '' }, 2500)
}

function goBack() {
  router.push(`/site/${siteId}`)
}
</script>

<template>
  <div class="col grow">
    <Topbar
      :title="`Email settings — ${site?.name || siteId}`"
      subtitle="Default recipients and subject for email drafts"
    >
      <button type="button" class="btn btn-ghost" @click="goBack">
        <MaterialIcon name="arrow_back" />
        Back to site
      </button>
      <button type="button" class="btn btn-primary" @click="save">
        <MaterialIcon name="save" />
        Save settings
      </button>
    </Topbar>

    <div class="col gap-5 p-5" style="max-width: 600px">
      <div v-if="!loaded" class="small">Loading…</div>
      <template v-else>

        <!-- Copy from another site -->
        <div class="box-dash p-4 col gap-3" v-if="otherSites.length > 0">
          <div class="label">Copy settings from another site</div>
          <div class="row gap-2 items-center">
            <select
              v-model="copyFromSiteId"
              class="field grow"
              style="cursor: pointer"
            >
              <option value="" disabled>Select a site…</option>
              <option v-for="s in otherSites" :key="s.id" :value="s.id">
                {{ s.name }}
              </option>
            </select>
            <button
              type="button"
              class="btn"
              :disabled="!copyFromSiteId"
              @click="copyFromSite"
            >
              <MaterialIcon name="content_copy" />
              Copy
            </button>
          </div>
          <div class="tiny" style="color: var(--ink-3)">Fills in the fields below — review then click Save settings to apply.</div>
        </div>

        <!-- Recipients -->
        <div class="box p-4 col gap-4">
          <div class="label">Default recipients</div>
          <div class="col gap-2">
            <label class="label" for="to-field">To</label>
            <input
              id="to-field"
              v-model="to"
              class="field"
              type="text"
              placeholder="email@example.com, another@example.com"
            />
            <div class="tiny" style="color: var(--ink-3)">Comma-separated email addresses</div>
          </div>
          <div class="col gap-2">
            <label class="label" for="cc-field">CC</label>
            <input
              id="cc-field"
              v-model="cc"
              class="field"
              type="text"
              placeholder="email@example.com, another@example.com"
            />
            <div class="tiny" style="color: var(--ink-3)">Comma-separated email addresses</div>
          </div>
        </div>

        <!-- Default subject prefix -->
        <div class="box p-4 col gap-4">
          <div class="label">Default subject prefix</div>
          <div class="col gap-2">
            <input
              v-model="defaultSubject"
              class="field"
              type="text"
              placeholder="e.g. [SITE-01] Progress update"
            />
            <div class="tiny" style="color: var(--ink-3)">
              Leave blank to auto-generate from site ID. Today's date (Cambodia time) is always appended automatically.
            </div>
          </div>
        </div>

        <div v-if="status" class="chip chip-confirm" style="align-self: flex-start">
          <MaterialIcon name="check_circle" :size="14" />
          {{ status }}
        </div>
      </template>
    </div>
  </div>
</template>
