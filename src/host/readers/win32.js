/**
 * Windows reader: `os.cpus()` for the CPU, one PowerShell call for the rest.
 *
 * Windows has no in-process source for memory or a process table, so this reader
 * shells out. Two things keep that affordable:
 *
 * - **One invocation per sample.** The script returns memory, paging file and the
 *   whole process list as a single JSON document; spawning PowerShell three times
 *   would triple the cost of every refresh for no extra information.
 * - **`Get-Process`, not a WMI perf counter.** The formatted
 *   `PercentProcessorTime` class is sampled by the provider on its own schedule, so
 *   consecutive reads can repeat a value; `Get-Process` hands back *accumulated*
 *   CPU seconds, which the plugin differences exactly the way it differences
 *   jiffies on Linux. `cpuTime` is that accumulation, in milliseconds, matching the CPU totals from
 * `os.cpus()`.
 *
 * Windows reports no process state and no load average, so both are reported as
 * unavailable rather than guessed at.
 *
 * @module dsh-client-ui-sidebar-perfmon/readers/win32
 */

import { cpus, totalmem } from 'node:os'
import { firstAvailable, runCommand } from './exec.js'

/** PowerShell executables to try, newest name first. */
const POWERSHELL_CANDIDATES = ['pwsh', 'powershell']

/**
 * The one script a sample runs.
 *
 * Kept flat on purpose: `ConvertTo-Json` needs an explicit `-Depth` for nested
 * objects, and a flat shape keeps the output small and the parser trivial.
 */
export const SAMPLE_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  '$os = Get-CimInstance Win32_OperatingSystem',
  '$mem = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory',
  '$procs = Get-Process | Select-Object Id, ProcessName, CPU, WorkingSet64, @{ Name = "Threads"; Expression = { $_.Threads.Count } }',
  '[pscustomobject]@{',
  '  totalKb = $os.TotalVisibleMemorySize',
  '  freeKb = $os.FreePhysicalMemory',
  '  pageFileTotalKb = $os.SizeStoredInPagingFiles',
  '  pageFileFreeKb = $os.FreeSpaceInPagingFiles',
  '  cacheBytes = $mem.CacheBytes',
  '  availableBytes = $mem.AvailableBytes',
  '  processes = @($procs)',
  '} | ConvertTo-Json -Compress -Depth 3',
].join('\n')

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
 * Parse the sample script's JSON.
 *
 * Every field is treated as optional: a Windows build that omits a counter, or a
 * process the caller may not inspect, must leave that value unavailable instead of
 * failing the whole reading.
 * @param {string} text - the command's standard output.
 * @param {number} [total] - physical memory in bytes, used as a floor for the total.
 * @returns {{memory: object, processes: object[], warnings: string[]}} the parsed pieces.
 */
export function parseWindowsSample(text, total = totalmem()) {
  const warnings = []
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    return { memory: undefined, processes: [], warnings: ['windows-json-unreadable'] }
  }
  if (payload === null || typeof payload !== 'object') {
    return { memory: undefined, processes: [], warnings: ['windows-json-unreadable'] }
  }

  const kb = (value) => (Number.isFinite(Number(value)) ? Number(value) * 1024 : undefined)
  const reportedTotal = kb(payload.totalKb)
  const free = kb(payload.freeKb) ?? 0
  // `AvailableBytes` is the same figure Windows' own Task Manager shows; the
  // physical-free counter is the fallback when the perf class is missing.
  const available = Number.isFinite(Number(payload.availableBytes))
    ? Number(payload.availableBytes)
    : free
  const memoryTotal = reportedTotal !== undefined && reportedTotal > 0 ? reportedTotal : total
  const pageFileTotal = kb(payload.pageFileTotalKb) ?? 0
  const pageFileFree = kb(payload.pageFileFreeKb) ?? 0
  const cached = Number.isFinite(Number(payload.cacheBytes)) ? Number(payload.cacheBytes) : null

  const memory = {
    total: memoryTotal,
    available: Math.min(available, memoryTotal),
    used: Math.max(memoryTotal - Math.min(available, memoryTotal), 0),
    free,
    buffers: null, // Windows has no separate buffer cache figure
    cached,
    swapTotal: pageFileTotal,
    swapUsed: Math.max(pageFileTotal - pageFileFree, 0),
    swapFree: pageFileFree,
  }
  if (pageFileTotal === 0) warnings.push('swap-unavailable')

  const list = Array.isArray(payload.processes)
    ? payload.processes
    : payload.processes === undefined || payload.processes === null
      ? []
      : [payload.processes]
  const processes = []
  for (const entry of list) {
    // `Number(null)` is 0, and pid 0 is the Windows idle process, not a row a
    // process list should carry — so the id is required to be a positive integer.
    const pid = typeof entry?.Id === 'number' ? entry.Id : Number(entry?.Id)
    const name = typeof entry?.ProcessName === 'string' ? entry.ProcessName : undefined
    if (!Number.isInteger(pid) || pid <= 0 || name === undefined || name === '') continue
    // `Number(null)` is 0, so every optional counter is required to be a real
    // number: an unreadable CPU time must stay unknown, because a zero would be
    // differenced into a confident and wrong 0%.
    const numeric = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
    const cpuSeconds = numeric(entry?.CPU)
    const workingSet = numeric(entry?.WorkingSet64)
    processes.push({
      pid,
      name,
      state: null, // Windows exposes no single-letter state
      threads: numeric(entry?.Threads),
      // Get-Process omits CPU for a process the caller cannot open.
      cpuTime: cpuSeconds === null ? null : Math.round(cpuSeconds * 1000),
      rssBytes: workingSet,
    })
  }
  if (processes.length === 0) warnings.push('processes-unavailable')
  return { memory, processes, warnings }
}

/**
 * Build the Windows reader around one command runner.
 * @param {{run?: (command: string, args: string[], options?: object) => Promise<string>,
 *          available?: (candidates: string[], run?: object) => Promise<string | undefined>}} [options] - injection seam.
 * @returns {object} the reader.
 */
export function createWin32Reader(options = {}) {
  const run = options.run ?? runCommand
  const find = options.available ?? firstAvailable
  /** @type {string | undefined} */
  let shell

  return {
    id: 'win32',
    async sample() {
      const at = Date.now()
      const cpu = cpuTimesFromOs()
      const warnings = []

      shell ??= await find(POWERSHELL_CANDIDATES, run)
      if (shell === undefined) {
        return {
          at,
          cpu,
          memory: undefined,
          processes: [],
          warnings: ['powershell-missing'],
        }
      }

      let text
      try {
        // A cold first invocation can take a second; later ones are much faster.
        text = await run(shell, ['-NoProfile', '-NonInteractive', '-Command', SAMPLE_SCRIPT], {
          timeoutMs: 15000,
        })
      } catch (error) {
        return {
          at,
          cpu,
          memory: undefined,
          processes: [],
          warnings: [`powershell-failed: ${String(error?.message ?? error)}`],
        }
      }

      const parsed = parseWindowsSample(text)
      return { at, cpu, memory: parsed.memory, processes: parsed.processes, warnings: [...warnings, ...parsed.warnings] }
    },
  }
}

/** The reader for a machine whose `os.platform()` is `win32`. */
export const win32Reader = createWin32Reader()

export default win32Reader
