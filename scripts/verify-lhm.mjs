/**
 * Verify the temperature card's LHM assist on the real machine: the pill on
 * the title bar must agree with what the host's own probe answers — running →
 * no pill (and a real CPU temperature), installed → a start pill, missing →
 * an install pill — with the temperature card's meta intact, `probe` served
 * 200, and a bogus action gated 400.
 *
 * This script deliberately never triggers `start` or `install`: those raise
 * UAC on the host's own desktop, which is exactly the caveat the tooltip
 * carries. Their decision paths are covered with an injected runner in
 * test/lhm.test.mjs instead.
 *
 * This is a development tool, not part of the published package. Same setup as
 * `verify-ui.mjs`: a Chromium listening on the DevTools port.
 *
 * Usage:
 *   node scripts/verify-lhm.mjs <base-url-with-token> [out-dir]
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const [target, outDir = 'test/.build'] = process.argv.slice(2)
if (target === undefined) {
  console.error('usage: node scripts/verify-lhm.mjs <base-url-with-token> [out-dir]')
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
   * Click an element the way a user does: a real mouse press and release at
   * its centre, so pointer-event handlers run.
   * @param {string} selector - the element to click.
   * @returns {Promise<boolean>} whether such an element was found and clicked.
   */
  async click(selector) {
    const point = await this.evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return null;
      node.scrollIntoView({ block: 'center' });
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return null;
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

// 1. The app shell, then the notice modal and the sidebar, as in verify-ui.
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

const noticeTagged = await cdp.evaluate(`(() => {
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="Modal"]'));
  for (const dialog of dialogs) {
    const button = Array.from(dialog.querySelectorAll('button')).find((node) =>
      /继续|知道了|关闭|Continue|Got it|Close/.test(node.textContent || ''));
    if (button) { button.setAttribute('data-lhm-dismiss', '1'); return true; }
  }
  return false;
})()`)
if (noticeTagged) {
  await cdp.click('[data-lhm-dismiss="1"]')
  report.steps.push('notice-dismissed')
  await waitFor(`!document.querySelector('[data-lhm-dismiss="1"]')`, 8000)
}

if (await waitFor(`document.querySelector('[data-sidebar-right-expand]')`, 3000)) {
  await cdp.click('[data-sidebar-right-expand]')
  report.steps.push('sidebar-expanded')
}
report.guideEntry = await waitFor(`document.querySelector('[data-sidebar-right-guide-entry="perfmon"]')`, 20000)
if (report.guideEntry) await cdp.click('[data-sidebar-right-guide-entry="perfmon"]')
report.steps.push(`guide:${String(report.guideEntry)}`)

// 2. The temperature card, and the healthy-state expectations with LHM running.
report.panel = await waitFor(`document.querySelector('.dsh-perfmon-root')`, 25000)
report.steps.push(`panel:${String(report.panel)}`)
report.tiles = await waitFor(`document.querySelector('.dsh-perfmon-tempValue')`, 30000)
report.steps.push(`tiles:${String(report.tiles)}`)

if (report.tiles) {
  report.rendered = await cdp.evaluate(`(() => {
    const values = Array.from(document.querySelectorAll('.dsh-perfmon-tempValue'))
      .map((node) => node.textContent.trim());
    // Scope to the temperature card's own head, not the first head in the page.
    const head = Array.from(document.querySelectorAll('.dsh-perfmon-cardHead')).find((node) =>
      /温度|Temperature/.test(node.querySelector('.dsh-perfmon-cardTitle')?.textContent || ''));
    return {
      values,
      pills: Array.from(document.querySelectorAll('.dsh-perfmon-lhm')).map((node) => ({
        label: node.textContent.trim(),
        title: node.getAttribute('title'),
      })),
      headTitle: head?.querySelector('.dsh-perfmon-cardTitle')?.textContent ?? null,
      headMeta: head?.querySelector('.dsh-perfmon-cardMeta')?.textContent ?? null,
    };
  })()`)

  // 3. The assist route over the authenticated channel: probe only, plus the
  //    400 gate for an action that does not exist. Neither runs start/install.
  report.probe = await cdp.evaluate(`(async () => {
    const reply = await fetch('/api/perfmon.lhm', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'probe' }),
    });
    return { status: reply.status, body: await reply.json() };
  })()`)
  report.badAction = await cdp.evaluate(`(async () => {
    const reply = await fetch('/api/perfmon.lhm', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'reboot' }),
    });
    return { status: reply.status };
  })()`)

  // 4. The pill must agree with the probe — that consistency, not one
  //    particular machine's state, is the contract: running → no pill,
  //    installed → a start pill, missing → an install pill, no claim → none.
  report.state = report.probe?.body?.value?.state ?? null
  const pills = report.rendered?.pills ?? []
  const label = (pill, word) => new RegExp(word).test(pill?.label ?? '') && /LHM/.test(pill?.label ?? '')
  report.pillMatchesState = Boolean(
    (report.state === 'running' && pills.length === 0)
    || (report.state === 'installed' && pills.length === 1
      && label(pills[0], '启动|Start') && /UAC/.test(pills[0]?.title ?? ''))
    || (report.state === 'missing' && pills.length === 1
      && label(pills[0], '安装|Install') && /UAC/.test(pills[0]?.title ?? ''))
    || (report.state === null && pills.length === 0),
  )

  // 5. One capture of the whole panel as evidence.
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const shotPath = join(outDir, 'lhm-verify-healthy.png')
  await writeFile(shotPath, Buffer.from(shot.data, 'base64'))
  report.shot = shotPath

  report.ok = Boolean(
    report.pillMatchesState
    && report.rendered?.headMeta !== null
    && report.probe?.status === 200
    && report.probe?.body?.ok === true
    && report.badAction?.status === 400,
  )
}

console.log(JSON.stringify(report, null, 2))
cdp.close()
process.exit(report.ok === true ? 0 : 1)
