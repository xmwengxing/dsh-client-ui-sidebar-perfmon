/**
 * macOS reader: `os.cpus()` for the CPU, `ps` / `vm_stat` / `sysctl` for the rest.
 *
 * Three deliberate choices:
 *
 * - **CPU times come from `os.cpus()`**, in milliseconds, for both the machine and
 *   the cores. The process list then has to be converted into the same unit, or the
 *   per-process share would be a ratio of unlike things — `ps -o time` gives
 *   accumulated CPU time, which `parseCpuTime` converts to milliseconds so both
 *   sides of the division are the same unit.
 * - **`ps` is asked for the minimum keyword set** (`pid`, `state`, `time`, `rss`,
 *   `comm`). BSD `ps` fails the whole invocation on one unknown keyword, so a field
 *   a platform may not have (a thread count, say) is left out and reported as
 *   unavailable rather than risking the entire table.
 * - **Memory follows macOS's own vocabulary.** `MemAvailable` does not exist here;
 *   reclaimable pages (`free + inactive + speculative + purgeable`) are what the
 *   system will hand out, so that sum is the available figure and the file-backed
 *   pages are the cache line.
 *
 * @module dsh-client-ui-sidebar-perfmon/readers/darwin
 */

import { cpus, totalmem } from 'node:os'
import { runCommand } from './exec.js'

/** Fallback page size when `vm_stat`'s header is unreadable; Apple silicon uses 16384. */
const DEFAULT_PAGE_SIZE = 4096

/**
 * Fold `os.cpus()` into the aggregate/cores shape every reader produces.
 * @returns {{aggregate: {total: number, idle: number}, cores: {id: number, total: number, idle: number}[]}} millisecond totals.
 */
export function cpuTimesFromOs() {
  const list = cpus()
  let total = 0
  let idle = 0
  const cores = list.map((core, index) => {
    const sum = core.times.user + core.times.nice + core.times.sys + core.times.idle + core.times.irq
    total += sum
    idle += core.times.idle
    return { id: index, total: sum, idle: core.times.idle }
  })
  return { aggregate: { total, idle }, cores }
}

/**
 * Parse a `ps -o time` value into milliseconds.
 *
 * BSD `ps` prints `MM:SS.ss` for short-lived processes and `HH:MM:SS` or
 * `D-HH:MM:SS` for longer ones, so all three shapes are accepted.
 * @param {string} value - the formatted CPU time.
 * @returns {number | undefined} milliseconds, or undefined when unparseable.
 */
export function parseCpuTime(value) {
  const text = value.trim()
  if (text === '' || text === '-') return undefined
  const days = /^(\d+)-/.exec(text)
  const body = days === null ? text : text.slice(days[0].length)
  const parts = body.split(':')
  if (parts.length < 2 || parts.length > 3) return undefined
  const seconds = Number(parts.pop())
  const minutes = Number(parts.pop())
  const hours = parts.length > 0 ? Number(parts.pop()) : 0
  if (![seconds, minutes, hours].every((part) => Number.isFinite(part))) return undefined
  const total = (((days === null ? 0 : Number(days[1])) * 24 + hours) * 60 + minutes) * 60 + seconds
  return Math.round(total * 1000)
}

/**
 * Parse the process table.
 *
 * `comm` is last on the keyword list, so everything after the fourth field is the
 * executable path — that is what keeps a path containing spaces intact.
 * @param {string} text - the output of `ps -Ao pid=,state=,time=,rss=,comm=`.
 * @returns {object[]} process rows in the shared shape.
 */
export function parsePs(text) {
  const rows = []
  for (const line of text.split('\n')) {
    const match = /^\s*(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(.+?)\s*$/.exec(line)
    if (match === null) continue
    const [, pid, state, time, rss, comm] = match
    const name = comm.slice(comm.lastIndexOf('/') + 1)
    if (name === '') continue
    rows.push({
      pid: Number(pid),
      name,
      state,
      threads: null, // BSD ps has no portable thread-count keyword
      cpuTime: parseCpuTime(time),
      rssBytes: Number(rss) * 1024, // ps reports resident set in KiB
    })
  }
  return rows
}

/**
 * Parse `vm_stat` into byte-denominated page classes.
 * @param {string} text - the output of `vm_stat`.
 * @returns {{pageSize: number, pages: Record<string, number>}} the parsed classes.
 */
export function parseVmStat(text) {
  const header = /page size of (\d+) bytes/.exec(text)
  const pageSize = header === null ? DEFAULT_PAGE_SIZE : Number(header[1])
  /** @type {Record<string, number>} */
  const pages = {}
  for (const line of text.split('\n')) {
    const match = /^"?([A-Za-z][A-Za-z -]*?)"?:\s+(\d+)\.?\s*$/.exec(line.trim())
    if (match === null) continue
    pages[match[1].trim()] = Number(match[2])
  }
  return { pageSize, pages }
}

/**
 * Turn the parsed `vm_stat` classes into the shared memory shape.
 * @param {{pageSize: number, pages: Record<string, number>}} vm - the parsed counters.
 * @param {number} total - physical memory in bytes.
 * @returns {object} the memory reading.
 */
export function memoryFromVmStat(vm, total) {
  const bytes = (name) => (vm.pages[name] ?? 0) * vm.pageSize
  const free = bytes('Pages free')
  // What the system will actually hand out: free plus everything reclaimable.
  const reclaimable =
    bytes('Pages inactive') + bytes('Pages speculative') + bytes('Pages purgeable')
  const available = Math.min(free + reclaimable, total)
  return {
    total,
    available,
    used: Math.max(total - available, 0),
    free,
    buffers: null, // no separate buffer cache on macOS
    cached: bytes('File-backed pages'),
    swapTotal: 0,
    swapUsed: 0,
    swapFree: 0,
  }
}

/**
 * Parse `sysctl -n vm.swapusage`.
 *
 * The value reads `total = 8192.00M  used = 1234.56M  free = 6957.44M`, sometimes
 * followed by `(encrypted)`.
 * @param {string} text - the command's output.
 * @returns {{total: number, used: number, free: number} | undefined} bytes, or undefined when unparseable.
 */
export function parseSwapusage(text) {
  const field = (name) => {
    const match = new RegExp(`${name}\\s*=\\s*([\\d.]+)([KMGTP])?`, 'i').exec(text)
    if (match === null) return undefined
    const scale = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4, P: 1024 ** 5 }
    const bytes = Number(match[1]) * (match[2] === undefined ? 1 : scale[match[2].toUpperCase()])
    // The tool reports fractions of a mebibyte, so the byte figure is rounded:
    // a byte count is an integer, and the sub-byte remainder is noise.
    return Number.isFinite(bytes) ? Math.round(bytes) : undefined
  }
  const total = field('total')
  const used = field('used')
  const free = field('free')
  if (total === undefined || used === undefined || free === undefined) return undefined
  return { total, used, free }
}

/**
 * Read swap usage, degrading to "unavailable" rather than failing the sample.
 * @param {(command: string, args: string[], options?: object) => Promise<string>} run - runner.
 * @returns {Promise<{total: number, used: number, free: number} | undefined>} bytes, or undefined.
 */
async function readSwap(run) {
  try {
    return parseSwapusage(await run('sysctl', ['-n', 'vm.swapusage']))
  } catch {
    return undefined
  }
}

/**
 * Build the macOS reader around one command runner.
 * @param {{run?: (command: string, args: string[], options?: object) => Promise<string>}} [options] - injection seam.
 * @returns {object} the reader.
 */
export function createDarwinReader(options = {}) {
  const run = options.run ?? runCommand
  return {
    id: 'darwin',
    async sample() {
      const at = Date.now()
      const warnings = []
      const cpu = cpuTimesFromOs()

      const memory = {
        total: 0,
        available: 0,
        used: 0,
        free: 0,
        buffers: null,
        cached: null,
        swapTotal: 0,
        swapUsed: 0,
        swapFree: 0,
      }

      try {
        const [vmText, swap] = await Promise.all([
          run('vm_stat', []),
          readSwap(run),
        ])
        const vm = parseVmStat(vmText)
        Object.assign(memory, memoryFromVmStat(vm, totalmem()))
        if (swap !== undefined) {
          memory.swapTotal = swap.total
          memory.swapUsed = swap.used
          memory.swapFree = swap.free
        } else {
          warnings.push('swap-unavailable')
        }
      } catch (error) {
        warnings.push(`memory-unavailable: ${String(error?.message ?? error)}`)
      }

      let processes = []
      try {
        processes = parsePs(await run('ps', ['-Ao', 'pid=,state=,time=,rss=,comm=']))
      } catch (error) {
        warnings.push(`processes-unavailable: ${String(error?.message ?? error)}`)
      }

      return { at, cpu, memory, processes, warnings }
    },
  }
}

/** The reader for a machine whose `os.platform()` is `darwin`. */
export const darwinReader = createDarwinReader()

export default darwinReader
