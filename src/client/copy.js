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
