import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clean } from '../src/cleaner/cleanup.ts'
import { isCleanupRequest, matchesSite, rememberSite, since, thirdPartyDomains, website } from '../src/cleaner/model.ts'

test('site boundaries respect public suffixes, private tenants, and unsupported pages', () => {
  assert.equal(website('https://shop.example.co.uk/products')?.domain, 'example.co.uk')
  assert.equal(website('https://alice.github.io')?.domain, 'alice.github.io')
  assert.equal(matchesSite('https://ads.example.com', 'example.com'), true)
  assert.equal(matchesSite('https://notexample.com', 'example.com'), false)
  assert.equal(matchesSite('https://example.com.evil.test', 'example.com'), false)
  assert.equal(matchesSite('chrome://settings', null), false)
  assert.equal(website('not a url'), null)
  assert.equal(isCleanupRequest({ domain: 'co.uk', period: 'all', thirdParty: false }), false)
  assert.equal(isCleanupRequest({ domain: 'example.com/path', period: 'all', thirdParty: false }), false)
  assert.equal(isCleanupRequest({ domain: '', period: 'all', thirdParty: false }), false)
  assert.equal(isCleanupRequest({ domain: null, period: 'forever', thirdParty: false }), false)
  assert.equal(isCleanupRequest({ domain: 'example.com', period: 'all' }), false)
  assert.equal(isCleanupRequest({ domain: 'example.com', period: 'all', thirdParty: true }), true)
})

test('third-party domains exclude the site itself, its subdomains, and non-web URLs', () => {
  assert.deepEqual(thirdPartyDomains([
    'https://shop.example.com/page',
    'https://cdn.example.com/app.js',
    'https://pixel.tracker.net/p.gif',
    'https://ads.tracker.net/ad.js',
    'https://cdn.partner.co.uk/x',
    'data:image/png;base64,AAAA',
  ], 'example.com'), ['partner.co.uk', 'tracker.net'])
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
  const result = await clean({ domain: 'example.com', period: 'hour', thirdParty: false }, [], 4_000_000, async () => {})
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
  const result = await clean({ domain: null, period: 'all', thirdParty: true }, [], 100, async () => {})
  assert.equal(optionsSeen.length, 2)
  assert.equal(result.steps.some((step) => step.name === 'Third-party cookies'), false)
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
  const result = await clean({ domain: null, period: 'day', thirdParty: false }, [], Date.now(), async () => {})
  assert.deepEqual(result.steps.map((step) => step.status), ['done', 'done', 'failed'])
  assert.match(result.steps[2]!.detail, /Tabs unavailable/)
})

test('third-party cleanup removes discovered tracker cookies and cookies partitioned under the site', async () => {
  const cookieCalls: unknown[] = []
  const removed: unknown[] = []
  Object.assign(globalThis, {
    chrome: {
      tabs: { query: async () => [{ id: 1, url: 'https://shop.example.com' }, { id: 2, url: 'https://other.test' }] },
      webNavigation: { getAllFrames: async () => [{ frameId: 0, url: 'https://shop.example.com' }] },
      browsingData: {
        removeCookies: async (options: unknown) => { cookieCalls.push(options) },
        removeLocalStorage: async () => {},
      },
      scripting: {
        executeScript: async (options: { target: { tabId: number; allFrames?: boolean } }) => {
          if (!options.target.allFrames) return [{ result: true }]
          assert.equal(options.target.tabId, 1)
          return [
            { result: ['https://shop.example.com/', 'https://pixel.tracker.net/p.gif'] },
            { result: ['https://ads.vendor.test/frame', 'https://cdn.example.com/a.js'] },
          ]
        },
      },
      cookies: {
        getAll: async () => [
          { name: 'p', domain: '.tracker.net', path: '/', secure: true, storeId: '0', partitionKey: { topLevelSite: 'https://example.com' } },
          { name: 'u', domain: 'unpartitioned.test', path: '/', secure: false, storeId: '0' },
        ],
        remove: async (details: unknown) => { removed.push(details) },
      },
    },
  })
  const result = await clean({ domain: 'example.com', period: 'all', thirdParty: true }, [], 100, async () => {})
  assert.deepEqual((cookieCalls[1] as { origins: string[] }).origins, [
    'https://tracker.net', 'http://tracker.net', 'https://vendor.test', 'http://vendor.test',
  ])
  assert.deepEqual(removed, [{
    url: 'https://tracker.net/', name: 'p', storeId: '0', partitionKey: { topLevelSite: 'https://example.com' },
  }])
  const step = result.steps.find((item) => item.name === 'Third-party cookies')
  assert.equal(step?.status, 'limited')
  assert.match(step!.detail, /2 other website\(s\).*tracker\.net, vendor\.test/)
  assert.match(step!.detail, /1 partitioned cookie/)
})
