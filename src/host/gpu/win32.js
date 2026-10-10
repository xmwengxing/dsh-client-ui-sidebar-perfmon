/**
 * Windows GPU source: OS counters for VRAM, a vendor tool for frequency.
 *
 * One PowerShell call answers everything, and it is added to the call the metrics
 * reader already makes rather than spawning a second one — the adapter counters
 * take about 18ms and the combined Windows read is dominated by the existing
 * process-list sample (~700ms), not this row.
 *
 * The three sources inside that call are ordered by how much of the answer each
 * can give, and **each field is taken from the first source that has it**:
 *
 * 1. **The OS's own counters** (`Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory`)
 *    report dedicated VRAM usage for every vendor with nothing installed. Its
 *    LUID instance must match the adapter enumeration's LUID — never just take
 *    the largest figure, which could belong to an unrelated discrete GPU.
 *    The adapter's true 64-bit total comes from the display class registry key
 *    (`HardwareInformation.qwMemorySize`) — deliberately **not**
 *    `Win32_VideoController.AdapterRAM`, which is a 32-bit field and silently
 *    wraps at 4 GiB (this machine's 11 GiB card reports 4293918720 bytes there).
 * 2. **`nvidia-smi`** adds the core clock, which no OS counter exposes; it also
 *    replaces the OS VRAM figure with NVIDIA's exact per-device memory reading.
 * 3. **LibreHardwareMonitor**, when running, is the only source for a clock on
 *    non-NVIDIA hardware, and its GPU clock sensor plus VRAM sensors provide both
 *    figures. WMI matches the identifier path rather than a localized, editable
 *    display name.
 *
 * A machine with several adapters (virtual displays are common — this one has
 * three) is matched by LUID when Windows exposes it; otherwise the OS memory
 * counter chooses the largest active dedicated-usage instance and VRAM total is
 * joined by adapter name. If the OS offers no trustworthy join, the total is left
 * unavailable instead of pairing one GPU's usage with another GPU's capacity.
 *
 * @module dsh-client-ui-sidebar-perfmon/gpu/win32
 */

import { firstAvailable, runCommand } from '../readers/exec.js'

/** PowerShell executables to try, newest name first. */
const POWERSHELL_CANDIDATES = ['pwsh', 'powershell']

/** WMI namespaces a hardware monitor publishes its sensors under. */
export const MONITOR_NAMESPACES = ['root/LibreHardwareMonitor', 'root/OpenHardwareMonitor']

/**
 * The one script a GPU read runs.
 *
 * Every source is independently guarded: a machine with no NVIDIA tool and no
 * hardware monitor still answers with the OS counter's VRAM figures, because one
 * unavailable source must not cost the others. The error preference stays
 * `SilentlyContinue` for the same reason — a missing counter class is expected
 * on some builds, not exceptional.
 */
export const GPU_SCRIPT = [
  '$ErrorActionPreference = "SilentlyContinue"',
  '$result = [ordered]@{ name = $null; luid = $null; memoryUsedBytes = $null; memoryTotalBytes = $null; clockMhz = $null; clockMaxMhz = $null; source = $null }',
  // 1. The OS GPU memory counter is the no-install baseline for any vendor.
  //    Match by LUID when available; some providers omit AdapterLuid, in which
  //    case keep the counter LUID for diagnostics rather than inventing a name.
  '$counters = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory)',
  '$displays = @(Get-CimInstance Win32_VideoController)',
  '$matched = $null',
  'foreach ($display in $displays) {',
  '  if (-not $display.AdapterLuid -or [uint64]$display.AdapterLuid -eq 0) { continue }',
  '  $hex = "{0:X16}" -f [uint64]$display.AdapterLuid',
  '  $luidName = "luid_0x$($hex.Substring(0,8))_0x$($hex.Substring(8,8))_phys_0"',
  '  $matched = $counters | Where-Object { $_.Name -ieq $luidName } | Select-Object -First 1',
  '  if ($matched) { $result.name = [string]$display.Name; $result.luid = $luidName; break }',
  '}',
  'if (-not $matched) { $matched = $counters | Sort-Object DedicatedUsage -Descending | Select-Object -First 1 }',
  'if ($matched) { $result.memoryUsedBytes = [double]$matched.DedicatedUsage; $result.luid = [string]$matched.Name; $result.source = "windows-counters" }',
  // 64-bit display totals. Join by exact name; if this provider can't supply a
  // name and multiple physical adapters exist, leave the total unknown rather
  // than pairing unrelated devices.
  '$class = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}"',
  '$adapters = @(Get-ChildItem $class | ForEach-Object {',
  '  $p = Get-ItemProperty $_.PSPath',
  '  if ($p."HardwareInformation.qwMemorySize") { [pscustomobject]@{ name = [string]$p.DriverDesc; bytes = [double]$p."HardwareInformation.qwMemorySize" } }',
  '})',
  '$totalAdapter = if ($result.name) { $adapters | Where-Object { $_.name -eq $result.name } | Select-Object -First 1 } elseif ($adapters.Count -eq 1) { $adapters[0] }',
  'if ($totalAdapter) { $result.memoryTotalBytes = $totalAdapter.bytes }',
  // 2. nvidia-smi gives an exact NVIDIA name, memory and core clock. Keep the
  //    row with the most VRAM in use for multi-GPU model-inference machines.
  'if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {',
  '  $lines = @(& nvidia-smi --query-gpu=name,memory.used,memory.total,clocks.current.graphics,clocks.max.graphics --format=csv,noheader,nounits 2>$null | Where-Object { $_ -match "," })',
  '  $rows = @($lines | ForEach-Object {',
  '    $f = $_ -split ","',
  '    if ($f.Count -lt 5) { return }',
  '    $usedMiB = $null; $totalMiB = $null; $clock = $null; $maxClock = $null',
  '    try { $usedMiB = [double]$f[1].Trim() } catch { }',
  '    try { $totalMiB = [double]$f[2].Trim() } catch { }',
  '    try { $clock = [double]$f[3].Trim() } catch { }',
  '    try { $maxClock = [double]$f[4].Trim() } catch { }',
  '    [pscustomobject]@{ name = [string]$f[0].Trim(); usedMiB = $usedMiB; totalMiB = $totalMiB; clock = $clock; maxClock = $maxClock }',
  '  } | Sort-Object @{Expression={ if ($null -eq $_.usedMiB) { -1 } else { $_.usedMiB } }; Descending=$true })',
  '  $gpu = $rows | Select-Object -First 1',
  '  if ($gpu) {',
  '    $result.name = $gpu.name',
  '    if ($null -ne $gpu.usedMiB) { $result.memoryUsedBytes = $gpu.usedMiB * 1MB }',
  '    if ($null -ne $gpu.totalMiB) { $result.memoryTotalBytes = $gpu.totalMiB * 1MB }',
  '    if ($null -ne $gpu.clock -and $gpu.clock -gt 0) { $result.clockMhz = $gpu.clock }',
  '    if ($null -ne $gpu.maxClock -and $gpu.maxClock -gt 0) { $result.clockMaxMhz = $gpu.maxClock }',
  '    $result.source = "nvidia-smi"',
  '  }',
  '}',
  // 3. LHM/OHM adds core clock on vendors with no CLI; match by GPU identifier,
  //    not the localized display name.
  'foreach ($ns in @("root/LibreHardwareMonitor", "root/OpenHardwareMonitor")) {',
  '  $sensors = @(Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction SilentlyContinue)',
  '  if ($sensors.Count -eq 0) { continue }',
  '  $core = $sensors | Where-Object { $_.Identifier -match "^/[^/]*gpu[^/]*/[^/]+/clock/0$" } | Select-Object -First 1',
  '  if ($null -eq $result.clockMhz -and $core -and [double]$core.Value -gt 0) { $result.clockMhz = [double]$core.Value; if ($result.source) { $result.source += "+hardware-monitor" } else { $result.source = $ns } }',
  '  $used = $sensors | Where-Object { $_.Identifier -match "/smalldata/1$" } | Select-Object -First 1',
  '  $total = $sensors | Where-Object { $_.Identifier -match "/smalldata/2$" } | Select-Object -First 1',
  '  if ($null -eq $result.memoryUsedBytes -and $used) { $result.memoryUsedBytes = [double]$used.Value * 1MB }',
  '  if ($null -eq $result.memoryTotalBytes -and $total) { $result.memoryTotalBytes = [double]$total.Value * 1MB }',
  '  if ($result.clockMhz -and $result.memoryTotalBytes) { break }',
  '}',
  '$result | ConvertTo-Json -Compress',
].join('\n')

/**
 * Parse the GPU script's JSON into the plugin's reading shape.
 *
 * Every field is optional: a Windows build that omits a counter class, or a
 * machine with no vendor tool, must leave that figure unavailable rather than
 * failing the whole reading. Values arrive as bytes already.
 * @param {string} text - the command's standard output.
 * @returns {object} the parsed figures.
 */
export function parseGpuSample(text) {
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    return { warnings: ['gpu-json-unreadable'] }
  }
  if (payload === null || typeof payload !== 'object') {
    return { warnings: ['gpu-json-unreadable'] }
  }
  // `Number(null)` is 0, so every counter must be a real number before it is
  // believed: a wrapped or absent field would otherwise read as a measured zero.
  const num = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null)
  const used = num(payload.memoryUsedBytes)
  const total = num(payload.memoryTotalBytes)
  return {
    name: typeof payload.name === 'string' && payload.name !== '' ? payload.name : null,
    // A card can genuinely have nothing loaded, so used may be 0 — but only when
    // the source actually said so, which `num` cannot express. `memoryUsedBytes`
    // of exactly 0 is therefore accepted separately.
    memoryUsedBytes:
      used ?? (payload.memoryUsedBytes === 0 && total !== null ? 0 : null),
    memoryTotalBytes: total,
    clockMhz: num(payload.clockMhz),
    clockMaxMhz: num(payload.clockMaxMhz),
    source: typeof payload.source === 'string' ? payload.source : null,
    warnings: [],
  }
}

/**
 * Build the Windows GPU source around one command runner.
 * @param {{run?: (command: string, args: string[], options?: object) => Promise<string>,
 *          available?: (candidates: string[], run?: object) => Promise<string | undefined>}} [options] - injection seam.
 * @returns {object} the source.
 */
export function createWin32GpuSource(options = {}) {
  const run = options.run ?? runCommand
  const find = options.available ?? firstAvailable
  /** @type {string | undefined} */
  let shell

  return {
    id: 'win32',
    async read() {
      shell ??= await find(POWERSHELL_CANDIDATES, run)
      if (shell === undefined) return { warnings: ['powershell-missing'] }
      let text
      try {
        text = await run(shell, ['-NoProfile', '-NonInteractive', '-Command', GPU_SCRIPT], {
          timeoutMs: 20000,
        })
      } catch (error) {
        return { warnings: [`gpu-failed: ${String(error?.message ?? error)}`] }
      }
      return parseGpuSample(text)
    },
  }
}

/** The GPU source for a machine whose `process.platform` is `win32`. */
export const win32GpuSource = createWin32GpuSource()

export default win32GpuSource
