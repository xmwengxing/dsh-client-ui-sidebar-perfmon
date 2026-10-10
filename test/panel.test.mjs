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
  GpuPanel,
  DiskPanel,
  TemperaturePanel,
  TEMPERATURE_TILES,
  TEMPERATURE_TONES,
  temperatureTone,
  formatBytesCompact,
  HeaderButton,
  GAUGE_RING,
  createTranslator,
  formatShare,
  formatCelsius,
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
    gpu: {
      status: 'ready', at: 1700000000000, source: 'nvidia-smi', name: 'NVIDIA RTX',
      clockMhz: 1500, clockMaxMhz: 2000, memoryUsedBytes: 4 * 1024 ** 3,
      memoryTotalBytes: 8 * 1024 ** 3, memoryPercent: 50, warnings: [],
    },
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

/**
 * A temperature reading in the shape the host serves: four tiles, one of them
 * unavailable, so both the answered and the unanswered path are exercised.
 */
function temperatureFixture(overrides = {}) {
  return {
    status: 'ready',
    at: 1700000000000,
    source: 'windows-cim',
    groups: {
      cpu: null,
      gpu: { celsius: 53, min: 53, max: 53, count: 1, sensors: [{ label: 'NVIDIA GeForce GTX 1080 Ti', celsius: 53 }] },
      mainboard: { celsius: 27.9, min: 27.9, max: 27.9, count: 1, sensors: [{ label: 'TZ00_0', celsius: 27.9 }] },
      disk: {
        celsius: 40,
        min: 38,
        max: 40,
        count: 2,
        sensors: [
          { label: 'ST2000DM005', celsius: 38 },
          { label: 'SSD 512GB', celsius: 40 },
        ],
      },
    },
    warnings: ['temperature-cpu-unavailable'],
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

/** The inline widths of the GPU bar's fills, in render order. */
function gpuFillWidths(renderer) {
  return renderer.root
    .findAllByProps({ className: 'dsh-perfmon-gpuMetricFill' })
    .map((node) => node.props.style.inlineSize)
}

test('the resource card shows a two-half GPU bar between the gauges and the project folder', async (context) => {
  const reading = readingFixture({
    disk: {
      projectDir: '/srv/demo',
      projectDirs: [{ dir: '/srv/demo', bytes: 1024, entries: 1, truncated: false, warnings: [] }],
      projectBytes: 1024,
      projectEntries: 1,
      projectTruncated: false,
      droppedDirCount: 0,
      warnings: [],
      status: 'done',
    },
    warnings: [],
  })
  const renderer = await mount(context, React.createElement(GaugePanel, { reading, t }))
  const row = renderer.root.findByProps({ className: 'dsh-perfmon-gpuRow' })
  // One bar, two labelled halves: the clock on the left and VRAM on the right.
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-gpuMetricLabel'), ['频率', '显存'])
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-gpuMetricValue'), ['1500 MHz', '4.0GB / 8.0GB'])
  // Each half paints its own proportion: the clock against its boost ceiling
  // (1500 of 2000) and VRAM against total capacity (4 of 8 GB).
  assert.deepEqual(gpuFillWidths(renderer), ['75%', '50%'])
  assert.match(row.props.title, /NVIDIA RTX/)
  assert.match(row.props.title, /max 2000 MHz/)
  assert.match(row.props.title, /50%/)
  // Order matters: the GPU bar is a live machine reading and belongs with the
  // gauges; the project-folder row is a manual on-demand measurement and is last.
  assert.deepEqual(
    renderer.root
      .findAll((node) => node.props.className === 'dsh-perfmon-gauges' || node.props.className === 'dsh-perfmon-disk' || node.props.className === 'dsh-perfmon-gpuRow')
      .map((node) => node.props.className),
    ['dsh-perfmon-gauges', 'dsh-perfmon-gpuRow', 'dsh-perfmon-disk'],
    'the GPU bar sits directly beneath the gauges and above the project-folder line',
  )
})

test('GPU with VRAM but no frequency shows the VRAM bar and an empty clock bar', async (context) => {
  const reading = readingFixture({
    gpu: {
      status: 'ready', source: 'windows-counters', name: 'AMD Radeon',
      clockMhz: null, clockMaxMhz: null,
      memoryUsedBytes: 2 * 1024 ** 3, memoryTotalBytes: 16 * 1024 ** 3,
      memoryPercent: 12.5, warnings: ['gpu-clock-unavailable'],
    },
  })
  const renderer = await mount(context, React.createElement(GaugePanel, { reading, t }))
  // The value is a bare dash because the half's own label already names it.
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-gpuMetricValue'), ['—', '2.0GB / 16.0GB'])
  // With no maximum there is no honest proportion, so the clock paints nothing
  // rather than a filled bar implying a measurement that was never made.
  assert.deepEqual(gpuFillWidths(renderer), ['0%', '12.5%'])
})

test('a nonsense GPU percentage never paints outside the track', async (context) => {
  const reading = readingFixture({
    gpu: {
      status: 'ready', source: 'windows-counters', name: 'Odd',
      clockMhz: 3000, clockMaxMhz: 2000,
      memoryUsedBytes: 8 * 1024 ** 3, memoryTotalBytes: 8 * 1024 ** 3,
      memoryPercent: 140, warnings: [],
    },
  })
  const renderer = await mount(context, React.createElement(GaugePanel, { reading, t }))
  // A clock above its own ceiling, and a percentage over 100, both clamp: the
  // fill can never be wider than the track it sits in.
  assert.deepEqual(gpuFillWidths(renderer), ['100%', '100%'])
})

test('hidden or legacy hosts do not render the GPU bar', async (context) => {
  const hidden = await mount(context, React.createElement(GaugePanel, {
    reading: readingFixture({ gpu: { status: 'hidden' } }), t,
  }))
  assert.equal(hidden.root.findAllByProps({ className: 'dsh-perfmon-gpuRow' }).length, 0)
  const legacy = await mount(context, React.createElement(GaugePanel, { reading: readingFixture({ gpu: undefined }), t }))
  assert.equal(legacy.root.findAllByProps({ className: 'dsh-perfmon-gpuRow' }).length, 1)
  // No reading at all still shows both halves, each an explicit dash.
  assert.deepEqual(textsOf(legacy, 'dsh-perfmon-gpuMetricValue'), ['—', '—'])
  assert.deepEqual(gpuFillWidths(legacy), ['0%', '0%'])
})

test('the resource window carries the project-folder line', async (context) => {
  const disk = {
    projectDir: '/srv/demo',
    projectDirs: [{ dir: '/srv/demo', bytes: 3 * 1024 ** 3, entries: 4321, truncated: false, warnings: [] }],
    projectBytes: 3 * 1024 ** 3,
    projectEntries: 4321,
    projectTruncated: false,
    droppedDirCount: 0,
    warnings: [],
  }
  const renderer = await mount(
    context,
    React.createElement(GaugePanel, { reading: readingFixture({ disk, warnings: [] }), t }),
  )
  const row = renderer.root.findByProps({ className: 'dsh-perfmon-disk' })
  assert.equal(row.props.title.includes('/srv/demo'), true, 'the tooltip names the folder')
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-diskLabel'), ['项目目录'])
  assert.equal(textsOf(renderer, 'dsh-perfmon-diskValue')[0], '3.0 GB')
  assert.match(textsOf(renderer, 'dsh-perfmon-diskDetail')[0], /4321 项/)
  // Without a disk reading the row disappears rather than showing a zero.
  const bare = await mount(context, React.createElement(GaugePanel, { reading: readingFixture(), t }))
  assert.equal(bare.root.findAllByProps({ className: 'dsh-perfmon-disk' }).length, 0)
})

test('a multi-workspace reading says how many folders the total covers', async (context) => {
  const disk = {
    projectDir: null,
    projectDirs: [
      { dir: '/srv/alpha', bytes: 1024 ** 3, entries: 100, truncated: false, warnings: [] },
      { dir: '/srv/beta', bytes: 2 * 1024 ** 3, entries: 200, truncated: false, warnings: [] },
    ],
    projectBytes: 3 * 1024 ** 3,
    projectEntries: 300,
    projectTruncated: false,
    droppedDirCount: 0,
    warnings: [],
  }
  const renderer = await mount(
    context,
    React.createElement(GaugePanel, { reading: readingFixture({ disk, warnings: [] }), t }),
  )
  assert.equal(textsOf(renderer, 'dsh-perfmon-diskValue')[0], '3.0 GB')
  assert.match(textsOf(renderer, 'dsh-perfmon-diskDetail')[0], /2 个目录/)
  const row = renderer.root.findByProps({ className: 'dsh-perfmon-disk' })
  assert.equal(row.props.title.includes('/srv/alpha'), true, 'the tooltip names every folder')
  assert.equal(row.props.title.includes('/srv/beta'), true)
})

test('the scan is manual: a button starts it, a running scan shows a stop control', async (context) => {
  // Nothing measured yet: the row invites the click instead of pretending.
  const idle = {
    projectDir: null,
    projectDirs: [],
    projectBytes: null,
    projectEntries: 0,
    projectTruncated: false,
    droppedDirCount: 0,
    warnings: ['project-dir-no-cwd'],
    status: 'idle',
  }
  const starts = []
  const stops = []
  const measure = { running: false, onStart: () => starts.push(1), onStop: () => stops.push(1) }
  const idleRenderer = await mount(
    context,
    React.createElement(GaugePanel, { reading: readingFixture({ disk: idle, warnings: ['project-dir-no-cwd'] }), measure, t }),
  )
  assert.equal(textsOf(idleRenderer, 'dsh-perfmon-diskValue')[0], '—')
  assert.match(textsOf(idleRenderer, 'dsh-perfmon-diskDetail')[0], /尚未统计/)
  const startButton = idleRenderer.root.findByProps({ className: 'dsh-perfmon-diskAction' })
  assert.match(startButton.props.title, /统计当前会话目录/)
  await TestRenderer.act(async () => {
    startButton.props.onClick()
  })
  assert.deepEqual(starts, [1], 'clicking the button starts a scan')
  assert.deepEqual(stops, [])

  // While scanning: a spinner stands where the size would sit, and the same
  // seat turns into the stop control.
  const scanning = { ...idle, warnings: [], status: 'scanning' }
  const running = { running: true, onStart: () => starts.push(1), onStop: () => stops.push(1) }
  const scanningRenderer = await mount(
    context,
    React.createElement(GaugePanel, { reading: readingFixture({ disk: scanning, warnings: [] }), measure: running, t }),
  )
  assert.ok(scanningRenderer.root.findByProps({ className: 'dsh-perfmon-diskSpinner' }), 'a running scan spins')
  assert.match(textsOf(scanningRenderer, 'dsh-perfmon-diskDetail')[0], /正在统计/)
  const stopButton = scanningRenderer.root.findByProps({ className: 'dsh-perfmon-diskAction' })
  assert.match(stopButton.props.title, /停止统计/)
  await TestRenderer.act(async () => {
    stopButton.props.onClick()
  })
  assert.deepEqual(stops, [1], 'clicking again stops the scan')

  // A hidden-by-config reading renders no row at all.
  const hidden = { ...idle, warnings: ['project-dir-hidden'], status: 'hidden' }
  const hiddenRenderer = await mount(
    context,
    React.createElement(GaugePanel, { reading: readingFixture({ disk: hidden, warnings: ['project-dir-hidden'] }), measure, t }),
  )
  assert.equal(hiddenRenderer.root.findAllByProps({ className: 'dsh-perfmon-disk' }).length, 0)
})

test('an unreadable project folder explains itself instead of reading as zero', async (context) => {
  const disk = {
    projectDir: null,
    projectDirs: [{ dir: '/srv/demo', bytes: null, entries: 0, truncated: false, warnings: ['project-dir-unavailable'] }],
    projectBytes: null,
    projectEntries: 0,
    projectTruncated: false,
    droppedDirCount: 0,
    warnings: ['project-dir-unavailable'],
  }
  const renderer = await mount(
    context,
    React.createElement(GaugePanel, { reading: readingFixture({ disk, warnings: ['project-dir-unavailable'] }), t }),
  )
  assert.equal(textsOf(renderer, 'dsh-perfmon-diskValue')[0], '—')
  assert.match(textsOf(renderer, 'dsh-perfmon-diskDetail')[0], /不可读/)
})

// A very large tree with an unreachable corner is still a usable number, but it
// must say so beside the figure rather than quietly overstate its own accuracy.
test('a truncated project-folder walk says so next to the size', async (context) => {
  const disk = {
    projectDir: '/srv/big',
    projectDirs: [{ dir: '/srv/big', bytes: 100 * 1024 ** 3, entries: 50000, truncated: true, warnings: ['project-dir-partial'] }],
    projectBytes: 100 * 1024 ** 3,
    projectEntries: 50000,
    projectTruncated: true,
    droppedDirCount: 0,
    warnings: ['project-dir-partial'],
  }
  const renderer = await mount(
    context,
    React.createElement(GaugePanel, { reading: readingFixture({ disk, warnings: ['project-dir-partial'] }), t }),
  )
  const detail = textsOf(renderer, 'dsh-perfmon-diskDetail')[0]
  assert.match(detail, /已截断/)
  assert.equal(textsOf(renderer, 'dsh-perfmon-diskValue')[0], '100 GB')
})

test('folders the reading had to drop are named beside the total', async (context) => {
  const disk = {
    projectDir: null,
    projectDirs: [
      { dir: '/srv/a', bytes: 10, entries: 1, truncated: false, warnings: [] },
      { dir: '/srv/b', bytes: 20, entries: 2, truncated: false, warnings: [] },
    ],
    projectBytes: 30,
    projectEntries: 3,
    projectTruncated: false,
    droppedDirCount: 3,
    warnings: ['project-dir-dropped'],
  }
  const renderer = await mount(
    context,
    React.createElement(GaugePanel, { reading: readingFixture({ disk, warnings: ['project-dir-dropped'] }), t }),
  )
  assert.match(textsOf(renderer, 'dsh-perfmon-diskDetail')[0], /另有 3 个目录未统计/)
})

test('DiskPanel renders nothing without a disk reading', (context) => {
  return mount(context, React.createElement(DiskPanel, { disk: undefined, warnings: [], t })).then((renderer) => {
    assert.equal(renderer.root.findAllByProps({ className: 'dsh-perfmon-disk' }).length, 0)
  })
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

test('the measure request names the session whose workspace is to be scanned', async (context) => {
  const requests = []
  let scanning = false
  const load = async (request) => {
    if (request.measure === true) scanning = true
    if (request.measure === false) scanning = false
    requests.push({ measure: request.measure, session: request.session })
    return readingFixture({ disk: { status: scanning ? 'scanning' : 'idle', warnings: scanning ? [] : ['project-dir-no-cwd'] } })
  }
  const renderer = await mount(
    context,
    React.createElement(PerfmonBody, { t, load, sessionId: 'session-9' }),
  )
  await TestRenderer.act(async () => {})
  const start = renderer.root.findByProps({ className: 'dsh-perfmon-diskAction' })
  await TestRenderer.act(async () => {
    start.props.onClick()
  })
  // The start request carries the session id; the stop request carries none.
  // How many times a control reaches the wire is the act scheduler's business
  // (a re-send is a no-op on the host), so the spec asserts the order of the
  // distinct control requests rather than their positions.
  const controlsBeforeStop = requests.filter((request) => request.measure !== undefined)
  const startControl = controlsBeforeStop.find((request) => request.measure === true)
  assert.notEqual(startControl, undefined, 'the start click sent a start control')
  assert.equal(startControl.session, 'session-9', 'the start names the session')
  // The fixture flips to `scanning`, so the button is the stop control now.
  const stop = renderer.root.findByProps({ className: 'dsh-perfmon-diskAction' })
  await TestRenderer.act(async () => {
    stop.props.onClick()
  })
  await TestRenderer.act(async () => {})
  const controls = requests.filter((request) => request.measure !== undefined)
  const firstStop = controls.findIndex((request) => request.measure === false)
  assert.ok(firstStop > controls.indexOf(startControl), 'the stop control follows the start')
  assert.ok(
    controls.filter((request) => request.measure === false).every((request) => request.session === undefined),
    'stop requests carry no session',
  )
  assert.ok(
    requests.filter((request) => request.measure === undefined).every((request) => request.session === undefined),
    'ordinary polls carry neither control',
  )
})

// The sidebar shows sessions whose home process never entered them into the
// host's live store; when no opening carries a session id, the mounted-seat
// binding is what the meter falls back to.
test('without an injected session the mounted seat is the fallback', async (context) => {
  let listeners = 0
  const ctx = {
    get: (name) =>
      name === 'sidebarRight'
        ? { mounted: { subscribe: () => { listeners += 1; return () => { listeners -= 1 } }, getSnapshot: () => 'seat-session' } }
        : undefined,
  }
  const requests = []
  const load = async (request) => {
    requests.push(request.session)
    return readingFixture({ disk: { status: 'idle', warnings: ['project-dir-no-cwd'] } })
  }
  const renderer = await mount(
    context,
    React.createElement(PerfmonBody, { t, load, ctx }),
  )
  await TestRenderer.act(async () => {})
  const start = renderer.root.findByProps({ className: 'dsh-perfmon-diskAction' })
  await TestRenderer.act(async () => {
    start.props.onClick()
  })
  assert.deepEqual(requests[requests.length - 1], 'seat-session')

  // No service at all: the meter still works, it just has no session to name.
  const bare = await mount(
    context,
    React.createElement(PerfmonBody, { t, load, ctx: {} }),
  )
  await TestRenderer.act(async () => {})
  const bareStart = bare.root.findByProps({ className: 'dsh-perfmon-diskAction' })
  await TestRenderer.act(async () => {
    bareStart.props.onClick()
  })
  assert.equal(requests[requests.length - 1], undefined)
})

// The seat injects the session id straight into the header button, which is what
// hands the page its session without reaching any store.
test('the header button receives the session id from its opening', async (context) => {
  const opened = []
  const renderer = await mount(
    context,
    React.createElement(HeaderButton, { t, sessionId: 'session-3', open: (id) => opened.push(id) }),
  )
  const button = renderer.root.findByType('button')
  await TestRenderer.act(async () => {
    button.props.onClick()
  })
  assert.deepEqual(opened, ['session-3'])
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

  // The platform is named in the header.
  const meta = textsOf(renderer, 'dsh-perfmon-cardMeta')[0]
  assert.match(meta, /Windows/)
  // The warnings are no longer a card of their own — they ride the footer's
  // tooltip, so the explanation is still reachable without costing a block of
  // height on every healthy host.
  const foot = renderer.root.find((node) => String(node.props.className ?? '') === 'dsh-perfmon-foot')
  const updated = foot.findAll((node) => typeof node.props.title === 'string')
  assert.equal(updated.length, 1, 'the footer carries the warnings as a tooltip')
  assert.match(updated[0].props.title, /PowerShell/)
  assert.match(updated[0].props.title, /交换/)
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-notice--muted'), [], 'and no notice card is rendered')

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

test('each fixed column is adjustable from a divider in the header', async (context) => {
  const { COLUMN_LIMITS, readStoredWidths } = require(resolve(root, 'test/.build/components.cjs'))
  // Stand in for the browser's storage, which is absent under Node.
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  }
  store.clear()

  const renderer = await mount(
    context,
    React.createElement(ProcessPanel, { reading: readingFixture(), sort: 'cpu', onSortChange() {}, t }),
  )

  const grips = renderer.root.findAll((node) => node.props.role === 'separator')
  assert.equal(grips.length, 2, 'the CPU and memory columns carry a divider; the name column does not')
  assert.deepEqual(
    grips.map((node) => node.props['data-grip']),
    ['cpu', 'mem'],
  )
  for (const grip of grips) {
    const which = grip.props['data-grip']
    assert.equal(grip.props['aria-orientation'], 'vertical')
    assert.equal(grip.props['aria-valuenow'], COLUMN_LIMITS[which].fallback)
    assert.equal(grip.props['aria-valuemin'], COLUMN_LIMITS[which].min)
    assert.equal(grip.props['aria-valuemax'], COLUMN_LIMITS[which].max)
    assert.equal(grip.props.tabIndex, 0, 'the divider is reachable without a pointer')
  }

  // The widths reach the grid as custom properties on the card.
  const card = renderer.root.find(
    (node) => String(node.props.className ?? '').includes('dsh-perfmon-card--processes'),
  )
  assert.equal(card.props.style['--perfmon-cpu-column'], '54px')
  assert.equal(card.props.style['--perfmon-mem-column'], '88px')

  // Arrow keys move the divider, and Shift takes a bigger step.
  const cpuGrip = () => renderer.root.findAll((node) => node.props['data-grip'] === 'cpu')[0]
  const prevent = { preventDefault() {} }
  await TestRenderer.act(async () => {
    cpuGrip().props.onKeyDown({ key: 'ArrowRight', shiftKey: false, ...prevent })
  })
  assert.equal(cpuGrip().props['aria-valuenow'], 58)
  await TestRenderer.act(async () => {
    cpuGrip().props.onKeyDown({ key: 'ArrowLeft', shiftKey: true, ...prevent })
  })
  assert.equal(cpuGrip().props['aria-valuenow'], 42)

  // Clamped at the bounds, however far the key repeats.
  for (let i = 0; i < 20; i += 1) {
    await TestRenderer.act(async () => {
      cpuGrip().props.onKeyDown({ key: 'ArrowLeft', shiftKey: true, ...prevent })
    })
  }
  assert.equal(cpuGrip().props['aria-valuenow'], COLUMN_LIMITS.cpu.min)

  // Double-click returns that column to the shipped width.
  await TestRenderer.act(async () => {
    cpuGrip().props.onDoubleClick()
  })
  assert.equal(cpuGrip().props['aria-valuenow'], COLUMN_LIMITS.cpu.fallback)

  // A width the reader chose is remembered for the next visit.
  await TestRenderer.act(async () => {
    cpuGrip().props.onKeyDown({ key: 'ArrowRight', shiftKey: true, ...prevent })
  })
  const stored = readStoredWidths()
  assert.equal(stored.cpu, COLUMN_LIMITS.cpu.fallback + 16)
  assert.equal(stored.mem, COLUMN_LIMITS.mem.fallback)

  // And a stored pair is what the panel starts from next time.
  store.set('dsh-perfmon.columns.v1', JSON.stringify({ cpu: 90, mem: 120 }))
  const again = await mount(
    context,
    React.createElement(ProcessPanel, { reading: readingFixture(), sort: 'cpu', onSortChange() {}, t }),
  )
  const card2 = again.root.find(
    (node) => String(node.props.className ?? '').includes('dsh-perfmon-card--processes'),
  )
  assert.equal(card2.props.style['--perfmon-cpu-column'], '90px')
  assert.equal(card2.props.style['--perfmon-mem-column'], '120px')

  // Corrupt storage must not break the panel.
  store.set('dsh-perfmon.columns.v1', '{not json')
  assert.deepEqual(readStoredWidths(), {
    cpu: COLUMN_LIMITS.cpu.fallback,
    mem: COLUMN_LIMITS.mem.fallback,
  })
  delete globalThis.localStorage
})

// ------------------------------------------------------------ temperatures

test('the temperature card shows one tile each for CPU, GPU, board and drives', async (context) => {
  const renderer = await mount(
    context,
    React.createElement(TemperaturePanel, { reading: { temperature: temperatureFixture() }, t }),
  )
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-tempLabel'), ['CPU', '显卡', '主板', '硬盘'])
  // The unavailable CPU tile is a dash, and the answered ones carry their reading
  // with the unit beside it.
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-tempValue'), ['—', '53.0°C', '27.9°C', '40.0°C'])
  // Two lines per tile, and no third: the detail that used to be printed there
  // is in the tooltip now, so a tile is exactly a value and a label.
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-tempDetail'), [])
  const tiles = renderer.root.findAll((node) =>
    String(node.props.className ?? '').includes('dsh-perfmon-temp '),
  )
  for (const tile of tiles) {
    // Direct children are the lines; the unit is a span *inside* the value, so
    // it must not be counted as a line of its own.
    const lines = tile.children.filter((child) => typeof child !== 'string')
    assert.equal(lines.length, 2, 'a tile renders the reading and the label, nothing else')
    assert.deepEqual(
      lines.map((line) => line.props.className),
      ['dsh-perfmon-tempValue', 'dsh-perfmon-tempLabel'],
    )
  }
})

test('the tile tooltip carries every sensor and the spread, which the tile no longer prints', async (context) => {
  const renderer = await mount(
    context,
    React.createElement(TemperaturePanel, { reading: { temperature: temperatureFixture() }, t }),
  )
  const tiles = renderer.root.findAll((node) =>
    String(node.props.className ?? '').includes('dsh-perfmon-temp '),
  )
  assert.equal(tiles.length, 4)
  // The drive tile has two sensors: both are named, and the spread is stated.
  assert.match(tiles[3].props.title, /ST2000DM005: 38\.0°C/)
  assert.match(tiles[3].props.title, /SSD 512GB: 40\.0°C/)
  assert.match(tiles[3].props.title, /最低 38\.0 · 最高 40\.0/)
  // A single-sensor tile names that sensor.
  assert.equal(tiles[1].props.title, 'NVIDIA GeForce GTX 1080 Ti: 53.0°C')
})

test('an unanswerable tile explains itself in its tooltip instead of a bare dash', async (context) => {
  const renderer = await mount(
    context,
    React.createElement(TemperaturePanel, { reading: { temperature: temperatureFixture() }, t }),
  )
  const tiles = renderer.root.findAll((node) =>
    String(node.props.className ?? '').includes('dsh-perfmon-temp '),
  )
  // The CPU tile has no reading; its tooltip says why, which is where the
  // removed warnings notice used to carry that information.
  assert.equal(tiles[0].children[0].children.join(''), '—')
  assert.match(tiles[0].props.title, /CPU 温度不可读/)
})

test('a temperature reading the host could not make shows four dashes, never zeroes', async (context) => {
  const unavailable = temperatureFixture({
    status: 'unavailable',
    source: null,
    groups: { cpu: null, gpu: null, mainboard: null, disk: null },
  })
  const renderer = await mount(
    context,
    React.createElement(TemperaturePanel, { reading: { temperature: unavailable }, t }),
  )
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-tempValue'), ['—', '—', '—', '—'])
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-tempDetail'), [])
  assert.match(textsOf(renderer, 'dsh-perfmon-cardMeta')[0], /不可用/)
})

test('a hidden temperature card renders nothing at all', async (context) => {
  const hidden = temperatureFixture({ status: 'hidden', warnings: ['temperature-hidden'] })
  const renderer = await mount(
    context,
    React.createElement(TemperaturePanel, { reading: { temperature: hidden }, t }),
  )
  assert.equal(renderer.toJSON(), null)

  // And a reading with no temperature block at all — an older host — is silent
  // rather than a crash.
  const absent = await mount(context, React.createElement(TemperaturePanel, { reading: {}, t }))
  assert.equal(absent.toJSON(), null)
})

test('the tile tone tracks the reading against the warm and hot lines', async (context) => {
  assert.equal(temperatureTone(null), 'unknown')
  assert.equal(temperatureTone(undefined), 'unknown')
  assert.equal(temperatureTone(45), 'cool')
  assert.equal(temperatureTone(TEMPERATURE_TONES.warm - 0.1), 'cool')
  assert.equal(temperatureTone(TEMPERATURE_TONES.warm), 'warm')
  assert.equal(temperatureTone(TEMPERATURE_TONES.hot - 0.1), 'warm')
  assert.equal(temperatureTone(TEMPERATURE_TONES.hot), 'hot')
  assert.equal(temperatureTone(99), 'hot')

  // The tone reaches the DOM as a class, which is what colours the tile.
  const reading = temperatureFixture({
    groups: {
      cpu: { celsius: 91, min: 91, max: 91, count: 1, sensors: [{ label: 'pkg', celsius: 91 }] },
      gpu: null,
      mainboard: { celsius: 30, min: 30, max: 30, count: 1, sensors: [{ label: 'board', celsius: 30 }] },
      disk: null,
    },
  })
  const renderer = await mount(
    context,
    React.createElement(TemperaturePanel, { reading: { temperature: reading }, t }),
  )
  const tones = renderer.root
    .findAll((node) => String(node.props.className ?? '').includes('dsh-perfmon-temp--'))
    .map((node) => node.props.className.match(/dsh-perfmon-temp--(\w+)/)[1])
  assert.deepEqual(tones, ['hot', 'unknown', 'cool', 'unknown'])
})

test('the temperature card sits directly under the resource card', async (context) => {
  const renderer = await mount(
    context,
    React.createElement(PerfmonBody, {
      t,
      load: async () => readingFixture({ temperature: temperatureFixture(), warnings: [] }),
    }),
  )
  await TestRenderer.act(async () => {})
  // The two cards are siblings inside the panel root, in that order.
  const rootNode = renderer.root.find((node) => String(node.props.className ?? '') === 'dsh-perfmon-root')
  const titles = rootNode
    .findAll((node) => node.props.className === 'dsh-perfmon-cardTitle', { deep: true })
    .map((node) => node.children.join(''))
  assert.deepEqual(titles, ['资源占用', '温度', '进程列表'])
})

test('the panel explains an unreadable temperature in the tile, not in a notice card', async (context) => {
  const renderer = await mount(
    context,
    React.createElement(PerfmonBody, {
      t,
      load: async () =>
        readingFixture({
          temperature: temperatureFixture({
            groups: { cpu: null, gpu: null, mainboard: null, disk: null },
            warnings: ['temperature-cpu-unavailable'],
          }),
          warnings: ['temperature-cpu-unavailable'],
        }),
    }),
  )
  await TestRenderer.act(async () => {})
  // The reason lives on the CPU tile itself, which is where the reader is
  // looking when they wonder why it is empty.
  const tiles = renderer.root.findAll((node) =>
    String(node.props.className ?? '').includes('dsh-perfmon-temp '),
  )
  assert.match(tiles[0].props.title, /CPU 温度不可读/)
  // And nothing renders the old warnings card any more.
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-notice--muted'), [])
  assert.deepEqual(textsOf(renderer, 'dsh-perfmon-warningList'), [])
})

test('a Celsius reading is formatted to the tenth, and a missing one is a dash', () => {
  assert.equal(formatCelsius(27.850000000000023), '27.9')
  assert.equal(formatCelsius(0), '0.0', 'a genuine zero is a reading, not a gap')
  assert.equal(formatCelsius(null), '—')
  assert.equal(formatCelsius(undefined), '—')
  assert.equal(formatCelsius(Number.NaN), '—')
})

test('the four tiles are the four components the feature promises, in order', () => {
  assert.deepEqual(
    TEMPERATURE_TILES.map((tile) => tile.kind),
    ['cpu', 'gpu', 'mainboard', 'disk'],
  )
})
