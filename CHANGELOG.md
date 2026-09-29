# Changelog

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
- Gauge rings enlarged so the percentage sits clear of the stroke, on a visible
  track token rather than one that rendered as background.
- Live refresh on a host-reported interval, paused while the browser tab is
  hidden.
- Host half reads `/proc/stat`, `/proc/meminfo` and `/proc/<pid>/stat` and serves
  one authenticated route on the shared `/api` channel, with a short server-side
  cache so several open panels share one read.
