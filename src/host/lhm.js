/**
 * One-click assist for LibreHardwareMonitor (LHM).
 *
 * On Windows the CPU temperature is genuinely unanswerable without a hardware
 * monitor (see `temperature/win32.js`), so the panel's dash used to be a dead
 * end: it named the missing software, and nothing that could be done about it
 * lived in the panel. This module is the door out of that dead end. It backs
 * one button on the temperature card's title bar with three states:
 *
 * - **missing** → "install": winget pulls the official package
 *   (`LibreHardwareMonitor.LibreHardwareMonitor` — a user-scope portable zip
 *   whose manifest pins the release URL and its SHA-256 and declares the
 *   PawnIO dependency that LHM's kernel driver needs), then LHM is launched.
 * - **installed but not answering** → "start": the located executable is
 *   launched elevated, because the driver — and with it the WMI `Sensor`
 *   class every reading comes from — only loads when the process runs as
 *   admin.
 * - **running** → the button is gone; the temperatures are on screen.
 *
 * Elevation is also the feature's one hard limitation, and it is stated rather
 * than hidden: `Start-Process -Verb RunAs` (and winget's own dependency
 * installers) put a UAC prompt on the HOST's secure desktop. A remote viewer
 * of this panel cannot see or answer that prompt — it appears on the machine
 * running the host. Every action therefore runs under a bounded timeout and
 * reports an honest reason (`elevation-declined`, `install-failed`, …) instead
 * of hanging on a dialog nobody in the browser can reach, and the button's
 * tooltip says so before the click.
 *
 * Nothing here runs without that click. Detection is part of the temperature
 * script (one process/registry lookup per thermal reading); this controller
 * exists only while the temperature card is visible, and its scheduled
 * refreshes die with it.
 *
 * @module dsh-client-ui-sidebar-perfmon/lhm
 */

import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { firstAvailable, runCommand } from './readers/exec.js'
import { POWERSHELL_CANDIDATES } from './temperature/win32.js'

/** Absolute path of the assist route on the shared `/api` channel. */
export const LHM_PATH = '/api/perfmon.lhm'

/** The winget package id: the official, hash-checked package in winget-pkgs. */
export const LHM_WINGET_ID = 'LibreHardwareMonitor.LibreHardwareMonitor'

/** Actions the route accepts. */
export const LHM_ACTIONS = ['probe', 'start', 'install']

/** One winget attempt: bounded so a stalled download fails honestly. */
const WINGET_TIMEOUT_MS = 200_000

/** Locating a just-installed executable: the registry entry settles last. */
const LOCATE_ATTEMPTS = 3
const LOCATE_DELAY_MS = 2_000

/** A failure an elevation round can actually fix (winget output, EN + ZH). */
const ELEVATION_MARKERS = /elevation|administrat|requires elevated|0x8a15002b|权限|管理员/i

/** A refusal of the UAC prompt (Win32Exception text, EN + ZH). */
const DECLINE_MARKERS = /cancell?ed by the user|operation was canceled|operation was cancelled|用户取消|已取消/i

/**
 * The most useful detail out of a failed run: stderr when the runner carried
 * it, otherwise the message (which names the command). Bounded, because the
 * reply travels to a tooltip and a winget transcript can be long.
 * @param {Error & {stderr?: string}} [error] - the failure.
 * @returns {string | undefined} a short tail, or nothing to say.
 */
function detailOf(error) {
  // `||`, not `??`: a runner that captured nothing reports an empty string,
  // and the message is the only text left that names what went wrong.
  const text = String(error?.stderr || error?.message || '').trim()
  if (text === '') return undefined
  return text.length > 400 ? `…${text.slice(-400)}` : text
}

/** The tail of winget's redirected transcript, when one was written. */
function wingetTranscriptTail() {
  const dir = process.env.TEMP ?? process.env.TMP ?? tmpdir()
  const read = (name) => {
    try {
      return readFileSync(join(dir, name), 'utf8')
    } catch {
      return ''
    }
  }
  const text = `${read('dsh-lhm-winget.err')}\n${read('dsh-lhm-winget.out')}`.trim()
  if (text === '') return undefined
  return text.length > 400 ? `…${text.slice(-400)}` : text
}

/**
 * Build the assist controller around one command runner and one state reader.
 *
 * The state (`{state, process, path}` or `null`) is owned by the temperature
 * probe — that is where detection already runs — and read through the injected
 * `readState`, so this module never issues a duplicate probe. `start` and
 * `install` are single-flight: a second click while one is running is
 * answered `busy` rather than spawning a second winget or a second LHM.
 * @param {{platform?: string,
 *          run?: (command: string, args: string[], options?: object) => Promise<string>,
 *          available?: (candidates: string[], run?: object) => Promise<string | undefined>,
 *          readState?: () => Promise<object | null>,
 *          refreshTemperature?: () => void,
 *          sleep?: (ms: number) => Promise<void>,
 *          setTimer?: (fn: () => void, ms: number) => any}} [deps] - injectable collaborators.
 * @returns {{act: (action: string) => Promise<{state: string | null, reason?: string, detail?: string}>,
 *           dispose: () => void}} the controller.
 */
export function createLhmController(deps = {}) {
  const platform = deps.platform ?? process.platform
  const run = deps.run ?? runCommand
  const find = deps.available ?? firstAvailable
  const readState = deps.readState ?? (async () => null)
  const refreshTemperature = deps.refreshTemperature ?? (() => {})
  const sleep =
    deps.sleep ?? ((ms) => new Promise((resolve) => { const id = setTimeout(resolve, ms); id.unref?.() }))

  /**
   * Schedule a timer this controller owns. Injected so a spec can assert the
   * refresh cadence without waiting it out; the default unrefs, so a started
   * monitor never holds the host's event loop open.
   * @param {() => void} fn - what to run when the timer fires.
   * @param {number} ms - delay before it fires.
   * @returns {any} the timer handle, opaque to the caller.
   */
  const setTimer =
    deps.setTimer ?? ((fn, ms) => { const id = setTimeout(fn, ms); id.unref?.(); return id })

  /** Timers this controller owns; all unref'd and cleared on dispose. */
  const timers = new Set()
  let busy = false
  let shell

  /**
   * Queue one temperature-probe refresh so a started monitor surfaces on a
   * short leash rather than on the 15-second thermal cadence.
   * @param {number} ms - delay before the refresh.
   * @returns {void}
   */
  const scheduleRefresh = (ms) => {
    const id = setTimer(() => {
      timers.delete(id)
      refreshTemperature()
    }, ms)
    timers.add(id)
  }

  /** The probe's current LHM state object, or `null` when it cannot answer. */
  const state = async () => {
    try {
      return (await readState()) ?? null
    } catch {
      return null
    }
  }

  /**
   * The `state` a reply carries: the plain string the panel believes until
   * the next snapshot — never the state object, whose `process`/`path` detail
   * already reaches the panel through the reading itself.
   * @returns {Promise<string | null>} the state string.
   */
  const replyState = async () => (await state())?.state ?? null

  /**
   * Re-read the state until the freshly installed executable shows up.
   * `refresh` makes the probe's next `read()` block on a real PowerShell call,
   * so each attempt is genuinely fresh rather than the cache's last word.
   * @returns {Promise<object | null>} the fresh state, or null when not located.
   */
  async function locateInstalled() {
    for (let attempt = 0; attempt < LOCATE_ATTEMPTS; attempt += 1) {
      refreshTemperature()
      const fresh = await state()
      if (fresh?.state === 'running') return fresh
      if (typeof fresh?.path === 'string' && fresh.path !== '') return fresh
      await sleep(LOCATE_DELAY_MS)
    }
    return null
  }

  /**
   * Launch the executable elevated and confirm nothing else needs doing.
   * @param {string} path - the executable's absolute path.
   * @param {object} [current] - the state it was located under.
   * @returns {Promise<{state: string | null, reason?: string, detail?: string}>} the outcome.
   */
  async function launch(path, current) {
    if (current?.state === 'running') return { state: 'running' }
    if (current?.process === true) {
      // A live process that publishes no sensors is LHM running without the
      // admin token (or with WMI publishing off). Launching a second copy
      // would not fix that, so the reason says what is actually wrong.
      return { state: current?.state ?? null, reason: 'already-running-unreadable' }
    }
    // The shell is checked before the path: on a host with no PowerShell,
    // "not found" would be the less useful half of the truth.
    shell ??= await find(POWERSHELL_CANDIDATES, run)
    if (typeof shell !== 'string' || shell === '') {
      return { state: current?.state ?? null, reason: 'powershell-missing' }
    }
    if (typeof path !== 'string' || path === '') {
      return { state: current?.state ?? null, reason: 'exe-not-found' }
    }
    const escaped = path.replace(/'/g, "''")
    // Single quotes only: this script travels as one `-Command` argument, and
    // the elevation refusal arrives on stderr from this exact catch.
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `try { Start-Process -FilePath '${escaped}' -Verb RunAs } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`,
    ].join('\n')
    try {
      await run(shell, ['-NoProfile', '-NonInteractive', '-Command', script], { timeoutMs: 15_000 })
    } catch (error) {
      const detail = detailOf(error)
      const declined = DECLINE_MARKERS.test(detail ?? '')
      return {
        state: current?.state ?? null,
        reason: declined ? 'elevation-declined' : 'start-failed',
        detail,
      }
    }
    // The process is up: the driver takes a moment to load and publish its WMI
    // namespace, so the probe is refreshed on a short leash instead of waiting
    // out the thermal cadence. The button clears when `running` lands.
    scheduleRefresh(3_000)
    scheduleRefresh(12_000)
    return { state: 'starting' }
  }

  /** The winget install command line, shared by both elevation rounds. */
  const wingetArgs = [
    'install',
    '--id',
    LHM_WINGET_ID,
    '-e',
    '--accept-source-agreements',
    '--accept-package-agreements',
    '--disable-interactivity',
  ]

  /**
   * Run winget elevated once the plain attempt has failed for a reason an
   * elevation can fix. winget's own transcript is redirected to temp files
   * (stdout and stderr cannot share one), because the elevation wrapper
   * otherwise swallows the only text that explains the failure.
   * @returns {Promise<{ok: boolean, reason?: string, detail?: string}>} the outcome.
   */
  async function wingetElevated() {
    shell ??= await find(POWERSHELL_CANDIDATES, run)
    if (shell === undefined) return { ok: false, reason: 'powershell-missing' }
    const argsLine = wingetArgs.join(' ')
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "Remove-Item (Join-Path $env:TEMP 'dsh-lhm-winget.out'),(Join-Path $env:TEMP 'dsh-lhm-winget.err') -Force -ErrorAction SilentlyContinue",
      `$p = Start-Process -FilePath 'winget' -ArgumentList '${argsLine}' -Verb RunAs -Wait -PassThru -RedirectStandardOutput (Join-Path $env:TEMP 'dsh-lhm-winget.out') -RedirectStandardError (Join-Path $env:TEMP 'dsh-lhm-winget.err')`,
      'exit [int]$p.ExitCode',
    ].join('\n')
    try {
      await run(shell, ['-NoProfile', '-NonInteractive', '-Command', script], {
        timeoutMs: WINGET_TIMEOUT_MS + 30_000,
      })
      return { ok: true }
    } catch (error) {
      const detail = wingetTranscriptTail() ?? detailOf(error)
      if (DECLINE_MARKERS.test(detail ?? '')) return { ok: false, reason: 'elevation-declined', detail }
      return { ok: false, reason: 'install-failed', detail }
    }
  }

  /**
   * Install through winget, escalating once when the plain attempt failed for
   * a reason elevation fixes (the PawnIO driver dependency is machine-scope;
   * a missing winget is not fixable that way and is reported as itself).
   * @returns {Promise<{ok: true} | {ok: false, reason: string, detail?: string}>} the outcome.
   */
  async function wingetInstall() {
    try {
      // winget has no `-Command` dialect: probe it with its own `--version`
      // rather than firstAvailable's PowerShell-shaped probe.
      await run('winget', ['--version'], { timeoutMs: 8_000 })
    } catch {
      return { ok: false, reason: 'winget-unavailable' }
    }
    try {
      await run('winget', wingetArgs, { timeoutMs: WINGET_TIMEOUT_MS })
      return { ok: true }
    } catch (error) {
      const detail = detailOf(error)
      if (ELEVATION_MARKERS.test(detail ?? '') || detail === undefined) {
        // No detail at all is typical of an elevation refusal that never got
        // to print: that is exactly the round worth retrying once, elevated.
        return wingetElevated()
      }
      return { ok: false, reason: 'install-failed', detail }
    }
  }

  /**
   * The install action: winget, then locate, then launch — one click from
   * "nothing installed" to a running monitor.
   * @returns {Promise<{state: string | null, reason?: string, detail?: string}>} the outcome.
   */
  async function install() {
    const winget = await wingetInstall()
    if (winget.ok !== true) {
      const failure = { state: null, reason: winget.reason }
      // An absent detail stays absent: `detail: undefined` would still be a
      // key to a strict equality check, and says nothing anyway.
      if (winget.detail !== undefined) failure.detail = winget.detail
      return failure
    }
    const located = await locateInstalled()
    if (located === null) {
      return { state: 'installed', reason: 'exe-not-found', detail: 'winget finished, but no executable was found' }
    }
    return launch(located.path, located)
  }

  /**
   * The start action: re-read the state, then launch what it names.
   * @returns {Promise<{state: string | null, reason?: string, detail?: string}>} the outcome.
   */
  async function start() {
    const current = await state()
    return launch(current?.path, current)
  }

  /**
   * Run one action. Every reply is a business outcome: `state` is the state
   * to believe until the next snapshot, `reason` (when present) is the
   * machine-readable failure the client localises, `detail` is raw text for
   * the tooltip's second line.
   * @param {string} action - one of `LHM_ACTIONS`.
   * @returns {Promise<{state: string | null, reason?: string, detail?: string}>} the outcome.
   */
  async function act(action) {
    if (busy) return { state: await replyState(), reason: 'busy' }
    busy = true
    try {
      if (action === 'probe') return { state: await replyState() }
      if (platform !== 'win32') return { state: null, reason: 'unsupported' }
      if (action === 'start') return await start()
      if (action === 'install') return await install()
      return { state: await replyState(), reason: 'bad-action' }
    } finally {
      busy = false
    }
  }

  return {
    act,
    dispose: () => {
      for (const id of timers) clearTimeout(id)
      timers.clear()
    },
  }
}
