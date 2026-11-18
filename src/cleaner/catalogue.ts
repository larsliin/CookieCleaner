import { errorMessage, website } from './model.ts'

export interface DomainEntry {
  domain: string
  origins: string[]
  visitedAt: number | null
  cookieCount: number | null
}
export interface Catalogue {
  sites: DomainEntry[]
  warnings: string[]
}
export type SortOrder = 'date' | 'name'

export function sortSites(sites: DomainEntry[], order: SortOrder): DomainEntry[] {
  return [...sites].sort((a, b) => (
    order === 'date' ? (b.visitedAt ?? -1) - (a.visitedAt ?? -1) : 0
  ) || a.domain.localeCompare(b.domain))
}

type SearchHistory = (query: chrome.history.HistoryQuery) => Promise<chrome.history.HistoryItem[]>

export async function readHistory(
  search: SearchHistory,
  add: (url: string, visitedAt: number | null) => void,
  now = Date.now(),
): Promise<string[]> {
  const limit = 1000
  const warnings: string[] = []
  async function read(startTime: number, endTime: number): Promise<void> {
    const entries = await search({ text: '', startTime, endTime, maxResults: limit })
    for (const entry of entries) {
      if (entry.url) add(entry.url, entry.lastVisitTime ?? null)
    }
    if (entries.length < limit) return
    if (endTime - startTime <= 1) {
      warnings.push('Some history entries share a saturated timestamp. The domain list may be incomplete.')
      return
    }
    // Overlap boundaries; domain/origin aggregation deduplicates results.
    const middle = Math.floor((startTime + endTime) / 2)
    await read(startTime, middle)
    await read(middle, endTime)
  }
  await read(0, now)
  return warnings
}

export async function loadCatalogue(): Promise<Catalogue> {
  const entries = new Map<string, DomainEntry>()
  const warnings: string[] = []
  function add(url: string, visitedAt: number | null = null) {
    const site = website(url)
    if (!site) return
    const previous = entries.get(site.domain)
    if (previous) {
      if (!previous.origins.includes(site.origin)) previous.origins.push(site.origin)
      if (visitedAt !== null) previous.visitedAt = Math.max(previous.visitedAt ?? 0, visitedAt)
    } else {
      entries.set(site.domain, { domain: site.domain, origins: [site.origin], visitedAt, cookieCount: 0 })
    }
  }
  let cookiesAvailable = true
  await Promise.all([
    (async () => {
      try {
        warnings.push(...await readHistory((query) => chrome.history.search(query), add))
      } catch (error) {
        warnings.push(`History could not be fully read: ${errorMessage(error)}`)
      }
    })(),
    (async () => {
      try {
        const cookies = await chrome.cookies.getAll({})
        for (const cookie of cookies) {
          const url = `${cookie.secure ? 'https' : 'http'}://${cookie.domain.replace(/^\./, '')}`
          const site = website(url)
          if (!site) continue
          // Cookie hosts do not prove which protocol/port has local storage.
          add(url)
          const entry = entries.get(site.domain)!
          entry.cookieCount = (entry.cookieCount ?? 0) + 1
        }
      } catch (error) {
        cookiesAvailable = false
        warnings.push(`Cookie counts unavailable: ${errorMessage(error)}`)
      }
    })(),
    (async () => {
      try {
        for (const tab of await chrome.tabs.query({})) if (tab.url) add(tab.url)
      } catch (error) {
        warnings.push(`Open tabs unavailable: ${errorMessage(error)}`)
      }
    })(),
  ])
  return {
    sites: [...entries.values()].map((entry) => ({
      ...entry, cookieCount: cookiesAvailable ? entry.cookieCount : null,
    })),
    warnings,
  }
}
