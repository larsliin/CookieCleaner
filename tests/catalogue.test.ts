import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadCatalogue, readHistory, sortSites } from '../src/cleaner/catalogue.ts'
import { isCleanupRequest, type CleanupJob } from '../src/cleaner/model.ts'
import { cleanBatch } from '../src/cleaner/batch.ts'

test('catalogue merges sources, preserves cookie-free history and real dates, and respects private tenants', async () => {
  Object.assign(globalThis, {
    chrome: {
      history: { search: async () => [
        { url: 'https://shop.example.co.uk/path', lastVisitTime: 50 },
        { url: 'https://www.example.co.uk/other', lastVisitTime: 100 },
        { url: 'https://alice.github.io/', lastVisitTime: 200 },
        { url: 'https://bob.github.io/', lastVisitTime: 150 },
        { url: 'chrome://settings', lastVisitTime: 300 },
      ] },
      cookies: { getAll: async () => [
        { domain: '.example.co.uk', secure: true },
        { domain: 'ads.example.co.uk', secure: false },
        { domain: '.cookie-only.test', secure: true },
      ] },
      tabs: { query: async () => [{ url: 'http://open.test:8080/path' }] },
    },
  })
  const result = await loadCatalogue()
  assert.deepEqual(result.warnings, [])
  assert.equal(result.sites.length, 5)
  const site = result.sites.find((site) => site.domain === 'example.co.uk')!
  assert.equal(site.visitedAt, 100)
  assert.equal(site.cookieCount, 2)
  assert.ok(site.origins.includes('https://shop.example.co.uk'))
  assert.equal(result.sites.find((site) => site.domain === 'alice.github.io')?.cookieCount, 0)
  assert.equal(result.sites.find((site) => site.domain === 'cookie-only.test')?.visitedAt, null)
  assert.deepEqual(sortSites(result.sites, 'date').map((site) => site.domain), [
    'alice.github.io', 'bob.github.io', 'example.co.uk', 'cookie-only.test', 'open.test',
  ])
  assert.deepEqual(sortSites(result.sites, 'name').map((site) => site.domain), [
    'alice.github.io', 'bob.github.io', 'cookie-only.test', 'example.co.uk', 'open.test',
  ])
})

test('failed cookie enumeration reports unavailable counts, never no cookies', async () => {
  Object.assign(globalThis, {
    chrome: {
      history: { search: async () => [{ url: 'https://example.com', lastVisitTime: 10 }] },
      cookies: { getAll: async () => { throw new Error('Permission missing') } },
      tabs: { query: async () => [] },
      storage: { local: { get: async () => ({}) } },
    },
  })
  const result = await loadCatalogue()
  assert.equal(result.sites[0]?.cookieCount, null)
  assert.match(result.warnings.join(' '), /Permission missing/)
})

test('history discovery splits saturated ranges and overlaps boundaries rather than truncating', async () => {
  const calls: { startTime?: number; endTime?: number }[] = []
  const urls = new Set<string>()
  const warnings = await readHistory(async (query) => {
    calls.push(query)
    assert.equal(query.startTime! >= 0, true)
    assert.equal(query.maxResults, 1000)
    if (query.startTime === 0 && query.endTime === 100) {
      return Array.from({ length: 1000 }, (_, index) => ({ id: String(index), url: `https://site${index}.test`, lastVisitTime: 50 }))
    }
    return [{ id: 'boundary', url: 'https://boundary.test', lastVisitTime: 50 }]
  }, (url) => { urls.add(url) }, 100)
  assert.deepEqual(calls.map(({ startTime, endTime }) => [startTime, endTime]), [[0, 100], [0, 50], [50, 100]])
  assert.equal(urls.size, 1001)
  assert.deepEqual(warnings, [])
  const saturated = await readHistory(async () => Array.from({ length: 1000 }, () => ({ id: 'same' })), () => {}, 1)
  assert.match(saturated.join(''), /incomplete/)
})

test('batch scope validation rejects empty targets, timed batches and unrelated origins', () => {
  const base = { domain: null, period: 'all', thirdParty: true }
  assert.equal(isCleanupRequest({ ...base, targets: [] }), false)
  assert.equal(isCleanupRequest({ ...base, targets: [{ domain: 'example.com', origins: ['https://other.com'] }] }), false)
  assert.equal(isCleanupRequest({ ...base, targets: [{ domain: 'example.com', origins: ['https://example.com/path'] }] }), false)
  assert.equal(isCleanupRequest({ ...base, period: 'hour', targets: [{ domain: 'example.com', origins: [] }] }), false)
  assert.equal(isCleanupRequest({ ...base, targets: [{ domain: 'example.com', origins: ['https://shop.example.com:8080'] }] }), true)
})

test('batch deduplicates domains, targets known origins, publishes progress and continues partial failures', async () => {
  const calls: chrome.browsingData.RemovalOptions[] = []
  const updates: CleanupJob[] = []
  Object.assign(globalThis, {
    chrome: {
      tabs: { query: async () => [] },
      browsingData: {
        removeCookies: async (options: chrome.browsingData.RemovalOptions) => {
          calls.push(options)
          if (options.origins?.includes('https://first.test')) throw new Error('First site failed')
        },
        removeLocalStorage: async () => {},
      },
    },
  })
  const job = await cleanBatch({
    domain: null, period: 'all', thirdParty: false,
    targets: [
      { domain: 'first.test', origins: ['https://first.test:8080'] },
      { domain: 'first.test', origins: ['http://first.test:9000'] },
      { domain: 'second.test', origins: [] },
    ],
  }, [], 100, async (job) => { updates.push(structuredClone(job)) })
  assert.equal(calls.length, 2)
  assert.ok(calls[0]?.origins?.includes('https://first.test:8080'))
  assert.ok(calls[0]?.origins?.includes('http://first.test:9000'))
  assert.equal(calls[0]?.since, 0)
  assert.equal(job.completedSites, 2)
  assert.equal(job.request.targets?.length, 2)
  assert.equal(job.status, 'complete')
  assert.ok(job.steps.some((step) => step.name === 'first.test: Cookies' && step.status === 'failed'))
  assert.ok(job.steps.some((step) => step.name === 'second.test: Cookies' && step.status === 'done'))
  assert.ok(updates.some((job) => job.completedSites === 1))
})
