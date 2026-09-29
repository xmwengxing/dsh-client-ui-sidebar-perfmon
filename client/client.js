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
  filterPlaceholder: "\u7B5B\u9009\u8FDB\u7A0B\u540D\u6216 PID",
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
  filterPlaceholder: "Filter by name or PID",
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
}

.dsh-perfmon-cardHead {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
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
  font: var(--dsw-font-xxs-strong-12, 600 13px/1 var(--dsw-font-family, system-ui));
  font-variant-numeric: tabular-nums;
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

.dsh-perfmon-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px 0;
}

.dsh-perfmon-tab {
  font: inherit;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  padding: 5px 10px;
  border-radius: var(--dsw-radius-sm, 6px);
  border: 0.5px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary, currentColor);
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

.dsh-perfmon-filter {
  margin: 8px 10px 0;
  font: inherit;
  font-size: 11px;
  padding: 5px 0;
  border: 0;
  border-block-end: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.24));
  background: transparent;
  color: var(--dsw-alias-label-primary, currentColor);
  outline: none;
  inline-size: 100%;
  box-sizing: border-box;
}

.dsh-perfmon-filter::placeholder {
  color: var(--dsw-alias-label-tertiary, currentColor);
}

.dsh-perfmon-rows {
  flex: 1 1 auto;
  min-block-size: 0;
  overflow-y: auto;
  padding: 4px 6px 6px;
}

.dsh-perfmon-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 62px 66px;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border-radius: var(--dsw-radius-sm, 6px);
}

.dsh-perfmon-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.1));
}

.dsh-perfmon-name {
  min-inline-size: 0;
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
  font-size: 11px;
  text-align: end;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.dsh-perfmon-metricBar {
  block-size: 2px;
  margin-block-start: 3px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-3, rgba(127, 127, 127, 0.2));
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

.dsh-perfmon-empty {
  padding: 18px 10px;
  text-align: center;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, currentColor);
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
var import_react3 = require("react");

// src/client/api.js
var SNAPSHOT_PATH = "/api/perfmon.snapshot";
async function fetchSnapshot(request = {}) {
  const response = await fetch(SNAPSHOT_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sort: request.sort, limit: request.limit }),
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
function formatPercent(value, empty = EMPTY) {
  if (typeof value !== "number" || !Number.isFinite(value)) return empty;
  return `${value.toFixed(1)}%`;
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
function barWidth(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 100);
}

// src/client/GaugePanel.jsx
var RING = { size: 44, stroke: 4, radius: 18 };
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
          stroke: "var(--dsw-alias-bg-layer-3, rgba(127,127,127,0.2))",
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
function GaugePanel({ reading, t }) {
  const cpu = reading?.cpu;
  const memory = reading?.memory;
  const facts = reading?.facts;
  const load = Array.isArray(cpu?.loadAverage) && cpu.loadAverage.length > 0 ? cpu.loadAverage[0] : void 0;
  const coreDetail = [
    facts?.coreCount === void 0 ? void 0 : t("cores", { count: facts.coreCount }),
    load === void 0 ? void 0 : `${t("load")} ${load.toFixed(2)}`
  ].filter((part) => part !== void 0).join(" \xB7 ");
  const memoryDetail = memory === void 0 ? EMPTY : t("usedOfTotal", { used: formatBytes(memory.used), total: formatBytes(memory.total) });
  const memoryTitle = memory === void 0 ? void 0 : [
    t("usedOfTotal", { used: formatBytes(memory.used), total: formatBytes(memory.total) }),
    t("cached", { value: formatBytes(memory.cached) }),
    t("uptime", { value: formatDuration(facts?.uptimeSeconds) })
  ].join(" \xB7 ");
  const swapEnabled = memory !== void 0 && memory.swapTotal > 0;
  const swapDetail = swapEnabled ? t("usedOfTotal", { used: formatBytes(memory.swapUsed), total: formatBytes(memory.swapTotal) }) : t("swapDisabled");
  return (0, import_react.createElement)(
    "section",
    { className: "dsh-perfmon-card", "aria-label": t("resources") },
    (0, import_react.createElement)(
      "div",
      { className: "dsh-perfmon-cardHead" },
      (0, import_react.createElement)("span", { className: "dsh-perfmon-cardTitle" }, t("resources")),
      (0, import_react.createElement)(
        "span",
        { className: "dsh-perfmon-cardMeta" },
        [facts?.hostname, facts?.arch, t("uptime", { value: formatDuration(facts?.uptimeSeconds) })].filter((part) => typeof part === "string" && part !== "").join(" \xB7 ")
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
    )
  );
}

// src/client/ProcessPanel.jsx
var import_react2 = require("react");
var SORT_TAGS = [
  { id: "cpu", label: "tagCpu", arrow: "\u2193" },
  { id: "mem", label: "tagMem", arrow: "\u2193" },
  { id: "name", label: "tagName", arrow: "\u2191" }
];
function memoryCell(process) {
  const size = formatBytes(process.rssBytes);
  const share = formatPercent(process.memPercent);
  return share === EMPTY ? size : `${size} \xB7 ${share}`;
}
function ProcessPanel({ reading, sort, onSortChange, t }) {
  const [filter, setFilter] = (0, import_react2.useState)("");
  const processes = reading?.processes ?? [];
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
    { className: "dsh-perfmon-card dsh-perfmon-card--processes", "aria-label": t("processes") },
    (0, import_react2.createElement)(
      "div",
      { className: "dsh-perfmon-cardHead" },
      (0, import_react2.createElement)("span", { className: "dsh-perfmon-cardTitle" }, t("processes")),
      (0, import_react2.createElement)("span", { className: "dsh-perfmon-cardMeta" }, meta)
    ),
    (0, import_react2.createElement)(
      "div",
      { className: "dsh-perfmon-tabs", role: "group", "aria-label": t("processes") },
      SORT_TAGS.map(
        (tag) => (0, import_react2.createElement)(
          "button",
          {
            key: tag.id,
            type: "button",
            className: "dsh-perfmon-tab",
            "aria-pressed": sort === tag.id,
            title: `${t(tag.label)} \xB7 ${tag.id === "name" ? t("sortAsc") : t("sortDesc")}`,
            onClick: () => {
              onSortChange(tag.id);
            }
          },
          t(tag.label),
          sort === tag.id ? (0, import_react2.createElement)("span", { className: "dsh-perfmon-tabArrow" }, tag.arrow) : null
        )
      )
    ),
    (0, import_react2.createElement)("input", {
      className: "dsh-perfmon-filter",
      type: "search",
      value: filter,
      placeholder: t("filterPlaceholder"),
      "aria-label": t("filterPlaceholder"),
      onChange: (event) => {
        setFilter(event.target.value);
      }
    }),
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
          { key: process.pid, className: "dsh-perfmon-row" },
          (0, import_react2.createElement)(
            "div",
            { className: "dsh-perfmon-name" },
            (0, import_react2.createElement)("div", { className: "dsh-perfmon-nameText", title: process.name }, process.name),
            (0, import_react2.createElement)(
              "div",
              { className: "dsh-perfmon-nameMeta" },
              `PID ${String(process.pid)} \xB7 ${t("threads", { count: process.threads })} \xB7 ${describeState(t, process.state)}`
            )
          ),
          (0, import_react2.createElement)(
            "div",
            { className: "dsh-perfmon-metric", title: `${t("cpu")} ${formatPercent(process.cpuPercent)}` },
            formatPercent(process.cpuPercent),
            (0, import_react2.createElement)(
              "div",
              { className: "dsh-perfmon-metricBar" },
              (0, import_react2.createElement)("div", {
                className: "dsh-perfmon-metricBarFill dsh-perfmon-cpuFill",
                style: { inlineSize: `${String(barWidth(process.cpuPercent))}%` }
              })
            )
          ),
          (0, import_react2.createElement)(
            "div",
            { className: "dsh-perfmon-metric", title: `${t("memory")} ${memoryCell(process)}` },
            memoryCell(process),
            (0, import_react2.createElement)(
              "div",
              { className: "dsh-perfmon-metricBar" },
              (0, import_react2.createElement)("div", {
                className: "dsh-perfmon-metricBarFill dsh-perfmon-memFill",
                style: { inlineSize: `${String(barWidth(process.memPercent))}%` }
              })
            )
          )
        )
      )
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
function PerfmonBody({ t, load = fetchSnapshot }) {
  const [sort, setSort] = (0, import_react3.useState)("cpu");
  const [nonce, setNonce] = (0, import_react3.useState)(0);
  const [state, setState] = (0, import_react3.useState)({ status: "loading", reading: void 0, error: void 0, intervalMs: DEFAULT_INTERVAL_MS });
  const aliveRef = (0, import_react3.useRef)(true);
  const sortRef = (0, import_react3.useRef)(sort);
  sortRef.current = sort;
  (0, import_react3.useEffect)(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  (0, import_react3.useEffect)(() => {
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
      try {
        const reading2 = await load({
          sort: requestedSort,
          limit: requestedSort === "name" ? NAME_SORT_LIMIT : DEFAULT_LIMIT,
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
  const refresh = (0, import_react3.useCallback)(() => {
    setNonce((value) => value + 1);
  }, []);
  const { reading, status, error, intervalMs } = state;
  const failed = status === "error";
  return (0, import_react3.createElement)(
    "div",
    { className: "dsh-perfmon-root" },
    failed ? (0, import_react3.createElement)(
      "div",
      { className: "dsh-perfmon-notice" },
      (0, import_react3.createElement)("div", null, `${t("errorTitle")}: ${error ?? ""}`),
      (0, import_react3.createElement)(
        "button",
        { type: "button", className: "dsh-perfmon-action", onClick: refresh, style: { marginBlockStart: "6px" } },
        t("retry")
      )
    ) : null,
    status === "loading" && reading === void 0 ? (0, import_react3.createElement)("div", { className: "dsh-perfmon-empty" }, t("loading")) : null,
    reading === void 0 ? null : (0, import_react3.createElement)(GaugePanel, { reading, t }),
    reading === void 0 ? null : (0, import_react3.createElement)(ProcessPanel, { reading, sort, onSortChange: setSort, t }),
    (0, import_react3.createElement)(
      "div",
      { className: "dsh-perfmon-foot" },
      (0, import_react3.createElement)("span", null, t("updatedAt", { time: formatClock(reading?.window?.at) })),
      (0, import_react3.createElement)("span", null, t("autoRefresh", { seconds: Math.round(intervalMs / 1e3) })),
      status === "stale" && error !== void 0 ? (0, import_react3.createElement)("span", null, `${t("errorTitle")}: ${error}`) : null,
      (0, import_react3.createElement)(
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
var import_react5 = require("react");

// src/client/Icon.jsx
var import_react4 = require("react");
function PerfmonIcon({ size = 16, className }) {
  return (0, import_react4.createElement)(
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
    (0, import_react4.createElement)("rect", { x: 1.25, y: 2.25, width: 13.5, height: 9, rx: 1.75, stroke: "currentColor", strokeWidth: 1.1 }),
    (0, import_react4.createElement)("path", {
      d: "M3.2 8.1h2.1l1.05-2.4 1.5 4.3 1.15-2.6h2.4",
      stroke: "currentColor",
      strokeWidth: 1.1,
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }),
    (0, import_react4.createElement)("path", { d: "M5.5 13.4h5", stroke: "currentColor", strokeWidth: 1.1, strokeLinecap: "round" })
  );
}

// src/client/HeaderButton.jsx
function HeaderButton({ open, t }) {
  const label = t("headerButton");
  return (0, import_react5.createElement)(
    "button",
    {
      type: "button",
      className: "dsh-perfmon-headerButton",
      title: t("headerButtonOpen"),
      "aria-label": t("headerButtonOpen"),
      onClick: () => {
        open();
      }
    },
    (0, import_react5.createElement)(PerfmonIcon, { size: 15 }),
    (0, import_react5.createElement)("span", { className: "dsh-perfmon-headerButtonLabel" }, label)
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
            open: () => {
              try {
                ctx.get("sidebarRight")?.openTab(PERFMON_KIND);
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
