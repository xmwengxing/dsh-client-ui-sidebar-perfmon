window.__ModuleLoader__.load({
  id: "@xmwengxing/dsh-client-ui-sidebar-perfmon",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.jsx
var index_exports = {};
__export(index_exports, {
  PERFMON_KIND: () => PERFMON_KIND,
  PERFMON_TYPE_ID: () => PERFMON_TYPE_ID,
  SNAPSHOT_PATH: () => SNAPSHOT_PATH,
  apply: () => apply,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// src/client/copy.js
var ZH = {
  title: "\u6027\u80FD\u76D1\u63A7",
  tabTitle: "\u6027\u80FD\u76D1\u63A7",
  description: "\u5B9E\u65F6\u67E5\u770B CPU\u3001\u5185\u5B58\u4E0E\u8FDB\u7A0B\u5360\u7528",
  headerButton: "\u6027\u80FD\u76D1\u63A7\u4FE1\u606F",
  headerButtonOpen: "\u6253\u5F00\u6027\u80FD\u76D1\u63A7\u9762\u677F",
  resources: "\u8D44\u6E90\u5360\u7528",
  processes: "\u8FDB\u7A0B\u5217\u8868",
  gpuLine: "\u663E\u5361",
  gpuClock: "{clock} MHz",
  gpuClockUnavailable: "\u9891\u7387 \u2014",
  gpuVram: "\u663E\u5B58 {used} / {total}",
  gpuVramUnavailable: "\u663E\u5B58 \u2014",
  temperatures: "\u6E29\u5EA6",
  temperatureCpu: "CPU",
  temperatureGpu: "\u663E\u5361",
  temperatureMainboard: "\u4E3B\u677F",
  temperatureDisk: "\u786C\u76D8",
  temperatureUnit: "\xB0C",
  temperatureRange: "\u6700\u4F4E {min} \xB7 \u6700\u9AD8 {max}",
  temperatureSensors: "{count} \u4E2A\u4F20\u611F\u5668",
  temperatureUnavailableShort: "\u4E0D\u53EF\u7528",
  projectDir: "\u9879\u76EE\u76EE\u5F55",
  measureStart: "\u7EDF\u8BA1\u5F53\u524D\u4F1A\u8BDD\u76EE\u5F55",
  measureStartSession: "\u7EDF\u8BA1\u5F53\u524D\u4F1A\u8BDD\u7684\u76EE\u5F55\uFF08{id}\uFF09",
  measureStop: "\u505C\u6B62\u7EDF\u8BA1",
  measuring: "\u6B63\u5728\u7EDF\u8BA1\u2026",
  measuringHint: "\u53EA\u7EDF\u8BA1\u5F53\u524D\u67E5\u770B\u7684\u4F1A\u8BDD\u76EE\u5F55 \xB7 \u53EF\u968F\u65F6\u505C\u6B62",
  projectUsage: "{size} \xB7 {count} \u9879",
  projectDirCount: "{count} \u4E2A\u76EE\u5F55",
  projectDropped: "\u53E6\u6709 {count} \u4E2A\u76EE\u5F55\u672A\u7EDF\u8BA1",
  projectTruncated: "\u5DF2\u622A\u65AD",
  projectPartial: "\u90E8\u5206\u5B8C\u6210\uFF08\u5DF2\u505C\u6B62\uFF09",
  cpu: "CPU",
  memory: "\u5185\u5B58",
  swap: "\u4EA4\u6362\u5185\u5B58",
  swapDisabled: "\u672A\u542F\u7528",
  load: "\u8D1F\u8F7D",
  cores: "{count} \u6838",
  uptime: "\u5DF2\u8FD0\u884C {value}",
  usedOfTotal: "{used} / {total}",
  cached: "\u7F13\u5B58 {value}",
  tagCpu: "CPU",
  tagMem: "\u5185\u5B58",
  tagName: "\u8FDB\u7A0B\u540D",
  sortDesc: "\u964D\u5E8F",
  sortAsc: "\u5347\u5E8F",
  filterPlaceholder: "\u641C\u7D22\u8FDB\u7A0B\u540D\u6216 PID",
  clearFilter: "\u6E05\u7A7A\u641C\u7D22",
  resizeCpu: "\u8C03\u6574 CPU \u5217\u5BBD",
  resizeMem: "\u8C03\u6574\u5185\u5B58\u5217\u5BBD",
  resizeHint: "\u62D6\u52A8\u8C03\u6574\u5217\u5BBD \xB7 \u53CC\u51FB\u590D\u4F4D",
  processCount: "\u5171 {count} \u4E2A\u8FDB\u7A0B",
  showingRows: "\u663E\u793A {shown} \u884C",
  threads: "{count} \u7EBF\u7A0B",
  processUnavailable: "\u2014",
  refresh: "\u7ACB\u5373\u5237\u65B0",
  autoRefresh: "\u6BCF {seconds} \u79D2\u81EA\u52A8\u5237\u65B0",
  updatedAt: "\u66F4\u65B0\u4E8E {time}",
  loading: "\u6B63\u5728\u8BFB\u53D6\u4E3B\u673A\u6307\u6807\u2026",
  empty: "\u6CA1\u6709\u5339\u914D\u7684\u8FDB\u7A0B",
  emptyAll: "\u6CA1\u6709\u8BFB\u5230\u8FDB\u7A0B\u4FE1\u606F",
  truncated: "\u5217\u8868\u5DF2\u622A\u65AD\uFF0C\u53EF\u5728\u7B5B\u9009\u6846\u4E2D\u7F29\u5C0F\u8303\u56F4",
  errorTitle: "\u8BFB\u53D6\u5931\u8D25",
  retry: "\u91CD\u8BD5",
  unsupported: "\u5F53\u524D\u4E3B\u673A\u4E0D\u662F Linux\uFF0C\u6027\u80FD\u76D1\u63A7\u65E0\u6CD5\u8BFB\u53D6 /proc\u3002",
  state: {
    R: "\u8FD0\u884C",
    S: "\u7761\u7720",
    D: "\u4E0D\u53EF\u4E2D\u65AD",
    Z: "\u50F5\u5C38",
    T: "\u505C\u6B62",
    t: "\u8DDF\u8E2A",
    I: "\u7A7A\u95F2",
    X: "\u5DF2\u6B7B"
  },
  // 平台侧无法提供的字段一律显示这个，而不是 0。
  unavailable: "\u2014",
  warnings: "\u90E8\u5206\u6307\u6807\u4E0D\u53EF\u7528",
  reader: {
    linux: "\u8BFB\u53D6 /proc",
    darwin: "\u8BFB\u53D6 ps / vm_stat",
    win32: "\u8BFB\u53D6 PowerShell",
    generic: "\u4EC5\u6807\u51C6\u5E93"
  },
  warning: {
    "swap-unavailable": "\u672C\u673A\u672A\u63D0\u4F9B\u4EA4\u6362/\u9875\u9762\u6587\u4EF6\u7528\u91CF",
    "memory-unavailable": "\u5185\u5B58\u4FE1\u606F\u4E0D\u53EF\u7528",
    "processes-unavailable": "\u8FDB\u7A0B\u5217\u8868\u4E0D\u53EF\u7528",
    "powershell-missing": "\u672A\u627E\u5230 PowerShell\uFF0C\u65E0\u6CD5\u8BFB\u53D6\u8FDB\u7A0B\u4E0E\u5185\u5B58",
    "windows-json-unreadable": "PowerShell \u8F93\u51FA\u65E0\u6CD5\u89E3\u6790",
    "generic-platform": "\u5F53\u524D\u5E73\u53F0\u6CA1\u6709\u4E13\u7528\u8BFB\u53D6\u5668\uFF0C\u4EC5\u663E\u793A\u6807\u51C6\u5E93\u80FD\u63D0\u4F9B\u7684\u6570\u636E",
    "project-dir-no-cwd": "\u5C1A\u672A\u7EDF\u8BA1\u2014\u2014\u70B9\u51FB\u53F3\u4FA7\u6309\u94AE\u7EDF\u8BA1\u5F53\u524D\u4F1A\u8BDD\u7684\u76EE\u5F55",
    "project-dir-session-unresolved": "\u65E0\u6CD5\u786E\u5B9A\u5F53\u524D\u4F1A\u8BDD\u7684\u76EE\u5F55\uFF0C\u672A\u5F00\u59CB\u7EDF\u8BA1",
    "project-dir-unavailable": "\u9879\u76EE\u76EE\u5F55\u4E0D\u53EF\u8BFB\uFF0C\u65E0\u6CD5\u7EDF\u8BA1\u5927\u5C0F",
    "project-dir-aborted": "\u7EDF\u8BA1\u5DF2\u505C\u6B62\uFF0C\u6570\u503C\u4E3A\u90E8\u5206\u7ED3\u679C",
    "project-dir-hidden": "\u76EE\u5F55\u5927\u5C0F\u7EDF\u8BA1\u5DF2\u5728\u914D\u7F6E\u4E2D\u5173\u95ED",
    "project-dir-partial": "\u76EE\u5F55\u6761\u76EE\u8FC7\u591A\uFF0C\u7EDF\u8BA1\u5DF2\u63D0\u524D\u622A\u65AD\uFF0C\u5B9E\u9645\u5360\u7528\u53EF\u80FD\u66F4\u5927",
    "project-dir-skipped": "\u90E8\u5206\u5B50\u76EE\u5F55\u4E0D\u53EF\u8BFB\uFF0C\u76EE\u5F55\u5927\u5C0F\u7EDF\u8BA1\u504F\u4F4E",
    "project-dir-dropped": "\u6D3B\u8DC3\u5DE5\u4F5C\u533A\u76EE\u5F55\u8FC7\u591A\uFF0C\u4EC5\u7EDF\u8BA1\u5176\u4E2D\u4E00\u90E8\u5206",
    "temperature-hidden": "\u6E29\u5EA6\u5361\u7247\u5DF2\u5728\u914D\u7F6E\u4E2D\u5173\u95ED",
    "temperature-unavailable": "\u672C\u673A\u6CA1\u6709\u53EF\u8BFB\u53D6\u7684\u6E29\u5EA6\u4F20\u611F\u5668",
    "temperature-cpu-unavailable": "CPU \u6E29\u5EA6\u4E0D\u53EF\u8BFB\u2014\u2014Windows \u4E0A\u9700\u8FD0\u884C\u786C\u4EF6\u76D1\u63A7\u8F6F\u4EF6\uFF08\u5982 LibreHardwareMonitor\uFF09\uFF0C\u9762\u677F\u4F1A\u81EA\u52A8\u8BC6\u522B",
    "temperature-gpu-unavailable": "\u663E\u5361\u6E29\u5EA6\u4E0D\u53EF\u8BFB",
    "temperature-mainboard-unavailable": "\u4E3B\u677F\u6E29\u5EA6\u4E0D\u53EF\u8BFB",
    "temperature-disk-unavailable": "\u786C\u76D8\u6E29\u5EA6\u4E0D\u53EF\u8BFB",
    "temperature-json-unreadable": "\u6E29\u5EA6\u67E5\u8BE2\u8F93\u51FA\u65E0\u6CD5\u89E3\u6790",
    "temperature-failed": "\u6E29\u5EA6\u67E5\u8BE2\u5931\u8D25",
    "gpu-hidden": "\u663E\u5361\u884C\u5DF2\u5728\u914D\u7F6E\u4E2D\u5173\u95ED",
    "gpu-unavailable": "\u672C\u673A\u6CA1\u6709\u53EF\u8BFB\u53D6\u7684\u663E\u5361\u4FE1\u606F",
    "gpu-memory-unavailable": "\u663E\u5B58\u5360\u7528\u4E0D\u53EF\u8BFB",
    "gpu-clock-unavailable": "\u663E\u5361\u9891\u7387\u4E0D\u53EF\u8BFB\uFF08Windows \u65E0\u7CFB\u7EDF\u7EA7\u6765\u6E90\uFF0C\u9700 nvidia-smi \u6216\u786C\u4EF6\u76D1\u63A7\u8F6F\u4EF6\uFF09",
    "gpu-failed": "\u663E\u5361\u67E5\u8BE2\u5931\u8D25",
    "gpu-json-unreadable": "\u663E\u5361\u67E5\u8BE2\u8F93\u51FA\u65E0\u6CD5\u89E3\u6790"
  }
};
var EN = {
  title: "Performance",
  tabTitle: "Performance",
  description: "Live CPU, memory and process usage",
  headerButton: "Performance monitor",
  headerButtonOpen: "Open the performance monitor",
  resources: "Resource usage",
  processes: "Processes",
  gpuLine: "GPU",
  gpuClock: "{clock} MHz",
  gpuClockUnavailable: "clock \u2014",
  gpuVram: "VRAM {used} / {total}",
  gpuVramUnavailable: "VRAM \u2014",
  temperatures: "Temperatures",
  temperatureCpu: "CPU",
  temperatureGpu: "GPU",
  temperatureMainboard: "Motherboard",
  temperatureDisk: "Drives",
  temperatureUnit: "\xB0C",
  temperatureRange: "min {min} \xB7 max {max}",
  temperatureSensors: "{count} sensors",
  temperatureUnavailableShort: "unavailable",
  projectDir: "Project folder",
  measureStart: "Measure the current session folders",
  measureStartSession: "Measure the current session folders ({id})",
  measureStop: "Stop measuring",
  measuring: "Measuring\u2026",
  measuringHint: "Only the viewed session folders \xB7 stoppable any time",
  projectUsage: "{size} \xB7 {count} items",
  projectDirCount: "{count} folders",
  projectDropped: "{count} more folders not measured",
  projectTruncated: "partial",
  projectPartial: "partial (stopped)",
  cpu: "CPU",
  memory: "Memory",
  swap: "Swap",
  swapDisabled: "Not enabled",
  load: "Load",
  cores: "{count} cores",
  uptime: "up {value}",
  usedOfTotal: "{used} / {total}",
  cached: "cache {value}",
  tagCpu: "CPU",
  tagMem: "Memory",
  tagName: "Name",
  sortDesc: "descending",
  sortAsc: "ascending",
  filterPlaceholder: "Search by name or PID",
  clearFilter: "Clear search",
  resizeCpu: "Resize the CPU column",
  resizeMem: "Resize the memory column",
  resizeHint: "Drag to resize \xB7 double-click to reset",
  processCount: "{count} processes",
  showingRows: "showing {shown}",
  threads: "{count} threads",
  processUnavailable: "\u2014",
  refresh: "Refresh now",
  autoRefresh: "Auto-refresh every {seconds}s",
  updatedAt: "Updated {time}",
  loading: "Reading host metrics\u2026",
  empty: "No process matches the filter",
  emptyAll: "No process information available",
  truncated: "List truncated; narrow it with the filter",
  errorTitle: "Could not read metrics",
  retry: "Retry",
  unsupported: "This host is not Linux, so perfmon cannot read /proc.",
  state: {
    R: "running",
    S: "sleeping",
    D: "uninterruptible",
    Z: "zombie",
    T: "stopped",
    t: "tracing",
    I: "idle",
    X: "dead"
  },
  // Anything a platform cannot answer renders as this, never as a zero.
  unavailable: "\u2014",
  warnings: "Some metrics are unavailable",
  reader: {
    linux: "reading /proc",
    darwin: "reading ps / vm_stat",
    win32: "reading PowerShell",
    generic: "standard library only"
  },
  warning: {
    "swap-unavailable": "This host reports no swap / page-file usage",
    "memory-unavailable": "Memory information is unavailable",
    "processes-unavailable": "The process list is unavailable",
    "powershell-missing": "PowerShell was not found, so processes and memory cannot be read",
    "windows-json-unreadable": "The PowerShell output could not be parsed",
    "generic-platform": "No dedicated reader for this platform; only standard-library figures are shown",
    "project-dir-no-cwd": "Not measured yet \u2014 use the button to measure the current session folders",
    "project-dir-session-unresolved": "The current session folder could not be determined, so nothing was measured",
    "project-dir-unavailable": "The project folder could not be read",
    "project-dir-aborted": "The scan was stopped; the figures are partial",
    "project-dir-hidden": "Folder-size metering is disabled in the configuration",
    "project-dir-partial": "A folder has too many entries; the scan stopped early and the total may be low",
    "project-dir-skipped": "Some subfolders could not be read, so folder sizes are understated",
    "project-dir-dropped": "More open workspaces than one scan covers; only some were measured",
    "temperature-hidden": "The temperature card is disabled in the configuration",
    "temperature-unavailable": "This host exposes no readable temperature sensor",
    "temperature-cpu-unavailable": "CPU temperature is unreadable \u2014 on Windows this needs a hardware monitor such as LibreHardwareMonitor running, which the panel picks up automatically",
    "temperature-gpu-unavailable": "GPU temperature is unreadable",
    "temperature-mainboard-unavailable": "Motherboard temperature is unreadable",
    "temperature-disk-unavailable": "Drive temperature is unreadable",
    "temperature-json-unreadable": "The temperature query output could not be parsed",
    "temperature-failed": "The temperature query failed",
    "gpu-hidden": "The GPU line is disabled in the configuration",
    "gpu-unavailable": "This host exposes no readable GPU information",
    "gpu-memory-unavailable": "VRAM usage is unreadable",
    "gpu-clock-unavailable": "GPU clock is unreadable (Windows has no OS-level source; it needs nvidia-smi or a hardware monitor)",
    "gpu-failed": "The GPU query failed",
    "gpu-json-unreadable": "The GPU query output could not be parsed"
  }
};
function resolveLanguage() {
  const declared = typeof document === "undefined" ? "" : document.documentElement?.lang ?? "";
  const source = declared || (typeof navigator !== "undefined" ? navigator.language : "") || "";
  return source.toLowerCase().startsWith("zh") ? "zh" : "en";
}
function createTranslator() {
  return (key, values) => {
    const dictionary = resolveLanguage() === "zh" ? ZH : EN;
    const template = key.split(".").reduce((node, part) => node == null ? void 0 : node[part], dictionary);
    if (typeof template !== "string") return key;
    if (values === void 0) return template;
    return template.replace(/\{(\w+)\}/g, (match, name2) => {
      const value = values[name2];
      return value === void 0 ? match : String(value);
    });
  };
}
function describeWarning(t, code) {
  const prefix = code.split(":")[0].trim();
  const dictionary = resolveLanguage() === "zh" ? ZH.warning : EN.warning;
  const known = dictionary[prefix];
  if (known === void 0) return code;
  const detail = code.slice(prefix.length + 1).trim();
  return detail === "" ? known : `${known} (${detail})`;
}
function describeState(t, code) {
  const table = resolveLanguage() === "zh" ? ZH.state : EN.state;
  return table[code] ?? code;
}

// src/client/styles.js
var STYLE_ID = "dsh-perfmon-styles";
var STYLES = `
.dsh-perfmon-root {
  display: flex;
  flex-direction: column;
  gap: 10px;
  block-size: 100%;
  min-block-size: 0;
  padding: 10px;
  box-sizing: border-box;
  font: var(--dsw-font-xs-13, 400 13px/1.5 var(--dsw-font-family, system-ui));
  color: var(--dsw-alias-label-primary, currentColor);
  overflow: hidden;
}

.dsh-perfmon-card {
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.24));
  border-radius: var(--dsw-radius-md, 10px);
  background: var(--dsw-alias-bg-layer-1, transparent);
  display: flex;
  flex-direction: column;
  min-block-size: 0;
  /* A card keeps the height its content needs: in a short pane the list is what
     gives way, and the gauges are never squeezed into the next card. */
  flex: 0 0 auto;
}

.dsh-perfmon-card--processes {
  /* The one card that takes the leftover height, and scrolls inside it. */
  flex: 1 1 auto;
  min-block-size: 96px;
  overflow: hidden;
  /* The two fixed metric tracks, declared once for the header and the rows.
     "1024.0%" needs 54px; "999.9 MB \xB7 99%" needs 88px. */
  --perfmon-cpu-column: 54px;
  --perfmon-mem-column: 88px;
}

.dsh-perfmon-cardHead {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-block-end: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.18));
}

.dsh-perfmon-cardTitle {
  font-weight: 600;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, currentColor);
  letter-spacing: 0.02em;
}

.dsh-perfmon-cardMeta {
  margin-inline-start: auto;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, currentColor);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dsh-perfmon-gauges {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding: 10px 6px 12px;
  flex: 0 0 auto;
}

.dsh-perfmon-gauge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  min-inline-size: 0;
}

.dsh-perfmon-gaugeRing {
  position: relative;
  display: grid;
  place-items: center;
}

.dsh-perfmon-gaugeValue {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  /* Sized to stay inside the ring's inner diameter even at four digits
     ("1024.0%" is the realistic worst case on the per-core scale) \u2014 the value
     used to be wider than the hole it was centred in, so it drew over the ring. */
  font: var(--dsw-font-xxxs-strong-11, 600 11px/1 var(--dsw-font-family, system-ui));
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.dsh-perfmon-gaugeLabel {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, currentColor);
}

.dsh-perfmon-gaugeDetail {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, currentColor);
  text-align: center;
  font-variant-numeric: tabular-nums;
  max-inline-size: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The project-directory line sits under the gauges, inside the resource card.
   The card is a flex column that must keep its own height, so this row is fixed:
   a shrinking child here is the same squeeze that twice bit the search field. */
.dsh-perfmon-disk {
  flex: none;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 7px 12px 9px;
  border-block-start: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.22));
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  min-inline-size: 0;
}

.dsh-perfmon-diskLabel {
  color: var(--dsw-alias-label-secondary, currentColor);
  white-space: nowrap;
}

.dsh-perfmon-diskValue {
  font-weight: 600;
  white-space: nowrap;
}

/* The no-answer-yet spinner: a quarter arc that turns inside the value's box,
   so the row's height and baseline stay exactly the same as when a size shows. */
.dsh-perfmon-diskSpinner {
  box-sizing: border-box;
  inline-size: 11px;
  block-size: 11px;
  border: 1.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.24));
  border-block-start-color: var(--dsw-alias-brand-primary, #4f6ef7);
  border-radius: 50%;
  animation: dsh-perfmon-spin 0.9s linear infinite;
  align-self: center;
}

@keyframes dsh-perfmon-spin {
  to {
    transform: rotate(360deg);
  }
}

.dsh-perfmon-diskDetail {
  color: var(--dsw-alias-label-tertiary, currentColor);
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-perfmon-diskAction {
  flex: none;
  margin-inline-start: auto;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.24));
  border-radius: var(--dsw-radius-sm, 6px);
  background: var(--dsw-alias-bg-layer-2, transparent);
  color: var(--dsw-alias-label-secondary, currentColor);
  font-size: 10px;
  line-height: 1;
  padding: 3px 8px;
  cursor: pointer;
  white-space: nowrap;
}

.dsh-perfmon-diskAction:hover {
  color: var(--dsw-alias-label-primary, currentColor);
  border-color: var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.34));
}

/* The tag row and the data rows share one template, so every tag is the header
   of the column it orders. The two metric columns are sized to their widest real
   content ("1024.0%" and "999.9 MB \xB7 99%") and never shrink; the name column
   takes the remainder and truncates. */
/* The three tracks. The two fixed ones are resizable through the grips in the
   header; the name track takes whatever is left. The gutter is padding inside the
   cells rather than a grid gap, so the divider between two columns can sit exactly
   on their boundary. */
.dsh-perfmon-columns,
.dsh-perfmon-row {
  display: grid;
  grid-template-columns:
    var(--perfmon-cpu-column, 54px)
    var(--perfmon-mem-column, 88px)
    minmax(0, 1fr);
  align-items: center;
  gap: 0;
  padding-inline: 4px;
}

/* A hairline on every cell but the last: that is what turns three cramped
   numbers into three readable columns at any width. */
.dsh-perfmon-columns > *:not(:last-child),
.dsh-perfmon-row > *:not(:last-child) {
  border-inline-end: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.22));
}

.dsh-perfmon-columns > *,
.dsh-perfmon-row > * {
  padding-inline: 8px;
}

.dsh-perfmon-columns {
  padding-block: 8px 4px;
}

/* Rows are separated too: a dense list needs the reader's eye guided across, not
   just down. */
.dsh-perfmon-row + .dsh-perfmon-row {
  border-block-start: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.16));
}

.dsh-perfmon-column {
  position: relative;
  display: flex;
  align-items: center;
  min-inline-size: 0;
}

/* The divider's hit area. It sits inside the gutter on both sides so it never
   covers the header text, and it is tall enough to grab without aiming. */
.dsh-perfmon-columnGrip {
  position: absolute;
  inset-block: -3px;
  inset-inline-end: -7px;
  inline-size: 14px;
  z-index: 1;
  border-radius: 2px;
  cursor: col-resize;
  touch-action: none;
  outline-offset: 1px;
}

.dsh-perfmon-columnGrip::after {
  content: '';
  position: absolute;
  inset-block: 3px;
  inset-inline-start: 6px;
  inline-size: 2px;
  border-radius: 1px;
  background: transparent;
}

.dsh-perfmon-columnGrip:hover::after,
.dsh-perfmon-columnGrip:focus-visible::after,
.dsh-perfmon-columnGrip:active::after {
  background: var(--dsw-alias-brand-primary, #4f6ef7);
}

.dsh-perfmon-columnGrip:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, rgba(79, 110, 247, 0.5));
}

.dsh-perfmon-column--end {
  justify-content: flex-end;
}

.dsh-perfmon-column--start {
  justify-content: flex-start;
}

/* Cancel the button's own padding so its text lines up with the column's edge \u2014
   a header that is merely centred over its column reads as decoration. */
.dsh-perfmon-column--end .dsh-perfmon-tab {
  margin-inline-end: -6px;
}

.dsh-perfmon-column--start .dsh-perfmon-tab {
  margin-inline-start: -6px;
}

.dsh-perfmon-tab {
  font: inherit;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--dsw-radius-sm, 6px);
  border: 0.5px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary, currentColor);
  white-space: nowrap;
}

.dsh-perfmon-tab:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));
}

.dsh-perfmon-tab[aria-pressed='true'] {
  background: var(--dsw-alias-interactive-bg-active, rgba(127, 127, 127, 0.18));
  border-color: var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.3));
  color: var(--dsw-alias-label-primary, currentColor);
  font-weight: 600;
}

.dsh-perfmon-tabArrow {
  margin-inline-start: 3px;
  color: var(--dsw-alias-label-tertiary, currentColor);
}

/* The search field: a bordered, filled control with its own magnifier and clear
   button. It has to look like an input at a glance \u2014 the panel's own filter used
   to be a bare underline that read as a static label. */
.dsh-perfmon-search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 12px 4px;
  padding: 0 8px;
  block-size: 26px;
  min-block-size: 26px;
  /* A flex item would otherwise shrink below its block-size when the card is
     tight, which made the field 22px when empty and 26px once it had a clear
     button \u2014 a visible jump. It is a fixed control, not a flexible one. */
  flex: none;
  box-sizing: border-box;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.3));
  border-radius: var(--dsw-radius-sm, 6px);
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.06));
  color: var(--dsw-alias-label-tertiary, currentColor);
}

.dsh-perfmon-search:focus-within {
  border-color: var(--dsw-alias-brand-primary, #4f6ef7);
  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, rgba(79, 110, 247, 0.3));
  color: var(--dsw-alias-label-secondary, currentColor);
}

.dsh-perfmon-searchIcon {
  display: flex;
  flex: none;
  align-items: center;
}

.dsh-perfmon-filter {
  flex: 1 1 auto;
  min-inline-size: 0;
  font: inherit;
  font-size: 11px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary, currentColor);
  outline: none;
}

.dsh-perfmon-filter::placeholder {
  color: var(--dsw-alias-label-tertiary, currentColor);
}

/* The native search decoration would sit next to our own clear control. */
.dsh-perfmon-filter::-webkit-search-cancel-button,
.dsh-perfmon-filter::-webkit-search-decoration {
  -webkit-appearance: none;
  appearance: none;
}

.dsh-perfmon-searchClear {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  inline-size: 16px;
  block-size: 16px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, currentColor);
  cursor: pointer;
}

.dsh-perfmon-searchClear:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14));
  color: var(--dsw-alias-label-primary, currentColor);
}

.dsh-perfmon-rows {
  flex: 1 1 auto;
  min-block-size: 0;
  overflow-y: auto;
  /* A grid item whose content is wider than its track overflows visibly, and an
     overflow-y:auto box computes its other axis to auto as well \u2014 that pair is
     what produced a horizontal scrollbar. The tracks are sized so nothing
     overflows, and this keeps either axis from ever appearing. */
  overflow-x: hidden;
  padding: 4px 0 6px;
}

.dsh-perfmon-row {
  padding-block: 5px;
  border-radius: var(--dsw-radius-sm, 6px);
}

.dsh-perfmon-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.1));
}

.dsh-perfmon-name {
  min-inline-size: 0;
  overflow: hidden;
}

.dsh-perfmon-nameText {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dsh-perfmon-nameMeta {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, currentColor);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

.dsh-perfmon-metric {
  display: flex;
  flex-direction: column;
  gap: 3px;
  /* The track is fixed and the content is nowrap: clipping here is what keeps a
     long value from widening the scroller. */
  min-inline-size: 0;
  overflow: hidden;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.dsh-perfmon-metricLine {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 0;
  min-inline-size: 0;
  overflow: hidden;
  white-space: nowrap;
}

.dsh-perfmon-metricValue {
  flex: none;
}

.dsh-perfmon-metricShare {
  flex: 0 1 auto;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--dsw-alias-label-tertiary, currentColor);
}

.dsh-perfmon-metricBar {
  block-size: 2px;
  border-radius: 999px;
  background: var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.24));
  overflow: hidden;
}

.dsh-perfmon-metricBarFill {
  block-size: 100%;
  border-radius: 999px;
}

.dsh-perfmon-cpuFill {
  background: var(--dsw-alias-brand-primary, #4f6ef7);
}

.dsh-perfmon-memFill {
  background: var(--dsw-alias-state-warn-primary, #d99a2b);
}

.dsh-perfmon-swapFill {
  background: var(--dsw-alias-state-business-primary, #6b7bd6);
}

.dsh-perfmon-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px 8px;
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, currentColor);
}

.dsh-perfmon-footSpacer {
  margin-inline-start: auto;
}

.dsh-perfmon-action {
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.24));
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-secondary, currentColor);
  padding: 4px 8px;
}

.dsh-perfmon-action:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));
}

.dsh-perfmon-notice {
  margin: 10px;
  padding: 8px 10px;
  border-radius: var(--dsw-radius-sm, 6px);
  border: 0.5px solid var(--dsw-alias-state-error-secondary, rgba(200, 80, 80, 0.4));
  background: var(--dsw-alias-bg-layer-2, transparent);
  color: var(--dsw-alias-state-error-primary, currentColor);
  font-size: 11px;
  line-height: 1.5;
}

.dsh-perfmon-notice--muted {
  border-color: var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.24));
  color: var(--dsw-alias-label-secondary, currentColor);
}

.dsh-perfmon-warningList {
  margin: 4px 0 0;
  padding-inline-start: 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dsh-perfmon-empty {
  padding: 18px 10px;
  text-align: center;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, currentColor);
}

/* The temperature card sits under the resource card. Like it, it keeps the height
   its content needs: in a short pane the process list is what gives way, never
   these four tiles. Two columns rather than four: a four-across row leaves each
   tile about 90px in a normal Sidebar, which fits "27.9\xB0C" but not the English
   labels ("Motherboard"), and a label that wraps or truncates is worse than the
   extra row. */
.dsh-perfmon-temps {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
  padding: 8px 12px 10px;
  flex: 0 0 auto;
}

/* A tile is two lines: the reading, then the component. The detail the third
   line used to carry lives in the tooltip \u2014 the card read as mostly whitespace
   at three lines for what is two short strings. */
.dsh-perfmon-temp {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 5px 6px;
  min-inline-size: 0;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.24));
  border-radius: var(--dsw-radius-sm, 6px);
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.06));
  /* The tile is a fixed control: without this a tight card squeezes it and the
     reading collides with the label. */
  flex: none;
}

.dsh-perfmon-tempValue {
  font: var(--dsw-font-sm-strong-13, 600 13px/1.2 var(--dsw-font-family, system-ui));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary, currentColor);
}

.dsh-perfmon-tempUnit {
  margin-inline-start: 1px;
  font-size: 10px;
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary, currentColor);
}

.dsh-perfmon-tempLabel {
  font-size: 11px;
  line-height: 1.3;
  color: var(--dsw-alias-label-secondary, currentColor);
  white-space: nowrap;
  max-inline-size: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Three tones, each a border and a value colour rather than a filled block: a
   filled tile at four across would shout, and the reading has to stay the thing
   the eye lands on. The unknown tone is the plain card border. */
.dsh-perfmon-temp--cool {
  border-color: var(--dsw-alias-state-success-secondary, rgba(80, 170, 120, 0.4));
}

.dsh-perfmon-temp--cool .dsh-perfmon-tempValue {
  color: var(--dsw-alias-state-success-primary, currentColor);
}

.dsh-perfmon-temp--warm {
  border-color: var(--dsw-alias-state-warn-secondary, rgba(217, 154, 43, 0.5));
}

.dsh-perfmon-temp--warm .dsh-perfmon-tempValue {
  color: var(--dsw-alias-state-warn-primary, currentColor);
}

.dsh-perfmon-temp--hot {
  border-color: var(--dsw-alias-state-error-secondary, rgba(200, 80, 80, 0.5));
}

.dsh-perfmon-temp--hot .dsh-perfmon-tempValue {
  color: var(--dsw-alias-state-error-primary, currentColor);
}

.dsh-perfmon-headerButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  block-size: 28px;
  padding: 0 10px;
  border: 0.5px solid transparent;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-secondary, currentColor);
  white-space: nowrap;
}

.dsh-perfmon-headerButton:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));
  color: var(--dsw-alias-label-primary, currentColor);
}

.dsh-perfmon-headerButtonLabel {
  white-space: nowrap;
}
`;
function installStyles() {
  if (typeof document === "undefined") return () => {
  };
  const existing = document.getElementById(STYLE_ID);
  if (existing !== null) return () => {
  };
  const node = document.createElement("style");
  node.id = STYLE_ID;
  node.textContent = STYLES;
  document.head.append(node);
  return () => {
    node.remove();
  };
}

// src/client/PerfmonBody.jsx
var import_react4 = require("react");

// src/client/api.js
var SNAPSHOT_PATH = "/api/perfmon.snapshot";
async function fetchSnapshot(request = {}) {
  const body = { sort: request.sort, limit: request.limit };
  if (request.measure === true || request.measure === false) body.measure = request.measure;
  if (typeof request.session === "string" && request.session !== "") body.session = request.session;
  const response = await fetch(SNAPSHOT_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    signal: request.signal
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Unexpected response from the perfmon host route (HTTP ${String(response.status)}).`);
  }
  if (payload?.ok !== true) {
    const message = payload?.error?.message;
    throw new Error(typeof message === "string" && message !== "" ? message : `HTTP ${String(response.status)}`);
  }
  return payload.value;
}

// src/client/GaugePanel.jsx
var import_react = require("react");

// src/client/format.js
var EMPTY = "\u2014";
var BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];
function formatBytes(bytes, empty = EMPTY) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return empty;
  if (bytes < 1024) return `${String(Math.round(bytes))} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${BYTE_UNITS[unit]}`;
}
function formatBytesCompact(bytes, empty = EMPTY) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return empty;
  if (bytes < 1024) return `${String(Math.round(bytes))}B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)}${BYTE_UNITS[unit]}`;
}
function formatPercent(value, empty = EMPTY) {
  if (typeof value !== "number" || !Number.isFinite(value)) return empty;
  return `${value.toFixed(1)}%`;
}
function formatShare(value, empty = EMPTY) {
  if (typeof value !== "number" || !Number.isFinite(value)) return empty;
  return `${String(Math.round(value))}%`;
}
function formatDuration(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return EMPTY;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  if (days > 0) return `${String(days)}d ${String(hours)}h`;
  if (hours > 0) return `${String(hours)}h ${String(minutes)}m`;
  return `${String(minutes)}m`;
}
function formatClock(timestamp) {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return EMPTY;
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function formatCelsius(celsius, empty = EMPTY) {
  if (typeof celsius !== "number" || !Number.isFinite(celsius)) return empty;
  return celsius.toFixed(1);
}
function barWidth(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 100);
}

// src/client/GaugePanel.jsx
var GAUGE_RING = { size: 58, stroke: 4.5, radius: 25 };
var RING = GAUGE_RING;
var CIRCUMFERENCE = 2 * Math.PI * RING.radius;
function Gauge({ label, percent, detail, tone, title }) {
  const known = typeof percent === "number" && Number.isFinite(percent);
  const filled = known ? barWidth(percent) / 100 * CIRCUMFERENCE : 0;
  return (0, import_react.createElement)(
    "div",
    { className: "dsh-perfmon-gauge", title },
    (0, import_react.createElement)(
      "div",
      { className: "dsh-perfmon-gaugeRing" },
      (0, import_react.createElement)(
        "svg",
        { width: RING.size, height: RING.size, viewBox: `0 0 ${String(RING.size)} ${String(RING.size)}` },
        (0, import_react.createElement)("circle", {
          cx: RING.size / 2,
          cy: RING.size / 2,
          r: RING.radius,
          fill: "none",
          // A border token, not a background one: the empty part of the ring has to
          // be visible, or the value reads as floating beside the arc instead of
          // sitting inside a dial.
          stroke: "var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.34))",
          strokeWidth: RING.stroke
        }),
        (0, import_react.createElement)("circle", {
          cx: RING.size / 2,
          cy: RING.size / 2,
          r: RING.radius,
          fill: "none",
          stroke: tone,
          strokeWidth: RING.stroke,
          strokeLinecap: "round",
          strokeDasharray: `${String(filled)} ${String(CIRCUMFERENCE)}`,
          transform: `rotate(-90 ${String(RING.size / 2)} ${String(RING.size / 2)})`
        })
      ),
      (0, import_react.createElement)("span", { className: "dsh-perfmon-gaugeValue" }, formatPercent(percent))
    ),
    (0, import_react.createElement)("span", { className: "dsh-perfmon-gaugeLabel" }, label),
    (0, import_react.createElement)("span", { className: "dsh-perfmon-gaugeDetail", title: detail }, detail)
  );
}
function DiskPanel({ disk, warnings = [], sessionId, measure, t }) {
  if (disk == null) return null;
  if (disk.status === "hidden") return null;
  const running = measure?.running === true;
  const known = typeof disk.projectBytes === "number" && Number.isFinite(disk.projectBytes);
  const aborted = Array.isArray(disk.warnings) && disk.warnings.includes("project-dir-aborted");
  const warning = Array.isArray(disk.warnings) && disk.warnings.find((code) => code !== "project-dir-aborted") || warnings[0];
  const note = typeof warning === "string" ? describeWarning(t, warning) : void 0;
  const abortNote = aborted ? t("projectPartial") : void 0;
  const detail = known ? t("projectUsage", {
    size: formatBytes(disk.projectBytes),
    count: String(disk.projectEntries ?? 0)
  }) : running ? t("measuring") : note ?? EMPTY;
  const folders = Array.isArray(disk.projectDirs) ? disk.projectDirs : [];
  const dirCount = folders.length > 0 ? folders.length : void 0;
  const dirNames = folders.map((entry) => entry?.dir).filter((dir) => typeof dir === "string");
  const dropped = known && typeof disk.droppedDirCount === "number" && disk.droppedDirCount > 0 ? t("projectDropped", { count: String(disk.droppedDirCount) }) : void 0;
  const tail = known ? [
    dirCount === void 0 ? void 0 : t("projectDirCount", { count: String(dirCount) }),
    disk.projectTruncated === true ? t("projectTruncated") : void 0,
    abortNote,
    dropped,
    // Without a dropped count, a single-folder reading's own first warning
    // (partial, skipped) still belongs beside the figure it qualifies.
    dirCount === void 0 && dropped === void 0 ? note ?? "" : void 0
  ].filter((part) => part !== void 0).filter((part) => part !== "").map((part) => ` \xB7 ${part}`).join("") : running ? ` \xB7 ${t("measuringHint")}` : "";
  const titleParts = dirNames.length > 0 ? dirNames : [];
  const titleDetail = known ? [detail, note].filter((part) => part !== void 0).join(" \xB7 ") : note;
  const title = [...titleParts, titleDetail].filter((part) => part !== void 0).join("\n");
  return (0, import_react.createElement)(
    "div",
    { className: "dsh-perfmon-disk", title },
    (0, import_react.createElement)("span", { className: "dsh-perfmon-diskLabel" }, t("projectDir")),
    running ? (0, import_react.createElement)("span", { className: "dsh-perfmon-diskSpinner", role: "status", "aria-label": t("measuring") }) : (0, import_react.createElement)("span", { className: "dsh-perfmon-diskValue" }, known ? formatBytes(disk.projectBytes) : EMPTY),
    (0, import_react.createElement)("span", { className: "dsh-perfmon-diskDetail" }, detail + tail),
    (0, import_react.createElement)(
      "button",
      {
        type: "button",
        className: "dsh-perfmon-diskAction",
        onClick: running ? measure?.onStop : measure?.onStart,
        title: running ? t("measureStop") : sessionId === void 0 ? t("measureStart") : t("measureStartSession", { id: sessionId })
      },
      running ? t("measureStop") : t("measureStart")
    )
  );
}
function GpuPanel({ clock, vram, title, hidden, t }) {
  if (hidden) return null;
  return (0, import_react.createElement)(
    "div",
    { className: "dsh-perfmon-gpuRow", title },
    (0, import_react.createElement)("span", { className: "dsh-perfmon-gpuLabel" }, t("gpuLine")),
    (0, import_react.createElement)(
      "span",
      { className: "dsh-perfmon-gpuStats" },
      (0, import_react.createElement)("span", { className: "dsh-perfmon-gpuClock" }, clock),
      (0, import_react.createElement)("span", { className: "dsh-perfmon-gpuVram" }, vram)
    )
  );
}
function GaugePanel(props) {
  const reading = props.reading;
  const t = props.t;
  const cpu = reading?.cpu;
  const memory = reading?.memory;
  const facts = reading?.facts;
  const load = Array.isArray(cpu?.loadAverage) && cpu.loadAverage.length > 0 ? cpu.loadAverage[0] : void 0;
  const coreDetail = [
    facts?.coreCount === void 0 ? void 0 : t("cores", { count: facts.coreCount }),
    load === void 0 ? void 0 : `${t("load")} ${load.toFixed(2)}`
  ].filter((part) => part !== void 0).join(" \xB7 ");
  const memoryDetail = memory == null ? EMPTY : t("usedOfTotal", { used: formatBytes(memory.used), total: formatBytes(memory.total) });
  const memoryTitle = memory == null ? void 0 : [
    t("usedOfTotal", { used: formatBytes(memory.used), total: formatBytes(memory.total) }),
    typeof memory.cached === "number" ? t("cached", { value: formatBytes(memory.cached) }) : void 0,
    t("uptime", { value: formatDuration(facts?.uptimeSeconds) })
  ].filter((part) => part !== void 0).join(" \xB7 ");
  const swapEnabled = memory != null && memory.swapTotal > 0;
  const swapDetail = memory == null ? EMPTY : swapEnabled ? t("usedOfTotal", { used: formatBytes(memory.swapUsed), total: formatBytes(memory.swapTotal) }) : t("swapDisabled");
  const gpu = reading?.gpu;
  const gpuClock = typeof gpu?.clockMhz === "number" && Number.isFinite(gpu.clockMhz) ? t("gpuClock", { clock: String(Math.round(gpu.clockMhz)) }) : t("gpuClockUnavailable");
  const gpuVram = typeof gpu?.memoryUsedBytes === "number" && typeof gpu?.memoryTotalBytes === "number" ? t("gpuVram", {
    used: formatBytesCompact(gpu.memoryUsedBytes),
    total: formatBytesCompact(gpu.memoryTotalBytes)
  }) : t("gpuVramUnavailable");
  const gpuClockTitle = typeof gpu?.clockMhz === "number" && Number.isFinite(gpu.clockMhz) ? `${gpuClock}${typeof gpu.clockMaxMhz === "number" ? ` \xB7 max ${String(Math.round(gpu.clockMaxMhz))} MHz` : ""}` : t("gpuClockUnavailable");
  const gpuVramTitle = typeof gpu?.memoryUsedBytes === "number" && typeof gpu?.memoryTotalBytes === "number" ? `${formatBytes(gpu.memoryUsedBytes)} / ${formatBytes(gpu.memoryTotalBytes)}${typeof gpu.memoryPercent === "number" ? ` \xB7 ${formatShare(gpu.memoryPercent)}` : ""}` : t("gpuVramUnavailable");
  const gpuName = typeof gpu?.name === "string" && gpu.name !== "" ? gpu.name : void 0;
  const gpuTitle = [gpuName, gpuClockTitle, gpuVramTitle, gpu?.source].filter((part) => typeof part === "string" && part !== "").join("\n");
  const gpuHidden = gpu?.status === "hidden";
  return (0, import_react.createElement)(
    "section",
    { className: "dsh-perfmon-card", "aria-label": t("resources") },
    (0, import_react.createElement)(
      "div",
      { className: "dsh-perfmon-cardHead" },
      (0, import_react.createElement)("span", { className: "dsh-perfmon-cardTitle" }, t("resources")),
      (0, import_react.createElement)(
        "span",
        {
          className: "dsh-perfmon-cardMeta",
          title: [facts?.model, facts?.release].filter((part) => typeof part === "string" && part !== "").join(" \xB7 ")
        },
        [
          facts?.hostname,
          facts?.platformLabel,
          facts?.arch,
          t("uptime", { value: formatDuration(facts?.uptimeSeconds) })
        ].filter((part) => typeof part === "string" && part !== "").join(" \xB7 ")
      )
    ),
    (0, import_react.createElement)(
      "div",
      { className: "dsh-perfmon-gauges" },
      (0, import_react.createElement)(Gauge, {
        label: t("cpu"),
        percent: cpu?.percent ?? null,
        detail: coreDetail === "" ? EMPTY : coreDetail,
        tone: "var(--dsw-alias-brand-primary, #4f6ef7)",
        title: t("cpu")
      }),
      (0, import_react.createElement)(Gauge, {
        label: t("memory"),
        percent: memory?.percent ?? null,
        detail: memoryDetail,
        tone: "var(--dsw-alias-state-warn-primary, #d99a2b)",
        title: memoryTitle
      }),
      (0, import_react.createElement)(Gauge, {
        label: t("swap"),
        percent: swapEnabled ? memory.swapPercent : null,
        detail: swapDetail,
        tone: "var(--dsw-alias-state-business-primary, #6b7bd6)",
        title: swapDetail
      })
    ),
    (0, import_react.createElement)(DiskPanel, {
      disk: reading?.disk,
      warnings: reading?.warnings,
      measure: props.measure,
      t
    }),
    (0, import_react.createElement)(GpuPanel, { gpu, clock: gpuClock, vram: gpuVram, title: gpuTitle, hidden: gpu?.status === "hidden", t })
  );
}

// src/client/ProcessPanel.jsx
var import_react2 = require("react");
var SORT_TAGS = [
  { id: "cpu", label: "tagCpu", arrow: "\u2193", hint: "sortDesc", grip: "resizeCpu" },
  { id: "mem", label: "tagMem", arrow: "\u2193", hint: "sortDesc", grip: "resizeMem" },
  { id: "name", label: "tagName", arrow: "\u2191", hint: "sortAsc" }
];
var COLUMN_LIMITS = {
  cpu: { min: 40, max: 160, fallback: 54 },
  mem: { min: 64, max: 220, fallback: 88 }
};
var NAME_FLOOR = 72;
var WIDTH_STORAGE_KEY = "dsh-perfmon.columns.v1";
function clampColumnWidth(which, value) {
  const { min, max, fallback } = COLUMN_LIMITS[which];
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), min), max);
}
function defaultWidths() {
  return { cpu: COLUMN_LIMITS.cpu.fallback, mem: COLUMN_LIMITS.mem.fallback };
}
function readStoredWidths() {
  try {
    const raw = globalThis.localStorage?.getItem(WIDTH_STORAGE_KEY);
    if (raw === null || raw === void 0) return defaultWidths();
    const parsed = JSON.parse(raw);
    return { cpu: clampColumnWidth("cpu", parsed?.cpu), mem: clampColumnWidth("mem", parsed?.mem) };
  } catch {
    return defaultWidths();
  }
}
function storeWidths(widths) {
  try {
    globalThis.localStorage?.setItem(WIDTH_STORAGE_KEY, JSON.stringify(widths));
  } catch {
  }
}
function ColumnHeader({ tag, active, width, onSortChange, onGripPointerDown, onGripKeyDown, onGripReset, t }) {
  const right = tag.id !== "name";
  const grip = tag.grip === void 0 ? null : COLUMN_LIMITS[tag.id];
  return (0, import_react2.createElement)(
    "div",
    {
      className: `dsh-perfmon-column dsh-perfmon-column--${right ? "end" : "start"}`,
      "data-column": tag.id,
      role: "columnheader"
    },
    (0, import_react2.createElement)(
      "button",
      {
        type: "button",
        className: "dsh-perfmon-tab",
        "aria-pressed": active,
        title: `${t(tag.label)} \xB7 ${t(tag.hint)}`,
        onClick: () => {
          onSortChange(tag.id);
        }
      },
      t(tag.label),
      active ? (0, import_react2.createElement)("span", { className: "dsh-perfmon-tabArrow" }, tag.arrow) : null
    ),
    // The divider doubles as the handle: drag it to widen the column it closes,
    // double-click or Home to return it to the shipped width, and the arrow keys
    // move it for anyone not using a pointer.
    grip === null ? null : (0, import_react2.createElement)("span", {
      className: "dsh-perfmon-columnGrip",
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": t(tag.grip),
      "aria-valuenow": width,
      "aria-valuemin": grip.min,
      "aria-valuemax": grip.max,
      title: t("resizeHint"),
      tabIndex: 0,
      "data-grip": tag.id,
      onPointerDown: (event) => {
        onGripPointerDown(tag.id, event);
      },
      onDoubleClick: () => {
        onGripReset(tag.id);
      },
      onKeyDown: (event) => {
        onGripKeyDown(tag.id, event);
      }
    })
  );
}
function SearchIcon() {
  return (0, import_react2.createElement)(
    "svg",
    { width: 12, height: 12, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", focusable: "false" },
    (0, import_react2.createElement)("circle", { cx: 7, cy: 7, r: 4.25, stroke: "currentColor", strokeWidth: 1.4 }),
    (0, import_react2.createElement)("path", { d: "M10.2 10.2 13.5 13.5", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" })
  );
}
function ClearIcon() {
  return (0, import_react2.createElement)(
    "svg",
    { width: 10, height: 10, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", focusable: "false" },
    (0, import_react2.createElement)("path", { d: "M4 4 12 12M12 4 4 12", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" })
  );
}
function MetricCell({ column, value, percent, tone, title }) {
  return (0, import_react2.createElement)(
    "div",
    { className: "dsh-perfmon-metric", "data-column": column, title },
    (0, import_react2.createElement)(
      "div",
      { className: "dsh-perfmon-metricLine" },
      (0, import_react2.createElement)("span", { className: "dsh-perfmon-metricValue" }, value)
    ),
    (0, import_react2.createElement)(
      "div",
      { className: "dsh-perfmon-metricBar" },
      (0, import_react2.createElement)("div", {
        className: `dsh-perfmon-metricBarFill ${tone}`,
        style: { inlineSize: `${String(barWidth(percent))}%` }
      })
    )
  );
}
function ProcessPanel({ reading, sort, onSortChange, t }) {
  const [filter, setFilter] = (0, import_react2.useState)("");
  const [widths, setWidths] = (0, import_react2.useState)(readStoredWidths);
  const processes = reading?.processes ?? [];
  const widthsRef = (0, import_react2.useRef)(widths);
  widthsRef.current = widths;
  const fitWidth = (which, candidate, containerWidth) => {
    const other = which === "cpu" ? widthsRef.current.mem : widthsRef.current.cpu;
    const clamped = clampColumnWidth(which, candidate);
    if (!Number.isFinite(containerWidth) || containerWidth <= 0) return clamped;
    const room = containerWidth - other - NAME_FLOOR - 48;
    return Math.max(COLUMN_LIMITS[which].min, Math.min(clamped, Math.floor(room)));
  };
  const setColumnWidth = (which, candidate, containerWidth) => {
    const next = fitWidth(which, candidate, containerWidth);
    setWidths((current) => current[which] === next ? current : { ...current, [which]: next });
  };
  const resetColumn = (which) => {
    setWidths((current) => ({ ...current, [which]: COLUMN_LIMITS[which].fallback }));
  };
  const onGripPointerDown = (which, event) => {
    event.preventDefault();
    event.stopPropagation();
    const card = event.currentTarget.closest(".dsh-perfmon-card--processes");
    const containerWidth = card === null ? void 0 : card.clientWidth;
    const startX = event.clientX;
    const startWidth = widthsRef.current[which];
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const onMove = (moveEvent) => {
      setColumnWidth(which, startWidth + (moveEvent.clientX - startX), containerWidth);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const onGripKeyDown = (which, event) => {
    const step = event.shiftKey ? 16 : 4;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setColumnWidth(which, widthsRef.current[which] - step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setColumnWidth(which, widthsRef.current[which] + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      resetColumn(which);
    }
  };
  const settled = (0, import_react2.useRef)(false);
  (0, import_react2.useEffect)(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    storeWidths(widths);
  }, [widths]);
  const rows = (0, import_react2.useMemo)(() => {
    const needle = filter.trim().toLowerCase();
    if (needle === "") return processes;
    return processes.filter(
      (process) => process.name.toLowerCase().includes(needle) || String(process.pid).includes(needle)
    );
  }, [processes, filter]);
  const total = reading?.processCount;
  const meta = [
    total === void 0 ? void 0 : t("processCount", { count: total }),
    t("showingRows", { shown: rows.length })
  ].filter((part) => part !== void 0).join(" \xB7 ");
  return (0, import_react2.createElement)(
    "section",
    {
      className: "dsh-perfmon-card dsh-perfmon-card--processes",
      "aria-label": t("processes"),
      style: {
        "--perfmon-cpu-column": `${String(widths.cpu)}px`,
        "--perfmon-mem-column": `${String(widths.mem)}px`
      }
    },
    (0, import_react2.createElement)(
      "div",
      { className: "dsh-perfmon-cardHead" },
      (0, import_react2.createElement)("span", { className: "dsh-perfmon-cardTitle" }, t("processes")),
      (0, import_react2.createElement)("span", { className: "dsh-perfmon-cardMeta" }, meta)
    ),
    (0, import_react2.createElement)(
      "div",
      { className: "dsh-perfmon-columns", role: "row", "aria-label": t("processes") },
      SORT_TAGS.map(
        (tag) => (0, import_react2.createElement)(ColumnHeader, {
          key: tag.id,
          tag,
          active: sort === tag.id,
          width: tag.id === "name" ? void 0 : widths[tag.id],
          onSortChange,
          onGripPointerDown,
          onGripKeyDown,
          onGripReset: resetColumn,
          t
        })
      )
    ),
    // A bordered field with its own magnifier and clear control. The previous
    // version was a bare underlined input, which read as a static label — the
    // filter existed but nobody could see it was one.
    (0, import_react2.createElement)(
      "div",
      { className: "dsh-perfmon-search" },
      (0, import_react2.createElement)("span", { className: "dsh-perfmon-searchIcon" }, (0, import_react2.createElement)(SearchIcon, null)),
      (0, import_react2.createElement)("input", {
        className: "dsh-perfmon-filter",
        type: "search",
        value: filter,
        placeholder: t("filterPlaceholder"),
        "aria-label": t("filterPlaceholder"),
        onChange: (event) => {
          setFilter(event.target.value);
        },
        onKeyDown: (event) => {
          if (event.key === "Escape" && filter !== "") {
            event.preventDefault();
            setFilter("");
          }
        }
      }),
      filter === "" ? null : (0, import_react2.createElement)(
        "button",
        {
          type: "button",
          className: "dsh-perfmon-searchClear",
          "aria-label": t("clearFilter"),
          title: t("clearFilter"),
          onClick: () => {
            setFilter("");
          }
        },
        (0, import_react2.createElement)(ClearIcon, null)
      )
    ),
    (0, import_react2.createElement)(
      "div",
      { className: "dsh-perfmon-rows" },
      rows.length === 0 ? (0, import_react2.createElement)(
        "div",
        { className: "dsh-perfmon-empty" },
        processes.length === 0 ? t("emptyAll") : t("empty")
      ) : rows.map(
        (process) => (0, import_react2.createElement)(
          "div",
          { key: process.pid, className: "dsh-perfmon-row", role: "row" },
          (0, import_react2.createElement)(MetricCell, {
            column: "cpu",
            value: formatPercent(process.cpuPercent),
            percent: process.cpuPercent,
            tone: "dsh-perfmon-cpuFill",
            title: `${t("cpu")} ${formatPercent(process.cpuPercent)}`
          }),
          (0, import_react2.createElement)(
            "div",
            {
              className: "dsh-perfmon-metric",
              "data-column": "mem",
              title: `${t("memory")} ${formatBytes(process.rssBytes)} \xB7 ${formatPercent(process.memPercent)}`
            },
            (0, import_react2.createElement)(
              "div",
              { className: "dsh-perfmon-metricLine" },
              (0, import_react2.createElement)("span", { className: "dsh-perfmon-metricValue" }, formatBytes(process.rssBytes)),
              // The share is the first thing to go when the column is tight:
              // the bar still carries it, and the exact figure stays in the tooltip.
              (0, import_react2.createElement)("span", { className: "dsh-perfmon-metricShare" }, ` \xB7 ${formatShare(process.memPercent)}`)
            ),
            (0, import_react2.createElement)(
              "div",
              { className: "dsh-perfmon-metricBar" },
              (0, import_react2.createElement)("div", {
                className: "dsh-perfmon-metricBarFill dsh-perfmon-memFill",
                style: { inlineSize: `${String(barWidth(process.memPercent))}%` }
              })
            )
          ),
          (0, import_react2.createElement)(
            "div",
            { className: "dsh-perfmon-name", "data-column": "name" },
            (0, import_react2.createElement)("div", { className: "dsh-perfmon-nameText", title: process.name }, process.name),
            (0, import_react2.createElement)(
              "div",
              { className: "dsh-perfmon-nameMeta" },
              // Windows reports neither a thread count nor a state; the line
              // keeps only what the platform actually answered.
              [
                `PID ${String(process.pid)}`,
                typeof process.threads === "number" ? t("threads", { count: process.threads }) : void 0,
                process.state === null || process.state === void 0 ? void 0 : describeState(t, process.state)
              ].filter((part) => part !== void 0).join(" \xB7 ")
            )
          )
        )
      )
    )
  );
}

// src/client/TemperaturePanel.jsx
var import_react3 = require("react");
var TEMPERATURE_TILES = [
  { kind: "cpu", key: "temperatureCpu" },
  { kind: "gpu", key: "temperatureGpu" },
  { kind: "mainboard", key: "temperatureMainboard" },
  { kind: "disk", key: "temperatureDisk" }
];
var TEMPERATURE_TONES = { warm: 70, hot: 85 };
function temperatureTone(celsius) {
  if (typeof celsius !== "number" || !Number.isFinite(celsius)) return "unknown";
  if (celsius >= TEMPERATURE_TONES.hot) return "hot";
  if (celsius >= TEMPERATURE_TONES.warm) return "warm";
  return "cool";
}
function tileTitle(group, warnings, kind, t) {
  if (group == null) {
    const code = warnings.find((entry) => entry === `temperature-${kind}-unavailable`);
    return code === void 0 ? void 0 : describeWarning(t, code);
  }
  const sensors = Array.isArray(group.sensors) ? group.sensors : [];
  const lines = sensors.map(
    (sensor) => `${sensor.label}: ${formatCelsius(sensor.celsius)}${t("temperatureUnit")}`
  );
  if (group.count > 1) {
    lines.push(
      t("temperatureRange", { min: formatCelsius(group.min), max: formatCelsius(group.max) })
    );
  }
  return lines.length > 0 ? lines.join("\n") : void 0;
}
function TemperaturePanel({ reading, t }) {
  const temperature = reading?.temperature;
  if (temperature == null) return null;
  if (temperature.status === "hidden") return null;
  const groups = temperature.groups ?? {};
  const warnings = Array.isArray(temperature.warnings) && temperature.warnings.length > 0 ? temperature.warnings : Array.isArray(reading?.warnings) ? reading.warnings : [];
  return (0, import_react3.createElement)(
    "section",
    { className: "dsh-perfmon-card", "aria-label": t("temperatures") },
    (0, import_react3.createElement)(
      "div",
      { className: "dsh-perfmon-cardHead" },
      (0, import_react3.createElement)("span", { className: "dsh-perfmon-cardTitle" }, t("temperatures")),
      // The source is what makes a temperature trustworthy, and it is the one
      // thing the tiles cannot show: it says where the numbers came from.
      (0, import_react3.createElement)(
        "span",
        {
          className: "dsh-perfmon-cardMeta",
          title: typeof temperature.source === "string" ? temperature.source : void 0
        },
        temperature.status === "unavailable" ? t("temperatureUnavailableShort") : [t("temperatureUnit"), typeof temperature.source === "string" ? temperature.source : void 0].filter((part) => typeof part === "string" && part !== "").join(" \xB7 ")
      )
    ),
    (0, import_react3.createElement)(
      "div",
      { className: "dsh-perfmon-temps" },
      TEMPERATURE_TILES.map((tile) => {
        const group = groups[tile.kind] ?? null;
        const celsius = group?.celsius ?? null;
        const tone = temperatureTone(celsius);
        return (0, import_react3.createElement)(
          "div",
          {
            key: tile.kind,
            className: `dsh-perfmon-temp dsh-perfmon-temp--${tone}`,
            title: tileTitle(group, warnings, tile.kind, t)
          },
          (0, import_react3.createElement)(
            "span",
            { className: "dsh-perfmon-tempValue" },
            formatCelsius(celsius),
            celsius === null ? null : (0, import_react3.createElement)("span", { className: "dsh-perfmon-tempUnit" }, t("temperatureUnit"))
          ),
          (0, import_react3.createElement)("span", { className: "dsh-perfmon-tempLabel" }, t(tile.key))
        );
      })
    )
  );
}

// src/client/PerfmonBody.jsx
var DEFAULT_INTERVAL_MS = 2e3;
var NAME_SORT_LIMIT = 300;
var DEFAULT_LIMIT = 60;
function isHidden() {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}
function PerfmonBody({ t, load = fetchSnapshot, sessionId, ctx }) {
  const [sort, setSort] = (0, import_react4.useState)("cpu");
  const [nonce, setNonce] = (0, import_react4.useState)(0);
  const [state, setState] = (0, import_react4.useState)({ status: "loading", reading: void 0, error: void 0, intervalMs: DEFAULT_INTERVAL_MS });
  const aliveRef = (0, import_react4.useRef)(true);
  const sortRef = (0, import_react4.useRef)(sort);
  sortRef.current = sort;
  const measureRef = (0, import_react4.useRef)(null);
  const fallbackSessionId = (0, import_react4.useSyncExternalStore)(
    (0, import_react4.useCallback)(
      (onStoreChange) => {
        const mounted = ctx?.get?.("sidebarRight")?.mounted;
        if (mounted === void 0 || mounted === null) return () => {
        };
        return mounted.subscribe(onStoreChange);
      },
      [ctx]
    ),
    () => {
      const mounted = ctx?.get?.("sidebarRight")?.mounted?.getSnapshot?.();
      return typeof mounted === "string" ? mounted : void 0;
    },
    () => void 0
  );
  const activeSessionId = typeof sessionId === "string" && sessionId !== "" ? sessionId : fallbackSessionId;
  const sessionRef = (0, import_react4.useRef)(activeSessionId);
  sessionRef.current = activeSessionId;
  (0, import_react4.useEffect)(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  (0, import_react4.useEffect)(() => {
    let timer;
    let controller;
    let stopped = false;
    const schedule = (millis) => {
      timer = setTimeout(run, millis);
    };
    const run = async () => {
      if (stopped) return;
      if (isHidden()) {
        schedule(DEFAULT_INTERVAL_MS);
        return;
      }
      controller = new AbortController();
      const requestedSort = sortRef.current;
      const measure = measureRef.current;
      measureRef.current = null;
      try {
        const reading2 = await load({
          sort: requestedSort,
          limit: requestedSort === "name" ? NAME_SORT_LIMIT : DEFAULT_LIMIT,
          measure,
          session: measure === true ? sessionRef.current : void 0,
          signal: controller.signal
        });
        if (stopped || !aliveRef.current) return;
        setState({
          status: "ready",
          reading: reading2,
          error: void 0,
          intervalMs: reading2?.refreshIntervalMs ?? DEFAULT_INTERVAL_MS
        });
        schedule(reading2?.refreshIntervalMs ?? DEFAULT_INTERVAL_MS);
      } catch (error2) {
        if (stopped || !aliveRef.current) return;
        if (error2?.name === "AbortError") return;
        setState((previous) => ({
          ...previous,
          status: previous.reading === void 0 ? "error" : "stale",
          error: error2?.message ?? String(error2),
          intervalMs: DEFAULT_INTERVAL_MS
        }));
        schedule(DEFAULT_INTERVAL_MS * 2);
      }
    };
    const onVisibility = () => {
      if (!isHidden() && !stopped) {
        clearTimeout(timer);
        void run();
      }
    };
    void run();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [load, sort, nonce]);
  const refresh = (0, import_react4.useCallback)(() => {
    setNonce((value) => value + 1);
  }, []);
  const setMeasure = (0, import_react4.useCallback)((value) => {
    measureRef.current = value;
    setNonce((n) => n + 1);
  }, []);
  const { reading, status, error, intervalMs } = state;
  const failed = status === "error";
  const warningText = Array.isArray(reading?.warnings) ? reading.warnings.map((code) => describeWarning(t, String(code))).join("\n") : "";
  return (0, import_react4.createElement)(
    "div",
    { className: "dsh-perfmon-root" },
    failed ? (0, import_react4.createElement)(
      "div",
      { className: "dsh-perfmon-notice" },
      (0, import_react4.createElement)("div", null, `${t("errorTitle")}: ${error ?? ""}`),
      (0, import_react4.createElement)(
        "button",
        { type: "button", className: "dsh-perfmon-action", onClick: refresh, style: { marginBlockStart: "6px" } },
        t("retry")
      )
    ) : null,
    status === "loading" && reading === void 0 ? (0, import_react4.createElement)("div", { className: "dsh-perfmon-empty" }, t("loading")) : null,
    reading === void 0 ? null : (0, import_react4.createElement)(GaugePanel, {
      reading,
      t,
      sessionId: activeSessionId,
      measure: {
        running: reading?.disk?.status === "scanning",
        onStart: () => setMeasure(true),
        onStop: () => setMeasure(false)
      }
    }),
    // The temperature card, directly under the resource card. It renders from the
    // same reading but refreshes on the host's own calmer cadence, so the numbers
    // here can be older than the gauges above — which the card says by naming its
    // source.
    reading === void 0 ? null : (0, import_react4.createElement)(TemperaturePanel, { reading, t }),
    reading === void 0 ? null : (0, import_react4.createElement)(ProcessPanel, { reading, sort, onSortChange: setSort, t }),
    (0, import_react4.createElement)(
      "div",
      { className: "dsh-perfmon-foot" },
      // The warnings used to be a card of their own, which cost a lot of height
      // for a list that is empty on a healthy host. They are still the only
      // place a global reason lives ("PowerShell is missing", which is why every
      // figure above is a dash), so they ride the footer as a tooltip: nothing
      // is lost, and a healthy panel shows no trace of them.
      (0, import_react4.createElement)(
        "span",
        { title: warningText === "" ? void 0 : warningText },
        t("updatedAt", { time: formatClock(reading?.window?.at) })
      ),
      (0, import_react4.createElement)("span", null, t("autoRefresh", { seconds: Math.round(intervalMs / 1e3) })),
      status === "stale" && error !== void 0 ? (0, import_react4.createElement)("span", null, `${t("errorTitle")}: ${error}`) : null,
      (0, import_react4.createElement)(
        "button",
        {
          type: "button",
          className: "dsh-perfmon-action dsh-perfmon-footSpacer",
          onClick: refresh
        },
        t("refresh")
      )
    )
  );
}

// src/client/HeaderButton.jsx
var import_react6 = require("react");

// src/client/Icon.jsx
var import_react5 = require("react");
function PerfmonIcon({ size = 16, className }) {
  return (0, import_react5.createElement)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      className,
      "aria-hidden": "true",
      focusable: "false"
    },
    (0, import_react5.createElement)("rect", { x: 1.25, y: 2.25, width: 13.5, height: 9, rx: 1.75, stroke: "currentColor", strokeWidth: 1.1 }),
    (0, import_react5.createElement)("path", {
      d: "M3.2 8.1h2.1l1.05-2.4 1.5 4.3 1.15-2.6h2.4",
      stroke: "currentColor",
      strokeWidth: 1.1,
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }),
    (0, import_react5.createElement)("path", { d: "M5.5 13.4h5", stroke: "currentColor", strokeWidth: 1.1, strokeLinecap: "round" })
  );
}

// src/client/HeaderButton.jsx
function HeaderButton({ sessionId, open, t }) {
  const label = t("headerButton");
  return (0, import_react6.createElement)(
    "button",
    {
      type: "button",
      className: "dsh-perfmon-headerButton",
      title: t("headerButtonOpen"),
      "aria-label": t("headerButtonOpen"),
      onClick: () => {
        open(sessionId);
      }
    },
    (0, import_react6.createElement)(PerfmonIcon, { size: 15 }),
    (0, import_react6.createElement)("span", { className: "dsh-perfmon-headerButtonLabel" }, label)
  );
}

// src/client/index.jsx
var name = "@xmwengxing/dsh-client-ui-sidebar-perfmon";
var PERFMON_TYPE_ID = "@xmwengxing/dsh-client-ui-sidebar-perfmon";
var PERFMON_KIND = "perfmon";
var GUIDE_ORDER = 30;
var HEADER_ORDER = 100;
function apply(ctx) {
  const t = createTranslator();
  ctx.effect(() => installStyles(), "perfmon: stylesheet");
  ctx.inject(["slots"], (ui) => {
    ui.slots.inject(
      "conversation.session.header.utilities",
      () => ui.slots.register(
        {
          name: "conversation.session.header.utilities",
          id: PERFMON_TYPE_ID,
          order: HEADER_ORDER,
          inject: () => ({
            t,
            // The seat is session-scoped, so `sessionId` is the session whose
            // header row the button sits in — the folder meter measures that
            // session's workspace, not whichever session the live store holds.
            open: (sessionId) => {
              try {
                ctx.get("sidebarRight")?.openTab(PERFMON_KIND, { params: { sessionId } });
              } catch (error) {
                ctx.logger?.warn?.("perfmon: could not open the monitor page: %s", error?.message ?? String(error));
              }
            }
          })
        },
        HeaderButton
      )
    );
    ui.inject(["sidebarRightTabs"], (tabs) => {
      tabs.effect(
        () => tabs.sidebarRightTabs.register({
          id: PERFMON_TYPE_ID,
          kind: PERFMON_KIND,
          priority: "extension",
          title: () => t("tabTitle"),
          guide: [
            {
              id: PERFMON_KIND,
              order: GUIDE_ORDER,
              title: () => t("title"),
              description: () => t("description")
            }
          ]
        }),
        "perfmon: tab type"
      );
    });
    ui.slots.inject(
      "sidebar.right.pane.tab",
      () => ui.slots.register(
        {
          name: "sidebar.right.pane.tab",
          key: PERFMON_TYPE_ID,
          inject: () => ({ t })
        },
        PerfmonBody
      )
    );
  });
}

    return module.exports;
  }
});
