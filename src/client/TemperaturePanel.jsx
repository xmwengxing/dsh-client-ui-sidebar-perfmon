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
 * The title bar additionally carries the card's one-click **LHM assist**: on
 * Windows an unreadable CPU is not a sensor that failed but a hardware monitor
 * that is not there (see `host/lhm.js`), so a monitor reported *missing* gets an
 * install button, *installed-but-silent* gets a start button, and a running
 * monitor gets no button at all — the temperatures are on screen. The button is
 * a pill on the title bar rather than a hover-tooltip widget because a native
 * `title` cannot contain controls: the tooltip (a plain `title` attribute) does
 * the explaining, the pill does the acting. Its tooltip states the one thing the
 * click cannot do for a remote viewer — elevation answers a UAC prompt on the
 * HOST's screen, which the browser never sees.
 *
 * The card is drawn from the host's `temperature` reading, which the host
 * refreshes on its own calmer cadence: a temperature is an absolute reading, and
 * on Windows it costs a helper call.
 *
 * @module dsh-client-ui-sidebar-perfmon/TemperaturePanel
 */

import { createElement as h, useEffect, useRef, useState } from 'react'
import { formatCelsius } from './format.js'
import { describeWarning } from './copy.js'
import { assistLhm } from './api.js'

/** The tiles, in render order, with the copy key for each. */
export const TEMPERATURE_TILES = [
  { kind: 'cpu', key: 'temperatureCpu' },
  { kind: 'gpu', key: 'temperatureGpu' },
  { kind: 'mainboard', key: 'temperatureMainboard' },
  { kind: 'disk', key: 'temperatureDisk' },
]

/**
 * Upper bound on one assist action, in milliseconds.
 *
 * The host bounds its own work (winget ~200 s, elevation 15 s), and the UAC
 * prompt it may be waiting on is answerable only on the host's screen — so a
 * click that has not come back by then is handed back to the user with an
 * honest `timeout` rather than a spinner that never ends.
 */
export const LHM_ACTION_TIMEOUT_MS = 90_000

/** Where the manual-download link goes when the host has no winget. */
export const LHM_MANUAL_URL = 'https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases'

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
 * The assist pill on the title bar.
 *
 * Rendered only when the host made a claim about the monitor (`lhm: null`
 * means no claim, and no button). The snapshot stays the source of truth for
 * the *state* — a `running` reading hides the button even while a local action
 * is still pending — while `pending` and `failure` are this component's own:
 * the label while a click is in flight, and the reason to show if it ended in
 * something the panel can explain.
 * @param {{state: string, path?: string | null} | null} lhm - the monitor state from the reading.
 * @param {(key: string, values?: object) => string} t - translator.
 * @param {(action: string) => Promise<{state?: string | null, reason?: string, detail?: string}>} assist - the action caller.
 * @returns {import('react').ReactNode} the pill (plus manual link), or nothing.
 */
function LhmAssist({ lhm, t, assist }) {
  const [pending, setPending] = useState(null) // 'install' | 'start' | null
  const [failure, setFailure] = useState(null) // {reason, detail} | null
  // The in-flight timeout, so unmount (or a reply) can cancel it rather than
  // firing set-state into a dead fiber.
  const timeoutRef = useRef(null)

  useEffect(() => () => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
  }, [])

  const lhmState = lhm?.state ?? null
  // A snapshot that reports the monitor running retires the button whatever
  // the local click still believes; the effect only runs when that matters.
  useEffect(() => {
    if (lhmState === 'running' && pending !== null) setPending(null)
  }, [lhmState, pending])

  if (lhm === null || lhmState === null || lhmState === 'running') return null

  const action = lhmState === 'missing' ? 'install' : 'start'
  const label =
    pending === 'install'
      ? t('lhmInstalling')
      : pending === 'start'
        ? t('lhmStarting')
        : action === 'install'
          ? t('lhmInstall')
          : t('lhmStart')
  const hint =
    pending === 'start'
      ? t('lhmHintStarting')
      : action === 'install'
        ? t('lhmHintInstall')
        : t('lhmHintStart')
  const reasonText =
    failure === null
      ? null
      : failure.reason === 'timeout'
        ? t('lhmReason.timeout')
        : t(`lhmReason.${failure.reason}`) || failure.reason
  const tooltip = [
    hint,
    failure === null ? null : `${t('lhmError')}: ${reasonText}`,
    failure?.detail ?? null,
  ]
    .filter((part) => typeof part === 'string' && part !== '')
    .join('\n')

  const run = () => {
    if (pending !== null) return
    setFailure(null)
    setPending(action)
    const id = setTimeout(() => {
      timeoutRef.current = null
      setPending(null)
      setFailure({ reason: 'timeout', detail: undefined })
    }, LHM_ACTION_TIMEOUT_MS)
    id.unref?.()
    timeoutRef.current = id
    assist(action)
      .then((reply) => {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
        if (typeof reply?.reason === 'string' && reply.reason !== '') {
          setFailure({ reason: reply.reason, detail: reply.detail })
          setPending(null)
          return
        }
        // `starting` keeps the in-flight label until the snapshot itself
        // reports `running` and the button disappears; anything else means
        // nothing more will happen without another click.
        if (reply?.state !== 'starting') setPending(null)
      })
      .catch((error) => {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
        setFailure({ reason: 'action-failed', detail: String(error?.message ?? error) })
        setPending(null)
      })
  }

  return [
    h(
      'button',
      {
        key: 'lhm-action',
        type: 'button',
        className: 'dsh-perfmon-action dsh-perfmon-lhm',
        disabled: pending !== null,
        'aria-busy': pending !== null ? 'true' : undefined,
        title: tooltip,
        onClick: run,
      },
      label,
    ),
    // The one dead end left: a host without winget. The button stays (retrying
    // is pointless while winget is absent, so it is disabled by the state it
    // gets back), and the link does what a button on this machine cannot.
    failure?.reason === 'winget-unavailable'
      ? h(
          'a',
          {
            key: 'lhm-manual',
            className: 'dsh-perfmon-lhmLink',
            href: LHM_MANUAL_URL,
            target: '_blank',
            rel: 'noopener noreferrer',
            title: t('lhmManualHint'),
          },
          t('lhmManual'),
        )
      : null,
  ]
}

/**
 * Render the temperature window.
 * @param {{reading: object | undefined,
 *          t: (key: string, values?: object) => string,
 *          assist?: (action: string) => Promise<object>}} props - the current reading, translator, and (tests) the action caller.
 * @returns {import('react').ReactNode} the temperature card, or nothing when hidden.
 */
export function TemperaturePanel({ reading, t, assist = assistLhm }) {
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
      // The pill sits next to the title — a title-bar control, not a tile
      // overlay: the tiles stay purely data, and the meta (with its
      // margin-inline-start: auto) still lands at the far right.
      h(LhmAssist, { lhm: temperature.lhm ?? null, t, assist }),
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
