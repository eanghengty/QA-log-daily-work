<script setup>
import { computed, ref, watch } from 'vue'
import Topbar from '../components/Topbar.vue'
import MaterialIcon from '../components/MaterialIcon.vue'
import { useAuth } from '../composables/useAuth.js'
import { useAdminUsers } from '../composables/useAdminUsers.js'
import { syncLocalAttachmentsToCloud } from '../composables/useAttachments.js'

const ROLE_OPTIONS = [
  { value: 'member', label: 'Member' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
]

const { user, isAdmin } = useAuth()
const { users, loading, submitting, savingRoleId, error, notice, loadUsers, createUser, updateUserRole, clearFeedback } =
  useAdminUsers()

const form = ref({
  fullName: '',
  email: '',
  password: '',
  role: 'member',
})
const roleDrafts = ref({})
const attachmentSyncBusy = ref(false)
const attachmentSyncMessage = ref('')
const attachmentSyncTone = ref('confirm')

const subtitle = computed(() => 'Admin-only field-user setup and role assignment for the custom backend.')
const totalAdmins = computed(() => (users.value || []).filter((entry) => entry.role === 'admin').length)

function resetForm() {
  form.value = {
    fullName: '',
    email: '',
    password: '',
    role: 'member',
  }
}

function syncRoleDrafts() {
  roleDrafts.value = Object.fromEntries((users.value || []).map((entry) => [entry.id, entry.role || 'member']))
}

async function refreshUsers() {
  try {
    await loadUsers()
  } catch {
    // Feedback is already stored in the composable state.
  }
}

async function submitCreateUser() {
  try {
    await createUser(form.value)
    resetForm()
    syncRoleDrafts()
  } catch {
    // Feedback is already stored in the composable state.
  }
}

async function saveRole(userId) {
  try {
    const nextRole = roleDrafts.value[userId] || 'member'
    await updateUserRole(userId, nextRole)
    syncRoleDrafts()
  } catch {
    // Feedback is already stored in the composable state.
  }
}

async function syncBrowserAttachments() {
  attachmentSyncBusy.value = true
  attachmentSyncMessage.value = ''
  attachmentSyncTone.value = 'confirm'

  try {
    const result = await syncLocalAttachmentsToCloud({ force: true })
    attachmentSyncMessage.value =
      `Attachment sync complete: ${result.uploaded} uploaded, ${result.skipped} skipped, ${result.failed} failed.`
    attachmentSyncTone.value = result.failed ? 'issue' : 'confirm'
  } catch (err) {
    attachmentSyncMessage.value = `Attachment sync failed: ${err.message || 'Unknown error'}`
    attachmentSyncTone.value = 'issue'
  } finally {
    attachmentSyncBusy.value = false
  }
}

function formatDate(value) {
  if (!value) return 'Unknown'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'

  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

watch(
  users,
  () => {
    syncRoleDrafts()
  },
  { immediate: true },
)

watch(
  isAdmin,
  async (nextValue) => {
    if (!nextValue) {
      roleDrafts.value = {}
      return
    }

    await refreshUsers()
  },
  { immediate: true },
)

</script>

<template>
  <div class="col grow">
    <Topbar title="Field user access" :subtitle="subtitle">
      <button type="button" class="btn btn-ghost" :disabled="loading || submitting" @click="refreshUsers">
        <MaterialIcon name="refresh" />
        Refresh
      </button>
    </Topbar>

    <div class="col gap-5 p-5 grow" style="overflow: auto">
      <div v-if="!isAdmin" class="box col center gap-3" style="padding: 44px 20px; color: var(--ink-3)">
        <MaterialIcon name="lock" :size="28" />
        <div class="title-md">Admin access only</div>
        <div class="small">Only admin field users can open account creation and role setup.</div>
      </div>

      <template v-else>
        <div class="row gap-3" style="flex-wrap: wrap">
          <div class="chip chip-neutral">
            <MaterialIcon name="groups" :size="14" />
            {{ users.length }} field user{{ users.length === 1 ? '' : 's' }}
          </div>
          <div class="chip chip-confirm">
            <MaterialIcon name="admin_panel_settings" :size="14" />
            {{ totalAdmins }} admin{{ totalAdmins === 1 ? '' : 's' }}
          </div>
        </div>

        <div v-if="error" class="chip chip-issue">
          <MaterialIcon name="error" :size="14" />
          {{ error }}
        </div>
        <div v-else-if="notice" class="chip chip-confirm">
          <MaterialIcon name="check_circle" :size="14" />
          {{ notice }}
        </div>

        <div class="box col gap-3" style="padding: 20px">
          <div class="between gap-3" style="align-items: flex-start; flex-wrap: wrap">
            <div class="col gap-1">
              <div class="title-md">Attachment cloud sync</div>
              <div class="small" style="color: var(--ink-2)">
                Push field proof files stored in this browser to the shared backend so other signed-in users can preview them.
              </div>
              <div class="tiny" style="color: var(--ink-3)">
                This only covers files available on this device. For files saved on another user's device, that user must sign in there or provide a JSON backup that includes attachments.
              </div>
            </div>
            <button type="button" class="btn btn-primary" :disabled="attachmentSyncBusy" @click="syncBrowserAttachments">
              <span v-if="attachmentSyncBusy" class="btn-spinner" />
              <MaterialIcon v-else name="cloud_upload" :size="16" />
              Sync this browser
            </button>
          </div>

          <div
            v-if="attachmentSyncMessage"
            class="chip"
            :class="attachmentSyncTone === 'issue' ? 'chip-issue' : 'chip-confirm'"
          >
            <MaterialIcon :name="attachmentSyncTone === 'issue' ? 'error' : 'check_circle'" :size="14" />
            {{ attachmentSyncMessage }}
          </div>
        </div>

        <div class="box col gap-4" style="padding: 20px">
          <div class="between">
            <div class="col gap-1">
              <div class="title-md">Create field user</div>
              <div class="tiny">Add a custom-backend account and choose the starting role before the user signs in.</div>
            </div>
            <button type="button" class="btn btn-ghost" :disabled="submitting" @click="resetForm">
              <MaterialIcon name="ink_eraser" :size="16" />
              Clear
            </button>
          </div>

          <div class="row gap-3" style="flex-wrap: wrap">
            <div class="col gap-2" style="flex: 1 1 240px">
              <div class="label">Full name</div>
              <input
                v-model="form.fullName"
                class="field"
                placeholder="e.g. Alex Tan"
                :disabled="submitting"
                @input="clearFeedback"
              />
            </div>

            <div class="col gap-2" style="flex: 1 1 240px">
              <div class="label">Email</div>
              <input
                v-model="form.email"
                class="field"
                type="email"
                placeholder="name@company.com"
                :disabled="submitting"
                @input="clearFeedback"
              />
            </div>
          </div>

          <div class="row gap-3" style="flex-wrap: wrap">
            <div class="col gap-2" style="flex: 1 1 240px">
              <div class="label">Password</div>
              <input
                v-model="form.password"
                class="field"
                type="password"
                placeholder="At least 8 characters"
                autocomplete="new-password"
                :disabled="submitting"
                @input="clearFeedback"
              />
            </div>

            <div class="col gap-2" style="flex: 0 1 220px">
              <div class="label">Role</div>
              <select v-model="form.role" class="field" :disabled="submitting" @change="clearFeedback">
                <option v-for="option in ROLE_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>

          <div class="row gap-2" style="justify-content: flex-end">
            <button type="button" class="btn btn-primary" :disabled="submitting" @click="submitCreateUser">
              <span v-if="submitting" class="btn-spinner" />
              <MaterialIcon v-else name="person_add" :size="16" />
              Create user
            </button>
          </div>
        </div>

        <div class="box col" style="overflow: hidden">
          <div class="row" style="padding: 10px 16px; background: var(--paper-2); border-bottom: 1.5px solid var(--line)">
            <div class="label" style="flex: 1.4 1 0%">Field user</div>
            <div class="label" style="flex: 1.2 1 0%">Email</div>
            <div class="label" style="flex: 0.8 1 0%">Role</div>
            <div class="label" style="flex: 0.8 1 0%">Created</div>
            <div class="label" style="width: 120px">Save</div>
          </div>

          <div v-if="loading" class="col center gap-3" style="padding: 36px 20px; color: var(--ink-3)">
            <span class="btn-spinner" style="width: 18px; height: 18px" />
            <div class="small">Loading field users...</div>
          </div>

          <div v-else-if="users.length === 0" class="col center gap-3" style="padding: 36px 20px; color: var(--ink-3)">
            <MaterialIcon name="person_search" :size="28" />
            <div class="title-md">No extra users yet</div>
            <div class="small">Create the next field-user account from the form above.</div>
          </div>

          <div
            v-for="entry in users"
            :key="entry.id"
            class="row items-center"
            style="padding: 12px 16px; border-bottom: 1px dashed var(--line); gap: 12px"
          >
            <div class="col" style="flex: 1.4 1 0%; min-width: 0">
              <div class="title-md" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis">
                {{ entry.fullName || 'Unnamed field user' }}
              </div>
              <div class="tiny" v-if="entry.id === user?.id">Signed in now</div>
            </div>

            <div class="small" style="flex: 1.2 1 0%; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">
              {{ entry.email }}
            </div>

            <div class="col gap-1" style="flex: 0.8 1 0%">
              <select
                v-model="roleDrafts[entry.id]"
                class="field"
                :disabled="savingRoleId === entry.id"
                @change="clearFeedback"
              >
                <option v-for="option in ROLE_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
              <div
                v-if="entry.id === user?.id && roleDrafts[entry.id] !== 'admin'"
                class="tiny"
                style="color: var(--issue)"
              >
                Keep your own account as admin.
              </div>
            </div>

            <div class="small" style="flex: 0.8 1 0%">{{ formatDate(entry.createdAt) }}</div>

            <div class="row" style="width: 120px; justify-content: flex-end">
              <button
                type="button"
                class="btn"
                :disabled="savingRoleId === entry.id || roleDrafts[entry.id] === entry.role"
                @click="saveRole(entry.id)"
              >
                <span v-if="savingRoleId === entry.id" class="btn-spinner" />
                <MaterialIcon v-else name="save" :size="16" />
                Save
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
