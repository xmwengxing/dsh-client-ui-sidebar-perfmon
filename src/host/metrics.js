/**
 * Linux `/proc` metrics collector for the perfmon host half.
 *
 * Everything here is dependency-free: the numbers come from `/proc/stat`,
 * `/proc/meminfo` and one `/proc/<pid>/stat` per process, and the percentages are
 * derived from the difference between two consecutive samples. That delta model
 * is what makes the readings independent of the kernel's `USER_HZ`: the machine
 * share is `busyDelta / totalDelta`, and a process's per-core share is
 * `procDelta / totalDelta * coreCount`, so no jiffy constant is ever assumed.
 *
 * Platform scope: Linux only. The caller detects other platforms and reports a
 * structured failure instead of inventing numbers.
 *
 * @module dsh-client-ui-sidebar-perfmon/metrics
 */

import { readFile, readdir } from 'node:fs/promises'
import { arch, cpus, hostname, loadavg, platform, release, uptime } from 'node:os'

/** Kernel page size on every architecture this plugin supports. */
const PAGE_SIZE = 4096
/** Bounded read concurrency: `/proc` reads are cheap, but 1000 parallel opens are not. */
const READ_CONCURRENCY = 32

/** Distinct sentinel for "this reading has no meaning yet" (first sample). */
export const UNAVAILABLE = null

/**
 * Map over items with a bounded number of in-flight promises.
 * @template T, R
 * @param {readonly T[]} items - input items.
 * @param {number} limit - maximum concurrent workers.
 * @param {(item: T) => Promise<R>} worker - per-item async work.
 * @returns {Promise<R[]>} results in input order.
 */
async function mapPool(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const runners = new Array(Math.min(limit, items.length)).fill(undefined).map(async () => {
    for (;;) {
      const index = next
      next += 1
      if (index >= items.length) return
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(runners)
  return results
}

/**
 * Read the kernel's per-CPU jiffy counters.
 * @returns {Promise<{aggregate: {total: number, idle: number}, cores: {id: number, total: number, idle: number}[]}>} jiffy totals.
 */
async function readCpuTimes() {
  const text = await readFile('/proc/stat', 'utf8')
  let aggregate = { total: 0, idle: 0 }
  const cores = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('cpu')) continue
    const parts = line.trim().split(/\s+/)
    const label = parts[0]
    // user nice system idle iowait irq softirq steal — guest/guest_nice are
    // already folded into user/nice by the kernel, so they are excluded.
    const values = parts.slice(1, 9).map(Number)
    if (values.length < 4 || values.some((value) => !Number.isFinite(value))) continue
    let total = 0
    for (const value of values) total += value
    const idle = values[3] + values[4]
    if (label === 'cpu') aggregate = { total, idle }
    else cores.push({ id: Number(label.slice(3)), total, idle })
  }
  return { aggregate, cores }
}

/**
 * Read memory and swap totals from `/proc/meminfo`.
 * @returns {Promise<object>} byte-denominated memory facts.
 */
async function readMemory() {
  const text = await readFile('/proc/meminfo', 'utf8')
  /** @type {Record<string, number>} */
  const kilobytes = {}
  for (const line of text.split('\n')) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon)
    const value = Number(line.slice(colon + 1).trim().split(/\s+/)[0])
    if (!Number.isFinite(value)) continue
    // HugePages_* counts pages; every other field is in kB.
    kilobytes[key] = key.startsWith('HugePages') ? value : value * 1024
  }
  const total = kilobytes.MemTotal ?? 0
  const available = kilobytes.MemAvailable ?? kilobytes.MemFree ?? 0
  const cached = (kilobytes.Cached ?? 0) + (kilobytes.SReclaimable ?? 0) - (kilobytes.Shmem ?? 0)
  const swapTotal = kilobytes.SwapTotal ?? 0
  const swapFree = kilobytes.SwapFree ?? 0
  return {
    total,
    available,
    used: Math.max(total - available, 0),
    free: kilobytes.MemFree ?? 0,
    buffers: kilobytes.Buffers ?? 0,
    cached: Math.max(cached, 0),
    swapTotal,
    swapFree,
    swapUsed: Math.max(swapTotal - swapFree, 0),
    swapCached: kilobytes.SwapCached ?? 0,
  }
}

/**
 * Read one process's jiffy counters and resident size from `/proc/<pid>/stat`.
 *
 * The `comm` field is wrapped in parentheses and may itself contain spaces and
 * parentheses, so the field list is split at the LAST `)` rather than by a
 * naive whitespace split.
 * @param {string} pid - decimal process id.
 * @returns {Promise<{pid: number, name: string, state: string, utime: number, stime: number, threads: number, rssBytes: number} | undefined>} the row, or undefined when the process vanished.
 */
async function readProcess(pid) {
  let stat
  try {
    stat = await readFile(`/proc/${pid}/stat`, 'utf8')
  } catch {
    return undefined // exited between readdir and read
  }
  const open = stat.indexOf('(')
  const close = stat.lastIndexOf(')')
  if (open < 0 || close < 0) return undefined
  const name = stat.slice(open + 1, close)
  // After the comm field, rest[0] is field 3 (state), so rest[i] is field i + 3.
  const rest = stat.slice(close + 2).split(' ')
  const num = (index) => {
    const value = Number(rest[index])
    return Number.isFinite(value) ? value : 0
  }
  return {
    pid: Number(pid),
    name,
    state: rest[0] ?? '?',
    utime: num(11), // field 14
    stime: num(12), // field 15
    threads: num(17), // field 20
    rssBytes: num(21) * PAGE_SIZE, // field 24, in pages
  }
}

/**
 * Read every readable process row in `/proc`.
 * @returns {Promise<{pid: number, name: string, state: string, utime: number, stime: number, threads: number, rssBytes: number}[]>} process rows.
 */
async function readProcesses() {
  const entries = await readdir('/proc', { withFileTypes: true })
  const pids = []
  for (const entry of entries) {
    if (entry.isDirectory() && /^[0-9]+$/.test(entry.name)) pids.push(entry.name)
  }
  const rows = await mapPool(pids, READ_CONCURRENCY, readProcess)
  return rows.filter((row) => row !== undefined)
}

/**
 * Take one raw sample of the machine.
 * @returns {Promise<{at: number, cpu: object, memory: object, processes: object[]}>} an un-differenced sample.
 */
export async function collect() {
  const at = Date.now()
  const [cpu, memory, processes] = await Promise.all([readCpuTimes(), readMemory(), readProcesses()])
  return { at, cpu, memory, processes }
}

/**
 * Describe the host itself, for the panel header.
 * @returns {object} static host facts.
 */
export function hostFacts() {
  const list = cpus()
  return {
    hostname: hostname(),
    platform: platform(),
    arch: arch(),
    release: release(),
    coreCount: list.length,
    model: list[0]?.model ?? '',
    uptimeSeconds: uptime(),
    loadAverage: loadavg(),
  }
}

/** Clamp a ratio into 0–100 and drop the noise below a tenth of a percent. */
function percent(part, whole) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0
  const value = (part / whole) * 100
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 100)
}

/**
 * Derive one snapshot from the previous raw sample and the current one.
 * @param {object} previous - earlier raw sample.
 * @param {object} current - later raw sample.
 * @returns {{facts: object, cpu: object, memory: object, processes: object[]}} the differenced reading.
 */
export function derive(previous, current) {
  const facts = hostFacts()
  const coreCount = current.cpu.cores.length || facts.coreCount || 1
  const totalDelta = current.cpu.aggregate.total - previous.cpu.aggregate.total
  const idleDelta = current.cpu.aggregate.idle - previous.cpu.aggregate.idle
  const usable = totalDelta > 0

  const cpu = {
    percent: usable ? percent(totalDelta - idleDelta, totalDelta) : UNAVAILABLE,
    coreCount,
    cores: current.cpu.cores.map((core, index) => {
      const before = previous.cpu.cores[index]
      if (before === undefined) return { id: core.id, percent: UNAVAILABLE }
      const coreTotal = core.total - before.total
      if (coreTotal <= 0) return { id: core.id, percent: UNAVAILABLE }
      return { id: core.id, percent: percent(coreTotal - (core.idle - before.idle), coreTotal) }
    }),
    loadAverage: facts.loadAverage,
  }

  const memory = {
    total: current.memory.total,
    used: current.memory.used,
    available: current.memory.available,
    free: current.memory.free,
    cached: current.memory.cached,
    buffers: current.memory.buffers,
    percent: percent(current.memory.used, current.memory.total),
    swapTotal: current.memory.swapTotal,
    swapUsed: current.memory.swapUsed,
    swapFree: current.memory.swapFree,
    swapPercent: current.memory.swapTotal > 0 ? percent(current.memory.swapUsed, current.memory.swapTotal) : 0,
  }

  const before = previous.processesById ?? new Map(previous.processes.map((process) => [process.pid, process]))
  const processes = current.processes.map((process) => {
    const earlier = before.get(process.pid)
    // A process with no earlier row just started; its whole lifetime is newer
    // than the window, so it is reported as unavailable rather than as 0%.
    let cpuPercent = UNAVAILABLE
    if (usable && earlier !== undefined) {
      const delta = process.utime - earlier.utime + (process.stime - earlier.stime)
      if (delta >= 0) cpuPercent = (delta / totalDelta) * coreCount * 100
    }
    return {
      pid: process.pid,
      name: process.name,
      state: process.state,
      threads: process.threads,
      rssBytes: process.rssBytes,
      memPercent: percent(process.rssBytes, current.memory.total),
      cpuPercent,
    }
  })

  return {
    facts: {
      hostname: facts.hostname,
      platform: facts.platform,
      arch: facts.arch,
      release: facts.release,
      coreCount: facts.coreCount,
      model: facts.model,
      uptimeSeconds: facts.uptimeSeconds,
    },
    window: { millis: current.at - previous.at, at: current.at },
    cpu,
    memory,
    processes,
  }
}

/** Sort keys the process table accepts. */
const SORTERS = {
  cpu: (a, b) => (b.cpuPercent ?? -1) - (a.cpuPercent ?? -1) || b.rssBytes - a.rssBytes,
  mem: (a, b) => b.rssBytes - a.rssBytes || (b.cpuPercent ?? -1) - (a.cpuPercent ?? -1),
  name: (a, b) => a.name.localeCompare(b.name) || a.pid - b.pid,
}

/**
 * Order and cut a process list for one request.
 * @param {object[]} processes - every process in the sample.
 * @param {string} sort - `cpu`, `mem` or `name`.
 * @param {number} limit - maximum rows to return.
 * @returns {object[]} the requested page of rows.
 */
export function sortProcesses(processes, sort, limit) {
  const sorter = SORTERS[sort] ?? SORTERS.cpu
  return [...processes].sort(sorter).slice(0, limit)
}

/**
 * Build the sampler the host route serves from.
 *
 * Sampling is request-driven with a short cache: consecutive polls inside
 * `cacheMillis` share one reading, and the very first request is primed by a
 * short double sample so the panel's first paint already carries a real CPU
 * percentage instead of a zero.
 *
 * @param {{sampleMillis?: number, cacheMillis?: number}} [options] - sampler timing.
 * @returns {{snapshot: (request: {sort?: string, limit?: number}) => Promise<object>, pending: () => Promise<void>}} the sampler.
 */
export function createSampler(options = {}) {
  const sampleMillis = options.sampleMillis ?? 0
  const cacheMillis = options.cacheMillis ?? 800

  /** @type {object | undefined} */
  let prior
  /** @type {{at: number, reading: object} | undefined} */
  let cached
  /** @type {Promise<object> | undefined} */
  let inflight

  const withIndex = (sample) => ({
    ...sample,
    processesById: new Map(sample.processes.map((process) => [process.pid, process])),
  })

  /**
   * Produce the pair of samples a reading is differenced from.
   *
   * The pair is returned together on purpose: `prior` advances as a side effect,
   * so a caller that read it again afterwards would difference a sample against
   * itself and report a flat zero.
   * @returns {Promise<{before: object, current: object}>} the two samples.
   */
  async function readPair() {
    const current = withIndex(await collect())
    if (prior === undefined) {
      // Prime: one short second sample so the first reading is a real delta
      // rather than a zero the panel would show for a whole refresh interval.
      await new Promise((resolve) => setTimeout(resolve, sampleMillis > 0 ? sampleMillis : 150))
      const primed = withIndex(await collect())
      prior = current
      return { before: current, current: primed }
    }
    const before = prior
    prior = current
    return { before, current }
  }

  async function snapshot(request = {}) {
    const now = Date.now()
    if (cached === undefined || now - cached.at > cacheMillis) {
      inflight ??= readPair().then((pair) => ({ at: Date.now(), reading: derive(pair.before, pair.current) }))
      try {
        cached = await inflight
      } finally {
        inflight = undefined
      }
    }
    const { reading } = cached
    const limit = Math.min(Math.max(Math.trunc(request.limit ?? 60) || 60, 1), 500)
    const requested = typeof request.sort === 'string' ? request.sort : 'cpu'
    const sort = requested in SORTERS ? requested : 'cpu'
    return {
      ...reading,
      sort,
      processCount: reading.processes.length,
      processes: sortProcesses(reading.processes, sort, limit),
    }
  }

  return {
    snapshot,
    pending: async () => {
      await inflight
    },
  }
}
