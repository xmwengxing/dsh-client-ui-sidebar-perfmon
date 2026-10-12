/**
 * Keep-awake controller specs.
 *
 * Nothing here spawns a real process: `platform`, `exists`, `spawn`, `kill`
 * and `now` are all injected, so the assertions can pin the exact holder each
 * platform gets — the command line, the process options, the group kill — and
 * the two failure paths (an instant death versus a late one) that decide
 * whether the toggle disables itself or stays re-armable. The real holder is
 * verified separately, in the browser pass, against a live host process.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AWAKE_EVENT_LIMIT,
  AWAKE_PATH,
  createKeepAwakeController,
} from '../src/host/keep-awake.js'

/** A child process stub whose listeners the test drives. */
function fakeChild(pid = 777001) {
  const listeners = new Map()
  return {
    pid,
    killCalls: 0,
    on(event, callback) {
      listeners.set(event, callback)
    },
    kill() {
      this.killCalls += 1
      listeners.get('exit')?.(0)
    },
    emitExit(code) {
      listeners.get('exit')?.(code)
    },
    emitError(code) {
      listeners.get('error')?.(Object.assign(new Error(String(code)), { code }))
    },
  }
}

/** A spawn recorder: every call is captured instead of starting anything. */
function spawnRecorder() {
  const calls = []
  return {
    calls,
    spawn(command, args, options) {
      const child = fakeChild()
      calls.push({ command, args, options, child })
      return child
    },
  }
}

test('the toggle route lives on the shared authenticated channel', () => {
  assert.equal(AWAKE_PATH, '/api/perfmon.awake')
})

test('win32 starts a quote-safe PowerShell holder that waits for the host pid', () => {
  const recorder = spawnRecorder()
  const controller = createKeepAwakeController({
    platform: 'win32',
    exists: () => true,
    spawn: recorder.spawn,
    kill: () => assert.fail('a Windows holder is a single process: no group kill'),
    hostPid: 4242,
  })
  assert.deepEqual(controller.state(), { supported: true, active: false, since: null, reason: null })

  const enabled = controller.enable()
  assert.equal(enabled.active, true)
  assert.equal(typeof enabled.since, 'number')
  // A second click while holding must not stack holders.
  controller.enable()
  assert.equal(recorder.calls.length, 1)

  const { command, args, options } = recorder.calls[0]
  assert.match(command, /powershell\.exe$/i, 'the holder is Windows PowerShell')
  assert.deepEqual(args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-Command'])
  const script = args[3]
  assert.match(script, /SetThreadExecutionState/, 'the hold is the execution-state API, not polling')
  assert.match(script, /Get-Process -Id 4242/, 'the holder waits for exactly the host pid')
  assert.equal(
    script.includes('"'),
    false,
    'the whole script travels as one -Command argument: a double quote inside it is the quoting edge that mangles',
  )
  assert.equal(options.stdio, 'ignore', 'the holder writes nothing: there is no log to rotate')
  assert.equal(options.detached, false, 'Windows holders die with a direct kill, not a group signal')
})

test('linux holds through systemd-inhibit — sleep and idle only, never shutdown', () => {
  const recorder = spawnRecorder()
  const kills = []
  const controller = createKeepAwakeController({
    platform: 'linux',
    exists: () => true,
    spawn: recorder.spawn,
    kill: (pid, signal) => kills.push([pid, signal]),
    hostPid: 4242,
  })
  controller.enable()
  const { command, args, options } = recorder.calls[0]
  assert.equal(command, 'sh')
  assert.equal(options.detached, true, 'POSIX holders run in their own process group')
  const script = args[1]
  assert.match(script, /systemd-inhibit --what=sleep:idle/)
  assert.match(script, /kill -0 4242/, 'the lock is held only while the host pid lives')
  assert.equal(
    /shutdown/.test(script),
    false,
    'the machine must always remain switchable off: shutdown is never inhibited',
  )
})

test('darwin holds through caffeinate tied to the host pid', () => {
  const recorder = spawnRecorder()
  createKeepAwakeController({
    platform: 'darwin',
    exists: () => true,
    spawn: recorder.spawn,
    kill: () => assert.fail('caffeinate is a single process: no group kill needed'),
    hostPid: 4242,
  }).enable()
  const { command, args, options } = recorder.calls[0]
  assert.equal(command, '/usr/bin/caffeinate')
  assert.deepEqual(args, ['-i', '-w', '4242'])
  assert.equal(options.detached, true)
})

test('disabling group-kills the holder, and the event ring never grows past its cap', () => {
  const recorder = spawnRecorder()
  const kills = []
  const controller = createKeepAwakeController({
    platform: 'linux',
    exists: () => true,
    spawn: recorder.spawn,
    kill: (pid, signal) => kills.push([pid, signal]),
    hostPid: 4242,
  })
  for (let round = 0; round < 30; round += 1) {
    controller.enable()
    controller.disable()
  }
  assert.equal(recorder.calls.length, 30)
  assert.equal(kills.length, 30)
  assert.deepEqual(kills[0], [-777001, 'SIGTERM'], 'one group signal takes sh, the inhibitor and the loop')
  assert.equal(controller.state().active, false)

  // The whole "log": in memory, bounded, never a file on disk.
  const events = controller.events()
  assert.ok(events.length <= AWAKE_EVENT_LIMIT, `ring must stay capped, saw ${events.length}`)
  assert.equal(events.at(-1).event, 'off')
  // A copy, so a caller cannot corrupt the ring by holding on to it.
  events.pop()
  assert.equal(controller.events().length, AWAKE_EVENT_LIMIT)
})

test('a platform without the required tool reports itself as unsupported', () => {
  const foreign = createKeepAwakeController({ platform: 'aix', exists: () => true, spawn: () => assert.fail(), kill: () => {} })
  assert.deepEqual(foreign.state(), {
    supported: false,
    active: false,
    since: null,
    reason: 'unsupported-platform',
  })
  foreign.enable()
  assert.equal(foreign.state().active, false, 'an unsupported platform never spawns')

  const recorder = spawnRecorder()
  const noInhibit = createKeepAwakeController({
    platform: 'linux',
    exists: () => false,
    spawn: recorder.spawn,
    kill: () => {},
    hostPid: 4242,
  })
  assert.equal(noInhibit.state().reason, 'systemd-inhibit-missing')
  noInhibit.enable()
  assert.equal(recorder.calls.length, 0)
})

test('a holder that dies immediately marks the platform unable to hold', () => {
  const recorder = spawnRecorder()
  const controller = createKeepAwakeController({
    platform: 'win32',
    exists: () => true,
    spawn: recorder.spawn,
    kill: () => {},
    hostPid: 4242,
  })
  controller.enable()
  // Within the failure window nothing could have been held yet, so the honest
  // answer is "this machine cannot", not "here is a button that lies".
  recorder.calls[0].child.emitExit(1)
  assert.deepEqual(controller.state(), {
    supported: false,
    active: false,
    since: null,
    reason: 'hold-failed',
  })
  controller.enable()
  assert.equal(recorder.calls.length, 1, 'a failed hold does not retry behind the user')

  // The async spawn error path (ENOENT and friends) lands in the same place.
  const second = createKeepAwakeController({
    platform: 'win32',
    exists: () => true,
    spawn: recorder.spawn,
    kill: () => {},
    hostPid: 4242,
  })
  second.enable()
  const pending = recorder.calls[1]
  pending.child.emitError('ENOENT')
  assert.equal(second.state().supported, false)
  assert.equal(second.state().active, false)
})

test('a late holder death is an ordinary release, and the toggle stays re-armable', () => {
  const recorder = spawnRecorder()
  let clock = 1_000
  const controller = createKeepAwakeController({
    platform: 'win32',
    exists: () => true,
    spawn: recorder.spawn,
    kill: () => {},
    now: () => clock,
    hostPid: 4242,
  })
  controller.enable()
  clock += 60_000
  recorder.calls[0].child.emitExit(0)
  const released = controller.state()
  assert.equal(released.supported, true, 'a long hold that ended is not a platform failure')
  assert.equal(released.active, false)
  assert.equal(released.reason, 'holder-exited')
  controller.enable()
  assert.equal(recorder.calls.length, 2, 'the user can simply start it again')
})

test('a spawn that throws disables the feature instead of throwing out of the route', () => {
  const controller = createKeepAwakeController({
    platform: 'win32',
    exists: () => true,
    spawn: () => {
      throw new Error('EPERM')
    },
    kill: () => {},
    hostPid: 4242,
  })
  const state = controller.enable()
  assert.deepEqual(state, { supported: false, active: false, since: null, reason: 'spawn-failed' })
  assert.equal(controller.events().at(-1).event, 'failed')
})

test('disposing the controller releases the hold — plugin unload must not leave the machine awake', () => {
  const recorder = spawnRecorder()
  const controller = createKeepAwakeController({
    platform: 'win32',
    exists: () => true,
    spawn: recorder.spawn,
    kill: () => {},
    hostPid: 4242,
  })
  controller.enable()
  controller.dispose()
  assert.equal(controller.state().active, false)
  assert.equal(recorder.calls[0].child.killCalls, 1)
  // Idempotent: teardown may run after an explicit off click.
  controller.dispose()
  assert.equal(recorder.calls[0].child.killCalls, 1)
})
