/**
 * Platform-reader specs.
 *
 * The parsers are the risky half of cross-platform support: they are pure
 * functions over text this machine cannot produce, so each one is tested against
 * a sample written the way its tool actually writes it, including the awkward
 * shapes — a truncated warning, a path with a space, an `N/A` counter, a JSON
 * document with one object instead of an array.
 *
 * `parseVmStat`, `parsePs`, `parseSwapusage` and `parseWindowsSample` are fed real
 * output shapes captured from those platforms' documentation and shells. The
 * readers themselves are driven through an injected runner, so the *orchestration*
 * — what happens when a tool is missing or fails — is covered here too. What is
 * **not** covered is a live macOS or Windows machine.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCpuTimes, parseMeminfo, parseProcessStat, linuxReader } from '../src/host/readers/linux.js'
import {
  createDarwinReader,
  memoryFromVmStat,
  parseCpuTime,
  parsePs,
  parseSwapusage,
  parseVmStat,
} from '../src/host/readers/darwin.js'
import { createWin32Reader, parseWindowsSample, SAMPLE_SCRIPT } from '../src/host/readers/win32.js'
import { createGenericReader } from '../src/host/readers/generic.js'
import { platformLabel, selectReader } from '../src/host/readers/index.js'
import { CommandError } from '../src/host/readers/exec.js'

/** A runner that answers from a table and records what was asked for. */
function fakeRunner(table) {
  const calls = []
  const run = async (command, args) => {
    calls.push([command, ...args].join(' '))
    const key = Object.keys(table).find((candidate) => command === candidate || command.startsWith(candidate))
    if (key === undefined) throw new CommandError(command, args, 'not found', { code: 'ENOENT' })
    const value = table[key]
    if (value instanceof Error) throw value
    return typeof value === 'function' ? value(command, args) : value
  }
  run.calls = calls
  return run
}

// ---------------------------------------------------------------- Linux

test('the Linux reader still parses /proc exactly as before', () => {
  const stat = [
    'cpu  100 0 50 800 20 0 5 0 0 0',
    'cpu0 50 0 25 400 10 0 2 0 0 0',
    'cpu1 50 0 25 400 10 0 3 0 0 0',
    'intr 12345',
  ].join('\n')
  const cpu = parseCpuTimes(stat)
  // iowait counts as idle, so busy is user+nice+system+irq+softirq+steal = 155.
  assert.deepEqual(cpu.aggregate, { total: 975, idle: 820 })
  assert.equal(cpu.cores.length, 2)
  assert.deepEqual(cpu.cores[0], { id: 0, total: 487, idle: 410 })

  const meminfo = [
    'MemTotal:       16384000 kB',
    'MemFree:         1048576 kB',
    'MemAvailable:    8388608 kB',
    'Buffers:          524288 kB',
    'Cached:          4194304 kB',
    'SReclaimable:     262144 kB',
    'Shmem:            131072 kB',
    'SwapTotal:       4194304 kB',
    'SwapFree:        3145728 kB',
  ].join('\n')
  const memory = parseMeminfo(meminfo)
  assert.equal(memory.total, 16384000 * 1024)
  assert.equal(memory.used, (16384000 - 8388608) * 1024)
  assert.equal(memory.cached, (4194304 + 262144 - 131072) * 1024)
  assert.equal(memory.swapUsed, (4194304 - 3145728) * 1024)
})

test('the Linux process parser survives a name with spaces and parentheses', () => {
  const stat = '42 (my (odd) name) R 1 42 42 0 -1 4194560 100 0 0 0 120 30 0 0 20 0 7 0 999 123456 250 0 0 0'
  const row = parseProcessStat(stat, 42)
  assert.equal(row.name, 'my (odd) name')
  assert.equal(row.state, 'R')
  // utime + stime, in jiffies: the reader's aggregate is in jiffies too.
  assert.equal(row.cpuTime, 150)
  assert.equal(row.threads, 7)
  assert.equal(row.rssBytes, 250 * 4096)
})

// ---------------------------------------------------------------- macOS

test('a BSD ps time value converts to milliseconds in every shape it prints', () => {
  assert.equal(parseCpuTime('0:00.05'), 50)
  assert.equal(parseCpuTime('1:23.45'), 83_450)
  assert.equal(parseCpuTime('2:03:04'), 7_384_000)
  assert.equal(parseCpuTime('1-00:00:01'), 86_401_000)
  assert.equal(parseCpuTime('-'), undefined, 'a process ps cannot time is unavailable, not zero')
  assert.equal(parseCpuTime('nonsense'), undefined)
})

test('the macOS process table keeps a path with spaces intact', () => {
  const text = [
    '    1 S      0:03.21   12480 /sbin/launchd',
    '  456 R      1:23.45   98304 /Applications/My App.app/Contents/MacOS/My App',
    '  789 S     12:00.00    4096 /usr/libexec/foo',
    'not a ps line',
    '',
  ].join('\n')
  const rows = parsePs(text)
  assert.equal(rows.length, 3)
  assert.deepEqual(
    rows.map((row) => row.pid),
    [1, 456, 789],
  )
  assert.equal(rows[1].name, 'My App', 'the basename is taken, spaces and all')
  assert.equal(rows[1].state, 'R')
  assert.equal(rows[1].cpuTime, 83_450)
  assert.equal(rows[1].rssBytes, 98304 * 1024)
  assert.equal(rows[0].threads, null, 'BSD ps has no portable thread count')
})

test('vm_stat yields reclaimable memory as available, not just free pages', () => {
  const text = [
    'Mach Virtual Memory Statistics: (page size of 16384 bytes)',
    'Pages free:                               10000.',
    'Pages active:                            200000.',
    'Pages inactive:                          100000.',
    'Pages speculative:                         5000.',
    'Pages throttled:                              0.',
    'Pages wired down:                         80000.',
    'Pages purgeable:                           2000.',
    '"Translation faults":                  123456789.',
    'File-backed pages:                        60000.',
    'Anonymous pages:                         240000.',
  ].join('\n')
  const vm = parseVmStat(text)
  assert.equal(vm.pageSize, 16384)
  assert.equal(vm.pages['Pages free'], 10000)
  assert.equal(vm.pages['Translation faults'], 123456789)

  const total = 16 * 1024 ** 3
  const memory = memoryFromVmStat(vm, total)
  const page = 16384
  assert.equal(memory.free, 10000 * page)
  assert.equal(memory.available, (10000 + 100000 + 5000 + 2000) * page)
  assert.equal(memory.cached, 60000 * page)
  assert.equal(memory.used, total - memory.available)
  assert.equal(memory.buffers, null, 'macOS has no separate buffer cache')
})

test('vm.swapusage parses its three figures and tolerates the encrypted suffix', () => {
  const swap = parseSwapusage('total = 8192.00M  used = 1234.56M  free = 6957.44M')
  assert.equal(swap.total, Math.round(8192 * 1024 ** 2))
  assert.equal(swap.used, Math.round(1234.56 * 1024 ** 2))
  assert.equal(swap.free, Math.round(6957.44 * 1024 ** 2))
  assert.ok(parseSwapusage('total = 2048.00M  used = 0.00M  free = 2048.00M (encrypted)') !== undefined)
  assert.equal(parseSwapusage(''), undefined)
})

test('the macOS reader reports a failing tool instead of inventing numbers', async () => {
  const run = fakeRunner({
    'vm_stat': 'Mach Virtual Memory Statistics: (page size of 4096 bytes)\nPages free: 100.',
    'sysctl': new CommandError('sysctl', ['-n', 'vm.swapusage'], 'failed'),
    'ps': new CommandError('ps', [], 'ps: illegal option -- o'),
  })
  const sample = await createDarwinReader({ run }).sample()
  assert.ok(sample.cpu.aggregate.total > 0, 'the CPU reading comes from node:os and still works')
  assert.equal(sample.processes.length, 0)
  assert.ok(sample.warnings.some((code) => code.startsWith('processes-unavailable')))
  assert.ok(sample.warnings.includes('swap-unavailable'))
  assert.equal(sample.memory.swapTotal, 0)
})

// ---------------------------------------------------------------- Windows

test('the Windows sample JSON becomes the shared memory and process shapes', () => {
  const payload = JSON.stringify({
    totalKb: 16_384_000,
    freeKb: 4_096_000,
    pageFileTotalKb: 8_388_608,
    pageFileFreeKb: 6_291_456,
    cacheBytes: 2_147_483_648,
    availableBytes: 9_000_000_000,
    processes: [
      { Id: 1, ProcessName: 'explorer', CPU: 12.5, WorkingSet64: 100_000_000, Threads: 42 },
      // Get-Process omits CPU for a process the caller may not open.
      { Id: 2, ProcessName: 'System', CPU: null, WorkingSet64: 50_000, Threads: 7 },
      { Id: null, ProcessName: 'broken' },
    ],
  })
  const parsed = parseWindowsSample(payload, 16_384_000 * 1024)
  assert.equal(parsed.memory.total, 16_384_000 * 1024)
  assert.equal(parsed.memory.available, 9_000_000_000)
  assert.equal(parsed.memory.used, parsed.memory.total - 9_000_000_000)
  assert.equal(parsed.memory.cached, 2_147_483_648)
  assert.equal(parsed.memory.swapTotal, 8_388_608 * 1024)
  assert.equal(parsed.memory.swapUsed, (8_388_608 - 6_291_456) * 1024)
  assert.equal(parsed.processes.length, 2, 'a row without a pid is dropped')
  assert.equal(parsed.processes[0].cpuTime, 12_500, 'CPU seconds convert to the shared millisecond unit')
  assert.equal(parsed.processes[0].threads, 42)
  assert.equal(parsed.processes[0].state, null, 'Windows reports no process state')
  assert.equal(parsed.processes[1].cpuTime, null, 'an unreadable counter stays unavailable')
})

test('ConvertTo-Json emitting a single object is still read as a list', () => {
  const single = JSON.stringify({
    totalKb: 1000,
    freeKb: 500,
    processes: { Id: 7, ProcessName: 'solo', CPU: 1, WorkingSet64: 4096, Threads: 1 },
  })
  const parsed = parseWindowsSample(single, 1000 * 1024)
  assert.equal(parsed.processes.length, 1)
  assert.equal(parsed.processes[0].name, 'solo')
})

test('unreadable PowerShell output is reported, not thrown at the panel', () => {
  const parsed = parseWindowsSample('<html>proxy error</html>', 8 * 1024 ** 3)
  assert.deepEqual(parsed.warnings, ['windows-json-unreadable'])
  assert.equal(parsed.processes.length, 0)
  assert.equal(parsed.memory, undefined)
})

test('the Windows reader keeps its CPU reading when PowerShell is missing', async () => {
  const reader = createWin32Reader({
    available: async () => undefined,
    run: fakeRunner({}),
  })
  const sample = await reader.sample()
  assert.ok(sample.cpu.aggregate.total > 0)
  assert.deepEqual(sample.warnings, ['powershell-missing'])
  assert.equal(sample.processes.length, 0)
})

test('the Windows reader reuses the shell it found and asks for it once', async () => {
  const payload = JSON.stringify({ totalKb: 1000, freeKb: 500, processes: [] })
  const run = fakeRunner({ 'pwsh': payload, 'powershell': payload })
  let probed = 0
  const reader = createWin32Reader({
    run,
    available: async (candidates, runner) => {
      probed += 1
      assert.deepEqual(candidates, ['pwsh', 'powershell'])
      return 'pwsh'
    },
  })
  await reader.sample()
  await reader.sample()
  assert.equal(probed, 1, 'the executable is resolved once, not per sample')
  assert.equal(run.calls.filter((call) => call.includes(SAMPLE_SCRIPT)).length, 2)
  assert.equal(run.calls.filter((call) => call.startsWith('powershell')).length, 0)
})

// ---------------------------------------------------------------- selection

test('each platform gets its reader, and the rest get the honest fallback', () => {
  assert.equal(selectReader('linux').id, 'linux')
  assert.equal(selectReader('darwin').id, 'darwin')
  assert.equal(selectReader('win32').id, 'win32')
  assert.equal(selectReader('freebsd').id, 'generic')
  assert.equal(selectReader('sunos').id, 'generic')
  assert.equal(platformLabel('darwin'), 'macOS')
  assert.equal(platformLabel('win32'), 'Windows')
  assert.equal(platformLabel('freebsd'), 'freebsd')
})

test('the generic fallback answers what node:os can and warns about the rest', async () => {
  const sample = await createGenericReader('freebsd').sample()
  assert.ok(sample.cpu.aggregate.total > 0)
  assert.ok(sample.memory.total > 0)
  assert.equal(sample.processes.length, 0)
  assert.ok(sample.warnings.includes('generic-platform'))
  assert.ok(sample.warnings.some((code) => code.startsWith('no-process-table')))
  assert.equal(sample.memory.swapTotal, 0, 'no swap figure is published as none, not as zero usage')
})

test('the Linux reader is the only one that needs no subprocess', async () => {
  // A cheap guard on the property the README claims: on this machine the Linux
  // reader reads /proc and spawns nothing.
  if (process.platform !== 'linux') return
  const sample = await linuxReader.sample()
  assert.ok(sample.processes.length > 0)
  assert.deepEqual(sample.warnings, [])
  assert.ok(sample.cpu.aggregate.total > 0)
})
