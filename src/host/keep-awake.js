/**
 * Keep-awake: hold the host out of sleep while the panel's toggle is on.
 *
 * Background HTTP traffic cannot do this, however often it is sent. Windows,
 * macOS and Linux decide to sleep from an *idle* timer that is reset by local
 * user input and by explicit power requests — a server answering polls all day
 * still counts as idle. That is exactly why a remote session dies after the
 * configured 15 minutes with a perfectly busy process behind it: the browser is
 * on another machine, so its activity never reaches the host's idle timer.
 * Holding the host awake therefore has to come from the OS side, per platform:
 *
 * - Windows: `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)` on a
 *   thread that stays alive for the whole hold. The state belongs to the
 *   *thread*, so the call lives in a small PowerShell holder which re-asserts it
 *   every few minutes while it waits for the host process to exit, then clears
 *   the requirement and exits. The holder also verifies the call (a second
 *   `SetThreadExecutionState` returns the state just set) and exits non-zero
 *   when it does not stick, which is how a machine where the API refuses is
 *   reported as unsupported instead of pretending to hold.
 * - macOS: `caffeinate -i -w <hostPid>` — the idle assertion ends with the pid.
 * - Linux: `systemd-inhibit --what=sleep:idle` wrapped around a loop that waits
 *   for the host pid; the inhibitor lock is released when that command exits.
 *
 * Every strategy ties its lifetime to the host pid, so three releases are
 * automatic: the toggle's off click kills the holder, plugin unload disposes the
 * controller (an effect, like the scan stop), and a host crash or restart kills
 * the holder's parent check — the machine can never be left awake by a process
 * that is no longer there to turn it off.
 *
 * Cost while on: one sleeping helper process — no timers, no polling, no disk
 * writes, effectively 0% CPU. Cost while off: nothing; the holder is killed,
 * not paused. State transitions go to a bounded in-memory ring
 * (`AWAKE_EVENT_LIMIT`) that never touches the filesystem, which is the whole
 * "log": it answers "was this still holding an hour ago" without ever growing.
 *
 * @module @xmwengxing/dsh-client-ui-sidebar-perfmon/keep-awake
 */

import { spawn as nodeSpawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Absolute path of the toggle route on the shared `/api` channel. */
export const AWAKE_PATH = '/api/perfmon.awake'

/** Events kept in memory; older entries are dropped. Never written to disk. */
export const AWAKE_EVENT_LIMIT = 10

/**
 * A holder that dies within this window of starting never held anything: the
 * platform refused (no systemd running, PowerShell policy, …). Later deaths are
 * ordinary releases and leave the feature re-armable.
 */
const HOLD_FAILURE_MS = 15_000

/**
 * The Windows holder script.
 *
 * Deliberately free of `"` characters: the whole script travels as one
 * `-Command` argument, and a double quote inside a Windows-spawned argument is
 * exactly the quoting edge that gets mangled. The one place a double quote is
 * required — the `DllImport` path — is assembled from `[char]34`. Numeric ES_
 * flags avoid hex-literal parsing questions entirely (0x80000000 as int64 would
 * not fit an int32 parameter conversion in some PowerShell versions).
 *
 * @param {number} hostPid - the host process the holder waits for.
 * @returns {string} the script body.
 */
function windowsHolderScript(hostPid) {
  return [
    "$ErrorActionPreference = 'Stop'",
    '$dq = [char]34',
    "Add-Type -Namespace DshPerfmon -Name Exec -MemberDefinition ('[DllImport(' + $dq + 'kernel32.dll' + $dq + ')] public static extern uint SetThreadExecutionState(uint es);')",
    '$cont = [uint32]2147483648',
    '$req = [uint32]2147483649',
    '[void][DshPerfmon.Exec]::SetThreadExecutionState($req)',
    // Verification: this second call returns the state the first one set, so a
    // non-$req answer proves the requirement never took effect.
    'if ([DshPerfmon.Exec]::SetThreadExecutionState($req) -ne $req) { exit 1 }',
    `try { $p = Get-Process -Id ${hostPid} -ErrorAction Stop } catch { [void][DshPerfmon.Exec]::SetThreadExecutionState($cont); exit 0 }`,
    'while (-not $p.WaitForExit(300000)) { [void][DshPerfmon.Exec]::SetThreadExecutionState($req) }',
    '[void][DshPerfmon.Exec]::SetThreadExecutionState($cont)',
    'exit 0',
  ].join('\n')
}

/**
 * The Linux holder command: one inhibitor lock around a parent-wait loop.
 *
 * `sh` carries the loop, `systemd-inhibit` holds the lock for as long as that
 * command runs, and `kill -0` exits the loop the moment the host is gone — the
 * lock then drops with the command, which is how a dead host can never leave
 * sleep inhibited. Note `what` covers sleep and idle only: shutdown is never
 * inhibited, so the machine can always be turned off.
 * @param {number} hostPid - the host process the loop waits for.
 * @returns {string} the `sh -c` command line.
 */
function linuxHolderCommand(hostPid) {
  return (
    `exec systemd-inhibit --what=sleep:idle --who=dsh-perfmon --why=dsh-perfmon ` +
    `sh -c 'while kill -0 ${hostPid} 2>/dev/null; do sleep 5; done'`
  )
}

/**
 * Decide whether this platform can hold the host awake, before anything spawns.
 * @param {string} platform - the reporting platform.
 * @param {(path: string) => boolean} exists - the path probe.
 * @returns {{supported: boolean, reason: string | null}} the verdict.
 */
function probeSupport(platform, exists) {
  if (platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
    const powershell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    return exists(powershell)
      ? { supported: true, reason: null }
      : { supported: false, reason: 'powershell-missing' }
  }
  if (platform === 'darwin') {
    return exists('/usr/bin/caffeinate')
      ? { supported: true, reason: null }
      : { supported: false, reason: 'caffeinate-missing' }
  }
  if (platform === 'linux') {
    const candidates = ['/usr/bin/systemd-inhibit', '/bin/systemd-inhibit', '/usr/sbin/systemd-inhibit']
    return candidates.some(exists)
      ? { supported: true, reason: null }
      : { supported: false, reason: 'systemd-inhibit-missing' }
  }
  return { supported: false, reason: 'unsupported-platform' }
}

/**
 * How to start the holder for one platform.
 * @param {string} platform - the reporting platform.
 * @param {number} hostPid - the host process the holder must outlive.
 * @param {string} powershellPath - the resolved powershell.exe path (win32).
 * @returns {{command: string, args: string[]}} the spawn spec.
 */
function holderSpec(platform, hostPid, powershellPath) {
  if (platform === 'win32') {
    return { command: powershellPath, args: ['-NoProfile', '-NonInteractive', '-Command', windowsHolderScript(hostPid)] }
  }
  if (platform === 'darwin') {
    return { command: '/usr/bin/caffeinate', args: ['-i', '-w', String(hostPid)] }
  }
  return { command: 'sh', args: ['-c', linuxHolderCommand(hostPid)] }
}

/**
 * Create the keep-awake controller for one plugin fiber.
 *
 * All collaborators are injectable so the specs never spawn a real process:
 * `exists` probes support, `spawn` starts the holder, `kill` signals its
 * process group, `now` stamps the state, `hostPid` is the pid the holder ties
 * itself to (the real host process in production, a constant in tests).
 *
 * @param {object} [deps] - collaborators, defaulted to the real ones.
 * @param {string} [deps.platform] - the platform to hold for.
 * @param {(path: string) => boolean} [deps.exists] - the path probe.
 * @param {typeof nodeSpawn} [deps.spawn] - the process spawner.
 * @param {(pid: number, signal?: string) => void} [deps.kill] - the group signal.
 * @param {() => number} [deps.now] - the clock in milliseconds.
 * @param {number} [deps.hostPid] - the pid the holder waits for.
 * @param {number} [deps.holdFailureMs] - the early-death window.
 * @returns {{state: () => object, events: () => object[], enable: () => object, disable: () => object, dispose: () => void}} the controller.
 */
export function createKeepAwakeController({
  platform = process.platform,
  exists = existsSync,
  spawn = nodeSpawn,
  kill = (pid, signal) => process.kill(pid, signal),
  now = Date.now,
  hostPid = process.pid,
  holdFailureMs = HOLD_FAILURE_MS,
} = {}) {
  const support = probeSupport(platform, exists)
  const powershellPath = join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  )

  let supported = support.supported
  let reason = support.reason
  let child = null
  let active = false
  let since = null
  let startedAt = null
  const eventRing = []

  /** Append one transition, dropping the oldest beyond the cap. */
  const record = (event, detail) => {
    const entry = { at: now(), event }
    if (detail !== undefined) entry.detail = detail
    eventRing.push(entry)
    while (eventRing.length > AWAKE_EVENT_LIMIT) eventRing.shift()
  }

  const state = () => ({ supported, active, since, reason })

  /**
   * Release the holder.
   *
   * On POSIX the holder runs in its own process group (`detached`) so the whole
   * tree — `sh`, the inhibitor, the wait loop — goes with one group signal;
   * Windows holders are a single process and die with a direct kill. Losing the
   * process is what drops the requirement: the OS reverts a terminated thread's
   * execution state, and the script clears it explicitly on its own exit paths.
   */
  const killHolder = () => {
    const held = child
    child = null
    if (held === null) return
    try {
      if (platform !== 'win32' && Number.isInteger(held.pid)) {
        try {
          kill(-held.pid, 'SIGTERM')
          return
        } catch {
          // group gone or never formed — fall back to the direct kill below
        }
      }
      held.kill?.()
    } catch {
      // already dead
    }
  }

  /** Start the hold. A second call while holding is a no-op. */
  const enable = () => {
    if (!supported || active) return state()
    let spec
    try {
      spec = holderSpec(platform, hostPid, powershellPath)
    } catch (error) {
      supported = false
      reason = 'unsupported-platform'
      record('failed', String(error?.message ?? error))
      return state()
    }
    let spawned
    try {
      spawned = spawn(spec.command, spec.args, {
        stdio: 'ignore',
        detached: platform !== 'win32',
        windowsHide: true,
      })
    } catch (error) {
      supported = false
      reason = 'spawn-failed'
      record('failed', String(error?.message ?? error))
      return state()
    }
    child = spawned
    startedAt = now()
    active = true
    since = startedAt
    reason = null
    record('on')

    const onGone = (detail) => {
      if (child !== spawned) return // our own kill: the release is already recorded
      child = null
      active = false
      since = null
      if (now() - startedAt < holdFailureMs) {
        // The holder died before it could have held anything: report the
        // platform as unable to hold, so the toggle disables instead of
        // silently doing nothing on every click.
        supported = false
        reason = 'hold-failed'
        record('failed', detail)
      } else {
        reason = 'holder-exited'
        record('released', detail)
      }
    }
    spawned.on?.('error', (error) => onGone(String(error?.code ?? error?.message ?? error)))
    spawned.on?.('exit', (code) => onGone(code ?? null))
    return state()
  }

  /** End the hold. No-op when nothing is held. */
  const disable = () => {
    if (!active) return state()
    killHolder()
    active = false
    since = null
    record('off')
    return state()
  }

  return {
    state,
    events: () => eventRing.map((entry) => ({ ...entry })),
    enable,
    disable,
    // Plugin unload: the hold must not outlive the route that manages it. The
    // holder's own parent check covers the harsher cases (a crash, a kill -9).
    dispose: () => {
      if (active) disable()
    },
  }
}
