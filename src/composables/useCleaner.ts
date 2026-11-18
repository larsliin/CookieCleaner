import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import {
  errorMessage, jobKey, thirdPartyKey, website,
  type CleanupJob, type CleanupRequest, type Period, type Reply, type Site,
} from '../cleaner/model'
import { loadRecentSites } from '../cleaner/recent'

export function useCleaner() {
  const sites = shallowRef<Site[]>([])
  const currentDomain = shallowRef<string | null>(null)
  const period = shallowRef<Period>('all')
  const thirdParty = shallowRef(false)
  const job = shallowRef<CleanupJob | null>(null)
  const error = shallowRef('')
  const loading = shallowRef(true)
  const submitting = shallowRef(false)
  const available = shallowRef(false)
  const review = shallowRef<CleanupRequest | null>(null)
  const busy = computed(() => submitting.value || job.value?.status === 'running')
  let jobRevision = 0

  function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === 'session' && changes[jobKey]) {
      jobRevision++
      job.value = (changes[jobKey].newValue ?? null) as CleanupJob | null
    }
    if (area === 'local' && changes[thirdPartyKey]) {
      thirdParty.value = changes[thirdPartyKey].newValue === true
    }
  }

  async function load() {
    error.value = ''
    loading.value = true
    const revision = jobRevision
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
        throw new Error('Browser preview only. Load the built extension in Chrome to enable cleanup.')
      }
      const [stored, tabs, reply, recent] = await Promise.all([
        chrome.storage.local.get(thirdPartyKey),
        chrome.tabs.query({ active: true, currentWindow: true }),
        chrome.runtime.sendMessage<unknown, Reply<CleanupJob | null>>({ type: 'status' }),
        loadRecentSites().catch(() => []),
      ])
      if (!reply.ok) throw new Error(reply.error)
      sites.value = recent
      thirdParty.value = stored[thirdPartyKey] === true
      currentDomain.value = website(tabs[0]?.url ?? '')?.domain ?? null
      if (jobRevision === revision) {
        job.value = reply.value?.status === 'running' ? reply.value : null
      }
      available.value = true
    } catch (cause) {
      available.value = false
      error.value = errorMessage(cause)
    } finally {
      loading.value = false
    }
  }

  watch(thirdParty, (value) => {
    if (available.value) {
      void chrome.storage.local.set({ [thirdPartyKey]: value }).catch((cause: unknown) => {
        error.value = `Could not save third-party preference: ${errorMessage(cause)}`
      })
    }
  })

  function prepareCleanup(request: CleanupRequest) {
    if (!available.value || busy.value || review.value) return
    error.value = ''
    review.value = request
  }

  function beginReview(domain: string | null) {
    prepareCleanup({
      domain,
      period: domain === null ? period.value : 'all',
      thirdParty: domain !== null && thirdParty.value,
    })
  }

  async function confirm() {
    if (!review.value || busy.value) return
    const confirmed = review.value
    review.value = null
    submitting.value = true
    error.value = ''
    try {
      const reply = await chrome.runtime.sendMessage<unknown, Reply<CleanupJob>>({
        type: 'clean', request: confirmed,
      })
      if (!reply.ok) throw new Error(reply.error)
      job.value = reply.value
    } catch (cause) {
      error.value = `Cleanup could not be confirmed: ${errorMessage(cause)}. Check the saved result before retrying.`
    } finally {
      submitting.value = false
    }
  }

  async function dismissResult() {
    if (job.value?.status !== 'complete') return
    await chrome.storage.session.remove(jobKey)
    job.value = null
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
    sites, currentDomain, period, thirdParty, job, error, loading, available,
    review, busy, load, beginReview, prepareCleanup, confirm, dismissResult,
  }
}