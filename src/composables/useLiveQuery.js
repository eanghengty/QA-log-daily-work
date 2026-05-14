import { ref, onBeforeUnmount } from 'vue'
import { liveQuery } from 'dexie'

export function useLiveQuery(fn) {
  const data = ref(null)
  const loading = ref(true)
  const error = ref(null)

  const observable = liveQuery(fn)
  const subscription = observable.subscribe({
    next: (value) => {
      data.value = value
      loading.value = false
      error.value = null
    },
    error: (err) => {
      error.value = err
      loading.value = false
    },
  })

  onBeforeUnmount(() => {
    subscription.unsubscribe()
  })

  return { data, loading, error }
}
