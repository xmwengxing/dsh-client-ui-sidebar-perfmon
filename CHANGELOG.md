# Changelog

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
