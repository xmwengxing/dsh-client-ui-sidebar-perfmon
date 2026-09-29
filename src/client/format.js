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
 * Clamp a value into the 0–100 range a bar width can use.
 * @param {number | null | undefined} value - the percentage.
 * @returns {number} a width percentage.
 */
export function barWidth(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 100)
}
