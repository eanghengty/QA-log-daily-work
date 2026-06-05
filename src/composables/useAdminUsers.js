import { computed, ref } from 'vue'
import { callCustomAuthFunction } from '../lib/customAuthApi.js'
import { useAuth } from './useAuth.js'

const users = ref([])
const loading = ref(false)
const submitting = ref(false)
const savingRoleId = ref('')
const error = ref('')
const notice = ref('')

function sortUsers(list) {
  return [...list].sort((a, b) => {
    const roleCompare = `${a.role || ''}`.localeCompare(`${b.role || ''}`)
    if (roleCompare !== 0) return roleCompare

    return `${a.email || ''}`.localeCompare(`${b.email || ''}`)
  })
}

export function useAdminUsers() {
  const { authEnabled, session, user } = useAuth()
  const isAdmin = computed(() => authEnabled.value && user.value?.role === 'admin')

  async function loadUsers() {
    if (!isAdmin.value || !session.value?.token) {
      users.value = []
      return
    }

    loading.value = true
    error.value = ''

    try {
      const data = await callCustomAuthFunction('auth-users', {
        token: session.value.token,
        body: {
          action: 'list',
        },
      })
      users.value = sortUsers(data.users || [])
    } catch (loadError) {
      error.value = loadError.message || 'Unable to load field-user accounts.'
      throw loadError
    } finally {
      loading.value = false
    }
  }

  async function createUser({ fullName, email, password, role }) {
    if (!isAdmin.value || !session.value?.token) return null

    submitting.value = true
    error.value = ''
    notice.value = ''

    try {
      const data = await callCustomAuthFunction('auth-users', {
        token: session.value.token,
        body: {
          action: 'create',
          fullName: `${fullName || ''}`.trim(),
          email: `${email || ''}`.trim(),
          password,
          role,
        },
      })

      users.value = sortUsers([...(users.value || []), data.user])
      notice.value = 'Field-user account created.'
      return data.user
    } catch (createError) {
      error.value = createError.message || 'Unable to create the field-user account.'
      throw createError
    } finally {
      submitting.value = false
    }
  }

  async function updateUserRole(userId, role) {
    if (!isAdmin.value || !session.value?.token) return null

    savingRoleId.value = userId
    error.value = ''
    notice.value = ''

    try {
      const data = await callCustomAuthFunction('auth-users', {
        token: session.value.token,
        body: {
          action: 'update-role',
          userId,
          role,
        },
      })

      users.value = sortUsers(
        (users.value || []).map((entry) => (entry.id === userId ? data.user : entry)),
      )
      notice.value = 'Field-user role saved.'
      return data.user
    } catch (updateError) {
      error.value = updateError.message || 'Unable to save the field-user role.'
      throw updateError
    } finally {
      savingRoleId.value = ''
    }
  }

  function clearFeedback() {
    error.value = ''
    notice.value = ''
  }

  return {
    users,
    loading,
    submitting,
    savingRoleId,
    error,
    notice,
    isAdmin,
    loadUsers,
    createUser,
    updateUserRole,
    clearFeedback,
  }
}
