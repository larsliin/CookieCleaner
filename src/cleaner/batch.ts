import { clean } from './cleanup.ts'
import {
  errorMessage, type CleanupJob, type CleanupRequest, type Site,
} from './model.ts'

export async function cleanBatch(
  request: CleanupRequest,
  sites: Site[],
  startedAt: number,
  publish: (job: CleanupJob) => Promise<void>,
): Promise<CleanupJob> {
  const grouped = new Map<string, Set<string>>()
  for (const target of request.targets ?? []) {
    const origins = grouped.get(target.domain) ?? new Set<string>()
    for (const origin of target.origins) origins.add(origin)
    grouped.set(target.domain, origins)
  }
  const targets = [...grouped].map(([domain, origins]) => ({ domain, origins: [...origins] }))
  let job: CleanupJob = { request: { ...request, targets }, startedAt, status: 'running', steps: [], completedSites: 0 }
  for (const target of targets) {
    const completedSteps = [...job.steps]
    const siteRequest: CleanupRequest = { domain: target.domain, period: 'all', thirdParty: request.thirdParty }
    const knownSites = [...sites, { ...target, visitedAt: 0 }]
    try {
      const result = await clean(siteRequest, knownSites, startedAt, async (steps) => {
        job = {
          ...job,
          steps: [...completedSteps, ...steps.map((step) => ({ ...step, name: `${target.domain}: ${step.name}` }))],
        }
        await publish(job)
      })
      job.steps = [...completedSteps, ...result.steps.map((step) => ({ ...step, name: `${target.domain}: ${step.name}` }))]
    } catch (error) {
      job.steps.push({ name: `${target.domain}: Cleanup`, status: 'failed', detail: errorMessage(error) })
    }
    job = { ...job, completedSites: (job.completedSites ?? 0) + 1 }
    await publish(job)
  }
  return { ...job, status: 'complete' }
}
