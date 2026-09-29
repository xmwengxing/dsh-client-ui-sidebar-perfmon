# @xmwengxing/dsh-client-ui-sidebar-perfmon

Real-time host performance monitoring for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
right Sidebar: CPU, memory and swap gauges, plus a process table you can sort by
CPU, memory or name.

English | [中文](README.zh-CN.md)

```
┌─ 资源占用 ────────────────────── G2 · x64 · 已运行 5d 3h ─┐
│    ◜◝        ◜◝        ◜◝                                │
│   12.5%     39.1%      4.9%                              │
│    CPU      内存     交换内存                             │
│ 4 核 · 负载 1.52   4.5 GB / 11.4 GB   0.4 GB / 8.0 GB    │
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

- **性能监控 / Performance** page — two windows refreshed from one clock:
  - **Resource usage**: ring gauges for CPU, memory and swap, each with its
    percentage, a supporting line (core count and load average, used-of-total,
    or the fact that the host has no swap), and a header naming the host.
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

Both windows refresh on the interval the host reports (2 seconds by default).
Polling pauses while the browser tab is hidden and resumes with a fresh reading.

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
    refreshIntervalMs: 1000   # 500–60000; default 2000 Linux / 3000 macOS / 4000 Windows
    processLimit: 100         # 5–500; rows served per response
    cacheMillis: 800          # 0–10000; polls inside this window share one reading
    sampleMillis: 150         # 0–2000; length of the first reading's priming sample
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

Anything a platform cannot answer is reported as `null` and rendered as `—`, with
the reason listed in the panel. Nothing is filled in with a zero, because a zero
reads as a measurement.

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
- **macOS and Windows tests are parser tests.** The readers for those platforms are
  covered by specs over captured tool output and injected failure paths, but they
  have not been run on real macOS or Windows hardware by the author. Windows
  process state and thread counts on macOS are unavailable by platform design, not
  by omission.
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
command runner, the panel's behavior (gauges, tags, sorting, filtering, refresh,
errors, and an all-unavailable reading) through `react-test-renderer`, the shipped
bundle's registrations, and a **contract-currency** suite that re-reads the
installed dsh packages to confirm the slot names, service names and route rule
this plugin depends on.

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
