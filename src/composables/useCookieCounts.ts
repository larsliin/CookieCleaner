import { onMounted, onUnmounted, shallowRef } from 'vue'
import { errorMessage, website } from '../cleaner/model'

export function useCookieCounts() {
  const counts = shallowRef<Map<string, number> | null>(null)
  const loading = shallowRef(true)
  const error = shallowRef('')
  let timer: ReturnType<typeof setTimeout> | undefined
  let revision = 0

  async function refresh() {
    const currentRevision = ++revision
    try {
      const cookies = await chrome.cookies.getAll({})
      const next = new Map<string, number>()
      for (const cookie of cookies) {
        const site = website(`https://${cookie.domain.replace(/^\./, '')}`)
        if (site) next.set(site.domain, (next.get(site.domain) ?? 0) + 1)
      }
      if (currentRevision !== revision) return
      counts.value = next
      error.value = ''
    } catch (cause) {
      if (currentRevision !== revision) return
      counts.value = null
      error.value = `Cookie counts unavailable: ${errorMessage(cause)}`
    } finally {
      if (currentRevision === revision) loading.value = false
    }
  }

  function onCookieChanged() {
    clearTimeout(timer)
    timer = setTimeout(() => { void refresh() }, 100)
  }

  onMounted(() => {
    if (typeof chrome === 'undefined' || !chrome.cookies) {
      loading.value = false
      error.value = 'Cookie counts are available only in the installed extension.'
      return
    }
    chrome.cookies.onChanged.addListener(onCookieChanged)
    void refresh()
  })
  onUnmounted(() => {
    revision++
    clearTimeout(timer)
    if (typeof chrome !== 'undefined' && chrome.cookies) {
      chrome.cookies.onChanged.removeListener(onCookieChanged)
    }
  })

  return { counts, loading, error }
}
