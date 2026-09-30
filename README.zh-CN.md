# @xmwengxing/dsh-client-ui-sidebar-perfmon

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 右侧栏提供实时主机性能监控：
CPU / 内存 / 交换内存仪表盘，以及可按 CPU、内存、进程名排序的进程列表。

[English](README.md) | 中文

```
┌─ 资源占用 ────────────────────── G2 · x64 · 已运行 5d 3h ─┐
│    ◜◝        ◜◝        ◜◝                                │
│   12.5%     39.1%      4.9%                              │
│    CPU      内存     交换内存                             │
│ 4 核 · 负载 1.52   4.5 GB / 11.4 GB   0.4 GB / 8.0 GB    │
├─ 进程列表 ───────────────────── 共 349 个进程 · 显示 60 行 ┤
│   CPU ↓        内存      进程名                           │
│  筛选进程名或 PID ──────────────────────────────────────  │
│  99.9%      849 MB · 7%  gnome-shell                     │
│  ▬▬▬▬        ▬▬          PID 147112 · 26 线程 · 运行      │
│  35.0%      100 MB · 1%  msedge                          │
│  ▬▬          ▬           PID 740756 · 14 线程 · 睡眠      │
└─────────────── 更新于 15:50:20 · 每 2 秒自动刷新 · 立即刷新 ┘
```

## 功能

插件向右侧栏贡献一个页面类型，并向会话顶栏贡献一个按钮：

- **性能监控页面** —— 同一时钟驱动的两个窗口：
  - **资源占用**：CPU、内存、交换内存三个环形仪表，各自显示百分比、一行辅助信息
    （核心数与负载 / 已用与总量 / 本机未启用交换内存），标题栏显示主机名。
  - **进程列表**：每行一个进程，显示 CPU 占用、常驻内存及其占物理内存的比例，
    支持按进程名或 PID 筛选。三个标签**就是列表的三列表头**——`CPU`、`内存`、`进程名`
    从左到右，各自正对它所排序的那一列。`CPU` 与 `内存` 按该资源从高到低排列**整机**
    进程；`进程名` 切换为按名称排序。两个数值列宽度固定、永不压缩，名称列占用剩余宽度
    并截断，因此侧边栏变窄时先牺牲进程名而不是数值，列表也永远不会出现横向滚动条。
    列与行之间都有细线分隔；`CPU` 与 `内存` 右侧的分隔线同时是**拖拽把手**——拖动即可
    调整该列宽度，双击复位，也可聚焦后用方向键（Shift 加速、Home 复位）。宽度按浏览器记忆。
- **性能监控信息按钮** —— 位于会话顶栏的工具栏末位，紧邻右侧栏自身的展开按钮，
  点击即打开（或聚焦）该页面。

两个窗口都按宿主上报的间隔刷新（默认 2 秒）。浏览器标签页隐藏时暂停轮询，
重新可见时立即拉取一次新数据。

## 环境要求

- **Linux / macOS / Windows**。每个平台各有专用读取器；各平台能提供哪些指标见
  [平台支持](#平台支持)。
- **DeepSeek Harness `0.2.0-rc.1` 或兼容版本**。插件注册到右侧栏的 tab 类型注册表
  与会话顶栏的工具栏席位，因此需要启动 `@deepseek-ai/dsh-web-app` 的 profile
  （`web` profile 即是）。

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

然后重启 GUI。用 pm2 管理时：

```sh
pm2 restart deepseek-harness-webui
```

重启前可以先确认插件层已合成：

```sh
dsh --profile web --dump-config | grep -A2 perfmon
```

卸载：`dsh plugin --profile web remove @xmwengxing/dsh-client-ui-sidebar-perfmon`。

## 入口在哪里

打开右侧栏，引导页会列出 **性能监控** 卡片，点击即以 tab 形式打开该页面。
此后会话顶栏的 **性能监控信息** 按钮可打开或聚焦同一 tab；该 tab 与其它页面一样
支持分栏、拖动与浮出。

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
| 项目目录大小 | 进程内遍历，三个平台一致 | 同左 | 同左 |

平台无法提供的字段一律上报 `null` 并在面板显示 `—`，同时在面板中列出原因。
任何字段都不会用 0 顶替——因为 0 看起来像一次真实测量。

**开销**：Linux 全部在进程内读 `/proc`，不启动任何子进程；macOS 与 Windows 每次采样
启动一个辅助进程，因此默认刷新间隔更保守——分别是 3 秒与 4 秒（Linux 为 2 秒），
可用 `refreshIntervalMs` 覆盖。

**没有专用读取器的平台**（FreeBSD、Solaris 等）回退到只用 `node:os` 的读取器：
真实的 CPU 读数与内存总量，交换内存与进程列表标记为不可用，而不是猜测。

### 数字是怎么来的

所有百分比都是同一累计计数器的两次采样之差，因此插件从不假设时钟节拍：

| 指标 | 规则 |
| --- | --- |
| CPU 占用 | 两次采样之间，忙时间占流逝时间的比例。 |
| 单核占用 | 同一规则，逐核心计算。 |
| 内存占用 | `已用 / 总量`，其中“已用”指“不可用”——页缓存可回收，因此计入可用而非已用。 |
| 交换内存占用 | `已用 / 总量`。 |
| 进程 CPU | 同一区间内该进程 CPU 时间的增量，按 **100% = 一个核心** 归一化——与 `top` 同一约定，因此 4 核机器上的 8 线程进程可能超过 100%。 |
| 进程内存 | 常驻集大小占总内存的比例。 |

读取器唯一必须遵守的规则是**单位自洽**：进程 CPU 时间必须与该读取器自己的 CPU 总量
同单位。Linux 两边都是 jiffies，macOS 与 Windows 两边都是毫秒——于是
`忙Δ / 总Δ` 与 `进程Δ / 总Δ × 核心数` 把单位约掉，任何地方都不需要假设 `USER_HZ`。

每次会话的第一次读数会用一次短采样预热，因此面板首帧显示的就是真实百分比而非 0。

有两种状态会如实呈现，而不是显示为 0：

- **本窗口内新出现的进程**没有可作差的上一帧，其 CPU 单元格在下一次轮询前显示 `—`。
- **未启用交换内存的主机**显示“未启用”，而不是一个 0% 的空环。

仪表盘下方的**项目目录**行**按需统计**：目录遍历是 CPU 与 IO 密集型工作——
停在用户主目录的会话可能有几十万条目——因此面板绝不隐式启动扫描。该行自带
一个按钮，统计**当前正在查看的会话**的工作目录：浏览器在启动请求里携带会话 id，
宿主经活跃会话存储解析 `session.header.cwd`；GUI 侧栏里“正在查看”的会话大多是
冷会话（其归属进程从未把它进入本进程的活跃存储），因此宿主会退回到
session-query 服务读取冷记录的 cwd。扫描进行中按钮变为“停止”，且停止落点在
单次文件系统调用之内，已统计的部分结果会带“已停止”说明保留显示。扫描完成后的
读数一直保留到下次扫描替换为止。常规轮询只读存储结果——面板开着在两次扫描之间
零开销。扫描有上限（单目录 5 万条目、单次 12 个目录）、符号链接既不跟随也不计入，
每一处省略都在数字旁说明，而不是默默夸大准确性。

## 接入方式

一个 bundle，两半：

- **宿主半边**（`lib/index.js`）在 Connection 共享且已鉴权的 `/api` 通道上注册一条
  精确路由 —— `POST /api/perfmon.snapshot` —— 这正是官方 deliverables 与
  session-log-export 包使用的同一接缝。注册在那里意味着该路由继承 GUI 的
  Host/Origin 防护与浏览器会话鉴权，因此浏览器用同源 `fetch()` 即可访问，
  插件自身不处理任何凭据。宿主侧带一个短缓存，多个面板共享同一次 `/proc` 遍历。
- **浏览器半边**（`client/client.js`）注册三个界面，全部是公开扩展席位：
  1. `ctx.sidebarRightTabs.register()` —— `perfmon` 页面类型及其引导页入口。
  2. `ctx.slots.register()`，席位 `sidebar.right.pane.tab`，以该类型自身的 `id` 为键
     —— 面板正文。
  3. `ctx.slots.register()`，席位 `conversation.session.header.utilities` —— 顶栏按钮，
     排序值最大，因此落在右侧栏展开按钮旁。

服务解析刻意延后：浏览器半边不声明 `inject` 列表，而是通过 `ctx.inject([...])`
逐个获取服务，因此缺少右侧栏或 Connection 的 profile 只会跳过对应贡献，
而不会让整个插件一直 pending。

样式只使用共享的 `--dsw-*` 设计令牌（字面色仅作为 `var()` 回退出现），
面板自带中英文案并按文档语言选择，因此不依赖 locale 服务。

## 隐私

插件读取本机内核计数器，只返回给发起请求的浏览器。它自身不发起任何网络请求，
不外发数据，不写文件。路由受与 GUI 其余部分相同的鉴权保护。

## 已知限制

- **没有进程属主、命令行与进程树**。每行包含进程名、PID、状态、线程数、CPU 与 RSS。
- **macOS 与 Windows 部分仅有解析器测试**。这两个平台的读取器由「抓取的工具输出样本 +
  注入的失败路径」覆盖，但作者未在真实 macOS / Windows 硬件上运行过。Windows 的进程状态、
  macOS 的线程数是平台本身不提供，而非实现遗漏。
- **没有历史数据**。面板只显示当前读数，没有迷你趋势图或留存采样。
- **轮询而非推流**。刷新是按间隔请求，而非服务端推送。
- **顶栏按钮只负责打开，不负责切换**。关闭面板由右侧栏自身的控件完成。

## 开发

```sh
npm install
npm run build        # 生成 lib/index.js 与 client/client.js
npm run watch        # 改动即重建
npm test             # 先构建两半，再跑全部用例
```

`npm test` 覆盖：以手工构造的采样验证差值算法；通过 `react-test-renderer` 验证面板
行为（仪表、标签、排序、筛选、刷新、错误）；已发布 bundle 的注册内容；以及一组
**契约时效性**用例——它们重新读取已安装的 dsh 包，确认本插件依赖的席位名、服务名
与路由规则仍然成立。

另有一个通过 DevTools 协议驱动真实 Chromium 的浏览器验证脚本：

```sh
# 另起一个实例，避免影响正在运行的 GUI
dsh --profile web --port 3099 --no-open

# 在 Chromium 监听 9222 的前提下
node scripts/verify-ui.mjs "http://127.0.0.1:3099/?token=<token>" /tmp/panel.png
```

## 许可证

MIT
