import { website, type Site } from './model.ts'

export const recentSiteLimit = 10

/** Reads the most recently visited distinct sites from Chrome history, newest first. */
export async function loadRecentSites(): Promise<Site[]> {
  const entries = await chrome.history.search({ text: '', startTime: 0, maxResults: 1000 })
  const sites = new Map<string, Site>()
  for (const entry of entries.sort((a, b) => (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0))) {
    const site = entry.url ? website(entry.url) : null
    if (!site) continue
    const known = sites.get(site.domain)
    if (known) {
      if (!known.origins.includes(site.origin)) known.origins.push(site.origin)
    } else if (sites.size < recentSiteLimit) {
      sites.set(site.domain, { domain: site.domain, origins: [site.origin], visitedAt: entry.lastVisitTime ?? 0 })
    }
  }
  return [...sites.values()]
}
