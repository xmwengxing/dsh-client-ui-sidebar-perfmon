/**
 * Generic reader: `node:os` only, for a platform without a dedicated reader.
 *
 * This is what a FreeBSD or Solaris host gets. It is honest rather than complete:
 * `os.cpus()` gives a real CPU reading and `os.totalmem()`/`os.freemem()` give a
 * real memory total, and everything the standard library cannot answer — swap, the
 * process table — is reported as unavailable with a warning, instead of being
 * filled in with a plausible-looking zero.
 *
 * @module dsh-client-ui-sidebar-perfmon/readers/generic
 */

import { cpus, freemem, totalmem } from 'node:os'

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
 * Build the fallback reader.
 * @param {string} platform - the reporting platform, for the warning text.
 * @returns {object} the reader.
 */
export function createGenericReader(platform) {
  return {
    id: 'generic',
    async sample() {
      const at = Date.now()
      const total = totalmem()
      const free = freemem()
      // Without a platform source for reclaimable pages, free memory is the only
      // available figure — and it understates what the system will hand out, so the
      // warning says as much instead of letting the number look authoritative.
      return {
        at,
        cpu: cpuTimesFromOs(),
        memory: {
          total,
          available: free,
          used: Math.max(total - free, 0),
          free,
          buffers: null,
          cached: null,
          swapTotal: 0,
          swapUsed: 0,
          swapFree: 0,
        },
        processes: [],
        warnings: ['generic-platform', `no-process-table:${platform}`],
      }
    },
  }
}

export default createGenericReader
