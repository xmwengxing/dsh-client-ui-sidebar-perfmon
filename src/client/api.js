/**
 * Snapshot transport for the perfmon browser half.
 *
 * The host registers one exact route on Connection's shared, authenticated
 * `/api` channel, which is the same seam the shipped deliverables and session
 * log exports use. A same-origin `fetch()` therefore carries the browser session
 * cookie with no credential plumbing here, and the absolute path matches the
 * convention those packages follow.
 *
 * @module dsh-client-ui-sidebar-perfmon/api
 */

/** Absolute path of the host's snapshot route. */
export const SNAPSHOT_PATH = '/api/perfmon.snapshot'

/**
 * Request one snapshot from the host.
 * @param {{sort?: string, limit?: number, signal?: AbortSignal}} [request] - ordering and page size.
 * @returns {Promise<object>} the host's reading.
 * @throws {Error} when the transport fails or the host reports a failure.
 */
export async function fetchSnapshot(request = {}) {
  const response = await fetch(SNAPSHOT_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sort: request.sort, limit: request.limit }),
    credentials: 'same-origin',
    signal: request.signal,
  })
  const text = await response.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(`Unexpected response from the perfmon host route (HTTP ${String(response.status)}).`)
  }
  if (payload?.ok !== true) {
    const message = payload?.error?.message
    throw new Error(typeof message === 'string' && message !== '' ? message : `HTTP ${String(response.status)}`)
  }
  return payload.value
}
