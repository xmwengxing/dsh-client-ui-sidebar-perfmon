/**
 * Bilingual copy for the perfmon browser half.
 *
 * The plugin carries its own dictionary instead of registering with the locale
 * service: the panel is fully usable with static text, and resolving the
 * language from the document keeps the browser half free of a dependency it
 * would otherwise have to declare and wait for.
 *
 * @module dsh-client-ui-sidebar-perfmon/copy
 */

const ZH = {
  title: '性能监控',
  tabTitle: '性能监控',
  description: '实时查看 CPU、内存与进程占用',
  headerButton: '性能监控信息',
  headerButtonOpen: '打开性能监控面板',
  resources: '资源占用',
  processes: '进程列表',
  gpuLine: '显卡',
  gpuClockLabel: '频率',
  gpuVramLabel: '显存',
  gpuClock: '{clock} MHz',
  gpuClockUnavailable: '—',
  gpuVram: '{used} / {total}',
  gpuVramUnavailable: '—',
  temperatures: '温度',
  temperatureCpu: 'CPU',
  temperatureGpu: '显卡',
  temperatureMainboard: '主板',
  temperatureDisk: '硬盘',
  temperatureUnit: '°C',
  temperatureRange: '最低 {min} · 最高 {max}',
  temperatureSensors: '{count} 个传感器',
  temperatureUnavailableShort: '不可用',
  projectDir: '项目目录',
  measureStart: '统计当前会话目录',
  measureStartSession: '统计当前会话的目录（{id}）',
  measureStop: '停止统计',
  measuring: '正在统计…',
  measuringHint: '只统计当前查看的会话目录 · 可随时停止',
  projectUsage: '{size} · {count} 项',
  projectDirCount: '{count} 个目录',
  projectDropped: '另有 {count} 个目录未统计',
  projectTruncated: '已截断',
  projectPartial: '部分完成（已停止）',
  cpu: 'CPU',
  memory: '内存',
  swap: '交换内存',
  swapDisabled: '未启用',
  load: '负载',
  cores: '{count} 核',
  uptime: '已运行 {value}',
  usedOfTotal: '{used} / {total}',
  cached: '缓存 {value}',
  tagCpu: 'CPU',
  tagMem: '内存',
  tagName: '进程名',
  sortDesc: '降序',
  sortAsc: '升序',
  filterPlaceholder: '搜索进程名或 PID',
  clearFilter: '清空搜索',
  resizeCpu: '调整 CPU 列宽',
  resizeMem: '调整内存列宽',
  resizeHint: '拖动调整列宽 · 双击复位',
  processCount: '共 {count} 个进程',
  showingRows: '显示 {shown} 行',
  threads: '{count} 线程',
  processUnavailable: '—',
  refresh: '立即刷新',
  autoRefresh: '每 {seconds} 秒自动刷新',
  updatedAt: '更新于 {time}',
  loading: '正在读取主机指标…',
  empty: '没有匹配的进程',
  emptyAll: '没有读到进程信息',
  truncated: '列表已截断，可在筛选框中缩小范围',
  errorTitle: '读取失败',
  retry: '重试',
  unsupported: '当前主机不是 Linux，性能监控无法读取 /proc。',
  state: {
    R: '运行',
    S: '睡眠',
    D: '不可中断',
    Z: '僵尸',
    T: '停止',
    t: '跟踪',
    I: '空闲',
    X: '已死',
  },
  // 平台侧无法提供的字段一律显示这个，而不是 0。
  unavailable: '—',
  warnings: '部分指标不可用',
  reader: {
    linux: '读取 /proc',
    darwin: '读取 ps / vm_stat',
    win32: '读取 PowerShell',
    generic: '仅标准库',
  },
  warning: {
    'swap-unavailable': '本机未提供交换/页面文件用量',
    'memory-unavailable': '内存信息不可用',
    'processes-unavailable': '进程列表不可用',
    'powershell-missing': '未找到 PowerShell，无法读取进程与内存',
    'windows-json-unreadable': 'PowerShell 输出无法解析',
    'generic-platform': '当前平台没有专用读取器，仅显示标准库能提供的数据',
    'project-dir-no-cwd': '尚未统计——点击右侧按钮统计当前会话的目录',
    'project-dir-session-unresolved': '无法确定当前会话的目录，未开始统计',
    'project-dir-unavailable': '项目目录不可读，无法统计大小',
    'project-dir-aborted': '统计已停止，数值为部分结果',
    'project-dir-hidden': '目录大小统计已在配置中关闭',
    'project-dir-partial': '目录条目过多，统计已提前截断，实际占用可能更大',
    'project-dir-skipped': '部分子目录不可读，目录大小统计偏低',
    'project-dir-dropped': '活跃工作区目录过多，仅统计其中一部分',
    'temperature-hidden': '温度卡片已在配置中关闭',
    'temperature-unavailable': '本机没有可读取的温度传感器',
    'temperature-cpu-unavailable': 'CPU 温度不可读——Windows 上需运行硬件监控软件（如 LibreHardwareMonitor），面板会自动识别',
    'temperature-gpu-unavailable': '显卡温度不可读',
    'temperature-mainboard-unavailable': '主板温度不可读',
    'temperature-disk-unavailable': '硬盘温度不可读',
    'temperature-json-unreadable': '温度查询输出无法解析',
    'temperature-failed': '温度查询失败',
    'gpu-hidden': '显卡行已在配置中关闭',
    'gpu-unavailable': '本机没有可读取的显卡信息',
    'gpu-memory-unavailable': '显存占用不可读',
    'gpu-clock-unavailable': '显卡频率不可读（Windows 无系统级来源，需 nvidia-smi 或硬件监控软件）',
    'gpu-failed': '显卡查询失败',
    'gpu-json-unreadable': '显卡查询输出无法解析',
  },
}

const EN = {
  title: 'Performance',
  tabTitle: 'Performance',
  description: 'Live CPU, memory and process usage',
  headerButton: 'Performance monitor',
  headerButtonOpen: 'Open the performance monitor',
  resources: 'Resource usage',
  processes: 'Processes',
  gpuLine: 'GPU',
  gpuClockLabel: 'Clock',
  gpuVramLabel: 'VRAM',
  gpuClock: '{clock} MHz',
  gpuClockUnavailable: '—',
  gpuVram: '{used} / {total}',
  gpuVramUnavailable: '—',
  temperatures: 'Temperatures',
  temperatureCpu: 'CPU',
  temperatureGpu: 'GPU',
  temperatureMainboard: 'Motherboard',
  temperatureDisk: 'Drives',
  temperatureUnit: '°C',
  temperatureRange: 'min {min} · max {max}',
  temperatureSensors: '{count} sensors',
  temperatureUnavailableShort: 'unavailable',
  projectDir: 'Project folder',
  measureStart: 'Measure the current session folders',
  measureStartSession: 'Measure the current session folders ({id})',
  measureStop: 'Stop measuring',
  measuring: 'Measuring…',
  measuringHint: 'Only the viewed session folders · stoppable any time',
  projectUsage: '{size} · {count} items',
  projectDirCount: '{count} folders',
  projectDropped: '{count} more folders not measured',
  projectTruncated: 'partial',
  projectPartial: 'partial (stopped)',
  cpu: 'CPU',
  memory: 'Memory',
  swap: 'Swap',
  swapDisabled: 'Not enabled',
  load: 'Load',
  cores: '{count} cores',
  uptime: 'up {value}',
  usedOfTotal: '{used} / {total}',
  cached: 'cache {value}',
  tagCpu: 'CPU',
  tagMem: 'Memory',
  tagName: 'Name',
  sortDesc: 'descending',
  sortAsc: 'ascending',
  filterPlaceholder: 'Search by name or PID',
  clearFilter: 'Clear search',
  resizeCpu: 'Resize the CPU column',
  resizeMem: 'Resize the memory column',
  resizeHint: 'Drag to resize · double-click to reset',
  processCount: '{count} processes',
  showingRows: 'showing {shown}',
  threads: '{count} threads',
  processUnavailable: '—',
  refresh: 'Refresh now',
  autoRefresh: 'Auto-refresh every {seconds}s',
  updatedAt: 'Updated {time}',
  loading: 'Reading host metrics…',
  empty: 'No process matches the filter',
  emptyAll: 'No process information available',
  truncated: 'List truncated; narrow it with the filter',
  errorTitle: 'Could not read metrics',
  retry: 'Retry',
  unsupported: 'This host is not Linux, so perfmon cannot read /proc.',
  state: {
    R: 'running',
    S: 'sleeping',
    D: 'uninterruptible',
    Z: 'zombie',
    T: 'stopped',
    t: 'tracing',
    I: 'idle',
    X: 'dead',
  },
  // Anything a platform cannot answer renders as this, never as a zero.
  unavailable: '—',
  warnings: 'Some metrics are unavailable',
  reader: {
    linux: 'reading /proc',
    darwin: 'reading ps / vm_stat',
    win32: 'reading PowerShell',
    generic: 'standard library only',
  },
  warning: {
    'swap-unavailable': 'This host reports no swap / page-file usage',
    'memory-unavailable': 'Memory information is unavailable',
    'processes-unavailable': 'The process list is unavailable',
    'powershell-missing': 'PowerShell was not found, so processes and memory cannot be read',
    'windows-json-unreadable': 'The PowerShell output could not be parsed',
    'generic-platform': 'No dedicated reader for this platform; only standard-library figures are shown',
    'project-dir-no-cwd': 'Not measured yet — use the button to measure the current session folders',
    'project-dir-session-unresolved': 'The current session folder could not be determined, so nothing was measured',
    'project-dir-unavailable': 'The project folder could not be read',
    'project-dir-aborted': 'The scan was stopped; the figures are partial',
    'project-dir-hidden': 'Folder-size metering is disabled in the configuration',
    'project-dir-partial': 'A folder has too many entries; the scan stopped early and the total may be low',
    'project-dir-skipped': 'Some subfolders could not be read, so folder sizes are understated',
    'project-dir-dropped': 'More open workspaces than one scan covers; only some were measured',
    'temperature-hidden': 'The temperature card is disabled in the configuration',
    'temperature-unavailable': 'This host exposes no readable temperature sensor',
    'temperature-cpu-unavailable': 'CPU temperature is unreadable — on Windows this needs a hardware monitor such as LibreHardwareMonitor running, which the panel picks up automatically',
    'temperature-gpu-unavailable': 'GPU temperature is unreadable',
    'temperature-mainboard-unavailable': 'Motherboard temperature is unreadable',
    'temperature-disk-unavailable': 'Drive temperature is unreadable',
    'temperature-json-unreadable': 'The temperature query output could not be parsed',
    'temperature-failed': 'The temperature query failed',
    'gpu-hidden': 'The GPU line is disabled in the configuration',
    'gpu-unavailable': 'This host exposes no readable GPU information',
    'gpu-memory-unavailable': 'VRAM usage is unreadable',
    'gpu-clock-unavailable': 'GPU clock is unreadable (Windows has no OS-level source; it needs nvidia-smi or a hardware monitor)',
    'gpu-failed': 'The GPU query failed',
    'gpu-json-unreadable': 'The GPU query output could not be parsed',
  },
}

/**
 * Pick the panel language from the page.
 *
 * `<html lang>` is what the GUI sets and what a language switch updates; the
 * navigator preference is only the fallback for a page that sets none.
 * @returns {'zh' | 'en'} the active language.
 */
export function resolveLanguage() {
  // `documentElement` is read defensively: a language lookup must never be the
  // reason a panel fails to render.
  const declared = typeof document === 'undefined' ? '' : document.documentElement?.lang ?? ''
  const source = declared || (typeof navigator !== 'undefined' ? navigator.language : '') || ''
  return source.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/**
 * Build the translator the panel renders through.
 * @param {string} [field] - `{name}` placeholders to interpolate.
 * @param {Record<string, string | number>} [values] - placeholder values.
 * @returns {(key: string, values?: Record<string, string | number>) => string} the translator.
 */
export function createTranslator() {
  return (key, values) => {
    const dictionary = resolveLanguage() === 'zh' ? ZH : EN
    const template = key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), dictionary)
    if (typeof template !== 'string') return key
    if (values === undefined) return template
    return template.replace(/\{(\w+)\}/g, (match, name) => {
      const value = values[name]
      return value === undefined ? match : String(value)
    })
  }
}

/**
 * Translate one host warning code.
 *
 * A reader may append detail after a colon (`processes-unavailable: ps: ...`); the
 * prefix is what has a translation, and unknown codes are passed through so a new
 * one shows up as itself rather than as a silent gap.
 * @param {(key: string) => string} t - the translator.
 * @param {string} code - the warning the host reported.
 * @returns {string} the text to show.
 */
export function describeWarning(t, code) {
  const prefix = code.split(':')[0].trim()
  const dictionary = resolveLanguage() === 'zh' ? ZH.warning : EN.warning
  const known = dictionary[prefix]
  if (known === undefined) return code
  const detail = code.slice(prefix.length + 1).trim()
  return detail === '' ? known : `${known} (${detail})`
}

/** Process-state labels, keyed by the single-letter code in `/proc/<pid>/stat`. */
export function describeState(t, code) {
  const table = resolveLanguage() === 'zh' ? ZH.state : EN.state
  return table[code] ?? code
}
