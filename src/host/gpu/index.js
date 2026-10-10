/**
 * GPU frequency and VRAM usage, for watching a local model load.
 *
 * The two figures come from different places, and that asymmetry is the whole
 * design. **VRAM is available everywhere; frequency is not.**
 *
 * - **VRAM** has a vendor-neutral source on Windows: the OS's own
 *   `GPUPerformanceCounters` WMI classes report dedicated usage for NVIDIA, AMD
 *   and Intel alike, with no third-party software installed, and the adapter's
 *   true 64-bit total comes from the display class registry key. That is the
 *   default path, because a monitoring plugin must not require the user to
 *   install something first.
 * - **Frequency** has no OS-level source on Windows at all — the counter set has
 *   no clock field (checked: `GPU Engine` exposes only utilisation, `GPU Adapter
 *   Memory` only usage). It comes from `nvidia-smi` (NVIDIA) or a running
 *   LibreHardwareMonitor (several vendors), and where neither exists the field is
 *   `null` and the panel shows `—`. Inventing a percentage from a guessed maximum
 *   clock would be exactly the confident-but-meaningless figure this plugin
 *   avoids elsewhere.
 *
 * Sources are tried in descending order of information, and each field is taken
 * from the first source that can answer it — so a machine with nvidia-smi gets
 * both figures from one call, and a machine with an AMD card and nothing
 * installed still gets its VRAM.
 *
 * @module dsh-client-ui-sidebar-perfmon/gpu
 */

import { createLinuxGpuSource } from './linux.js'
import { createWin32GpuSource } from './win32.js'

/** The reading served when the GPU line is disabled by configuration. */
export const HIDDEN_GPU = {
  status: 'hidden',
  at: null,
  source: null,
  name: null,
  clockMhz: null,
  clockMaxMhz: null,
  memoryUsedBytes: null,
  memoryTotalBytes: null,
  memoryPercent: null,
  warnings: ['gpu-hidden'],
}

/**
 * Choose the GPU source for a platform.
 *
 * Linux is handled in-process (sysfs, plus `nvidia-smi` only when it exists);
 * Windows goes through one PowerShell call because its counters are only
 * reachable that way. Every other platform tries `nvidia-smi` and otherwise
 * reports unavailable, which is the honest answer.
 * @param {string} platform - a `process.platform` value.
 * @param {object} [options] - injection seam.
 * @returns {object} the source, whose `read()` yields the raw figures.
 */
export function selectGpuSource(platform, options = {}) {
  if (platform === 'win32') return createWin32GpuSource(options)
  // Linux and everything else share the sysfs/nvidia-smi reader: on Linux the
  // sysfs part works, elsewhere only nvidia-smi can answer.
  return createLinuxGpuSource({ ...options, platform })
}

/**
 * Clamp a percentage into 0–100, or `null` when it cannot be computed.
 * @param {number | null} used - bytes in use.
 * @param {number | null} total - bytes available.
 * @returns {number | null} the percentage, or null.
 */
export function memoryPercent(used, total) {
  if (typeof used !== 'number' || typeof total !== 'number') return null
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null
  return Math.min(Math.max((used / total) * 100, 0), 100)
}

/**
 * Build the GPU probe.
 *
 * immediately and refreshed behind the caller — but the default cadence follows
 * the platform's main poll (4s on Windows). VRAM is the useful signal while a
 * model loads, so the probe should not be lazier than the panel itself.
 * @param {{source?: object, intervalMs?: number, now?: () => number}} [options] - source, cadence and clock.
 * @returns {{read: () => Promise<object>, pending: () => Promise<void>}} the probe.
 */
export function createGpuProbe(options = {}) {
  const source = options.source ?? selectGpuSource(process.platform)
  const intervalMs = options.intervalMs ?? 4000
  const now = options.now ?? Date.now

  /** @type {object | undefined} */
  let cached
  /** @type {Promise<object> | undefined} */
  let inflight

  /**
   * Run one read and fold it into the reading shape.
   * @returns {Promise<object>} the fresh reading.
   */
  async function readOnce() {
    let result
    try {
      result = await source.read()
    } catch (error) {
      result = { warnings: [`gpu-failed: ${String(error?.message ?? error)}`] }
    }
    const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
    const used = num(result?.memoryUsedBytes)
    const total = num(result?.memoryTotalBytes)
    const memoryUsedBytes = used ?? (result?.memoryUsedBytes === 0 && total !== null ? 0 : null)
    const name = typeof result?.name === 'string' && result.name !== '' ? result.name : null
    const clockMhz = num(result?.clockMhz)
    const warnings = [...(result?.warnings ?? [])]
    // Each missing figure is named, so the panel can explain a dash instead of
    // leaving the reader to guess whether the card is unsupported or just idle.
    if (total === null) warnings.push('gpu-memory-unavailable')
    if (clockMhz === null) warnings.push('gpu-clock-unavailable')
    return {
      status: total !== null || clockMhz !== null ? 'ready' : 'unavailable',
      at: now(),
      source: typeof result?.source === 'string' ? result.source : null,
      name,
      clockMhz,
      clockMaxMhz: num(result?.clockMaxMhz),
      memoryUsedBytes,
      memoryTotalBytes: total,
      memoryPercent: memoryPercent(memoryUsedBytes, total),
      warnings: [...new Set(warnings)],
    }
  }

  /**
   * Serve the current reading, refreshing it when it has aged out.
   * @returns {Promise<object>} the reading.
   */
  async function read() {
    if (cached !== undefined && now() - cached.at <= intervalMs) return cached
    if (cached === undefined) {
      // Nothing to serve yet: the first caller waits, so the panel's first paint
      // carries a real number rather than an empty row.
      inflight ??= readOnce()
      try {
        cached = await inflight
      } finally {
        inflight = undefined
      }
      return cached
    }
    // Stale: serve it now, refresh behind the caller, so a PowerShell call never
    // delays the poll that is already on the wire.
    if (inflight === undefined) {
      inflight = readOnce()
        .then((reading) => {
          cached = reading
          return reading
        })
        .catch(() => cached)
        .finally(() => {
          inflight = undefined
        })
    }
    return cached
  }

  return {
    read,
    pending: async () => {
      await inflight
    },
  }
}
