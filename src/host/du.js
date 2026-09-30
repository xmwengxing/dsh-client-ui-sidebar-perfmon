/**
 * The project-directory meter: a manually triggered, abortable scan.
 *
 * Measuring a folder is CPU- and IO-heavy work — a session sitting in the home
 * directory can hold hundreds of thousands of entries — so the panel never
 * starts one implicitly. A scan runs only when the panel asks for it, covers
 * only the folders of the sessions that are open at that moment, and can be
 * stopped at any time: an `AbortSignal` rides through the walk, and every
 * `readdir`/`lstat` round trip checks it, so a stop lands within one syscall,
 * not at the end of the tree.
 *
 * The scan still obeys the house rules: `entryBudget` caps how many entries one
 * folder's pass may examine (a stopped-by-budget walk says `truncated` instead
 * of pretending it is complete); symlinks are neither followed nor counted,
 * which is both the `du` convention and the guard that makes a `node_modules`
 * cycle harmless; anything the filesystem will not hand over is skipped and
 * named in `warnings`. As everywhere else in this plugin, an unanswered
 * question is `null`, not zero.
 *
 * The last finished reading stays available: the panel's polling reads it
 * without any filesystem work at all, and it survives until the next scan
 * replaces it (or a newer folder set makes it stale, which the state says).
 *
 * `start()` normally derives its folder set from the live session store, but a
 * caller may name one folder explicitly (`start(dir)`) — the GUI's sidebar shows
 * sessions whose home process does not hold them in that store, so the panel
 * passes the session's workspace and the scan measures exactly that folder.
 *
 * @module dsh-client-ui-sidebar-perfmon/du
 */

import { lstat as lstatDefault, readdir as readdirDefault } from 'node:fs/promises'
import { join, resolve as resolvePath } from 'node:path'

/** Warning codes a scan can append to a reading. */
export const DU_WARNINGS = {
  /** No folder was measured: the scan had no open session carrying a cwd. */
  noRoot: 'project-dir-no-cwd',
  /** A scanned folder could not be read at all. */
  rootUnreadable: 'project-dir-unavailable',
  /** The entry budget ran out before a walk finished. */
  partial: 'project-dir-partial',
  /** At least one subfolder could not be read, so the total is low. */
  skipped: 'project-dir-skipped',
  /** The scan was stopped before it finished; the figures are partial. */
  aborted: 'project-dir-aborted',
  /** The session a request named could not be resolved to a folder. */
  sessionUnresolved: 'project-dir-session-unresolved',
}

/** The reading shape a scan always produces, even when it cannot answer. */
function baseReading(dirs) {
  return {
    projectDir: dirs.length === 1 ? dirs[0] : null,
    projectDirs: [],
    projectBytes: null,
    projectEntries: 0,
    projectTruncated: false,
    droppedDirCount: 0,
    warnings: [],
  }
}

/**
 * Resolve the folder a fixed-folder scan should measure, from config alone.
 *
 * A string pins one folder regardless of sessions; an empty string (or `false`)
 * hides the line; anything else — including unset — means "measure the open
 * sessions' workspaces", which the scan controller, not this function, answers.
 * @param {string | boolean | null | undefined} config - the row's `projectDir` value.
 * @returns {string | null} an absolute folder path, `null` for workspace mode or hidden.
 */
export function resolveProjectDir(config) {
  if (typeof config === 'string' && config !== '') return resolvePath(config)
  return null
}

/**
 * Build the scan controller.
 *
 * One controller serves every panel: `state()` is the always-cheap read the
 * poll serves from, `start()` begins a scan over the requested folders, and
 * `stop()` aborts the running one. A scan while another is running replaces the
 * pending request rather than stacking a second walk — the running pass's
 * result is discarded when its folder set is no longer what the panel asked
 * for, and the new set starts cleanly.
 *
 * @param {object} [options] - tuning; every field is injectable for specs.
 * @param {() => (string | undefined | null)[]} [options.openCwds] - the open sessions' working directories, read at scan start.
 * @param {string | null} [options.fixedDir] - a config-pinned folder; it wins over every other folder choice.
 * @param {number} [options.entryBudget] - entries one folder's walk may examine.
 * @param {number} [options.maxDirs] - distinct folders one scan may cover.
 * @param {() => number} [options.now] - the clock.
 * @param {{readdir?: Function, lstat?: Function}} [options.fsImpl] - the filesystem calls.
 * @returns {object} the controller: `{ state, start, stop }`.
 */
export function createScanController(options = {}) {
  const openCwds = options.openCwds ?? (() => [])
  const fixedDir = typeof options.fixedDir === 'string' && options.fixedDir !== '' ? resolvePath(options.fixedDir) : null
  const entryBudget = Math.max(1, options.entryBudget ?? 50_000)
  const maxDirs = Math.max(1, options.maxDirs ?? 12)
  const now = options.now ?? (() => Date.now())
  const fs = options.fsImpl ?? { readdir: readdirDefault, lstat: lstatDefault }

  /** @type {Map<string, {bytes: number|null, entries: number, truncated: boolean, warnings: string[], at: number}>} */
  const lastByFolder = new Map()
  /** @type {null | {dirs: string[], abort: AbortController, startedAt: number}} */
  let running = null
  /** @type {number} */
  let droppedCount = 0

  /**
   * The distinct absolute folders of the currently open sessions, in first-seen order.
   * @param {(string | undefined | null)[]} cwds - the open sessions' working directories.
   * @returns {{dirs: string[], dropped: number}} the capped folder list and how many it left out.
   */
  function distinct(cwds) {
    const seen = new Set()
    const dirs = []
    for (const cwd of cwds) {
      if (typeof cwd !== 'string' || cwd === '') continue
      const dir = resolvePath(cwd)
      if (seen.has(dir)) continue
      seen.add(dir)
      if (dirs.length < maxDirs) dirs.push(dir)
    }
    return { dirs, dropped: seen.size - dirs.length }
  }

  /**
   * Walk one folder, mutating the pass's accumulators.
   *
   * Every await boundary checks the signal first: a stop lands within one
   * filesystem round trip, not at the end of the tree.
   * @param {string} dir - the folder to read now.
   * @param {AbortSignal} signal - the pass's stop signal.
   * @param {{bytes: number, entries: number, errors: number, truncated: boolean, rootRead: boolean}} state - the pass's accumulators.
   * @param {boolean} [isRoot] - whether `dir` is the root itself.
   */
  async function walk(dir, signal, state, isRoot = false) {
    if (signal.aborted) return
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      // The root and a subfolder fail differently: a root the filesystem will
      // not read means there is no reading at all, while an unreadable
      // subfolder only makes the total honest about being low.
      state.errors += 1
      if (isRoot) state.rootRead = false
      return
    }
    if (isRoot) state.rootRead = true

    for (const entry of entries) {
      if (signal.aborted) return
      if (state.entries >= entryBudget) {
        state.truncated = true
        return
      }
      state.entries += 1
      // A symlink is neither followed nor counted: following one is how a walk
      // disappears into a loop or leaves the folder, and its few bytes are not
      // the figure anyone is asking for.
      if (entry.isSymbolicLink()) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(path, signal, state)
        continue
      }
      if (!entry.isFile()) continue // sockets, FIFOs and devices have no size here
      if (signal.aborted) return
      try {
        const info = await fs.lstat(path)
        if (info.isFile()) state.bytes += Number(info.size)
      } catch {
        state.errors += 1 // deleted between readdir and lstat
      }
    }
  }

  /**
   * Scan the requested folders and store the per-folder readings.
   * @param {string[]} dirs - the folders to scan.
   * @param {AbortController} controller - the pass's stop handle.
   * @returns {Promise<void>} resolves when the pass ends (finished, stopped or replaced).
   */
  async function scan(dirs, controller) {
    const signal = controller.signal
    const readings = []
    let passEntries = 0
    for (const dir of dirs) {
      if (signal.aborted) break
      const state = { bytes: 0, entries: 0, errors: 0, truncated: false, rootRead: true }
      await walk(dir, signal, state, true)
      passEntries += state.entries
      if (signal.aborted) {
        // The stop landed inside this folder: publish what it managed to
        // measure, flagged as partial, rather than dropping the folder entirely.
        if (state.entries > 0 || !state.rootRead) {
          readings.push({
            dir,
            bytes: state.rootRead && state.bytes > 0 ? state.bytes : null,
            entries: state.entries,
            truncated: state.truncated,
            warnings: state.rootRead ? [] : [DU_WARNINGS.rootUnreadable],
          })
        }
        break
      }
      const warnings = []
      if (!state.rootRead) {
        readings.push({ dir, bytes: null, entries: state.entries, truncated: false, warnings: [DU_WARNINGS.rootUnreadable] })
        continue
      }
      if (state.truncated) warnings.push(DU_WARNINGS.partial)
      if (state.errors > 0) warnings.push(DU_WARNINGS.skipped)
      readings.push({ dir, bytes: state.bytes, entries: state.entries, truncated: state.truncated, warnings })
    }
    const aborted = signal.aborted
    const pass = { readings, aborted, at: now() }
    // One pass at a time owns `running`; a replaced pass must not clobber the
    // newer one's result.
    if (running !== null && running.abort === controller) running = null
    for (const reading of pass.readings) {
      // A stopped pass publishes what it measured so far: the panel shows the
      // partial figure with the `aborted` warning rather than nothing at all.
      const warnings = aborted ? [...reading.warnings, DU_WARNINGS.aborted] : reading.warnings
      lastByFolder.set(reading.dir, { ...reading, warnings, at: pass.at })
    }
    if (!aborted) {
      // Folders no longer covered by any open session drop out of the reading.
      const live = new Set(dirs)
      for (const dir of [...lastByFolder.keys()]) {
        if (!live.has(dir)) lastByFolder.delete(dir)
      }
    }
  }

  return {
    /**
     * The current state, safe to read on every poll.
     *
     * No filesystem work happens here, ever: the panel's 2-second cadence costs
     * nothing whether a scan is running, finished, or was never started.
     * @returns {object} `{ status, disk }` — `status` is `idle` (never scanned),
     *   `scanning`, or `done`; `disk` is the reading (for `scanning`, the last
     *   finished one over these folders, or `null` before the first completes).
     */
    state() {
      if (running !== null) {
        const dirs = running.dirs
        const folders = dirs.map((dir) => folderEntry(lastByFolder.get(dir), dir))
        const covered = folders.filter((entry) => entry !== null)
        // The aggregate carries every folder warning it covers: the sum hides a
        // partial or unreadable corner unless its reason is named beside it.
        const warnings = [
          ...(covered.some((entry) => entry.bytes !== null) ? [] : [DU_WARNINGS.noRoot]),
          ...(droppedCount > 0 ? [DU_WARNINGS.dropped] : []),
          ...new Set(covered.flatMap((entry) => entry.warnings)),
        ]
        return {
          status: 'scanning',
          disk: {
            ...baseReading(dirs),
            projectDirs: covered,
            projectBytes: covered.some((entry) => entry.bytes !== null) ? covered.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0) : null,
            projectEntries: covered.reduce((sum, entry) => sum + entry.entries, 0),
            projectTruncated: covered.some((entry) => entry.truncated),
            droppedDirCount: droppedCount,
            warnings,
            stale: covered.length < dirs.length,
          },
        }
      }
      if (lastByFolder.size === 0) {
        return { status: 'idle', disk: null }
      }
      const dirs = [...lastByFolder.keys()]
      const folders = dirs.map((dir) => folderEntry(lastByFolder.get(dir), dir)).filter((entry) => entry !== null)
      const warnings = [
        ...(folders.some((entry) => entry.bytes !== null) ? [] : [DU_WARNINGS.rootUnreadable]),
        ...(droppedCount > 0 ? [DU_WARNINGS.dropped] : []),
        ...new Set(folders.flatMap((entry) => entry.warnings)),
      ]
      return {
        status: 'done',
        disk: {
          ...baseReading(dirs),
          projectDirs: folders,
          projectBytes: folders.some((entry) => entry.bytes !== null) ? folders.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0) : null,
          projectEntries: folders.reduce((sum, entry) => sum + entry.entries, 0),
          projectTruncated: folders.some((entry) => entry.truncated),
          droppedDirCount: droppedCount,
          warnings,
          stale: false,
        },
      }
    },

    /**
     * Start a scan.
     *
     * The folders come from the first of: the config-pinned folder, a folder the
     * caller names here (`targetDir` — the panel sends the viewed session's
     * workspace, which the live store alone may not know), or the open sessions'
     * folders as before. A scan already running is stopped first (its partial
     * figures stay published with the `aborted` warning); the new pass then
     * begins. Returns immediately — the poll picks the result up from `state()`.
     * @param {string} [targetDir] - an explicit folder to measure, overriding the open-session derivation.
     * @returns {{status: string, disk: object | null}} the state as of the start.
     */
    start(targetDir) {
      if (running !== null) {
        const previous = running
        running = null
        previous.abort.abort()
      }
      let dirs
      let dropped
      const target = fixedDir ?? (typeof targetDir === 'string' && targetDir !== '' ? targetDir : undefined)
      if (target !== undefined) {
        // One named folder: the scan measures it whether or not any session
        // still holds it open, so nothing drops out of its reading later.
        dirs = [resolvePath(target)]
        dropped = 0
      } else {
        ;({ dirs, dropped } = distinct(openCwds()))
      }
      if (dirs.length === 0) {
        return { status: 'idle', disk: null }
      }
      const abort = new AbortController()
      running = { dirs, abort, startedAt: now() }
      // The pass never rejects: every filesystem failure is folded into the
      // per-folder reading it belongs to, so a crash here would be a bug, not
      // an expected path.
      void scan(dirs, abort).catch((error) => {
        running = null
        lastByFolder.set(dirs[0], { dir: dirs[0], bytes: null, entries: 0, truncated: false, warnings: [`${DU_WARNINGS.rootUnreadable}: ${error?.message ?? String(error)}`], at: now() })
      })
      droppedCount = dropped
      return this.state()
    },

    /**
     * Stop the running scan, if any. The partial figures measured so far stay
     * published with the `aborted` warning; the panel shows them as partial.
     */
    stop() {
      if (running !== null) {
        const current = running
        running = null
        current.abort.abort()
      }
    },
  }
}

/** Turn a stored folder reading into the wire shape, or `null` when absent. */
function folderEntry(stored, dir) {
  if (stored === undefined) return null
  return {
    dir,
    bytes: stored.bytes,
    entries: stored.entries,
    truncated: stored.truncated === true,
    warnings: Array.isArray(stored.warnings) ? stored.warnings : [],
  }
}
