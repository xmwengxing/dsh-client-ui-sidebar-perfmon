# @xmwengxing/dsh-client-ui-sidebar-perfmon

Real-time host performance monitoring for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
right Sidebar: CPU, memory and swap gauges, CPU / GPU / motherboard / drive
temperatures, plus a process table you can sort by CPU, memory or name.

English | [中文](README.zh-CN.md)

```
┌─ 资源占用 ────────────────────── G2 · x64 · 已运行 5d 3h ─┐
│    ◜◝        ◜◝        ◜◝                                │
│   12.5%     39.1%      4.9%                              │
│    CPU      内存     交换内存                             │
│ 4 核 · 负载 1.52   4.5 GB / 11.4 GB   0.4 GB / 8.0 GB    │
├─ 温度 ─────────────────────────────── °C · hwmon ────────┤
│   ┌──────────────┐  ┌──────────────┐                     │
│   │     58.0°C   │  │     47.0°C   │                     │
│   │      CPU     │  │     显卡     │                     │
│   └──────────────┘  └──────────────┘                     │
│   ┌──────────────┐  ┌──────────────┐                     │
│   │     35.0°C   │  │     40.0°C   │                     │
│   │     主板     │  │     硬盘     │                     │
│   └──────────────┘  └──────────────┘                     │
├─ 进程列表 ───────────────────── 共 349 个进程 · 显示 60 行 ┤
│   CPU ↓        内存      进程名                           │
│  筛选进程名或 PID ──────────────────────────────────────  │
│  99.9%      849 MB · 7%  gnome-shell                     │
│  ▬▬▬▬        ▬▬          PID 147112 · 26 线程 · 运行      │
│  35.0%      100 MB · 1%  msedge                          │
│  ▬▬          ▬           PID 740756 · 14 线程 · 睡眠      │
└─────────────── 更新于 15:50:20 · 每 2 秒自动刷新 · 立即刷新 ┘
```

## What it does

The plugin contributes one page type to the right Sidebar and one button to the
Session header:

- **性能监控 / Performance** page — three windows refreshed from one clock:
  - **Resource usage**: ring gauges for CPU, memory and swap, each with its
    percentage, a supporting line (core count and load average, used-of-total,
    or the fact that the host has no swap), and a header naming the host.
  - **Temperatures**: four tiles — CPU, GPU, motherboard and drives — each two
    lines: the reading in °C, then the component's name. The tiles are coloured on
    a cool / warm / hot scale (70 °C and 85 °C). Hovering a tile names every sensor
    it covers and, when a component has several, states the spread; the headline
    is the **hottest** sensor, so a multi-core package or a pair of drives stays
    readable without widening the card. A component no source can answer is a `—`
    whose tooltip says why, never a zero. This card refreshes on its own calmer
    cadence — see [Temperatures](#temperatures).
  - **Processes**: one row per process with CPU share, resident memory and its
    share of RAM, filtered by name or PID. The three tags are the table's column
    headers — `CPU`, `内存`, `进程名`, left to right, each sitting directly above the
    column it orders. `CPU` and `内存` rank every process on the machine by that
    resource, highest first; `进程名` switches to an alphabetical listing. The two
    metric columns never shrink, while the name column takes the remaining width
    and truncates, so a narrow Sidebar loses names before it loses numbers and
    the table never scrolls sideways. A hairline divides the columns and rows.
    The divider beside `CPU` or `内存` is also a drag handle: drag to set that
    column's width, double-click to reset it, or focus it and use the arrow keys
    (Shift for larger steps, Home to reset). The widths are remembered per browser.
- **Performance monitor** button — sits in the Session header's utilities row,
  immediately left of the Sidebar's own expand control, and opens (or focuses)
  the page.

All three windows refresh on the interval the host reports (2 seconds by default).
Polling pauses while the browser tab is hidden and resumes with a fresh reading.
The temperature card is the exception: it moves on its own calmer cadence, because
a temperature is not a counter and on Windows it is expensive to read.

## Requirements

- **Linux, macOS or Windows.** Each platform gets its own reader; see
  [Platform support](#platform-support) for exactly which figures each one can
  answer.
- **DeepSeek Harness `0.2.0-rc.1` or a compatible release.** The plugin registers
  into the right Sidebar's tab-type registry and the Conversation header's
  utilities seat, so it needs a profile that boots `@deepseek-ai/dsh-web-app`
  (the `web` profile does).

No runtime dependencies: the host half uses `node:os` and each platform's own
tools, and the browser half uses React, which the GUI already provides.

## Install

```sh
# From npm
dsh plugin --profile web add @xmwengxing/dsh-client-ui-sidebar-perfmon

# From a local checkout
dsh plugin --profile web add /path/to/dsh-client-ui-sidebar-perfmon

# From git (pnpm must be allowed to run the build first)
dsh plugin --profile web add github:xmwengxing/dsh-client-ui-sidebar-perfmon
```

Then restart the GUI. With pm2 that is:

```sh
pm2 restart deepseek-harness-webui
```

Verify the layer composed before you restart, if you like:

```sh
dsh --profile web --dump-config | grep -A2 perfmon
```

Remove it with `dsh plugin --profile web remove @xmwengxing/dsh-client-ui-sidebar-perfmon`.

## Where to find it

Open the right Sidebar. Its guide page lists a **性能监控** card; picking it opens
the page as a tab. After that, the **性能监控信息** button in the Session header
opens or focuses the same tab, and the tab can be split, dragged or floated like
any other Sidebar page.

## Configuration

The defaults are deliberately calm — one `/proc` walk every two seconds, shared
between every open panel. Override them in a profile patch when you want
something else:

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: perfmon
  name: '@xmwengxing/dsh-client-ui-sidebar-perfmon'
  config:
    refreshIntervalMs: 1000        # 500–60000; default 2000 Linux / 3000 macOS / 4000 Windows
    processLimit: 100              # 5–500; rows served per response
    cacheMillis: 800               # 0–10000; polls inside this window share one reading
    sampleMillis: 150              # 0–2000; length of the first reading's priming sample
    projectDirEntryBudget: 50000   # 100–1000000; entries one folder's scan may examine
    projectDirMaxDirs: 12          # 1–100; distinct folders one scan may cover
    temperatureIntervalMs: 15000   # 2000–600000; how long one temperature reading is reused
    # temperature: false           # hide the temperature card entirely
    # projectDir: /srv/demo        # pin one folder instead of the viewed session's workspace
    # projectDir: ''               # or hide the directory-size line entirely
```

## Platform support

One reader per platform family, each reading the platform's own source.

| | Linux | macOS | Windows |
| --- | --- | --- | --- |
| CPU %, per-core | `/proc/stat` | `os.cpus()` | `os.cpus()` |
| Load average | yes | yes | **no** — Windows has no such concept, so the line is omitted |
| Memory total / used / available | `/proc/meminfo` (`MemAvailable`) | `vm_stat` (free + reclaimable pages) | `Win32_OperatingSystem` + `AvailableBytes` |
| Cache / buffers line | `Cached`, `Buffers` | file-backed pages as cache; no buffer figure | `CacheBytes`; no buffer figure |
| Swap | `/proc/meminfo` | `sysctl vm.swapusage` | page file (`SizeStoredInPagingFiles`) |
| Process list | `/proc/<pid>/stat`, in-process | `ps -Ao pid=,state=,time=,rss=,comm=` | one PowerShell call |
| Process state | yes | yes | **no** — shown as `—` |
| Thread count | yes | **no** — BSD `ps` has no portable keyword | yes |
| Temperatures | `/sys/class/hwmon`, else `/sys/class/thermal` | `powermetrics` (root), `osx-cpu-temp`, `istats` | LibreHardwareMonitor / OpenHardwareMonitor, ACPI zone, storage counters, `nvidia-smi` |
| Project-directory size | in-process walk, all three platforms alike | same | same |

Anything a platform cannot answer is reported as `null` and rendered as `—`, with
the reason available in the panel: a temperature tile's reason is in that tile's
tooltip, and the reading's other warnings are in the footer timestamp's tooltip.
Nothing is filled in with a zero, because a zero reads as a measurement.

**Cost.** Linux reads `/proc` in-process and spawns nothing. macOS and Windows
spawn one helper per sample, so their default refresh is calmer — 3s and 4s
against Linux's 2s — and `refreshIntervalMs` overrides it.

**A platform without a dedicated reader** (FreeBSD, Solaris, …) falls back to a
`node:os`-only reader: a real CPU reading and a real memory total, with swap and
the process table marked unavailable rather than guessed.

### How the numbers are produced

Every percentage is a difference between two samples of a cumulative counter, so
the plugin never assumes a tick rate:

| Reading | Rule |
| --- | --- |
| CPU % | Busy time over elapsed time, between two samples. |
| Per-core CPU % | The same rule, per core. |
| Memory % | `used / total`, where *used* means "not available" — page cache is reclaimable, so it counts as available, not as used. |
| Swap % | `used / total`. |
| Process CPU % | The process's CPU-time delta over the same interval, scaled so **100% means one core** — the `top` convention, so an eight-thread process on four cores can read above 100%. |
| Process memory | Resident set as a share of total memory. |

The one rule a reader must obey is *internal consistency*: a process's CPU time
has to be in the same unit as that reader's CPU total. Linux reports both in
jiffies, macOS and Windows both in milliseconds — so `busyΔ / totalΔ` and
`procΔ / totalΔ × coreCount` cancel the unit out, and no `USER_HZ` is assumed
anywhere.

The first reading of a session is primed with a short second sample, so the
panel's first paint carries a real percentage rather than a zero.

Two states are reported honestly instead of as zero:

- A **process first seen in the current window** has no earlier sample to
  difference against, so its CPU cell shows `—` until the next poll.
- A **host without swap** shows "未启用" rather than an empty ring at 0%.

The **project-directory line** under the gauges is **manual by design**:
measuring a folder is CPU- and IO-heavy work — a session sitting in a home
directory can hold hundreds of thousands of entries — so the panel never starts
a scan implicitly. The line carries a button that scans the workspace folder of
the session you are viewing (its `session.header.cwd`): the browser sends the
session id with the start request, and the host resolves it through the live
session store or, for a session the GUI is only viewing, through the
session-query service — the sidebar lists cold sessions whose home process
never entered them into the live store, so the folder cannot be derived
host-side. While the scan runs the button becomes a stop control, and stopping
lands within one filesystem round trip, keeping the partial figures with an
explicit "stopped" note. The finished reading stays until the next scan
replaces it. The regular polling reads only the stored result — an open panel
costs nothing between scans. The walk is bounded (50,000 entries per folder, 12
folders per scan), symlinks are neither followed nor counted, and every
short-cut is named beside the figure instead of quietly overstating accuracy.

### Temperatures

A temperature is the one reading in this plugin that is **not** differenced — it
is an absolute value, so there is nothing to subtract — and the one whose sources
differ most between platforms. Two consequences shape the feature.

**It reads on its own cadence.** On Windows a read costs a PowerShell call of a
second or more (the storage reliability counters dominate; measured ~1.6–2.8s on
the development machine), so repeating it every two seconds would be absurd. The
host reuses one reading for `temperatureIntervalMs` (15s by default), serves a
cached reading instantly, waits only for its very first read so the panel's first
paint carries a real number, and refreshes a stale reading behind the poll rather
than in front of it. Several open panels share one read.

**Attribution is conservative, because the sources are not equivalent.** Each
platform's candidates, and the bucket each is allowed to fill:

| Component | Linux | macOS | Windows |
| --- | --- | --- | --- |
| CPU | `coretemp` / `k10temp` / `zenpower` / `cpu_thermal` hwmon chips; `x86_pkg_temp` zones | `powermetrics` CPU die; `osx-cpu-temp`; `istats` | LibreHardwareMonitor / OpenHardwareMonitor `/intelcpu/`, `/amdcpu/` |
| GPU | `amdgpu` / `radeon` / `nouveau` / `i915` / `xe` chips | `powermetrics` GPU die; `istats` | a monitor's `/nvidiagpu/`, `/atigpu/`; else `nvidia-smi` |
| Motherboard | `acpitz`, `it87`, `nct6775`, `dell_smm`, `thinkpad`, … | — | the ACPI thermal zone; a monitor's `/lpc/` |
| Drives | `nvme`, `drivetemp` chips | — | `Get-StorageReliabilityCounter` per physical disk |

Three rules are worth stating explicitly, because each of them is a mistake the
feature could easily have made:

- **The Windows ACPI thermal zone is published as the motherboard, never as the
  CPU.** It is a board-level sensor by ACPI's own definition, and on many desktop
  boards it is a near-constant placeholder: the development machine reported a
  fixed **27.9 °C through a full-core burn**. Publishing that as the CPU
  temperature would have been a confident number that never moves.
- **On Windows, CPU temperature needs a hardware monitor.** Without
  LibreHardwareMonitor or OpenHardwareMonitor running there is genuinely no
  unprivileged source for it, so the CPU tile is a `—` and the panel says why
  rather than substituting another component's reading. **Install 0.9.4**, not the
  latest: 0.9.6 dropped the WMI provider this plugin reads. The 0.9.4 release is a
  portable zip (`LibreHardwareMonitor-net472.zip`) — unzip it anywhere and run it
  **as administrator**; the panel then picks it up with no configuration. Intel's
  `Distance to TjMax` sensors are *headroom*, not temperature, and are excluded:
  counting them would have shown a cooler number for a harder-working CPU.
- **On macOS, an unprivileged process cannot read the SMC.** `powermetrics`
  requires root; `osx-cpu-temp` and `istats` must be installed by the user. With
  none of them, every tile is a `—` — which is the honest answer.

An unrecognised sensor is never guessed into a bucket: an unknown hwmon chip, or a
memory (`/ram/`) sensor a hardware monitor reports, is left out rather than
mislabeled as the CPU. A drive whose reliability counter answers `0` is treated as
having no sensor, not as a freezing drive.

## How it plugs in

One bundle, two halves:

- **Host half** (`lib/index.js`) registers one exact route on Connection's shared,
  authenticated `/api` channel — `POST /api/perfmon.snapshot` — which is the same
  seam the shipped deliverables and session-log-export packages use. Registering
  there means the route inherits the GUI's Host/Origin fence and browser-session
  authentication, so the browser reaches it with a plain same-origin `fetch()`
  and the plugin handles no credentials itself. A short server-side cache lets
  several open panels share one `/proc` walk.
- **Browser half** (`client/client.js`) registers three surfaces, all public
  extension seats:
  1. `ctx.sidebarRightTabs.register()` — the `perfmon` page type and its guide entry.
  2. `ctx.slots.register()` under `sidebar.right.pane.tab`, keyed by the type's own
     `id` — the panel body.
  3. `ctx.slots.register()` under `conversation.session.header.utilities` — the
     header button, ordered last so it lands beside the Sidebar's expand control.

Service resolution is late by design: the plugin declares no `inject` list on the
browser side and reaches each service through `ctx.inject([...])`, so a profile
without the right Sidebar or without Connection simply never registers that
contribution instead of leaving the whole plugin pending.

Styling uses the shared `--dsw-*` design tokens only (a `var()` fallback is the
one place a literal appears), and the panel carries its own zh/en copy resolved
from the document language, so it needs no locale service.

## Privacy

The plugin reads local kernel counters and serves them to the browser that asked.
It makes no network requests of its own, sends nothing anywhere, and writes no
files. The route is protected by the same authentication as the rest of the GUI.

## Limitations

- **No per-process user, command line, or tree view.** Rows carry the process
  name, PID, state, thread count, CPU and RSS.
- **Temperatures depend on what the platform exposes.** Windows CPU temperature
  needs a hardware monitor (LibreHardwareMonitor **0.9.4** or OpenHardwareMonitor)
  running as administrator; macOS needs `powermetrics` as root or a community
  helper; a machine with no readable sensor shows dashes and says why. See
  [Temperatures](#temperatures) for the exact source per component.
- **No fan speeds, voltages or per-core temperature detail in the tiles.** A
  component's headline is its hottest sensor; every sensor is named in the
  tooltip, but there is no separate chart or table for them.
- **macOS and Windows tests are parser tests.** The readers for those platforms are
  covered by specs over captured tool output and injected failure paths, but they
  have not been run on real macOS or Windows hardware by the author. Windows
  process state and thread counts on macOS are unavailable by platform design, not
  by omission. The Windows temperature sources *have* been exercised on real
  hardware — that is where the ACPI-zone measurement above came from.
- **No history.** The panel shows the present reading; there are no sparklines or
  retained samples.
- **Polling, not streaming.** Refresh is a request per interval rather than a
  pushed stream.
- **The header button opens; it does not toggle.** Closing the panel is the
  Sidebar's own control.

## Development

```sh
npm install
npm run build        # lib/index.js + client/client.js
npm run watch        # rebuild on change
npm test             # build both halves, then run every spec
```

`npm test` covers the differencing arithmetic against hand-built samples, every
platform parser against captured tool output (including the awkward shapes: a
truncated `ps` time, a path with spaces, a `null` counter, a single JSON object
where a list was expected), the readers' failure paths through an injected
command runner, the temperature sources' attribution rules per platform (that the
Windows ACPI zone is never published as the CPU, that a drive counter answering 0
is not a 0 °C drive, that `Number(null)` must not become -273.15 °C) and the
temperature probe's cache / staleness / in-flight sharing, the panel's behavior
(gauges, temperature tiles, tags, sorting, filtering, refresh, errors, and an
all-unavailable reading) through `react-test-renderer`, the shipped bundle's
registrations, and a **contract-currency** suite that re-reads the installed dsh
packages to confirm the slot names, service names and route rule this plugin
depends on.

There is also a browser check that drives a real Chromium over the DevTools
protocol against a running instance:

```sh
# Start a second instance so the running GUI is untouched
dsh --profile web --port 3099 --no-open

# Then, with Chromium listening on 9222
node scripts/verify-ui.mjs "http://127.0.0.1:3099/?token=<token>" /tmp/panel.png
```

## License

MIT
