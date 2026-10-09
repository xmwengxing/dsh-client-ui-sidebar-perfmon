/**
 * The temperature window: CPU, GPU, motherboard and drive temperatures.
 *
 * Four tiles, one per component, each with its headline reading, its label and a
 * supporting line. The card follows the same rules as the rest of the panel:
 *
 * - a component no source could answer is an em dash with its reason in the
 *   warnings list — never a zero, and never another component's figure;
 * - the *hottest* sensor is the headline for a component with several (a package
 *   and its cores, two drives), because that is the number worth watching, while
 *   the tooltip carries every sensor by name;
 * - the tiles are coloured by a fixed scale rather than by a design token that
 *   means something else, so a hot machine is legible at a glance.
 *
 * The card is drawn from the host's `temperature` reading, which the host
 * refreshes on its own calmer cadence: a temperature is an absolute reading, and
 * on Windows it costs a helper call. The card therefore shows the reading's own
 * age rather than pretending it moves with the two-second poll.
 *
 * @module dsh-client-ui-sidebar-perfmon/TemperaturePanel
 */

import { createElement as h } from 'react'
import { EMPTY, formatCelsius } from './format.js'

/** The tiles, in render order, with the copy key and tone for each. */
export const TEMPERATURE_TILES = [
  { kind: 'cpu', key: 'temperatureCpu', tone: 'cpu' },
  { kind: 'gpu', key: 'temperatureGpu', tone: 'gpu' },
  { kind: 'mainboard', key: 'temperatureMainboard', tone: 'mainboard' },
  { kind: 'disk', key: 'temperatureDisk', tone: 'disk' },
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
 * The supporting line under one tile's reading.
 *
 * A component with several sensors reports its spread; one with a single sensor
 * names it, so a lone `TZ00_0` is not a mystery. A component with nothing to say
 * shows the dash rather than an empty line, which keeps the four tiles aligned.
 * @param {object | null} group - the component's reading.
 * @param {(key: string, values?: object) => string} t - translator.
 * @returns {string} the detail text.
 */
function tileDetail(group, t) {
  if (group == null) return EMPTY
  if (group.count > 1) {
    return t('temperatureRange', {
      min: formatCelsius(group.min),
      max: formatCelsius(group.max),
    })
  }
  const label = group.sensors?.[0]?.label
  return typeof label === 'string' && label !== '' ? label : t('temperatureSensors', { count: String(group.count) })
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

  return h(
    'section',
    { className: 'dsh-perfmon-card', 'aria-label': t('temperatures') },
    h(
      'div',
      { className: 'dsh-perfmon-cardHead' },
      h('span', { className: 'dsh-perfmon-cardTitle' }, t('temperatures')),
      // The source and the reading's age are what make a temperature trustworthy:
      // the number moves on its own cadence, not on the panel's poll.
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
        const sensors = Array.isArray(group?.sensors) ? group.sensors : []
        // The tooltip is where every sensor by name lives, so a multi-core or
        // multi-drive machine stays readable without widening the card.
        const title =
          sensors.length > 0
            ? sensors.map((sensor) => `${sensor.label}: ${formatCelsius(sensor.celsius)}${t('temperatureUnit')}`).join('\n')
            : undefined
        return h(
          'div',
          { key: tile.kind, className: `dsh-perfmon-temp dsh-perfmon-temp--${tone}`, title },
          h(
            'span',
            { className: 'dsh-perfmon-tempValue' },
            formatCelsius(celsius),
            celsius === null ? null : h('span', { className: 'dsh-perfmon-tempUnit' }, t('temperatureUnit')),
          ),
          h('span', { className: 'dsh-perfmon-tempLabel' }, t(tile.key)),
          h('span', { className: 'dsh-perfmon-tempDetail', title: title }, tileDetail(group, t)),
        )
      }),
    ),
  )
}
