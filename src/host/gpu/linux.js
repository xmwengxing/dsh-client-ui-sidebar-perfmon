/**
 * Linux (and generic) GPU source: sysfs in process, `nvidia-smi` when present.
 *
 * Linux exposes more than Windows does, and most of it for free:
 *
 * - **amdgpu** publishes `gpu_busy_percent` and `mem_info_vram_used` /
 *   `mem_info_vram_total` as plain files under each DRM card's `device`
 *   directory, so an AMD card costs a few reads and no subprocess.
 * - **i915** publishes `gt_cur_freq_mhz` and `gt_max_freq_mhz` for the clock,
 *   but no VRAM figure — integrated graphics share system memory, and the kernel
 *   does not account for it here.
 * - **NVIDIA** publishes almost nothing useful in sysfs, so `nvidia-smi` is the
 *   only source; it is used only when the binary exists.
 *
 * A platform that is neither (FreeBSD, and any other) falls through to
 * `nvidia-smi` alone, and reports unavailable when it is absent. That is the
 * honest answer: no portable GPU interface exists across vendors.
 *
 * @module dsh-client-ui-sidebar-perfmon/gpu/linux
 */

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { runCommand } from '../readers/exec.js'

/** Where the DRM devices are exposed. */
export const DRM_ROOT = '/sys/class/drm'

/** The `nvidia-smi` fields one call returns, in order. */
export const NVIDIA_QUERY =
  'name,memory.used,memory.total,clocks.current.graphics,clocks.max.graphics'

/**
 * Read one sysfs file as a number, or `undefined`.
 * @param {string} path - the file to read.
 * @returns {Promise<number | undefined>} the value.
 */
async function readNumber(path) {
  try {
    const text = await readFile(path, 'utf8')
    const value = Number(text.trim())
    return Number.isFinite(value) ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * Parse the active `amdgpu` state from `pp_dpm_sclk`.
 *
 * The driver lists one frequency per line and marks the active state with `*`:
 * `1: 1600Mhz *`. The value is MHz as printed, not Hz as `gt_cur_freq_mhz`
 * already is. Returns undefined if the file is absent or no state is starred.
 * @param {string} text - the sysfs file contents.
 * @returns {{current: number, max: number} | undefined} the active and maximum frequencies.
 */
export function parseAmdDpmFrequency(text) {
  const rows = []
  for (const line of String(text ?? '').split('\n')) {
    const match = /^\s*\d+\s*:\s*(\d+(?:\.\d+)?)\s*(M|G)?[Hh]z\s*(\*)?\s*$/.exec(line)
    if (match === null) continue
    const value = Number(match[1])
    if (!Number.isFinite(value) || value <= 0) continue
    const scale = String(match[2] ?? '').toUpperCase() === 'G' ? 1000 : 1
    rows.push({ value: value * scale, active: match[3] === '*' })
  }
  const active = rows.find((row) => row.active)
  if (active === undefined || rows.length === 0) return undefined
  return { current: active.value, max: Math.max(...rows.map((row) => row.value)) }
}

/**
 * Read one DRM card's GPU facts from sysfs.
 *
 * The vendor files are probed individually rather than by vendor name, because a
 * card exposes only the ones its driver implements and the absence of a file is
 * exactly how "this card cannot answer that" is expressed.
 * @param {string} cardPath - a `/sys/class/drm/cardN/device` directory.
 * @param {{readText?: (path: string) => Promise<string>}} [options] - filesystem seam for parsers/specs.
 * @returns {Promise<object>} the figures this card could answer.
 */
export async function readDrmCard(cardPath, options = {}) {
  const readText = options.readText ?? ((path) => readFile(path, 'utf8'))
  const [vendor, vramUsed, vramTotal, busy, curFreq, maxFreq, amdFreq] = await Promise.all([
    readText(join(cardPath, 'vendor')).then((value) => value.trim().toLowerCase()).catch(() => ''),
    readNumber(join(cardPath, 'mem_info_vram_used')),
    readNumber(join(cardPath, 'mem_info_vram_total')),
    readNumber(join(cardPath, 'gpu_busy_percent')),
    readNumber(join(cardPath, 'gt_cur_freq_mhz')),
    readNumber(join(cardPath, 'gt_max_freq_mhz')),
    (async () => {
      try {
        return parseAmdDpmFrequency(await readText(join(cardPath, 'pp_dpm_sclk')))
      } catch {
        return undefined
      }
    })(),
  ])
  const fields = {
    vendor,
    vramUsed,
    vramTotal,
    busy,
    curFreq: curFreq ?? amdFreq?.current,
    maxFreq: maxFreq ?? amdFreq?.max,
  }
  const answered = Object.values(fields).some((value) => typeof value === 'number')
  return { answered, ...fields }
}

/**
 * Parse one line of `nvidia-smi --format=csv,noheader,nounits` output.
 *
 * The fields are positional and comma-separated; a card whose driver omits one
 * prints `[N/A]`, which must stay unavailable rather than become a zero.
 * @param {string} line - one output line.
 * @returns {object | undefined} the figures, or undefined when the line is unusable.
 */
export function parseNvidiaSmi(line) {
  const parts = String(line ?? '').split(',').map((part) => part.trim())
  if (parts.length < 5) return undefined
  const num = (value) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }
  const used = num(parts[1])
  const total = num(parts[2])
  return {
    name: parts[0] === '' || parts[0] === '[N/A]' ? null : parts[0],
    // MiB to bytes, the unit `--nounits` leaves the memory fields in.
    memoryUsedBytes: used === null ? null : used * 1024 * 1024,
    memoryTotalBytes: total === null ? null : total * 1024 * 1024,
    clockMhz: num(parts[3]),
    clockMaxMhz: num(parts[4]),
    source: 'nvidia-smi',
    warnings: [],
  }
}

/**
 * Build the sysfs/nvidia-smi GPU source.
 * @param {{run?: (command: string, args: string[], options?: object) => Promise<string>,
 *          drmRoot?: string, platform?: string}} [options] - injection seam.
 * @returns {object} the source.
 */
export function createLinuxGpuSource(options = {}) {
  const run = options.run ?? runCommand
  const drmRoot = options.drmRoot ?? DRM_ROOT
  const platform = options.platform ?? process.platform

  return {
    id: platform === 'linux' ? 'linux' : 'generic',
    async read() {
      const warnings = []
      let result = {}

      // 1. sysfs, which costs no subprocess. Only Linux has it.
      if (platform === 'linux') {
        let cards = []
        try {
          cards = (await readdir(drmRoot, { withFileTypes: true }))
            .filter((entry) => /^card\d+$/.test(entry.name))
            .map((entry) => join(drmRoot, entry.name, 'device'))
        } catch {
          // No DRM at all (a container, a headless VM): fall through to nvidia-smi.
        }
        for (const card of cards) {
          const facts = await readDrmCard(card)
          if (!facts.answered) continue
          result = {
            // A card with dedicated VRAM reports it; an integrated one does not,
            // and its clock is still worth having.
            memoryUsedBytes: facts.vramUsed ?? null,
            memoryTotalBytes: facts.vramTotal ?? null,
            clockMhz: facts.curFreq ?? null,
            clockMaxMhz: facts.maxFreq ?? null,
            source: 'sysfs',
          }
          // The first card that answers wins: a machine with two GPUs has one
          // primary, and reporting a merged figure would describe neither.
          break
        }
      }

      // 2. nvidia-smi fills whatever sysfs could not, and is the only source on a
      //    platform without sysfs.
      if (result.clockMhz == null || result.memoryTotalBytes == null) {
        try {
          const text = await run(
            'nvidia-smi',
            ['--query-gpu=' + NVIDIA_QUERY, '--format=csv,noheader,nounits'],
            { timeoutMs: 8000 },
          )
          const first = String(text).split('\n').map((line) => line.trim()).filter((line) => line !== '')[0]
          const parsed = parseNvidiaSmi(first)
          if (parsed !== undefined) {
            result = {
              name: parsed.name,
              memoryUsedBytes: result.memoryUsedBytes ?? parsed.memoryUsedBytes ?? null,
              memoryTotalBytes: result.memoryTotalBytes ?? parsed.memoryTotalBytes ?? null,
              clockMhz: result.clockMhz ?? parsed.clockMhz ?? null,
              clockMaxMhz: result.clockMaxMhz ?? parsed.clockMaxMhz ?? null,
              source: result.source === undefined ? 'nvidia-smi' : `${result.source}+nvidia-smi`,
            }
          }
        } catch {
          // No nvidia-smi, or it failed: whatever sysfs answered stands alone.
        }
      }

      if (result.source === undefined) {
        warnings.push(`gpu-unavailable: ${platform}`)
        return { warnings }
      }
      return { ...result, warnings }
    },
  }
}

export default createLinuxGpuSource
