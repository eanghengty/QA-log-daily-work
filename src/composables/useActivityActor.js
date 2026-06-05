import { useAuth } from './useAuth.js'

export function getCurrentActivityActor() {
  const { authEnabled, user, currentDisplayName } = useAuth()
  const activeUser = user.value
  const displayName = String(currentDisplayName.value || '').trim()
  const fallbackName = authEnabled.value ? 'Unknown user' : 'Local user'

  return {
    userId: activeUser?.id || '',
    userName: displayName && displayName !== 'Unknown user' ? displayName : activeUser?.email || fallbackName,
    userEmail: activeUser?.email || '',
  }
}

export function getActivityActorLabel(entry) {
  return (
    String(entry?.userName || '').trim() ||
    String(entry?.userEmail || '').trim() ||
    String(entry?.performedBy || '').trim() ||
    'Unknown user'
  )
}
