import {
  errorMessage, matchesSite, since, thirdPartyDomains, website,
  type CleanupJob, type CleanupRequest, type CleanupStep, type Period, type Site,
} from './model.ts'

interface FrameTarget {
  tabId: number
  frameId: number
  url: string
}

async function findFrames(domain: string | null): Promise<{
  frames: FrameTarget[]
  failures: string[]
}> {
  const tabs = await chrome.tabs.query({})
  const frames: FrameTarget[] = []
  const failures: string[] = []
  await Promise.all(tabs.map(async (tab) => {
    if (tab.id === undefined || !website(tab.url ?? '')) return
    try {
      const entries = await chrome.webNavigation.getAllFrames({ tabId: tab.id })
      if (!entries) throw new Error('Frame list unavailable')
      for (const frame of entries) {
        if (matchesSite(frame.url, domain)) {
          frames.push({ tabId: tab.id, frameId: frame.frameId, url: frame.url })
        }
      }
    } catch (error) {
      failures.push(`Tab ${tab.id}: ${errorMessage(error)}`)
    }
  }))
  return { frames, failures }
}

async function findThirdPartyDomains(domain: string): Promise<{
  domains: string[]
  failures: string[]
}> {
  const tabs = await chrome.tabs.query({})
  const urls: string[] = []
  const failures: string[] = []
  await Promise.all(tabs.map(async (tab) => {
    if (tab.id === undefined || !matchesSite(tab.url ?? '', domain)) return
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => [
          location.href,
          ...performance.getEntriesByType('resource').map((entry) => entry.name),
        ],
      })
      for (const result of results) urls.push(...(result.result as string[] | undefined ?? []))
    } catch (error) {
      failures.push(`Tab ${tab.id}: ${errorMessage(error)}`)
    }
  }))
  return { domains: thirdPartyDomains(urls, domain), failures }
}

async function removePartitionedCookies(domain: string): Promise<number> {
  const topLevelSite = `https://${domain}`
  const cookies = await chrome.cookies.getAll({ partitionKey: { topLevelSite } })
  const partitioned = cookies.filter((cookie) => cookie.partitionKey?.topLevelSite === topLevelSite)
  await Promise.all(partitioned.map((cookie) => chrome.cookies.remove({
    url: `${cookie.secure ? 'https' : 'http'}://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
    name: cookie.name,
    storeId: cookie.storeId,
    partitionKey: cookie.partitionKey,
  })))
  return partitioned.length
}

async function removeThirdPartyCookies(domain: string, period: Period, startedAt: number): Promise<CleanupStep> {
  const failures: string[] = []
  let domains: string[] = []
  let partitioned = 0
  let removedDiscovered = false
  try {
    const found = await findThirdPartyDomains(domain)
    domains = found.domains
    failures.push(...found.failures)
    if (domains.length > 0) {
      await chrome.browsingData.removeCookies({
        since: since(period, startedAt),
        originTypes: { unprotectedWeb: true, protectedWeb: true, extension: false },
        origins: domains.flatMap((item) => [`https://${item}`, `http://${item}`]) as [string, ...string[]],
      })
      removedDiscovered = true
    }
  } catch (error) {
    failures.push(errorMessage(error))
  }
  // Chrome does not expose cookie creation times, so partitioned cookies can only be removed for all time.
  if (period === 'all') {
    try {
      partitioned = await removePartitionedCookies(domain)
    } catch (error) {
      failures.push(`Partitioned cookies: ${errorMessage(error)}`)
    }
  }
  const summary = removedDiscovered || partitioned > 0
    ? 'Third-party cookies removed.'
    : failures.length > 0
      ? 'Third-party cookie cleanup could not be completed.'
      : 'No third-party cookies were found to remove.'
  const discovery = domains.length === 0
    ? ' Open the site and let it finish loading to find cookies from other companies.'
    : ''
  const partition = period === 'all' ? '' : ' Partitioned cookies are only removed for "All time".'
  return {
    name: 'Third-party cookies',
    status: failures.length > 0 ? 'failed' : 'limited',
    detail: `${summary}${discovery}${partition} Cookies from other companies that were not found on an open page may remain.${failures.length ? ` ${failures.join(' ')}` : ''}`,
  }
}

export async function clean(
  request: CleanupRequest,
  sites: Site[],
  startedAt: number,
  publish: (steps: CleanupStep[]) => Promise<void>,
): Promise<CleanupJob> {
  const steps: CleanupStep[] = []
  let frames: FrameTarget[] = []
  let discoveryFailures: string[] = []
  try {
    const found = await findFrames(request.domain)
    frames = found.frames
    discoveryFailures = found.failures
  } catch (error) {
    discoveryFailures = [errorMessage(error)]
  }
  const origins = new Set<string>()
  if (request.domain !== null) {
    origins.add(`http://${request.domain}`)
    origins.add(`https://${request.domain}`)
    for (const site of sites) {
      for (const origin of site.origins) {
        if (matchesSite(origin, request.domain)) origins.add(origin)
      }
    }
    for (const frame of frames) origins.add(new URL(frame.url).origin)
  }
  const options: chrome.browsingData.RemovalOptions = {
    since: since(request.period, startedAt),
    originTypes: { unprotectedWeb: true, protectedWeb: true, extension: false },
    ...(request.domain !== null ? {
      origins: [`https://${request.domain}`, ...[...origins].filter((origin) => origin !== `https://${request.domain}`)] satisfies [string, ...string[]],
    } : {}),
  }
  for (const [name, remove] of [
    ['Cookies', () => chrome.browsingData.removeCookies(options)],
    ['Local storage', () => chrome.browsingData.removeLocalStorage(options)],
  ] as const) {
    try {
      await remove()
      const limited = name === 'Local storage' && request.domain !== null
      steps.push({
        name,
        status: limited ? 'limited' : 'done',
        detail: limited
          ? 'Cleared known origins only. Storage on unobserved subdomains or ports may remain.'
          : request.period === 'all'
            ? 'Chrome completed removal.'
            : 'Chrome completed removal for the selected time range; local storage is removed as whole origin stores.',
      })
    } catch (error) {
      steps.push({ name, status: 'failed', detail: errorMessage(error) })
    }
    await publish([...steps])
  }
  if (request.domain !== null && request.thirdParty) {
    steps.push(await removeThirdPartyCookies(request.domain, request.period, startedAt))
    await publish([...steps])
  }
  const failures = [...discoveryFailures]
  let cleared = 0
  await Promise.all(frames.map(async (frame) => {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: frame.tabId, frameIds: [frame.frameId] },
        func: (expectedOrigin: string) => {
          if (location.origin !== expectedOrigin) {
            throw new Error('The frame navigated before cleanup. Retry for the new page.')
          }
          sessionStorage.clear()
          return sessionStorage.length === 0
        },
        args: [new URL(frame.url).origin],
      })
      if (results.length !== 1 || results[0]?.result !== true) {
        throw new Error('The frame did not confirm session storage removal.')
      }
      cleared++
    } catch (error) {
      failures.push(`Tab ${frame.tabId}, frame ${frame.frameId}: ${errorMessage(error)}`)
    }
  }))
  steps.push({
    name: 'Session storage',
    status: failures.length > 0 ? 'failed' : 'limited',
    detail: `Cleared ${cleared} loaded frame(s), without a time filter. Unloaded pages, closed-tab restore data, and inaccessible frames cannot be cleared.${failures.length ? ` ${failures.join(' ')}` : ''}`,
  })
  return { request, startedAt, status: 'complete', steps }
}
