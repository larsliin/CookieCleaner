import { parse } from 'tldts'

export const jobKey = 'cleanupJob'
export const thirdPartyKey = 'removeThirdPartyCookies'
export const thirdPartyGuidance = 'Let the site finish loading and keep its tab open to find cookies from embedded companies, such as advertisers. Undetected cookies may remain. Removing these cookies may affect other sites and sign you out.'

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
  /** Also remove cookies of third parties embedded by the site. Ignored for all websites. */
  thirdParty: boolean
  targets?: CleanupTarget[]
}
export interface CleanupTarget {
  domain: string
  origins: string[]
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
  completedSites?: number
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

export function thirdPartyDomains(urls: Iterable<string>, domain: string): string[] {
  const domains = new Set<string>()
  for (const url of urls) {
    const site = website(url)
    if (site && site.domain !== domain) domains.add(site.domain)
  }
  return [...domains].sort()
}

export function periodLabel(period: Period): string {
  return periods.find((item) => item.value === period)?.label ?? period
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
  const validTargets = request.targets === undefined || (
    request.domain === null && request.period === 'all'
    && Array.isArray(request.targets) && request.targets.length > 0
    && request.targets.every((target: unknown) => {
      if (typeof target !== 'object' || target === null) return false
      const item = target as Record<string, unknown>
      const domain = item.domain
      return typeof domain === 'string'
        && website(`https://${domain}`)?.domain === domain
        && Array.isArray(item.origins)
        && item.origins.every((origin: unknown) => (
          typeof origin === 'string'
          && website(origin)?.origin === origin
          && matchesSite(origin, domain)
        ))
    })
  )
  return validDomain && validTargets
    && typeof request.thirdParty === 'boolean'
    && periods.some((period) => period.value === request.period)
}

export function cleanupScope(request: CleanupRequest): string {
  return request.targets ? `${request.targets.length} selected sites` : request.domain ?? 'All websites'
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
