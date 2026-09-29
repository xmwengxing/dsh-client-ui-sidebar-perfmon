/**
 * The process window: three sort tags that are also the table's column headers.
 *
 * The tags and the rows share one grid template, so each tag sits directly above
 * the column it orders — `CPU`, `内存`, `进程名`, left to right, in both the header
 * and every row. Picking a tag re-sorts through the host, which ranks every
 * process on the machine by that key rather than reordering the visible page.
 *
 * Width behaviour is deliberate. The two metric columns are sized to their widest
 * real content and never shrink, while the name column takes what is left and
 * truncates: a narrow Sidebar therefore loses process names before it loses the
 * numbers, and nothing ever overflows sideways into a horizontal scrollbar.
 *
 * @module dsh-client-ui-sidebar-perfmon/ProcessPanel
 */

import { createElement as h, useEffect, useMemo, useRef, useState } from 'react'
import { barWidth, EMPTY, formatBytes, formatPercent, formatShare } from './format.js'
import { describeState } from './copy.js'

/**
 * The three tags, in the order they appear as column headers — which is also the
 * order of the columns they head.
 */
export const SORT_TAGS = [
  { id: 'cpu', label: 'tagCpu', arrow: '↓', hint: 'sortDesc', grip: 'resizeCpu' },
  { id: 'mem', label: 'tagMem', arrow: '↓', hint: 'sortDesc', grip: 'resizeMem' },
  { id: 'name', label: 'tagName', arrow: '↑', hint: 'sortAsc' },
]

/**
 * Bounds for the two fixed tracks.
 *
 * The name column takes whatever is left, so these two are also what the drag
 * handles move. `fallback` is the width the panel ships with and the width a
 * reset returns to.
 */
export const COLUMN_LIMITS = {
  cpu: { min: 40, max: 160, fallback: 54 },
  mem: { min: 64, max: 220, fallback: 88 },
}

/** The name column never shrinks below this, so a drag cannot hide the identity. */
const NAME_FLOOR = 72

/** Where a reader's column widths are remembered, per browser. */
const WIDTH_STORAGE_KEY = 'dsh-perfmon.columns.v1'

/**
 * Clamp one column width into its bounds.
 * @param {'cpu' | 'mem'} which - the column.
 * @param {unknown} value - a candidate width.
 * @returns {number} a usable width in pixels.
 */
export function clampColumnWidth(which, value) {
  const { min, max, fallback } = COLUMN_LIMITS[which]
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(Math.round(number), min), max)
}

/** The widths the panel starts from. */
function defaultWidths() {
  return { cpu: COLUMN_LIMITS.cpu.fallback, mem: COLUMN_LIMITS.mem.fallback }
}

/**
 * Read a reader's remembered widths.
 *
 * Storage is optional and can throw (private modes, a policy-disabled origin), so
 * a failure returns the defaults rather than breaking the panel.
 * @returns {{cpu: number, mem: number}} the widths to start from.
 */
export function readStoredWidths() {
  try {
    const raw = globalThis.localStorage?.getItem(WIDTH_STORAGE_KEY)
    if (raw === null || raw === undefined) return defaultWidths()
    const parsed = JSON.parse(raw)
    return { cpu: clampColumnWidth('cpu', parsed?.cpu), mem: clampColumnWidth('mem', parsed?.mem) }
  } catch {
    return defaultWidths()
  }
}

/**
 * Remember the widths for the next visit.
 * @param {{cpu: number, mem: number}} widths - the current widths.
 */
export function storeWidths(widths) {
  try {
    globalThis.localStorage?.setItem(WIDTH_STORAGE_KEY, JSON.stringify(widths))
  } catch {
    // A browser that refuses storage still gets working drag handles.
  }
}

/**
 * One sortable column header.
 *
 * The button's own padding is cancelled by a negative margin so its text edge
 * lines up with the numbers beneath it: a header that is merely centered over its
 * column reads as decoration, while an aligned one reads as a column label.
 * @param {object} props - the tag, its active state, and the handlers.
 * @returns {import('react').ReactNode} the header cell.
 */
function ColumnHeader({ tag, active, width, onSortChange, onGripPointerDown, onGripKeyDown, onGripReset, t }) {
  const right = tag.id !== 'name'
  const grip = tag.grip === undefined ? null : COLUMN_LIMITS[tag.id]
  return h(
    'div',
    {
      className: `dsh-perfmon-column dsh-perfmon-column--${right ? 'end' : 'start'}`,
      'data-column': tag.id,
      role: 'columnheader',
    },
    h(
      'button',
      {
        type: 'button',
        className: 'dsh-perfmon-tab',
        'aria-pressed': active,
        title: `${t(tag.label)} · ${t(tag.hint)}`,
        onClick: () => {
          onSortChange(tag.id)
        },
      },
      t(tag.label),
      active ? h('span', { className: 'dsh-perfmon-tabArrow' }, tag.arrow) : null,
    ),
    // The divider doubles as the handle: drag it to widen the column it closes,
    // double-click or Home to return it to the shipped width, and the arrow keys
    // move it for anyone not using a pointer.
    grip === null
      ? null
      : h('span', {
          className: 'dsh-perfmon-columnGrip',
          role: 'separator',
          'aria-orientation': 'vertical',
          'aria-label': t(tag.grip),
          'aria-valuenow': width,
          'aria-valuemin': grip.min,
          'aria-valuemax': grip.max,
          title: t('resizeHint'),
          tabIndex: 0,
          'data-grip': tag.id,
          onPointerDown: (event) => {
            onGripPointerDown(tag.id, event)
          },
          onDoubleClick: () => {
            onGripReset(tag.id)
          },
          onKeyDown: (event) => {
            onGripKeyDown(tag.id, event)
          },
        }),
  )
}

/**
 * The search control's magnifier, drawn in `currentColor` so the field tints it
 * from its own text colour rather than carrying a literal.
 * @returns {import('react').ReactNode} a decorative glyph.
 */
function SearchIcon() {
  return h(
    'svg',
    { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
    h('circle', { cx: 7, cy: 7, r: 4.25, stroke: 'currentColor', strokeWidth: 1.4 }),
    h('path', { d: 'M10.2 10.2 13.5 13.5', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
  )
}

/**
 * The clear control shown once the field has content.
 * @returns {import('react').ReactNode} a decorative glyph.
 */
function ClearIcon() {
  return h(
    'svg',
    { width: 10, height: 10, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
    h('path', { d: 'M4 4 12 12M12 4 4 12', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
  )
}

/** One cell showing a percentage with a proportional bar under it. */
function MetricCell({ column, value, percent, tone, title }) {
  return h(
    'div',
    { className: 'dsh-perfmon-metric', 'data-column': column, title },
    h(
      'div',
      { className: 'dsh-perfmon-metricLine' },
      h('span', { className: 'dsh-perfmon-metricValue' }, value),
    ),
    h(
      'div',
      { className: 'dsh-perfmon-metricBar' },
      h('div', {
        className: `dsh-perfmon-metricBarFill ${tone}`,
        style: { inlineSize: `${String(barWidth(percent))}%` },
      }),
    ),
  )
}

/**
 * Render the process window.
 *
 * @param {object} props - panel state and handlers.
 * @returns {import('react').ReactNode} the process card.
 */
export function ProcessPanel({ reading, sort, onSortChange, t }) {
  const [filter, setFilter] = useState('')
  const [widths, setWidths] = useState(readStoredWidths)
  const processes = reading?.processes ?? []

  // The drag listener lives outside React's render, so it reads the latest widths
  // through a ref rather than capturing the ones in scope when it was installed.
  const widthsRef = useRef(widths)
  widthsRef.current = widths

  /** Clamp a width against both its own bounds and the room the card has left. */
  const fitWidth = (which, candidate, containerWidth) => {
    const other = which === 'cpu' ? widthsRef.current.mem : widthsRef.current.cpu
    const clamped = clampColumnWidth(which, candidate)
    if (!Number.isFinite(containerWidth) || containerWidth <= 0) return clamped
    // Two gutters and the card's own padding are not the columns' to spend.
    const room = containerWidth - other - NAME_FLOOR - 48
    return Math.max(COLUMN_LIMITS[which].min, Math.min(clamped, Math.floor(room)))
  }

  const setColumnWidth = (which, candidate, containerWidth) => {
    const next = fitWidth(which, candidate, containerWidth)
    setWidths((current) => (current[which] === next ? current : { ...current, [which]: next }))
  }

  const resetColumn = (which) => {
    setWidths((current) => ({ ...current, [which]: COLUMN_LIMITS[which].fallback }))
  }

  const onGripPointerDown = (which, event) => {
    event.preventDefault()
    event.stopPropagation()
    const card = event.currentTarget.closest('.dsh-perfmon-card--processes')
    const containerWidth = card === null ? undefined : card.clientWidth
    const startX = event.clientX
    const startWidth = widthsRef.current[which]
    event.currentTarget.setPointerCapture?.(event.pointerId)

    const onMove = (moveEvent) => {
      setColumnWidth(which, startWidth + (moveEvent.clientX - startX), containerWidth)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onGripKeyDown = (which, event) => {
    const step = event.shiftKey ? 16 : 4
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setColumnWidth(which, widthsRef.current[which] - step)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setColumnWidth(which, widthsRef.current[which] + step)
    } else if (event.key === 'Home') {
      event.preventDefault()
      resetColumn(which)
    }
  }

  // Remember whatever the reader settled on — dragged, arrow-keyed or reset.
  // The first render is skipped so mounting cannot overwrite a stored pair with
  // the defaults, and a drag's many intermediate values cost one tiny write each.
  const settled = useRef(false)
  useEffect(() => {
    if (!settled.current) {
      settled.current = true
      return
    }
    storeWidths(widths)
  }, [widths])

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (needle === '') return processes
    return processes.filter(
      (process) => process.name.toLowerCase().includes(needle) || String(process.pid).includes(needle),
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
    {
      className: 'dsh-perfmon-card dsh-perfmon-card--processes',
      'aria-label': t('processes'),
      style: {
        '--perfmon-cpu-column': `${String(widths.cpu)}px`,
        '--perfmon-mem-column': `${String(widths.mem)}px`,
      },
    },
    h(
      'div',
      { className: 'dsh-perfmon-cardHead' },
      h('span', { className: 'dsh-perfmon-cardTitle' }, t('processes')),
      h('span', { className: 'dsh-perfmon-cardMeta' }, meta),
    ),
    h(
      'div',
      { className: 'dsh-perfmon-columns', role: 'row', 'aria-label': t('processes') },
      SORT_TAGS.map((tag) =>
        h(ColumnHeader, {
          key: tag.id,
          tag,
          active: sort === tag.id,
          width: tag.id === 'name' ? undefined : widths[tag.id],
          onSortChange,
          onGripPointerDown,
          onGripKeyDown,
          onGripReset: resetColumn,
          t,
        }),
      ),
    ),
    // A bordered field with its own magnifier and clear control. The previous
    // version was a bare underlined input, which read as a static label — the
    // filter existed but nobody could see it was one.
    h(
      'div',
      { className: 'dsh-perfmon-search' },
      h('span', { className: 'dsh-perfmon-searchIcon' }, h(SearchIcon, null)),
      h('input', {
        className: 'dsh-perfmon-filter',
        type: 'search',
        value: filter,
        placeholder: t('filterPlaceholder'),
        'aria-label': t('filterPlaceholder'),
        onChange: (event) => {
          setFilter(event.target.value)
        },
        onKeyDown: (event) => {
          if (event.key === 'Escape' && filter !== '') {
            event.preventDefault()
            setFilter('')
          }
        },
      }),
      filter === ''
        ? null
        : h(
            'button',
            {
              type: 'button',
              className: 'dsh-perfmon-searchClear',
              'aria-label': t('clearFilter'),
              title: t('clearFilter'),
              onClick: () => {
                setFilter('')
              },
            },
            h(ClearIcon, null),
          ),
    ),
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
              { key: process.pid, className: 'dsh-perfmon-row', role: 'row' },
              h(MetricCell, {
                column: 'cpu',
                value: formatPercent(process.cpuPercent),
                percent: process.cpuPercent,
                tone: 'dsh-perfmon-cpuFill',
                title: `${t('cpu')} ${formatPercent(process.cpuPercent)}`,
              }),
              h(
                'div',
                {
                  className: 'dsh-perfmon-metric',
                  'data-column': 'mem',
                  title: `${t('memory')} ${formatBytes(process.rssBytes)} · ${formatPercent(process.memPercent)}`,
                },
                h(
                  'div',
                  { className: 'dsh-perfmon-metricLine' },
                  h('span', { className: 'dsh-perfmon-metricValue' }, formatBytes(process.rssBytes)),
                  // The share is the first thing to go when the column is tight:
                  // the bar still carries it, and the exact figure stays in the tooltip.
                  h('span', { className: 'dsh-perfmon-metricShare' }, ` · ${formatShare(process.memPercent)}`),
                ),
                h(
                  'div',
                  { className: 'dsh-perfmon-metricBar' },
                  h('div', {
                    className: 'dsh-perfmon-metricBarFill dsh-perfmon-memFill',
                    style: { inlineSize: `${String(barWidth(process.memPercent))}%` },
                  }),
                ),
              ),
              h(
                'div',
                { className: 'dsh-perfmon-name', 'data-column': 'name' },
                h('div', { className: 'dsh-perfmon-nameText', title: process.name }, process.name),
                h(
                  'div',
                  { className: 'dsh-perfmon-nameMeta' },
                  // Windows reports neither a thread count nor a state; the line
                  // keeps only what the platform actually answered.
                  [
                    `PID ${String(process.pid)}`,
                    typeof process.threads === 'number' ? t('threads', { count: process.threads }) : undefined,
                    process.state === null || process.state === undefined
                      ? undefined
                      : describeState(t, process.state),
                  ]
                    .filter((part) => part !== undefined)
                    .join(' · '),
                ),
              ),
            ),
          ),
    ),
  )
}
