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
import { barWidth, EMPTY, formatBytes, formatBytesCompact, formatDuration, formatPercent, formatShare } from './format.js'
import { describeWarning } from './copy.js'

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
 * The project-directory line.
 *
 * It is a row of facts, not a ring: there is no meaningful "percent used" for a
 * folder, so a fourth gauge would either be decorative or invented. The scan is
 * manual: the row carries one button that starts a scan over the viewed
 * session's workspace folder and turns into a stop button while it runs. A
 * folder the size of a home directory is far too heavy to walk implicitly, so
 * until the user asks, the row says exactly that — and a finished reading stays
 * until the next scan replaces it. The bilingual `warnings` list below the card
 * says why a figure is partial or absent.
 *
 * @param {{disk: object | undefined, warnings: string[] | undefined, sessionId: string | undefined, measure: {running: boolean, onStart: Function, onStop: Function}, t: Function}} props - the disk reading, scan control, and translator.
 * @returns {import('react').ReactNode} the row, or nothing when the line is hidden by config.
 */
export function DiskPanel({ disk, warnings = [], sessionId, measure, t }) {
  if (disk == null) return null
  if (disk.status === 'hidden') return null
  const running = measure?.running === true
  const known = typeof disk.projectBytes === 'number' && Number.isFinite(disk.projectBytes)
  const aborted = Array.isArray(disk.warnings) && disk.warnings.includes('project-dir-aborted')
  const warning = (Array.isArray(disk.warnings) && disk.warnings.find((code) => code !== 'project-dir-aborted')) || warnings[0]
  const note = typeof warning === 'string' ? describeWarning(t, warning) : undefined
  const abortNote = aborted ? t('projectPartial') : undefined
  const detail = known
    ? t('projectUsage', {
        size: formatBytes(disk.projectBytes),
        count: String(disk.projectEntries ?? 0),
      })
    : running
      ? t('measuring')
      : (note ?? EMPTY)
  const folders = Array.isArray(disk.projectDirs) ? disk.projectDirs : []
  const dirCount = folders.length > 0 ? folders.length : undefined
  const dirNames = folders.map((entry) => entry?.dir).filter((dir) => typeof dir === 'string')
  const dropped =
    known && typeof disk.droppedDirCount === 'number' && disk.droppedDirCount > 0
      ? t('projectDropped', { count: String(disk.droppedDirCount) })
      : undefined
  const tail = known
    ? [
        dirCount === undefined ? undefined : t('projectDirCount', { count: String(dirCount) }),
        disk.projectTruncated === true ? t('projectTruncated') : undefined,
        abortNote,
        dropped,
        // Without a dropped count, a single-folder reading's own first warning
        // (partial, skipped) still belongs beside the figure it qualifies.
        dirCount === undefined && dropped === undefined ? (note ?? '') : undefined,
      ]
        .filter((part) => part !== undefined)
        .filter((part) => part !== '')
        .map((part) => ` · ${part}`)
        .join('')
    : running
      ? ` · ${t('measuringHint')}`
      : ''
  // The tooltip carries the whole answer: every folder with its own size.
  const titleParts = dirNames.length > 0 ? dirNames : []
  const titleDetail = known ? [detail, note].filter((part) => part !== undefined).join(' · ') : note
  const title = [...titleParts, titleDetail].filter((part) => part !== undefined).join('\n')
  return h(
    'div',
    { className: 'dsh-perfmon-disk', title },
    h('span', { className: 'dsh-perfmon-diskLabel' }, t('projectDir')),
    running
      ? h('span', { className: 'dsh-perfmon-diskSpinner', role: 'status', 'aria-label': t('measuring') })
      : h('span', { className: 'dsh-perfmon-diskValue' }, known ? formatBytes(disk.projectBytes) : EMPTY),
    h('span', { className: 'dsh-perfmon-diskDetail' }, detail + tail),
    h(
      'button',
      {
        type: 'button',
        className: 'dsh-perfmon-diskAction',
        onClick: running ? measure?.onStop : measure?.onStart,
        title: running ? t('measureStop') : sessionId === undefined ? t('measureStart') : t('measureStartSession', { id: sessionId }),
      },
      running ? t('measureStop') : t('measureStart'),
    ),
  )
}

/**
 * Render the one-line GPU readout under the gauges.
 *
 * The row is deliberately one place, not an inner/outer circle: there is no
 * shared meaningful percentage between a clock (MHz against a moving boost
 * target) and memory (bytes against fixed VRAM). Two concentric arcs would imply
 * one progress scale where there is none. A compact two-column readout is honest
 * and costs only one resource-card line.
 * @param {{clock: string, vram: string, title?: string, hidden?: boolean, t: Function}} props - formatted readings.
 * @returns {import('react').ReactNode} the row, or nothing when hidden.
 */
export function GpuPanel({ clock, vram, title, hidden, t }) {
  if (hidden) return null
  return h(
    'div',
    { className: 'dsh-perfmon-gpuRow', title },
    h('span', { className: 'dsh-perfmon-gpuLabel' }, t('gpuLine')),
    h(
      'span',
      { className: 'dsh-perfmon-gpuStats' },
      h('span', { className: 'dsh-perfmon-gpuClock' }, clock),
      h('span', { className: 'dsh-perfmon-gpuVram' }, vram),
    ),
  )
}

/**
 * Render the resource window.
 * @param {{reading: object | undefined, measure: object, t: (key: string, values?: object) => string}} props - the current reading, the scan control, and translator.
 * @returns {import('react').ReactNode} the resource card.
 */
export function GaugePanel(props) {
  const reading = props.reading
  const t = props.t
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

  const gpu = reading?.gpu
  const gpuClock = typeof gpu?.clockMhz === 'number' && Number.isFinite(gpu.clockMhz)
    ? t('gpuClock', { clock: String(Math.round(gpu.clockMhz)) })
    : t('gpuClockUnavailable')
  const gpuVram = typeof gpu?.memoryUsedBytes === 'number' && typeof gpu?.memoryTotalBytes === 'number'
    ? t('gpuVram', {
        used: formatBytesCompact(gpu.memoryUsedBytes),
        total: formatBytesCompact(gpu.memoryTotalBytes),
      })
    : t('gpuVramUnavailable')
  const gpuClockTitle =
    typeof gpu?.clockMhz === 'number' && Number.isFinite(gpu.clockMhz)
      ? `${gpuClock}${typeof gpu.clockMaxMhz === 'number' ? ` · max ${String(Math.round(gpu.clockMaxMhz))} MHz` : ''}`
      : t('gpuClockUnavailable')
  const gpuVramTitle =
    typeof gpu?.memoryUsedBytes === 'number' && typeof gpu?.memoryTotalBytes === 'number'
      ? `${formatBytes(gpu.memoryUsedBytes)} / ${formatBytes(gpu.memoryTotalBytes)}${typeof gpu.memoryPercent === 'number' ? ` · ${formatShare(gpu.memoryPercent)}` : ''}`
      : t('gpuVramUnavailable')
  const gpuName = typeof gpu?.name === 'string' && gpu.name !== '' ? gpu.name : undefined
  const gpuTitle = [gpuName, gpuClockTitle, gpuVramTitle, gpu?.source]
    .filter((part) => typeof part === 'string' && part !== '')
    .join('\n')
  const gpuHidden = gpu?.status === 'hidden'

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
    h(DiskPanel, {
      disk: reading?.disk,
      warnings: reading?.warnings,
      measure: props.measure,
      t,
    }),
    h(GpuPanel, { gpu, clock: gpuClock, vram: gpuVram, title: gpuTitle, hidden: gpu?.status === 'hidden', t }),
  )
}
