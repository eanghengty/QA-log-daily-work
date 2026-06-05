import { computed, ref, watch } from 'vue'
import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { refreshTrackerSetupMirror } from '../lib/trackerCloud.js'
import { useAuth } from './useAuth.js'

const connectionStatus = ref(isSupabaseConfigured ? 'idle' : 'disabled')
const onlineUsers = ref([])
const trackerSyncRefreshToken = ref(0)

let channel = null
let currentIdentityKey = ''
let bridgeStarted = false
let lastTrackerSyncRefreshAt = 0

const TRACKER_SYNC_EVENT = 'tracker-sync'

function normalizePresenceMembers(state) {
  return Object.values(state || {})
    .flatMap((entries) => entries || [])
    .map((entry) => ({
      userId: entry.userId,
      userLabel: entry.userLabel || entry.email || 'Unknown user',
      email: entry.email || '',
      joinedAt: entry.joinedAt || '',
    }))
    .sort((a, b) => a.userLabel.localeCompare(b.userLabel))
}

function mapChannelStatus(status) {
  if (status === 'SUBSCRIBED') return 'connected'
  if (status === 'CHANNEL_ERROR') return 'error'
  if (status === 'TIMED_OUT') return 'timed-out'
  if (status === 'CLOSED') return 'closed'
  return 'connecting'
}

async function disconnectRealtime() {
  onlineUsers.value = []
  currentIdentityKey = ''

  if (!supabase || !channel) {
    connectionStatus.value = isSupabaseConfigured ? 'idle' : 'disabled'
    channel = null
    return
  }

  await supabase.removeChannel(channel)
  channel = null
  connectionStatus.value = 'idle'
}

export async function refreshCloudBackedTrackerData(reason = 'remote-change') {
  if (!isSupabaseConfigured) return

  const now = Date.now()
  if (now - lastTrackerSyncRefreshAt < 500) return
  lastTrackerSyncRefreshAt = now

  try {
    await refreshTrackerSetupMirror()
    trackerSyncRefreshToken.value += 1
  } catch (error) {
    console.warn(`Unable to refresh tracker data after ${reason}.`, error)
  }
}

async function connectRealtimePresence(identity) {
  if (!supabase) return

  const nextIdentityKey = `${identity.userId}:${identity.userLabel}:${identity.email}`
  if (channel && currentIdentityKey === nextIdentityKey) return

  await disconnectRealtime()

  currentIdentityKey = nextIdentityKey
  connectionStatus.value = 'connecting'

  channel = supabase
    .channel('qa-tracker:lobby', {
      config: {
        presence: {
          key: identity.userId,
        },
      },
    })
    .on('presence', { event: 'sync' }, () => {
      onlineUsers.value = normalizePresenceMembers(channel?.presenceState?.() || {})
    })
    .on('broadcast', { event: TRACKER_SYNC_EVENT }, (payload) => {
      if (payload?.payload?.senderId === identity.userId) return
      void refreshCloudBackedTrackerData(payload?.payload?.reason || 'broadcast')
    })

  channel.subscribe(async (status) => {
    connectionStatus.value = mapChannelStatus(status)

    if (status === 'SUBSCRIBED') {
      await channel.track({
        userId: identity.userId,
        userLabel: identity.userLabel,
        email: identity.email,
        joinedAt: new Date().toISOString(),
      })
    }

    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      onlineUsers.value = []
    }
  })
}

export async function broadcastTrackerChange(reason = 'tracker-change') {
  if (!channel || connectionStatus.value !== 'connected') return

  try {
    await channel.send({
      type: 'broadcast',
      event: TRACKER_SYNC_EVENT,
      payload: {
        reason,
        senderId: currentIdentityKey.split(':')[0] || '',
        sentAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.warn('Unable to broadcast tracker change.', error)
  }
}

export function initRealtime() {
  if (bridgeStarted) return
  bridgeStarted = true

  const { authEnabled, user, currentDisplayName } = useAuth()

  watch(
    [() => authEnabled.value, () => user.value, () => currentDisplayName.value],
    async ([enabled, nextUser, displayName]) => {
      if (!enabled || !supabase) {
        connectionStatus.value = 'disabled'
        return
      }

      if (!nextUser?.id) {
        await disconnectRealtime()
        return
      }

      await connectRealtimePresence({
        userId: nextUser.id,
        userLabel: displayName || nextUser.email || 'Unknown user',
        email: nextUser.email || '',
      })
    },
    { immediate: true },
  )
}

export function useRealtime() {
  const onlineCount = computed(() => onlineUsers.value.length)
  const connectionLabel = computed(() => {
    switch (connectionStatus.value) {
      case 'connected':
        return 'Realtime connected'
      case 'connecting':
        return 'Realtime connecting'
      case 'error':
        return 'Realtime error'
      case 'timed-out':
        return 'Realtime timed out'
      case 'closed':
        return 'Realtime closed'
      case 'disabled':
        return 'Realtime disabled'
      default:
        return 'Realtime idle'
    }
  })

  return {
    connectionStatus,
    connectionLabel,
    onlineUsers,
    onlineCount,
    trackerSyncRefreshToken,
    disconnectRealtime,
  }
}
