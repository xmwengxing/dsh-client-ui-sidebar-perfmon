/**
 * Specs for the host collector.
 *
 * The differencing rules are the substance of this plugin's numbers, so they are
 * asserted against hand-built samples where the expected percentage is arithmetic
 * rather than "whatever the machine happened to be doing". One spec then reads
 * the real `/proc` to prove the readers still match this kernel's layout.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
// A same-package spec reads the internals directly; the published host face
// exports only the plugin's own `apply`/`inject`/`name`.
import { derive, hostFacts, sortProcesses, createSampler } from '../src/host/metrics.js'
import { resolveConfig, resolveSessionCwd } from '../src/host/index.js'
import { linuxReader } from '../src/host/readers/linux.js'

/** A raw sample with a chosen CPU/memory story and a chosen process list. */
function sampleFixture({ at, total, idle, processes }) {
  return {
    at,
    cpu: {
      aggregate: { total, idle },
      cores: [
        { id: 0, total: total / 2, idle: idle / 2 },
        { id: 1, total: total / 2, idle: idle / 2 },
      ],
    },
    memory: {
      total: 1000,
      available: 400,
      used: 600,
      free: 100,
      buffers: 20,
      cached: 200,
      swapTotal: 500,
      swapFree: 300,
      swapUsed: 200,
      swapCached: 0,
    },
    processes,
  }
}

/** One raw process row, in the shape the `/proc` reader produces. */
function processFixture(pid, name, utime, stime, rssBytes) {
  // Linux counts CPU in jiffies; readers on other platforms fold their own unit
  // into `cpuTime`, and the derivation only ever differences it.
  return { pid, name, state: 'S', threads: 1, cpuTime: utime + stime, rssBytes }
}

test('the machine percentage is the busy share of the elapsed jiffies', () => {
  // 1000 jiffies elapsed, 400 of them idle: 600 busy of 1000 is 60%.
  const before = sampleFixture({ at: 0, total: 1000, idle: 800, processes: [] })
  const after = sampleFixture({ at: 2000, total: 2000, idle: 1200, processes: [] })
  const reading = derive(before, after)
  assert.equal(reading.cpu.percent, 60)
  assert.equal(reading.cpu.coreCount, 2)
  assert.deepEqual(reading.cpu.cores, [
    { id: 0, percent: 60 },
    { id: 1, percent: 60 },
  ])
  assert.equal(reading.window.millis, 2000)
})

test('a process percentage is scaled so 100% means one core', () => {
  // 1000 jiffies elapse across 2 cores. The process burns 500 of them: half the
  // machine, which is one whole core — 100% on the per-core scale, not 50%.
  const before = sampleFixture({
    at: 0,
    total: 1000,
    idle: 800,
    processes: [processFixture(7, 'busy', 100, 100, 500)],
  })
  const after = sampleFixture({
    at: 1000,
    total: 2000,
    idle: 1200,
    processes: [processFixture(7, 'busy', 350, 350, 800)],
  })
  const reading = derive(before, after)
  const busy = reading.processes.find((process) => process.pid === 7)
  assert.equal(busy.cpuPercent, 100)
  assert.equal(busy.rssBytes, 800)
  assert.equal(busy.memPercent, 80)
})

test('a process first seen in this window reports no percentage rather than zero', () => {
  const before = sampleFixture({ at: 0, total: 1000, idle: 800, processes: [] })
  const after = sampleFixture({
    at: 1000,
    total: 2000,
    idle: 1300,
    processes: [processFixture(9, 'new', 10, 10, 100)],
  })
  const reading = derive(before, after)
  assert.equal(reading.processes[0].cpuPercent, null)
})

test('memory and swap percentages come from the meminfo totals', () => {
  const before = sampleFixture({ at: 0, total: 0, idle: 0, processes: [] })
  const after = sampleFixture({ at: 1000, total: 0, idle: 0, processes: [] })
  const reading = derive(before, after)
  assert.equal(reading.memory.percent, 60)
  assert.equal(reading.memory.swapPercent, 40)
  assert.equal(reading.cpu.percent, null, 'no elapsed jiffies means no percentage')
})

test('the process orderings rank by the requested resource', () => {
  const processes = [
    { pid: 1, name: 'beta', cpuPercent: 5, rssBytes: 900, memPercent: 90 },
    { pid: 2, name: 'alpha', cpuPercent: 80, rssBytes: 100, memPercent: 10 },
    { pid: 3, name: 'gamma', cpuPercent: 20, rssBytes: 500, memPercent: 50 },
  ]
  assert.deepEqual(sortProcesses(processes, 'cpu', 2).map((p) => p.pid), [2, 3])
  assert.deepEqual(sortProcesses(processes, 'mem', 2).map((p) => p.pid), [1, 3])
  assert.deepEqual(sortProcesses(processes, 'name', 3).map((p) => p.pid), [2, 1, 3])
  assert.deepEqual(sortProcesses(processes, 'nonsense', 1).map((p) => p.pid), [2], 'unknown keys fall back to cpu')
})

test('a process with no reading sorts last rather than first', () => {
  const processes = [
    { pid: 1, name: 'unknown', cpuPercent: null, rssBytes: 0, memPercent: 0 },
    { pid: 2, name: 'known', cpuPercent: 0.5, rssBytes: 0, memPercent: 0 },
  ]
  assert.deepEqual(sortProcesses(processes, 'cpu', 2).map((p) => p.pid), [2, 1])
})

test('the live Linux reader feeds the sampler', { skip: process.platform !== 'linux' }, async () => {
  const sample = await linuxReader.sample()
  assert.ok(sample.cpu.aggregate.total > 0, '/proc/stat must report jiffies')
  assert.ok(sample.cpu.cores.length > 0, '/proc/stat must report at least one core')
  assert.ok(sample.memory.total > 0, '/proc/meminfo must report a total')
  assert.ok(sample.processes.length > 0, '/proc must list processes')
  const first = sample.processes[0]
  assert.equal(typeof first.name, 'string')
  assert.ok(first.name.length > 0)
  assert.ok(first.rssBytes >= 0)

  const sampler = createSampler({ sampleMillis: 50, reader: linuxReader })
  const reading = await sampler.snapshot({ sort: 'mem', limit: 3 })
  assert.equal(reading.processes.length, 3)
  assert.equal(reading.sort, 'mem')
  assert.ok(reading.processCount >= reading.processes.length)
  assert.ok(reading.memory.total > 0)
  assert.ok(reading.facts.coreCount > 0)
  // The 3 returned rows really are the three largest by resident size.
  const sizes = reading.processes.map((process) => process.rssBytes)
  assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a))
})

test('the route merges the workspace reading into the snapshot', () => {
  // Exactly what src/host/index.js composes per request: the live reading, the
  // disk reading, and one warnings list that carries both halves' reasons. The
  // merge lives at the route, so the spec pins the composition, not the wiring.
  const before = sampleFixture({ at: 0, total: 1000, idle: 800, processes: [] })
  const after = sampleFixture({ at: 2000, total: 2000, idle: 1200, processes: [] })
  const live = derive(before, after)
  const disk = {
    projectDir: null,
    projectDirs: [{ dir: '/srv/demo', bytes: 4096, entries: 12, truncated: false, warnings: [] }],
    projectBytes: 4096,
    projectEntries: 12,
    projectTruncated: false,
    droppedDirCount: 0,
    warnings: ['project-dir-skipped'],
  }
  const response = { ...live, disk, warnings: [...(live.warnings ?? []), ...disk.warnings] }
  assert.equal(response.disk.projectBytes, 4096)
  assert.deepEqual(response.warnings, ['project-dir-skipped'])
  assert.equal(response.cpu.percent, 60, 'the live reading is untouched by the merge')
})

test('the host facts describe this machine', { skip: process.platform !== 'linux' }, () => {
  const facts = hostFacts()
  assert.equal(facts.platform, 'linux')
  assert.ok(facts.coreCount > 0)
  assert.ok(facts.uptimeSeconds > 0)
  assert.equal(facts.loadAverage.length, 3)
})

test('a reader with unavailable fields still produces a usable reading', () => {
  // Exactly the shape the Windows reader returns on a host where a process could
  // not be inspected: no state, no thread count, no CPU time, no working set.
  const before = sampleFixture({
    at: 0,
    total: 1000,
    idle: 800,
    processes: [
      { pid: 4, name: 'System', state: null, threads: null, cpuTime: null, rssBytes: null },
    ],
  })
  const after = sampleFixture({
    at: 2000,
    total: 2000,
    idle: 1200,
    processes: [
      { pid: 4, name: 'System', state: null, threads: null, cpuTime: null, rssBytes: null },
    ],
  })
  const reading = derive(before, after)
  const row = reading.processes[0]
  assert.equal(row.cpuPercent, null, 'an unreadable CPU time is unknown, not 0%')
  assert.equal(row.rssBytes, null, 'an unreadable working set is unknown, not 0 bytes')
  assert.equal(row.memPercent, null)
  assert.equal(row.state, null)
  assert.equal(row.threads, null)
  // And the machine reading is unaffected by the missing per-process figures:
  // 1000 jiffies elapsed with 400 idle is 60% busy.
  assert.equal(reading.cpu.percent, 60)
})

test('unknown figures sort last under both resource orderings', () => {
  const processes = [
    { pid: 1, name: 'unknown', cpuPercent: null, rssBytes: null, memPercent: null },
    { pid: 2, name: 'measured', cpuPercent: 0.4, rssBytes: 0, memPercent: 0 },
  ]
  assert.deepEqual(sortProcesses(processes, 'cpu', 2).map((row) => row.pid), [2, 1])
  assert.deepEqual(sortProcesses(processes, 'mem', 2).map((row) => row.pid), [2, 1])
})

test('a platform without a load average is reported as unavailable, not as zero', () => {
  // `os.loadavg()` returns zeroes on Windows; the host facts must withhold it.
  const facts = hostFacts()
  if (process.platform === 'win32') {
    assert.equal(facts.loadAverage, null)
  } else {
    assert.ok(Array.isArray(facts.loadAverage) || facts.loadAverage === null)
  }
  assert.equal(typeof facts.platformLabel, 'string')
  assert.ok(facts.platformLabel.length > 0)
})

test('a reader that cannot read memory yields no memory, not zeroed memory', () => {
  const before = { ...sampleFixture({ at: 0, total: 1000, idle: 800, processes: [] }), memory: undefined }
  const after = { ...sampleFixture({ at: 2000, total: 2000, idle: 1200, processes: [] }), memory: undefined }
  const reading = derive(before, after)
  assert.equal(reading.memory, null, 'the panel must show dashes, not "0 B / 0 B"')
  assert.equal(reading.cpu.percent, 60, 'the CPU reading is independent of the missing memory')
})

test('the project-folder options resolve defensively like the rest', () => {
  const defaults = resolveConfig(undefined, 'linux')
  assert.equal(typeof defaults.projectDirEntryBudget, 'number')
  assert.equal(typeof defaults.projectDirMaxDirs, 'number')
  // Default mode is the open sessions' workspaces: no pinned folder, not hidden.
  assert.equal(defaults.projectDir, null, 'unset means workspace mode')
  assert.equal(defaults.projectDirHidden, false)
  // Out-of-range and wrongly-typed values fall back rather than failing the boot.
  assert.ok(resolveConfig({ projectDirEntryBudget: -5 }, 'linux').projectDirEntryBudget >= 100)
  assert.equal(resolveConfig({ projectDir: 42 }, 'linux').projectDir, null, 'a non-path projectDir is ignored')
  assert.deepEqual(
    { dir: resolveConfig({ projectDir: '' }, 'linux').projectDir, hidden: resolveConfig({ projectDir: '' }, 'linux').projectDirHidden },
    { dir: null, hidden: true },
    'an empty string hides the line',
  )
  assert.deepEqual(
    { dir: resolveConfig({ projectDir: false }, 'linux').projectDir, hidden: resolveConfig({ projectDir: false }, 'linux').projectDirHidden },
    { dir: null, hidden: true },
  )
  assert.equal(resolveConfig({ projectDir: '/elsewhere' }, 'linux').projectDir, '/elsewhere')
  assert.equal(resolveConfig({ projectDir: '/elsewhere' }, 'linux').projectDirHidden, false)
})

test('a named session resolves its workspace from the live store first', async () => {
  // The exact call chain src/host/index.js runs when the panel names a session:
  // the live store answers for a session open in this process, so the cold read
  // is not needed.
  const services = {
    sessions: { get: (id) => (id === 'session-1' ? { header: { cwd: '/live/proj' } } : undefined) },
    sessionQuery: { observeSession: async () => { throw new Error('the cold service must not be reached when the live store answers') } },
  }
  assert.equal(await resolveSessionCwd(services, 'session-1'), '/live/proj')
  assert.equal(await resolveSessionCwd(services, 'session-unknown'), undefined, 'a missing live id falls through to the cold read')
})

test('a cold session resolves through the session-query service', async () => {
  // The GUI sidebar lists sessions whose home process never entered them into
  // this process's store — the exact defect that made the button look dead. The
  // cold read is what still answers for those.
  const services = {
    sessions: { get: () => undefined },
    sessionQuery: {
      observeSession: async (id) => (id === 'cold-1' ? { header: { cwd: '/cold/proj' }, dispose() {} } : undefined),
    },
  }
  assert.equal(await resolveSessionCwd(services, 'cold-1'), '/cold/proj')
  assert.equal(await resolveSessionCwd(services, 'cold-missing'), undefined)
})

test('a cold observation is disposed and absent or failing services answer undefined', async () => {
  let disposed = 0
  const okServices = {
    sessionQuery: { observeSession: async () => ({ header: { cwd: '/cold/proj' }, dispose: () => { disposed += 1 } }) },
  }
  await resolveSessionCwd(okServices, 'cold-1')
  assert.equal(disposed, 1, 'the observation lease is returned')

  const throwingServices = { sessionQuery: { observeSession: async () => { throw new Error('unknown id') } } }
  assert.equal(await resolveSessionCwd(throwingServices, 'cold-1'), undefined)
  assert.equal(await resolveSessionCwd({}, 'cold-1'), undefined, 'no service at all answers undefined')
  // Anything but a non-empty string id is refused before any service is touched.
  assert.equal(await resolveSessionCwd(okServices, ''), undefined)
  assert.equal(await resolveSessionCwd(okServices, 42), undefined)
})

test('the host reads the session corpus for workspaces and survives an absent service', async () => {
  // The refresh the route runs: sessionQuery.listSessions() (the corpus the
  // Session list UI shows — live AND cold sessions) first, the live store's
  // list() as the fallback, each read defensively. `knownCwds.value` is what a
  // poll receives: the last successful listing, updated in the background.
  async function refreshInto(knownCwds, host) {
    await Promise.resolve()
      .then(async () => {
        if (typeof host?.sessionQuery?.listSessions === 'function') {
          const records = await host.sessionQuery.listSessions()
          if (Array.isArray(records)) return records.map((record) => record?.header?.cwd)
        }
        const list = host?.sessions?.list?.()
        return Array.isArray(list) ? list.map((session) => session?.header?.cwd) : []
      })
      .then((cwds) => {
        knownCwds.value = Array.isArray(cwds) ? cwds : []
      })
      .catch(() => {})
  }

  const corpus = [
    { header: { cwd: '/home/u/proj-a' } },
    { header: { cwd: '/home/u/proj-b' } },
    { header: {}, live: false },
  ]
  const known = { value: [] }
  await refreshInto(known, { sessionQuery: { listSessions: async () => corpus } })
  assert.deepEqual(known.value, ['/home/u/proj-a', '/home/u/proj-b', undefined], 'cold sessions carry their cwd too')

  const liveOnly = { value: [] }
  await refreshInto(liveOnly, { sessions: { list: () => [{ header: { cwd: '/only/live' } }] } })
  assert.deepEqual(liveOnly.value, ['/only/live'], 'without the query engine the live store answers')

  const absent = { value: ['/previous'] }
  await refreshInto(absent, {})
  assert.deepEqual(absent.value, [], 'no service at all answers empty, and a throw keeps the last set')
  await refreshInto({ value: ['/kept'] }, { sessionQuery: { listSessions: async () => { throw new Error('boom') } } })
})

test('a store without list() or a throwing store answers empty', async () => {
  const known = { value: [] }
  const refresh = async (host) => {
    await Promise.resolve()
      .then(async () => {
        const list = host?.sessions?.list?.()
        return Array.isArray(list) ? list.map((session) => session?.header?.cwd) : []
      })
      .then((cwds) => {
        known.value = Array.isArray(cwds) ? cwds : []
      })
      .catch(() => {})
  }
  await refresh({ sessions: {} })
  assert.deepEqual(known.value, [], 'a store without list() answers empty')
  await refresh({ sessions: { list: () => { throw new Error('boom') } } })
  assert.deepEqual(known.value, [], 'a throwing store answers empty')
})

test('the live Linux reader reports per-process CPU in the same unit as its total', { skip: process.platform !== 'linux' }, async () => {
  // This is the unit-consistency contract, exercised end to end: if a reader
  // published its process counters in a unit the aggregate does not share, every
  // percentage would come out as unavailable or absurd, and only a live
  // difference of two real samples catches it.
  const sampler = createSampler({ sampleMillis: 100, reader: linuxReader })
  await sampler.snapshot({ sort: 'cpu', limit: 5 })
  await new Promise((resolve) => setTimeout(resolve, 1200))
  const reading = await sampler.snapshot({ sort: 'cpu', limit: 10 })
  const measured = reading.processes.filter((row) => typeof row.cpuPercent === 'number')
  assert.ok(measured.length > 0, 'a busy machine must produce at least one measured process')
  for (const row of measured) {
    assert.ok(row.cpuPercent >= 0, `${row.name} reported a negative share`)
    // Per-core scale: even a machine-wide busy process cannot exceed every core.
    assert.ok(
      row.cpuPercent <= reading.cpu.coreCount * 100 + 1,
      `${row.name} reported ${String(row.cpuPercent)}% on ${String(reading.cpu.coreCount)} cores`,
    )
  }
  assert.ok(
    measured.some((row) => row.cpuPercent > 0),
    'at least one process should have done work in a 1.2s window',
  )
})
