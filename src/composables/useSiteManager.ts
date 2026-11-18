import { computed, onMounted, shallowRef, watch } from 'vue'
import { loadCatalogue, sortSites, type DomainEntry, type SortOrder } from '../cleaner/catalogue'
import { errorMessage } from '../cleaner/model'
import { useCleaner } from './useCleaner'

export function useSiteManager() {
  const cleaner = useCleaner()
  const entries = shallowRef<DomainEntry[]>([])
  const warnings = shallowRef<string[]>([])
  const loadingCatalogue = shallowRef(false)
  const selected = shallowRef(new Set<string>())
  const order = shallowRef<SortOrder>('date')
  const page = shallowRef(1)
  const notice = shallowRef('')
  const pageSize = 25
  const ordered = computed(() => sortSites(entries.value, order.value))
  const pageCount = computed(() => Math.max(1, Math.ceil(entries.value.length / pageSize)))
  const visible = computed(() => ordered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
  const disabled = computed(() => cleaner.loading.value || !cleaner.available.value
    || cleaner.busy.value || !!cleaner.review.value || loadingCatalogue.value)
  const pageSelected = computed(() => visible.value.length > 0 && visible.value.every((entry) => selected.value.has(entry.domain)))

  function toggle(domain: string, checked: boolean) {
    const updated = new Set(selected.value)
    if (checked) updated.add(domain)
    else updated.delete(domain)
    selected.value = updated
  }
  function togglePage(checked: boolean) {
    const updated = new Set(selected.value)
    for (const entry of visible.value) {
      if (checked) updated.add(entry.domain)
      else updated.delete(entry.domain)
    }
    selected.value = updated
  }
  async function refresh() {
    if (loadingCatalogue.value) return
    loadingCatalogue.value = true
    notice.value = ''
    try {
      const result = await loadCatalogue()
      entries.value = result.sites
      warnings.value = result.warnings
      if (!result.warnings.length) {
        const domains = new Set(result.sites.map((site) => site.domain))
        const remaining = new Set([...selected.value].filter((domain) => domains.has(domain)))
        if (remaining.size !== selected.value.size) notice.value = 'Selection updated: some sites are no longer in the list.'
        selected.value = remaining
      }
      page.value = Math.min(page.value, pageCount.value)
    } catch (cause) {
      cleaner.error.value = `Could not load sites: ${errorMessage(cause)}`
    } finally {
      loadingCatalogue.value = false
    }
  }
  function reviewSelected() {
    const targets = entries.value.filter((entry) => selected.value.has(entry.domain))
      .map((entry) => ({ domain: entry.domain, origins: [...entry.origins] }))
    if (!targets.length || disabled.value) return
    cleaner.prepareCleanup({ domain: null, period: 'all', thirdParty: cleaner.thirdParty.value, targets })
  }
  function reviewAll() {
    cleaner.prepareCleanup({ domain: null, period: 'all', thirdParty: false })
  }
  watch(order, () => { page.value = 1 })
  watch(() => cleaner.job.value?.status, (status, previous) => {
    if (status === 'complete' && previous === 'running') void refresh()
  })
  onMounted(() => { void refresh() })

  return {
    ...cleaner, entries, warnings, loadingCatalogue, selected, order, page, pageCount,
    visible, disabled, pageSelected, notice, toggle, togglePage, refresh, reviewSelected, reviewAll,
  }
}
