// src/host/metrics.js
import { readFile, readdir } from "node:fs/promises";
import { arch, cpus, hostname, loadavg, platform, release, uptime } from "node:os";
var PAGE_SIZE = 4096;
var READ_CONCURRENCY = 32;
var UNAVAILABLE = null;
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
async function readCpuTimes() {
  const text = await readFile("/proc/stat", "utf8");
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
async function readMemory() {
  const text = await readFile("/proc/meminfo", "utf8");
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
    swapUsed: Math.max(swapTotal - swapFree, 0),
    swapCached: kilobytes.SwapCached ?? 0
  };
}
async function readProcess(pid) {
  let stat;
  try {
    stat = await readFile(`/proc/${pid}/stat`, "utf8");
  } catch {
    return void 0;
  }
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
    pid: Number(pid),
    name: name2,
    state: rest[0] ?? "?",
    utime: num(11),
    // field 14
    stime: num(12),
    // field 15
    threads: num(17),
    // field 20
    rssBytes: num(21) * PAGE_SIZE
    // field 24, in pages
  };
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
async function collect() {
  const at = Date.now();
  const [cpu, memory, processes] = await Promise.all([readCpuTimes(), readMemory(), readProcesses()]);
  return { at, cpu, memory, processes };
}
function hostFacts() {
  const list = cpus();
  return {
    hostname: hostname(),
    platform: platform(),
    arch: arch(),
    release: release(),
    coreCount: list.length,
    model: list[0]?.model ?? "",
    uptimeSeconds: uptime(),
    loadAverage: loadavg()
  };
}
function percent(part, whole) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  const value = part / whole * 100;
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 100);
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
  const memory = {
    total: current.memory.total,
    used: current.memory.used,
    available: current.memory.available,
    free: current.memory.free,
    cached: current.memory.cached,
    buffers: current.memory.buffers,
    percent: percent(current.memory.used, current.memory.total),
    swapTotal: current.memory.swapTotal,
    swapUsed: current.memory.swapUsed,
    swapFree: current.memory.swapFree,
    swapPercent: current.memory.swapTotal > 0 ? percent(current.memory.swapUsed, current.memory.swapTotal) : 0
  };
  const before = previous.processesById ?? new Map(previous.processes.map((process2) => [process2.pid, process2]));
  const processes = current.processes.map((process2) => {
    const earlier = before.get(process2.pid);
    let cpuPercent = UNAVAILABLE;
    if (usable && earlier !== void 0) {
      const delta = process2.utime - earlier.utime + (process2.stime - earlier.stime);
      if (delta >= 0) cpuPercent = delta / totalDelta * coreCount * 100;
    }
    return {
      pid: process2.pid,
      name: process2.name,
      state: process2.state,
      threads: process2.threads,
      rssBytes: process2.rssBytes,
      memPercent: percent(process2.rssBytes, current.memory.total),
      cpuPercent
    };
  });
  return {
    facts: {
      hostname: facts.hostname,
      platform: facts.platform,
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
var SORTERS = {
  cpu: (a, b) => (b.cpuPercent ?? -1) - (a.cpuPercent ?? -1) || b.rssBytes - a.rssBytes,
  mem: (a, b) => b.rssBytes - a.rssBytes || (b.cpuPercent ?? -1) - (a.cpuPercent ?? -1),
  name: (a, b) => a.name.localeCompare(b.name) || a.pid - b.pid
};
function sortProcesses(processes, sort, limit) {
  const sorter = SORTERS[sort] ?? SORTERS.cpu;
  return [...processes].sort(sorter).slice(0, limit);
}
function createSampler(options = {}) {
  const sampleMillis = options.sampleMillis ?? 0;
  const cacheMillis = options.cacheMillis ?? 800;
  let prior;
  let cached;
  let inflight;
  const withIndex = (sample) => ({
    ...sample,
    processesById: new Map(sample.processes.map((process2) => [process2.pid, process2]))
  });
  async function readPair() {
    const current = withIndex(await collect());
    if (prior === void 0) {
      await new Promise((resolve) => setTimeout(resolve, sampleMillis > 0 ? sampleMillis : 150));
      const primed = withIndex(await collect());
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
      inflight ??= readPair().then((pair) => ({ at: Date.now(), reading: derive(pair.before, pair.current) }));
      try {
        cached = await inflight;
      } finally {
        inflight = void 0;
      }
    }
    const { reading } = cached;
    const limit = Math.min(Math.max(Math.trunc(request.limit ?? 60) || 60, 1), 500);
    const requested = typeof request.sort === "string" ? request.sort : "cpu";
    const sort = requested in SORTERS ? requested : "cpu";
    return {
      ...reading,
      sort,
      processCount: reading.processes.length,
      processes: sortProcesses(reading.processes, sort, limit)
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
var DEFAULTS = {
  /** Polling cadence the browser half is told to use. */
  refreshIntervalMs: 2e3,
  /** Rows served per response; the panel asks for fewer when it wants fewer. */
  processLimit: 60,
  /** Consecutive polls inside this window share one reading. */
  cacheMillis: 800,
  /** Length of the priming double sample taken on the first request. */
  sampleMillis: 150
};
function resolveConfig(config) {
  const source = config ?? {};
  const positive = (value, fallback, min, max) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(Math.max(Math.trunc(number), min), max);
  };
  return {
    refreshIntervalMs: positive(source.refreshIntervalMs, DEFAULTS.refreshIntervalMs, 500, 6e4),
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
  const options = resolveConfig(config);
  const supported = process.platform === "linux";
  const sampler = supported ? createSampler(options) : void 0;
  ctx.effect(() => () => sampler?.pending(), "perfmon: drain in-flight sample");
  return ctx.connection.fetch.register({
    path: SNAPSHOT_PATH,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      if (!supported) {
        return json({
          ok: false,
          error: {
            code: "unsupported-platform",
            message: `perfmon reads /proc and therefore supports Linux only; this host is ${process.platform}.`
          }
        }, 501);
      }
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
  name
};
