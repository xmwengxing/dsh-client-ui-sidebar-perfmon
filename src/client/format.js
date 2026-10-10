/**
 * Display formatters for the perfmon panel.
 *
 * Every formatter tolerates the `null` sentinel the host uses for "this reading
 * has no meaning yet" (a process first seen in the current window), so a missing
 * measurement renders as an em dash rather than as a fabricated zero.
 *
 * @module dsh-client-ui-sidebar-perfmon/format
 */

/** Placeholder for a measurement the host could not produce. */
export const EMPTY = '—'

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

/**
 * Format a byte count with a binary-prefix scale and one decimal place.
 * @param {number | null | undefined} bytes - the value.
 * @param {string} [empty] - text for a missing value.
 * @returns {string} a short human-readable size.
 */
export function formatBytes(bytes, empty = EMPTY) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return empty
  if (bytes < 1024) return `${String(Math.round(bytes))} B`
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${BYTE_UNITS[unit]}`
}

/**
 * Format a byte count compactly for a one-line readout, using the same binary
 * prefixes as `formatBytes` but omitting the space before the unit.
 * @param {number | null | undefined} bytes - the value.
 * @param {string} [empty] - text for a missing value.
 * @returns {string} a short value such as `7.8GB`.
 */
export function formatBytesCompact(bytes, empty = EMPTY) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return empty
  if (bytes < 1024) return `${String(Math.round(bytes))}B`
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)}${BYTE_UNITS[unit]}`
}

/**
 * Format a percentage for the gauges and rows.
 * @param {number | null | undefined} value - the percentage.
 * @param {string} [empty] - text for a missing value.
 * @returns {string} one decimal place, or the empty text.
 */
export function formatPercent(value, empty = EMPTY) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return empty
  return `${value.toFixed(1)}%`
}

/**
 * Format a share of a total for a table cell.
 *
 * Whole percent only: this figures sits beside a byte count in a fixed-width
 * column, and the tenth of a percent it would cost is not worth the column width
 * — the bar under the cell carries the finer reading anyway.
 * @param {number | null | undefined} value - the percentage.
 * @param {string} [empty] - text for a missing value.
 * @returns {string} a whole-percent string, or the empty text.
 */
export function formatShare(value, empty = EMPTY) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return empty
  return `${String(Math.round(value))}%`
}

/**
 * Format a duration in seconds as an uptime phrase.
 * @param {number | null | undefined} seconds - the duration.
 * @returns {string} a compact duration such as `3天 4小时`.
 */
export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return EMPTY
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${String(days)}d ${String(hours)}h`
  if (hours > 0) return `${String(hours)}h ${String(minutes)}m`
  return `${String(minutes)}m`
}

/**
 * Format a clock time for the "last updated" line.
 * @param {number | null | undefined} timestamp - epoch milliseconds.
 * @returns {string} local wall-clock time.
 */
export function formatClock(timestamp) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return EMPTY
  const date = new Date(timestamp)
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * Format a Celsius reading for the temperature card.
 *
 * One decimal place, because the useful resolution is a tenth of a degree — a
 * sensor reading 27.9 and one reading 28.0 are the same machine. A missing
 * reading is the em dash, never `0°C`, which would read as "freezing" rather than
 * "not measured".
 * @param {number | null | undefined} celsius - the reading.
 * @param {string} [empty] - text for a missing value.
 * @returns {string} a reading such as `47.5`, without the unit.
 */
export function formatCelsius(celsius, empty = EMPTY) {
  if (typeof celsius !== 'number' || !Number.isFinite(celsius)) return empty
  return celsius.toFixed(1)
}

/**
 * Clamp a value into the 0–100 range a bar width can use.
 * @param {number | null | undefined} value - the percentage.
 * @returns {number} a width percentage.
 */
export function barWidth(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 100)
}
