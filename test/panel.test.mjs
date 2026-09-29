/**
 * Behavioral specs for the panel.
 *
 * These mount the real components with `react-test-renderer`, so they exercise
 * hooks and effects without a browser: the refresh loop really runs, the tags
 * really call back, and the rows really come out of state rather than out of a
 * prop the spec handed in.
 *
 * The assertions are about what a user sees — gauge values, tag selection, row
 * order, error copy — never about class plumbing for its own sake.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import TestRenderer from 'react-test-renderer'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const require = createRequire(import.meta.url)
const {
  PerfmonBody,
  ProcessPanel,
  GaugePanel,
  HeaderButton,
  GAUGE_RING,
  createTranslator,
  formatShare,
  SNAPSHOT_PATH,
} = require(resolve(root, 'test/.build/components.cjs'))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const t = createTranslator()

/**
 * A document stub covering what the panel touches, so the visibility path is
 * exercised rather than skipped: the specs can assert the listener contract too.
 */
const visibilityListeners = new Set()
globalThis.document = {
  visibilityState: 'visible',
  documentElement: { lang: 'zh-CN' },
  addEventListener(type, listener) {
    if (type === 'visibilitychange') visibilityListeners.add(listener)
  },
  removeEventListener(type, listener) {
    if (type === 'visibilitychange') visibilityListeners.delete(listener)
  },
}

/**
 * Mount an element and guarantee its teardown.
 *
 * The panel schedules its next poll with a long timer, so a spec that failed
 * before unmounting would leave the runner's event loop alive and turn one
 * assertion failure into a hung test file. Registering cleanup on the test
 * context makes teardown unconditional.
 * @param {object} context - the node:test context.
 * @param {import('react').ReactElement} element - the element to mount.
 * @returns {Promise<object>} the test renderer.
 */
async function mount(context, element) {
  let renderer
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(element)
  })
  context.after(() => {
    try {
      renderer.unmount()
    } catch {
      // already torn down by the spec
    }
  })
  return renderer
}

/** A reading with two processes whose CPU and memory orders are deliberately opposite. */
function readingFixture(overrides = {}) {
  return {
    facts: { hostname: 'host-a', arch: 'x64', coreCount: 4, uptimeSeconds: 7200 },
    window: { millis: 2000, at: 1700000000000 },
    cpu: { percent: 12.5, coreCount: 4, cores: [], loadAverage: [0.5, 0.4, 0.3] },
    memory: {
      total: 16 * 1024 ** 3,
      used: 8 * 1024 ** 3,
      available: 8 * 1024 ** 3,
      free: 1024 ** 3,
      cached: 2 * 1024 ** 3,
      percent: 50,
      swapTotal: 4 * 1024 ** 3,
      swapUsed: 1024 ** 3,
      swapFree: 3 * 1024 ** 3,
      swapPercent: 25,
    },
    processCount: 2,
    refreshIntervalMs: 600000,
    processes: [
      { pid: 1, name: 'heavy-cpu', state: 'R', threads: 4, rssBytes: 10 * 1024 ** 2, memPercent: 0.1, cpuPercent: 88.8 },
      { pid: 2, name: 'heavy-mem', state: 'S', threads: 9, rssBytes: 4 * 1024 ** 3, memPercent: 25, cpuPercent: 1.2 },
    ],
    ...overrides,
  }
}

/** Gather the text of a rendered subtree, including text inside child elements. */
function textOf(node) {
  let out = ''
  for (const child of node.children ?? []) {
    if (typeof child === 'string') out += child
    else if (child !== null && typeof child === 'object' && Array.isArray(child.children)) out += textOf(child)
  }
  return out
}

/** Collect the rendered text of every node carrying a class. */
function textsOf(renderer, className) {
  return renderer.root.findAllByProps({ className }).map((node) => textOf(node))
}

/** The three sort tags, in render order. */
function tagsOf(renderer) {
  return renderer.root.findAll(
    (node) => node.type === 'button' && String(node.props.className ?? '').includes('dsh-perfmon-tab'),
  )
}

/**
 * The declared column order of a grid, read from the data attribute both the
 * header cells and the row cells carry.
 * @param {object} renderer - the test renderer.
 * @param {string} className - the grid class to inspect.
 * @returns {string[]} the column keys, left to right.
 */
function columnKeys(renderer, gridClass) {
  const grids = renderer.root.findAll(
    (node) => typeof node.type === 'string' && String(node.props.className ?? '').split(' ').includes(gridClass),
  )
  assert.ok(grids.length > 0, `no rendered grid carries ${gridClass}`)
  return grids[0]
    .findAll((node) => node.props['data-column'] !== undefined, { deep: true })
    .map((node) => node.props['data-column'])
}

/** The rendered process names, in render order. */
function rowNames(renderer) {
  return renderer.root
    .findAll((node) => node.props.className === 'dsh-perfmon-nameText')
    .map((node) => node.children.join(''))
}

test('the resource window shows one gauge each for CPU, memory and swap', async (context) => {
  const renderer = await mount(context, React.createElement(GaugePanel, { reading: readingFixture(), t }))
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-gaugeLabel'), ['CPU', '内存', '交换内存'])
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-gaugeValue'), ['12.5%', '50.0%', '25.0%'])
  const details = textsOf(renderer, 'dsh-perfmon-gaugeDetail')
  assert.match(details[0], /4 核/)
  assert.match(details[1], /8\.0 GB \/ 16\.0 GB/)
  assert.match(details[2], /1\.0 GB \/ 4\.0 GB/)
})

test('a host without swap says so instead of drawing a zero ring', async (context) => {
  const reading = readingFixture()
  reading.memory.swapTotal = 0
  reading.memory.swapUsed = 0
  const renderer = await mount(context, React.createElement(GaugePanel, { reading, t }))
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-gaugeDetail')[2], '未启用')
  // The unavailable reading renders as an em dash, never as a fabricated 0.0%.
  assert.equal(textsOf(renderer, 'dsh-perfmon-gaugeValue')[2], '—')
})

test('the three tags head the three columns, in the same order', async (context) => {
  const renderer = await mount(
    context,
    React.createElement(ProcessPanel, { reading: readingFixture(), sort: 'mem', onSortChange() {}, t }),
  )
  const tags = tagsOf(renderer)
  assert.equal(tags.length, 3)
  assert.deepEqual(
    tags.map((tag) => tag.children.filter((child) => typeof child === 'string').join('')),
    ['CPU', '内存', '进程名'],
  )
  assert.deepEqual(
    tags.map((tag) => tag.props['aria-pressed']),
    [false, true, false],
  )

  // The complaint this guards: the tag order and the column order have to be the
  // same list, or the header labels a column it does not sit above.
  const headerColumns = columnKeys(renderer, 'dsh-perfmon-columns')
  const rowColumns = columnKeys(renderer, 'dsh-perfmon-row')
  assert.deepEqual(headerColumns, ['cpu', 'mem', 'name'])
  assert.deepEqual(rowColumns, ['cpu', 'mem', 'name'])
  assert.deepEqual(headerColumns, rowColumns)
})

test('picking the CPU or memory tag asks the host for that ordering', async (context) => {
  const requested = []
  const renderer = await mount(
    context,
    React.createElement(ProcessPanel, {
      reading: readingFixture(),
      sort: 'cpu',
      onSortChange: (next) => requested.push(next),
      t,
    }),
  )
  const tags = tagsOf(renderer)
  await TestRenderer.act(async () => {
    tags[1].props.onClick()
  })
  await TestRenderer.act(async () => {
    tags[2].props.onClick()
  })
  assert.deepEqual(requested, ['mem', 'name'])
})

test('the list renders the order it is given, and filters by name or PID', async (context) => {
  const renderer = await mount(
    context,
    React.createElement(ProcessPanel, { reading: readingFixture(), sort: 'cpu', onSortChange() {}, t }),
  )
  assert.deepEqual(rowNames(renderer), ['heavy-cpu', 'heavy-mem'])

  const filter = renderer.root.findByProps({ className: 'dsh-perfmon-filter' })
  await TestRenderer.act(async () => {
    filter.props.onChange({ target: { value: 'heavy-mem' } })
  })
  assert.deepEqual(rowNames(renderer), ['heavy-mem'])

  await TestRenderer.act(async () => {
    filter.props.onChange({ target: { value: '999' } })
  })
  assert.deepEqual(rowNames(renderer), [])
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-empty'), ['没有匹配的进程'])

  await TestRenderer.act(async () => {
    filter.props.onChange({ target: { value: '2' } })
  })
  assert.deepEqual(rowNames(renderer), ['heavy-mem'], 'a PID match must survive the filter')
})

test('the panel reads once on mount, re-reads when the tag changes, and can be refreshed', async (context) => {
  const requests = []
  const load = async (request) => {
    requests.push(request.sort)
    return readingFixture()
  }
  const renderer = await mount(context, React.createElement(PerfmonBody, { t, load }))
  assert.deepEqual(requests, ['cpu'], 'the first read happens on mount')
  assert.equal(rowNames(renderer).length, 2)

  // Picking the memory tag changes the ordering the host is asked for.
  await TestRenderer.act(async () => {
    tagsOf(renderer)[1].props.onClick()
  })
  assert.deepEqual(requests, ['cpu', 'mem'])
  assert.equal(tagsOf(renderer)[1].props['aria-pressed'], true)

  // The manual refresh re-reads without changing the ordering.
  const refresh = renderer.root.find(
    (node) => node.type === 'button' && String(node.props.className ?? '').includes('dsh-perfmon-footSpacer'),
  )
  await TestRenderer.act(async () => {
    refresh.props.onClick()
  })
  assert.deepEqual(requests, ['cpu', 'mem', 'mem'])
})

test('a failing read shows the error and a retry that reads again', async (context) => {
  let attempt = 0
  const load = async () => {
    attempt += 1
    if (attempt === 1) throw new Error('boom')
    return readingFixture()
  }
  const renderer = await mount(context, React.createElement(PerfmonBody, { t, load }))
  const notices = textsOf(renderer, 'dsh-perfmon-notice')
  assert.equal(notices.length, 1)
  assert.match(notices[0], /读取失败: boom/)

  const retry = renderer.root.find(
    (node) => node.type === 'button' && node.props.className === 'dsh-perfmon-action',
  )
  await TestRenderer.act(async () => {
    retry.props.onClick()
  })
  assert.equal(attempt, 2)
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-notice'), [])
  assert.equal(rowNames(renderer).length, 2)
})

test('the header control is labelled and opens the page', async (context) => {
  const opened = []
  const renderer = await mount(
    context,
    React.createElement(HeaderButton, { t, open: () => opened.push('open') }),
  )
  const button = renderer.root.findByType('button')
  assert.equal(button.props.title, '打开性能监控面板')
  assert.equal(button.props['aria-label'], '打开性能监控面板')
  await TestRenderer.act(async () => {
    button.props.onClick()
  })
  assert.deepEqual(opened, ['open'])
})

test('the route path the browser calls is the one the host registers', () => {
  assert.equal(SNAPSHOT_PATH, '/api/perfmon.snapshot')
})

test('the gauge value has room inside the ring it is centred in', () => {
  // The reported defect: at the old 44px / 13px-text geometry the value was wider
  // than the hole and drew over the ring. The budget is the widest realistic
  // value on the per-core scale — "1024.0%" is about 41px at the 11px value font —
  // plus a couple of pixels so it never touches the stroke.
  const innerDiameter = (GAUGE_RING.radius - GAUGE_RING.stroke / 2) * 2
  assert.ok(
    innerDiameter >= 44,
    `inner diameter ${String(innerDiameter)}px leaves no room for a four-digit percentage`,
  )
  assert.ok(
    GAUGE_RING.size >= 2 * GAUGE_RING.radius + GAUGE_RING.stroke,
    'the ring stroke must fit inside the svg box, or the arc is clipped',
  )
})

test('the memory cell shows a whole-percent share beside the size', async (context) => {
  const renderer = await mount(
    context,
    React.createElement(ProcessPanel, { reading: readingFixture(), sort: 'cpu', onSortChange() {}, t }),
  )
  // The header cell carries the same data-column, so match the metric cell itself.
  const cells = renderer.root.findAll(
    (node) =>
      node.props['data-column'] === 'mem' &&
      String(node.props.className ?? '').includes('dsh-perfmon-metric'),
  )
  assert.ok(cells.length > 0)
  const shares = cells.map((cell) => {
    const share = cell.findAll((node) => node.props.className === 'dsh-perfmon-metricShare')
    assert.equal(share.length, 1, 'the share is its own element so it can be dropped when the column is tight')
    return share[0].children.join('')
  })
  // Whole percent: the tenth of a percent is not worth the column width, so a
  // 0.1% share reads 0% while the byte count beside it stays exact.
  assert.deepEqual(shares, [' · 0%', ' · 25%'])
  assert.equal(formatShare(4.4), '4%')
  assert.equal(formatShare(null), '—')
})

test('a platform that cannot answer a field shows a dash, never a zero', async (context) => {
  // The shape a Windows host produces when PowerShell is unavailable: a real CPU
  // reading from node:os, no memory, no processes, and a warning that says so.
  const reading = readingFixture({
    facts: { hostname: 'PC', platform: 'win32', platformLabel: 'Windows', arch: 'x64', coreCount: 8, uptimeSeconds: 3600 },
    cpu: { percent: 12.5, coreCount: 8, cores: [], loadAverage: null },
    // The host sends null, not a shape full of zeroes, when the reader could not
    // read memory at all.
    memory: null,
    processes: [],
    processCount: 0,
    warnings: ['powershell-missing', 'swap-unavailable'],
  })
  const renderer = await mount(context, React.createElement(PerfmonBody, { t, load: async () => reading }))
  await TestRenderer.act(async () => {})

  const details = textsOf(renderer, 'dsh-perfmon-gaugeDetail')
  assert.equal(details[0], '8 核', 'a platform with no load average shows the core count alone')
  assert.equal(details[1], '—', 'unreadable memory is one dash, not "0 B / 0 B"')
  assert.equal(details[2], '—', 'unreadable swap is unknown, not "not enabled"')

  // The platform is named in the header, and the warnings are listed, translated.
  const meta = textsOf(renderer, 'dsh-perfmon-cardMeta')[0]
  assert.match(meta, /Windows/)
  const warningItems = renderer.root.findAll(
    (node) => node.type === 'li' && typeof node.children[0] === 'string',
  )
  const warningText = warningItems.map((node) => node.children.join(''))
  assert.ok(warningText.some((line) => line.includes('PowerShell')))
  assert.ok(warningText.some((line) => line.includes('交换')))

  // And the process table says it has nothing rather than looking merely empty.
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-empty'), ['没有读到进程信息'])
})

test('the filter is a search field with a magnifier, a clear control and Escape', async (context) => {
  const renderer = await mount(
    context,
    React.createElement(ProcessPanel, { reading: readingFixture(), sort: 'cpu', onSortChange() {}, t }),
  )

  // It must be recognisable as a field: a wrapper carrying an icon and the input.
  const field = renderer.root.find(
    (node) => typeof node.type === 'string' && String(node.props.className ?? '').includes('dsh-perfmon-search'),
  )
  assert.ok(field, 'the search field wrapper is missing')
  const icon = field.findAll((node) => node.props.className === 'dsh-perfmon-searchIcon')
  assert.equal(icon.length, 1, 'the field carries a search icon')
  const input = field.findByProps({ className: 'dsh-perfmon-filter' })
  assert.equal(input.props.type, 'search')
  assert.match(input.props.placeholder, /进程名/)

  // No clear control while the field is empty.
  const clearButton = () =>
    renderer.root.findAll((node) => node.props.className === 'dsh-perfmon-searchClear')
  assert.equal(clearButton().length, 0)

  // Typing narrows the list and reveals the clear control.
  await TestRenderer.act(async () => {
    input.props.onChange({ target: { value: 'heavy-mem' } })
  })
  assert.deepEqual(rowNames(renderer), ['heavy-mem'])
  assert.equal(clearButton().length, 1, 'the clear control appears with content')

  // Clicking it restores the whole list.
  await TestRenderer.act(async () => {
    clearButton()[0].props.onClick()
  })
  assert.deepEqual(rowNames(renderer), ['heavy-cpu', 'heavy-mem'])
  assert.equal(clearButton().length, 0)

  // Escape clears a non-empty field, and is left alone when already empty.
  await TestRenderer.act(async () => {
    input.props.onChange({ target: { value: 'heavy' } })
  })
  assert.equal(rowNames(renderer).length, 2)
  let prevented = 0
  await TestRenderer.act(async () => {
    input.props.onKeyDown({ key: 'Escape', preventDefault: () => { prevented += 1 } })
  })
  assert.equal(prevented, 1)
  assert.equal(renderer.root.findByProps({ className: 'dsh-perfmon-filter' }).props.value, '')

  const emptyInput = renderer.root.findByProps({ className: 'dsh-perfmon-filter' })
  await TestRenderer.act(async () => {
    emptyInput.props.onKeyDown({ key: 'Escape', preventDefault: () => { prevented += 1 } })
  })
  assert.equal(prevented, 1, 'Escape on an empty field must not be swallowed')
})
