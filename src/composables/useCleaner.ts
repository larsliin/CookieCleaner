import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
import {
  errorMessage, jobKey, recentSitesKey, website,
  type CleanupJob, type CleanupRequest, type Period, type Reply, type Site,
} from '../cleaner/model'

export function useCleaner() {
  const sites = shallowRef<Site[]>([])
  const currentDomain = shallowRef<string | null>(null)
  const target = shallowRef('')
  const period = shallowRef<Period>('all')
  const job = shallowRef<CleanupJob | null>(null)
  const error = shallowRef('')
  const loading = shallowRef(true)
  const submitting = shallowRef(false)
  const available = shallowRef(false)
  const review = shallowRef<CleanupRequest | null>(null)
  const busy = computed(() => submitting.value || job.value?.status === 'running')
  const request = computed<CleanupRequest>(() => ({
    domain: target.value === '__all__' ? null : target.value,
    period: period.value,
  }))

  function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === 'session' && changes[jobKey]) {
      job.value = (changes[jobKey].newValue ?? null) as CleanupJob | null
    }
    if (area === 'local' && changes[recentSitesKey]) {
      sites.value = (changes[recentSitesKey].newValue ?? []) as Site[]
    }
  }

  async function load() {
    error.value = ''
    loading.value = true
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
        throw new Error('Browser preview only. Load the built extension in Chrome to enable cleanup.')
      }
      const [stored, tabs, reply] = await Promise.all([
        chrome.storage.local.get(recentSitesKey),
        chrome.tabs.query({ active: true, currentWindow: true }),
        chrome.runtime.sendMessage<unknown, Reply<CleanupJob | null>>({ type: 'status' }),
      ])
      if (!reply.ok) throw new Error(reply.error)
      sites.value = (stored[recentSitesKey] ?? []) as Site[]
      currentDomain.value = website(tabs[0]?.url ?? '')?.domain ?? null
      job.value = reply.value
      target.value = currentDomain.value ?? sites.value[0]?.domain ?? ''
      available.value = true
    } catch (cause) {
      available.value = false
      error.value = errorMessage(cause)
    } finally {
      loading.value = false
    }
  }

  function beginReview(scope: CleanupRequest = request.value) {
    if (!available.value || scope.domain === '' || busy.value || review.value) return
    error.value = ''
    review.value = { ...scope }
  }

  async function confirm() {
    if (!review.value || busy.value) return
    const confirmed = review.value
    submitting.value = true
    error.value = ''
    try {
      const reply = await chrome.runtime.sendMessage<unknown, Reply<CleanupJob>>({
        type: 'clean', request: confirmed,
      })
      if (!reply.ok) throw new Error(reply.error)
      job.value = reply.value
      review.value = null
    } catch (cause) {
      error.value = `Cleanup could not be confirmed: ${errorMessage(cause)}. Check the saved result before retrying.`
      review.value = null
    } finally {
      submitting.value = false
    }
  }

  onMounted(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(onStorageChanged)
    }
    void load()
  })
  onUnmounted(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(onStorageChanged)
    }
  })

  return {
    sites, currentDomain, target, period, job, error, loading, available,
    review, busy, load, beginReview, confirm,
  }
}
