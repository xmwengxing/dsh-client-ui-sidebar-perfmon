/**
 * The process window: three sort tags over a scrollable process table.
 *
 * The tags are `CPU`, `内存` and `进程名`. Picking `CPU` or `内存` re-sorts by that
 * resource's usage, highest first — the ordering the host performs, so it ranks
 * every process on the machine and not just the rows already on screen. Picking
 * `进程名` switches to an alphabetical listing, where the filter box is what makes
 * a long list navigable.
 *
 * @module dsh-client-ui-sidebar-perfmon/ProcessPanel
 */

import { createElement as h, useMemo, useState } from 'react'
import { barWidth, EMPTY, formatBytes, formatPercent } from './format.js'
import { describeState } from './copy.js'

/** The three tags, in the order the panel shows them. */
export const SORT_TAGS = [
  { id: 'cpu', label: 'tagCpu', arrow: '↓' },
  { id: 'mem', label: 'tagMem', arrow: '↓' },
  { id: 'name', label: 'tagName', arrow: '↑' },
]

/**
 * Format one process's memory cell.
 * @param {object} process - the process row.
 * @returns {string} size plus share of total memory.
 */
function memoryCell(process) {
  const size = formatBytes(process.rssBytes)
  const share = formatPercent(process.memPercent)
  return share === EMPTY ? size : `${size} · ${share}`
}

/**
 * Render the process window.
 *
 * @param {object} props - panel state and handlers.
 * @returns {import('react').ReactNode} the process card.
 */
export function ProcessPanel({ reading, sort, onSortChange, t }) {
  const [filter, setFilter] = useState('')
  const processes = reading?.processes ?? []

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (needle === '') return processes
    return processes.filter(
      (process) =>
        process.name.toLowerCase().includes(needle) || String(process.pid).includes(needle),
    )
  }, [processes, filter])

  const total = reading?.processCount
  const meta = [
    total === undefined ? undefined : t('processCount', { count: total }),
    t('showingRows', { shown: rows.length }),
  ]
    .filter((part) => part !== undefined)
    .join(' · ')

  return h(
    'section',
    { className: 'dsh-perfmon-card dsh-perfmon-card--processes', 'aria-label': t('processes') },
    h(
      'div',
      { className: 'dsh-perfmon-cardHead' },
      h('span', { className: 'dsh-perfmon-cardTitle' }, t('processes')),
      h('span', { className: 'dsh-perfmon-cardMeta' }, meta),
    ),
    h(
      'div',
      { className: 'dsh-perfmon-tabs', role: 'group', 'aria-label': t('processes') },
      SORT_TAGS.map((tag) =>
        h(
          'button',
          {
            key: tag.id,
            type: 'button',
            className: 'dsh-perfmon-tab',
            'aria-pressed': sort === tag.id,
            title: `${t(tag.label)} · ${tag.id === 'name' ? t('sortAsc') : t('sortDesc')}`,
            onClick: () => {
              onSortChange(tag.id)
            },
          },
          t(tag.label),
          sort === tag.id ? h('span', { className: 'dsh-perfmon-tabArrow' }, tag.arrow) : null,
        ),
      ),
    ),
    h('input', {
      className: 'dsh-perfmon-filter',
      type: 'search',
      value: filter,
      placeholder: t('filterPlaceholder'),
      'aria-label': t('filterPlaceholder'),
      onChange: (event) => {
        setFilter(event.target.value)
      },
    }),
    h(
      'div',
      { className: 'dsh-perfmon-rows' },
      rows.length === 0
        ? h(
            'div',
            { className: 'dsh-perfmon-empty' },
            processes.length === 0 ? t('emptyAll') : t('empty'),
          )
        : rows.map((process) =>
            h(
              'div',
              { key: process.pid, className: 'dsh-perfmon-row' },
              h(
                'div',
                { className: 'dsh-perfmon-name' },
                h('div', { className: 'dsh-perfmon-nameText', title: process.name }, process.name),
                h(
                  'div',
                  { className: 'dsh-perfmon-nameMeta' },
                  `PID ${String(process.pid)} · ${t('threads', { count: process.threads })} · ${describeState(t, process.state)}`,
                ),
              ),
              h(
                'div',
                { className: 'dsh-perfmon-metric', title: `${t('cpu')} ${formatPercent(process.cpuPercent)}` },
                formatPercent(process.cpuPercent),
                h(
                  'div',
                  { className: 'dsh-perfmon-metricBar' },
                  h('div', {
                    className: 'dsh-perfmon-metricBarFill dsh-perfmon-cpuFill',
                    style: { inlineSize: `${String(barWidth(process.cpuPercent))}%` },
                  }),
                ),
              ),
              h(
                'div',
                { className: 'dsh-perfmon-metric', title: `${t('memory')} ${memoryCell(process)}` },
                memoryCell(process),
                h(
                  'div',
                  { className: 'dsh-perfmon-metricBar' },
                  h('div', {
                    className: 'dsh-perfmon-metricBarFill dsh-perfmon-memFill',
                    style: { inlineSize: `${String(barWidth(process.memPercent))}%` },
                  }),
                ),
              ),
            ),
          ),
    ),
  )
}
