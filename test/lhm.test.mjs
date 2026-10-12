/**
 * The LHM assist controller's specs.
 *
 * Every action this controller runs can raise an elevation prompt on the real
 * machine — UAC on the user's own desktop — so nothing here touches a real
 * runner: the command runner, the state reader and the clock are injected, and
 * what is asserted is the *decisions* — which reason a failure becomes, when
 * a launch is refused versus retried, that a second click cannot race the
 * first — rather than winget or PowerShell themselves. The route itself (with
 * only its safe `probe` action) is covered in route.test.mjs.
 *
 * @module dsh-client-ui-sidebar-perfmon/test/lhm
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LHM_ACTIONS, LHM_PATH, LHM_WINGET_ID, createLhmController } from '../src/host/lhm.js'
import { CommandError } from '../src/host/readers/exec.js'

/**
 * Build a controller over scripted answers.
 *
 * `answers` is checked in order against `command + args`, first match wins,
 * and an unmatched call fails the way a missing executable does.
 * @param {{state?: object | null, platform?: string, shell?: string | undefined,
 *          answers?: Array<{match: RegExp, reply?: unknown, hang?: boolean}>,
 *          onRefresh?: () => void}} [options] - the script.
 * @returns {object} the controller, the recorded calls/refreshes, and a state setter.
 */
function setup({ state = null, platform = 'win32', shell = 'powershell', answers = [], onRefresh } = {}) {
  const calls = []
  const refreshes = []
  const scheduled = []
  let currentState = state
  const run = async (command, args, options = {}) => {
    const line = `${command} ${args.join(' ')}`
    calls.push({ command, args, options, line })
    const hit = answers.find((entry) => entry.match.test(line))
    if (hit === undefined) throw new CommandError(command, args, 'not found', { code: 'ENOENT' })
    if (hit.hang) return new Promise(() => {})
    if (hit.reply instanceof Error) throw hit.reply
    return hit.reply ?? ''
  }
  const controller = createLhmController({
    platform,
    run,
    available: async () => shell,
    readState: async () => currentState,
    refreshTemperature: () => {
      refreshes.push(true)
      onRefresh?.()
    },
    sleep: async () => {},
    // Timers are recorded, never waited on: the cadence is part of the
    // contract, but 3 + 12 seconds of it is not this spec's to spend.
    setTimer: (_fn, ms) => {
      scheduled.push(ms)
      return 0
    },
  })
  return {
    controller,
    calls,
    refreshes,
    scheduled,
    setState: (next) => {
      currentState = next
    },
  }
}

/** The installed-but-silent monitor a `start` would act on. */
const INSTALLED = { state: 'installed', process: false, path: 'C:\\Program Files\\LHM\\LibreHardwareMonitor.exe' }

test('the route path, package id and action set are the contract the panel codes against', () => {
  assert.equal(LHM_PATH, '/api/perfmon.lhm')
  assert.equal(LHM_WINGET_ID, 'LibreHardwareMonitor.LibreHardwareMonitor')
  assert.deepEqual(LHM_ACTIONS, ['probe', 'start', 'install'])
})

test('probe reports the state the temperature reading already knows, on any platform', async () => {
  const darwin = setup({ platform: 'darwin', state: { state: 'missing', process: false, path: null } })
  assert.deepEqual(await darwin.controller.act('probe'), { state: 'missing' })
  assert.deepEqual(darwin.calls, [], 'probe is a read of state that already exists')

  const noState = setup({ state: null })
  assert.deepEqual(await noState.controller.act('probe'), { state: null })
})

test('a start launches the located executable elevated and shortens the temperature leash', async () => {
  const { controller, calls, refreshes, scheduled } = setup({
    state: INSTALLED,
    answers: [{ match: /-Verb RunAs/, reply: '' }],
  })
  assert.deepEqual(await controller.act('start'), { state: 'starting' })
  assert.equal(calls.length, 1, 'one click, one launch')
  assert.ok(calls[0].line.includes(INSTALLED.path), 'the launch names the located executable')
  assert.ok(calls[0].line.includes('-Verb RunAs'), 'the driver only loads when elevated')
  assert.equal(calls[0].command, 'powershell')
  assert.ok(calls[0].options.timeoutMs >= 10_000, 'elevation is bounded, not unbounded')
  // The driver takes a moment to publish its WMI namespace: two refreshes are
  // *scheduled* — 3 s and 12 s — so `running` lands in seconds rather than on
  // the 15-second thermal cadence, and none of that wait lands in this spec.
  assert.deepEqual(scheduled, [3_000, 12_000])
  assert.deepEqual(refreshes, [], 'no refresh is due during the launch itself')
  controller.dispose()
  assert.doesNotThrow(() => controller.dispose(), 'dispose is idempotent')
})

test('a refused elevation is declined, not failed, because the prompt is on the host screen', async () => {
  const { controller } = setup({
    state: INSTALLED,
    answers: [{ match: /-Verb RunAs/, reply: new CommandError('powershell', [], 'The operation was canceled by the user.') }],
  })
  const reply = await controller.act('start')
  assert.equal(reply.reason, 'elevation-declined')
  assert.equal(reply.state, 'installed', 'the state to believe is unchanged')
})

test('any other launch failure keeps its detail instead of being blamed on the user', async () => {
  const { controller } = setup({
    state: INSTALLED,
    answers: [{ match: /-Verb RunAs/, reply: new CommandError('powershell', [], 'spawn EPERM') }],
  })
  const reply = await controller.act('start')
  assert.equal(reply.reason, 'start-failed')
  assert.match(reply.detail, /spawn EPERM/)
})

test('a live process that exposes no sensors is not relaunched', async () => {
  const { controller, calls } = setup({
    state: { state: 'installed', process: true, path: INSTALLED.path },
    answers: [],
  })
  const reply = await controller.act('start')
  assert.equal(reply.reason, 'already-running-unreadable')
  assert.equal(reply.state, 'installed')
  assert.deepEqual(calls, [], 'a second copy would not hand over the admin token')
})

test('nothing located is exe-not-found, and nothing is spawned', async () => {
  const { controller, calls } = setup({
    state: { state: 'installed', process: false, path: null },
    answers: [],
  })
  assert.deepEqual(await controller.act('start'), { state: 'installed', reason: 'exe-not-found' })
  assert.deepEqual(calls, [])
})

test('a host without PowerShell says so before anything else', async () => {
  // `null` deliberately: passing `undefined` would fall back to the setup
  // default of a present shell and test the wrong machine.
  const { controller } = setup({ state: INSTALLED, shell: null, answers: [] })
  assert.deepEqual(await controller.act('start'), { state: 'installed', reason: 'powershell-missing' })
})

test('a non-Windows host refuses actions, but probe still answers', async () => {
  const { controller, calls } = setup({ platform: 'darwin', state: null, answers: [] })
  assert.deepEqual(await controller.act('start'), { state: null, reason: 'unsupported' })
  assert.deepEqual(await controller.act('install'), { state: null, reason: 'unsupported' })
  assert.deepEqual(calls, [], 'no command ever reaches another platform')
})

test('install without winget reports winget-unavailable, so the panel can offer the manual path', async () => {
  const { controller, calls } = setup({
    answers: [{ match: /winget --version/, reply: new CommandError('winget', [], 'not found') }],
  })
  assert.deepEqual(await controller.act('install'), { state: null, reason: 'winget-unavailable' })
  assert.equal(calls.length, 1, 'no install is attempted after the probe fails')
})

test('an install failure elevation cannot fix is not escalated', async () => {
  const { controller, calls } = setup({
    answers: [
      { match: /winget --version/, reply: '' },
      { match: /winget install --id/, reply: new CommandError('winget', [], 'no space left on device') },
    ],
  })
  const reply = await controller.act('install')
  assert.equal(reply.reason, 'install-failed')
  assert.match(reply.detail, /no space left/)
  assert.equal(calls.length, 2, 'version, then the install itself')
  assert.equal(
    calls.some((call) => call.line.includes('-Verb RunAs')),
    false,
    'a disk error is not an elevation problem',
  )
})

test('an elevation-shaped install failure is retried once, elevated, then the monitor is launched', async () => {
  const elevated = []
  const { controller, calls, setState } = setup({
    answers: [
      { match: /winget --version/, reply: '' },
      // The marker a missing driver host produces: worth exactly one retry.
      { match: /winget install --id/, reply: new CommandError('winget', [], '0x8A15002B requires elevation') },
      { match: /Start-Process -FilePath 'winget'/, reply: '' },
      { match: /Start-Process -FilePath 'C:/, reply: '' },
    ],
    // The registry entry settles after the copy: the first locate refresh is
    // where the executable appears.
    onRefresh: () => {
      if (elevated.length === 1) setState(INSTALLED)
      elevated.push(1)
    },
  })
  assert.deepEqual(await controller.act('install'), { state: 'starting' })
  assert.equal(calls.length, 4, 'version, plain install, elevated install, launch')
  assert.ok(calls[1].line.startsWith('winget install'), 'the plain attempt comes first')
  assert.ok(calls[2].line.includes('-Verb RunAs'), 'the retry runs elevated')
  assert.ok(calls[2].line.includes(LHM_WINGET_ID), 'the retry installs the same package')
  assert.ok(calls[3].line.includes(INSTALLED.path), 'and the located executable is then launched')
})

test('a successful install whose executable cannot be located says so under state installed', async () => {
  const { controller, calls } = setup({
    answers: [
      { match: /winget --version/, reply: '' },
      { match: /winget install --id/, reply: '' },
    ],
  })
  const reply = await controller.act('install')
  assert.equal(reply.reason, 'exe-not-found')
  assert.equal(reply.state, 'installed')
  assert.equal(calls.length, 2, 'the locate loop never reaches for a command')
})

test('a second click while one is in flight is busy, not a second winget', async () => {
  const { controller } = setup({
    state: INSTALLED,
    answers: [{ match: /-Verb RunAs/, hang: true }],
  })
  const inflight = controller.act('start') // deliberately never awaited: it hangs on the launch
  const reply = await controller.act('start')
  assert.equal(reply.reason, 'busy')
  assert.equal(reply.state, 'installed', 'busy still reports what the panel should show')
  assert.equal(inflight instanceof Promise, true)
})

test('an unknown action fails honestly instead of doing something adjacent', async () => {
  const { controller, calls } = setup({ answers: [] })
  assert.deepEqual(await controller.act('reboot'), { state: null, reason: 'bad-action' })
  assert.deepEqual(calls, [])
})
