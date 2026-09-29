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
import { collect, derive, hostFacts, sortProcesses, createSampler } from '../src/host/metrics.js'

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
  return { pid, name, state: 'S', threads: 1, utime, stime, rssBytes }
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

test('the live collector reads this kernel and the sampler serves it', { skip: process.platform !== 'linux' }, async () => {
  const sample = await collect()
  assert.ok(sample.cpu.aggregate.total > 0, '/proc/stat must report jiffies')
  assert.ok(sample.cpu.cores.length > 0, '/proc/stat must report at least one core')
  assert.ok(sample.memory.total > 0, '/proc/meminfo must report a total')
  assert.ok(sample.processes.length > 0, '/proc must list processes')
  const first = sample.processes[0]
  assert.equal(typeof first.name, 'string')
  assert.ok(first.name.length > 0)
  assert.ok(first.rssBytes >= 0)

  const sampler = createSampler({ sampleMillis: 50 })
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

test('the host facts describe this machine', { skip: process.platform !== 'linux' }, () => {
  const facts = hostFacts()
  assert.equal(facts.platform, 'linux')
  assert.ok(facts.coreCount > 0)
  assert.ok(facts.uptimeSeconds > 0)
  assert.equal(facts.loadAverage.length, 3)
})
