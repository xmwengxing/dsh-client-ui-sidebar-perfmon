/**
 * perfmon host half: one authenticated `/api` route serving live host metrics.
 *
 * The route carries two readings in one response: the live host sample (CPU /
 * memory / swap / processes, differenced per request) and the project-directory
 * reading (`disk`). The directory scan is *manual*: the panel asks for it with
 * `measure: true` on the same route, it covers only the folders of the sessions
 * open at that moment, and it can be stopped with `measure: false` — a walk
 * over a home directory is far too heavy to run implicitly, let alone every
 * two seconds. The poll itself reads only the scan's stored state, which costs
 * no filesystem work at all. See `du.js` for the scan controller.
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

import { createScanController, DU_WARNINGS, resolveProjectDir } from './du.js'
import { createSampler } from './metrics.js'
import { selectReader } from './readers/index.js'
import { createTemperatureProbe, HIDDEN_TEMPERATURE } from './temperature/index.js'

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
  /** Entries one folder's scan may examine before it reports `truncated`. */
  projectDirEntryBudget: 50_000,
  /** Distinct folders one scan may cover; the rest are counted, not walked. */
  projectDirMaxDirs: 12,
  /**
   * How long one temperature reading is reused.
   *
   * Much calmer than the metrics poll on purpose: a temperature is an absolute
   * reading rather than a counter, and on Windows it costs a PowerShell call of a
   * second or more (the storage reliability counters dominate). Fifteen seconds
   * tracks a thermal trend perfectly well at a fraction of the cost.
   */
  temperatureIntervalMs: 15_000,
}

/**
 * Resolve user configuration defensively.
 *
 * The row may be configured from a profile patch, so every field is optional and
 * an out-of-range value falls back to the default instead of failing the boot.
 * `projectDir` pins one folder for the manual scan; `''` or `false` removes the
 * line entirely; unset follows the open sessions.
 * @param {object} [config] - the row's `config` block.
 * @param {string} platform - the reporting platform.
 * @returns {{refreshIntervalMs: number, processLimit: number, cacheMillis: number, sampleMillis: number, projectDir: string | null, projectDirHidden: boolean, projectDirEntryBudget: number, projectDirMaxDirs: number, temperatureHidden: boolean, temperatureIntervalMs: number}} resolved options.
 */
export function resolveConfig(config, platform) {
  const source = config ?? {}
  const positive = (value, fallback, min, max) => {
    const number = Number(value)
    if (!Number.isFinite(number)) return fallback
    return Math.min(Math.max(Math.trunc(number), min), max)
  }
  const projectDirConfig =
    typeof source.projectDir === 'string' || typeof source.projectDir === 'boolean'
      ? source.projectDir
      : null
  // `temperature: false` (or `''`) removes the card entirely, the same way the
  // project-directory line is hidden — a machine whose sensors cost a helper call
  // may reasonably want the feature off rather than merely calmer.
  const temperatureConfig = source.temperature
  return {
    refreshIntervalMs: positive(source.refreshIntervalMs, DEFAULT_REFRESH_MS[platform] ?? 4000, 500, 60000),
    processLimit: positive(source.processLimit, DEFAULTS.processLimit, 5, 500),
    cacheMillis: positive(source.cacheMillis, DEFAULTS.cacheMillis, 0, 10000),
    sampleMillis: positive(source.sampleMillis, DEFAULTS.sampleMillis, 0, 2000),
    projectDir: resolveProjectDir(projectDirConfig),
    projectDirHidden: projectDirConfig === '' || projectDirConfig === false,
    projectDirEntryBudget: positive(source.projectDirEntryBudget, DEFAULTS.projectDirEntryBudget, 100, 1_000_000),
    projectDirMaxDirs: positive(source.projectDirMaxDirs, DEFAULTS.projectDirMaxDirs, 1, 100),
    temperatureHidden: temperatureConfig === false || temperatureConfig === '',
    temperatureIntervalMs: positive(
      source.temperatureIntervalMs,
      DEFAULTS.temperatureIntervalMs,
      2000,
      600000,
    ),
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
 * The disk reading when the line is hidden by config.
 */
const hiddenDisk = {
  projectDir: null,
  projectDirs: [],
  projectBytes: null,
  projectEntries: 0,
  projectTruncated: false,
  droppedDirCount: 0,
  warnings: ['project-dir-hidden'],
  status: 'hidden',
}

/** The disk reading when the scan cannot start because no folder was resolved. */
function noCwdDisk(detail = '') {
  return {
    projectDir: null,
    projectDirs: [],
    projectBytes: null,
    projectEntries: 0,
    projectTruncated: false,
    droppedDirCount: 0,
    warnings: [detail === '' ? DU_WARNINGS.noRoot : `${DU_WARNINGS.sessionUnresolved}: ${detail}`],
    status: 'idle',
  }
}

/**
 * Resolve one session id to its workspace folder.
 *
 * The live store answers when the named session is open in this process; the
 * session-query service answers for a session the GUI is only viewing (the
 * sidebar lists cold sessions too, and those never enter this process's
 * store). Both references are optional — a deployment without them yields
 * `undefined`, and the panel explains itself rather than scanning the wrong
 * folder.
 * @param {{sessions?: object, sessionQuery?: object}} services - the captured session services.
 * @param {unknown} id - the session id the browser sent, if it sent one.
 * @returns {Promise<string | undefined>} the session's workspace folder.
 */
export async function resolveSessionCwd(services, id) {
  if (typeof id !== 'string' || id === '') return undefined
  try {
    const cwd = services?.sessions?.get?.(id)?.header?.cwd
    if (typeof cwd === 'string' && cwd !== '') return cwd
  } catch {
    // fall through to the cold read
  }
  try {
    const query = services?.sessionQuery
    if (query === undefined || query === null) return undefined
    const observation = await query.observeSession(id)
    const cwd = observation?.header?.cwd
    observation?.dispose?.()
    if (typeof cwd === 'string' && cwd !== '') return cwd
  } catch {
    // An unknown or unreadable id is the panel's "explain itself" path.
  }
  return undefined
}

/**
 * The working directories of the sessions open right now, read defensively.
 *
 * "Open" means the live store — the fallback for a request that names no
 * session. The store is an optional captured service: a host without one costs
 * an empty answer, never a crash.
 * @param {object | undefined} store - the captured session store.
 * @returns {(string | undefined | null)[]} one cwd per open session.
 */
function readOpenCwds(store) {
  try {
    const list = store?.list?.()
    if (!Array.isArray(list)) return []
    return list.map((session) => session?.header?.cwd)
  } catch {
    return []
  }
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
  const sampler = createSampler({ sampleMillis: options.sampleMillis, cacheMillis: options.cacheMillis, reader })

  // The temperature card reads on its own, much calmer cadence: it is an absolute
  // reading rather than a counter, and on Windows it costs a PowerShell call of a
  // second or more. The probe serves a stale reading immediately and refreshes
  // behind the poll, so this never delays a snapshot.
  const temperatureProbe = createTemperatureProbe({ intervalMs: options.temperatureIntervalMs })

  // The session services are optional, and Cordis refuses a bare property read
  // without an inject declaration, so both are captured through inject
  // contributions instead: a deployment without them leaves the references
  // unset, and the meter explains itself rather than failing the boot.
  const sessionServices = { sessions: undefined, sessionQuery: undefined }
  ctx.inject(['sessions'], (serviceCtx) => {
    sessionServices.sessions = serviceCtx.sessions
  })
  ctx.inject(['sessionQuery'], (serviceCtx) => {
    sessionServices.sessionQuery = serviceCtx.sessionQuery
  })

  // The manual scan over the sessions' folders. `openCwds` is read at scan
  // start, so "what is open now" is decided then, not per poll; a folder the
  // panel names explicitly (the viewed session's workspace) wins instead.
  const scanner = createScanController({
    openCwds: () => readOpenCwds(sessionServices.sessions),
    fixedDir: options.projectDir,
    entryBudget: options.projectDirEntryBudget,
    maxDirs: options.projectDirMaxDirs,
  })

  // Which reader is in use is published in every response (`reader`) and in the
  // panel header (the platform label) rather than logged: those are observable in
  // a running deployment, and a boot line here is not.

  // Registered before the route so that teardown, which unwinds effects in
  // reverse, drains an in-flight sample after the route stops accepting
  // requests. The route's own registration is already owned by this fiber.
  ctx.effect(() => () => sampler.pending(), 'perfmon: drain in-flight sample')
  // A temperature read in flight at unload is drained for the same reason: a
  // PowerShell call left running would outlive the route that asked for it.
  ctx.effect(() => () => temperatureProbe.pending(), 'perfmon: drain in-flight temperature read')
  // Unloading the plugin stops a running scan first: a fiber teardown must not
  // leave a walk running against a dead route.
  ctx.effect(
    () => () => scanner.stop(),
    'perfmon: stop any running directory scan',
  )

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
        // The manual controls ride the same request as the poll, so the panel
        // never needs a second round trip to act. A hidden line starts nothing:
        // the row cannot display a reading, so it does not spend a walk.
        let startFallback
        if (options.projectDirHidden) {
          // hidden: neither control has anything to act on
        } else if (body?.measure === true) {
          // A named session's workspace is what the button promises to measure,
          // and the live store alone may not know it: the sidebar shows sessions
          // whose home process never entered them into this process's store.
          const session = typeof body?.session === 'string' && body.session !== '' ? body.session : undefined
          if (session !== undefined) {
            const sessionCwd = await resolveSessionCwd(sessionServices, session)
            if (typeof sessionCwd === 'string') scanner.start(sessionCwd)
            else startFallback = noCwdDisk(session)
          } else {
            scanner.start()
          }
        } else if (body?.measure === false) scanner.stop()

        // The two readings are independent: a directory scan that fails or is
        // still running must not cost the live sample, and the live sample's
        // own failure path stays exactly as it was.
        const reading = await sampler.snapshot({
          sort: body?.sort,
          limit: body?.limit ?? options.processLimit,
        })
        // The temperature read is awaited, but the probe serves a cached reading
        // instantly once it has one — only the very first request pays the read,
        // which is exactly the one whose first paint should carry a number.
        let temperature
        try {
          temperature = options.temperatureHidden ? HIDDEN_TEMPERATURE : await temperatureProbe.read()
        } catch (error) {
          ctx.logger?.warn?.('perfmon: temperature read failed: %s', error?.message ?? String(error))
          temperature = {
            status: 'unavailable',
            at: null,
            source: null,
            groups: { cpu: null, gpu: null, mainboard: null, disk: null },
            warnings: ['temperature-unavailable'],
          }
        }
        let disk
        try {
          disk = options.projectDirHidden
            ? hiddenDisk
            : startFallback !== undefined
              ? startFallback
              : scanner.state().disk === null
                ? noCwdDisk()
                : { ...scanner.state().disk, status: scanner.state().status }
        } catch (error) {
          ctx.logger?.warn?.('perfmon: project-directory read failed: %s', error?.message ?? String(error))
          disk = {
            projectDir: null,
            projectDirs: [],
            projectBytes: null,
            projectEntries: 0,
            projectTruncated: false,
            droppedDirCount: 0,
            warnings: [DU_WARNINGS.rootUnreadable],
            status: 'done',
          }
        }
        return json({
          ok: true,
          value: {
            ...reading,
            disk,
            temperature,
            // A hidden card contributes no warning: the user asked for it to be
            // absent, so there is nothing to explain.
            warnings: [
              ...(reading.warnings ?? []),
              ...disk.warnings,
              ...(options.temperatureHidden ? [] : temperature.warnings),
            ],
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
