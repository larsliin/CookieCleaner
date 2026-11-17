import { parse } from 'tldts'

export const recentSitesKey = 'recentSites'
export const jobKey = 'cleanupJob'

export const periods = [
  { value: 'all', label: 'All time' },
  { value: 'hour', label: 'Last hour' },
  { value: 'day', label: 'Last 24 hours' },
  { value: 'week', label: 'Last 7 days' },
] as const

export type Period = typeof periods[number]['value']
export interface Site {
  domain: string
  origins: string[]
  visitedAt: number
}
export interface CleanupRequest {
  domain: string | null
  period: Period
}
export interface CleanupStep {
  name: string
  status: 'done' | 'failed' | 'limited'
  detail: string
}
export interface CleanupJob {
  request: CleanupRequest
  startedAt: number
  status: 'running' | 'complete'
  steps: CleanupStep[]
}
export type Reply<T> = { ok: true; value: T } | { ok: false; error: string }

export function website(url: string): { domain: string; origin: string } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  const host = parse(parsed.hostname, { allowPrivateDomains: true })
  if (!host.domain && !host.isIp && parsed.hostname !== 'localhost') return null
  return {
    domain: host.domain ?? parsed.hostname,
    origin: parsed.origin,
  }
}

export function matchesSite(url: string, domain: string | null): boolean {
  const site = website(url)
  return site !== null && (domain === null || site.domain === domain)
}

export function rememberSite(sites: Site[], url: string, now: number): Site[] {
  const site = website(url)
  if (!site) return sites
  const previous = sites.find((item) => item.domain === site.domain)
  return [
    {
      domain: site.domain,
      origins: [...new Set([site.origin, ...(previous?.origins ?? [])])],
      visitedAt: now,
    },
    ...sites.filter((item) => item.domain !== site.domain),
  ].slice(0, 10)
}

export function since(period: Period, now: number): number {
  const durations = { all: 0, hour: 3_600_000, day: 86_400_000, week: 604_800_000 }
  return period === 'all' ? 0 : now - durations[period]
}

export function isCleanupRequest(value: unknown): value is CleanupRequest {
  if (typeof value !== 'object' || value === null) return false
  const request = value as Record<string, unknown>
  const validDomain = request.domain === null || (
    typeof request.domain === 'string'
    && request.domain.length > 0
    && website(`https://${request.domain}`)?.domain === request.domain
    && new URL(`https://${request.domain}`).hostname === request.domain
  )
  return validDomain && periods.some((period) => period.value === request.period)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
