// src/host/du.js
import { lstat as lstatDefault, readdir as readdirDefault } from "node:fs/promises";
import { join, resolve as resolvePath } from "node:path";
var DU_WARNINGS = {
  /** No folder was measured: the scan had no open session carrying a cwd. */
  noRoot: "project-dir-no-cwd",
  /** A scanned folder could not be read at all. */
  rootUnreadable: "project-dir-unavailable",
  /** The entry budget ran out before a walk finished. */
  partial: "project-dir-partial",
  /** At least one subfolder could not be read, so the total is low. */
  skipped: "project-dir-skipped",
  /** The scan was stopped before it finished; the figures are partial. */
  aborted: "project-dir-aborted",
  /** The session a request named could not be resolved to a folder. */
  sessionUnresolved: "project-dir-session-unresolved"
};
function baseReading(dirs) {
  return {
    projectDir: dirs.length === 1 ? dirs[0] : null,
    projectDirs: [],
    projectBytes: null,
    projectEntries: 0,
    projectTruncated: false,
    droppedDirCount: 0,
    warnings: []
  };
}
function resolveProjectDir(config) {
  if (typeof config === "string" && config !== "") return resolvePath(config);
  return null;
}
function createScanController(options = {}) {
  const openCwds = options.openCwds ?? (() => []);
  const fixedDir = typeof options.fixedDir === "string" && options.fixedDir !== "" ? resolvePath(options.fixedDir) : null;
  const entryBudget = Math.max(1, options.entryBudget ?? 5e4);
  const maxDirs = Math.max(1, options.maxDirs ?? 12);
  const now = options.now ?? (() => Date.now());
  const fs = options.fsImpl ?? { readdir: readdirDefault, lstat: lstatDefault };
  const lastByFolder = /* @__PURE__ */ new Map();
  let running = null;
  let droppedCount = 0;
  function distinct(cwds) {
    const seen = /* @__PURE__ */ new Set();
    const dirs = [];
    for (const cwd of cwds) {
      if (typeof cwd !== "string" || cwd === "") continue;
      const dir = resolvePath(cwd);
      if (seen.has(dir)) continue;
      seen.add(dir);
      if (dirs.length < maxDirs) dirs.push(dir);
    }
    return { dirs, dropped: seen.size - dirs.length };
  }
  async function walk(dir, signal, state, isRoot = false) {
    if (signal.aborted) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      state.errors += 1;
      if (isRoot) state.rootRead = false;
      return;
    }
    if (isRoot) state.rootRead = true;
    for (const entry of entries) {
      if (signal.aborted) return;
      if (state.entries >= entryBudget) {
        state.truncated = true;
        return;
      }
      state.entries += 1;
      if (entry.isSymbolicLink()) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path, signal, state);
        continue;
      }
      if (!entry.isFile()) continue;
      if (signal.aborted) return;
      try {
        const info = await fs.lstat(path);
        if (info.isFile()) state.bytes += Number(info.size);
      } catch {
        state.errors += 1;
      }
    }
  }
  async function scan(dirs, controller) {
    const signal = controller.signal;
    const readings = [];
    let passEntries = 0;
    for (const dir of dirs) {
      if (signal.aborted) break;
      const state = { bytes: 0, entries: 0, errors: 0, truncated: false, rootRead: true };
      await walk(dir, signal, state, true);
      passEntries += state.entries;
      if (signal.aborted) {
        if (state.entries > 0 || !state.rootRead) {
          readings.push({
            dir,
            bytes: state.rootRead && state.bytes > 0 ? state.bytes : null,
            entries: state.entries,
            truncated: state.truncated,
            warnings: state.rootRead ? [] : [DU_WARNINGS.rootUnreadable]
          });
        }
        break;
      }
      const warnings = [];
      if (!state.rootRead) {
        readings.push({ dir, bytes: null, entries: state.entries, truncated: false, warnings: [DU_WARNINGS.rootUnreadable] });
        continue;
      }
      if (state.truncated) warnings.push(DU_WARNINGS.partial);
      if (state.errors > 0) warnings.push(DU_WARNINGS.skipped);
      readings.push({ dir, bytes: state.bytes, entries: state.entries, truncated: state.truncated, warnings });
    }
    const aborted = signal.aborted;
    const pass = { readings, aborted, at: now() };
    if (running !== null && running.abort === controller) running = null;
    for (const reading of pass.readings) {
      const warnings = aborted ? [...reading.warnings, DU_WARNINGS.aborted] : reading.warnings;
      lastByFolder.set(reading.dir, { ...reading, warnings, at: pass.at });
    }
    if (!aborted) {
      const live = new Set(dirs);
      for (const dir of [...lastByFolder.keys()]) {
        if (!live.has(dir)) lastByFolder.delete(dir);
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
        const dirs2 = running.dirs;
        const folders2 = dirs2.map((dir) => folderEntry(lastByFolder.get(dir), dir));
        const covered = folders2.filter((entry) => entry !== null);
        const warnings2 = [
          ...covered.some((entry) => entry.bytes !== null) ? [] : [DU_WARNINGS.noRoot],
          ...droppedCount > 0 ? [DU_WARNINGS.dropped] : [],
          ...new Set(covered.flatMap((entry) => entry.warnings))
        ];
        return {
          status: "scanning",
          disk: {
            ...baseReading(dirs2),
            projectDirs: covered,
            projectBytes: covered.some((entry) => entry.bytes !== null) ? covered.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0) : null,
            projectEntries: covered.reduce((sum, entry) => sum + entry.entries, 0),
            projectTruncated: covered.some((entry) => entry.truncated),
            droppedDirCount: droppedCount,
            warnings: warnings2,
            stale: covered.length < dirs2.length
          }
        };
      }
      if (lastByFolder.size === 0) {
        return { status: "idle", disk: null };
      }
      const dirs = [...lastByFolder.keys()];
      const folders = dirs.map((dir) => folderEntry(lastByFolder.get(dir), dir)).filter((entry) => entry !== null);
      const warnings = [
        ...folders.some((entry) => entry.bytes !== null) ? [] : [DU_WARNINGS.rootUnreadable],
        ...droppedCount > 0 ? [DU_WARNINGS.dropped] : [],
        ...new Set(folders.flatMap((entry) => entry.warnings))
      ];
      return {
        status: "done",
        disk: {
          ...baseReading(dirs),
          projectDirs: folders,
          projectBytes: folders.some((entry) => entry.bytes !== null) ? folders.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0) : null,
          projectEntries: folders.reduce((sum, entry) => sum + entry.entries, 0),
          projectTruncated: folders.some((entry) => entry.truncated),
          droppedDirCount: droppedCount,
          warnings,
          stale: false
        }
      };
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
        const previous = running;
        running = null;
        previous.abort.abort();
      }
      let dirs;
      let dropped;
      const target = fixedDir ?? (typeof targetDir === "string" && targetDir !== "" ? targetDir : void 0);
      if (target !== void 0) {
        dirs = [resolvePath(target)];
        dropped = 0;
      } else {
        ;
        ({ dirs, dropped } = distinct(openCwds()));
      }
      if (dirs.length === 0) {
        return { status: "idle", disk: null };
      }
      const abort = new AbortController();
      running = { dirs, abort, startedAt: now() };
      void scan(dirs, abort).catch((error) => {
        running = null;
        lastByFolder.set(dirs[0], { dir: dirs[0], bytes: null, entries: 0, truncated: false, warnings: [`${DU_WARNINGS.rootUnreadable}: ${error?.message ?? String(error)}`], at: now() });
      });
      droppedCount = dropped;
      return this.state();
    },
    /**
     * Stop the running scan, if any. The partial figures measured so far stay
     * published with the `aborted` warning; the panel shows them as partial.
     */
    stop() {
      if (running !== null) {
        const current = running;
        running = null;
        current.abort.abort();
      }
    }
  };
}
function folderEntry(stored, dir) {
  if (stored === void 0) return null;
  return {
    dir,
    bytes: stored.bytes,
    entries: stored.entries,
    truncated: stored.truncated === true,
    warnings: Array.isArray(stored.warnings) ? stored.warnings : []
  };
}

// src/host/gpu/linux.js
import { readFile, readdir } from "node:fs/promises";
import { join as join2 } from "node:path";

// src/host/readers/exec.js
import { execFile } from "node:child_process";
var DEFAULT_TIMEOUT_MS = 5e3;
var CommandError = class extends Error {
  /**
   * @param {string} command - the executable that failed.
   * @param {string[]} args - the arguments it was given.
   * @param {string} reason - the underlying failure message.
   * @param {{code?: number | string, stderr?: string}} [detail] - exit facts.
   */
  constructor(command, args, reason, detail = {}) {
    super(`${command} ${args.join(" ")}: ${reason}`);
    this.name = "CommandError";
    this.command = command;
    this.args = args;
    this.exitCode = detail.code;
    this.stderr = (detail.stderr ?? "").trim();
  }
};
function runCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? 8 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout: timeoutMs, maxBuffer: maxBytes, windowsHide: true, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(
            new CommandError(command, args, error.message, {
              code: error.code,
              stderr: typeof stderr === "string" ? stderr : ""
            })
          );
          return;
        }
        resolve(typeof stdout === "string" ? stdout.replace(/^\uFEFF/, "") : "");
      }
    );
  });
}
async function firstAvailable(candidates, run = runCommand) {
  for (const candidate of candidates) {
    try {
      await run(candidate, ["-NoProfile", "-NonInteractive", "-Command", "exit 0"], { timeoutMs: 4e3 });
      return candidate;
    } catch {
    }
  }
  return void 0;
}

// src/host/gpu/linux.js
var DRM_ROOT = "/sys/class/drm";
var NVIDIA_QUERY = "name,memory.used,memory.total,clocks.current.graphics,clocks.max.graphics";
async function readNumber(path) {
  try {
    const text = await readFile(path, "utf8");
    const value = Number(text.trim());
    return Number.isFinite(value) ? value : void 0;
  } catch {
    return void 0;
  }
}
function parseAmdDpmFrequency(text) {
  const rows = [];
  for (const line of String(text ?? "").split("\n")) {
    const match = /^\s*\d+\s*:\s*(\d+(?:\.\d+)?)\s*(M|G)?[Hh]z\s*(\*)?\s*$/.exec(line);
    if (match === null) continue;
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) continue;
    const scale = String(match[2] ?? "").toUpperCase() === "G" ? 1e3 : 1;
    rows.push({ value: value * scale, active: match[3] === "*" });
  }
  const active = rows.find((row) => row.active);
  if (active === void 0 || rows.length === 0) return void 0;
  return { current: active.value, max: Math.max(...rows.map((row) => row.value)) };
}
async function readDrmCard(cardPath, options = {}) {
  const readText = options.readText ?? ((path) => readFile(path, "utf8"));
  const [vendor, vramUsed, vramTotal, busy, curFreq, maxFreq, amdFreq] = await Promise.all([
    readText(join2(cardPath, "vendor")).then((value) => value.trim().toLowerCase()).catch(() => ""),
    readNumber(join2(cardPath, "mem_info_vram_used")),
    readNumber(join2(cardPath, "mem_info_vram_total")),
    readNumber(join2(cardPath, "gpu_busy_percent")),
    readNumber(join2(cardPath, "gt_cur_freq_mhz")),
    readNumber(join2(cardPath, "gt_max_freq_mhz")),
    (async () => {
      try {
        return parseAmdDpmFrequency(await readText(join2(cardPath, "pp_dpm_sclk")));
      } catch {
        return void 0;
      }
    })()
  ]);
  const fields = {
    vendor,
    vramUsed,
    vramTotal,
    busy,
    curFreq: curFreq ?? amdFreq?.current,
    maxFreq: maxFreq ?? amdFreq?.max
  };
  const answered = Object.values(fields).some((value) => typeof value === "number");
  return { answered, ...fields };
}
function parseNvidiaSmi(line) {
  const parts = String(line ?? "").split(",").map((part) => part.trim());
  if (parts.length < 5) return void 0;
  const num = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const used = num(parts[1]);
  const total = num(parts[2]);
  return {
    name: parts[0] === "" || parts[0] === "[N/A]" ? null : parts[0],
    // MiB to bytes, the unit `--nounits` leaves the memory fields in.
    memoryUsedBytes: used === null ? null : used * 1024 * 1024,
    memoryTotalBytes: total === null ? null : total * 1024 * 1024,
    clockMhz: num(parts[3]),
    clockMaxMhz: num(parts[4]),
    source: "nvidia-smi",
    warnings: []
  };
}
function createLinuxGpuSource(options = {}) {
  const run = options.run ?? runCommand;
  const drmRoot = options.drmRoot ?? DRM_ROOT;
  const platform2 = options.platform ?? process.platform;
  return {
    id: platform2 === "linux" ? "linux" : "generic",
    async read() {
      const warnings = [];
      let result = {};
      if (platform2 === "linux") {
        let cards = [];
        try {
          cards = (await readdir(drmRoot, { withFileTypes: true })).filter((entry) => /^card\d+$/.test(entry.name)).map((entry) => join2(drmRoot, entry.name, "device"));
        } catch {
        }
        for (const card of cards) {
          const facts = await readDrmCard(card);
          if (!facts.answered) continue;
          result = {
            // A card with dedicated VRAM reports it; an integrated one does not,
            // and its clock is still worth having.
            memoryUsedBytes: facts.vramUsed ?? null,
            memoryTotalBytes: facts.vramTotal ?? null,
            clockMhz: facts.curFreq ?? null,
            clockMaxMhz: facts.maxFreq ?? null,
            source: "sysfs"
          };
          break;
        }
      }
      if (result.clockMhz == null || result.memoryTotalBytes == null) {
        try {
          const text = await run(
            "nvidia-smi",
            ["--query-gpu=" + NVIDIA_QUERY, "--format=csv,noheader,nounits"],
            { timeoutMs: 8e3 }
          );
          const first = String(text).split("\n").map((line) => line.trim()).filter((line) => line !== "")[0];
          const parsed = parseNvidiaSmi(first);
          if (parsed !== void 0) {
            result = {
              name: parsed.name,
              memoryUsedBytes: result.memoryUsedBytes ?? parsed.memoryUsedBytes ?? null,
              memoryTotalBytes: result.memoryTotalBytes ?? parsed.memoryTotalBytes ?? null,
              clockMhz: result.clockMhz ?? parsed.clockMhz ?? null,
              clockMaxMhz: result.clockMaxMhz ?? parsed.clockMaxMhz ?? null,
              source: result.source === void 0 ? "nvidia-smi" : `${result.source}+nvidia-smi`
            };
          }
        } catch {
        }
      }
      if (result.source === void 0) {
        warnings.push(`gpu-unavailable: ${platform2}`);
        return { warnings };
      }
      return { ...result, warnings };
    }
  };
}

// src/host/gpu/win32.js
var POWERSHELL_CANDIDATES = ["pwsh", "powershell"];
var GPU_SCRIPT = [
  '$ErrorActionPreference = "SilentlyContinue"',
  "$result = [ordered]@{ name = $null; luid = $null; memoryUsedBytes = $null; memoryTotalBytes = $null; clockMhz = $null; clockMaxMhz = $null; source = $null }",
  // 1. The OS GPU memory counter is the no-install baseline for any vendor.
  //    Match by LUID when available; some providers omit AdapterLuid, in which
  //    case keep the counter LUID for diagnostics rather than inventing a name.
  "$counters = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory)",
  "$displays = @(Get-CimInstance Win32_VideoController)",
  "$matched = $null",
  "foreach ($display in $displays) {",
  "  if (-not $display.AdapterLuid -or [uint64]$display.AdapterLuid -eq 0) { continue }",
  '  $hex = "{0:X16}" -f [uint64]$display.AdapterLuid',
  '  $luidName = "luid_0x$($hex.Substring(0,8))_0x$($hex.Substring(8,8))_phys_0"',
  "  $matched = $counters | Where-Object { $_.Name -ieq $luidName } | Select-Object -First 1",
  "  if ($matched) { $result.name = [string]$display.Name; $result.luid = $luidName; break }",
  "}",
  "if (-not $matched) { $matched = $counters | Sort-Object DedicatedUsage -Descending | Select-Object -First 1 }",
  'if ($matched) { $result.memoryUsedBytes = [double]$matched.DedicatedUsage; $result.luid = [string]$matched.Name; $result.source = "windows-counters" }',
  // 64-bit display totals. Join by exact name; if this provider can't supply a
  // name and multiple physical adapters exist, leave the total unknown rather
  // than pairing unrelated devices.
  '$class = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}"',
  "$adapters = @(Get-ChildItem $class | ForEach-Object {",
  "  $p = Get-ItemProperty $_.PSPath",
  '  if ($p."HardwareInformation.qwMemorySize") { [pscustomobject]@{ name = [string]$p.DriverDesc; bytes = [double]$p."HardwareInformation.qwMemorySize" } }',
  "})",
  "$totalAdapter = if ($result.name) { $adapters | Where-Object { $_.name -eq $result.name } | Select-Object -First 1 } elseif ($adapters.Count -eq 1) { $adapters[0] }",
  "if ($totalAdapter) { $result.memoryTotalBytes = $totalAdapter.bytes }",
  // 2. nvidia-smi gives an exact NVIDIA name, memory and core clock. Keep the
  //    row with the most VRAM in use for multi-GPU model-inference machines.
  "if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {",
  '  $lines = @(& nvidia-smi --query-gpu=name,memory.used,memory.total,clocks.current.graphics,clocks.max.graphics --format=csv,noheader,nounits 2>$null | Where-Object { $_ -match "," })',
  "  $rows = @($lines | ForEach-Object {",
  '    $f = $_ -split ","',
  "    if ($f.Count -lt 5) { return }",
  "    $usedMiB = $null; $totalMiB = $null; $clock = $null; $maxClock = $null",
  "    try { $usedMiB = [double]$f[1].Trim() } catch { }",
  "    try { $totalMiB = [double]$f[2].Trim() } catch { }",
  "    try { $clock = [double]$f[3].Trim() } catch { }",
  "    try { $maxClock = [double]$f[4].Trim() } catch { }",
  "    [pscustomobject]@{ name = [string]$f[0].Trim(); usedMiB = $usedMiB; totalMiB = $totalMiB; clock = $clock; maxClock = $maxClock }",
  "  } | Sort-Object @{Expression={ if ($null -eq $_.usedMiB) { -1 } else { $_.usedMiB } }; Descending=$true })",
  "  $gpu = $rows | Select-Object -First 1",
  "  if ($gpu) {",
  "    $result.name = $gpu.name",
  "    if ($null -ne $gpu.usedMiB) { $result.memoryUsedBytes = $gpu.usedMiB * 1MB }",
  "    if ($null -ne $gpu.totalMiB) { $result.memoryTotalBytes = $gpu.totalMiB * 1MB }",
  "    if ($null -ne $gpu.clock -and $gpu.clock -gt 0) { $result.clockMhz = $gpu.clock }",
  "    if ($null -ne $gpu.maxClock -and $gpu.maxClock -gt 0) { $result.clockMaxMhz = $gpu.maxClock }",
  '    $result.source = "nvidia-smi"',
  "  }",
  "}",
  // 3. LHM/OHM adds core clock on vendors with no CLI; match by GPU identifier,
  //    not the localized display name.
  'foreach ($ns in @("root/LibreHardwareMonitor", "root/OpenHardwareMonitor")) {',
  "  $sensors = @(Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction SilentlyContinue)",
  "  if ($sensors.Count -eq 0) { continue }",
  '  $core = $sensors | Where-Object { $_.Identifier -match "^/[^/]*gpu[^/]*/[^/]+/clock/0$" } | Select-Object -First 1',
  '  if ($null -eq $result.clockMhz -and $core -and [double]$core.Value -gt 0) { $result.clockMhz = [double]$core.Value; if ($result.source) { $result.source += "+hardware-monitor" } else { $result.source = $ns } }',
  '  $used = $sensors | Where-Object { $_.Identifier -match "/smalldata/1$" } | Select-Object -First 1',
  '  $total = $sensors | Where-Object { $_.Identifier -match "/smalldata/2$" } | Select-Object -First 1',
  "  if ($null -eq $result.memoryUsedBytes -and $used) { $result.memoryUsedBytes = [double]$used.Value * 1MB }",
  "  if ($null -eq $result.memoryTotalBytes -and $total) { $result.memoryTotalBytes = [double]$total.Value * 1MB }",
  "  if ($result.clockMhz -and $result.memoryTotalBytes) { break }",
  "}",
  "$result | ConvertTo-Json -Compress"
].join("\n");
function parseGpuSample(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { warnings: ["gpu-json-unreadable"] };
  }
  if (payload === null || typeof payload !== "object") {
    return { warnings: ["gpu-json-unreadable"] };
  }
  const num = (value) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  const used = num(payload.memoryUsedBytes);
  const total = num(payload.memoryTotalBytes);
  return {
    name: typeof payload.name === "string" && payload.name !== "" ? payload.name : null,
    // A card can genuinely have nothing loaded, so used may be 0 — but only when
    // the source actually said so, which `num` cannot express. `memoryUsedBytes`
    // of exactly 0 is therefore accepted separately.
    memoryUsedBytes: used ?? (payload.memoryUsedBytes === 0 && total !== null ? 0 : null),
    memoryTotalBytes: total,
    clockMhz: num(payload.clockMhz),
    clockMaxMhz: num(payload.clockMaxMhz),
    source: typeof payload.source === "string" ? payload.source : null,
    warnings: []
  };
}
function createWin32GpuSource(options = {}) {
  const run = options.run ?? runCommand;
  const find = options.available ?? firstAvailable;
  let shell;
  return {
    id: "win32",
    async read() {
      shell ??= await find(POWERSHELL_CANDIDATES, run);
      if (shell === void 0) return { warnings: ["powershell-missing"] };
      let text;
      try {
        text = await run(shell, ["-NoProfile", "-NonInteractive", "-Command", GPU_SCRIPT], {
          timeoutMs: 2e4
        });
      } catch (error) {
        return { warnings: [`gpu-failed: ${String(error?.message ?? error)}`] };
      }
      return parseGpuSample(text);
    }
  };
}
var win32GpuSource = createWin32GpuSource();

// src/host/gpu/index.js
var HIDDEN_GPU = {
  status: "hidden",
  at: null,
  source: null,
  name: null,
  clockMhz: null,
  clockMaxMhz: null,
  memoryUsedBytes: null,
  memoryTotalBytes: null,
  memoryPercent: null,
  warnings: ["gpu-hidden"]
};
function selectGpuSource(platform2, options = {}) {
  if (platform2 === "win32") return createWin32GpuSource(options);
  return createLinuxGpuSource({ ...options, platform: platform2 });
}
function memoryPercent(used, total) {
  if (typeof used !== "number" || typeof total !== "number") return null;
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null;
  return Math.min(Math.max(used / total * 100, 0), 100);
}
function createGpuProbe(options = {}) {
  const source = options.source ?? selectGpuSource(process.platform);
  const intervalMs = options.intervalMs ?? 4e3;
  const now = options.now ?? Date.now;
  let cached;
  let inflight;
  async function readOnce() {
    let result;
    try {
      result = await source.read();
    } catch (error) {
      result = { warnings: [`gpu-failed: ${String(error?.message ?? error)}`] };
    }
    const num = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
    const used = num(result?.memoryUsedBytes);
    const total = num(result?.memoryTotalBytes);
    const memoryUsedBytes = used ?? (result?.memoryUsedBytes === 0 && total !== null ? 0 : null);
    const name2 = typeof result?.name === "string" && result.name !== "" ? result.name : null;
    const clockMhz = num(result?.clockMhz);
    const warnings = [...result?.warnings ?? []];
    if (total === null) warnings.push("gpu-memory-unavailable");
    if (clockMhz === null) warnings.push("gpu-clock-unavailable");
    return {
      status: total !== null || clockMhz !== null ? "ready" : "unavailable",
      at: now(),
      source: typeof result?.source === "string" ? result.source : null,
      name: name2,
      clockMhz,
      clockMaxMhz: num(result?.clockMaxMhz),
      memoryUsedBytes,
      memoryTotalBytes: total,
      memoryPercent: memoryPercent(memoryUsedBytes, total),
      warnings: [...new Set(warnings)]
    };
  }
  async function read() {
    if (cached !== void 0 && now() - cached.at <= intervalMs) return cached;
    if (cached === void 0) {
      inflight ??= readOnce();
      try {
        cached = await inflight;
      } finally {
        inflight = void 0;
      }
      return cached;
    }
    if (inflight === void 0) {
      inflight = readOnce().then((reading) => {
        cached = reading;
        return reading;
      }).catch(() => cached).finally(() => {
        inflight = void 0;
      });
    }
    return cached;
  }
  return {
    read,
    pending: async () => {
      await inflight;
    }
  };
}

// src/host/metrics.js
import { arch, cpus as cpus4, hostname, loadavg, platform, release, uptime } from "node:os";

// src/host/readers/darwin.js
import { cpus, totalmem } from "node:os";
var DEFAULT_PAGE_SIZE = 4096;
function cpuTimesFromOs() {
  const list = cpus();
  let total = 0;
  let idle = 0;
  const cores = list.map((core, index) => {
    const sum = core.times.user + core.times.nice + core.times.sys + core.times.idle + core.times.irq;
    total += sum;
    idle += core.times.idle;
    return { id: index, total: sum, idle: core.times.idle };
  });
  return { aggregate: { total, idle }, cores };
}
function parseCpuTime(value) {
  const text = value.trim();
  if (text === "" || text === "-") return void 0;
  const days = /^(\d+)-/.exec(text);
  const body = days === null ? text : text.slice(days[0].length);
  const parts = body.split(":");
  if (parts.length < 2 || parts.length > 3) return void 0;
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = parts.length > 0 ? Number(parts.pop()) : 0;
  if (![seconds, minutes, hours].every((part) => Number.isFinite(part))) return void 0;
  const total = (((days === null ? 0 : Number(days[1])) * 24 + hours) * 60 + minutes) * 60 + seconds;
  return Math.round(total * 1e3);
}
function parsePs(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const match = /^\s*(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    if (match === null) continue;
    const [, pid, state, time, rss, comm] = match;
    const name2 = comm.slice(comm.lastIndexOf("/") + 1);
    if (name2 === "") continue;
    rows.push({
      pid: Number(pid),
      name: name2,
      state,
      threads: null,
      // BSD ps has no portable thread-count keyword
      cpuTime: parseCpuTime(time),
      rssBytes: Number(rss) * 1024
      // ps reports resident set in KiB
    });
  }
  return rows;
}
function parseVmStat(text) {
  const header = /page size of (\d+) bytes/.exec(text);
  const pageSize = header === null ? DEFAULT_PAGE_SIZE : Number(header[1]);
  const pages = {};
  for (const line of text.split("\n")) {
    const match = /^"?([A-Za-z][A-Za-z -]*?)"?:\s+(\d+)\.?\s*$/.exec(line.trim());
    if (match === null) continue;
    pages[match[1].trim()] = Number(match[2]);
  }
  return { pageSize, pages };
}
function memoryFromVmStat(vm, total) {
  const bytes = (name2) => (vm.pages[name2] ?? 0) * vm.pageSize;
  const free = bytes("Pages free");
  const reclaimable = bytes("Pages inactive") + bytes("Pages speculative") + bytes("Pages purgeable");
  const available = Math.min(free + reclaimable, total);
  return {
    total,
    available,
    used: Math.max(total - available, 0),
    free,
    buffers: null,
    // no separate buffer cache on macOS
    cached: bytes("File-backed pages"),
    swapTotal: 0,
    swapUsed: 0,
    swapFree: 0
  };
}
function parseSwapusage(text) {
  const field = (name2) => {
    const match = new RegExp(`${name2}\\s*=\\s*([\\d.]+)([KMGTP])?`, "i").exec(text);
    if (match === null) return void 0;
    const scale = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4, P: 1024 ** 5 };
    const bytes = Number(match[1]) * (match[2] === void 0 ? 1 : scale[match[2].toUpperCase()]);
    return Number.isFinite(bytes) ? Math.round(bytes) : void 0;
  };
  const total = field("total");
  const used = field("used");
  const free = field("free");
  if (total === void 0 || used === void 0 || free === void 0) return void 0;
  return { total, used, free };
}
async function readSwap(run) {
  try {
    return parseSwapusage(await run("sysctl", ["-n", "vm.swapusage"]));
  } catch {
    return void 0;
  }
}
function createDarwinReader(options = {}) {
  const run = options.run ?? runCommand;
  return {
    id: "darwin",
    async sample() {
      const at = Date.now();
      const warnings = [];
      const cpu = cpuTimesFromOs();
      const memory = {
        total: 0,
        available: 0,
        used: 0,
        free: 0,
        buffers: null,
        cached: null,
        swapTotal: 0,
        swapUsed: 0,
        swapFree: 0
      };
      try {
        const [vmText, swap] = await Promise.all([
          run("vm_stat", []),
          readSwap(run)
        ]);
        const vm = parseVmStat(vmText);
        Object.assign(memory, memoryFromVmStat(vm, totalmem()));
        if (swap !== void 0) {
          memory.swapTotal = swap.total;
          memory.swapUsed = swap.used;
          memory.swapFree = swap.free;
        } else {
          warnings.push("swap-unavailable");
        }
      } catch (error) {
        warnings.push(`memory-unavailable: ${String(error?.message ?? error)}`);
      }
      let processes = [];
      try {
        processes = parsePs(await run("ps", ["-Ao", "pid=,state=,time=,rss=,comm="]));
      } catch (error) {
        warnings.push(`processes-unavailable: ${String(error?.message ?? error)}`);
      }
      return { at, cpu, memory, processes, warnings };
    }
  };
}
var darwinReader = createDarwinReader();

// src/host/readers/generic.js
import { cpus as cpus2, freemem, totalmem as totalmem2 } from "node:os";
function cpuTimesFromOs2() {
  const list = cpus2();
  let total = 0;
  let idle = 0;
  const cores = list.map((core, index) => {
    const sum = core.times.user + core.times.nice + core.times.sys + core.times.idle + core.times.irq;
    total += sum;
    idle += core.times.idle;
    return { id: index, total: sum, idle: core.times.idle };
  });
  return { aggregate: { total, idle }, cores };
}
function createGenericReader(platform2) {
  return {
    id: "generic",
    async sample() {
      const at = Date.now();
      const total = totalmem2();
      const free = freemem();
      return {
        at,
        cpu: cpuTimesFromOs2(),
        memory: {
          total,
          available: free,
          used: Math.max(total - free, 0),
          free,
          buffers: null,
          cached: null,
          swapTotal: 0,
          swapUsed: 0,
          swapFree: 0
        },
        processes: [],
        warnings: ["generic-platform", `no-process-table:${platform2}`]
      };
    }
  };
}

// src/host/readers/linux.js
import { readFile as readFile2, readdir as readdir2 } from "node:fs/promises";
var PAGE_SIZE = 4096;
var READ_CONCURRENCY = 32;
async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(void 0).map(async () => {
    for (; ; ) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}
function parseCpuTimes(text) {
  let aggregate = { total: 0, idle: 0 };
  const cores = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("cpu")) continue;
    const parts = line.trim().split(/\s+/);
    const label = parts[0];
    const values = parts.slice(1, 9).map(Number);
    if (values.length < 4 || values.some((value) => !Number.isFinite(value))) continue;
    let total = 0;
    for (const value of values) total += value;
    const idle = values[3] + values[4];
    if (label === "cpu") aggregate = { total, idle };
    else cores.push({ id: Number(label.slice(3)), total, idle });
  }
  return { aggregate, cores };
}
function parseMeminfo(text) {
  const kilobytes = {};
  for (const line of text.split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon);
    const value = Number(line.slice(colon + 1).trim().split(/\s+/)[0]);
    if (!Number.isFinite(value)) continue;
    kilobytes[key] = key.startsWith("HugePages") ? value : value * 1024;
  }
  const total = kilobytes.MemTotal ?? 0;
  const available = kilobytes.MemAvailable ?? kilobytes.MemFree ?? 0;
  const cached = (kilobytes.Cached ?? 0) + (kilobytes.SReclaimable ?? 0) - (kilobytes.Shmem ?? 0);
  const swapTotal = kilobytes.SwapTotal ?? 0;
  const swapFree = kilobytes.SwapFree ?? 0;
  return {
    total,
    available,
    used: Math.max(total - available, 0),
    free: kilobytes.MemFree ?? 0,
    buffers: kilobytes.Buffers ?? 0,
    cached: Math.max(cached, 0),
    swapTotal,
    swapFree,
    swapUsed: Math.max(swapTotal - swapFree, 0)
  };
}
function parseProcessStat(stat, pid) {
  const open = stat.indexOf("(");
  const close = stat.lastIndexOf(")");
  if (open < 0 || close < 0) return void 0;
  const name2 = stat.slice(open + 1, close);
  const rest = stat.slice(close + 2).split(" ");
  const num = (index) => {
    const value = Number(rest[index]);
    return Number.isFinite(value) ? value : 0;
  };
  return {
    pid,
    name: name2,
    state: rest[0] ?? "?",
    // Cumulative CPU time in the reader's own unit. Here that unit is jiffies,
    // the same one `/proc/stat` reports, which is all the derivation needs: it
    // only ever differences this value against the aggregate's own delta.
    cpuTime: num(11) + num(12),
    // fields 14 (utime) + 15 (stime)
    threads: num(17),
    // field 20
    rssBytes: num(21) * PAGE_SIZE
    // field 24, in pages
  };
}
async function readProcess(pid) {
  let stat;
  try {
    stat = await readFile2(`/proc/${pid}/stat`, "utf8");
  } catch {
    return void 0;
  }
  return parseProcessStat(stat, Number(pid));
}
async function readProcesses() {
  const entries = await readdir2("/proc", { withFileTypes: true });
  const pids = [];
  for (const entry of entries) {
    if (entry.isDirectory() && /^[0-9]+$/.test(entry.name)) pids.push(entry.name);
  }
  const rows = await mapPool(pids, READ_CONCURRENCY, readProcess);
  return rows.filter((row) => row !== void 0);
}
var linuxReader = {
  id: "linux",
  /** Per-process counters here are jiffies, and so is the aggregate. */
  async sample() {
    const at = Date.now();
    const [stat, meminfo, processes] = await Promise.all([
      readFile2("/proc/stat", "utf8"),
      readFile2("/proc/meminfo", "utf8"),
      readProcesses()
    ]);
    return {
      at,
      cpu: parseCpuTimes(stat),
      memory: parseMeminfo(meminfo),
      processes,
      warnings: []
    };
  }
};

// src/host/readers/win32.js
import { cpus as cpus3, totalmem as totalmem3 } from "node:os";
var POWERSHELL_CANDIDATES2 = ["pwsh", "powershell"];
var SAMPLE_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  "$os = Get-CimInstance Win32_OperatingSystem",
  "$mem = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory",
  '$procs = Get-Process | Select-Object Id, ProcessName, CPU, WorkingSet64, @{ Name = "Threads"; Expression = { $_.Threads.Count } }',
  "[pscustomobject]@{",
  "  totalKb = $os.TotalVisibleMemorySize",
  "  freeKb = $os.FreePhysicalMemory",
  "  pageFileTotalKb = $os.SizeStoredInPagingFiles",
  "  pageFileFreeKb = $os.FreeSpaceInPagingFiles",
  "  cacheBytes = $mem.CacheBytes",
  "  availableBytes = $mem.AvailableBytes",
  "  processes = @($procs)",
  "} | ConvertTo-Json -Compress -Depth 3"
].join("\n");
function cpuTimesFromOs3() {
  const list = cpus3();
  let total = 0;
  let idle = 0;
  const cores = list.map((core, index) => {
    const sum = core.times.user + core.times.nice + core.times.sys + core.times.idle + core.times.irq;
    total += sum;
    idle += core.times.idle;
    return { id: index, total: sum, idle: core.times.idle };
  });
  return { aggregate: { total, idle }, cores };
}
function parseWindowsSample(text, total = totalmem3()) {
  const warnings = [];
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { memory: void 0, processes: [], warnings: ["windows-json-unreadable"] };
  }
  if (payload === null || typeof payload !== "object") {
    return { memory: void 0, processes: [], warnings: ["windows-json-unreadable"] };
  }
  const kb = (value) => Number.isFinite(Number(value)) ? Number(value) * 1024 : void 0;
  const reportedTotal = kb(payload.totalKb);
  const free = kb(payload.freeKb) ?? 0;
  const available = Number.isFinite(Number(payload.availableBytes)) ? Number(payload.availableBytes) : free;
  const memoryTotal = reportedTotal !== void 0 && reportedTotal > 0 ? reportedTotal : total;
  const pageFileTotal = kb(payload.pageFileTotalKb) ?? 0;
  const pageFileFree = kb(payload.pageFileFreeKb) ?? 0;
  const cached = Number.isFinite(Number(payload.cacheBytes)) ? Number(payload.cacheBytes) : null;
  const memory = {
    total: memoryTotal,
    available: Math.min(available, memoryTotal),
    used: Math.max(memoryTotal - Math.min(available, memoryTotal), 0),
    free,
    buffers: null,
    // Windows has no separate buffer cache figure
    cached,
    swapTotal: pageFileTotal,
    swapUsed: Math.max(pageFileTotal - pageFileFree, 0),
    swapFree: pageFileFree
  };
  if (pageFileTotal === 0) warnings.push("swap-unavailable");
  const list = Array.isArray(payload.processes) ? payload.processes : payload.processes === void 0 || payload.processes === null ? [] : [payload.processes];
  const processes = [];
  for (const entry of list) {
    const pid = typeof entry?.Id === "number" ? entry.Id : Number(entry?.Id);
    const name2 = typeof entry?.ProcessName === "string" ? entry.ProcessName : void 0;
    if (!Number.isInteger(pid) || pid <= 0 || name2 === void 0 || name2 === "") continue;
    const numeric = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
    const cpuSeconds = numeric(entry?.CPU);
    const workingSet = numeric(entry?.WorkingSet64);
    processes.push({
      pid,
      name: name2,
      state: null,
      // Windows exposes no single-letter state
      threads: numeric(entry?.Threads),
      // Get-Process omits CPU for a process the caller cannot open.
      cpuTime: cpuSeconds === null ? null : Math.round(cpuSeconds * 1e3),
      rssBytes: workingSet
    });
  }
  if (processes.length === 0) warnings.push("processes-unavailable");
  return { memory, processes, warnings };
}
function createWin32Reader(options = {}) {
  const run = options.run ?? runCommand;
  const find = options.available ?? firstAvailable;
  let shell;
  return {
    id: "win32",
    async sample() {
      const at = Date.now();
      const cpu = cpuTimesFromOs3();
      const warnings = [];
      shell ??= await find(POWERSHELL_CANDIDATES2, run);
      if (shell === void 0) {
        return {
          at,
          cpu,
          memory: void 0,
          processes: [],
          warnings: ["powershell-missing"]
        };
      }
      let text;
      try {
        text = await run(shell, ["-NoProfile", "-NonInteractive", "-Command", SAMPLE_SCRIPT], {
          timeoutMs: 15e3
        });
      } catch (error) {
        return {
          at,
          cpu,
          memory: void 0,
          processes: [],
          warnings: [`powershell-failed: ${String(error?.message ?? error)}`]
        };
      }
      const parsed = parseWindowsSample(text);
      return { at, cpu, memory: parsed.memory, processes: parsed.processes, warnings: [...warnings, ...parsed.warnings] };
    }
  };
}
var win32Reader = createWin32Reader();

// src/host/readers/index.js
function platformLabel(platform2) {
  const labels = { linux: "Linux", darwin: "macOS", win32: "Windows" };
  return labels[platform2] ?? platform2;
}
function selectReader(platform2) {
  if (platform2 === "linux") return linuxReader;
  if (platform2 === "darwin") return darwinReader;
  if (platform2 === "win32") return win32Reader;
  return createGenericReader(platform2);
}

// src/host/metrics.js
var UNAVAILABLE = null;
function hostFacts() {
  const list = cpus4();
  const load = loadavg();
  const hasLoad = platform() !== "win32" && load.some((value) => value > 0);
  return {
    hostname: hostname(),
    platform: platform(),
    platformLabel: platformLabel(platform()),
    arch: arch(),
    release: release(),
    coreCount: list.length,
    model: list[0]?.model ?? "",
    uptimeSeconds: uptime(),
    loadAverage: hasLoad ? load : UNAVAILABLE
  };
}
function percent(part, whole) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  const value = part / whole * 100;
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 100);
}
function optional(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : UNAVAILABLE;
}
function derive(previous, current) {
  const facts = hostFacts();
  const coreCount = current.cpu.cores.length || facts.coreCount || 1;
  const totalDelta = current.cpu.aggregate.total - previous.cpu.aggregate.total;
  const idleDelta = current.cpu.aggregate.idle - previous.cpu.aggregate.idle;
  const usable = totalDelta > 0;
  const cpu = {
    percent: usable ? percent(totalDelta - idleDelta, totalDelta) : UNAVAILABLE,
    coreCount,
    cores: current.cpu.cores.map((core, index) => {
      const before2 = previous.cpu.cores[index];
      if (before2 === void 0) return { id: core.id, percent: UNAVAILABLE };
      const coreTotal = core.total - before2.total;
      if (coreTotal <= 0) return { id: core.id, percent: UNAVAILABLE };
      return { id: core.id, percent: percent(coreTotal - (core.idle - before2.idle), coreTotal) };
    }),
    loadAverage: facts.loadAverage
  };
  const reported = current.memory;
  const memoryTotal = reported?.total ?? 0;
  const swapTotal = reported?.swapTotal ?? 0;
  const memory = reported === void 0 || reported === null ? UNAVAILABLE : {
    total: memoryTotal,
    used: reported.used ?? 0,
    available: reported.available ?? 0,
    free: reported.free ?? 0,
    cached: optional(reported.cached),
    buffers: optional(reported.buffers),
    percent: percent(reported.used ?? 0, memoryTotal),
    swapTotal,
    swapUsed: reported.swapUsed ?? 0,
    swapFree: reported.swapFree ?? 0,
    swapPercent: swapTotal > 0 ? percent(reported.swapUsed ?? 0, swapTotal) : 0
  };
  const before = previous.processesById ?? new Map(previous.processes.map((row) => [row.pid, row]));
  const processes = current.processes.map((process2) => {
    const earlier = before.get(process2.pid);
    const cpuTime = process2.cpuTime;
    let cpuPercent = UNAVAILABLE;
    if (usable && earlier !== void 0 && typeof cpuTime === "number" && typeof earlier.cpuTime === "number") {
      const delta = cpuTime - earlier.cpuTime;
      if (delta >= 0) cpuPercent = delta / totalDelta * coreCount * 100;
    }
    const rss = optional(process2.rssBytes);
    return {
      pid: process2.pid,
      name: process2.name,
      state: process2.state ?? UNAVAILABLE,
      threads: optional(process2.threads),
      rssBytes: rss,
      // A share of an unknown total cannot be computed: a process with a working
      // set on a host whose memory is unreadable still has no percentage.
      memPercent: rss === UNAVAILABLE || memoryTotal <= 0 ? UNAVAILABLE : percent(rss, memoryTotal),
      cpuPercent
    };
  });
  return {
    facts: {
      hostname: facts.hostname,
      platform: facts.platform,
      platformLabel: facts.platformLabel,
      arch: facts.arch,
      release: facts.release,
      coreCount: facts.coreCount,
      model: facts.model,
      uptimeSeconds: facts.uptimeSeconds
    },
    window: { millis: current.at - previous.at, at: current.at },
    cpu,
    memory,
    processes
  };
}
var rank = (value) => typeof value === "number" && Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
var SORTERS = {
  cpu: (a, b) => rank(b.cpuPercent) - rank(a.cpuPercent) || rank(b.rssBytes) - rank(a.rssBytes),
  mem: (a, b) => rank(b.rssBytes) - rank(a.rssBytes) || rank(b.cpuPercent) - rank(a.cpuPercent),
  name: (a, b) => a.name.localeCompare(b.name) || a.pid - b.pid
};
function sortProcesses(processes, sort, limit) {
  const sorter = SORTERS[sort] ?? SORTERS.cpu;
  return [...processes].sort(sorter).slice(0, limit);
}
function createSampler(options = {}) {
  const sampleMillis = options.sampleMillis ?? 0;
  const cacheMillis = options.cacheMillis ?? 800;
  const reader = options.reader ?? selectReader(platform());
  let prior;
  let cached;
  let inflight;
  const withIndex = (sample) => ({
    ...sample,
    processesById: new Map(sample.processes.map((process2) => [process2.pid, process2]))
  });
  async function readPair() {
    const current = withIndex(await reader.sample());
    if (prior === void 0) {
      await new Promise((resolve) => setTimeout(resolve, sampleMillis > 0 ? sampleMillis : 150));
      const primed = withIndex(await reader.sample());
      prior = current;
      return { before: current, current: primed };
    }
    const before = prior;
    prior = current;
    return { before, current };
  }
  async function snapshot(request = {}) {
    const now = Date.now();
    if (cached === void 0 || now - cached.at > cacheMillis) {
      inflight ??= readPair().then((pair) => ({
        at: Date.now(),
        reading: derive(pair.before, pair.current),
        warnings: pair.current.warnings ?? []
      }));
      try {
        cached = await inflight;
      } finally {
        inflight = void 0;
      }
    }
    const limit = Math.min(Math.max(Math.trunc(request.limit ?? 60) || 60, 1), 500);
    const requested = typeof request.sort === "string" ? request.sort : "cpu";
    const sort = requested in SORTERS ? requested : "cpu";
    return {
      ...cached.reading,
      sort,
      warnings: cached.warnings,
      reader: reader.id,
      processCount: cached.reading.processes.length,
      processes: sortProcesses(cached.reading.processes, sort, limit)
    };
  }
  return {
    snapshot,
    pending: async () => {
      await inflight;
    }
  };
}

// src/host/temperature/darwin.js
var DARWIN_HELPERS = ["powermetrics", "osx-cpu-temp", "istats"];
function parsePowermetrics(text) {
  const sensors = [];
  for (const line of String(text ?? "").split("\n")) {
    const match = /^([A-Za-z][^:]*?):\s*(-?[\d.]+)\s*C\s*$/.exec(line.trim());
    if (match === null) continue;
    const label = match[1].trim();
    const celsius = Number(match[2]);
    if (!Number.isFinite(celsius)) continue;
    const kind = /gpu/i.test(label) ? "gpu" : /cpu/i.test(label) ? "cpu" : null;
    if (kind === null) continue;
    sensors.push({ id: `powermetrics:${label}`, kind, label, celsius });
  }
  return sensors;
}
function parseOsxCpuTemp(text) {
  const match = /(-?[\d.]+)\s*°?\s*C/.exec(String(text ?? ""));
  if (match === null) return [];
  const celsius = Number(match[1]);
  if (!Number.isFinite(celsius)) return [];
  return [{ id: "osx-cpu-temp:cpu", kind: "cpu", label: "CPU", celsius }];
}
function parseIstats(text) {
  const sensors = [];
  for (const line of String(text ?? "").split("\n")) {
    const match = /^\s*(.+?)\s{2,}(-?[\d.]+)\s*°?\s*C\s*$/.exec(line);
    if (match === null) continue;
    const label = match[1].trim();
    const celsius = Number(match[2]);
    if (!Number.isFinite(celsius)) continue;
    const kind = /gpu/i.test(label) ? "gpu" : /cpu/i.test(label) ? "cpu" : null;
    if (kind === null) continue;
    sensors.push({ id: `istats:${label}`, kind, label, celsius });
  }
  return sensors;
}
function createDarwinTemperature(options = {}) {
  const run = options.run ?? runCommand;
  const find = options.available ?? firstAvailable;
  return {
    id: "darwin",
    async read() {
      for (const helper of DARWIN_HELPERS) {
        const present = await find([helper], run);
        if (present === void 0) continue;
        const args = helper === "powermetrics" ? ["--samplers", "smc", "-n", "1", "-i", "1000"] : helper === "istats" ? ["--no-graphs"] : [];
        let text;
        try {
          text = await run(helper, args, { timeoutMs: 1e4 });
        } catch (error) {
          if (helper === "powermetrics") continue;
          return {
            sensors: [],
            source: null,
            warnings: [`temperature-failed: ${String(error?.message ?? error)}`]
          };
        }
        const sensors = helper === "powermetrics" ? parsePowermetrics(text) : helper === "istats" ? parseIstats(text) : parseOsxCpuTemp(text);
        if (sensors.length > 0) return { sensors, source: helper, warnings: [] };
      }
      return { sensors: [], source: null, warnings: ["temperature-unavailable"] };
    }
  };
}
var darwinTemperature = createDarwinTemperature();

// src/host/temperature/linux.js
import { readdir as readdir3, readFile as readFile3 } from "node:fs/promises";
import { join as join3 } from "node:path";
var HWMON_ROOT = "/sys/class/hwmon";
var THERMAL_ROOT = "/sys/class/thermal";
var HWMON_KINDS = {
  // CPU packages and cores
  coretemp: "cpu",
  k10temp: "cpu",
  k8temp: "cpu",
  zenpower: "cpu",
  cpu_thermal: "cpu",
  "cpu-thermal": "cpu",
  fam15h_power: "cpu",
  // Discrete and integrated GPUs
  amdgpu: "gpu",
  radeon: "gpu",
  nouveau: "gpu",
  i915: "gpu",
  xe: "gpu",
  // Drives
  nvme: "disk",
  drivetemp: "disk",
  // Boards, embedded controllers and vendor ACPI
  acpitz: "mainboard",
  it87: "mainboard",
  nct6775: "mainboard",
  nct6683: "mainboard",
  nct6687: "mainboard",
  dell_smm: "mainboard",
  "dell-smm-hwmon": "mainboard",
  thinkpad: "mainboard",
  asus: "mainboard",
  "asus-ec-sensors": "mainboard",
  gigabyte_wmi: "mainboard",
  "gigabyte-wmi": "mainboard"
};
var THERMAL_KINDS = [
  ["x86_pkg_temp", "cpu"],
  ["acpitz", "mainboard"],
  ["nvme", "disk"],
  ["iwlwifi", "other"]
];
function classifyHwmon(chip) {
  const key = String(chip ?? "").trim().toLowerCase();
  return HWMON_KINDS[key] ?? "other";
}
function classifyThermalZone(type) {
  const key = String(type ?? "").trim().toLowerCase();
  for (const [prefix, kind] of THERMAL_KINDS) {
    if (key.startsWith(prefix)) return kind;
  }
  return "other";
}
function sensorsFromHwmon(chip, files) {
  const kind = classifyHwmon(chip);
  const name2 = String(chip ?? "").trim() || "hwmon";
  const sensors = [];
  for (const [file, raw] of Object.entries(files)) {
    const match = /^temp(\d+)_input$/.exec(file);
    if (match === null) continue;
    const index = match[1];
    const milli = Number(String(raw).trim());
    if (!Number.isFinite(milli)) continue;
    const label = String(files[`temp${index}_label`] ?? "").trim();
    sensors.push({
      id: `${name2}:${index}`,
      kind,
      label: label === "" ? name2 : `${name2} ${label}`,
      celsius: milli / 1e3
    });
  }
  return sensors;
}
function sensorsFromThermalZones(zones) {
  return zones.map((zone, index) => ({
    id: `zone${String(index)}`,
    kind: classifyThermalZone(zone.type),
    label: zone.type === "" ? `thermal_zone${String(index)}` : zone.type,
    celsius: zone.milli / 1e3
  }));
}
async function readHwmon(root = HWMON_ROOT) {
  let entries;
  try {
    entries = await readdir3(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const sensors = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const dir = join3(root, entry.name);
    let names;
    try {
      names = await readdir3(dir);
    } catch {
      continue;
    }
    const files = {};
    for (const name2 of names) {
      if (name2 !== "name" && !/^temp\d+_(input|label)$/.test(name2)) continue;
      try {
        files[name2] = await readFile3(join3(dir, name2), "utf8");
      } catch {
      }
    }
    const chip = String(files.name ?? entry.name).trim();
    sensors.push(...sensorsFromHwmon(chip, files));
  }
  return sensors;
}
async function readThermalZones(root = THERMAL_ROOT) {
  let entries;
  try {
    entries = await readdir3(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const zones = [];
  for (const entry of entries) {
    if (!entry.name.startsWith("thermal_zone")) continue;
    const dir = join3(root, entry.name);
    try {
      const [type, temp] = await Promise.all([
        readFile3(join3(dir, "type"), "utf8"),
        readFile3(join3(dir, "temp"), "utf8")
      ]);
      const milli = Number(temp.trim());
      if (!Number.isFinite(milli)) continue;
      zones.push({ type: type.trim(), milli });
    } catch {
    }
  }
  return zones;
}
var linuxTemperature = {
  id: "linux",
  /**
   * Read every temperature this machine exposes.
   * @returns {Promise<{sensors: object[], warnings: string[]}>} the reading.
   */
  async read() {
    const hwmon = await readHwmon();
    if (hwmon.length > 0) return { sensors: hwmon, warnings: [] };
    const zones = await readThermalZones();
    return { sensors: sensorsFromThermalZones(zones), warnings: [] };
  }
};

// src/host/temperature/generic.js
function parseSysctlTemperatures(text) {
  const sensors = [];
  for (const line of String(text ?? "").split("\n")) {
    const match = /^(dev\.cpu\.(\d+)\.temperature):\s*(-?[\d.]+)\s*C\s*$/.exec(line.trim());
    if (match === null) continue;
    const celsius = Number(match[3]);
    if (!Number.isFinite(celsius)) continue;
    sensors.push({ id: `sysctl:${match[1]}`, kind: "cpu", label: `cpu${match[2]}`, celsius });
  }
  return sensors;
}
function createGenericTemperature(platform2, options = {}) {
  const run = options.run ?? runCommand;
  const hwmonRoot = options.hwmonRoot;
  return {
    id: "generic",
    async read() {
      const hwmon = hwmonRoot === void 0 ? await readHwmon() : await readHwmon(hwmonRoot);
      if (hwmon.length > 0) return { sensors: hwmon, source: "hwmon", warnings: [] };
      try {
        const text = await run("sysctl", ["-a"], { timeoutMs: 5e3 });
        const sensors = parseSysctlTemperatures(text);
        if (sensors.length > 0) return { sensors, source: "sysctl", warnings: [] };
      } catch {
      }
      return { sensors: [], source: null, warnings: [`temperature-unavailable: ${platform2}`] };
    }
  };
}

// src/host/temperature/win32.js
var POWERSHELL_CANDIDATES3 = ["pwsh", "powershell"];
var TEMPERATURE_SCRIPT = [
  '$ErrorActionPreference = "SilentlyContinue"',
  "$result = [ordered]@{ monitors = @(); monitorSource = $null; zones = @(); disks = @(); gpus = @() }",
  // 1. A hardware monitor, if one is running.
  'foreach ($ns in @("root/LibreHardwareMonitor", "root/OpenHardwareMonitor")) {',
  "  if ($result.monitorSource) { break }",
  "  $found = @(Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction SilentlyContinue |",
  '    Where-Object { $_.SensorType -eq "Temperature" -and $null -ne $_.Value } |',
  "    ForEach-Object { [pscustomobject]@{ identifier = [string]$_.Identifier; name = [string]$_.Name; celsius = [double]$_.Value } })",
  "  if ($found.Count -gt 0) { $result.monitors = $found; $result.monitorSource = $ns }",
  "}",
  // 2. The ACPI thermal zone, in tenths of a degree Kelvin.
  "$result.zones = @(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue |",
  "  ForEach-Object { [pscustomobject]@{ name = [string]$_.InstanceName; tenthsKelvin = $_.CurrentTemperature } })",
  // 3. Per-drive temperature from the storage reliability counter.
  "$result.disks = @(Get-PhysicalDisk -ErrorAction SilentlyContinue | ForEach-Object {",
  "  $disk = $_",
  "  $counter = $null",
  "  try { $counter = $disk | Get-StorageReliabilityCounter -ErrorAction Stop } catch { }",
  "  [pscustomobject]@{ name = [string]$disk.FriendlyName; media = [string]$disk.MediaType; celsius = $(if ($null -ne $counter) { $counter.Temperature } else { $null }) }",
  "} | Where-Object { $null -ne $_.celsius })",
  // 4. An NVIDIA GPU, when the driver ships its own tool.
  "if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {",
  "  $result.gpus = @(& nvidia-smi --query-gpu=index,name,temperature.gpu --format=csv,noheader,nounits 2>$null |",
  '    Where-Object { $_ -match "," } | ForEach-Object {',
  '      $parts = $_ -split ","',
  "      [pscustomobject]@{ index = [string]$parts[0].Trim(); name = [string]$parts[1].Trim(); celsius = [double]$parts[2].Trim() }",
  "    })",
  "}",
  "$result | ConvertTo-Json -Compress -Depth 5"
].join("\n");
var TEMPERATURE_KINDS = ["cpu", "gpu", "mainboard", "disk"];
function isTemperatureReading(name2) {
  const text = String(name2 ?? "").toLowerCase();
  return !text.includes("distance to tjmax") && !text.includes("distance to tj max");
}
function classifyMonitorSensor(identifier, name2 = "") {
  const path = String(identifier ?? "").trim().toLowerCase();
  const head = path.startsWith("/") ? path.slice(1).split("/")[0] : "";
  if (head !== "") {
    if (head.includes("cpu")) return "cpu";
    if (head.includes("gpu")) return "gpu";
    if (head === "hdd" || head === "nvme" || head === "ssd") return "disk";
    if (head === "lpc" || head === "motherboard" || head === "mainboard" || head === "superio") {
      return "mainboard";
    }
    return "other";
  }
  const text = String(name2 ?? "").toLowerCase();
  if (text.includes("gpu") || text.includes("graphics")) return "gpu";
  if (text.includes("cpu") || text.includes("package") || text.includes("core")) return "cpu";
  if (text.includes("drive") || text.includes("ssd") || text.includes("hdd") || text.includes("nvme")) return "disk";
  if (text.includes("motherboard") || text.includes("mainboard") || text.includes("chipset")) return "mainboard";
  return "other";
}
function celsiusFromTenthsKelvin(tenths) {
  if (typeof tenths !== "number" || !Number.isFinite(tenths)) return null;
  return tenths / 10 - 273.15;
}
function parseTemperatureSample(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { sensors: [], source: null, warnings: ["temperature-json-unreadable"] };
  }
  if (payload === null || typeof payload !== "object") {
    return { sensors: [], source: null, warnings: ["temperature-json-unreadable"] };
  }
  const list = (value) => {
    if (Array.isArray(value)) return value;
    if (value === void 0 || value === null) return [];
    return [value];
  };
  const finite = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
  const sensors = [];
  const answered = /* @__PURE__ */ new Set();
  for (const entry of list(payload.monitors)) {
    const celsius = finite(entry?.celsius);
    if (celsius === null) continue;
    if (!isTemperatureReading(entry?.name)) continue;
    const kind = classifyMonitorSensor(entry?.identifier, entry?.name);
    const label = String(entry?.name ?? "").trim();
    sensors.push({
      id: `monitor:${String(entry?.identifier ?? label)}`,
      kind,
      label: label === "" ? kind : label,
      celsius
    });
    if (TEMPERATURE_KINDS.includes(kind)) answered.add(kind);
  }
  if (!answered.has("gpu")) {
    for (const entry of list(payload.gpus)) {
      const celsius = finite(entry?.celsius);
      if (celsius === null) continue;
      const label = String(entry?.name ?? "").trim();
      sensors.push({
        id: `gpu:${String(entry?.index ?? label)}`,
        kind: "gpu",
        label: label === "" ? "gpu" : label,
        celsius
      });
      answered.add("gpu");
    }
  }
  if (!answered.has("mainboard")) {
    for (const entry of list(payload.zones)) {
      const celsius = celsiusFromTenthsKelvin(entry?.tenthsKelvin);
      if (celsius === null) continue;
      const raw = String(entry?.name ?? "").trim();
      const label = raw.split("\\").filter((part) => part !== "").pop() ?? "";
      sensors.push({
        id: `acpi:${raw}`,
        kind: "mainboard",
        label: label === "" ? "ACPI" : label,
        celsius
      });
      answered.add("mainboard");
    }
  }
  if (!answered.has("disk")) {
    for (const entry of list(payload.disks)) {
      const celsius = finite(entry?.celsius);
      if (celsius === null || celsius <= 0) continue;
      const label = String(entry?.name ?? "").trim();
      sensors.push({
        id: `disk:${label}`,
        kind: "disk",
        label: label === "" ? "disk" : label,
        celsius
      });
      answered.add("disk");
    }
  }
  const source = typeof payload.monitorSource === "string" && payload.monitorSource !== "" ? payload.monitorSource : sensors.length > 0 ? "windows-cim" : null;
  const warnings = [];
  if (sensors.length === 0) warnings.push("temperature-unavailable");
  return { sensors, source, warnings };
}
function createWin32Temperature(options = {}) {
  const run = options.run ?? runCommand;
  const find = options.available ?? firstAvailable;
  let shell;
  return {
    id: "win32",
    async read() {
      shell ??= await find(POWERSHELL_CANDIDATES3, run);
      if (shell === void 0) return { sensors: [], source: null, warnings: ["powershell-missing"] };
      let text;
      try {
        text = await run(shell, ["-NoProfile", "-NonInteractive", "-Command", TEMPERATURE_SCRIPT], {
          timeoutMs: 2e4
        });
      } catch (error) {
        return {
          sensors: [],
          source: null,
          warnings: [`temperature-failed: ${String(error?.message ?? error)}`]
        };
      }
      return parseTemperatureSample(text);
    }
  };
}
var win32Temperature = createWin32Temperature();

// src/host/temperature/index.js
var TEMPERATURE_GROUPS = ["cpu", "gpu", "mainboard", "disk"];
function selectTemperatureSource(platform2) {
  if (platform2 === "linux") return linuxTemperature;
  if (platform2 === "darwin") return darwinTemperature;
  if (platform2 === "win32") return win32Temperature;
  return createGenericTemperature(platform2);
}
function roundCelsius(value) {
  return Math.round(value * 10) / 10;
}
function groupSensors(sensors) {
  const byKind = {};
  for (const sensor of sensors) {
    const kind = TEMPERATURE_GROUPS.includes(sensor?.kind) ? sensor.kind : null;
    if (kind === null) continue;
    const celsius = sensor.celsius;
    if (typeof celsius !== "number" || !Number.isFinite(celsius)) continue;
    byKind[kind] ??= [];
    byKind[kind].push({ label: String(sensor.label ?? kind), celsius: roundCelsius(celsius) });
  }
  const groups = {};
  for (const kind of TEMPERATURE_GROUPS) {
    const list = byKind[kind];
    if (list === void 0 || list.length === 0) {
      groups[kind] = null;
      continue;
    }
    const values = list.map((entry) => entry.celsius);
    groups[kind] = {
      // The hottest sensor is the headline: it is the one that matters, and a
      // mean across a package and its cores would understate the peak.
      celsius: Math.max(...values),
      min: Math.min(...values),
      max: Math.max(...values),
      count: list.length,
      sensors: list
    };
  }
  return groups;
}
var HIDDEN_TEMPERATURE = {
  status: "hidden",
  at: null,
  source: null,
  groups: { cpu: null, gpu: null, mainboard: null, disk: null },
  warnings: ["temperature-hidden"]
};
function createTemperatureProbe(options = {}) {
  const source = options.source ?? selectTemperatureSource(process.platform);
  const intervalMs = options.intervalMs ?? 15e3;
  const now = options.now ?? Date.now;
  let cached;
  let inflight;
  async function readOnce() {
    let result;
    try {
      result = await source.read();
    } catch (error) {
      result = { sensors: [], source: null, warnings: [`temperature-failed: ${String(error?.message ?? error)}`] };
    }
    const sensors = Array.isArray(result?.sensors) ? result.sensors : [];
    const groups = groupSensors(sensors);
    const answered = TEMPERATURE_GROUPS.filter((kind) => groups[kind] !== null);
    const warnings = [...result?.warnings ?? []];
    for (const kind of TEMPERATURE_GROUPS) {
      if (groups[kind] === null) warnings.push(`temperature-${kind}-unavailable`);
    }
    return {
      status: answered.length > 0 ? "ready" : "unavailable",
      at: now(),
      source: typeof result?.source === "string" ? result.source : null,
      groups,
      warnings: [...new Set(warnings)]
    };
  }
  async function read() {
    const fresh = cached !== void 0 && now() - cached.at <= intervalMs;
    if (fresh) return cached;
    if (cached === void 0) {
      inflight ??= readOnce();
      try {
        cached = await inflight;
      } finally {
        inflight = void 0;
      }
      return cached;
    }
    if (inflight === void 0) {
      inflight = readOnce().then((reading) => {
        cached = reading;
        return reading;
      }).catch(() => cached).finally(() => {
        inflight = void 0;
      });
    }
    return cached;
  }
  return {
    read,
    pending: async () => {
      await inflight;
    },
    refresh: () => {
      cached = void 0;
    }
  };
}

// src/host/index.js
var name = "dsh-perfmon";
var inject = ["connection"];
var SNAPSHOT_PATH = "/api/perfmon.snapshot";
var DEFAULT_REFRESH_MS = { linux: 2e3, darwin: 3e3, win32: 4e3 };
var DEFAULTS = {
  /** Rows served per response; the panel asks for fewer when it wants fewer. */
  processLimit: 60,
  /** Consecutive polls inside this window share one reading. */
  cacheMillis: 800,
  /** Length of the priming double sample taken on the first request. */
  sampleMillis: 150,
  /** Entries one folder's scan may examine before it reports `truncated`. */
  projectDirEntryBudget: 5e4,
  /** Distinct folders one scan may cover; the rest are counted, not walked. */
  projectDirMaxDirs: 12,
  /**
   * How long one temperature reading is reused.
   *
   * Much calmer than the metrics poll on purpose: a temperature is an absolute
   * reading rather than a counter, and on Windows it costs a PowerShell call of a
   * second or more (the storage reliability counters dominate). Fifteen seconds
   * tracks a thermal trend perfectly well at a fraction of the cost.
   */
  temperatureIntervalMs: 15e3,
  /**
   * How long one GPU reading is reused. Unlike temperature, these figures move
   * quickly while a model loads, so the probe follows the platform's main poll:
   * 2s Linux, 3s macOS, 4s Windows.
   */
  gpuIntervalMs: null
};
function resolveConfig(config, platform2) {
  const source = config ?? {};
  const positive = (value, fallback, min, max) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(Math.max(Math.trunc(number), min), max);
  };
  const projectDirConfig = typeof source.projectDir === "string" || typeof source.projectDir === "boolean" ? source.projectDir : null;
  const temperatureConfig = source.temperature;
  const gpuConfig = source.gpu;
  const refreshIntervalMs = positive(source.refreshIntervalMs, DEFAULT_REFRESH_MS[platform2] ?? 4e3, 500, 6e4);
  return {
    refreshIntervalMs,
    processLimit: positive(source.processLimit, DEFAULTS.processLimit, 5, 500),
    cacheMillis: positive(source.cacheMillis, DEFAULTS.cacheMillis, 0, 1e4),
    sampleMillis: positive(source.sampleMillis, DEFAULTS.sampleMillis, 0, 2e3),
    projectDir: resolveProjectDir(projectDirConfig),
    projectDirHidden: projectDirConfig === "" || projectDirConfig === false,
    projectDirEntryBudget: positive(source.projectDirEntryBudget, DEFAULTS.projectDirEntryBudget, 100, 1e6),
    projectDirMaxDirs: positive(source.projectDirMaxDirs, DEFAULTS.projectDirMaxDirs, 1, 100),
    temperatureHidden: temperatureConfig === false || temperatureConfig === "",
    temperatureIntervalMs: positive(
      source.temperatureIntervalMs,
      DEFAULTS.temperatureIntervalMs,
      2e3,
      6e5
    ),
    gpuHidden: gpuConfig === false || gpuConfig === "",
    gpuIntervalMs: positive(source.gpuIntervalMs, refreshIntervalMs, 500, 6e4)
  };
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
var hiddenDisk = {
  projectDir: null,
  projectDirs: [],
  projectBytes: null,
  projectEntries: 0,
  projectTruncated: false,
  droppedDirCount: 0,
  warnings: ["project-dir-hidden"],
  status: "hidden"
};
function noCwdDisk(detail = "") {
  return {
    projectDir: null,
    projectDirs: [],
    projectBytes: null,
    projectEntries: 0,
    projectTruncated: false,
    droppedDirCount: 0,
    warnings: [detail === "" ? DU_WARNINGS.noRoot : `${DU_WARNINGS.sessionUnresolved}: ${detail}`],
    status: "idle"
  };
}
async function resolveSessionCwd(services, id) {
  if (typeof id !== "string" || id === "") return void 0;
  try {
    const cwd = services?.sessions?.get?.(id)?.header?.cwd;
    if (typeof cwd === "string" && cwd !== "") return cwd;
  } catch {
  }
  try {
    const query = services?.sessionQuery;
    if (query === void 0 || query === null) return void 0;
    const observation = await query.observeSession(id);
    const cwd = observation?.header?.cwd;
    observation?.dispose?.();
    if (typeof cwd === "string" && cwd !== "") return cwd;
  } catch {
  }
  return void 0;
}
function readOpenCwds(store) {
  try {
    const list = store?.list?.();
    if (!Array.isArray(list)) return [];
    return list.map((session) => session?.header?.cwd);
  } catch {
    return [];
  }
}
function apply(ctx, config) {
  const platform2 = process.platform;
  const options = resolveConfig(config, platform2);
  const reader = selectReader(platform2);
  const sampler = createSampler({ sampleMillis: options.sampleMillis, cacheMillis: options.cacheMillis, reader });
  const gpuProbe = createGpuProbe({ intervalMs: options.gpuIntervalMs });
  const temperatureProbe = createTemperatureProbe({ intervalMs: options.temperatureIntervalMs });
  const sessionServices = { sessions: void 0, sessionQuery: void 0 };
  ctx.inject(["sessions"], (serviceCtx) => {
    sessionServices.sessions = serviceCtx.sessions;
  });
  ctx.inject(["sessionQuery"], (serviceCtx) => {
    sessionServices.sessionQuery = serviceCtx.sessionQuery;
  });
  const scanner = createScanController({
    openCwds: () => readOpenCwds(sessionServices.sessions),
    fixedDir: options.projectDir,
    entryBudget: options.projectDirEntryBudget,
    maxDirs: options.projectDirMaxDirs
  });
  ctx.effect(() => () => sampler.pending(), "perfmon: drain in-flight sample");
  ctx.effect(() => () => gpuProbe.pending(), "perfmon: drain in-flight GPU read");
  ctx.effect(() => () => temperatureProbe.pending(), "perfmon: drain in-flight temperature read");
  ctx.effect(
    () => () => scanner.stop(),
    "perfmon: stop any running directory scan"
  );
  return ctx.connection.fetch.register({
    path: SNAPSHOT_PATH,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      let body = {};
      try {
        const text = await request.text();
        if (text.trim() !== "") body = JSON.parse(text);
      } catch {
        return json({ ok: false, error: { code: "bad-request", message: "Request body is not JSON." } }, 400);
      }
      try {
        let startFallback;
        if (options.projectDirHidden) {
        } else if (body?.measure === true) {
          const session = typeof body?.session === "string" && body.session !== "" ? body.session : void 0;
          if (session !== void 0) {
            const sessionCwd = await resolveSessionCwd(sessionServices, session);
            if (typeof sessionCwd === "string") scanner.start(sessionCwd);
            else startFallback = noCwdDisk(session);
          } else {
            scanner.start();
          }
        } else if (body?.measure === false) scanner.stop();
        const reading = await sampler.snapshot({
          sort: body?.sort,
          limit: body?.limit ?? options.processLimit
        });
        let temperature;
        try {
          temperature = options.temperatureHidden ? HIDDEN_TEMPERATURE : await temperatureProbe.read();
        } catch (error) {
          ctx.logger?.warn?.("perfmon: temperature read failed: %s", error?.message ?? String(error));
          temperature = {
            status: "unavailable",
            at: null,
            source: null,
            groups: { cpu: null, gpu: null, mainboard: null, disk: null },
            warnings: ["temperature-unavailable"]
          };
        }
        let gpu;
        try {
          gpu = options.gpuHidden ? HIDDEN_GPU : await gpuProbe.read();
        } catch (error) {
          ctx.logger?.warn?.("perfmon: GPU read failed: %s", error?.message ?? String(error));
          gpu = {
            status: "unavailable",
            at: null,
            source: null,
            name: null,
            clockMhz: null,
            clockMaxMhz: null,
            memoryUsedBytes: null,
            memoryTotalBytes: null,
            memoryPercent: null,
            warnings: ["gpu-unavailable"]
          };
        }
        let disk;
        try {
          disk = options.projectDirHidden ? hiddenDisk : startFallback !== void 0 ? startFallback : scanner.state().disk === null ? noCwdDisk() : { ...scanner.state().disk, status: scanner.state().status };
        } catch (error) {
          ctx.logger?.warn?.("perfmon: project-directory read failed: %s", error?.message ?? String(error));
          disk = {
            projectDir: null,
            projectDirs: [],
            projectBytes: null,
            projectEntries: 0,
            projectTruncated: false,
            droppedDirCount: 0,
            warnings: [DU_WARNINGS.rootUnreadable],
            status: "done"
          };
        }
        return json({
          ok: true,
          value: {
            ...reading,
            disk,
            gpu,
            temperature,
            // A hidden card contributes no warning: the user asked for it to be
            // absent, so there is nothing to explain.
            warnings: [
              ...reading.warnings ?? [],
              ...disk.warnings,
              ...options.gpuHidden ? [] : gpu.warnings,
              ...options.temperatureHidden ? [] : temperature.warnings
            ],
            refreshIntervalMs: options.refreshIntervalMs
          }
        });
      } catch (error) {
        ctx.logger?.warn?.("perfmon: snapshot failed: %s", error?.message ?? String(error));
        return json({
          ok: false,
          error: { code: "internal", message: `Could not read host metrics: ${error?.message ?? String(error)}` }
        }, 500);
      }
    }
  });
}
export {
  SNAPSHOT_PATH,
  apply,
  inject,
  name,
  resolveConfig,
  resolveSessionCwd
};
