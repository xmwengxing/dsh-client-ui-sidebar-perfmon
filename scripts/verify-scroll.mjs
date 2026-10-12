/**
 * Verify the panel's two independent scrollports on a real browser: on a short
 * display the whole page scrolls (root: overflow-y auto, horizontal clipped),
 * the process card keeps its working floor (360px) and the rows keep their own
 * inner scroll — each scrollTop moving without disturbing the other — while on
 * a tall pane the page does not scroll at all and the card grows to fill, which
 * is the layout the README hero shows.
 *
 * This is a development tool, not part of the published package. Same setup as
 * `verify-ui.mjs` / `verify-awake.mjs` (a Chromium on the DevTools port).
 *
 * Usage:
 *   node scripts/verify-scroll.mjs <base-url-with-token> [out-dir]
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const [target, outDir = 'test/.build'] = process.argv.slice(2)
if (target === undefined) {
  console.error('usage: node scripts/verify-scroll.mjs <base-url-with-token> [out-dir]')
  process.exit(2)
}
await mkdir(outDir, { recursive: true })

/** Minimal CDP client for one page target. */
class Cdp {
  #socket
  #nextId = 1
  #pending = new Map()

  static async attach(port = 9222) {
    const list = await (await fetch(`http://127.0.0.1:${String(port)}/json/list`)).json()
    const page = list.find((entry) => entry.type === 'page')
    if (page === undefined) throw new Error('no page target on the debugging port')
    const client = new Cdp()
    client.#socket = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      client.#socket.addEventListener('open', resolve, { once: true })
      client.#socket.addEventListener('error', reject, { once: true })
    })
    client.#socket.addEventListener('message', (event) => {
      const message = JSON.parse(typeof event.data === 'string' ? event.data : '')
      if (message.id === undefined) return
      const entry = client.#pending.get(message.id)
      if (entry === undefined) return
      client.#pending.delete(message.id)
      if (message.error !== undefined) entry.reject(new Error(JSON.stringify(message.error)))
      else entry.resolve(message.result)
    })
    return client
  }

  send(method, params = {}) {
    const id = this.#nextId
    this.#nextId += 1
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }

  /**
   * Evaluate an expression in the page, awaiting a promise result.
   * @param {string} expression - the script to run.
   * @returns {Promise<unknown>} the resolved value.
   */
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails !== undefined) {
      throw new Error(`page exception: ${result.exceptionDetails.exception?.description ?? 'unknown'}`)
    }
    return result.result.value
  }

  /**
   * Click an element the way a user does: a real mouse press and release.
   * @param {string} selector - the element to click.
   * @returns {Promise<boolean>} whether such an element was found and clicked.
   */
  async click(selector) {
    const point = await this.evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return null;
      node.scrollIntoView({ block: 'center' });
      const box = node.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return null;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    })()`)
    if (point === null || point === undefined) return false
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', {
        type,
        x: point.x,
        y: point.y,
        button: 'left',
        clickCount: 1,
        buttons: type === 'mousePressed' ? 1 : 0,
      })
    }
    return true
  }

  close() {
    this.#socket.close()
  }
}

const sleep = (millis) => new Promise((resolve) => setTimeout(resolve, millis))
const report = { steps: [] }

/**
 * Poll an in-page predicate until it is truthy.
 * @param {string} expression - a boolean expression evaluated in the page.
 * @param {number} timeout - milliseconds to wait.
 * @returns {Promise<boolean>} whether it became truthy.
 */
async function waitFor(expression, timeout) {
  const deadline = Date.now() + timeout
  for (;;) {
    if (await cdp.evaluate(`Boolean(${expression})`)) return true
    if (Date.now() > deadline) return false
    await sleep(300)
  }
}

/** Both scrollports, measured: overflow modes, sizes, floors, footer reach. */
const GEOMETRY = `(() => {
  const root = document.querySelector('.dsh-perfmon-root');
  const card = document.querySelector('.dsh-perfmon-card--processes');
  const rows = document.querySelector('.dsh-perfmon-rows');
  const foot = document.querySelector('.dsh-perfmon-foot');
  if (!root || !card || !rows) return null;
  const rootStyle = getComputedStyle(root);
  const cardStyle = getComputedStyle(card);
  const footBox = foot ? foot.getBoundingClientRect() : null;
  return {
    rootOverflowY: rootStyle.overflowY,
    rootOverflowX: rootStyle.overflowX,
    rootClient: root.clientHeight,
    rootScroll: root.scrollHeight,
    rootMax: root.scrollHeight - root.clientHeight,
    rootTop: Math.round(root.scrollTop),
    cardMin: cardStyle.minHeight,
    cardH: Math.round(card.getBoundingClientRect().height),
    rowsClient: rows.clientHeight,
    rowsScroll: rows.scrollHeight,
    rowsMax: rows.scrollHeight - rows.clientHeight,
    rowsTop: Math.round(rows.scrollTop),
    footInViewport: footBox === null ? null
      : footBox.top >= -1 && footBox.bottom <= window.innerHeight + 1,
  };
})()`

const geometry = async () => await cdp.evaluate(GEOMETRY)

/** Set a scrollport's scrollTop and read back what the browser accepted. */
const setScroll = async (selector, value) =>
  await cdp.evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return null;
    node.scrollTop = ${String(value)};
    return Math.round(node.scrollTop);
  })()`)

/** Screenshot the visible viewport. */
async function shotViewport(name) {
  const res = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const path = join(outDir, name)
  await writeFile(path, Buffer.from(res.data, 'base64'))
  return path
}

const cdp = await Cdp.attach()
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')

// A short display first — 600px window height leaves the pane around 550px,
// while the panel's own minimum content (gauges + temperature + a 360px list
// card + footer) is well above that: the page must scroll here.
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1680,
  height: 600,
  deviceScaleFactor: 1,
  mobile: false,
})

await cdp.send('Page.navigate', { url: target })
console.log('navigating; a boot on a loaded host takes minutes')

// 1. The app shell.
report.shell = await waitFor(
  `document.querySelector('[data-composer-input], [data-dockkit-surface], [data-slot="sidebar"]')`,
  240000,
)
report.steps.push(`shell:${String(report.shell)}`)
if (!report.shell) {
  console.log(JSON.stringify(report, null, 2))
  cdp.close()
  process.exit(1)
}

// 2. A release notice modal would swallow clicks.
const noticeTagged = await cdp.evaluate(`(() => {
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="Modal"]'));
  for (const dialog of dialogs) {
    const button = Array.from(dialog.querySelectorAll('button')).find((node) =>
      /继续|知道了|关闭|Continue|Got it|Close/.test(node.textContent || ''));
    if (button) { button.setAttribute('data-scroll-dismiss', '1'); return true; }
  }
  return false;
})()`)
if (noticeTagged) {
  await cdp.click('[data-scroll-dismiss="1"]')
  report.steps.push('notice-dismissed')
  await waitFor(`!document.querySelector('[data-scroll-dismiss="1"]')`, 8000)
}

// 3. The Sidebar, then the plugin's entry.
if (await waitFor(`document.querySelector('[data-sidebar-right-expand]')`, 3000)) {
  await cdp.click('[data-sidebar-right-expand]')
  report.steps.push('sidebar-expanded')
}
report.guideEntry = await waitFor(`document.querySelector('[data-sidebar-right-guide-entry="perfmon"]')`, 20000)
if (report.guideEntry) await cdp.click('[data-sidebar-right-guide-entry="perfmon"]')

// 4. The panel, on the short pane.
report.panel = await waitFor(`document.querySelector('.dsh-perfmon-root')`, 25000)
report.steps.push(`panel:${String(report.panel)}`)
await sleep(800)

report.short = await geometry()
report.shotShortTop = await shotViewport('scroll-short-top.png')

if (report.short !== null) {
  // 5. The page scrolls: root accepts a scrollTop it has room for.
  const pageTarget = Math.min(240, report.short.rootMax)
  report.pageScrollTarget = pageTarget
  report.pageScrollReadback = await setScroll('.dsh-perfmon-root', pageTarget)
  await sleep(250)
  report.pageScrollWorks =
    report.short.rootMax > 100
    && report.pageScrollReadback !== null
    && Math.abs(report.pageScrollReadback - pageTarget) <= 1

  // 6. The list scrolls inside, without moving the page.
  const rowsTarget = Math.min(90, report.short.rowsMax)
  report.rowsScrollReadback = await setScroll('.dsh-perfmon-rows', rowsTarget)
  await sleep(250)
  const afterInner = await geometry()
  report.innerScrollWorks =
    report.short.rowsMax > 100
    && report.rowsScrollReadback !== null
    && Math.abs(report.rowsScrollReadback - rowsTarget) <= 1
  report.independenceInner =
    afterInner !== null && Math.abs(afterInner.rootTop - (report.pageScrollReadback ?? -1)) <= 1

  // 7. And the page scrolls without resetting the list's position.
  const pageSecond = Math.max(0, (report.short.rootMax ?? 0) - 40)
  report.pageScrollSecond = await setScroll('.dsh-perfmon-root', pageSecond)
  await sleep(250)
  const afterOuter = await geometry()
  report.independenceOuter =
    afterOuter !== null
    && Math.abs(afterOuter.rowsTop - (report.rowsScrollReadback ?? -1)) <= 1

  // 8. At the bottom of the page the footer is in view — the reach that a
  //    clipped pane never allowed.
  await setScroll('.dsh-perfmon-root', report.short.rootMax)
  await sleep(250)
  const atBottom = await geometry()
  report.footReachable = atBottom?.footInViewport === true
  report.shotShortBottom = await shotViewport('scroll-short-bottom.png')

  // 9. Tall pane: no page scroll at all, the list card grows past its floor.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1680,
    height: 1050,
    deviceScaleFactor: 2,
    mobile: false,
  })
  await sleep(700)
  await setScroll('.dsh-perfmon-root', 0)
  await setScroll('.dsh-perfmon-rows', 0)
  await sleep(300)
  report.tall = await geometry()
  report.tallNoPageScroll =
    report.tall !== null && report.tall.rootScroll <= report.tall.rootClient + 2
  report.tallCardGrows = report.tall !== null && report.tall.cardH > 360
  report.tallRowsOwnScroll = report.tall !== null && report.tall.rowsScroll > report.tall.rowsClient

  report.ok = Boolean(
    // The panel may already be open from a persisted session — the guide-entry
    // click is the way in, not a precondition. What is asserted is the layout.
    report.shell && report.panel
    && report.short.rootOverflowY === 'auto' && report.short.rootOverflowX === 'hidden'
    && report.short.cardMin === '360px' && report.short.cardH >= 360
    && report.pageScrollWorks && report.innerScrollWorks
    && report.independenceInner && report.independenceOuter
    && report.footReachable
    && report.tallNoPageScroll && report.tallCardGrows && report.tallRowsOwnScroll,
  )
}

console.log(JSON.stringify(report, null, 2))
cdp.close()
process.exit(report.ok === true ? 0 : 1)
