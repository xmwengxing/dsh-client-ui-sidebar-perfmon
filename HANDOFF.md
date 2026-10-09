# Handoff

Everything a new maintainer (human or agent) needs to pick this project up without
re-deriving it. Facts here were measured, not remembered; where something is
untested that is said so explicitly.

## What this is

A DeepSeek Harness (`dsh`) plugin that puts a live host performance monitor in the
right Sidebar: CPU / memory / swap ring gauges, a CPU / GPU / motherboard / drive
temperature card, and a process table you can sort and filter. One npm package,
two halves — a host half that samples the machine and serves one authenticated
route, and a browser half that registers a Sidebar page type and a Session-header
button.

| | |
| --- | --- |
| Package | `@xmwengxing/dsh-client-ui-sidebar-perfmon` (kind `perfmon`) |
| Repository | https://github.com/xmwengxing/dsh-client-ui-sidebar-perfmon |
| Target | `dsh` **0.2.0-rc.1**, Node 24, npm 11, pnpm 12 |
| Source version | **0.4.1** |
| Published on npm | 0.2.0, 0.2.2, 0.3.1, 0.3.2, 0.4.0 — public, zero runtime dependencies |
| GitHub Releases | v0.1.0 … v0.4.0 (latest; carries the version-free tarball) |
| Tests | 130 specs across 7 files, green on Windows (127 pass / 3 linux-only skips) and Linux (130 pass) |
| Community list | [PR #6984](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6984) — submitted, both checks green, awaiting a maintainer read |
| Runtime deps | none (host half uses `node:os` + platform tools, browser half uses the GUI's React) |
| Licence | MIT |

## File map

Relative to the repository root.

### Host half — runs inside the `dsh` process

| File | Lines | What it does |
| --- | --- | --- |
| `src/host/index.js` | 146 | The Cordis plugin. Resolves config, selects a reader, registers `POST /api/perfmon.snapshot` on Connection's shared authenticated channel, and owns the route's lifetime. |
| `src/host/metrics.js` | 271 | Platform-agnostic core: `hostFacts()`, `derive()` (differencing), `sortProcesses()`, `createSampler()`. **This is where the arithmetic lives.** |
| `src/host/du.js` | The directory scan controller: manual start/stop, an `AbortSignal` through every `readdir`/`lstat`, the viewed session's workspace (a start may name the folder explicitly; the open sessions' folders are the fallback), deduplication and drop accounting, and a stored last reading the poll serves without filesystem work. |
| `src/host/readers/index.js` | 40 | Reader selection per `process.platform`, plus the display label. |
| `src/host/readers/linux.js` | 186 | `/proc` reader — the only one that spawns nothing. Exports its three parsers. |
| `src/host/readers/darwin.js` | 238 | macOS: `os.cpus()` + `vm_stat` + `sysctl vm.swapusage` + `ps`. Exports its parsers. |
| `src/host/readers/win32.js` | 203 | Windows: `os.cpus()` + one PowerShell call per sample. Exports the script and its parser. |
| `src/host/readers/generic.js` | 68 | Fallback for any other platform: `node:os` only; swap and processes report unavailable. |
| `src/host/readers/exec.js` | 109 | The one place a subprocess is spawned: timeout, no shell, stderr-carrying errors, injectable runner. |
| `src/host/temperature/index.js` | 199 | The temperature probe: source selection, per-component aggregation, and its own calmer cache (serve-stale-while-refreshing). |
| `src/host/temperature/win32.js` | 284 | Four Windows sources in one PowerShell call, and the attribution rules. Exports the script and its parser. |
| `src/host/temperature/linux.js` | 233 | `/sys/class/hwmon`, falling back to `/sys/class/thermal`. The only source that spawns nothing. |
| `src/host/temperature/darwin.js` | 141 | `powermetrics` (root) → `osx-cpu-temp` → `istats`; unavailable when none answers. Exports its parsers. |
| `src/host/temperature/generic.js` | 68 | Fallback: a Linux-compatible hwmon tree, else FreeBSD `sysctl dev.cpu.N.temperature`. |
| `lib/index.js` | built | Bundled host half. **Committed** (so a git install works even if the build is not allowed). |

### Browser half — runs in the GUI

| File | Lines | What it does |
| --- | --- | --- |
| `src/client/index.jsx` | 118 | The client plugin: registers the tab type + guide entry, the panel body, and the header button. No `inject` list — services are resolved late through `ctx.inject`. |
| `src/client/PerfmonBody.jsx` | 251 | The tab body: refresh loop, composes the three cards, and hangs the reading's warnings on the footer's tooltip. |
| `src/client/GaugePanel.jsx` | 262 | Resource window (three ring gauges plus the project-directory line with its start/stop scan button). Exports `GAUGE_RING`, `DiskPanel`. |
| `src/client/TemperaturePanel.jsx` | 160 | Temperature window: four **two-line** tiles (CPU / GPU / board / drives), each reading + label, with every sensor and the spread in the tooltip. Exports `TEMPERATURE_TILES`, `TEMPERATURE_TONES`, `temperatureTone`. |
| `src/client/ProcessPanel.jsx` | 443 | Process window: the sort tags that double as column headers, the resizable column dividers, the search field, the rows. Exports `SORT_TAGS`, `COLUMN_LIMITS`, `clampColumnWidth`, `readStoredWidths`. |
| `src/client/HeaderButton.jsx` | 42 | The Session-header control. |
| `src/client/Icon.jsx` | 41 | The perfmon glyph. |
| `src/client/api.js` | 42 | `fetchSnapshot()` — the one call to the host route. Exports `SNAPSHOT_PATH`. |
| `src/client/copy.js` | 209 | zh/en dictionaries, language resolution, warning translation. No locale service dependency. |
| `src/client/format.js` | 106 | Byte/percent/duration/clock/temperature formatting; `formatShare` for whole-percent cells. |
| `src/client/styles.js` | 692 | The whole stylesheet as a template string, plus `installStyles()`. **Read the traps section before editing this file.** |
| `client/client.js` | built | Bundled browser half, wrapped in the `window.__ModuleLoader__.load` envelope. **Committed.** |

### Build, tests, docs, tooling

| File | Lines | What it does |
| --- | --- | --- |
| `package.json` | 91 | `dsh.bundle` (patch layer) + `dsh.client` (browser half) manifests, `files` whitelist, scripts. |
| `cordis.patch.yml` | 5 | The bundle layer: inserts the `perfmon` row. |
| `scripts/build.mjs` | 114 | esbuild: host → ESM `lib/`, browser → wrapped classic script `client/`. `--watch` supported. |
| `scripts/build-test-bundle.mjs` | 36 | Test-only CJS bundle of the internals, so specs can mount components without widening the published API. |
| `scripts/verify-ui.mjs` | 351 | Drives a real Chromium over the DevTools protocol against a running instance: guide entry, gauges, live refresh, tag sorting, filter, header button. |
| `test/client-bundle.test.mjs` | 257 | Loads the shipped bundle like the module loader does; asserts registrations, that every component renders from its own inject face, and that no bare colour escapes a `var()`. |
| `test/contract.test.mjs` | 168 | Re-reads the **installed** dsh packages to confirm slot names, service names, the route rule, and the bundle id still hold. Catches upstream renames. |
| `test/metrics.test.mjs` | 242 | Differencing arithmetic against hand-built samples, plus live Linux checks (sampler, unit consistency). |
| `test/panel.test.mjs` | 985 | Behavioural specs through `react-test-renderer`: gauges, temperature tiles and tones, tags, sorting, filtering, refresh, errors, all-unavailable readings, search field, column resizing. |
| `test/readers.test.mjs` | 286 | Every platform parser against captured tool output, and every reader's failure path through an injected runner. |
| `test/temperature.test.mjs` | 518 | Every temperature source's parsers and attribution rules, plus the probe's cache/staleness/in-flight behaviour. |
| `test/du.test.mjs` | 284 | The scan controller: nothing starts implicitly, a stop lands between syscalls, the stored reading costs no filesystem work, budget/symlink/deduplication/drop rules, config resolution. |
| `test/support/entry.jsx` | 31 | Re-exports the internals the specs drive. Not published. |
| `README.md` / `README.zh-CN.md` | 254 / 216 | User-facing: features, install (3 paths), platform support matrix, how the numbers are produced, configuration. |
| `CHANGELOG.md` | 76 | Per-version notes. The release workflow extracts the matching section for GitHub Release notes. |
| `RELEASING.md` | 62 | How a release happens, the one-time npm trusted-publisher setting, and why the alternatives are worse. |
| `.github/workflows/publish.yml` | 94 | Tag-triggered: tests → OIDC publish with provenance → Release with the tarball. |
| `contrib/awesome-dsh-plugin-entry.yml` | 18 | The community-list submission payload (one file in someone else's repo). |
| `contrib/submit-pr.sh` | 92 | Does that submission: fork → add the entry → PR. Refuses before the list's 24h repo-age bar. |
| `assets/screenshot-*.png`, `screenshots.json` | — | Storefront images, cropped so no conversation content ships. |

## Architecture: the contracts that must not break

1. **A bundle is two manifests.** `dsh.bundle.patch` points at `cordis.patch.yml`,
   which inserts the host row by package name. `dsh.client` (platform `web`) plus a
   `./client` export make the browser half loadable. Declaring only `dsh.client` is
   the most common reason a submission is rejected — it is not installable alone.

2. **The host reaches the browser through one exact route on the shared
   authenticated `/api` channel** — `POST /api/perfmon.snapshot`, registered with
   `ctx.connection.fetch.register()`. That is the same seam the shipped
   deliverables and session-log-export packages use, so the route inherits the
   Host/Origin fence and browser-session authentication and the plugin handles no
   credentials. Registering it in the caller's own fiber means unloading removes it.

3. **A reader's per-process CPU time must be in the same unit as its own CPU
   aggregate** (jiffies on Linux, milliseconds on macOS and Windows). That is what
   lets one `derive()` serve all platforms: `busyΔ / totalΔ` for the machine and
   `procΔ / totalΔ × coreCount` for a process cancel the unit out, so no `USER_HZ`
   is ever assumed. Breaking this makes every process percentage silently
   unavailable or absurd — there is a live spec for it.

4. **Unavailable is `null`, never zero.** A field a platform cannot answer travels
   as `null`, renders as `—`, and is listed in the reading's `warnings`. A zero
   reads as a measurement, which is the failure mode this rule exists to prevent.
   Unavailable figures also sort last rather than as the smallest value.

5. **Three UI seats, all public extension points.**
   - `ctx.sidebarRightTabs.register({ id, kind: 'perfmon', priority: 'extension', title, guide })`
     — the page type and its guide entry.
   - `ctx.slots.register()` under `sidebar.right.pane.tab`, keyed by that same `id`
     — the body for every tab of the kind.
   - `ctx.slots.register()` under `conversation.session.header.utilities`, ordered
     last so the button lands beside the Sidebar's own expand control (the corner
     seat is single-occupancy and belongs to `sidebar-right`).

   Service resolution is deliberately late (`ctx.inject`, no declared `inject`
   list), so a profile without the right Sidebar or without Connection skips that
   contribution instead of leaving the plugin pending forever.

### The wire format

Request (`POST /api/perfmon.snapshot`):

```json
{ "sort": "cpu" | "mem" | "name", "limit": 60 }
```

Response:

```json
{
  "ok": true,
  "value": {
    "facts": { "hostname", "platform", "platformLabel", "arch", "release", "coreCount", "model", "uptimeSeconds" },
    "window": { "millis", "at" },
    "cpu": { "percent", "coreCount", "cores": [{ "id", "percent" }], "loadAverage": [n,n,n] | null },
    "memory": { "total", "used", "available", "free", "cached", "buffers", "percent",
                "swapTotal", "swapUsed", "swapFree", "swapPercent" } | null,
    "disk": {
      "projectDir": "/path" | null, "projectDirs": [{ "dir", "bytes", "entries", "truncated", "warnings" }],
      "projectBytes": 123 | null, "projectEntries": 0, "projectTruncated": false,
      "droppedDirCount": 0, "status": "idle" | "scanning" | "done" | "hidden", "warnings": []
    },
    "temperature": {
      "status": "ready" | "unavailable" | "hidden",
      "at": 1700000000000 | null,
      "source": "windows-cim" | "hwmon" | "sysctl" | "powermetrics" | … | null,
      "groups": {
        "cpu" | "gpu" | "mainboard" | "disk":
          { "celsius", "min", "max", "count", "sensors": [{ "label", "celsius" }] } | null
      },
      "warnings": []
    },
    "processes": [{ "pid", "name", "state", "threads", "rssBytes", "memPercent", "cpuPercent" }],
    "processCount": 0, "sort": "cpu", "warnings": [], "reader": "linux", "refreshIntervalMs": 2000
  }
}
```

`temperature.groups` is `null` per unanswered component, never a zero: a machine
with no readable CPU sensor says so (`temperature-cpu-unavailable`) rather than
borrowing the ACPI zone's figure. The reading is cached for
`temperatureIntervalMs` (15s default) independently of the metrics poll, because a
temperature is absolute (nothing to difference) and on Windows it costs a
PowerShell call of a second or more. `status: "hidden"` comes from
`temperature: false` in the config.

`disk.projectBytes` sums the last scan's measured folders; `null` means none
answered, never zero. **The scan is manual**: the panel sends `measure: true`
(start) or `measure: false` (stop) on the same route, and a start may name
`"session": "<id>"` — the session the GUI is viewing. The host resolves that id
through the live session store (`sessions.get()`) and, when the id is only a
cold record there (the sidebar lists sessions whose home process never entered
them into this process's store), through `sessionQuery.observeSession()`; its
`header.cwd` is the folder the scan walks. A start without a session falls back
to the open sessions' folders; a named id that resolves to nothing answers
`project-dir-session-unresolved` instead of scanning the wrong folder. The poll
reads only the stored state — no filesystem work on the 2-second cadence. A
stop aborts within one syscall and publishes partial figures with
`project-dir-aborted`. A string `projectDir` pins one folder (overriding every
derivation) and `''`/`false` hides the line (`status: "hidden"`). Bounded by
`projectDirEntryBudget` (50k entries/folder → `project-dir-partial`) and
`projectDirMaxDirs` (12 folders → `droppedDirCount` +
`project-dir-dropped`); an unreadable subfolder says `project-dir-skipped`, an
unreadable root is `null` bytes with `project-dir-unavailable`. Symlinks are
neither followed nor counted.

Every numeric field except `pid`/`rssBytes` may be `null`. `state` and `threads`
are `null` on Windows; `loadAverage` is `null` on Windows; `memory` is `null` when
the reader could not read it at all.

## Platform support

| | Linux | macOS | Windows |
| --- | --- | --- | --- |
| CPU %, per-core | `/proc/stat` | `os.cpus()` | `os.cpus()` |
| Load average | yes | yes | **no** (omitted) |
| Memory | `/proc/meminfo` | `vm_stat` | `Win32_OperatingSystem` + `AvailableBytes` |
| Swap | `/proc/meminfo` | `sysctl vm.swapusage` | page file |
| Processes | `/proc/<pid>/stat`, in-process | `ps -Ao pid=,state=,time=,rss=,comm=` | one `Get-Process` call |
| Process state | yes | yes | **no** (`—`) |
| Thread count | yes | **no** (no portable BSD `ps` keyword) | yes |
| Temperatures | `hwmon`, else `thermal` | `powermetrics` (root) / `osx-cpu-temp` / `istats` | monitor WMI, ACPI zone, storage counters, `nvidia-smi` |
| Reads `/proc` only | yes | spawns 1–2 helpers/sample | spawns 1 helper/sample |

Default refresh is platform-aware because of that cost: 2s Linux, 3s macOS, 4s
Windows. `refreshIntervalMs` overrides it.

## Commands

```sh
# dev deps: esbuild, react, react-dom, react-test-renderer.
# jsdom is NOT installable behind this machine's registry proxy (its transitive
# @csstools packages return 403), which is why the component specs use
# react-test-renderer instead of a DOM.
npm run build         # lib/index.js + client/client.js
npm run watch         # rebuild on change
npm test              # build both halves, build the test bundle, run all specs
npm run test:unit     # specs only, against the existing build
```

`npm test` is the gate. It rebuilds the shipped artefacts first, so the bundle
specs test what would actually be published.

### Verifying without a GUI

```sh
# The host half, end to end, exercising the real reader:
node -e "import('./src/host/metrics.js').then(async m => {
  const { selectReader } = await import('./src/host/readers/index.js');
  const s = m.createSampler({ sampleMillis: 200, reader: selectReader(process.platform) });
  const a = await s.snapshot({ sort: 'cpu', limit: 3 });
  console.log(a.reader, a.facts.platformLabel, a.warnings, a.cpu.percent, a.processes);
})"
```

### Verifying the browser half for real

Headless Chromium over CDP, no browser-automation dependency:

```sh
# 1. A throwaway instance on another port, so a running GUI is untouched.
dsh --profile web --port 3099 --no-open        # prints a URL with a token

# 2. A browser with the DevTools port open.
chrome --headless=new --remote-debugging-port=9222 --no-sandbox \
       --user-data-dir=/tmp/perfmon-cdp --window-size=1680,1050 about:blank

# 3. Drive it. `--attach` reuses the already-open page instead of re-navigating.
node scripts/verify-ui.mjs "http://127.0.0.1:3099/?token=<token>" /tmp/panel.png
```

## Traps that cost time here

Read this section before editing. Every item below was an actual failure.

1. **Never put a backtick inside a CSS comment in `styles.js`.** The stylesheet is a
   template literal, so a backtick in a comment ends the string and the build fails
   with a confusing `Expected ";" but found ...` at a CSS-looking location. This
   happened twice.

2. **A crashing slot entry is silently retired.** `SlotCore` abdicates an entry whose
   component throws: it stays on the ledger but is excluded from the projection, so
   the symptom is indistinguishable from "never registered". This is how a header
   button that threw for a missing `t` prop looked like a registration bug. The
   guard is a spec that mounts *every* registered component with its *own* inject
   face — a missing prop is then a failing test, not a mystery.

3. **Flex children shrink below their block-size.** Twice: the resource card was
   squeezed so its gauges drew over the next card, and the search field was 22px
   empty but 26px with a clear button. Any fixed-size control in the panel needs
   `flex: none`.

4. **`overflow-y: auto` computes `overflow-x: auto`.** A grid item wider than its
   track overflows visibly, which then produces a horizontal scrollbar in the list.
   Metric tracks are sized to their widest real content and metric cells clip; do
   not reintroduce a `minmax(0, 1fr)` metric track.

5. **Restarting the GUI host kills the agent's own session** if the agent is running
   inside it. A `pm2 restart` of the web app during a turn aborted the turn twice
   here. Schedule it detached (`nohup bash -c 'sleep 20; pm2 restart …' &`) and let
   the turn finish, or ask the user to do it.

6. **Client-half changes need no restart** — the bundle is served by content hash, so
   a browser refresh is enough. **Host-half changes do** need the process restart.

7. **New npm versions propagate unevenly.** The version document and the abbreviated
   packument (what installers read) appear within seconds; the **full packument
   lags ~8 minutes**, during which `npm view` and `pnpm add <name>` 404 even though
   the release succeeded. Confirm with
   `curl .../@scope%2Fname/<version>` and
   `curl -H 'Accept: application/vnd.npm.install-v1+json' .../@scope%2Fname`
   before concluding a publish failed. A 404 that says *"version not found"* means
   the version truly is absent; a bare `{"error":"Not found"}` on the packument
   means it is still propagating.

8. **An agent cannot publish to npm here.** The account has 2FA; npm answers the
   `PUT` with a challenge, opens an authorisation URL, and **masks that URL outside
   an interactive terminal** (it also does not reach the debug log, verified by
   grep). `npm publish` from a non-TTY ends in `EOTP`. That is why publishing moved
   to the tag-triggered OIDC workflow.

9. **The client bundle id must equal the package name** — the module loader validates
   it. `scripts/build.mjs` reads the name from `package.json` rather than repeating it.

9b. **A bare `ctx.<service>` read throws `cannot get property … without inject`** in
   Cordis unless the plugin declares the service in `inject` — and the throw is easy
   to swallow in a `try/catch`, which turns a missing declaration into a silent empty
   answer (this exact bug made the session store read `[]` for weeks). For optional
   services, capture them through `ctx.inject(['name'], (serviceCtx) => { ref =
   serviceCtx.name })` instead: the callback only runs when the service exists, so a
   deployment without it leaves the reference unset and the feature degrades instead
   of hanging the boot.

9c. **The GUI sidebar's "open" sessions are mostly cold records.** The Session list
   UI reads `sessionQuery.listSessions()` (live + persisted, newest-first), and merely
   viewing a session never enters it into this process's live store —
   `ctx.sessions.list()` answers only sessions *created or entered in-process*. Any
   feature that promises "the session the user is looking at" must take the session id
   from the client (session-scoped slots inject `sessionId`; the right Sidebar also
   publishes `ctx.sidebarRight.mounted`) and resolve it host-side through
   `sessions.get()` → `sessionQuery.observeSession()`.

9d. **A control flag mirrored into React state re-sends itself on every render.** The
   measure button held its flag in a ref *and* a state copy; the render body kept
   rewriting the ref from state, so every 2-second poll carried `measure: true` again
   and each one aborted the scan the previous request started — the scan never
   finished. A "consume exactly once" flag lives in a ref alone; state is only for
   what the next render should show.

10. **The release asset name must stay version-free.** The plugin list points at
    `releases/latest/download/dsh-client-ui-sidebar-perfmon.tgz`, which resolves
    `latest` at request time but takes the filename literally; a versioned name
    would 404 the moment the next release landed. The workflow renames before
    attaching.

11. **Sleeping in the headless browser is not a hang.** A boot on a loaded host takes
    minutes (70+ plugin bundles, ~10 MB). Earlier screenshots caught the
    "Loading plugins…" screen and looked like a failure.

12. **Driving the GUI needs care.** The release-notice modal blocks clicks until
    dismissed; the Sidebar's expand button is *absent* while the panel is open; the
    session rows act on pointer events, so `element.click()` does nothing — dispatch
    `mouseMoved` + `mousePressed` + `mouseReleased`. `scripts/verify-ui.mjs` encodes
    all of this.

13. **`Number(null) === 0`.** Every optional Windows counter must be required to be a
    real number: PowerShell omits `CPU` for a process the caller cannot open, and a
    coerced `0` differences into a confident, wrong `0%`. Likewise `Id: null` is not
    pid 0.

14. **`os.loadavg()` returns zeroes on Windows** — publishing `[0,0,0]` would read as
    an idle machine, so the host withholds it as `null`.

15. **`dsh.client.inject` is a load-order contract, not a wish list.** The client
    loader registers each injected package's client module *before* its consumer.
    Since dsh 0.2.0-rc.2, `@deepseek-ai/dsh-client-ui-slots` is types-only (no
    `lib/client.js`): a manifest that names it registers the plugin and then
    waits forever — no guide entry, no panel, nothing in any log, while the host
    half answers perfectly. The `slots` service is ambient; built-in plugins do
    not name the package either. The contract suite asserts every injected
    package ships a client module.

16. **Windows has no usable CPU temperature without a hardware monitor — and the
    monitor's version decides whether ours works at all.**
    `MSAcpi_ThermalZoneTemperature` is a *motherboard* sensor by ACPI's own
    definition, and on many desktop boards it is a near-constant placeholder.
    Measured twice on this machine (MSI B660M + i7-12700F): a fixed `3010`
    tenths-Kelvin — **27.85 °C** — while ~105 s of CPU time burned in a 15 s
    window across the burners, and unchanged after the load stopped. Publishing
    that as the CPU temperature would be a confident number that never moves,
    which is worse than a dash. Two cautions for anyone re-measuring: the
    `Win32_PerfFormattedData_PerfOS_Processor` counter is not a reliable
    saturation check while WMI itself competes for CPU (it read 24–35 % during a
    genuinely loaded test), so compare `Get-Process … CPU` deltas against wall
    time instead; and a burner spawned through `Start-Job` or with a bad working
    directory can fail silently, which reads as "no load" and makes the whole
    experiment worthless.
    **`winget install LibreHardwareMonitor.LibreHardwareMonitor` now installs
    0.9.6, which no longer ships a WMI provider.** Its PawnIO dependency installs,
    then the LHM step fails on a missing nested installer — and even unzipped by
    hand, 0.9.6 exposes **no `root/LibreHardwareMonitor` namespace**: `WmiProvider`
    is absent from both its exe and its lib, and it has no `System.Management`
    dependency. **Install 0.9.4 instead** — unzip `LibreHardwareMonitor-net472.zip`
    into `C:\Program Files\LibreHardwareMonitor` (it is portable; there is no
    installer), and run it **as administrator** or its WMI provider will not
    appear. Verify a build before trusting it by searching the **exe** for
    `WmiProvider`: that is where OpenHardwareMonitor's provider lives, so
    searching only the lib reports a false negative (an hour lost to exactly
    that). 0.9.4 publishes 206 sensors here. Its `Sensor` class carries an
    identifier path (`/intelcpu/0/temperature/0`) that names the hardware — bucket
    by *identifier*, never by the localised, user-editable display name. Without a
    monitor the CPU tile is a dash with `temperature-cpu-unavailable`, and that is
    correct.

17. **Intel's `Distance to TjMax` is headroom, not a temperature — and counting it
    inverts the reading.** LibreHardwareMonitor types it as `Temperature`, but it
    is `TjMax - actual`, so a 41 °C core with a 100 °C TjMax reports 59. Measured
    here: the headroom sensors ran 60–64 while the cores ran 37–43. Because a
    tile's headline is its **hottest** sensor, including headroom made the panel
    show 64 °C for a CPU whose hottest core was 43 °C — and a machine working
    *harder* would have displayed a *lower* number. `isTemperatureReading` filters
    it by name. The lesson generalises: a hardware monitor's sensor *type* is not a
    guarantee of what the number *means*, and this class of bug is invisible to
    parser specs written from documentation — it took installing the monitor and
    comparing its raw sensors against the panel.

18. **Bucketing by display name has an ordering trap.** "GPU Core" contains
    "core", so a CPU rule tested first claims every graphics sensor in the
    machine. Match `gpu` before `cpu` in any name-based fallback (the identifier
    path is checked first and does not have this problem). A `/ram/` sensor from a
    hardware monitor belongs to no tile this card draws and must stay `other`
    rather than being forced into one.

19. **`Number(null) === 0` bites temperature too.** The ACPI zone is in tenths of
    a Kelvin, so a missing `CurrentTemperature` coerced with `Number()` converts
    to a confident **-273.15 °C**. Every raw counter is required to be a real
    number before conversion. Likewise a drive whose reliability counter answers
    `0` is reporting "no sensor", not a freezing drive — treat `<= 0` as absent.

20. **A temperature read on Windows costs ~1.6–2.8 s, so it cannot ride the
    metrics poll.** `Get-StorageReliabilityCounter` dominates (a bare
    `Get-PhysicalDisk` loop measured ~2.7 s; the full script ~1.6 s warm). Hence
    the separate probe with its own cache: serve a cached reading instantly, await
    only the *first* read (so the panel's first paint carries a number), and
    refresh a stale reading *behind* the poll. On Linux the same source costs
    milliseconds, which is why the cadence is configurable rather than fixed.

21. **A spec that reads the real machine passes locally and fails in CI.** The
    generic temperature source probes `/sys/class/hwmon` before falling back to
    `sysctl`, and a spec asserted the *fallback* while letting the probe read the
    host. `/sys/class/hwmon` is absent on the Windows development machine and
    present on the Ubuntu runner, so the suite was green locally and failed the
    0.4.0 release with `'hwmon' !== 'sysctl'`. Anything host-shaped — a `/sys`
    tree, `/proc`, an installed tool — is an injection point, and the spec pins
    it. `createGenericTemperature({ hwmonRoot })` is that seam; the WSL Ubuntu on
    this machine reproduces the CI condition (`test -d /sys/class/hwmon`) without
    needing node, which is the cheapest way to check such a branch.

21b. **The mirror image: a spec that asserts one platform's semantics on the
    other.** 17 specs in `du.test.mjs` / `metrics.test.mjs` compared the raw
    POSIX literals they passed in (`/p`, `/elsewhere`) against values the code
    had run through `path.resolve` — which is `E:\p` on Windows. The scanner was
    correct; the expectations were host-shaped. This is the same defect as trap
    20 seen from the other side, and it hid for the same reason: the suite was
    green on Linux (where CI runs) and red on Windows (where the author works),
    so it read as "known Windows noise" and was ignored. **A red suite on the
    machine you develop on is not noise.** Route expectations through the same
    resolver the code uses, and normalize separators in injected fakes. Verify a
    path-sensitive change on *both*: WSL Ubuntu plus a Linux `node` tarball
    (`nodejs.org/dist/vXX/node-vXX-linux-x64.tar.xz`, unpacked beside the
    checkout) runs the real POSIX suite, and `DSH_CLI_ROOT` can point at the
    Windows dsh install from inside WSL so the contract specs resolve too.

22. **A trusted publisher's `Allowed actions` gates direct publishing.** The npm
    page has `Allow npm publish` and `Allow npm dist-tag` checkboxes, and the note
    above them says *"npm **stage** publish is always allowed"* — so a workflow
    that runs `npm publish` is refused with `OIDC permission denied for this
    action` while `npm stage publish` would have been fine. This is a **missing
    tick, not a wrong field**, and the yellow "cannot be changed" banner applies
    only to Publisher/Organization/Repository/Workflow/Environment, not to these
    two boxes. Note also that a run which logs *"already on npm; skipping the
    publish step"* reports **success without ever exercising OIDC** — v0.3.1
    looked like proof the setup worked, and it was not. Only a run that logs
    `+ <name>@<version>` has really published.

## Open work

| Item | State |
| --- | --- |
| **Community-list PR** | **Submitted — [PR #6984](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6984)**, open and `mergeable_state: clean`. Both checks pass: `PR check` (shape, READMEs, awesome-lint, site build) and `Submission gate` ("All 1 submitted entry passes: `dsh.bundle` declared, repo old enough, enough commits"). Waiting on a maintainer's read, which the guide says is the actual decision. Notes: `gh` is not installed here, so the PR went through the API after `git clone --depth 1` of the fork — `contrib/submit-pr.sh` is still the one-command path wherever `gh` exists. Do **not** hand-add an `npm:` key to the entry; npm↔repo mapping is collected automatically and a hand-written key is rejected. The fork was synced first (`merge-upstream`), which matters because a stale fork re-adds old entries. |
| **npm trusted publishing** | **Working as of v0.4.0** — the first release to actually exercise OIDC (earlier runs either failed earlier or short-circuited on "already on npm"). Two things had to be true: the npm trusted publisher configured (repository `xmwengxing/dsh-client-ui-sidebar-perfmon`, workflow `publish.yml`, environment blank) **and `Allow npm publish` ticked** under Allowed actions — the missing tick was the 403 (trap 22). 0.4.0 published with a provenance attestation, and its Release carries the version-free tarball. |
| **Local install for live verification** | The `web` profile currently points at this checkout (`dsh plugin --profile web add E:\Projects\dsh-client-ui-sidebar-perfmon` → a pnpm symlink), so a rebuild is picked up by a browser refresh with no reinstall. The market's npm build is backed up at `%TEMP%\perfmon-market-backup` (delete with `dsh plugin --profile web add @xmwengxing/dsh-client-ui-sidebar-perfmon` to go back). **The GUI on :3080 is a plain `dsh web` process, not pm2**, and an agent running inside it cannot restart it without killing its own session — verify on a throwaway `dsh --profile web --port 3099 --no-open` instance instead (redirect its stdout to a file to read the token URL). |
| **macOS and Windows on real hardware** | **Windows temperature sources were exercised on real hardware in 0.4.0** (which is where traps 16–19 come from). The *metrics* readers for macOS and Windows remain untested by the author: covered by parser specs over captured tool output and by injected failure paths, never run on those systems. If a field is wrong there, the panel's `warnings` list names it. Lifting this is the single most valuable next step. |
| **macOS temperature** | Implemented but **not run on a Mac** — `powermetrics` needs root and the two community helpers need installing, so the parser specs are all the coverage there is. A Mac user with `osx-cpu-temp` installed is the fastest way to confirm it. |
| **The GUI host on :3080** | It is a plain `dsh web --no-open` process (PID varies), **not** pm2 — `pm2 list` is empty here, and an agent running inside it cannot restart it without killing its own turn (trap 5). Verify on a throwaway `dsh --profile web --port 3099 --no-open` instance instead (redirect its stdout to a file to read the token URL), and leave the user's instance alone. Host-half changes need the process restarted; client-half changes only need a browser refresh. |
| No history / sparklines | The panel shows the present reading only. |
| No fan speeds, voltages, or per-sensor temperature table | A component's tile shows its hottest sensor and the tooltip names every sensor; there is no chart or separate table for them. |
| Windows CPU temperature needs a hardware monitor | Not an omission: without LibreHardwareMonitor / OpenHardwareMonitor running there is no unprivileged source. **Installed on this machine as of 0.4.1** — LibreHardwareMonitor **0.9.4** (not 0.9.6, which dropped WMI) at `C:\Program Files\LibreHardwareMonitor`, run as administrator, and the panel reads it with no configuration. See trap 16 for why the version matters. |
| No per-process user, command line or tree view | Rows carry name, PID, state, threads, CPU, RSS. |
| Polling, not streaming | One request per interval; a push channel would need the Gateway. |
| Windows process state, macOS thread count | Unavailable by platform, not by omission. |

## Do not

- **Do not accept a TOTP seed or recovery codes.** Publishing must go through the
  OIDC workflow or the user's own terminal. A TOTP seed is a *permanent* second
  factor: whoever reads it can act as the account holder anywhere, not just here.
- **Do not put credentials, tokens, or the path of any key material into this
  repository.** It is public.
- **Do not restart the GUI host inline** while a turn is running (see trap 5).
- **Do not edit `README*.md` by hand for the plugin list** — that repository
  generates its READMEs from `data/plugins/*.yml`.
- **Do not commit `node_modules/` or `test/.build/`** — both are gitignored.
- **Do not widen the published API to make a test compile.** The browser half
  exports `apply`, `name`, `PERFMON_TYPE_ID`, `PERFMON_KIND`, `SNAPSHOT_PATH`, and
  nothing else; specs reach internals through `test/support/entry.jsx` instead.

## Definition of done for a change

1. `npm test` green (it rebuilds first). Two environment facts, both now handled:
   the 6 contract specs need `DSH_CLI_ROOT` pointing at the installed
   `@deepseek-ai/dsh` (set it to
   `%APPDATA%\npm\node_modules\@deepseek-ai\dsh`), and the suite is **green on
   both platforms** — Windows: 128 tests / 125 pass / 0 fail / 3 skipped (the
   skips are the `process.platform !== 'linux'` guards); Linux: 128 / 128 / 0 / 0.
   It used to be red on Windows by default (17 path-separator failures), which
   made a real regression indistinguishable from known noise; that is fixed, so a
   red run now means something.
2. A new spec covers the behaviour, ideally one that fails without the fix.
3. If the browser half changed, verified in a real browser via
   `scripts/verify-ui.mjs` — screenshots caught two layout bugs that specs could
   not. An isolated profile is the way to do that without touching the running
   GUI: copy `~/.dsh/profiles/web` to `~/.dsh/profiles/<name>`, drop this
   repository's `lib/`, `client/`, `locale/`, `package.json` and
   `cordis.patch.yml` over the installed package inside its `node_modules`, boot
   `dsh --profile <name> --port 3099 --no-open`, then delete the copy. The token
   URL is printed on stdout, so redirect the boot to a file to read it.
4. If the host half changed, verified against the running service (route returns the
   expected fields). The route needs the browser-session cookie, not just the
   token: load `/?token=<token>` first with a cookie jar, then POST.
5. Version bumped, `CHANGELOG.md` section added, screenshots refreshed if visible
   output changed.
6. Committed and pushed; the working tree left clean.
