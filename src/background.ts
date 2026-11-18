import { clean } from './cleaner/cleanup.ts'
import { cleanBatch } from './cleaner/batch.ts'
import {
  errorMessage, isCleanupRequest, jobKey, recentSitesKey, rememberSite,
  type CleanupJob, type CleanupRequest, type Reply, type Site,
} from './cleaner/model.ts'

let running = false
let visitQueue = Promise.resolve()

const ready = (async () => {
  const stored = await chrome.storage.session.get(jobKey)
  const job = stored[jobKey] as CleanupJob | undefined
  if (job?.status === 'running') {
    await chrome.storage.session.set({
      [jobKey]: {
        ...job,
        status: 'complete',
        steps: [...job.steps, {
          name: 'Cleanup interrupted',
          status: 'failed',
          detail: 'The background worker restarted. Some data may have been removed; review and retry.',
        }],
      } satisfies CleanupJob,
    })
  }
})()

chrome.webNavigation.onCommitted.addListener((event) => {
  if (event.frameId !== 0) return
  visitQueue = visitQueue.then(async () => {
    const stored = await chrome.storage.local.get(recentSitesKey)
    const sites = (stored[recentSitesKey] ?? []) as Site[]
    const updated = rememberSite(sites, event.url, event.timeStamp)
    if (updated !== sites) await chrome.storage.local.set({ [recentSitesKey]: updated })
  }).catch((error: unknown) => {
    console.error('Could not save recent websites:', errorMessage(error))
  })
})

async function runCleanup(request: CleanupRequest): Promise<CleanupJob> {
  await ready
  if (running) throw new Error('A cleanup is already running.')
  running = true
  const startedAt = Date.now()
  let job: CleanupJob = { request, startedAt, status: 'running', steps: [] }
  try {
    await chrome.storage.session.set({ [jobKey]: job })
    await visitQueue
    const stored = await chrome.storage.local.get(recentSitesKey)
    const sites = (stored[recentSitesKey] ?? []) as Site[]
    if (request.targets) {
      job = await cleanBatch(request, sites, startedAt, async (updated) => {
        job = updated
        await chrome.storage.session.set({ [jobKey]: job })
      })
    } else {
      job = await clean(request, sites, startedAt, async (steps) => {
        job = { ...job, steps }
        await chrome.storage.session.set({ [jobKey]: job })
      })
    }
    await chrome.storage.session.set({ [jobKey]: job })
    return job
  } catch (error) {
    job = {
      ...job,
      status: 'complete',
      steps: [...job.steps, { name: 'Cleanup', status: 'failed', detail: errorMessage(error) }],
    }
    await chrome.storage.session.set({ [jobKey]: job })
    return job
  } finally {
    running = false
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (reply: Reply<CleanupJob | null>) => void) => {
  if (sender.id !== chrome.runtime.id || typeof message !== 'object' || message === null) return
  const command = message as Record<string, unknown>
  if (command.type === 'status') {
    void ready.then(async () => {
      const stored = await chrome.storage.session.get(jobKey)
      sendResponse({ ok: true, value: (stored[jobKey] ?? null) as CleanupJob | null })
    }).catch((error: unknown) => sendResponse({ ok: false, error: errorMessage(error) }))
    return true
  }
  if (command.type !== 'clean') return
  if (!isCleanupRequest(command.request)) {
    sendResponse({ ok: false, error: 'Invalid cleanup scope. Nothing was removed.' })
    return
  }
  void runCleanup(command.request).then(
    (value) => sendResponse({ ok: true, value }),
    (error: unknown) => sendResponse({ ok: false, error: errorMessage(error) }),
  )
  return true
})
