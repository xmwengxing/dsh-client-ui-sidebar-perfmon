/**
 * perfmon host half: one authenticated `/api` route serving live host metrics.
 *
 * Why an exact Connection Fetch route rather than the generic RPC channel:
 * `ctx.connection.fetch.register()` is the documented seam for a route that
 * belongs to the shared authenticated `/api` transport (`dsh-client-ui-deliverables`,
 * `dsh-session-log-export` and `dsh-client-file-upload` all use it), and it keeps
 * the plugin free of any browser-visible channel naming. Because the route is
 * composed into Connection's shared handler, it inherits the same Host/Origin
 * fence and browser-session authentication as the rest of the GUI: the browser
 * reaches it with a same-origin `fetch()` and no extra credential handling.
 *
 * The route is registered inside the caller's own Cordis fiber, so unloading the
 * plugin removes it — the effect owns the lifetime, as everywhere else in dsh.
 *
 * @module @xmwengxing/dsh-client-ui-sidebar-perfmon
 */

import { createSampler } from './metrics.js'
import { selectReader } from './readers/index.js'

/** Stable Cordis plugin name. */
export const name = 'dsh-perfmon'

/** Services required before the route can be mounted. */
export const inject = ['connection']

/** Absolute path of the snapshot route on the shared `/api` channel. */
export const SNAPSHOT_PATH = '/api/perfmon.snapshot'

/**
 * Polling cadence per platform.
 *
 * Linux reads `/proc` in-process, so it can afford to be quick. macOS and Windows
 * spawn a helper per sample, and a panel left open all day should not cost a
 * process a second on a laptop — so those default to a calmer cadence. Each value
 * is a default, not a limit: `refreshIntervalMs` overrides it.
 */
const DEFAULT_REFRESH_MS = { linux: 2000, darwin: 3000, win32: 4000 }

/** Every other default, kept in one place so the README cannot drift. */
const DEFAULTS = {
  /** Rows served per response; the panel asks for fewer when it wants fewer. */
  processLimit: 60,
  /** Consecutive polls inside this window share one reading. */
  cacheMillis: 800,
  /** Length of the priming double sample taken on the first request. */
  sampleMillis: 150,
}

/**
 * Resolve user configuration defensively.
 *
 * The row may be configured from a profile patch, so every field is optional and
 * an out-of-range value falls back to the default instead of failing the boot.
 * @param {object} [config] - the row's `config` block.
 * @param {string} platform - the reporting platform.
 * @returns {{refreshIntervalMs: number, processLimit: number, cacheMillis: number, sampleMillis: number}} resolved options.
 */
export function resolveConfig(config, platform) {
  const source = config ?? {}
  const positive = (value, fallback, min, max) => {
    const number = Number(value)
    if (!Number.isFinite(number)) return fallback
    return Math.min(Math.max(Math.trunc(number), min), max)
  }
  return {
    refreshIntervalMs: positive(source.refreshIntervalMs, DEFAULT_REFRESH_MS[platform] ?? 4000, 500, 60000),
    processLimit: positive(source.processLimit, DEFAULTS.processLimit, 5, 500),
    cacheMillis: positive(source.cacheMillis, DEFAULTS.cacheMillis, 0, 10000),
    sampleMillis: positive(source.sampleMillis, DEFAULTS.sampleMillis, 0, 2000),
  }
}

/** JSON response helper: this route is machine-read and never cached. */
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/**
 * Mount the snapshot route on the shared authenticated `/api` channel.
 *
 * Every platform gets a reading: a dedicated reader for Linux, macOS and Windows,
 * and a `node:os`-only fallback elsewhere that answers what the standard library
 * can and marks the rest unavailable. Nothing here reports a fabricated zero, so
 * there is no "unsupported platform" failure to return — a platform that cannot
 * answer a field says so in `warnings` and leaves the field `null`.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - host plugin context carrying `connection`.
 * @param {object} [config] - the row's `config` block.
 * @returns {Promise<() => Promise<void>> | (() => Promise<void>)} the route disposer.
 */
export function apply(ctx, config) {
  const platform = process.platform
  const options = resolveConfig(config, platform)
  const reader = selectReader(platform)
  const sampler = createSampler({ ...options, reader })
  // Which reader is in use is published in every response (`reader`) and in the
  // panel header (the platform label) rather than logged: those are observable in
  // a running deployment, and a boot line here is not.

  // Registered before the route so that teardown, which unwinds effects in
  // reverse, drains an in-flight sample after the route stops accepting
  // requests. The route's own registration is already owned by this fiber.
  ctx.effect(() => () => sampler.pending(), 'perfmon: drain in-flight sample')

  return ctx.connection.fetch.register({
    path: SNAPSHOT_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      let body = {}
      try {
        const text = await request.text()
        if (text.trim() !== '') body = JSON.parse(text)
      } catch {
        return json({ ok: false, error: { code: 'bad-request', message: 'Request body is not JSON.' } }, 400)
      }
      try {
        const reading = await sampler.snapshot({
          sort: body?.sort,
          limit: body?.limit ?? options.processLimit,
        })
        return json({
          ok: true,
          value: {
            ...reading,
            refreshIntervalMs: options.refreshIntervalMs,
          },
        })
      } catch (error) {
        ctx.logger?.warn?.('perfmon: snapshot failed: %s', error?.message ?? String(error))
        return json({
          ok: false,
          error: { code: 'internal', message: `Could not read host metrics: ${error?.message ?? String(error)}` },
        }, 500)
      }
    },
  })
}
