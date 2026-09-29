// src/host/metrics.js
import { arch, cpus as cpus4, hostname, loadavg, platform, release, uptime } from "node:os";

// src/host/readers/darwin.js
import { cpus, totalmem } from "node:os";

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

// src/host/readers/darwin.js
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
import { readFile, readdir } from "node:fs/promises";
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
    stat = await readFile(`/proc/${pid}/stat`, "utf8");
  } catch {
    return void 0;
  }
  return parseProcessStat(stat, Number(pid));
}
async function readProcesses() {
  const entries = await readdir("/proc", { withFileTypes: true });
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
      readFile("/proc/stat", "utf8"),
      readFile("/proc/meminfo", "utf8"),
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
var POWERSHELL_CANDIDATES = ["pwsh", "powershell"];
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
      shell ??= await find(POWERSHELL_CANDIDATES, run);
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
  sampleMillis: 150
};
function resolveConfig(config, platform2) {
  const source = config ?? {};
  const positive = (value, fallback, min, max) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(Math.max(Math.trunc(number), min), max);
  };
  return {
    refreshIntervalMs: positive(source.refreshIntervalMs, DEFAULT_REFRESH_MS[platform2] ?? 4e3, 500, 6e4),
    processLimit: positive(source.processLimit, DEFAULTS.processLimit, 5, 500),
    cacheMillis: positive(source.cacheMillis, DEFAULTS.cacheMillis, 0, 1e4),
    sampleMillis: positive(source.sampleMillis, DEFAULTS.sampleMillis, 0, 2e3)
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
function apply(ctx, config) {
  const platform2 = process.platform;
  const options = resolveConfig(config, platform2);
  const reader = selectReader(platform2);
  const sampler = createSampler({ ...options, reader });
  ctx.effect(() => () => sampler.pending(), "perfmon: drain in-flight sample");
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
        const reading = await sampler.snapshot({
          sort: body?.sort,
          limit: body?.limit ?? options.processLimit
        });
        return json({
          ok: true,
          value: {
            ...reading,
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
  resolveConfig
};
