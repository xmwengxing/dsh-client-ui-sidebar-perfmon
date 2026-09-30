/**
 * Drive a real browser against a running dsh web instance and verify the plugin
 * end to end: open the Sidebar guide entry, read the gauges, watch them refresh,
 * switch the sort tags, filter the list, then open a Session and check the header
 * control beside the Sidebar's own expand button.
 *
 * This is a development tool, not part of the published package. It talks to
 * Chromium's DevTools protocol over the WebSocket built into Node, so it needs no
 * browser-automation dependency.
 *
 * Clicks are dispatched as real mouse input rather than `element.click()`: the
 * GUI's controls act on pointer events, which a synthetic click never produces,
 * so an in-page `.click()` silently does nothing on them.
 *
 * Usage:
 *   node scripts/verify-ui.mjs <base-url-with-token> [output.png]
 *   node scripts/verify-ui.mjs --attach [output.png]      # drive the open page
 *
 * Setup: a Chromium listening on the DevTools port, e.g.
 *   chrome --headless=new --remote-debugging-port=9222 --no-sandbox \
 *          --user-data-dir=/tmp/perfmon-cdp --window-size=1680,1050 about:blank
 */

import { writeFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const attach = args.includes('--attach')
const positional = args.filter((value) => !value.startsWith('--'))
const target = attach ? undefined : positional[0]
const output = (attach ? positional[0] : positional[1]) ?? '/tmp/perfmon-panel.png'
if (!attach && target === undefined) {
  console.error('usage: node scripts/verify-ui.mjs <base-url-with-token> [output.png] [--attach]')
  process.exit(2)
}

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

const cdp = await Cdp.attach()
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1680,
  height: 1050,
  deviceScaleFactor: 1,
  mobile: false,
})

if (!attach) {
  await cdp.send('Page.navigate', { url: target })
  console.log('navigating; a boot on a loaded host takes minutes')
}

const sleep = (millis) => new Promise((resolve) => setTimeout(resolve, millis))
const report = { steps: [], consoleErrors: [] }

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
    await sleep(400)
  }
}

/** Read the panel exactly as a user sees it. */
const SNAPSHOT = `(() => {
  const root = document.querySelector('.dsh-perfmon-root');
  if (!root) return null;
  const cell = (node) => (node && node.childNodes[0] ? node.childNodes[0].textContent : null);
  return {
    gauges: Array.from(root.querySelectorAll('.dsh-perfmon-gaugeLabel')).map((e) => e.textContent),
    values: Array.from(root.querySelectorAll('.dsh-perfmon-gaugeValue')).map((e) => e.textContent),
    details: Array.from(root.querySelectorAll('.dsh-perfmon-gaugeDetail')).map((e) => e.textContent),
    tags: Array.from(root.querySelectorAll('.dsh-perfmon-tab')).map((e) => e.textContent),
    pressed: Array.from(root.querySelectorAll('.dsh-perfmon-tab')).map((e) => e.getAttribute('aria-pressed')),
    rowCount: root.querySelectorAll('.dsh-perfmon-row').length,
    rows: Array.from(root.querySelectorAll('.dsh-perfmon-row')).slice(0, 4).map((row) => ({
      name: row.querySelector('.dsh-perfmon-nameText').textContent,
      meta: row.querySelector('.dsh-perfmon-nameMeta').textContent,
      cpu: cell(row.querySelectorAll('.dsh-perfmon-metric')[0]),
      mem: cell(row.querySelectorAll('.dsh-perfmon-metric')[1]),
    })),
    foot: root.querySelector('.dsh-perfmon-foot').textContent,
    disk: root.querySelector('.dsh-perfmon-disk')
      ? {
          label: root.querySelector('.dsh-perfmon-diskLabel')?.textContent ?? null,
          value: root.querySelector('.dsh-perfmon-diskValue')?.textContent ?? null,
          detail: root.querySelector('.dsh-perfmon-diskDetail')?.textContent ?? null,
        }
      : null,
    notice: root.querySelector('.dsh-perfmon-notice') ? root.querySelector('.dsh-perfmon-notice').textContent : null,
  };
})()`

/** The snapshot expression returns an object; returnByValue delivers it directly. */
const snapshot = async () => (await cdp.evaluate(SNAPSHOT)) ?? null

// 1. The app shell. Deliberately not the Sidebar expand button: that control is
//    absent while the panel is open, so it cannot gate the boot.
report.shell = await waitFor(
  `document.querySelector('[data-composer-input], [data-dockkit-surface], [data-slot="sidebar"]')`,
  240000,
)
report.steps.push(`shell:${String(report.shell)}`)
if (!report.shell) {
  console.log(JSON.stringify(report, null, 2))
  cdp.close()
  process.exit(0)
}

// 2. The release notice is a modal overlay that swallows clicks.
const noticePresent = await cdp.evaluate(
  `Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="Modal"]')).length > 0`,
)
if (noticePresent) {
  const tagged = await cdp.evaluate(`(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="Modal"]'));
    for (const dialog of dialogs) {
      const button = Array.from(dialog.querySelectorAll('button')).find((node) =>
        /继续|知道了|关闭|Continue|Got it|Close/.test(node.textContent || ''));
      if (button) { button.setAttribute('data-perfmon-dismiss', '1'); return true; }
    }
    return false;
  })()`)
  if (tagged) {
    await cdp.click('[data-perfmon-dismiss="1"]')
    report.steps.push('notice-dismissed')
    await waitFor(`!document.querySelector('[data-perfmon-dismiss="1"]')`, 8000)
  }
}

// 3. The Sidebar, and the plugin's own guide card inside it.
if (await waitFor(`document.querySelector('[data-sidebar-right-expand]')`, 3000)) {
  await cdp.click('[data-sidebar-right-expand]')
  report.steps.push('sidebar-expanded')
} else {
  report.steps.push('sidebar-already-expanded')
}
report.guideEntryKinds = await cdp.evaluate(
  `Array.from(document.querySelectorAll('[data-sidebar-right-guide-entry]')).map((n) => n.getAttribute('data-sidebar-right-guide-entry'))`,
)
report.guideEntry = await waitFor(`document.querySelector('[data-sidebar-right-guide-entry="perfmon"]')`, 20000)
report.steps.push(`guide-entry:${String(report.guideEntry)}`)
if (report.guideEntry) {
  report.guideEntryText = await cdp.evaluate(
    `document.querySelector('[data-sidebar-right-guide-entry="perfmon"]').textContent`,
  )
  await cdp.click('[data-sidebar-right-guide-entry="perfmon"]')
}

// 4. The panel itself.
report.panel = await waitFor(`document.querySelector('.dsh-perfmon-root')`, 25000)
report.steps.push(`panel:${String(report.panel)}`)
if (report.panel) {
  report.firstRead = await snapshot()

  // It must refresh without any interaction.
  const before = report.firstRead.values.join('|')
  const deadline = Date.now() + 20000
  for (;;) {
    const now = await cdp.evaluate(
      `Array.from(document.querySelectorAll('.dsh-perfmon-gaugeValue')).map((e) => e.textContent).join('|')`,
    )
    if (now !== before) {
      report.refreshedByItself = true
      break
    }
    if (Date.now() > deadline) {
      report.refreshedByItself = false
      break
    }
    await sleep(500)
  }
  report.secondRead = await snapshot()

  // 5. Each sort tag, clicked as a user would.
  const tagClick = async (needle) => {
    const found = await cdp.evaluate(`(() => {
      const tag = Array.from(document.querySelectorAll('.dsh-perfmon-tab'))
        .find((node) => (node.textContent || '').includes(${JSON.stringify(needle)}));
      if (!tag) return false;
      tag.setAttribute('data-perfmon-tag', '1');
      return true;
    })()`)
    if (!found) return false
    await cdp.click('[data-perfmon-tag="1"]')
    await cdp.evaluate(`document.querySelector('[data-perfmon-tag="1"]')?.removeAttribute('data-perfmon-tag')`)
    await sleep(3500)
    return true
  }
  report.clickedMem = await tagClick('内存')
  report.afterMem = await snapshot()
  report.clickedName = await tagClick('进程名')
  report.afterName = await snapshot()
  report.clickedCpu = await tagClick('CPU')
  report.afterCpu = await snapshot()

  // 6. The filter, driven through the input's native setter so React sees it.
  const needle = (report.firstRead.rows[0]?.name ?? 'a').slice(0, 3)
  report.filterNeedle = needle
  const typeFilter = async (value) => {
    await cdp.evaluate(`(() => {
      const input = document.querySelector('.dsh-perfmon-filter');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`)
    await sleep(600)
    return cdp.evaluate(
      `Array.from(document.querySelectorAll('.dsh-perfmon-nameText')).slice(0, 6).map((e) => e.textContent)`,
    )
  }
  report.filteredRows = await typeFilter(needle)
  report.unmatchedRows = await typeFilter('zzz-no-such-process-zzz')
  report.emptyStateText = await cdp.evaluate(
    `document.querySelector('.dsh-perfmon-empty')?.textContent ?? null`,
  )
  await typeFilter('')
}

// 7. A real Session, then the header control that opens the page.
// A brand-new empty Session renders blank header chrome, which carries no
// utilities row at all: the seat this plugin extends appears once the Session has
// content. Prefer a Session that has some.
const sessionRow = await cdp.evaluate(`(() => {
  const rows = Array.from(document.querySelectorAll('[data-row-key]'))
    .filter((node) => (node.getAttribute('data-row-key') || '').startsWith('session:'));
  const row = rows.find((node) => (node.textContent || '').includes(${JSON.stringify(process.env.PERFMON_SESSION_MATCH ?? '')})) ?? rows[0];
  if (!row) return null;
  row.setAttribute('data-perfmon-session', '1');
  return row.getAttribute('data-row-key');
})()`)
report.sessionRow = sessionRow
if (sessionRow !== null) {
  await cdp.click('[data-perfmon-session="1"]')
  report.steps.push('session-opened')
}
report.utilitiesSeat = await waitFor(
  `document.querySelector('[data-slot="conversation.session.header.utilities"]')`,
  25000,
)
report.utilitiesChildren = await cdp.evaluate(
  `document.querySelector('[data-slot="conversation.session.header.utilities"]')?.children.length ?? null`,
)
report.headerButton = await waitFor(`document.querySelector('.dsh-perfmon-headerButton')`, 15000)
report.steps.push(`header-button:${String(report.headerButton)}`)
if (report.headerButton) {
  report.header = await cdp.evaluate(`(() => {
    const button = document.querySelector('.dsh-perfmon-headerButton');
    const corner = document.querySelector('[data-conversation-header-corner] button');
    const box = button.getBoundingClientRect();
    const cornerBox = corner ? corner.getBoundingClientRect() : null;
    const utilities = document.querySelector('[data-slot="conversation.session.header.utilities"]');
    return {
      label: button.textContent,
      title: button.getAttribute('title'),
      buttonRight: Math.round(box.right),
      cornerLeft: cornerBox ? Math.round(cornerBox.left) : null,
      cornerLabel: corner ? corner.getAttribute('aria-label') : null,
      neighbours: utilities ? utilities.children.length : null,
    };
  })()`)
}

console.log(JSON.stringify(report, null, 2))

const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
await writeFile(output, Buffer.from(shot.data, 'base64'))
console.log(`screenshot: ${output}`)
cdp.close()
