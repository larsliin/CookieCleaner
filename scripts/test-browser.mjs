import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

// A disposable profile and local fixture hosts keep destructive tests away from real browsing data.
const profile = await mkdtemp(path.join(tmpdir(), 'cookie-cleaner-test-'))
const extensionPath = path.resolve('dist-extension')
const pixel = Buffer.from('R0lGODlhAQABAAAAACw=', 'base64')
const server = createServer((request, response) => {
  if (request.url === '/pixel.gif') {
    response.setHeader('Content-Type', 'image/gif')
    response.end(pixel)
    return
  }
  response.setHeader('Content-Type', 'text/html')
  const port = server.address().port
  response.end(`<html><head><title>Cleanup fixture</title></head><body>
    <h1>Storage fixture</h1>
    ${request.url === '/with-frame' ? `<iframe src="http://frame.cleaner.test:${port}/"></iframe>
      <img alt="" src="http://pixel.tracker.test:${port}/pixel.gif">` : ''}
    </body></html>`)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
let context
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--host-resolver-rules=MAP *.test 127.0.0.1',
      '--no-proxy-server',
    ],
  })
  const worker = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker', { timeout: 15_000 })
  await worker.evaluate(async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (chrome.webNavigation.onCommitted.hasListeners()) return
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error('Extension navigation listener did not become ready')
  })
  const extensionId = new URL(worker.url()).host
  const port = server.address().port
  const url = (host) => `http://${host}:${port}`
  const selected = await context.newPage()
  await selected.goto(`${url('shop.cleaner.test')}/with-frame`)
  await worker.evaluate(() => chrome.action.openPopup())
  const cdp = await context.newCDPSession(selected)
  const { targetInfos } = await cdp.send('Target.getTargets')
  const actionPopup = targetInfos.find((target) => target.url === `chrome-extension://${extensionId}/index.html`)
  assert.ok(actionPopup, 'The actual toolbar popup must open')
  // Toolbar popup targets are not exposed as Playwright pages.
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: actionPopup.targetId, flatten: false })
  const measurement = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Toolbar popup measurement timed out')), 10_000)
    cdp.on('Target.receivedMessageFromTarget', (event) => {
      if (event.sessionId !== sessionId) return
      const message = JSON.parse(event.message)
      if (message.id !== 1) return
      clearTimeout(timer)
      if (message.error || message.result.exceptionDetails) {
        reject(new Error(JSON.stringify(message)))
      } else {
        resolve(message.result.result.value)
      }
    })
  })
  await cdp.send('Target.sendMessageToTarget', {
    sessionId,
    message: JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `new Promise(resolve => {
          function measure() {
            if (!document.querySelector('main')) return setTimeout(measure, 25);
            requestAnimationFrame(() => requestAnimationFrame(() => resolve({
              viewport: innerWidth,
              body: document.body.getBoundingClientRect().width,
              height: document.body.getBoundingClientRect().height,
              scroll: document.documentElement.scrollWidth
            })));
          }
          measure();
        })`,
        awaitPromise: true,
        returnByValue: true,
      },
    }),
  })
  const actionWidth = await measurement
  assert.equal(actionWidth.body, 420, `Toolbar popup width: ${JSON.stringify(actionWidth)}`)
  assert.ok(actionWidth.viewport >= 420, `Toolbar popup viewport: ${JSON.stringify(actionWidth)}`)
  assert.equal(actionWidth.scroll, actionWidth.viewport, 'Toolbar popup must not overflow horizontally')
  assert.ok(actionWidth.height >= 480 && actionWidth.height <= 600, `Toolbar popup height: ${JSON.stringify(actionWidth)}`)
  await cdp.send('Target.closeTarget', { targetId: actionPopup.targetId })
  await cdp.detach()
  console.log('PASS actual toolbar popup opens at 420px with a fixed 480-600px height and no horizontal overflow')
  await selected.waitForSelector('iframe')
  const frame = selected.frames().find((item) => item.url().includes('frame.cleaner.test'))
  assert.ok(frame)
  const unrelated = await context.newPage()
  await unrelated.goto(url('unrelated.test'))
  const tracker = await context.newPage()
  await tracker.goto(url('pixel.tracker.test'))
  async function seed(page, value) {
    await page.evaluate((value) => {
      localStorage.setItem('sentinel', value)
      sessionStorage.setItem('sentinel', value)
      document.cookie = `sentinel=${value}; path=/`
    }, value)
  }
  async function data(page) {
    return page.evaluate(() => ({
      local: localStorage.getItem('sentinel'),
      session: sessionStorage.getItem('sentinel'),
      cookie: document.cookie.includes('sentinel='),
    }))
  }
  async function completedJob(after) {
    return worker.evaluate(async (after) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        const { cleanupJob } = await chrome.storage.session.get('cleanupJob')
        if (cleanupJob?.startedAt >= after && cleanupJob.status === 'complete') return cleanupJob
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      throw new Error('Cleanup did not complete')
    }, after)
  }
  let popup
  async function openPopup() {
    await popup?.close()
    popup = await context.newPage()
    await selected.bringToFront()
    await popup.goto(`chrome-extension://${extensionId}/index.html`)
    await popup.waitForFunction(() => document.querySelector('main')?.getAttribute('aria-busy') === 'false')
  }
  async function confirmCleanup(open) {
    const after = await worker.evaluate(() => Date.now())
    await open()
    await dialog().getByRole('button', { name: 'Confirm removal', exact: true }).click()
    await dialog().waitFor({ state: 'hidden' })
    return completedJob(after)
  }
  const siteHero = () => popup.getByRole('button', { name: /^Clean this site/ })
  const allHero = () => popup.getByRole('button', { name: /^Clear cookies & site data/ })
  const dialog = () => popup.getByRole('dialog')
  const thirdPartySwitch = () => popup.getByLabel('Also remove third-party cookies')
  const reminder = (page) => page.getByRole('status').filter({ hasText: 'Open the website you want to clean' })

  await seed(selected, 'selected')
  await seed(frame, 'frame')
  await seed(unrelated, 'unrelated')
  await seed(tracker, 'tracker')
  await selected.evaluate(() => { document.cookie = 'parent=keep; domain=cleaner.test; path=/' })
  await worker.evaluate((origin) => chrome.cookies.set({
    url: origin, name: 'hidden', value: 'keep', httpOnly: true, path: '/hidden',
  }), url('shop.cleaner.test'))
  await openPopup()
  const recentRow = (domain) => popup.getByRole('region', { name: 'Recent sites', exact: true })
    .getByRole('listitem').filter({ has: popup.getByRole('heading', { name: domain, exact: true }) })
  await recentRow('cleaner.test').getByText('4 cookies', { exact: true }).waitFor()
  await recentRow('tracker.test').getByText('1 cookie', { exact: true }).waitFor()
  const allSection = popup.getByRole('region', { name: 'All websites', exact: true })
  const individualSection = popup.getByRole('region', { name: 'Individual websites', exact: true })
  assert.equal(await allSection.locator('#period').count(), 1)
  assert.equal(await individualSection.locator('#period').count(), 0)
  assert.equal(await individualSection.getByLabel('Also remove third-party cookies').count(), 1)
  const [siteBox, allBox, optionsBox] = await Promise.all([
    siteHero().boundingBox(), allHero().boundingBox(), popup.locator('#period').boundingBox(),
  ])
  assert.ok(allBox.y < optionsBox.y && optionsBox.y < siteBox.y, 'Global hero must precede its time range, followed by individual-site actions')
  assert.ok(siteBox.width < allBox.width / 2, 'Current-site action must be compact, not a second hero')
  await popup.locator('#period').selectOption('hour')
  assert.match(await allHero().textContent(), /Last hour/)
  await siteHero().click()
  await dialog().getByText('Clean this site?', { exact: true }).waitFor()
  await dialog().getByText('All time · Cookies, local storage, session storage', { exact: true }).waitFor()
  const dialogBox = await dialog().boundingBox()
  const viewport = await popup.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  assert.equal(await dialog().evaluate((element) => getComputedStyle(element).position), 'fixed')
  assert.ok(Math.abs(dialogBox.x + dialogBox.width / 2 - viewport.width / 2) <= 1, 'Dialog must be horizontally centered')
  assert.ok(Math.abs(dialogBox.y + dialogBox.height / 2 - viewport.height / 2) <= 1, 'Dialog must be vertically centered')
  assert.equal(await popup.evaluate(() => document.activeElement?.textContent?.trim()), 'Cancel')
  assert.equal(await allHero().isDisabled(), true)
  await popup.keyboard.press('Escape')
  await dialog().waitFor({ state: 'hidden' })
  await allHero().click()
  await dialog().getByText('All websites in this Chrome profile', { exact: true }).waitFor()
  await dialog().getByText('Last hour · Cookies, local storage, session storage', { exact: true }).waitFor()
  await dialog().getByRole('button', { name: 'Cancel', exact: true }).click()
  await dialog().waitFor({ state: 'hidden' })
  assert.equal(await popup.locator('#period').inputValue(), 'hour')
  assert.deepEqual(await data(selected), { local: 'selected', session: 'selected', cookie: true })
  console.log('PASS distinct groups: time range affects only all websites; centered confirmation and cancellation remain safe')

  const siteJob = await confirmCleanup(() => siteHero().click())
  assert.deepEqual(siteJob.request, { domain: 'cleaner.test', period: 'all', thirdParty: false })
  await popup.getByRole('heading', { name: 'Cookies removed', exact: true }).waitFor()
  assert.equal(await popup.locator('.result').getByText('Cookies: completed', { exact: true }).count(), 0)
  assert.doesNotMatch(await popup.locator('.result').textContent(), /third-party cookies/i)
  await popup.getByText('Local storage: limited', { exact: true }).waitFor()
  await popup.getByText('Session storage: limited', { exact: true }).waitFor()
  await recentRow('cleaner.test').getByText('0 cookies', { exact: true }).waitFor()
  await recentRow('tracker.test').getByText('1 cookie', { exact: true }).waitFor()
  await selected.evaluate(() => { document.cookie = 'sentinel=recreated; path=/' })
  await recentRow('cleaner.test').getByText('1 cookie', { exact: true }).waitFor()
  await worker.evaluate((origin) => chrome.cookies.remove({ url: origin, name: 'sentinel' }), url('shop.cleaner.test'))
  await recentRow('cleaner.test').getByText('0 cookies', { exact: true }).waitFor()
  console.log('PASS recent cookie counts include subdomains and HttpOnly paths, update after cleanup and recreation, and exclude third parties')
  await openPopup()
  assert.equal(await popup.locator('#result-title').count(), 0, 'Completed results must not reappear after reopening')
  assert.deepEqual(await data(selected), { local: null, session: null, cookie: false })
  assert.deepEqual(await data(frame), { local: null, session: null, cookie: false })
  assert.deepEqual(await data(unrelated), { local: 'unrelated', session: 'unrelated', cookie: true })
  assert.deepEqual(await data(tracker), { local: 'tracker', session: 'tracker', cookie: true })
  assert.equal(await selected.evaluate(() => document.cookie.includes('parent=')), false)
  console.log('PASS site cleanup covers subdomains and open frames, keeps unrelated sites and third parties when off')

  await seed(selected, 'selected')
  await popup.getByText('Also remove third-party cookies', { exact: true }).click()
  await reminder(popup).waitFor()
  assert.equal(await reminder(popup).getByText("Open the website you want to clean and keep its tab open so we can find advertisers' cookies. Removing them may sign you out of other sites.", { exact: true }).count(), 1)
  await reminder(popup).getByRole('button').click()
  assert.equal(await reminder(popup).count(), 0)
  assert.equal(await thirdPartySwitch().isChecked(), true)
  await openPopup()
  assert.equal(await thirdPartySwitch().isChecked(), true, 'Third-party switch must persist')
  assert.equal(await reminder(popup).count(), 0, 'Reopening must not trigger the reminder')
  await popup.locator('#period').selectOption('week')
  const thirdPartyJob = await confirmCleanup(async () => {
    await siteHero().click()
    await dialog().getByText('Third-party cookies:', { exact: false }).waitFor()
  })
  assert.deepEqual(thirdPartyJob.request, { domain: 'cleaner.test', period: 'all', thirdParty: true })
  assert.match(thirdPartyJob.steps.find((step) => step.name === 'Third-party cookies').detail, /^Third-party cookies removed\./)
  await popup.locator('.result').getByText(/^Third-party cookies removed\./).waitFor()
  assert.doesNotMatch(await popup.locator('.result').textContent(), /tracker\.test|Removed cookies from/)
  assert.match(await popup.locator('.result').textContent(), /not found on an open page may remain/)
  assert.deepEqual(await data(tracker), { local: 'tracker', session: 'tracker', cookie: false })
  assert.deepEqual(await data(unrelated), { local: 'unrelated', session: 'unrelated', cookie: true })
  console.log('PASS persisted third-party switch removes cookies of trackers loaded by the site only')

  for (const period of ['hour', 'day', 'week', 'all']) {
    await seed(selected, period)
    await seed(unrelated, period)
    await popup.locator('#period').selectOption(period)
    const job = await confirmCleanup(() => allHero().click())
    assert.deepEqual(job.request, { domain: null, period, thirdParty: false })
    await popup.getByRole('heading', { name: 'Cookies removed, including third-party cookies', exact: true }).waitFor()
    assert.equal(await popup.locator('.result .done').count(), 0)
    assert.deepEqual(await data(selected), { local: null, session: null, cookie: false })
    assert.deepEqual(await data(unrelated), { local: null, session: null, cookie: false })
    console.log(`PASS all-sites cleanup: ${period}`)
  }
  for (const colorScheme of ['light', 'dark']) {
    await popup.emulateMedia({ colorScheme })
    await popup.waitForFunction((dark) => (
      dark ? !document.documentElement.hasAttribute('data-theme')
        : document.documentElement.getAttribute('data-theme') === 'light'
    ), colorScheme === 'dark')
    assert.equal(await popup.evaluate(() => document.body.scrollWidth <= 420), true)
  }
  await popup.getByText('Session storage: limited', { exact: true }).waitFor()
  await popup.getByRole('button', { name: 'Dismiss result', exact: true }).click()
  await popup.locator('#result-title').waitFor({ state: 'detached' })
  assert.equal(await worker.evaluate(async () => (await chrome.storage.session.get('cleanupJob')).cleanupJob), undefined)
  await worker.evaluate((job) => chrome.storage.session.set({ cleanupJob: job }), siteJob)
  await popup.reload()
  await popup.waitForFunction(() => document.querySelector('main')?.getAttribute('aria-busy') === 'false')
  assert.equal(await popup.locator('#result-title').count(), 0, 'Completed results must not reappear after reloading')
  console.log('PASS live light/dark mode, popup width, dismissing live results, and hiding saved results after reloading')

  for (let index = 0; index < 12; index++) {
    await unrelated.goto(url(`site${index}.test`))
  }
  await openPopup()
  const rows = popup.locator('section[aria-labelledby="recent-title"] > ul > li')
  assert.equal(await rows.count(), 10)
  assert.match(await rows.first().textContent(), /site11\.test/)
  const recent = await worker.evaluate(async () => (await chrome.storage.local.get('recentSites')).recentSites)
  assert.equal(new Set(recent.map((site) => site.domain)).size, 10)
  const openedWebsitePromise = context.waitForEvent('page')
  await popup.getByRole('button', { name: 'Open site5.test', exact: true }).click()
  const openedWebsite = await openedWebsitePromise
  await openedWebsite.waitForURL(`${url('site5.test')}/`)
  assert.equal(await dialog().isVisible(), false, 'Opening a recent website must not start cleanup')
  assert.equal(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await openedWebsite.close()
  console.log('PASS recent-site open button opens the recorded website address in a new tab without cleanup or popup overflow')
  await popup.locator('#period').selectOption('day')
  const recentJob = await confirmCleanup(async () => {
    await popup.getByRole('button', { name: 'Clean site5.test', exact: true }).click()
    await dialog().getByText('site5.test', { exact: true }).waitFor()
    await dialog().getByText('All time · Cookies, local storage, session storage', { exact: true }).waitFor()
    await dialog().getByText('Third-party cookies:', { exact: false }).waitFor()
  })
  assert.deepEqual(recentJob.request, { domain: 'site5.test', period: 'all', thirdParty: true })
  await popup.locator('.result').getByText(/^No third-party cookies were found to remove\./).waitFor()
  assert.doesNotMatch(await popup.locator('.result').textContent(), /Third-party cookies removed\./)
  await popup.getByText('Also remove third-party cookies', { exact: true }).click()
  const recentWithoutThirdParty = await confirmCleanup(() => popup.getByRole('button', { name: 'Clean site5.test', exact: true }).click())
  assert.deepEqual(recentWithoutThirdParty.request, { domain: 'site5.test', period: 'all', thirdParty: false })
  assert.equal(await popup.locator('#period').inputValue(), 'day')
  console.log('PASS recent sites always use all time and the shared third-party setting, independently of global time range')

  const countsFailure = await context.newPage()
  await countsFailure.addInitScript(() => {
    chrome.cookies.getAll = async () => { throw new Error('Simulated cookie count failure') }
  })
  await countsFailure.goto(`chrome-extension://${extensionId}/index.html`)
  await countsFailure.getByText('Cookie counts unavailable: Simulated cookie count failure', { exact: true }).waitFor()
  const failedCountRow = countsFailure.getByRole('listitem').filter({
    has: countsFailure.getByRole('heading', { name: 'site5.test', exact: true }),
  })
  await failedCountRow.getByText('Count unavailable', { exact: true }).waitFor()
  assert.equal(await failedCountRow.getByText('0 cookies', { exact: true }).count(), 0)
  await countsFailure.close()
  console.log('PASS failed recent cookie counts are explicitly unavailable, not zero')

  await popup.bringToFront()
  await popup.reload()
  await popup.waitForFunction(() => document.querySelector('main')?.getAttribute('aria-busy') === 'false')
  await popup.getByRole('region', { name: 'Individual websites', exact: true })
    .getByText('This tab is not a supported website', { exact: true }).waitFor()
  assert.equal(await siteHero().isDisabled(), true)
  assert.equal(await popup.getByRole('button', { name: 'Clean site5.test', exact: true }).isEnabled(), true)
  console.log('PASS unsupported current page still permits recent sites and all websites')
  await worker.evaluate(() => chrome.storage.local.remove('recentSites'))
  await popup.reload()
  await popup.getByText('Recent sites appear here', { exact: false }).waitFor()
  assert.equal(await allHero().isEnabled(), true)
  await allHero().click()
  await dialog().getByText('All websites in this Chrome profile', { exact: true }).waitFor()
  await dialog().getByRole('button', { name: 'Cancel', exact: true }).click()
  console.log('PASS global cleanup remains available without a current or recent site')

  const failedJob = {
    ...siteJob,
    startedAt: Date.now(),
    steps: [{ name: 'Cleanup', status: 'failed', detail: 'Simulated cleanup failure' }],
  }
  await popup.close()
  await worker.evaluate((job) => chrome.storage.session.set({ cleanupJob: job }), failedJob)
  await openPopup()
  assert.equal(await popup.locator('#result-title').count(), 0, 'Errors completed while closed must not reappear')

  await popup.close()
  const runningJob = { ...failedJob, status: 'running', steps: [] }
  await worker.evaluate((job) => chrome.storage.session.set({ cleanupJob: job }), runningJob)
  popup = await context.newPage()
  await selected.bringToFront()
  await popup.goto(`chrome-extension://${extensionId}/index.html`)
  await popup.getByRole('heading', { name: 'Cleaning in the background...', exact: true }).waitFor()
  assert.equal(await allHero().isDisabled(), true, 'A restored running job must block duplicate cleanup')
  await worker.evaluate((job) => chrome.storage.session.set({ cleanupJob: job }), failedJob)
  await popup.getByRole('heading', { name: 'Cleanup finished with errors', exact: true }).waitFor()
  await popup.getByText('Simulated cleanup failure', { exact: true }).waitFor()
  assert.equal(await popup.getByRole('heading', { name: /^Cookies removed/ }).count(), 0)
  await popup.getByRole('button', { name: 'Dismiss result', exact: true }).click()
  await popup.locator('#result-title').waitFor({ state: 'detached' })
  await popup.waitForFunction(() => document.querySelector('main')?.getAttribute('aria-busy') === 'false')
  assert.equal(await allHero().isEnabled(), true)
  console.log('PASS hidden background-completed errors, restored running jobs, duplicate protection, and live failure feedback')

  await worker.evaluate(async (port) => {
    for (let index = 0; index < 55; index++) {
      await chrome.history.addUrl({ url: `http://aaa${String(index).padStart(2, '0')}.test:${port}/history-fixture` })
    }
    for (const domain of ['aaa00.test', 'aaa30.test', 'aaa50.test']) {
      await chrome.cookies.set({ url: `http://${domain}:${port}`, name: 'sentinel', value: 'keep', path: '/' })
    }
  }, port)
  const managerPromise = context.waitForEvent('page')
  await popup.getByRole('button', { name: 'See all', exact: true }).click()
  const manager = await managerPromise
  await manager.waitForURL(`chrome-extension://${extensionId}/index.html?page=sites`)
  await manager.waitForFunction(() => document.querySelector('main')?.getAttribute('aria-busy') === 'false')
  await manager.getByRole('heading', { name: 'All sites', exact: true }).waitFor()
  assert.ok(await manager.locator('main').evaluate((element) => element.getBoundingClientRect().width) > 420)
  const managerDialog = () => manager.getByRole('dialog')
  const managerRows = () => manager.locator('.domain-list .rows > li')
  const managerSwitch = () => manager.getByLabel('Also remove third-party cookies')
  await manager.locator('#sort').selectOption('name')
  assert.equal(await managerRows().count(), 25)
  assert.match(await managerRows().first().textContent(), /aaa00\.test/)
  await manager.getByLabel('Select page', { exact: true }).check()
  await manager.getByText('25 selected', { exact: true }).waitFor()
  await manager.getByRole('button', { name: 'Next', exact: true }).click()
  assert.equal(await manager.getByLabel('Select page', { exact: true }).isChecked(), false)
  await manager.getByRole('button', { name: 'Clear selection', exact: true }).click()
  await manager.getByRole('button', { name: 'Previous', exact: true }).click()
  await manager.getByLabel('Select aaa00.test', { exact: true }).check()
  await manager.getByRole('button', { name: 'Next', exact: true }).click()
  await manager.getByLabel('Select aaa30.test', { exact: true }).check()
  await manager.getByText('2 selected', { exact: true }).waitFor()
  await manager.locator('#sort').selectOption('date')
  await manager.getByText('2 selected', { exact: true }).waitFor()
  assert.match(await managerRows().first().textContent(), /aaa54\.test/)
  await manager.locator('#sort').selectOption('name')
  assert.equal(await manager.getByLabel('Select aaa00.test', { exact: true }).isChecked(), true)
  await managerRows().filter({ hasText: 'aaa01.test' }).getByText('No cookies', { exact: true }).waitFor()
  console.log('PASS See all opens a full-width tab with history, No cookies, 25-row pagination, sorting and cross-page selection')

  await manager.getByText('Also remove third-party cookies', { exact: true }).click()
  await reminder(manager).waitFor()
  assert.match(await reminder(manager).textContent(), /let it finish loading/)
  await popup.waitForFunction(() => document.querySelector('#third-party').checked)
  assert.equal(await reminder(popup).count(), 0, 'Synchronizing ON must not trigger another reminder')
  assert.equal(await managerSwitch().isChecked(), true)
  await popup.getByText('Also remove third-party cookies', { exact: true }).click()
  await manager.waitForFunction(() => !document.querySelector('#third-party').checked)
  assert.equal(await reminder(popup).count(), 0, 'Switching OFF must not show a reminder')
  console.log('PASS third-party setting synchronizes between popup and list tab')

  const batchPages = []
  for (const host of ['aaa00.test', 'aaa30.test', 'aaa50.test']) {
    const fixture = await context.newPage()
    await fixture.goto(url(host))
    await seed(fixture, host)
    batchPages.push(fixture)
  }
  await manager.getByRole('button', { name: 'Clean selected sites', exact: true }).click()
  await managerDialog().getByText('2 selected sites', { exact: true }).waitFor()
  await managerDialog().getByText('aaa00.test', { exact: true }).waitFor()
  await managerDialog().getByText('aaa30.test', { exact: true }).waitFor()
  await managerDialog().getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal((await context.cookies(url('aaa00.test'))).some((cookie) => cookie.name === 'sentinel'), true)
  assert.deepEqual(await data(batchPages[0]), { local: 'aaa00.test', session: 'aaa00.test', cookie: true })
  const batchAfter = await worker.evaluate(() => Date.now())
  await manager.getByRole('button', { name: 'Clean selected sites', exact: true }).click()
  await managerDialog().getByRole('button', { name: 'Confirm removal', exact: true }).click()
  const batchJob = await completedJob(batchAfter)
  await manager.getByRole('heading', { name: 'Cookies removed', exact: true }).waitFor()
  assert.equal(await manager.locator('.result .done').count(), 0)
  await manager.getByText('aaa00.test: Local storage: limited', { exact: true }).waitFor()
  await manager.getByText('aaa30.test: Session storage: limited', { exact: true }).waitFor()
  assert.deepEqual(batchJob.request.targets.map((target) => target.domain).sort(), ['aaa00.test', 'aaa30.test'])
  assert.equal(batchJob.completedSites, 2)
  assert.equal(batchJob.request.period, 'all')
  assert.equal(batchJob.request.thirdParty, false)
  assert.equal((await context.cookies(url('aaa00.test'))).some((cookie) => cookie.name === 'sentinel'), false)
  assert.equal((await context.cookies(url('aaa30.test'))).some((cookie) => cookie.name === 'sentinel'), false)
  assert.equal((await context.cookies(url('aaa50.test'))).some((cookie) => cookie.name === 'sentinel'), true)
  assert.deepEqual(await data(batchPages[0]), { local: null, session: null, cookie: false })
  assert.deepEqual(await data(batchPages[1]), { local: null, session: null, cookie: false })
  assert.deepEqual(await data(batchPages[2]), { local: 'aaa50.test', session: 'aaa50.test', cookie: true })
  await managerRows().filter({ hasText: 'aaa00.test' }).getByText('No cookies', { exact: true }).waitFor()
  console.log('PASS selected batch confirmation, per-site results, cookie-free retained rows and unselected-site isolation')

  const simultaneous = await popup.evaluate(async () => {
    const request = { domain: null, period: 'all', thirdParty: false, targets: [{ domain: 'aaa00.test', origins: [] }] }
    return Promise.all([
      chrome.runtime.sendMessage({ type: 'clean', request }),
      chrome.runtime.sendMessage({ type: 'clean', request }),
    ])
  })
  assert.equal(simultaneous.filter((reply) => reply.ok).length, 1)
  assert.match(simultaneous.find((reply) => !reply.ok).error, /already running/)
  console.log('PASS background rejects concurrent cleanup requests across clients')

  for (const colorScheme of ['light', 'dark']) {
    await manager.emulateMedia({ colorScheme })
    await manager.setViewportSize({ width: 390, height: 800 })
    assert.equal(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await manager.setViewportSize({ width: 1280, height: 900 })
    assert.equal(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  }
  await manager.getByText('Also remove third-party cookies', { exact: true }).click()
  await reminder(manager).waitFor()
  const allAfter = await worker.evaluate(() => Date.now())
  await manager.getByRole('button', { name: 'Clear all site data', exact: true }).click()
  await managerDialog().getByText('All websites in this Chrome profile', { exact: true }).waitFor()
  await managerDialog().getByRole('button', { name: 'Confirm removal', exact: true }).click()
  const allJob = await completedJob(allAfter)
  assert.deepEqual(allJob.request, { domain: null, period: 'all', thirdParty: false })
  assert.equal((await context.cookies(url('aaa50.test'))).some((cookie) => cookie.name === 'sentinel'), false)
  const remainingHistory = await worker.evaluate(() => chrome.history.search({ text: 'aaa00.test', startTime: 0 }))
  assert.ok(remainingHistory.length > 0)
  console.log('PASS responsive themes and Clear all site data ignores selection/toggle without deleting history')
  await manager.getByText('Also remove third-party cookies', { exact: true }).click()
  await manager.getByText('Also remove third-party cookies', { exact: true }).click()
  await reminder(manager).waitFor()
  await reminder(manager).getByRole('button').click()
  assert.equal(await reminder(manager).count(), 0)
  await manager.getByText('Also remove third-party cookies', { exact: true }).click()
  assert.equal(await reminder(manager).count(), 0)
  await manager.getByText('Also remove third-party cookies', { exact: true }).click()
  await reminder(manager).waitFor()
  await manager.reload()
  await manager.waitForFunction(() => document.querySelector('main')?.getAttribute('aria-busy') === 'false')
  assert.equal(await managerSwitch().isChecked(), true)
  assert.equal(await reminder(manager).count(), 0)
  console.log('PASS every ON action shows a dismissible reminder, including fourth and fifth uses; OFF, synchronization and reopening do not trigger it')
} finally {
  await context?.close()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
