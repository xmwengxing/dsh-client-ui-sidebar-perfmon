/**
 * Verify the keep-awake toggle against a running instance, end to end and on
 * the real machine: the footer button appears with the host's support state,
 * clicking it spawns the actual OS holder (counted from the Windows process
 * table by its `SetThreadExecutionState` command line), clicking again removes
 * it — and the label, the accent class, and the holder count all follow.
 *
 * This is a development tool, not part of the published package. Same setup as
 * `verify-ui.mjs` (a Chromium listening on the DevTools port); same reasoning
 * for real mouse input over `element.click()`.
 *
 * The holder count uses `-EncodedCommand` (UTF-16LE base64) so the query never
 * passes through the Windows CLI quoting layer — a double quote inside a
 * `-Command` argument is exactly the edge that mangles.
 *
 * Usage:
 *   node scripts/verify-awake.mjs <base-url-with-token> [out-dir]
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const [target, outDir = 'test/.build'] = process.argv.slice(2)
if (target === undefined) {
  console.error('usage: node scripts/verify-awake.mjs <base-url-with-token> [out-dir]')
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
   * Click an element the way a user does: a real mouse press and release at its
   * centre, so pointer-event handlers run.
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

/**
 * How many keep-awake holders are running, read from the real process table.
 * @returns {number} the count of PowerShell holders carrying SetThreadExecutionState.
 */
function holderCount() {
  const script =
    "$c = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'powershell.exe' -and $_.CommandLine -like '*SetThreadExecutionState*' }; @($c).Count"
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    { encoding: 'utf8', windowsHide: true },
  ).trim()
  const count = Number.parseInt(out, 10)
  if (!Number.isFinite(count)) throw new Error(`holder count was not a number: ${JSON.stringify(out)}`)
  return count
}

/**
 * Wait until the real process table agrees with an expected holder count.
 * @param {number} expected - the count to reach.
 * @param {number} timeout - milliseconds to wait.
 * @returns {Promise<number|null>} the reached count, or null on timeout.
 */
async function pollHolders(expected, timeout) {
  const deadline = Date.now() + timeout
  for (;;) {
    const current = holderCount()
    if (current === expected) return current
    if (Date.now() > deadline) return null
    await sleep(500)
  }
}

/** The footer exactly as rendered: labels, tooltip, geometry. */
const FOOTER = `(() => {
  const foot = document.querySelector('.dsh-perfmon-foot');
  if (!foot) return null;
  const rect = (node) => {
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) };
  };
  const buttons = Array.from(foot.querySelectorAll('button')).map((node) => ({
    label: node.textContent,
    title: node.getAttribute('title'),
    disabled: node.disabled === true,
    awakeClass: node.className.includes('dsh-perfmon-awake'),
    heldClass: node.className.includes('dsh-perfmon-awakeOn'),
    box: rect(node),
  }));
  const footBox = rect(foot);
  return {
    buttons,
    awake: buttons.find((b) => b.awakeClass) ?? null,
    footBox,
    // Wrapped (flex-wrap), so overflow here would mean the row is still too wide.
    overflow: foot.scrollWidth > foot.clientWidth + 1,
    insidePanel: buttons.every((b) => b.box !== null && b.box.x >= footBox.x - 1
      && b.box.x + b.box.w <= footBox.x + footBox.w + 1),
  };
})()`

const footer = async () => await cdp.evaluate(FOOTER)

/** Screenshot the footer region at 2× for inspection. */
async function shotFooter(name) {
  const geo = await cdp.evaluate(`(() => {
    const foot = document.querySelector('.dsh-perfmon-foot');
    if (!foot) return null;
    const box = foot.getBoundingClientRect();
    return { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 6), width: box.width + 16, height: box.height + 12 };
  })()`)
  if (geo === null) return null
  const res = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...geo, scale: 2 }, captureBeyondViewport: true })
  const path = join(outDir, name)
  await writeFile(path, Buffer.from(res.data, 'base64'))
  return path
}

const cdp = await Cdp.attach()
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1680,
  height: 1050,
  deviceScaleFactor: 2,
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
    if (button) { button.setAttribute('data-awake-dismiss', '1'); return true; }
  }
  return false;
})()`)
if (noticeTagged) {
  await cdp.click('[data-awake-dismiss="1"]')
  report.steps.push('notice-dismissed')
  await waitFor(`!document.querySelector('[data-awake-dismiss="1"]')`, 8000)
}

// 3. The Sidebar, then the plugin's guide entry.
if (await waitFor(`document.querySelector('[data-sidebar-right-expand]')`, 3000)) {
  await cdp.click('[data-sidebar-right-expand]')
  report.steps.push('sidebar-expanded')
}
report.guideEntry = await waitFor(`document.querySelector('[data-sidebar-right-guide-entry="perfmon"]')`, 20000)
report.steps.push(`guide:${String(report.guideEntry)}`)
if (report.guideEntry) await cdp.click('[data-sidebar-right-guide-entry="perfmon"]')

// 4. The panel and its footer with the new button.
report.panel = await waitFor(`document.querySelector('.dsh-perfmon-root')`, 25000)
report.steps.push(`panel:${String(report.panel)}`)
report.buttonPresent = await waitFor(`document.querySelector('.dsh-perfmon-awake')`, 20000)
report.steps.push(`button:${String(report.buttonPresent)}`)

if (report.buttonPresent) {
  report.before = await footer()
  report.shotBefore = await shotFooter('awake-01-before.png')

  // The machine, counted from its own process table.
  report.baselineHolders = holderCount()

  // 5. Arm the hold.
  report.clickOn = await cdp.click('.dsh-perfmon-awake')
  report.heldLabel = await waitFor(
    `document.querySelector('.dsh-perfmon-awake')?.textContent.includes('防睡眠中')`,
    8000,
  )
  report.heldHolders = await pollHolders(report.baselineHolders + 1, 15000)
  report.held = await footer()
  report.shotHeld = await shotFooter('awake-02-held.png')

  // 6. Release it.
  report.clickOff = await cdp.click('.dsh-perfmon-awake')
  report.releasedLabel = await waitFor(
    `(() => {
      const node = document.querySelector('.dsh-perfmon-awake');
      return node !== null && node.textContent.includes('保持唤醒')
        && !node.className.includes('dsh-perfmon-awakeOn');
    })()`,
    8000,
  )
  report.releasedHolders = await pollHolders(report.baselineHolders, 20000)
  report.after = await footer()
  report.shotAfter = await shotFooter('awake-03-after.png')
  report.finalHolders = holderCount()

  report.ok = Boolean(
    report.before?.awake !== null
    && report.before?.awake?.disabled === false
    && report.clickOn && report.clickOff
    && report.heldLabel && report.releasedLabel
    && report.heldHolders === report.baselineHolders + 1
    && report.releasedHolders === report.baselineHolders
    && report.held?.awake?.heldClass === true
    && report.after?.awake?.heldClass === false
    && report.before?.overflow === false && report.before?.insidePanel === true
    && report.held?.overflow === false && report.held?.insidePanel === true,
  )
}

console.log(JSON.stringify(report, null, 2))
cdp.close()
process.exit(report.ok === true ? 0 : 1)
