/**
 * Temperature-source and probe specs.
 *
 * Temperatures are the one reading in this plugin that is *not* differenced, and
 * the one whose sources differ most between platforms — so what is tested here is
 * attribution and honesty rather than arithmetic:
 *
 * - every parser against the real output shape its tool produces, including the
 *   awkward ones (a sensor list that is a single object, a drive counter that
 *   answers 0, a float that has picked up Kelvin-conversion noise);
 * - the bucketing rules that keep a motherboard sensor out of the CPU tile,
 *   which is the mistake this feature exists to avoid;
 * - the probe's cache and staleness behaviour, because on Windows a read costs a
 *   PowerShell call and the panel polls far faster than that.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyHwmon,
  classifyThermalZone,
  readHwmon,
  readThermalZones,
  sensorsFromHwmon,
  sensorsFromThermalZones,
} from '../src/host/temperature/linux.js'
import {
  celsiusFromTenthsKelvin,
  classifyMonitorSensor,
  createWin32Temperature,
  parseTemperatureSample,
  TEMPERATURE_SCRIPT,
} from '../src/host/temperature/win32.js'
import {
  createDarwinTemperature,
  parseIstats,
  parseOsxCpuTemp,
  parsePowermetrics,
} from '../src/host/temperature/darwin.js'
import { createGenericTemperature, parseSysctlTemperatures } from '../src/host/temperature/generic.js'
import {
  createTemperatureProbe,
  groupSensors,
  selectTemperatureSource,
  TEMPERATURE_GROUPS,
  HIDDEN_TEMPERATURE,
} from '../src/host/temperature/index.js'
import { CommandError } from '../src/host/readers/exec.js'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

test('an hwmon chip is placed by its own name, and an unknown chip is not guessed at', () => {
  assert.equal(classifyHwmon('coretemp'), 'cpu')
  assert.equal(classifyHwmon('k10temp'), 'cpu')
  assert.equal(classifyHwmon('amdgpu'), 'gpu')
  assert.equal(classifyHwmon('nvme'), 'disk')
  assert.equal(classifyHwmon('drivetemp'), 'disk')
  assert.equal(classifyHwmon('acpitz'), 'mainboard')
  assert.equal(classifyHwmon('nct6775'), 'mainboard')
  // The whole point: an unrecognised chip is reported as itself, not as the CPU.
  assert.equal(classifyHwmon('some_new_chip'), 'other')
  assert.equal(classifyHwmon(undefined), 'other')
  assert.equal(classifyHwmon('  CoreTemp  '), 'cpu', 'the name is trimmed and case-folded')
})

test('hwmon channels become sensors with their labels, and a channel without a value is dropped', () => {
  const sensors = sensorsFromHwmon('coretemp', {
    name: 'coretemp\n',
    temp1_input: '45000\n',
    temp1_label: 'Package id 0\n',
    temp2_input: '47000\n',
    // No temp2_label: the chip name stands in for it.
    temp3_input: 'not-a-number\n',
  })
  assert.equal(sensors.length, 2, 'a channel with an unreadable value is not a sensor')
  assert.deepEqual(sensors[0], { id: 'coretemp:1', kind: 'cpu', label: 'coretemp Package id 0', celsius: 45 })
  assert.deepEqual(sensors[1], { id: 'coretemp:2', kind: 'cpu', label: 'coretemp', celsius: 47 })
})

test('the thermal zones are the fallback, and their type picks the bucket', () => {
  assert.equal(classifyThermalZone('x86_pkg_temp'), 'cpu')
  assert.equal(classifyThermalZone('acpitz'), 'mainboard')
  assert.equal(classifyThermalZone('nvme'), 'disk')
  assert.equal(classifyThermalZone('something_else'), 'other')
  const sensors = sensorsFromThermalZones([
    { type: 'x86_pkg_temp', milli: 51000 },
    { type: '', milli: 30000 },
  ])
  assert.equal(sensors[0].kind, 'cpu')
  assert.equal(sensors[0].celsius, 51)
  assert.equal(sensors[1].label, 'thermal_zone1', 'an untyped zone is named by its index')
})

test('readHwmon reads a chip tree, and readThermalZones reads the zones', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'perfmon-hwmon-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'hwmon0'))
  await writeFile(join(root, 'hwmon0', 'name'), 'k10temp\n')
  await writeFile(join(root, 'hwmon0', 'temp1_input'), '55000\n')
  await writeFile(join(root, 'hwmon0', 'temp1_label'), 'Tctl\n')
  // A file that is not a sensor must be ignored rather than parsed as one.
  await writeFile(join(root, 'hwmon0', 'in0_input'), '12000\n')

  const sensors = await readHwmon(root)
  assert.deepEqual(sensors, [{ id: 'k10temp:1', kind: 'cpu', label: 'k10temp Tctl', celsius: 55 }])

  // A missing tree is an empty answer, never a throw.
  assert.deepEqual(await readHwmon(join(root, 'nope')), [])

  const thermal = await mkdtemp(join(tmpdir(), 'perfmon-thermal-'))
  context.after(() => rm(thermal, { recursive: true, force: true }))
  await mkdir(join(thermal, 'thermal_zone0'))
  await writeFile(join(thermal, 'thermal_zone0', 'type'), 'acpitz\n')
  await writeFile(join(thermal, 'thermal_zone0', 'temp'), '42000\n')
  const zones = await readThermalZones(thermal)
  assert.deepEqual(zones, [{ type: 'acpitz', milli: 42000 }])
  assert.deepEqual(await readThermalZones(join(thermal, 'nope')), [])
})

// ---------------------------------------------------------------- Windows

test('the ACPI zone converts from tenths of a Kelvin, and a bad value is unavailable', () => {
  assert.equal(celsiusFromTenthsKelvin(3010), 27.850000000000023)
  // The trap this guards: Number(null) is 0, which would convert to a confident
  // -273.15 degrees rather than to "no reading".
  assert.equal(celsiusFromTenthsKelvin(null), null)
  assert.equal(celsiusFromTenthsKelvin(undefined), null)
  assert.equal(celsiusFromTenthsKelvin('nonsense'), null)
  assert.equal(celsiusFromTenthsKelvin(NaN), null)
})

test('a hardware monitor sensor is bucketed by its identifier path', () => {
  assert.equal(classifyMonitorSensor('/intelcpu/0/temperature/0', 'CPU Package'), 'cpu')
  assert.equal(classifyMonitorSensor('/amdcpu/0/temperature/2', 'Core #1'), 'cpu')
  assert.equal(classifyMonitorSensor('/nvidiagpu/0/temperature/0', 'GPU Core'), 'gpu')
  assert.equal(classifyMonitorSensor('/atigpu/0/temperature/0', 'GPU Core'), 'gpu')
  assert.equal(classifyMonitorSensor('/hdd/0/temperature/0', 'Temperature'), 'disk')
  assert.equal(classifyMonitorSensor('/nvme/0/temperature/0', 'Temperature'), 'disk')
  assert.equal(classifyMonitorSensor('/lpc/nct6797/temperature/0', 'Temperature #1'), 'mainboard')
  // Memory is a real sensor this card does not draw: it must not be forced into
  // one of the four tiles.
  assert.equal(classifyMonitorSensor('/ram/0/temperature/0', 'DIMM'), 'other')
  assert.equal(classifyMonitorSensor('/battery/0/temperature/0', 'Battery'), 'other')
  // With no identifier, the display name is all there is.
  assert.equal(classifyMonitorSensor('', 'CPU Package'), 'cpu')
  assert.equal(classifyMonitorSensor('', 'GPU Core'), 'gpu')
  assert.equal(classifyMonitorSensor('', 'Motherboard'), 'mainboard')
})

test('the ACPI zone is never published as the CPU temperature', () => {
  // The exact shape this machine produces: one ACPI zone, two drives, one GPU.
  // There is no CPU sensor anywhere, and the ACPI zone must not be promoted into
  // one — a board sensor that does not move under load is not a CPU temperature.
  const payload = JSON.stringify({
    monitors: [],
    monitorSource: null,
    zones: [{ name: 'ACPI\\ThermalZone\\TZ00_0', tenthsKelvin: 3010 }],
    disks: [
      { name: 'ST2000DM005', media: 'HDD', celsius: 37 },
      { name: 'SSD 512GB', media: 'SSD', celsius: 40 },
    ],
    gpus: [{ index: '0', name: 'NVIDIA GeForce GTX 1080 Ti', celsius: 49 }],
  })
  const parsed = parseTemperatureSample(payload)
  const kinds = parsed.sensors.map((sensor) => sensor.kind).sort()
  assert.deepEqual(kinds, ['disk', 'disk', 'gpu', 'mainboard'])
  assert.equal(
    parsed.sensors.some((sensor) => sensor.kind === 'cpu'),
    false,
    'the ACPI zone must never be reported as the CPU',
  )
  const zone = parsed.sensors.find((sensor) => sensor.kind === 'mainboard')
  assert.equal(zone.label, 'TZ00_0', 'the WMI instance name is reduced to its last segment')
  assert.equal(parsed.source, 'windows-cim')
  assert.ok(parsed.warnings.includes('temperature-unavailable') === false, 'four sensors answered')
})

test('a running hardware monitor answers the CPU, and the ACPI zone still only the board', () => {
  const payload = JSON.stringify({
    monitors: [
      { identifier: '/intelcpu/0/temperature/0', name: 'CPU Package', celsius: 61.5 },
      { identifier: '/lpc/nct6797/temperature/0', name: 'System', celsius: 38 },
    ],
    monitorSource: 'root/LibreHardwareMonitor',
    zones: [{ name: 'ACPI\\ThermalZone\\TZ00_0', tenthsKelvin: 3010 }],
    disks: [],
    gpus: [{ index: '0', name: 'GPU', celsius: 70 }],
  })
  const parsed = parseTemperatureSample(payload)
  const cpu = parsed.sensors.find((sensor) => sensor.kind === 'cpu')
  assert.equal(cpu.celsius, 61.5, 'the monitor is the CPU authority when it is running')
  assert.equal(cpu.label, 'CPU Package')
  assert.equal(parsed.sensors.filter((sensor) => sensor.kind === 'mainboard').length, 1)
  assert.equal(parsed.source, 'root/LibreHardwareMonitor')
})

test('a drive whose counter answers zero is not a 0-degree drive', () => {
  const payload = JSON.stringify({
    zones: [],
    disks: [
      { name: 'no-sensor', media: 'HDD', celsius: 0 },
      { name: 'real', media: 'SSD', celsius: 40 },
    ],
    gpus: [],
  })
  const parsed = parseTemperatureSample(payload)
  assert.equal(parsed.sensors.length, 1)
  assert.equal(parsed.sensors[0].label, 'real')
})

test('ConvertTo-Json emitting a single object for each list is still read', () => {
  const payload = JSON.stringify({
    zones: { name: 'ACPI\\ThermalZone\\TZ00_0', tenthsKelvin: 3010 },
    disks: { name: 'SSD', media: 'SSD', celsius: 41 },
    gpus: { index: '0', name: 'GPU', celsius: 50 },
  })
  const parsed = parseTemperatureSample(payload)
  assert.equal(parsed.sensors.length, 3, 'a single object per list is a list of one')
})

test('unreadable temperature output is reported, not thrown at the panel', () => {
  const parsed = parseTemperatureSample('<html>proxy error</html>')
  assert.deepEqual(parsed.sensors, [])
  assert.deepEqual(parsed.warnings, ['temperature-json-unreadable'])
  assert.equal(parsed.source, null)
})

test('the Windows temperature source reports a missing shell and a failed call', async () => {
  const noShell = createWin32Temperature({ available: async () => undefined, run: fakeRunner({}) })
  assert.deepEqual(await noShell.read(), { sensors: [], source: null, warnings: ['powershell-missing'] })

  const failing = createWin32Temperature({
    available: async () => 'pwsh',
    run: fakeRunner({ pwsh: new CommandError('pwsh', [], 'timed out') }),
  })
  const failed = await failing.read()
  assert.equal(failed.sensors.length, 0)
  assert.ok(failed.warnings[0].startsWith('temperature-failed'))
})

test('the Windows source resolves its shell once and reuses it', async () => {
  const payload = JSON.stringify({ zones: [{ name: 'z', tenthsKelvin: 3000 }], disks: [], gpus: [] })
  const run = fakeRunner({ pwsh: payload })
  let probed = 0
  const source = createWin32Temperature({
    run,
    available: async () => {
      probed += 1
      return 'pwsh'
    },
  })
  await source.read()
  await source.read()
  assert.equal(probed, 1, 'the executable is resolved once, not per read')
  assert.equal(run.calls.filter((call) => call.includes(TEMPERATURE_SCRIPT)).length, 2)
})

// ---------------------------------------------------------------- macOS

test('powermetrics die temperatures are read and attributed, other sensors are not', () => {
  const text = [
    'Machine model: MacBookPro18,3',
    'CPU die temperature: 42.75 C',
    'GPU die temperature: 38.00 C',
    'Fan: 1200 rpm',
    'Thermal pressure: Nominal',
    'Battery temperature: 30.5 C',
  ].join('\n')
  const sensors = parsePowermetrics(text)
  assert.equal(sensors.length, 2, 'a battery is not a component this card draws')
  assert.deepEqual(sensors[0], { id: 'powermetrics:CPU die temperature', kind: 'cpu', label: 'CPU die temperature', celsius: 42.75 })
  assert.equal(sensors[1].kind, 'gpu')
})

test('the macOS helper parsers read a bare temperature and an istats table', () => {
  assert.deepEqual(parseOsxCpuTemp('45.0°C\n'), [{ id: 'osx-cpu-temp:cpu', kind: 'cpu', label: 'CPU', celsius: 45 }])
  assert.deepEqual(parseOsxCpuTemp('no sensor found'), [])

  const istats = ['CPU die temperature      45.0°C', 'GPU die temperature      39.5°C', 'Fan 0 speed              1200 rpm'].join('\n')
  const sensors = parseIstats(istats)
  assert.equal(sensors.length, 2)
  assert.equal(sensors[0].kind, 'cpu')
  assert.equal(sensors[0].celsius, 45)
  assert.equal(sensors[1].kind, 'gpu')
})

test('a Mac with no usable helper says the temperature is unavailable', async () => {
  // The stock-Mac case: powermetrics exists but refuses a non-root caller, and
  // neither community helper is installed.
  const run = fakeRunner({ powermetrics: new CommandError('powermetrics', [], 'must be run as root') })
  const source = createDarwinTemperature({
    run,
    available: async (candidates) => (candidates[0] === 'powermetrics' ? 'powermetrics' : undefined),
  })
  const result = await source.read()
  assert.deepEqual(result.sensors, [])
  assert.deepEqual(result.warnings, ['temperature-unavailable'])
})

test('the macOS source falls through to a helper that does answer', async () => {
  const run = fakeRunner({
    powermetrics: new CommandError('powermetrics', [], 'must be run as root'),
    'osx-cpu-temp': '47.5°C\n',
  })
  const source = createDarwinTemperature({
    run,
    available: async (candidates) =>
      candidates[0] === 'powermetrics' || candidates[0] === 'osx-cpu-temp' ? candidates[0] : undefined,
  })
  const result = await source.read()
  assert.equal(result.source, 'osx-cpu-temp')
  assert.equal(result.sensors[0].celsius, 47.5)
})

// ---------------------------------------------------------------- generic

test('a generic platform reads FreeBSD sysctl temperatures, or says unavailable', async (context) => {
  const text = ['dev.cpu.0.temperature: 45.0C', 'dev.cpu.1.temperature: 46.5C', 'kern.ostype: FreeBSD'].join('\n')
  const sensors = parseSysctlTemperatures(text)
  assert.equal(sensors.length, 2)
  assert.deepEqual(sensors[0], { id: 'sysctl:dev.cpu.0.temperature', kind: 'cpu', label: 'cpu0', celsius: 45 })

  // The hwmon tree is pinned to an empty directory on purpose. Whether this
  // platform exposes /sys/class/hwmon is a property of the *host*: reading the
  // real one made this spec pass on a machine without /sys and fail on a CI
  // runner that has it, which is exactly the flake the seam exists to remove.
  const noHwmon = await mkdtemp(join(tmpdir(), 'perfmon-nohwmon-'))
  context.after(() => rm(noHwmon, { recursive: true, force: true }))

  const run = fakeRunner({ sysctl: text })
  const source = createGenericTemperature('freebsd', { run, hwmonRoot: noHwmon })
  const result = await source.read()
  assert.equal(result.source, 'sysctl')
  assert.equal(result.sensors.length, 2)

  // No hwmon tree and no sysctl answer: unavailable, with the platform named.
  const bare = createGenericTemperature('sunos', { run: fakeRunner({}), hwmonRoot: noHwmon })
  const empty = await bare.read()
  assert.deepEqual(empty.sensors, [])
  assert.equal(empty.source, null)
  assert.ok(empty.warnings[0].startsWith('temperature-unavailable'))
})

test('a generic platform prefers its hwmon tree over sysctl', async (context) => {
  // The branch the CI runner exercised: a Linux-compatible hwmon tree wins, and
  // sysctl is never consulted — so a platform that has both is not read twice.
  const root = await mkdtemp(join(tmpdir(), 'perfmon-generic-hwmon-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'hwmon0'))
  await writeFile(join(root, 'hwmon0', 'name'), 'k10temp\n')
  await writeFile(join(root, 'hwmon0', 'temp1_input'), '51000\n')

  let sysctlCalls = 0
  const run = async () => {
    sysctlCalls += 1
    return 'dev.cpu.0.temperature: 99.0C'
  }
  const result = await createGenericTemperature('freebsd', { run, hwmonRoot: root }).read()
  assert.equal(result.source, 'hwmon')
  assert.equal(result.sensors[0].celsius, 51)
  assert.equal(sysctlCalls, 0, 'the fallback must not run when hwmon answered')
})

// ---------------------------------------------------------------- aggregation

test('sensors fold into the four tiles, with the hottest as the headline', () => {
  const groups = groupSensors([
    { kind: 'cpu', label: 'Package', celsius: 61 },
    { kind: 'cpu', label: 'Core 0', celsius: 55 },
    { kind: 'cpu', label: 'Core 1', celsius: 67 },
    { kind: 'disk', label: 'sda', celsius: 38 },
    // A kind the card does not draw is dropped rather than forced into a tile.
    { kind: 'other', label: 'DIMM', celsius: 44 },
    { kind: 'gpu', label: 'broken', celsius: null },
  ])
  assert.equal(groups.cpu.celsius, 67, 'the hottest core is the headline')
  assert.equal(groups.cpu.min, 55)
  assert.equal(groups.cpu.max, 67)
  assert.equal(groups.cpu.count, 3)
  assert.equal(groups.disk.count, 1)
  assert.equal(groups.gpu, null, 'a sensor with no value is not a reading')
  assert.equal(groups.mainboard, null)
})

test('every tile is present in the reading, unanswered ones as null', () => {
  const groups = groupSensors([])
  assert.deepEqual(Object.keys(groups).sort(), [...TEMPERATURE_GROUPS].sort())
  for (const kind of TEMPERATURE_GROUPS) assert.equal(groups[kind], null)
})

test('the probe serves its reading from cache, then refreshes behind a stale one', async () => {
  let reads = 0
  let clock = 1000
  const source = {
    id: 'fake',
    async read() {
      reads += 1
      return { sensors: [{ kind: 'cpu', label: 'CPU', celsius: 40 + reads }], source: 'fake', warnings: [] }
    },
  }
  const probe = createTemperatureProbe({ source, intervalMs: 15000, now: () => clock })

  const first = await probe.read()
  assert.equal(reads, 1)
  assert.equal(first.groups.cpu.celsius, 41)
  assert.equal(first.status, 'ready')
  assert.equal(first.source, 'fake')

  // Inside the window: the same reading, no second read.
  clock += 1000
  const cached = await probe.read()
  assert.equal(reads, 1, 'a fresh reading costs nothing')
  assert.equal(cached, first)

  // Past the window: the stale reading is served at once, and a refresh runs.
  clock += 20000
  const stale = await probe.read()
  assert.equal(stale, first, 'the caller is never blocked by a refresh')
  await probe.pending()
  assert.equal(reads, 2, 'the refresh did run behind the caller')
  const fresh = await probe.read()
  assert.equal(fresh.groups.cpu.celsius, 42, 'and the next read serves it')
})

test('the probe waits for its first read, so the first paint carries a number', async () => {
  let resolve
  const gate = new Promise((done) => {
    resolve = done
  })
  const source = {
    id: 'slow',
    async read() {
      await gate
      return { sensors: [{ kind: 'cpu', label: 'CPU', celsius: 50 }], source: 'slow', warnings: [] }
    },
  }
  const probe = createTemperatureProbe({ source, intervalMs: 15000 })
  const pending = probe.read()
  resolve()
  const reading = await pending
  assert.equal(reading.groups.cpu.celsius, 50)
})

test('concurrent callers share one in-flight read', async () => {
  let reads = 0
  const source = {
    id: 'slow',
    async read() {
      reads += 1
      await new Promise((done) => setTimeout(done, 10))
      return { sensors: [], source: 'slow', warnings: [] }
    },
  }
  const probe = createTemperatureProbe({ source, intervalMs: 15000 })
  await Promise.all([probe.read(), probe.read(), probe.read()])
  assert.equal(reads, 1, 'three open panels cost one read between them')
})

test('a source that throws is a reading that explains itself, not a lost snapshot', async () => {
  const probe = createTemperatureProbe({
    source: {
      id: 'broken',
      async read() {
        throw new Error('no sensors today')
      },
    },
    intervalMs: 15000,
  })
  const reading = await probe.read()
  assert.equal(reading.status, 'unavailable')
  assert.ok(reading.warnings[0].startsWith('temperature-failed'))
  // Every tile is still present and null, so the panel renders four dashes
  // rather than a card that failed to appear.
  for (const kind of TEMPERATURE_GROUPS) assert.equal(reading.groups[kind], null)
})

test('an unanswered tile is named in the warnings, once', async () => {
  const probe = createTemperatureProbe({
    source: {
      id: 'partial',
      async read() {
        // A source that already named one of its own gaps.
        return {
          sensors: [{ kind: 'gpu', label: 'GPU', celsius: 50 }],
          source: 'partial',
          warnings: ['temperature-gpu-unavailable'],
        }
      },
    },
    intervalMs: 15000,
  })
  const reading = await probe.read()
  assert.equal(reading.groups.gpu.celsius, 50)
  assert.ok(reading.warnings.includes('temperature-cpu-unavailable'))
  assert.ok(reading.warnings.includes('temperature-mainboard-unavailable'))
  assert.ok(reading.warnings.includes('temperature-disk-unavailable'))
  // The source claimed the GPU was unavailable while answering it: the duplicate
  // is collapsed, so the panel does not show a gap that is not there twice.
  assert.equal(reading.warnings.filter((code) => code === 'temperature-gpu-unavailable').length, 1)
})

test('readings are rounded to the tenth the panel displays', () => {
  const groups = groupSensors([{ kind: 'mainboard', label: 'acpi', celsius: 27.850000000000023 }])
  assert.equal(groups.mainboard.celsius, 27.9)
})

test('each platform gets its temperature source', () => {
  assert.equal(selectTemperatureSource('linux').id, 'linux')
  assert.equal(selectTemperatureSource('win32').id, 'win32')
  assert.equal(selectTemperatureSource('darwin').id, 'darwin')
  assert.equal(selectTemperatureSource('freebsd').id, 'generic')
})

test('the hidden reading names no tiles and carries its own reason', () => {
  assert.equal(HIDDEN_TEMPERATURE.status, 'hidden')
  assert.deepEqual(HIDDEN_TEMPERATURE.warnings, ['temperature-hidden'])
  for (const kind of TEMPERATURE_GROUPS) assert.equal(HIDDEN_TEMPERATURE.groups[kind], null)
})

test('the live Linux source answers on a machine that has sensors, and never throws', async () => {
  if (process.platform !== 'linux') return
  const source = selectTemperatureSource('linux')
  const result = await source.read()
  assert.ok(Array.isArray(result.sensors))
  // A container with no /sys is a legitimate empty answer, not a failure.
  for (const sensor of result.sensors) assert.equal(Number.isFinite(sensor.celsius), true)
})
