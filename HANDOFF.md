# Handoff

Everything a new maintainer (human or agent) needs to pick this project up without
re-deriving it. Facts here were measured, not remembered; where something is
untested that is said so explicitly.

## What this is

A DeepSeek Harness (`dsh`) plugin that puts a live host performance monitor in the
right Sidebar: CPU / memory / swap ring gauges and a process table you can sort and
filter. One npm package, two halves — a host half that samples the machine and
serves one authenticated route, and a browser half that registers a Sidebar page
type and a Session-header button.

| | |
| --- | --- |
| Package | `@xmwengxing/dsh-client-ui-sidebar-perfmon` (kind `perfmon`) |
| Repository | https://github.com/xmwengxing/dsh-client-ui-sidebar-perfmon |
| Target | `dsh` **0.2.0-rc.1**, Node 24, npm 11, pnpm 12 |
| Source version | **0.3.0** |
| Published on npm | 0.2.0, 0.2.2 — public, zero runtime dependencies |
| GitHub Releases | v0.1.0, v0.2.0, v0.2.1, v0.2.2 (latest published) |
| Tests | 78 specs across 6 files, all passing via `npm test` |
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
| `lib/index.js` | 761 built | Bundled host half. **Committed** (so a git install works even if the build is not allowed). |

### Browser half — runs in the GUI

| File | Lines | What it does |
| --- | --- | --- |
| `src/client/index.jsx` | 118 | The client plugin: registers the tab type + guide entry, the panel body, and the header button. No `inject` list — services are resolved late through `ctx.inject`. |
| `src/client/PerfmonBody.jsx` | 189 | The tab body: refresh loop, warnings notice, composes the two cards. |
| `src/client/GaugePanel.jsx` | 240 | Resource window (three ring gauges plus the project-directory line with its start/stop scan button). Exports `GAUGE_RING`, `DiskPanel`. |
| `src/client/ProcessPanel.jsx` | 443 | Process window: the sort tags that double as column headers, the resizable column dividers, the search field, the rows. Exports `SORT_TAGS`, `COLUMN_LIMITS`, `clampColumnWidth`, `readStoredWidths`. |
| `src/client/HeaderButton.jsx` | 42 | The Session-header control. |
| `src/client/Icon.jsx` | 41 | The perfmon glyph. |
| `src/client/api.js` | 42 | `fetchSnapshot()` — the one call to the host route. Exports `SNAPSHOT_PATH`. |
| `src/client/copy.js` | 209 | zh/en dictionaries, language resolution, warning translation. No locale service dependency. |
| `src/client/format.js` | 95 | Byte/percent/duration/clock formatting; `formatShare` for whole-percent cells. |
| `src/client/styles.js` | 538 | The whole stylesheet as a template string, plus `installStyles()`. **Read the traps section before editing this file.** |
| `client/client.js` | 1485 built | Bundled browser half, wrapped in the `window.__ModuleLoader__.load` envelope. **Committed.** |

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
| `test/panel.test.mjs` | 534 | Behavioural specs through `react-test-renderer`: gauges, tags, sorting, filtering, refresh, errors, all-unavailable readings, search field, column resizing. |
| `test/readers.test.mjs` | 286 | Every platform parser against captured tool output, and every reader's failure path through an injected runner. |
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
    "processes": [{ "pid", "name", "state", "threads", "rssBytes", "memPercent", "cpuPercent" }],
    "processCount": 0, "sort": "cpu", "warnings": [], "reader": "linux", "refreshIntervalMs": 2000
  }
}
```

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
npm test              # build both halves, build the test bundle, run all 51 specs
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

## Open work

| Item | State |
| --- | --- |
| **Community-list PR** | Not submitted. `contrib/submit-pr.sh` does it in one command and refuses until the repository is 24h old — created `2026-09-29T07:51:27Z`, so eligible from **`2026-09-30T07:51:27Z`** (Beijing 15:51). The entry file is ready; do **not** hand-add an `npm:` key to it, npm↔repo mapping is collected automatically and a hand-written key is rejected. |
| **npm trusted publishing** | The workflow is written but the npm-side setting is **not configured**, so a tag push currently fails at the publish step. One-time: npmjs.com → package → Settings → Trusted Publisher → GitHub Actions → repository `xmwengxing/dsh-client-ui-sidebar-perfmon`, workflow `publish.yml`, environment blank. Details in `RELEASING.md`. |
| **macOS and Windows on real hardware** | **Untested by the author.** Covered by parser specs over captured tool output and by injected failure paths, but never run on those systems. If a field is wrong there, the panel's `warnings` list names it. Lifting this is the single most valuable next step. |
| **pm2-managed web service** | The real GUI runs under pm2 as `deepseek-harness-webui`; host-half changes need a `pm2 restart` of it (schedule detached, see trap 5), never an inline restart during a turn. A throwaway `dsh --profile web --port 3099 --no-open` instance (via `setsid nohup … & disown`, so it survives the turn) is the way to verify the route without touching pm2. |
| No history / sparklines | The panel shows the present reading only. |
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

1. `npm test` green (it rebuilds first).
2. A new spec covers the behaviour, ideally one that fails without the fix.
3. If the browser half changed, verified in a real browser via
   `scripts/verify-ui.mjs` — screenshots caught two layout bugs that specs could
   not.
4. If the host half changed, verified against the running service (route returns the
   expected fields).
5. Version bumped, `CHANGELOG.md` section added, screenshots refreshed if visible
   output changed.
6. Committed and pushed; the working tree left clean.
