# @xmwengxing/dsh-client-ui-sidebar-perfmon

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 右侧栏提供实时主机性能监控：
CPU / 内存 / 交换内存仪表盘、显卡频率与显存条、CPU / 显卡 / 主板 / 硬盘 温度，
以及可排序的进程列表——支持 Linux / macOS / Windows。

[English](README.md) | 中文

<img src="assets/screenshot-panel.png" alt="性能监控面板：资源占用与显卡条、四块温度磁贴、进程列表" width="755">

## 功能

向右侧栏贡献一个页面，向会话顶栏贡献一个按钮：

- **资源占用**：CPU、内存、交换内存三个环形仪表，各带一行辅助信息（核心数与负载 /
  已用与总量 / 交换内存状态）；仪表下方一条**显卡横条**，左半频率、右半显存，
  各自带表示占比的填充；按需统计当前查看会话的项目目录大小；标题栏显示主机名与运行时长。
- **温度**：CPU、显卡、主板、硬盘四块磁贴，按「正常 / 偏热 / 过热」（70 °C 与 85 °C）
  着色。头条取该部件**最高**的传感器，多核封装或双硬盘既不会撑宽卡片也读得清，
  悬浮列出它覆盖的每一个传感器。各平台能读到什么见[温度](#温度)。
- **进程列表**：每行一个进程——CPU 占用、常驻内存、占物理内存的比例、PID 与线程数。
  支持按 CPU、内存或进程名排序，按进程名或 PID 筛选，拖动列分隔线调整宽度
  （宽度按浏览器记忆）。两个数值列永不压缩，侧栏变窄时先牺牲进程名而不是数值。
- **刷新**：同一间隔驱动所有窗口（默认 Linux 2 秒 / macOS 3 秒 / Windows 4 秒），
  标签页隐藏时暂停轮询。温度卡片例外，按自己更保守的节奏刷新——温度是绝对读数，
  且在 Windows 上读取昂贵。

任何平台都答不出的数字显示 `—` 并在悬浮提示中说明原因——绝不用 `0` 顶替，
因为 0 看起来像一次真实测量。

## 环境要求

- **Linux / macOS / Windows**——各平台能回答哪些指标见[平台支持](#平台支持)。
- **DeepSeek Harness `0.2.0-rc.1` 或兼容版本**，使用启动 `@deepseek-ai/dsh-web-app`
  的 profile（`web` profile 即是）。

无运行时依赖：宿主半边只用 `node:os` 与各平台自带工具，浏览器半边只用 GUI 已提供的 React。

## 安装

```sh
# 从 npm 安装
dsh plugin --profile web add @xmwengxing/dsh-client-ui-sidebar-perfmon

# 从本地检出安装
dsh plugin --profile web add /path/to/dsh-client-ui-sidebar-perfmon

# 从 git 安装（需要先允许 pnpm 执行构建脚本）
dsh plugin --profile web add github:xmwengxing/dsh-client-ui-sidebar-perfmon
```

然后重启 GUI。卸载：`dsh plugin --profile web remove @xmwengxing/dsh-client-ui-sidebar-perfmon`。

打开方式：右侧栏引导页列出 **性能监控** 卡片，点击即以 tab 打开该页面；此后会话顶栏的
**性能监控信息** 按钮可打开或聚焦同一 tab。

## 配置

默认值刻意保守：每两秒遍历一次 `/proc`，多个面板共享同一次读取结果。
需要调整时在 profile patch 中覆盖：

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: perfmon
  name: '@xmwengxing/dsh-client-ui-sidebar-perfmon'
  config:
    refreshIntervalMs: 1000        # 500–60000，默认 Linux 2000 / macOS 3000 / Windows 4000
    processLimit: 100              # 5–500，单次返回的进程行数
    cacheMillis: 800               # 0–10000，该窗口内的轮询共享同一次读取
    sampleMillis: 150              # 0–2000，首次读数的预热采样时长
    projectDirEntryBudget: 50000   # 100–1000000，单个目录一次扫描的条目上限
    projectDirMaxDirs: 12          # 1–100，一次扫描覆盖的 distinct 目录数
    temperatureIntervalMs: 15000   # 2000–600000，一次温度读数的复用时长
    gpuIntervalMs: 4000            # 500–60000，默认跟随 refreshIntervalMs
    # gpu: false                   # 完全隐藏显卡行
    # temperature: false           # 完全隐藏温度卡片
    # projectDir: /srv/demo        # 固定扫描某个目录，而不是跟随当前查看的会话
    # projectDir: ''               # 或完全隐藏目录大小行
```

## 平台支持

每个平台族一个读取器，各自读该平台自己的数据源。

| | Linux | macOS | Windows |
| --- | --- | --- | --- |
| CPU 占用 / 单核 | `/proc/stat` | `os.cpus()` | `os.cpus()` |
| 负载 | 有 | 有 | **无**——Windows 没有这个概念，该段直接省略 |
| 内存 总量/已用/可用 | `/proc/meminfo`（`MemAvailable`） | `vm_stat`（free + 可回收页） | `Win32_OperatingSystem` + `AvailableBytes` |
| 缓存 / 缓冲 | `Cached` / `Buffers` | 文件页作为缓存；无缓冲项 | `CacheBytes`；无缓冲项 |
| 交换内存 | `/proc/meminfo` | `sysctl vm.swapusage` | 页面文件（`SizeStoredInPagingFiles`） |
| 进程列表 | `/proc/<pid>/stat`，进程内读取 | `ps -Ao pid=,state=,time=,rss=,comm=` | 一次 PowerShell 调用 |
| 进程状态 | 有 | 有 | **无**——显示为 `—` |
| 线程数 | 有 | **无**——BSD `ps` 没有可移植的线程数字段 | 有 |
| 温度 | `/sys/class/hwmon`，无则 `/sys/class/thermal` | `powermetrics`（需 root）、`osx-cpu-temp`、`istats` | LibreHardwareMonitor / OpenHardwareMonitor、ACPI 热区、存储可靠性计数器、`nvidia-smi` |
| 项目目录大小 | 进程内遍历，三个平台一致 | 同左 | 同左 |

平台无法提供的字段一律上报 `null` 并在面板显示 `—`，同时说明原因：温度磁贴的原因在
它自己的悬浮提示里，其余告警挂在底部时间戳的悬浮提示上。任何字段都不会用 0 顶替——
因为 0 看起来像一次真实测量。

**开销**：Linux 全部在进程内读 `/proc`，不启动任何子进程；macOS 与 Windows 每次采样
启动一个辅助进程，因此默认刷新间隔更保守——分别是 3 秒与 4 秒（Linux 为 2 秒），
可用 `refreshIntervalMs` 覆盖。**没有专用读取器的平台**（FreeBSD、Solaris 等）回退到
只用 `node:os` 的读取器：真实的 CPU 读数与内存总量，交换内存与进程列表标记为不可用，
而不是猜测。

### 数字是怎么来的

所有百分比都是同一累计计数器的两次采样之差，因此插件从不假设时钟节拍。两条约定值得明确：

- **进程 CPU 按「100% = 一个核心」归一化**——与 `top` 同一约定，因此 4 核机器上的
  8 线程进程可能超过 100%。
- **内存「已用」即「不可用」**——页缓存可回收，因此计入可用而非已用。

每次会话的第一次读数会用一次短采样预热，因此面板首帧显示的就是真实百分比而非 0。
另有两种状态如实呈现：**本窗口内新出现的进程**在有第二帧可作差之前显示 `—`；
**未启用交换内存的主机**显示「未启用」，而不是一个 0% 的空环。

### 项目目录行

统计目录是 CPU 与 IO 密集型工作，仪表下方的**项目目录**行因此**手动触发**：按钮统计
当前正在查看会话的工作目录，扫描中可随时停止（已统计的部分结果带「已停止」说明保留），
且扫描有上限——单目录 5 万条目、单次 12 个目录，符号链接既不跟随也不计入，每一处省略
都在数字旁说明。两次扫描之间轮询只读存储结果，面板开着零开销。

### 显卡频率与显存

| 读数 | Linux | macOS | Windows |
| --- | --- | --- | --- |
| 显存 已用/总量 | `amdgpu` 的 sysfs（`mem_info_vram_*`）；`nvidia-smi` | 仅 `nvidia-smi` | 系统自带的 `GPUPerformanceCounters` 内存计数器（**任何厂商都行，无需安装任何软件**），加上注册表中 64 位的适配器总量；有 `nvidia-smi` 时用它的 |
| 核心频率 | `gt_cur_freq_mhz`（i915）或 `amdgpu` 的 `pp_dpm_sclk`；`nvidia-smi` | 仅 `nvidia-smi` | `nvidia-smi`（NVIDIA），或运行中的 LibreHardwareMonitor / OpenHardwareMonitor（其它厂商） |

- **显存不需要任何第三方软件。** Windows 自身就会为 NVIDIA、AMD、Intel 报告专用显存占用，
  而真实的 64 位总量来自显示类注册表键——刻意**不用**
  `Win32_VideoController.AdapterRAM`，那是 32 位字段，超过 4 GiB 会回绕。
- **Windows 没有系统级的频率来源。** 既没有 `nvidia-smi` 也没有硬件监控软件的机器，
  频率显示 `—` 而显存照常读数——绝不拿猜出来的最大频率编一个百分比。

两个读数共处一行——左频率、右显存，各是一个带填充的轨道（频率的填充相对它自己的加速
上限，显存的填充是真正的「已用/总量」）；侧栏窄到放不下两半时换行而不是截断。该条
随面板自身的节奏刷新（`gpuIntervalMs`，默认跟随 `refreshIntervalMs`），因为加载模型时
显存才是关键指标。设 `gpu: false` 可隐藏该行。

### 温度

温度是绝对值而非计数器，因此按自己更保守的节奏读取：一次读数复用
`temperatureIntervalMs`（默认 15 秒），因为 Windows 上一次读取要花一次一秒以上的
PowerShell 调用。各平台的候选源，以及每个源允许填充的部件：

| 部件 | Linux | macOS | Windows |
| --- | --- | --- | --- |
| CPU | `coretemp` / `k10temp` / `zenpower` / `cpu_thermal` 等 hwmon 芯片；`x86_pkg_temp` 热区 | `powermetrics` CPU die；`osx-cpu-temp`；`istats` | LibreHardwareMonitor / OpenHardwareMonitor 的 `/intelcpu/`、`/amdcpu/` |
| 显卡 | `amdgpu` / `radeon` / `nouveau` / `i915` / `xe` 芯片 | `powermetrics` GPU die；`istats` | 监控软件的 `/nvidiagpu/`、`/atigpu/`；否则 `nvidia-smi` |
| 主板 | `acpitz`、`it87`、`nct6775`、`dell_smm`、`thinkpad` 等 | — | ACPI 热区；监控软件的 `/lpc/` |
| 硬盘 | `nvme`、`drivetemp` 芯片 | — | 每块物理盘的 `Get-StorageReliabilityCounter` |

- **Windows 的 ACPI 热区一律归为主板，绝不归为 CPU。** 按 ACPI 自身的定义它就是板级
  传感器，且在许多桌面主板上是近乎恒定的占位值（本机全核满载期间始终报告 27.9 °C）。
- **Windows 上 CPU 温度需要硬件监控软件**：运行 LibreHardwareMonitor **0.9.4**
  （免安装 zip，以管理员身份运行——0.9.6 移除了本插件所读取的 WMI 提供程序）或
  OpenHardwareMonitor；没有时 CPU 磁贴显示 `—` 并说明原因。Intel 的
  `Distance to TjMax` 是热余量而非温度，已排除。
- **macOS 需要 root 或自行安装的数据源**：以 root 运行 `powermetrics`，或安装
  `osx-cpu-temp` / `istats`。三者都没有时四个磁贴全是 `—`。

## 隐私

插件读取本机内核计数器，只返回给发起请求的浏览器。它自身不发起任何网络请求，
不外发数据，不写文件。路由受与 GUI 其余部分相同的鉴权保护。

## 已知限制

- **没有进程属主、命令行与进程树**。每行包含进程名、PID、状态、线程数、CPU 与 RSS。
- **温度取决于平台暴露了什么**（见[温度](#温度)）；读不到传感器的机器显示 `—`
  并说明原因，而不是借用别的部件的数字。
- **磁贴里没有风扇转速、电压或逐核心温度明细**。每个部件的头条是它最高的那个传感器，
  所有传感器都列在悬浮提示里。
- **没有历史数据**。面板只显示当前读数，没有迷你趋势图或留存采样。
- **轮询而非推流**。刷新是按间隔请求，而非服务端推送。
- **顶栏按钮只负责打开，不负责切换**。关闭面板由右侧栏自身的控件完成。

## 许可证

MIT
