import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clean } from '../src/cleaner/cleanup.ts'
import { isCleanupRequest, matchesSite, rememberSite, since, website } from '../src/cleaner/model.ts'

test('site boundaries respect public suffixes, private tenants, and unsupported pages', () => {
  assert.equal(website('https://shop.example.co.uk/products')?.domain, 'example.co.uk')
  assert.equal(website('https://alice.github.io')?.domain, 'alice.github.io')
  assert.equal(matchesSite('https://ads.example.com', 'example.com'), true)
  assert.equal(matchesSite('https://notexample.com', 'example.com'), false)
  assert.equal(matchesSite('https://example.com.evil.test', 'example.com'), false)
  assert.equal(matchesSite('chrome://settings', null), false)
  assert.equal(website('not a url'), null)
  assert.equal(isCleanupRequest({ domain: 'co.uk', period: 'all' }), false)
  assert.equal(isCleanupRequest({ domain: 'example.com/path', period: 'all' }), false)
  assert.equal(isCleanupRequest({ domain: '', period: 'all' }), false)
  assert.equal(isCleanupRequest({ domain: null, period: 'forever' }), false)
})

test('recent sites deduplicate, move to front, remember origins, and retain exactly ten', () => {
  let sites = rememberSite([], 'https://shop.example.com/a', 1)
  sites = rememberSite(sites, 'http://www.example.com/b', 2)
  assert.equal(sites.length, 1)
  assert.deepEqual(sites[0]?.origins, ['http://www.example.com', 'https://shop.example.com'])
  for (let index = 0; index < 11; index++) {
    sites = rememberSite(sites, `https://site${index}.com`, index + 3)
  }
  assert.equal(sites.length, 10)
  assert.equal(sites[0]?.domain, 'site10.com')
  assert.equal(sites.at(-1)?.domain, 'site1.com')
  assert.equal(rememberSite(sites, 'chrome://newtab', 20), sites)
})

test('time ranges use exact millisecond thresholds', () => {
  const now = 1_800_000_000_000
  assert.equal(since('all', now), 0)
  assert.equal(since('hour', now), now - 3_600_000)
  assert.equal(since('day', now), now - 86_400_000)
  assert.equal(since('week', now), now - 604_800_000)
})

test('cleanup constrains origins, targets matching frames, and reports partial failures', async () => {
  const calls: unknown[] = []
  Object.assign(globalThis, {
    chrome: {
      tabs: { query: async () => [{ id: 1, url: 'https://shop.example.com' }] },
      webNavigation: {
        getAllFrames: async () => [
          { frameId: 0, url: 'https://shop.example.com' },
          { frameId: 1, url: 'https://advertiser.test' },
        ],
      },
      browsingData: {
        removeCookies: async (options: unknown) => { calls.push(options) },
        removeLocalStorage: async () => { throw new Error('Storage permission denied') },
      },
      scripting: {
        executeScript: async (options: { target: { frameIds: number[] } }) => {
          assert.deepEqual(options.target.frameIds, [0])
          return [{ result: true }]
        },
      },
    },
  })
  const result = await clean({ domain: 'example.com', period: 'hour' }, [], 4_000_000, async () => {})
  assert.deepEqual(calls, [{
    since: 400_000,
    originTypes: { unprotectedWeb: true, protectedWeb: true, extension: false },
    origins: ['https://example.com', 'http://example.com', 'https://shop.example.com'],
  }])
  assert.equal(result.steps[0]?.status, 'done')
  assert.equal(result.steps[1]?.status, 'failed')
  assert.match(result.steps[1]!.detail, /Storage permission denied/)
  assert.match(result.steps[2]!.detail, /Cleared 1 loaded frame/)
})

test('all-sites cleanup omits origin filtering and never claims failed injection succeeded', async () => {
  const optionsSeen: unknown[] = []
  Object.assign(globalThis, {
    chrome: {
      tabs: { query: async () => [{ id: 2, url: 'https://other.test' }] },
      webNavigation: { getAllFrames: async () => [{ frameId: 0, url: 'https://other.test' }] },
      browsingData: {
        removeCookies: async (options: unknown) => { optionsSeen.push(options) },
        removeLocalStorage: async (options: unknown) => { optionsSeen.push(options) },
      },
      scripting: { executeScript: async () => [] },
    },
  })
  const result = await clean({ domain: null, period: 'all' }, [], 100, async () => {})
  assert.equal(optionsSeen.length, 2)
  assert.equal(Object.hasOwn(optionsSeen[0]!, 'origins'), false)
  assert.equal(result.steps[2]?.status, 'failed')
  assert.match(result.steps[2]!.detail, /did not confirm/)
})

test('frame discovery failure is explicit while independent cookie and local cleanup continue', async () => {
  Object.assign(globalThis, {
    chrome: {
      tabs: { query: async () => { throw new Error('Tabs unavailable') } },
      browsingData: {
        removeCookies: async () => {},
        removeLocalStorage: async () => {},
      },
    },
  })
  const result = await clean({ domain: null, period: 'day' }, [], Date.now(), async () => {})
  assert.deepEqual(result.steps.map((step) => step.status), ['done', 'done', 'failed'])
  assert.match(result.steps[2]!.detail, /Tabs unavailable/)
})
