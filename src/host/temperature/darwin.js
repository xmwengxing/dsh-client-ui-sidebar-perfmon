/**
 * Temperature sources for macOS: `powermetrics`, then two optional helpers.
 *
 * macOS is the awkward platform here, and the plugin says so rather than
 * inventing a figure. There is no unprivileged, built-in way to read the SMC:
 *
 * - `powermetrics --samplers smc` answers with the CPU and GPU die temperatures,
 *   but it **requires root**. A GUI host started as an ordinary user gets a
 *   permission error, which is why this source reports `temperature-unavailable`
 *   instead of a number in that case.
 * - `osx-cpu-temp` and `istats` are the usual community helpers. Both read the
 *   SMC and both must be installed by the user, so each is used when present and
 *   ignored when not.
 *
 * A machine with none of the three reports every bucket unavailable and names the
 * reason. That is the honest answer: a Mac's CPU temperature is not readable by a
 * normal user process, and a fabricated zero would be worse than a dash.
 *
 * @module dsh-client-ui-sidebar-perfmon/temperature/darwin
 */

import { firstAvailable, runCommand } from '../readers/exec.js'

/** The helper commands this source can use, in descending order of information. */
export const DARWIN_HELPERS = ['powermetrics', 'osx-cpu-temp', 'istats']

/**
 * Parse `powermetrics --samplers smc -n 1` output.
 *
 * The interesting lines are `<component>: <value> C` — `CPU die temperature:
 * 42.75 C`, `GPU die temperature: 38.00 C`. Everything else in the report
 * (thermal levels, fan RPM) is not a temperature and is ignored.
 * @param {string} text - the command's standard output.
 * @returns {object[]} the sensors found.
 */
export function parsePowermetrics(text) {
  const sensors = []
  for (const line of String(text ?? '').split('\n')) {
    const match = /^([A-Za-z][^:]*?):\s*(-?[\d.]+)\s*C\s*$/.exec(line.trim())
    if (match === null) continue
    const label = match[1].trim()
    const celsius = Number(match[2])
    if (!Number.isFinite(celsius)) continue
    const kind = /gpu/i.test(label) ? 'gpu' : /cpu/i.test(label) ? 'cpu' : null
    // Only the die temperatures are attributed; a board or battery sensor this
    // source cannot place is left out rather than guessed into a bucket.
    if (kind === null) continue
    sensors.push({ id: `powermetrics:${label}`, kind, label, celsius })
  }
  return sensors
}

/**
 * Parse `osx-cpu-temp` output, which is a single bare temperature.
 * @param {string} text - the command's standard output.
 * @returns {object[]} the sensors found.
 */
export function parseOsxCpuTemp(text) {
  const match = /(-?[\d.]+)\s*°?\s*C/.exec(String(text ?? ''))
  if (match === null) return []
  const celsius = Number(match[1])
  if (!Number.isFinite(celsius)) return []
  return [{ id: 'osx-cpu-temp:cpu', kind: 'cpu', label: 'CPU', celsius }]
}

/**
 * Parse the temperature rows of an `istats` report.
 *
 * `istats` prints aligned `Key    value` lines such as `CPU die temperature  45.0°C`.
 * @param {string} text - the command's standard output.
 * @returns {object[]} the sensors found.
 */
export function parseIstats(text) {
  const sensors = []
  for (const line of String(text ?? '').split('\n')) {
    const match = /^\s*(.+?)\s{2,}(-?[\d.]+)\s*°?\s*C\s*$/.exec(line)
    if (match === null) continue
    const label = match[1].trim()
    const celsius = Number(match[2])
    if (!Number.isFinite(celsius)) continue
    const kind = /gpu/i.test(label) ? 'gpu' : /cpu/i.test(label) ? 'cpu' : null
    if (kind === null) continue
    sensors.push({ id: `istats:${label}`, kind, label, celsius })
  }
  return sensors
}

/**
 * Build the macOS temperature source around one command runner.
 * @param {{run?: (command: string, args: string[], options?: object) => Promise<string>,
 *          available?: (candidates: string[], run?: object) => Promise<string | undefined>}} [options] - injection seam.
 * @returns {object} the source.
 */
export function createDarwinTemperature(options = {}) {
  const run = options.run ?? runCommand
  const find = options.available ?? firstAvailable

  return {
    id: 'darwin',
    async read() {
      // The helpers are probed in order and the first one that answers wins: a
      // Mac with `powermetrics` available and permitted never shells out twice.
      for (const helper of DARWIN_HELPERS) {
        const present = await find([helper], run)
        if (present === undefined) continue
        const args =
          helper === 'powermetrics'
            ? ['--samplers', 'smc', '-n', '1', '-i', '1000']
            : helper === 'istats'
              ? ['--no-graphs']
              : []
        let text
        try {
          text = await run(helper, args, { timeoutMs: 10000 })
        } catch (error) {
          // `powermetrics` failing as a non-root user is the expected case on a
          // stock Mac; try the next helper rather than failing the whole read.
          if (helper === 'powermetrics') continue
          return {
            sensors: [],
            source: null,
            warnings: [`temperature-failed: ${String(error?.message ?? error)}`],
          }
        }
        const sensors =
          helper === 'powermetrics'
            ? parsePowermetrics(text)
            : helper === 'istats'
              ? parseIstats(text)
              : parseOsxCpuTemp(text)
        if (sensors.length > 0) return { sensors, source: helper, warnings: [] }
      }
      return { sensors: [], source: null, warnings: ['temperature-unavailable'] }
    },
  }
}

/** The temperature source for a machine whose `process.platform` is `darwin`. */
export const darwinTemperature = createDarwinTemperature()

export default darwinTemperature
