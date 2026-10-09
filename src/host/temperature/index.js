/**
 * The temperature reading: source selection, per-component aggregation, caching.
 *
 * This is deliberately *not* part of the differencing sampler. A temperature is an
 * absolute reading rather than a counter, so there is nothing to difference, and
 * on Windows it costs a PowerShell call of a second or more — far too much to
 * repeat on the panel's two-to-four-second poll. The probe therefore owns its own
 * calmer cadence (`temperatureIntervalMs`, 15s by default) and its own cache:
 *
 * - with no reading yet, the first caller waits for the read, so the panel's
 *   first paint carries a real number instead of an empty card;
 * - once a reading exists, a stale one is served immediately while a refresh runs
 *   in the background, so the poll is never blocked by the probe;
 * - concurrent callers share one in-flight read, so several open panels cost one
 *   PowerShell call between them.
 *
 * The four buckets the panel draws — CPU, GPU, mainboard, disk — are the
 * aggregation unit. A bucket no source could answer stays `null` and is named in
 * `warnings`; it is never filled with a zero or with another component's figure.
 *
 * @module dsh-client-ui-sidebar-perfmon/temperature
 */

import { darwinTemperature } from './darwin.js'
import { createGenericTemperature } from './generic.js'
import { linuxTemperature } from './linux.js'
import { win32Temperature } from './win32.js'

/** The buckets the panel renders, in the order it renders them. */
export const TEMPERATURE_GROUPS = ['cpu', 'gpu', 'mainboard', 'disk']

/**
 * Choose the temperature source for a platform.
 * @param {string} platform - a `process.platform` value.
 * @returns {object} the source, whose `read()` yields `{sensors, source, warnings}`.
 */
export function selectTemperatureSource(platform) {
  if (platform === 'linux') return linuxTemperature
  if (platform === 'darwin') return darwinTemperature
  if (platform === 'win32') return win32Temperature
  return createGenericTemperature(platform)
}

/**
 * Round a Celsius reading to the tenth the panel displays.
 *
 * Sources hand back whatever precision they have — the ACPI zone arrives as
 * `27.850000000000023` after the Kelvin conversion — and carrying that noise into
 * the wire format and the tooltip helps nobody.
 * @param {number} value - the raw reading.
 * @returns {number} the reading rounded to one decimal place.
 */
function roundCelsius(value) {
  return Math.round(value * 10) / 10
}

/**
 * Fold a flat sensor list into the four buckets the panel draws.
 *
 * A bucket carries its hottest reading as the headline — the number a user is
 * watching for — plus the full list, so a machine with eight cores or two drives
 * can be read in detail without the card growing. `min` and `max` come from the
 * sensors that are actually in the bucket, never from a wider set.
 * @param {object[]} sensors - the sensors a source produced.
 * @returns {Record<string, object | null>} one entry per bucket, `null` when unanswered.
 */
export function groupSensors(sensors) {
  /** @type {Record<string, object[]>} */
  const byKind = {}
  for (const sensor of sensors) {
    const kind = TEMPERATURE_GROUPS.includes(sensor?.kind) ? sensor.kind : null
    if (kind === null) continue
    const celsius = sensor.celsius
    if (typeof celsius !== 'number' || !Number.isFinite(celsius)) continue
    byKind[kind] ??= []
    byKind[kind].push({ label: String(sensor.label ?? kind), celsius: roundCelsius(celsius) })
  }
  /** @type {Record<string, object | null>} */
  const groups = {}
  for (const kind of TEMPERATURE_GROUPS) {
    const list = byKind[kind]
    if (list === undefined || list.length === 0) {
      groups[kind] = null
      continue
    }
    const values = list.map((entry) => entry.celsius)
    groups[kind] = {
      // The hottest sensor is the headline: it is the one that matters, and a
      // mean across a package and its cores would understate the peak.
      celsius: Math.max(...values),
      min: Math.min(...values),
      max: Math.max(...values),
      count: list.length,
      sensors: list,
    }
  }
  return groups
}

/** The reading served when the card is disabled by configuration. */
export const HIDDEN_TEMPERATURE = {
  status: 'hidden',
  at: null,
  source: null,
  groups: { cpu: null, gpu: null, mainboard: null, disk: null },
  warnings: ['temperature-hidden'],
}

/**
 * Build the temperature probe.
 * @param {{source?: object, intervalMs?: number, now?: () => number}} [options] - the source, its cadence, and a clock.
 * @returns {{read: () => Promise<object>, pending: () => Promise<void>, refresh: () => void}} the probe.
 */
export function createTemperatureProbe(options = {}) {
  const source = options.source ?? selectTemperatureSource(process.platform)
  const intervalMs = options.intervalMs ?? 15000
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
      // A source that throws is a source that could not answer; the panel says so
      // rather than losing the whole snapshot to it.
      result = { sensors: [], source: null, warnings: [`temperature-failed: ${String(error?.message ?? error)}`] }
    }
    const sensors = Array.isArray(result?.sensors) ? result.sensors : []
    const groups = groupSensors(sensors)
    const answered = TEMPERATURE_GROUPS.filter((kind) => groups[kind] !== null)
    // A source may already have said why it answered nothing; the per-bucket
    // reasons are added here and the whole list is de-duplicated, because the
    // panel renders one line per entry and a repeat reads as two faults.
    const warnings = [...(result?.warnings ?? [])]
    for (const kind of TEMPERATURE_GROUPS) {
      if (groups[kind] === null) warnings.push(`temperature-${kind}-unavailable`)
    }
    return {
      status: answered.length > 0 ? 'ready' : 'unavailable',
      at: now(),
      source: typeof result?.source === 'string' ? result.source : null,
      groups,
      warnings: [...new Set(warnings)],
    }
  }

  /**
   * Serve the current reading, refreshing it when it has aged out.
   * @returns {Promise<object>} the reading.
   */
  async function read() {
    const fresh = cached !== undefined && now() - cached.at <= intervalMs
    if (fresh) return cached
    if (cached === undefined) {
      // Nothing to serve yet: the first caller waits, so the panel's first paint
      // is a real number rather than an empty card.
      inflight ??= readOnce()
      try {
        cached = await inflight
      } finally {
        inflight = undefined
      }
      return cached
    }
    // A stale reading is served at once and refreshed behind the caller: a
    // PowerShell call must never block the poll that is already on the wire.
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
    refresh: () => {
      cached = undefined
    },
  }
}
