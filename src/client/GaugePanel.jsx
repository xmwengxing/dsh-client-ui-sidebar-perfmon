/**
 * The resource-usage window: three ring gauges for CPU, memory and swap.
 *
 * Each gauge shows a percentage in the ring's middle, its name underneath, and
 * one line of supporting detail (core count, used-of-total, or the fact that the
 * host has no swap). A reading the host could not produce yet renders as an em
 * dash rather than as an empty ring, so "no measurement" never reads as "idle".
 *
 * @module dsh-client-ui-sidebar-perfmon/GaugePanel
 */

import { createElement as h } from 'react'
import { barWidth, EMPTY, formatBytes, formatDuration, formatPercent } from './format.js'

/**
 * Ring geometry.
 *
 * The hole has to fit the widest value the gauge can show: at 11px the text
 * "1024.0%" is about 40px, and the inner diameter here is
 * `(radius - stroke / 2) * 2` = 45.5px, which leaves the value clear of the ring
 * at every reading instead of drawing over it.
 */
export const GAUGE_RING = { size: 58, stroke: 4.5, radius: 25 }

/** Local alias, so the render body stays terse. */
const RING = GAUGE_RING
const CIRCUMFERENCE = 2 * Math.PI * RING.radius

/**
 * One ring gauge.
 * @param {object} props - the reading and its labels.
 * @returns {import('react').ReactNode} the gauge column.
 */
function Gauge({ label, percent, detail, tone, title }) {
  const known = typeof percent === 'number' && Number.isFinite(percent)
  const filled = known ? (barWidth(percent) / 100) * CIRCUMFERENCE : 0
  return h(
    'div',
    { className: 'dsh-perfmon-gauge', title },
    h(
      'div',
      { className: 'dsh-perfmon-gaugeRing' },
      h(
        'svg',
        { width: RING.size, height: RING.size, viewBox: `0 0 ${String(RING.size)} ${String(RING.size)}` },
        h('circle', {
          cx: RING.size / 2,
          cy: RING.size / 2,
          r: RING.radius,
          fill: 'none',
          // A border token, not a background one: the empty part of the ring has to
          // be visible, or the value reads as floating beside the arc instead of
          // sitting inside a dial.
          stroke: 'var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.34))',
          strokeWidth: RING.stroke,
        }),
        h('circle', {
          cx: RING.size / 2,
          cy: RING.size / 2,
          r: RING.radius,
          fill: 'none',
          stroke: tone,
          strokeWidth: RING.stroke,
          strokeLinecap: 'round',
          strokeDasharray: `${String(filled)} ${String(CIRCUMFERENCE)}`,
          transform: `rotate(-90 ${String(RING.size / 2)} ${String(RING.size / 2)})`,
        }),
      ),
      h('span', { className: 'dsh-perfmon-gaugeValue' }, formatPercent(percent)),
    ),
    h('span', { className: 'dsh-perfmon-gaugeLabel' }, label),
    h('span', { className: 'dsh-perfmon-gaugeDetail', title: detail }, detail),
  )
}

/**
 * Render the resource window.
 * @param {{reading: object | undefined, t: (key: string, values?: object) => string}} props - the current reading and translator.
 * @returns {import('react').ReactNode} the resource card.
 */
export function GaugePanel({ reading, t }) {
  const cpu = reading?.cpu
  const memory = reading?.memory
  const facts = reading?.facts

  // A platform without a load average (Windows) reports null, and the line simply
  // loses that half rather than showing a zero that would read as an idle machine.
  const load = Array.isArray(cpu?.loadAverage) && cpu.loadAverage.length > 0 ? cpu.loadAverage[0] : undefined
  const coreDetail = [
    facts?.coreCount === undefined ? undefined : t('cores', { count: facts.coreCount }),
    load === undefined ? undefined : `${t('load')} ${load.toFixed(2)}`,
  ]
    .filter((part) => part !== undefined)
    .join(' · ')

  const memoryDetail =
    memory == null
      ? EMPTY
      : t('usedOfTotal', { used: formatBytes(memory.used), total: formatBytes(memory.total) })
  // `cached` is absent on Windows and on macOS it means file-backed pages; when a
  // platform has no such figure the tooltip leaves it out instead of printing a dash.
  const memoryTitle =
    memory == null
      ? undefined
      : [
          t('usedOfTotal', { used: formatBytes(memory.used), total: formatBytes(memory.total) }),
          typeof memory.cached === 'number' ? t('cached', { value: formatBytes(memory.cached) }) : undefined,
          t('uptime', { value: formatDuration(facts?.uptimeSeconds) }),
        ]
          .filter((part) => part !== undefined)
          .join(' · ')

  // Three distinct states, and they must not be conflated: a host with swap, a
  // host that genuinely has none, and a host whose swap could not be read.
  const swapEnabled = memory != null && memory.swapTotal > 0
  const swapDetail =
    memory == null
      ? EMPTY
      : swapEnabled
        ? t('usedOfTotal', { used: formatBytes(memory.swapUsed), total: formatBytes(memory.swapTotal) })
        : t('swapDisabled')

  return h(
    'section',
    { className: 'dsh-perfmon-card', 'aria-label': t('resources') },
    h(
      'div',
      { className: 'dsh-perfmon-cardHead' },
      h('span', { className: 'dsh-perfmon-cardTitle' }, t('resources')),
      h(
        'span',
        {
          className: 'dsh-perfmon-cardMeta',
          title: [facts?.model, facts?.release].filter((part) => typeof part === 'string' && part !== '').join(' · '),
        },
        [
          facts?.hostname,
          facts?.platformLabel,
          facts?.arch,
          t('uptime', { value: formatDuration(facts?.uptimeSeconds) }),
        ]
          .filter((part) => typeof part === 'string' && part !== '')
          .join(' · '),
      ),
    ),
    h(
      'div',
      { className: 'dsh-perfmon-gauges' },
      h(Gauge, {
        label: t('cpu'),
        percent: cpu?.percent ?? null,
        detail: coreDetail === '' ? EMPTY : coreDetail,
        tone: 'var(--dsw-alias-brand-primary, #4f6ef7)',
        title: t('cpu'),
      }),
      h(Gauge, {
        label: t('memory'),
        percent: memory?.percent ?? null,
        detail: memoryDetail,
        tone: 'var(--dsw-alias-state-warn-primary, #d99a2b)',
        title: memoryTitle,
      }),
      h(Gauge, {
        label: t('swap'),
        percent: swapEnabled ? memory.swapPercent : null,
        detail: swapDetail,
        tone: 'var(--dsw-alias-state-business-primary, #6b7bd6)',
        title: swapDetail,
      }),
    ),
  )
}
