# Changelog

## 0.4.0

- **A temperature card, directly under the resource card.** Four tiles — CPU, GPU,
  motherboard and drives — each showing its reading, its label and one line of
  supporting detail, coloured on a cool / warm / hot scale (70 °C and 85 °C).
  A component with several sensors (a package and its cores, two drives) shows its
  hottest reading as the headline and names every sensor in the tooltip.
- **Attribution is the point, and it is deliberately conservative.** Windows has no
  single temperature source, so four are tried and each is bucketed where it
  belongs: LibreHardwareMonitor / OpenHardwareMonitor (the only source that can
  answer **CPU**, read first for that reason), `nvidia-smi` for the GPU,
  `Get-StorageReliabilityCounter` for the drives, and the ACPI thermal zone — which
  is published as the **motherboard**, never as the CPU. That last rule was
  measured, not assumed: on the development machine the ACPI zone reported a fixed
  27.9 °C through a full-core burn, so promoting it to the CPU tile would have been
  a fabricated number that never moved.
- **Linux** reads `/sys/class/hwmon` (chip name → bucket, `tempN_input` /
  `tempN_label` → reading), falling back to `/sys/class/thermal` only when no
  hwmon chip exists, so the same ACPI zone is never listed twice. An unrecognised
  chip is reported as `other` rather than guessed into the CPU bucket.
- **macOS** tries `powermetrics` (which needs root), then `osx-cpu-temp`, then
  `istats`, and reports the temperature as unavailable when none of them can
  answer. A stock Mac genuinely cannot be read by an unprivileged process, and
  the panel says so instead of inventing a figure.
- **The card reads on its own calmer cadence** (`temperatureIntervalMs`, 15s by
  default) rather than the metrics poll. A temperature is an absolute reading with
  nothing to difference, and on Windows it costs a PowerShell call of a second or
  more (the storage reliability counters dominate; measured ~1.6–2.8s). The probe
  serves a cached reading instantly, waits only for its very first read so the
  panel's first paint carries a real number, refreshes stale readings behind the
  poll, and shares one in-flight read between every open panel.
- **Unavailable stays unavailable.** A component no source can answer is a dash
  with its reason in the warnings list, never a zero and never another component's
  figure. `temperature: false` (or `''`) removes the card entirely.
- New host field in the snapshot: `temperature` (`status` (`ready` |
  `unavailable` | `hidden`), `at`, `source`, `groups` — one entry per component
  with `celsius` / `min` / `max` / `count` / `sensors[]`, or `null`), merged into
  the response's top-level `warnings`.
- Tests: 127 specs, adding the temperature sources' parsers and attribution rules
  per platform (including the ACPI-zone-is-not-the-CPU guard, a drive counter that
  answers 0, a sensor list that arrives as a single object, and `Number(null)`
  coercing to a confident -273.15 °C), the probe's cache / staleness / in-flight
  sharing, and the card's rendering, tones and dash-instead-of-zero behaviour.

## 0.3.2

- **Fixed: the panel never mounted on dsh 0.2.0-rc.2.** The manifest's
  `dsh.client.inject` listed `@deepseek-ai/dsh-client-ui-slots`, which rc.2
  turns into a types-only package — it no longer ships a client module. The
  client loader registers each injected package *before* its consumer, so the
  perfmon module registered and then waited forever for a bundle that is never
  served: no guide entry, no panel, no header button, and nothing in any log,
  while the host half answered perfectly. The `slots` service itself is ambient
  (every built-in plugin gets it the same way), so the entry is simply removed.
- **The contract suite now guards this class of drift**: a spec asserts that
  every package the manifest injects actually ships a `lib/client.js` in the
  installed dsh — the file the loader serves as its client module.

## 0.3.1

- **Fixed: the measure button did nothing in the GUI.** The scan derived its
  folders from the live session store (`ctx.sessions.list()`), which only holds
  sessions created *in this process* — but the sidebar's session list comes from
  the session-query corpus (live **and** persisted), and merely viewing a session
  never enters it into the live store. Every click therefore started a scan over
  an empty folder set, which answered `idle` and left the row unchanged. Worse,
  the service read itself was silently swallowed: Cordis refuses a bare
  `ctx.sessions` without an inject declaration, and the defensive `try/catch`
  turned that refusal into an empty list.
- **The button now measures the session you are viewing.** The start request
  carries the session id (session-scoped slots inject `sessionId`; the header
  button forwards it, and an opening without one falls back to the right
  Sidebar's mounted-seat binding). The host resolves it through the live store
  first, then through `sessionQuery.observeSession()` for cold sessions, and
  walks the resolved `header.cwd`. An id that resolves to nothing says so
  (`project-dir-session-unresolved`) instead of scanning nothing quietly.
- **Fixed: a scan was aborted and restarted every two seconds.** The measure
  control was held in a ref *and* a state copy, and the render body kept
  rewriting the ref, so every poll re-sent `measure: true` — each one aborting
  the running scan and restarting it. The control now lives in a ref alone and
  is consumed by exactly one request.
- The optional session services are captured through `ctx.inject(...)`
  contributions, so a deployment without the session store or the query engine
  degrades to the empty answer instead of hanging the boot on an unmet inject.
- A string `projectDir` config now actually pins the scan (it was resolved but
  never consulted); `''`/`false` still hides the line.
- Tests: 88 specs, adding the named-folder scan paths (override order,
  persistence across folder-set changes, mid-walk stop), the session-cwd
  resolution chain (live-first, cold fallback, disposal, absent services), the
  session-carrying request shape, and the mounted-seat fallback.

## 0.3.0

- **The resource window shows the project directory's size — on demand.** A
  measuring a folder is CPU- and IO-heavy work (a session sitting in a home
  directory can hold hundreds of thousands of entries), so the panel never
  starts one implicitly. The project-directory line carries a button that
  scans only the folders of the sessions open at that moment; while it runs
  the button is a stop control, and a stop lands within one filesystem round
  trip, publishing the partial figures with an explicit "stopped" note. The
  finished reading stays until the next scan replaces it.
- **The poll never touches the filesystem.** The panel's two-second cadence
  reads only the scan's stored state, so an open panel costs nothing whether a
  scan is running, finished, or was never started.
- **The walk is bounded and safe.** `projectDirEntryBudget` (default 50,000
  entries per folder) stops a runaway tree and says so beside the figure;
  `projectDirMaxDirs` (default 12) caps how many distinct folders one scan
  covers, and the rest are counted and named rather than silently dropped.
  Symlinks are neither followed nor counted, so `node_modules` cycles are
  harmless. Unreadable subfolders are skipped and named; an unreadable root is
  `—` with its reason, never a fabricated zero.
- `projectDir` config: a string pins one folder for the manual scan; `''` or
  `false` hides the line entirely; unset (the default) follows the open
  sessions.
- New host fields in the snapshot: `disk` (`projectDir`, `projectDirs[]`,
  `projectBytes`, `projectEntries`, `projectTruncated`, `droppedDirCount`,
  `status` (`idle` | `scanning` | `done` | `hidden`), `warnings`), merged into
  the response's top-level `warnings`; the scan is driven with `measure: true`
  (start) / `measure: false` (stop) on the same route.
- Tests: 78 specs, adding the scan controller's rules (manual start, mid-walk
  stop, stored reading served without filesystem work, budget, symlink,
  deduplication, drop accounting) and the panel's start/stop button states.

## 0.2.2

- **The three process columns are separated now.** They sat 8px apart with nothing
  between them, so three numbers of different meaning read as one crowded block.
  The gutters are twice as wide, a hairline runs down the boundary between columns
  in the header and every row, and rows are separated too — a dense list needs the
  eye guided across as well as down.
- **Those dividers are drag handles.** Dragging the rule right of `CPU` or `内存`
  widens that column; the name column takes what is left and never shrinks below a
  72px floor. Double-click a divider to reset it to the shipped width, or focus it
  and use the arrow keys (Shift for bigger steps, Home to reset) — the handle is a
  real `role="separator"` with `aria-valuenow`, so it is not pointer-only.
- The chosen widths are remembered per browser, and unreadable storage falls back
  to the defaults instead of breaking the panel.

## 0.2.1

- **The process filter now looks like the search field it always was.** It had
  existed since 0.1.0, but as a bare underlined input with a muted placeholder it
  read as a static label — the feature was there and nobody could find it. It is
  now a bordered, filled control with a magnifier, a clear button that appears
  once there is text, a focus ring, and Escape to clear. The placeholder says
  "搜索进程名或 PID" rather than "筛选…", because it is an invitation to type.
- Fixed: the field shrank from 26px to 22px when empty and jumped back once the
  clear button appeared, because a flex item shrinks below its block-size in a
  tight card. Same class of bug as the resource card's earlier squeeze.

## 0.2.0

Cross-platform support, plus correctness fixes the platform work uncovered.

- **macOS and Windows readers.** Linux keeps reading `/proc` in-process; macOS reads
  `vm_stat` / `sysctl vm.swapusage` / `ps`, and Windows reads one PowerShell call per
  sample covering memory, paging file and the whole process list. A platform with no
  dedicated reader falls back to a `node:os`-only reading rather than failing.
- **Platform-aware default cadence**: 2s on Linux (no subprocess), 3s on macOS and
  4s on Windows, where each sample spawns a helper.
- **`warnings` in the reading**, listed in the panel: a platform that cannot answer a
  field says why instead of leaving a gap.
- Removed the "unsupported platform" failure — every platform now gets a reading.
- **`cpuTime` is unit-agnostic by contract.** A reader's per-process CPU time must be
  in the same unit as that reader's CPU total (jiffies on Linux, milliseconds
  elsewhere), which is what lets one derivation serve all three platforms.
- **Unavailable is never zero.** An unreadable CPU counter, working set or memory
  total is `null` and renders as `—`; previously a `null` from PowerShell became `0`,
  which differenced into a confident and wrong 0%. Unavailable figures also sort last
  rather than as the smallest value.
- Fixed: a Windows process row with `Id: null` was kept as pid 0; a fractional
  `vm.swapusage` byte count could be non-integer; memory that could not be read was
  rendered as `0 B / 0 B`.
- Tests: 49 specs, adding a spec per platform parser (awkward shapes included), the
  readers' failure paths through an injected runner, and a live Linux check that a
  process's CPU unit matches its total's.

## 0.1.0

First release.

- Right Sidebar page type `perfmon` with a guide entry, plus a Session header
  button that opens it beside the Sidebar's own expand control.
- Resource window: CPU, memory and swap ring gauges with percentage, core count,
  load average, used-of-total and swap availability.
- Process window: per-process CPU share (per-core scale), resident memory and its
  share of RAM, thread count and state, with a name/PID filter.
- Three sort tags — `CPU`, `内存`, `进程名` — that double as the table's column
  headers, each sitting above the column it orders. The host ranks the whole
  machine by the selected key rather than reordering the visible page.
- Fixed metric columns sized to their widest real content, with the name column
  taking the remainder: a narrow Sidebar truncates names instead of growing a
  horizontal scrollbar.
- Gauge rings sized so the percentage sits clear of the stroke, on a visible
  track token rather than one that rendered as background.
- Live refresh on a host-reported interval, paused while the browser tab is
  hidden.
