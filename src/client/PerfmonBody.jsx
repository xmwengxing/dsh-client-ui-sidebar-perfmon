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

import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'
import { fetchSnapshot } from './api.js'
import { GaugePanel } from './GaugePanel.jsx'
import { ProcessPanel } from './ProcessPanel.jsx'
import { formatClock } from './format.js'

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
 * @param {object} props - the injected face.
 * @param {(key: string, values?: object) => string} props.t - translator.
 * @param {(request: object) => Promise<object>} [props.load] - snapshot loader, injectable for tests.
 * @returns {import('react').ReactNode} the panel.
 */
export function PerfmonBody({ t, load = fetchSnapshot }) {
  const [sort, setSort] = useState('cpu')
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState({ status: 'loading', reading: undefined, error: undefined, intervalMs: DEFAULT_INTERVAL_MS })
  const aliveRef = useRef(true)

  const sortRef = useRef(sort)
  sortRef.current = sort

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
      try {
        const reading = await load({
          sort: requestedSort,
          limit: requestedSort === 'name' ? NAME_SORT_LIMIT : DEFAULT_LIMIT,
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
    reading === undefined ? null : h(GaugePanel, { reading, t }),
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
