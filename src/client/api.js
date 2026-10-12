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

/** Absolute path of the host's keep-awake toggle route. */
export const AWAKE_PATH = '/api/perfmon.awake'

/**
 * POST one JSON body to a host route and unwrap its `value`.
 *
 * The transport is shared by every perfmon route: same-origin credentials, the
 * same non-cacheable JSON discipline, the same two failure shapes (a body that
 * is not JSON at all, and a well-formed reply whose `ok` is not true).
 * @param {string} path - the absolute route path.
 * @param {object} body - the JSON body to send.
 * @param {AbortSignal} [signal] - optional abort signal.
 * @returns {Promise<object>} the reply's `value`.
 * @throws {Error} when the transport fails or the host reports a failure.
 */
async function postJson(path, body, signal) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    signal,
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

/**
 * Request one snapshot from the host.
 *
 * `measure` rides the same request: `true` starts the directory scan, `false`
 * stops a running one, and `undefined` just polls. `session` names the session
 * whose workspace the start should measure — the sidebar shows sessions whose
 * home process never entered them into the host's live store, so the folder
 * cannot be derived host-side. The scan itself runs on the host across polls —
 * an ordinary poll carries no filesystem work at all.
 * @param {{sort?: string, limit?: number, measure?: boolean, session?: string, signal?: AbortSignal}} [request] - ordering, page size, the scan control, and the session to measure.
 * @returns {Promise<object>} the host's reading.
 * @throws {Error} when the transport fails or the host reports a failure.
 */
export async function fetchSnapshot(request = {}) {
  const body = { sort: request.sort, limit: request.limit }
  if (request.measure === true || request.measure === false) body.measure = request.measure
  if (typeof request.session === 'string' && request.session !== '') body.session = request.session
  return postJson(SNAPSHOT_PATH, body, request.signal)
}

/**
 * Arm or release the host's keep-awake hold.
 *
 * One click sends one request; the hold itself lives host-side in a tiny
 * holder process (see `host/keep-awake.js`), so closing this tab or losing the
 * connection does not release it — only the off click, a plugin unload, or the
 * host's own death does. That is what makes it usable as a remote "stay awake"
 * switch: the browser is on another machine, so its traffic — however often it
 * polls — can never reset the host's own idle timer.
 * @param {boolean} on - true to hold the host awake, false to release it.
 * @param {{signal?: AbortSignal}} [options] - optional abort signal.
 * @returns {Promise<object>} the resulting `{supported, active, since, reason, events}` state.
 * @throws {Error} when the transport fails or the host reports a failure.
 */
export async function setKeepAwake(on, options = {}) {
  return postJson(AWAKE_PATH, { on: on === true }, options.signal)
}
