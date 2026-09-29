/**
 * Linux reader: `/proc`, and nothing else.
 *
 * This is the original and most precise path. `/proc/stat` carries iowait and
 * steal, which `os.cpus()` does not, and one `/proc/<pid>/stat` per process is
 * cheaper than any subprocess. It stays the only reader that never spawns
 * anything.
 *
 * @module dsh-client-ui-sidebar-perfmon/readers/linux
 */

import { readFile, readdir } from 'node:fs/promises'

/** Kernel page size on the architectures this plugin supports. */
const PAGE_SIZE = 4096
/** Bounded read concurrency: `/proc` reads are cheap, but 1000 parallel opens are not. */
const READ_CONCURRENCY = 32

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
 * Parse the kernel's per-CPU jiffy counters.
 * @param {string} text - the contents of `/proc/stat`.
 * @returns {{aggregate: {total: number, idle: number}, cores: {id: number, total: number, idle: number}[]}} jiffy totals.
 */
export function parseCpuTimes(text) {
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
 * Parse memory and swap totals from `/proc/meminfo`.
 * @param {string} text - the contents of `/proc/meminfo`.
 * @returns {object} byte-denominated memory facts.
 */
export function parseMeminfo(text) {
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
  }
}

/**
 * Parse one process's counters from `/proc/<pid>/stat`.
 *
 * The `comm` field is wrapped in parentheses and may itself contain spaces and
 * parentheses, so the field list is split at the LAST `)` rather than by a
 * naive whitespace split.
 * @param {string} stat - the contents of the file.
 * @param {number} pid - the process id the file belongs to.
 * @returns {{pid: number, name: string, state: string, cpuTime: number, threads: number, rssBytes: number} | undefined} the row, or undefined when unparseable.
 */
export function parseProcessStat(stat, pid) {
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
    pid,
    name,
    state: rest[0] ?? '?',
    // Cumulative CPU time in the reader's own unit. Here that unit is jiffies,
    // the same one `/proc/stat` reports, which is all the derivation needs: it
    // only ever differences this value against the aggregate's own delta.
    cpuTime: num(11) + num(12), // fields 14 (utime) + 15 (stime)
    threads: num(17), // field 20
    rssBytes: num(21) * PAGE_SIZE, // field 24, in pages
  }
}

/**
 * Read one process's counters.
 * @param {string} pid - decimal process id.
 * @returns {Promise<object | undefined>} the row, or undefined when it vanished.
 */
async function readProcess(pid) {
  let stat
  try {
    stat = await readFile(`/proc/${pid}/stat`, 'utf8')
  } catch {
    return undefined // exited between readdir and read
  }
  return parseProcessStat(stat, Number(pid))
}

/**
 * Read every readable process row in `/proc`.
 * @returns {Promise<object[]>} process rows.
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

/** The Linux reader. */
export const linuxReader = {
  id: 'linux',
  /** Per-process counters here are jiffies, and so is the aggregate. */
  async sample() {
    const at = Date.now()
    const [stat, meminfo, processes] = await Promise.all([
      readFile('/proc/stat', 'utf8'),
      readFile('/proc/meminfo', 'utf8'),
      readProcesses(),
    ])
    return {
      at,
      cpu: parseCpuTimes(stat),
      memory: parseMeminfo(meminfo),
      processes,
      warnings: [],
    }
  },
}

export default linuxReader
