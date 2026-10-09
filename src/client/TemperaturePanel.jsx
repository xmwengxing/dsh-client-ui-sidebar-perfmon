/**
 * The temperature window: CPU, GPU, motherboard and drive temperatures.
 *
 * Four tiles, one per component. Each tile is deliberately **two lines** — the
 * reading with its unit, then the component's name — because that is all the
 * card has to say at a glance. The supporting detail (which sensor answered, and
 * the spread when a component has several) lives in the tile's tooltip, where it
 * costs no height and is there for the reader who wants it. An earlier version
 * printed it as a third line and the card read as mostly whitespace.
 *
 * The card follows the same rules as the rest of the panel:
 *
 * - a component no source could answer is an em dash, and its tooltip says why —
 *   never a zero, and never another component's figure;
 * - the *hottest* sensor is the headline for a component with several (a package
 *   and its cores, two drives), because that is the number worth watching;
 * - the tiles are coloured on a fixed scale, so a hot machine is legible at a
 *   glance.
 *
 * The card is drawn from the host's `temperature` reading, which the host
 * refreshes on its own calmer cadence: a temperature is an absolute reading, and
 * on Windows it costs a helper call.
 *
 * @module dsh-client-ui-sidebar-perfmon/TemperaturePanel
 */

import { createElement as h } from 'react'
import { formatCelsius } from './format.js'
import { describeWarning } from './copy.js'

/** The tiles, in render order, with the copy key for each. */
export const TEMPERATURE_TILES = [
  { kind: 'cpu', key: 'temperatureCpu' },
  { kind: 'gpu', key: 'temperatureGpu' },
  { kind: 'mainboard', key: 'temperatureMainboard' },
  { kind: 'disk', key: 'temperatureDisk' },
]

/**
 * Thresholds that turn a reading into a tone.
 *
 * Deliberately coarse: a temperature's absolute value matters less than whether
 * it is normal, warm or a problem, and a per-component limit would be invented —
 * the plugin has no datasheet. `warm` is where a machine is working hard and
 * `hot` is where most consumer silicon is throttling, which is the actionable
 * line for every component this card draws.
 */
export const TEMPERATURE_TONES = { warm: 70, hot: 85 }

/**
 * Classify a reading into one of the three tones.
 * @param {number | null | undefined} celsius - the reading.
 * @returns {'unknown' | 'cool' | 'warm' | 'hot'} the tone.
 */
export function temperatureTone(celsius) {
  if (typeof celsius !== 'number' || !Number.isFinite(celsius)) return 'unknown'
  if (celsius >= TEMPERATURE_TONES.hot) return 'hot'
  if (celsius >= TEMPERATURE_TONES.warm) return 'warm'
  return 'cool'
}

/**
 * The tooltip for one tile.
 *
 * This is where the detail the tile no longer prints goes: every sensor by name
 * with its reading, and — for a component nothing could answer — the reason,
 * so an empty tile explains itself on hover instead of being a bare dash. The
 * reason is taken from the reading's warnings, which is the only place the host
 * records *why* a component is missing.
 * @param {object | null} group - the component's reading.
 * @param {string[]} warnings - the reading's warning codes.
 * @param {string} kind - the component key.
 * @param {(key: string, values?: object) => string} t - translator.
 * @returns {string | undefined} the tooltip text, or undefined when there is nothing to say.
 */
function tileTitle(group, warnings, kind, t) {
  if (group == null) {
    const code = warnings.find((entry) => entry === `temperature-${kind}-unavailable`)
    return code === undefined ? undefined : describeWarning(t, code)
  }
  const sensors = Array.isArray(group.sensors) ? group.sensors : []
  const lines = sensors.map(
    (sensor) => `${sensor.label}: ${formatCelsius(sensor.celsius)}${t('temperatureUnit')}`,
  )
  // A single sensor's own name is already the only line; a component with
  // several also states its spread, which is what the third line used to show.
  if (group.count > 1) {
    lines.push(
      t('temperatureRange', { min: formatCelsius(group.min), max: formatCelsius(group.max) }),
    )
  }
  return lines.length > 0 ? lines.join('\n') : undefined
}

/**
 * Render the temperature window.
 * @param {{reading: object | undefined, t: (key: string, values?: object) => string}} props - the current reading and translator.
 * @returns {import('react').ReactNode} the temperature card, or nothing when hidden.
 */
export function TemperaturePanel({ reading, t }) {
  const temperature = reading?.temperature
  if (temperature == null) return null
  if (temperature.status === 'hidden') return null
  const groups = temperature.groups ?? {}
  // The card's own warnings are the precise ones; the reading's are the fallback
  // for a host that reports the reason at the top level instead.
  const warnings = Array.isArray(temperature.warnings) && temperature.warnings.length > 0
    ? temperature.warnings
    : Array.isArray(reading?.warnings)
      ? reading.warnings
      : []

  return h(
    'section',
    { className: 'dsh-perfmon-card', 'aria-label': t('temperatures') },
    h(
      'div',
      { className: 'dsh-perfmon-cardHead' },
      h('span', { className: 'dsh-perfmon-cardTitle' }, t('temperatures')),
      // The source is what makes a temperature trustworthy, and it is the one
      // thing the tiles cannot show: it says where the numbers came from.
      h(
        'span',
        {
          className: 'dsh-perfmon-cardMeta',
          title: typeof temperature.source === 'string' ? temperature.source : undefined,
        },
        temperature.status === 'unavailable'
          ? t('temperatureUnavailableShort')
          : [t('temperatureUnit'), typeof temperature.source === 'string' ? temperature.source : undefined]
              .filter((part) => typeof part === 'string' && part !== '')
              .join(' · '),
      ),
    ),
    h(
      'div',
      { className: 'dsh-perfmon-temps' },
      TEMPERATURE_TILES.map((tile) => {
        const group = groups[tile.kind] ?? null
        const celsius = group?.celsius ?? null
        const tone = temperatureTone(celsius)
        return h(
          'div',
          {
            key: tile.kind,
            className: `dsh-perfmon-temp dsh-perfmon-temp--${tone}`,
            title: tileTitle(group, warnings, tile.kind, t),
          },
          h(
            'span',
            { className: 'dsh-perfmon-tempValue' },
            formatCelsius(celsius),
            celsius === null ? null : h('span', { className: 'dsh-perfmon-tempUnit' }, t('temperatureUnit')),
          ),
          h('span', { className: 'dsh-perfmon-tempLabel' }, t(tile.key)),
        )
      }),
    ),
  )
}
