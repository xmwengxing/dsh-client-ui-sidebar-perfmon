/**
 * The perfmon tab body: two windows refreshed on one live clock.
 *
 * The refresh loop is a self-scheduling `setTimeout` rather than a `setInterval`,
 * so a slow host response can never stack requests on top of each other; the next
 * poll is scheduled from the response. Polling pauses while the browser tab is
 * hidden and resumes with an immediate read, which is what keeps a background
 * GUI from reading `/proc` all day. The interval itself comes from the host, so
 * the panel and the host's sampling cache agree on one number.
 *
 * @module dsh-client-ui-sidebar-perfmon/PerfmonBody
 */

import { createElement as h, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { fetchSnapshot, setKeepAwake } from './api.js'
import { GaugePanel } from './GaugePanel.jsx'
import { ProcessPanel } from './ProcessPanel.jsx'
import { TemperaturePanel } from './TemperaturePanel.jsx'
import { formatClock } from './format.js'
import { describeWarning } from './copy.js'

/** Fallback cadence when the host has not reported one yet. */
const DEFAULT_INTERVAL_MS = 2000
/** The alphabetical listing is only meaningful over the whole table. */
const NAME_SORT_LIMIT = 300
/** Row budget the host serves for the resource orderings. */
const DEFAULT_LIMIT = 60

/**
 * Whether the page is currently hidden.
 *
 * Read defensively: the panel is a browser component, but a hidden page is a
 * reason to skip work, never a reason to throw where no document exists.
 * @returns {boolean} true while polling should pause.
 */
function isHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

/**
 * Render the panel.
 *
 * `sessionId` is injected by the session-scoped tab seat: the folder meter
 * measures that session's workspace when the user asks. The mounted-seat
 * subscription is only the fallback for an opening without one.
 * @param {object} props - the injected face.
 * @param {(key: string, values?: object) => string} props.t - translator.
 * @param {(request: object) => Promise<object>} [props.load] - snapshot loader, injectable for tests.
 * @param {(on: boolean) => Promise<object>} [props.setAwake] - keep-awake toggle, injectable for tests.
 * @param {string} [props.sessionId] - the session whose workspace the meter measures.
 * @param {object} [props.ctx] - the client context, for the mounted-seat fallback.
 * @returns {import('react').ReactNode} the panel.
 */
export function PerfmonBody({ t, load = fetchSnapshot, setAwake = setKeepAwake, sessionId, ctx }) {
  const [sort, setSort] = useState('cpu')
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState({ status: 'loading', reading: undefined, error: undefined, intervalMs: DEFAULT_INTERVAL_MS })
  // The direct reply of the last keep-awake toggle: it is the host's own answer
  // to the click, landing before the next poll can report it. It is dropped as
  // soon as a snapshot confirms it (or twice disagrees with it) — polling, not
  // this override, is the lasting source of truth.
  const [awakeOverride, setAwakeOverride] = useState(null)
  const [awakeError, setAwakeError] = useState(undefined)
  const awakeMismatchRef = useRef(0)
  const awakeBaselineRef = useRef(null)
  const awakeBaselineSetRef = useRef(false)
  const aliveRef = useRef(true)

  const sortRef = useRef(sort)
  sortRef.current = sort
  // The directory scan's control, held outside React state on purpose: exactly
  // one request may carry it. A state mirror would be rewritten on every render
  // and re-send `measure: true` on every poll, each one aborting the scan the
  // previous request started — the scan would never finish.
  const measureRef = useRef(null)

  // The folder meter measures the viewed session's workspace. The seat injects
  // it; when an opening carries none, the right Sidebar's mounted-seat binding
  // says which session is on screen. Subscribing with `useSyncExternalStore`
  // keeps the read React-safe and re-renders the panel when it moves.
  const fallbackSessionId = useSyncExternalStore(
    useCallback(
      (onStoreChange) => {
        const mounted = ctx?.get?.('sidebarRight')?.mounted
        if (mounted === undefined || mounted === null) return () => {}
        return mounted.subscribe(onStoreChange)
      },
      [ctx],
    ),
    () => {
      const mounted = ctx?.get?.('sidebarRight')?.mounted?.getSnapshot?.()
      return typeof mounted === 'string' ? mounted : undefined
    },
    () => undefined,
  )
  const activeSessionId = typeof sessionId === 'string' && sessionId !== '' ? sessionId : fallbackSessionId
  const sessionRef = useRef(activeSessionId)
  sessionRef.current = activeSessionId

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  useEffect(() => {
    let timer
    let controller
    let stopped = false

    const schedule = (millis) => {
      timer = setTimeout(run, millis)
    }

    const run = async () => {
      if (stopped) return
      if (isHidden()) {
        schedule(DEFAULT_INTERVAL_MS)
        return
      }
      controller = new AbortController()
      const requestedSort = sortRef.current
      // The scan control is consumed by exactly one request: the one that acts on it.
      const measure = measureRef.current
      measureRef.current = null
      try {
        const reading = await load({
          sort: requestedSort,
          limit: requestedSort === 'name' ? NAME_SORT_LIMIT : DEFAULT_LIMIT,
          measure,
          session: measure === true ? sessionRef.current : undefined,
          signal: controller.signal,
        })
        if (stopped || !aliveRef.current) return
        setState({
          status: 'ready',
          reading,
          error: undefined,
          intervalMs: reading?.refreshIntervalMs ?? DEFAULT_INTERVAL_MS,
        })
        schedule(reading?.refreshIntervalMs ?? DEFAULT_INTERVAL_MS)
      } catch (error) {
        if (stopped || !aliveRef.current) return
        if (error?.name === 'AbortError') return
        setState((previous) => ({
          ...previous,
          status: previous.reading === undefined ? 'error' : 'stale',
          error: error?.message ?? String(error),
          intervalMs: DEFAULT_INTERVAL_MS,
        }))
        schedule(DEFAULT_INTERVAL_MS * 2)
      }
    }

    // A hidden tab resumes with a fresh reading rather than with stale numbers.
    const onVisibility = () => {
      if (!isHidden() && !stopped) {
        clearTimeout(timer)
        void run()
      }
    }

    void run()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }
    return () => {
      stopped = true
      clearTimeout(timer)
      controller?.abort()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }
  }, [load, sort, nonce])

  const refresh = useCallback(() => {
    setNonce((value) => value + 1)
  }, [])

  // Start or stop the directory scan: the flag rides exactly the next request
  // (an immediate re-read, not the next scheduled poll), and after it is sent
  // the state comes back from the host in the ordinary polling responses.
  const setMeasure = useCallback((value) => {
    measureRef.current = value
    setNonce((n) => n + 1)
  }, [])

  const { reading, status, error, intervalMs } = state
  const failed = status === 'error'
  // The reading's warnings, translated, as one line for the footer's tooltip.
  // A host that could not read something says so here; a healthy one says
  // nothing and the tooltip is not attached at all.
  const warningText = Array.isArray(reading?.warnings)
    ? reading.warnings.map((code) => describeWarning(t, String(code))).join('\n')
    : ''

  // The keep-awake button's state. `serverAwake` is the host's truth from the
  // last snapshot; the override is the direct reply of the last toggle. A
  // missing `awake` (the feature configured off, or a host too old to know
  // it) renders no button at all rather than one that would do nothing.
  const serverAwake = reading?.awake ?? null
  const awake = serverAwake === null ? null : awakeOverride ?? serverAwake
  const awakeRef = useRef(awake)
  awakeRef.current = awake

  useEffect(() => {
    if (awakeOverride === null) {
      awakeMismatchRef.current = 0
      awakeBaselineRef.current = null
      awakeBaselineSetRef.current = false
      return
    }
    const server = reading?.awake
    if (server === null || server === undefined) return
    // The render that carries the override still shows the reading the click
    // was made against — that one is not an answer. Only a later reading
    // (a new object from a completed poll) counts as the host speaking.
    if (!awakeBaselineSetRef.current) {
      awakeBaselineRef.current = reading
      awakeBaselineSetRef.current = true
      return
    }
    if (reading === awakeBaselineRef.current) return
    awakeBaselineRef.current = reading
    if (server.active === awakeOverride.active) {
      // Confirmed: ordinary polling resumes with no local state left behind.
      awakeMismatchRef.current = 0
      setAwakeOverride(null)
      return
    }
    // One disagreement can be a snapshot that was already in flight when the
    // click happened; two consecutive fresh ones mean the host genuinely moved
    // on (another tab toggled it back, the holder died) and its answer wins.
    awakeMismatchRef.current += 1
    if (awakeMismatchRef.current >= 2) {
      awakeMismatchRef.current = 0
      setAwakeOverride(null)
    }
  }, [reading, awakeOverride])

  // One click, one request: the hold itself lives host-side in a holder
  // process (see `host/keep-awake.js`), so it survives this tab closing —
  // which is the whole point for a remote session. Either outcome is followed
  // by an immediate re-poll, so the footer shows the host's answer rather
  // than the click's intention.
  const toggleAwake = useCallback(async () => {
    const next = awakeRef.current?.active !== true
    try {
      const value = await setAwake(next)
      setAwakeOverride(value)
      setAwakeError(undefined)
    } catch (toggleError) {
      setAwakeOverride(null)
      setAwakeError(toggleError?.message ?? String(toggleError))
    }
    setNonce((value) => value + 1)
  }, [setAwake])

  // What the button's tooltip promises, in order: what a click does right now,
  // why the host cannot hold (if it cannot), and the last failure (if any).
  const awakeTitle =
    awake === null
      ? undefined
      : [
          awake.active === true ? t('awakeHintActive') : t('awakeHintStart'),
          awake.reason === null || awake.reason === undefined ? '' : t(`awakeReason.${awake.reason}`),
          awakeError === undefined || awakeError === null || awakeError === ''
            ? ''
            : `${t('awakeError')}: ${awakeError}`,
        ]
          .filter((part) => part !== '')
          .join('\n') || undefined

  return h(
    'div',
    { className: 'dsh-perfmon-root' },
    failed
      ? h(
          'div',
          { className: 'dsh-perfmon-notice' },
          h('div', null, `${t('errorTitle')}: ${error ?? ''}`),
          h(
            'button',
            { type: 'button', className: 'dsh-perfmon-action', onClick: refresh, style: { marginBlockStart: '6px' } },
            t('retry'),
          ),
        )
      : null,
    status === 'loading' && reading === undefined
      ? h('div', { className: 'dsh-perfmon-empty' }, t('loading'))
      : null,
    reading === undefined
      ? null
      : h(GaugePanel, {
          reading,
          t,
          sessionId: activeSessionId,
          measure: {
            running: reading?.disk?.status === 'scanning',
            onStart: () => setMeasure(true),
            onStop: () => setMeasure(false),
          },
        }),
    // The temperature card, directly under the resource card. It renders from the
    // same reading but refreshes on the host's own calmer cadence, so the numbers
    // here can be older than the gauges above — which the card says by naming its
    // source.
    reading === undefined ? null : h(TemperaturePanel, { reading, t }),
    reading === undefined ? null : h(ProcessPanel, { reading, sort, onSortChange: setSort, t }),
    h(
      'div',
      { className: 'dsh-perfmon-foot' },
      // The warnings used to be a card of their own, which cost a lot of height
      // for a list that is empty on a healthy host. They are still the only
      // place a global reason lives ("PowerShell is missing", which is why every
      // figure above is a dash), so they ride the footer as a tooltip: nothing
      // is lost, and a healthy panel shows no trace of them.
      h(
        'span',
        { title: warningText === '' ? undefined : warningText },
        t('updatedAt', { time: formatClock(reading?.window?.at) }),
      ),
      h('span', null, t('autoRefresh', { seconds: Math.round(intervalMs / 1000) })),
      status === 'stale' && error !== undefined ? h('span', null, `${t('errorTitle')}: ${error}`) : null,
      // The keep-awake toggle, sitting next to the refresh button and pushing
      // it to the right edge: these two are the footer's actions, the text to
      // their left is the footer's status. When the feature is off (awake is
      // null) the button is not rendered at all, and the spacer moves back to
      // the refresh button so the layout stays as it was.
      awake === null
        ? null
        : h(
            'button',
            {
              type: 'button',
              className: `dsh-perfmon-action dsh-perfmon-awake${awake.active === true ? ' dsh-perfmon-awakeOn' : ''} dsh-perfmon-footSpacer`,
              disabled: awake.supported !== true,
              title: awakeTitle,
              onClick: toggleAwake,
            },
            awake.active === true ? t('awakeActive') : t('awakeStart'),
          ),
      h(
        'button',
        {
          type: 'button',
          className: awake === null ? 'dsh-perfmon-action dsh-perfmon-footSpacer' : 'dsh-perfmon-action',
          onClick: refresh,
        },
        t('refresh'),
      ),
    ),
  )
}
