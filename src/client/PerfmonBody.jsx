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
import { fetchSnapshot } from './api.js'
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
 * @param {string} [props.sessionId] - the session whose workspace the meter measures.
 * @param {object} [props.ctx] - the client context, for the mounted-seat fallback.
 * @returns {import('react').ReactNode} the panel.
 */
export function PerfmonBody({ t, load = fetchSnapshot, sessionId, ctx }) {
  const [sort, setSort] = useState('cpu')
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState({ status: 'loading', reading: undefined, error: undefined, intervalMs: DEFAULT_INTERVAL_MS })
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
    // source and its own reading time.
    reading === undefined ? null : h(TemperaturePanel, { reading, t }),
    // A platform that cannot answer a field says so here rather than leaving the
    // panel silently short of a number.
    Array.isArray(reading?.warnings) && reading.warnings.length > 0
      ? h(
          'div',
          { className: 'dsh-perfmon-notice dsh-perfmon-notice--muted' },
          h('div', null, t('warnings')),
          h(
            'ul',
            { className: 'dsh-perfmon-warningList' },
            reading.warnings.map((code) =>
              h('li', { key: code }, describeWarning(t, String(code))),
            ),
          ),
        )
      : null,
    reading === undefined ? null : h(ProcessPanel, { reading, sort, onSortChange: setSort, t }),
    h(
      'div',
      { className: 'dsh-perfmon-foot' },
      h('span', null, t('updatedAt', { time: formatClock(reading?.window?.at) })),
      h('span', null, t('autoRefresh', { seconds: Math.round(intervalMs / 1000) })),
      status === 'stale' && error !== undefined ? h('span', null, `${t('errorTitle')}: ${error}`) : null,
      h(
        'button',
        {
          type: 'button',
          className: 'dsh-perfmon-action dsh-perfmon-footSpacer',
          onClick: refresh,
        },
        t('refresh'),
      ),
    ),
  )
}
