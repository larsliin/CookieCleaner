import {
  errorMessage, matchesSite, since, website,
  type CleanupJob, type CleanupRequest, type CleanupStep, type Site,
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
