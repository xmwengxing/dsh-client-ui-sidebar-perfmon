/**
 * Temperature sources for Windows: one PowerShell call, four candidate sources.
 *
 * Windows has no single place that answers "how hot is this machine". What it has
 * is a set of sources of very different quality, and the panel's job is to
 * attribute each one to the right component rather than to average them into a
 * number that means nothing:
 *
 * 1. **LibreHardwareMonitor / OpenHardwareMonitor**, when the user runs one. Its
 *    WMI `Sensor` class carries a real per-component reading with an identifier
 *    that names the hardware (`/intelcpu/0/temperature/0`), which is the only
 *    source here that can answer *CPU* at all. This is why it is first.
 * 2. **`MSAcpi_ThermalZoneTemperature`** — the ACPI thermal zone. It is a
 *    *motherboard* sensor by ACPI's own definition, and on many desktop boards it
 *    is a near-constant placeholder that does not move under load (measured: a
 *    fixed 27.9 °C through a full-core burn on the development machine). It is
 *    therefore never published as the CPU temperature, however tempting the
 *    number looks.
 * 3. **`Get-StorageReliabilityCounter`** — a genuine per-drive temperature.
 * 4. **`nvidia-smi`** — the GPU temperature, when an NVIDIA driver ships it.
 *
 * A component no source can answer stays `null` and is named in `warnings`: on a
 * machine with no hardware monitor installed, CPU temperature is genuinely
 * unavailable, and saying so is the point. Filling it with the ACPI zone's
 * placeholder would be a fabricated measurement.
 *
 * @module dsh-client-ui-sidebar-perfmon/temperature/win32
 */

import { firstAvailable, runCommand } from '../readers/exec.js'

/** PowerShell executables to try, newest name first. */
const POWERSHELL_CANDIDATES = ['pwsh', 'powershell']

/** WMI namespaces a hardware monitor publishes its sensors under. */
export const MONITOR_NAMESPACES = ['root/LibreHardwareMonitor', 'root/OpenHardwareMonitor']

/**
 * The one script a temperature read runs.
 *
 * Flat on purpose, and every source independently guarded: a machine without a
 * hardware monitor, without a readable ACPI zone or without an NVIDIA driver
 * still answers with whatever it does have, because one unavailable source must
 * not cost the other three. `$ErrorActionPreference` is `SilentlyContinue`
 * rather than `Stop` for the same reason — a missing WMI class is expected here,
 * not exceptional.
 */
export const TEMPERATURE_SCRIPT = [
  '$ErrorActionPreference = "SilentlyContinue"',
  '$result = [ordered]@{ monitors = @(); monitorSource = $null; zones = @(); disks = @(); gpus = @() }',
  // 1. A hardware monitor, if one is running.
  'foreach ($ns in @("root/LibreHardwareMonitor", "root/OpenHardwareMonitor")) {',
  '  if ($result.monitorSource) { break }',
  '  $found = @(Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction SilentlyContinue |',
  '    Where-Object { $_.SensorType -eq "Temperature" -and $null -ne $_.Value } |',
  '    ForEach-Object { [pscustomobject]@{ identifier = [string]$_.Identifier; name = [string]$_.Name; celsius = [double]$_.Value } })',
  '  if ($found.Count -gt 0) { $result.monitors = $found; $result.monitorSource = $ns }',
  '}',
  // 2. The ACPI thermal zone, in tenths of a degree Kelvin.
  '$result.zones = @(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue |',
  '  ForEach-Object { [pscustomobject]@{ name = [string]$_.InstanceName; tenthsKelvin = $_.CurrentTemperature } })',
  // 3. Per-drive temperature from the storage reliability counter.
  '$result.disks = @(Get-PhysicalDisk -ErrorAction SilentlyContinue | ForEach-Object {',
  '  $disk = $_',
  '  $counter = $null',
  '  try { $counter = $disk | Get-StorageReliabilityCounter -ErrorAction Stop } catch { }',
  '  [pscustomobject]@{ name = [string]$disk.FriendlyName; media = [string]$disk.MediaType; celsius = $(if ($null -ne $counter) { $counter.Temperature } else { $null }) }',
  '} | Where-Object { $null -ne $_.celsius })',
  // 4. An NVIDIA GPU, when the driver ships its own tool.
  'if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {',
  '  $result.gpus = @(& nvidia-smi --query-gpu=index,name,temperature.gpu --format=csv,noheader,nounits 2>$null |',
  '    Where-Object { $_ -match "," } | ForEach-Object {',
  '      $parts = $_ -split ","',
  '      [pscustomobject]@{ index = [string]$parts[0].Trim(); name = [string]$parts[1].Trim(); celsius = [double]$parts[2].Trim() }',
  '    })',
  '}',
  '$result | ConvertTo-Json -Compress -Depth 5',
].join('\n')

/** Buckets the panel renders, in the order it renders them. */
export const TEMPERATURE_KINDS = ['cpu', 'gpu', 'mainboard', 'disk']

/**
 * Place a hardware monitor's sensor in a bucket, from its identifier.
 *
 * LibreHardwareMonitor identifiers are slash-delimited paths whose first segment
 * names the hardware family (`/nvidiagpu/0/temperature/0`), which is a far better
 * key than the sensor's display name — that name is localised and user-editable.
 * @param {string} identifier - the sensor's WMI `Identifier`.
 * @param {string} [name] - the sensor's display name, used only when the identifier is empty.
 * @returns {'cpu' | 'gpu' | 'mainboard' | 'disk' | 'other'} the bucket.
 */
export function classifyMonitorSensor(identifier, name = '') {
  const path = String(identifier ?? '').trim().toLowerCase()
  const head = path.startsWith('/') ? path.slice(1).split('/')[0] : ''
  if (head !== '') {
    // `intelcpu`, `amdcpu`; `nvidiagpu`, `atigpu`, `gpu`; `hdd`, `nvme`, `ssd`.
    if (head.includes('cpu')) return 'cpu'
    if (head.includes('gpu')) return 'gpu'
    if (head === 'hdd' || head === 'nvme' || head === 'ssd') return 'disk'
    // `lpc` is the SuperIO chip a board's own sensors hang off; `ram` is memory
    // and belongs to no bucket this panel draws, so it stays `other`.
    if (head === 'lpc' || head === 'motherboard' || head === 'mainboard' || head === 'superio') {
      return 'mainboard'
    }
    return 'other'
  }
  // No identifier to read: fall back to the display name, which is all there is.
  // The GPU is checked before the CPU because "GPU Core" contains "core" — the
  // CPU rule would otherwise claim every graphics sensor in the machine.
  const text = String(name ?? '').toLowerCase()
  if (text.includes('gpu') || text.includes('graphics')) return 'gpu'
  if (text.includes('cpu') || text.includes('package') || text.includes('core')) return 'cpu'
  if (text.includes('drive') || text.includes('ssd') || text.includes('hdd') || text.includes('nvme')) return 'disk'
  if (text.includes('motherboard') || text.includes('mainboard') || text.includes('chipset')) return 'mainboard'
  return 'other'
}

/**
 * Convert tenths of a degree Kelvin — the ACPI unit — into Celsius.
 *
 * The value is required to be a real number: `Number(null)` is `0`, and a missing
 * `CurrentTemperature` would otherwise convert to a confident, absurd -273.15 °C
 * rather than to "unavailable".
 * @param {unknown} tenths - the raw counter.
 * @returns {number | null} the Celsius reading, or `null` when there is none.
 */
export function celsiusFromTenthsKelvin(tenths) {
  if (typeof tenths !== 'number' || !Number.isFinite(tenths)) return null
  return tenths / 10 - 273.15
}

/**
 * Parse the temperature script's JSON into the plugin's flat sensor list.
 *
 * Sources are applied in descending order of trust *per bucket*: a hardware
 * monitor's CPU reading is the only CPU answer, so the ACPI zone never stands in
 * for it; the zone is only ever the mainboard. A bucket no source can answer is
 * simply absent, and the caller turns that into a warning.
 * @param {string} text - the command's standard output.
 * @returns {{sensors: object[], source: string | null, warnings: string[]}} the parsed reading.
 */
export function parseTemperatureSample(text) {
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    return { sensors: [], source: null, warnings: ['temperature-json-unreadable'] }
  }
  if (payload === null || typeof payload !== 'object') {
    return { sensors: [], source: null, warnings: ['temperature-json-unreadable'] }
  }

  const list = (value) => {
    if (Array.isArray(value)) return value
    if (value === undefined || value === null) return []
    return [value]
  }
  const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

  const sensors = []
  const answered = new Set()

  // 1. The hardware monitor, which is the only source that can answer the CPU.
  for (const entry of list(payload.monitors)) {
    const celsius = finite(entry?.celsius)
    if (celsius === null) continue
    const kind = classifyMonitorSensor(entry?.identifier, entry?.name)
    const label = String(entry?.name ?? '').trim()
    sensors.push({
      id: `monitor:${String(entry?.identifier ?? label)}`,
      kind,
      label: label === '' ? kind : label,
      celsius,
    })
    if (TEMPERATURE_KINDS.includes(kind)) answered.add(kind)
  }

  // 2. The GPU, from the driver's own tool, only when the monitor had none.
  if (!answered.has('gpu')) {
    for (const entry of list(payload.gpus)) {
      const celsius = finite(entry?.celsius)
      if (celsius === null) continue
      const label = String(entry?.name ?? '').trim()
      sensors.push({
        id: `gpu:${String(entry?.index ?? label)}`,
        kind: 'gpu',
        label: label === '' ? 'gpu' : label,
        celsius,
      })
      answered.add('gpu')
    }
  }

  // 3. The mainboard, from the ACPI thermal zone. Never the CPU: the zone is a
  //    board-level sensor, and on many boards it does not move under load at all.
  if (!answered.has('mainboard')) {
    for (const entry of list(payload.zones)) {
      const celsius = celsiusFromTenthsKelvin(entry?.tenthsKelvin)
      if (celsius === null) continue
      // The WMI instance name is `ACPI\ThermalZone\TZ00_0`; the trailing segment
      // is the only part a reader recognises, so that is the label.
      const raw = String(entry?.name ?? '').trim()
      const label = raw.split('\\').filter((part) => part !== '').pop() ?? ''
      sensors.push({
        id: `acpi:${raw}`,
        kind: 'mainboard',
        label: label === '' ? 'ACPI' : label,
        celsius,
      })
      answered.add('mainboard')
    }
  }

  // 4. The drives, from the storage reliability counter.
  if (!answered.has('disk')) {
    for (const entry of list(payload.disks)) {
      const celsius = finite(entry?.celsius)
      // A drive whose counter answers 0 is reporting "no sensor", not "freezing".
      if (celsius === null || celsius <= 0) continue
      const label = String(entry?.name ?? '').trim()
      sensors.push({
        id: `disk:${label}`,
        kind: 'disk',
        label: label === '' ? 'disk' : label,
        celsius,
      })
      answered.add('disk')
    }
  }

  const source =
    typeof payload.monitorSource === 'string' && payload.monitorSource !== ''
      ? payload.monitorSource
      : sensors.length > 0
        ? 'windows-cim'
        : null
  // Per-bucket warnings are the probe's to add: it is the layer that sees every
  // source at once, so emitting them here as well would double every one of them.
  const warnings = []
  if (sensors.length === 0) warnings.push('temperature-unavailable')
  return { sensors, source, warnings }
}

/**
 * Build the Windows temperature source around one command runner.
 * @param {{run?: (command: string, args: string[], options?: object) => Promise<string>,
 *          available?: (candidates: string[], run?: object) => Promise<string | undefined>}} [options] - injection seam.
 * @returns {object} the source.
 */
export function createWin32Temperature(options = {}) {
  const run = options.run ?? runCommand
  const find = options.available ?? firstAvailable
  /** @type {string | undefined} */
  let shell

  return {
    id: 'win32',
    async read() {
      shell ??= await find(POWERSHELL_CANDIDATES, run)
      if (shell === undefined) return { sensors: [], source: null, warnings: ['powershell-missing'] }
      let text
      try {
        // The storage counters are the slow part of this script; a cold call can
        // take a couple of seconds, which the probe's own cadence absorbs.
        text = await run(shell, ['-NoProfile', '-NonInteractive', '-Command', TEMPERATURE_SCRIPT], {
          timeoutMs: 20000,
        })
      } catch (error) {
        return {
          sensors: [],
          source: null,
          warnings: [`temperature-failed: ${String(error?.message ?? error)}`],
        }
      }
      return parseTemperatureSample(text)
    },
  }
}

/** The temperature source for a machine whose `process.platform` is `win32`. */
export const win32Temperature = createWin32Temperature()

export default win32Temperature
