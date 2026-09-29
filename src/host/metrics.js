/**
 * The platform-agnostic half of the host: differencing, ordering and sampling.
 *
 * A reader produces a *raw* sample — cumulative counters, in whatever unit suits
 * its platform — and everything here works on differences of those counters. That
 * is what lets one derivation serve `/proc` jiffies, `os.cpus()` milliseconds and
 * PowerShell CPU seconds: the machine share is `busyΔ / totalΔ`, and a process's
 * per-core share is `procΔ / totalΔ × coreCount`, so the unit cancels out and no
 * `USER_HZ` is ever assumed.
 *
 * The one rule a reader must obey is internal consistency: a process's `cpuTime`
 * has to be in the same unit as its own `cpu.aggregate.total`. Linux reports both
 * in jiffies; macOS and Windows both in milliseconds. Nothing here converts.
 *
 * A field a platform cannot answer is `null`, never zero, and travels to the panel
 * as `—`. `UNAVAILABLE` is that sentinel.
 *
 * @module dsh-client-ui-sidebar-perfmon/metrics
 */

import { arch, cpus, hostname, loadavg, platform, release, uptime } from 'node:os'
import { platformLabel, selectReader } from './readers/index.js'

/** Distinct sentinel for "this reading has no meaning here". */
export const UNAVAILABLE = null

/**
 * Describe the host itself, for the panel header.
 * @returns {object} static host facts.
 */
export function hostFacts() {
  const list = cpus()
  const load = loadavg()
  // Windows reports a load average of zeroes because it has no such concept;
  // publishing `[0, 0, 0]` would read as an idle machine, so it is withheld.
  const hasLoad = platform() !== 'win32' && load.some((value) => value > 0)
  return {
    hostname: hostname(),
    platform: platform(),
    platformLabel: platformLabel(platform()),
    arch: arch(),
    release: release(),
    coreCount: list.length,
    model: list[0]?.model ?? '',
    uptimeSeconds: uptime(),
    loadAverage: hasLoad ? load : UNAVAILABLE,
  }
}

/** Clamp a ratio into 0–100 and drop the noise below a tenth of a percent. */
function percent(part, whole) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0
  const value = (part / whole) * 100
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 100)
}

/** Read a numeric field that a platform may not provide. */
function optional(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : UNAVAILABLE
}

/**
 * Derive one reading from the previous raw sample and the current one.
 * @param {object} previous - earlier raw sample.
 * @param {object} current - later raw sample.
 * @returns {object} the differenced reading.
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

  // A reader that could not read memory at all reports no memory, and the panel
  // shows dashes. Filling the shape with zeroes would draw "0 B / 0 B" — a
  // measurement the host never made.
  const reported = current.memory
  const memoryTotal = reported?.total ?? 0
  const swapTotal = reported?.swapTotal ?? 0
  const memory =
    reported === undefined || reported === null
      ? UNAVAILABLE
      : {
          total: memoryTotal,
          used: reported.used ?? 0,
          available: reported.available ?? 0,
          free: reported.free ?? 0,
          cached: optional(reported.cached),
          buffers: optional(reported.buffers),
          percent: percent(reported.used ?? 0, memoryTotal),
          swapTotal,
          swapUsed: reported.swapUsed ?? 0,
          swapFree: reported.swapFree ?? 0,
          swapPercent: swapTotal > 0 ? percent(reported.swapUsed ?? 0, swapTotal) : 0,
        }

  const before = previous.processesById ?? new Map(previous.processes.map((row) => [row.pid, row]))
  const processes = current.processes.map((process) => {
    const earlier = before.get(process.pid)
    // A process with no earlier row just started, and a platform that omits its
    // CPU time cannot answer at all: both are unavailable rather than 0%.
    const cpuTime = process.cpuTime
    let cpuPercent = UNAVAILABLE
    if (
      usable &&
      earlier !== undefined &&
      typeof cpuTime === 'number' &&
      typeof earlier.cpuTime === 'number'
    ) {
      const delta = cpuTime - earlier.cpuTime
      if (delta >= 0) cpuPercent = (delta / totalDelta) * coreCount * 100
    }
    const rss = optional(process.rssBytes)
    return {
      pid: process.pid,
      name: process.name,
      state: process.state ?? UNAVAILABLE,
      threads: optional(process.threads),
      rssBytes: rss,
      // A share of an unknown total cannot be computed: a process with a working
      // set on a host whose memory is unreadable still has no percentage.
      memPercent: rss === UNAVAILABLE || memoryTotal <= 0 ? UNAVAILABLE : percent(rss, memoryTotal),
      cpuPercent,
    }
  })

  return {
    facts: {
      hostname: facts.hostname,
      platform: facts.platform,
      platformLabel: facts.platformLabel,
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

/**
 * Sort keys the process table accepts.
 *
 * An unavailable figure sorts last in both directions: it is not a small number,
 * it is an absent one, and ranking it beside real readings would misrepresent it.
 */
const rank = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY)
const SORTERS = {
  cpu: (a, b) => rank(b.cpuPercent) - rank(a.cpuPercent) || rank(b.rssBytes) - rank(a.rssBytes),
  mem: (a, b) => rank(b.rssBytes) - rank(a.rssBytes) || rank(b.cpuPercent) - rank(a.cpuPercent),
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
 * @param {{sampleMillis?: number, cacheMillis?: number, reader?: object}} [options] - sampler timing and reader.
 * @returns {{snapshot: (request: {sort?: string, limit?: number}) => Promise<object>, pending: () => Promise<void>}} the sampler.
 */
export function createSampler(options = {}) {
  const sampleMillis = options.sampleMillis ?? 0
  const cacheMillis = options.cacheMillis ?? 800
  const reader = options.reader ?? selectReader(platform())

  /** @type {object | undefined} */
  let prior
  /** @type {{at: number, reading: object, warnings: string[]} | undefined} */
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
    const current = withIndex(await reader.sample())
    if (prior === undefined) {
      // Prime: one short second sample so the first reading is a real delta
      // rather than a zero the panel would show for a whole refresh interval.
      await new Promise((resolve) => setTimeout(resolve, sampleMillis > 0 ? sampleMillis : 150))
      const primed = withIndex(await reader.sample())
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
      inflight ??= readPair().then((pair) => ({
        at: Date.now(),
        reading: derive(pair.before, pair.current),
        warnings: pair.current.warnings ?? [],
      }))
      try {
        cached = await inflight
      } finally {
        inflight = undefined
      }
    }
    const limit = Math.min(Math.max(Math.trunc(request.limit ?? 60) || 60, 1), 500)
    const requested = typeof request.sort === 'string' ? request.sort : 'cpu'
    const sort = requested in SORTERS ? requested : 'cpu'
    return {
      ...cached.reading,
      sort,
      warnings: cached.warnings,
      reader: reader.id,
      processCount: cached.reading.processes.length,
      processes: sortProcesses(cached.reading.processes, sort, limit),
    }
  }

  return {
    snapshot,
    pending: async () => {
      await inflight
    },
  }
}

export { platformLabel, selectReader }
