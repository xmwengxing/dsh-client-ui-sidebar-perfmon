/**
 * Temperature sources for a platform with no dedicated reader.
 *
 * There is no portable answer here, so this source tries the two things that are
 * at least *conventional* — `/sys/class/hwmon` (FreeBSD's `lindev` compatibility
 * layer exposes it, and many NAS boxes are Linux underneath) and the
 * `sysctl`-reported `dev.cpu.N.temperature` that FreeBSD itself provides — and
 * reports unavailable when neither answers.
 *
 * Nothing is invented. A platform this module cannot read says
 * `temperature-unavailable` and the panel shows dashes, which is the same rule
 * every other unavailable field in this plugin follows.
 *
 * @module dsh-client-ui-sidebar-perfmon/temperature/generic
 */

import { readHwmon } from './linux.js'
import { runCommand } from '../readers/exec.js'

/**
 * Parse FreeBSD's `sysctl -a` CPU temperature lines.
 *
 * FreeBSD reports `dev.cpu.0.temperature: 45.0C` per core, and the unit is
 * appended to the value rather than being a separate field.
 * @param {string} text - the `sysctl -a` output.
 * @returns {object[]} the sensors found.
 */
export function parseSysctlTemperatures(text) {
  const sensors = []
  for (const line of String(text ?? '').split('\n')) {
    const match = /^(dev\.cpu\.(\d+)\.temperature):\s*(-?[\d.]+)\s*C\s*$/.exec(line.trim())
    if (match === null) continue
    const celsius = Number(match[3])
    if (!Number.isFinite(celsius)) continue
    sensors.push({ id: `sysctl:${match[1]}`, kind: 'cpu', label: `cpu${match[2]}`, celsius })
  }
  return sensors
}

/**
 * Build the generic temperature source.
 * @param {string} platform - the `process.platform` this source stands in for.
 * @param {{run?: (command: string, args: string[], options?: object) => Promise<string>}} [options] - injection seam.
 * @returns {object} the source.
 */
export function createGenericTemperature(platform, options = {}) {
  const run = options.run ?? runCommand

  return {
    id: 'generic',
    async read() {
      // A Linux-compatible hwmon tree, when the platform exposes one.
      const hwmon = await readHwmon()
      if (hwmon.length > 0) return { sensors: hwmon, source: 'hwmon', warnings: [] }
      // Otherwise the platform's own sysctl, which on FreeBSD carries CPU temps.
      try {
        const text = await run('sysctl', ['-a'], { timeoutMs: 5000 })
        const sensors = parseSysctlTemperatures(text)
        if (sensors.length > 0) return { sensors, source: 'sysctl', warnings: [] }
      } catch {
        // No sysctl, or no temperature in it: the answer is still unavailable.
      }
      return { sensors: [], source: null, warnings: [`temperature-unavailable: ${platform}`] }
    },
  }
}

export default createGenericTemperature
