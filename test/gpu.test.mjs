/**
 * GPU-source and probe specs. The promise is asymmetric by design: VRAM can be
 * read from OS counters without third-party software, while frequency is only
 * shown when a vendor source can actually answer it.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CommandError } from '../src/host/readers/exec.js'
import {
  createGpuProbe,
  HIDDEN_GPU,
  memoryPercent,
  selectGpuSource,
} from '../src/host/gpu/index.js'
import { createWin32GpuSource, parseGpuSample, GPU_SCRIPT } from '../src/host/gpu/win32.js'
import {
  createLinuxGpuSource,
  parseAmdDpmFrequency,
  parseNvidiaSmi,
  readDrmCard,
} from '../src/host/gpu/linux.js'

/** An injectable command runner, with call recording. */
function fakeRunner(table) {
  const calls = []
  const run = async (command, args) => {
    calls.push([command, ...args].join(' '))
    const key = Object.keys(table).find((candidate) => command === candidate || command.startsWith(candidate))
    if (key === undefined) throw new CommandError(command, args, 'not found', { code: 'ENOENT' })
    const value = table[key]
    if (value instanceof Error) throw value
    const parts = typeof value === 'string' ? [value] : value
    if (Array.isArray(parts)) return parts.map((entry) => `${String(entry)}\n`).join('')
    return typeof value === 'function' ? value(command, args) : value
  }
  run.calls = calls
  return run
}

// ---------------------------------------------------------------- Windows OS counters

test('Windows GPU script uses built-in counters and the 64-bit VRAM registry value', () => {
  assert.match(GPU_SCRIPT, /GPUPerformanceCounters_GPUAdapterMemory/)
  assert.match(GPU_SCRIPT, /HardwareInformation\.qwMemorySize/)
  assert.doesNotMatch(GPU_SCRIPT, /\.AdapterRAM\b/, 'the 32-bit AdapterRAM wraps above 4 GiB')
  assert.match(GPU_SCRIPT, /nvidia-smi/)
  assert.match(GPU_SCRIPT, /root\/LibreHardwareMonitor/)
})

test('Windows parser keeps OS-counter VRAM without third-party data and never invents a clock', () => {
  const parsed = parseGpuSample(JSON.stringify({
    name: 'AMD Radeon RX 7800 XT',
    memoryUsedBytes: 2 * 1024 ** 3,
    memoryTotalBytes: 16 * 1024 ** 3,
    clockMhz: null,
    clockMaxMhz: null,
    source: 'windows-counters',
  }))
  assert.equal(parsed.name, 'AMD Radeon RX 7800 XT')
  assert.equal(parsed.memoryUsedBytes, 2 * 1024 ** 3)
  assert.equal(parsed.memoryTotalBytes, 16 * 1024 ** 3)
  assert.equal(parsed.clockMhz, null, 'OS GPU counters do not expose a clock')
  assert.equal(parsed.warnings.length, 0)
})

test('Windows counter fallback is conservative when several adapters cannot be matched', () => {
  assert.match(GPU_SCRIPT, /\.AdapterLuid/)
  // The source exposes the LUID for diagnostics and doesn't assign an unmatched name.
  assert.match(GPU_SCRIPT, /result\.luid = \[string\]\$matched\.Name/)
  assert.match(GPU_SCRIPT, /DedicatedUsage -Descending/)
})

test('Number(null) cannot manufacture VRAM or a clock', () => {
  const parsed = parseGpuSample(JSON.stringify({
    name: 'generic GPU',
    memoryUsedBytes: null,
    memoryTotalBytes: null,
    clockMhz: null,
    clockMaxMhz: null,
    source: null,
  }))
  assert.equal(parsed.memoryUsedBytes, null)
  assert.equal(parsed.memoryTotalBytes, null)
  assert.equal(parsed.clockMhz, null)
  assert.equal(parsed.clockMaxMhz, null)
})

test('zero VRAM usage is a real reading when total VRAM exists', () => {
  const parsed = parseGpuSample(JSON.stringify({ memoryUsedBytes: 0, memoryTotalBytes: 8 * 1024 ** 3 }))
  assert.equal(parsed.memoryUsedBytes, 0)
  assert.equal(parsed.memoryPercent, undefined, 'percentage is a probe-level derived field')
})

test('the Windows source resolves PowerShell once, then reads one sample per request', async () => {
  const sample = JSON.stringify({ name: 'AMD Radeon', memoryUsedBytes: 1024 ** 3, memoryTotalBytes: 8 * 1024 ** 3, source: 'windows-counters' })
  const run = fakeRunner({ pwsh: sample })
  let probes = 0
  const source = createWin32GpuSource({ run, available: async () => { probes += 1; return 'pwsh' } })
  await source.read()
  await source.read()
  assert.equal(probes, 1)
  assert.equal(run.calls.filter((call) => call.includes(GPU_SCRIPT)).length, 2)
})

test('nvidia-smi with multiple GPUs selects the GPU with the most VRAM in use', () => {
  assert.match(GPU_SCRIPT, /Sort-Object @\{Expression=\{ if \(\$null -eq \$_\.usedMiB\)/)
  assert.match(GPU_SCRIPT, /Select-Object -First 1/)
})


test('a Windows machine with no PowerShell reports unavailable, not zero', async () => {
  const source = createWin32GpuSource({ available: async () => undefined, run: fakeRunner({}) })
  const result = await source.read()
  assert.deepEqual(result.warnings, ['powershell-missing'])
  assert.equal(result.memoryTotalBytes, undefined)
})

// ---------------------------------------------------------------- Linux / generic

test('nvidia-smi parser reads the current and maximum core clocks plus VRAM', () => {
  const parsed = parseNvidiaSmi('NVIDIA GeForce RTX 4090, 23456, 24564, 2520, 2610')
  assert.equal(parsed.name, 'NVIDIA GeForce RTX 4090')
  assert.equal(parsed.memoryUsedBytes, 23456 * 1024 ** 2)
  assert.equal(parsed.memoryTotalBytes, 24564 * 1024 ** 2)
  assert.equal(parsed.clockMhz, 2520)
  assert.equal(parsed.clockMaxMhz, 2610)
  assert.equal(parsed.source, 'nvidia-smi')
})

test('nvidia-smi N/A values remain unavailable rather than zero', () => {
  const parsed = parseNvidiaSmi('GPU, [N/A], [N/A], [N/A], [N/A]')
  assert.equal(parsed.memoryUsedBytes, null)
  assert.equal(parsed.memoryTotalBytes, null)
  assert.equal(parsed.clockMhz, null)
  assert.equal(parsed.clockMaxMhz, null)
  assert.equal(parseNvidiaSmi('not,a,gpu'), undefined)
})

test('AMD DPM parser selects the starred frequency and reports the maximum', () => {
  const dpm = ['0: 500Mhz', '1: 1600Mhz *', '2: 2400Mhz'].join('\n')
  assert.deepEqual(parseAmdDpmFrequency(dpm), { current: 1600, max: 2400 })
  assert.deepEqual(parseAmdDpmFrequency('0: 300Mhz\n1: 1.5Ghz *'), { current: 1500, max: 1500 })
  assert.equal(parseAmdDpmFrequency('0: 500Mhz\n1: 1600Mhz'), undefined, 'no active state means no current clock')
})

test('sysfs reader uses AMD VRAM and clock files without spawning', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'perfmon-gpu-amd-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const device = join(root, 'card0', 'device')
  await mkdir(device, { recursive: true })
  await writeFile(join(device, 'mem_info_vram_used'), `${2 * 1024 ** 3}\n`)
  await writeFile(join(device, 'mem_info_vram_total'), `${16 * 1024 ** 3}\n`)
  await writeFile(join(device, 'gpu_busy_percent'), '88\n')
  await writeFile(join(device, 'pp_dpm_sclk'), '0: 500Mhz\n1: 1700Mhz *\n2: 2500Mhz\n')
  const run = fakeRunner({})
  const result = await createLinuxGpuSource({ drmRoot: root, run, platform: 'linux' }).read()
  assert.equal(result.source, 'sysfs')
  assert.equal(result.memoryUsedBytes, 2 * 1024 ** 3)
  assert.equal(result.memoryTotalBytes, 16 * 1024 ** 3)
  assert.equal(result.clockMhz, 1700)
  assert.equal(result.clockMaxMhz, 2500)
  assert.equal(run.calls.length, 0, 'AMD data came straight from sysfs')
})

test('sysfs reader fills a missing AMD clock from nvidia-smi only when needed', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'perfmon-gpu-partial-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const device = join(root, 'card0', 'device')
  await mkdir(device, { recursive: true })
  await writeFile(join(device, 'mem_info_vram_used'), '1048576\n')
  await writeFile(join(device, 'mem_info_vram_total'), '8388608\n')
  const run = fakeRunner({ nvidia: 'NVIDIA, 10, 20, 1800, 2400' })
  const result = await createLinuxGpuSource({ drmRoot: root, run, platform: 'linux' }).read()
  assert.equal(result.source, 'sysfs+nvidia-smi')
  assert.equal(result.memoryUsedBytes, 1024 * 1024, 'sysfs VRAM wins over nvidia-smi')
  assert.equal(result.clockMhz, 1800, 'nvidia-smi fills the missing clock')
  assert.equal(run.calls.length, 1)
})

test('a generic platform can still use nvidia-smi and is otherwise honestly unavailable', async () => {
  const run = fakeRunner({ nvidia: 'NVIDIA, 1, 8, 1200, 1800' })
  const result = await createLinuxGpuSource({ run, platform: 'freebsd' }).read()
  assert.equal(result.source, 'nvidia-smi')
  assert.equal(result.clockMhz, 1200)
  const absent = await createLinuxGpuSource({ run: fakeRunner({}), platform: 'freebsd' }).read()
  assert.ok(absent.warnings[0].startsWith('gpu-unavailable'))
})

// ---------------------------------------------------------------- probe / aggregation

test('VRAM percentage is bounded and unavailable when inputs are absent', () => {
  assert.equal(memoryPercent(2, 8), 25)
  assert.equal(memoryPercent(9, 8), 100)
  assert.equal(memoryPercent(-1, 8), 0)
  assert.equal(memoryPercent(null, 8), null)
  assert.equal(memoryPercent(1, 0), null)
})

test('GPU probe caches and refreshes behind a stale caller', async () => {
  let reads = 0
  let clock = 1000
  const probe = createGpuProbe({
    intervalMs: 4000,
    now: () => clock,
    source: {
      async read() {
        reads += 1
        return {
          name: 'Model GPU',
          clockMhz: 1000 + reads,
          memoryUsedBytes: reads * 1024,
          memoryTotalBytes: 8 * 1024 ** 3,
          source: 'test',
        }
      },
    },
  })
  const first = await probe.read()
  assert.equal(first.clockMhz, 1001)
  assert.equal(first.memoryPercent, (1024 / (8 * 1024 ** 3)) * 100)
  clock += 1000
  assert.equal(await probe.read(), first, 'fresh reading is reused')
  assert.equal(reads, 1)
  clock += 5000
  assert.equal(await probe.read(), first, 'stale reading is returned immediately')
  await probe.pending()
  assert.equal(reads, 2)
  assert.equal((await probe.read()).clockMhz, 1002)
})

test('hidden GPU reading leaves both figures null and explains nothing', () => {
  assert.equal(HIDDEN_GPU.status, 'hidden')
  assert.equal(HIDDEN_GPU.clockMhz, null)
  assert.equal(HIDDEN_GPU.memoryTotalBytes, null)
  assert.deepEqual(HIDDEN_GPU.warnings, ['gpu-hidden'])
})

test('each platform selects a GPU source without requiring LHM', async () => {
  assert.equal(selectGpuSource('win32').id, 'win32')
  assert.equal(selectGpuSource('linux', { drmRoot: '/not/a/tree' }).id, 'linux')
  assert.equal(selectGpuSource('darwin').id, 'generic')
})
