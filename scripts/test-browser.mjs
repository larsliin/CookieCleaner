import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

// A disposable profile and local fixture hosts keep destructive tests away from real browsing data.
const profile = await mkdtemp(path.join(tmpdir(), 'cookie-cleaner-test-'))
const extensionPath = path.resolve('dist-extension')
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html')
  response.end(`<html><head><title>Cleanup fixture</title></head><body>
    <h1>Storage fixture</h1>
    ${request.url === '/with-frame' ? `<iframe src="http://frame.cleaner.test:${server.address().port}/"></iframe>` : ''}
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
  await cdp.send('Target.closeTarget', { targetId: actionPopup.targetId })
  await cdp.detach()
  console.log('PASS actual toolbar popup opens at 420px without horizontal overflow')
  await selected.waitForSelector('iframe')
  const frame = selected.frames().find((item) => item.url().includes('frame.cleaner.test'))
  assert.ok(frame)
  const unrelated = await context.newPage()
  await unrelated.goto(url('unrelated.test'))
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
  await seed(selected, 'selected')
  await seed(frame, 'frame')
  await seed(unrelated, 'unrelated')
  await selected.evaluate(() => { document.cookie = 'parent=keep; domain=cleaner.test; path=/' })
  let popup = await context.newPage()
  await selected.bringToFront()
  await popup.goto(`chrome-extension://${extensionId}/index.html`)
  await popup.waitForFunction(() => !document.querySelector('#website')?.disabled)
  assert.equal(await popup.locator('#website').inputValue(), 'cleaner.test')
  const hero = () => popup.getByRole('button', { name: /^Clean all websites/ })
  await popup.locator('#period').selectOption('hour')
  const heroBounds = await hero().boundingBox()
  const customBounds = await popup.getByRole('button', { name: 'Review cleanup', exact: true }).boundingBox()
  assert.ok(customBounds.width < heroBounds.width * 0.75, 'Custom cleanup button must be compact, not full-width')
  assert.ok(heroBounds.y < customBounds.y, 'Global hero must precede custom cleanup')
  await hero().click()
  assert.equal(await popup.locator('#review-title').evaluate((heading) => heading === document.activeElement), true)
  await popup.getByText('All websites in this Chrome profile', { exact: true }).waitFor()
  await popup.getByText('All time · Cookies, local storage, session storage', { exact: true }).waitFor()
  assert.equal(await hero().isDisabled(), true)
  assert.equal(await popup.getByRole('button', { name: 'Review cleanup', exact: true }).isDisabled(), true)
  assert.deepEqual(await data(selected), { local: 'selected', session: 'selected', cookie: true })
  await popup.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(await popup.locator('#website').inputValue(), 'cleaner.test')
  assert.equal(await popup.locator('#period').inputValue(), 'hour')
  await popup.getByRole('button', { name: 'Review cleanup', exact: true }).click()
  await popup.locator('.review').getByText('cleaner.test', { exact: true }).waitFor()
  await popup.getByText('Last hour · Cookies, local storage, session storage', { exact: true }).waitFor()
  await popup.getByRole('button', { name: 'Cancel', exact: true }).click()
  await popup.locator('#period').selectOption('all')
  console.log('PASS hero reviews all websites/all time without changing custom filters or deleting before confirmation')
  await popup.locator('#website').selectOption('cleaner.test')
  await popup.getByRole('button', { name: 'Review cleanup', exact: true }).click()
  assert.match(await popup.locator('#review-title').textContent(), /Review removal/)
  assert.deepEqual(await data(selected), { local: 'selected', session: 'selected', cookie: true })
  await popup.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(await popup.getByRole('button', { name: 'Confirm removal' }).count(), 0)
  await popup.getByRole('button', { name: 'Review cleanup', exact: true }).click()
  await popup.getByRole('button', { name: 'Confirm removal', exact: true }).click()
  await popup.close()
  popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/index.html`)
  await popup.getByText('Session storage: limited', { exact: true }).waitFor()
  assert.deepEqual(await data(selected), { local: null, session: null, cookie: false })
  assert.deepEqual(await data(frame), { local: null, session: null, cookie: false })
  assert.deepEqual(await data(unrelated), { local: 'unrelated', session: 'unrelated', cookie: true })
  assert.equal(await selected.evaluate(() => document.cookie.includes('parent=')), false)
  console.log('PASS site cleanup, subdomains, open frames, cancellation, and unrelated-site isolation')

  for (const period of ['hour', 'day', 'week', 'all']) {
    await seed(selected, period)
    await seed(unrelated, period)
    await popup.locator('#website').selectOption(period === 'all' ? 'cleaner.test' : '__all__')
    await popup.locator('#period').selectOption(period === 'all' ? 'hour' : period)
    if (period === 'all') await hero().click()
    else await popup.getByRole('button', { name: 'Review cleanup', exact: true }).click()
    await popup.getByRole('button', { name: 'Confirm removal', exact: true }).click()
    await popup.waitForFunction(() => !document.querySelector('main')?.getAttribute('aria-busy')?.includes('true'))
    const completedJob = await worker.evaluate(async () => (await chrome.storage.session.get('cleanupJob')).cleanupJob)
    assert.deepEqual(completedJob.request, { domain: null, period })
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
  await popup.reload()
  await popup.getByText('Session storage: limited', { exact: true }).waitFor()
  console.log('PASS live light/dark mode, popup width, and saved results after reopening')

  for (let index = 0; index < 12; index++) {
    await unrelated.goto(url(`site${index}.test`))
  }
  await popup.reload()
  await popup.waitForFunction(() => !document.querySelector('#website')?.disabled)
  const recent = await worker.evaluate(async () => (await chrome.storage.local.get('recentSites')).recentSites)
  assert.equal(recent.length, 10)
  assert.equal(recent[0].domain, 'site11.test')
  assert.equal(new Set(recent.map((site) => site.domain)).size, 10)
  console.log('PASS persistent, deduplicated last-ten-sites list')

  await popup.bringToFront()
  await popup.reload()
  await popup.getByText('This tab is not a supported website.', { exact: false }).waitFor()
  assert.equal(await popup.getByRole('button', { name: 'Review cleanup', exact: true }).isEnabled(), true)
  console.log('PASS unsupported current page still permits an explicitly selected recent site')
  await worker.evaluate(() => chrome.storage.local.remove('recentSites'))
  await popup.reload()
  await popup.waitForFunction(() => !document.querySelector('#website')?.disabled)
  assert.equal(await popup.locator('#website').inputValue(), '')
  assert.equal(await popup.getByRole('button', { name: 'Review cleanup', exact: true }).isDisabled(), true)
  assert.equal(await hero().isEnabled(), true)
  await hero().click()
  await popup.getByText('All websites in this Chrome profile', { exact: true }).waitFor()
  await popup.getByRole('button', { name: 'Cancel', exact: true }).click()
  console.log('PASS global cleanup remains available without a current or recent site')
} finally {
  await context?.close()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
