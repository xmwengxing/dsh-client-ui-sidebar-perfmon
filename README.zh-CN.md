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
├─ 进程列表 ───────────────────── 共 331 个进程 · 显示 60 行 ┤
│  [CPU ↓] [内存] [进程名]                                  │
│  筛选进程名或 PID ──────────────────────────────────────  │
│  gnome-shell                    88.9%      849 MB · 7.3% │
│  PID 147112 · 26 线程 · 运行                             │
│  MainThread                     69.1%      380 MB · 3.1% │
│  PID 1666247 · 11 线程 · 运行                            │
└─────────────── 更新于 15:42:07 · 每 2 秒自动刷新 · 立即刷新 ┘
```

## 功能

插件向右侧栏贡献一个页面类型，并向会话顶栏贡献一个按钮：

- **性能监控页面** —— 同一时钟驱动的两个窗口：
  - **资源占用**：CPU、内存、交换内存三个环形仪表，各自显示百分比、一行辅助信息
    （核心数与负载 / 已用与总量 / 本机未启用交换内存），标题栏显示主机名。
  - **进程列表**：每行一个进程，显示 CPU 占用、常驻内存及其占物理内存的比例，
    支持按进程名或 PID 筛选。三个标签切换排序：`CPU` 与 `内存` 按该资源从高到低
    排列**整机**进程；`进程名` 切换为按名称排序。
- **性能监控信息按钮** —— 位于会话顶栏的工具栏末位，紧邻右侧栏自身的展开按钮，
  点击即打开（或聚焦）该页面。

两个窗口都按宿主上报的间隔刷新（默认 2 秒）。浏览器标签页隐藏时暂停轮询，
重新可见时立即拉取一次新数据。

## 环境要求

- **Linux**。指标来自 `/proc`；其他平台会明确提示“不支持”，而不是编造数字。
- **DeepSeek Harness `0.2.0-rc.1` 或兼容版本**。插件注册到右侧栏的 tab 类型注册表
  与会话顶栏的工具栏席位，因此需要启动 `@deepseek-ai/dsh-web-app` 的 profile
  （`web` profile 即是）。

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
    refreshIntervalMs: 1000   # 500–60000，面板轮询间隔
    processLimit: 100         # 5–500，单次返回的进程行数
    cacheMillis: 800          # 0–10000，该窗口内的轮询共享同一次读取
    sampleMillis: 150         # 0–2000，首次读数的预热采样时长
```

## 数字是怎么来的

全部读自内核，因此没有采样守护进程，也不需要特权辅助程序：

| 指标 | 来源 | 规则 |
| --- | --- | --- |
| CPU 占用 | `/proc/stat` | 两次采样之间，忙 jiffies 占流逝 jiffies 的比例。 |
| 单核占用 | `/proc/stat` | 同一规则，逐 `cpuN` 行计算。 |
| 内存占用 | `/proc/meminfo` | `(MemTotal - MemAvailable) / MemTotal`。用 Available 而非 Free，因为页缓存可回收。 |
| 交换内存占用 | `/proc/meminfo` | `(SwapTotal - SwapFree) / SwapTotal`。 |
| 进程 CPU | `/proc/<pid>/stat` | `utime + stime` 的增量，按 **100% = 一个核心** 归一化——与 `top` 同一约定，因此 4 核机器上的 8 线程进程可能超过 100%。 |
| 进程内存 | `/proc/<pid>/stat` | `rss`（页数）× 页大小，再除以 `MemTotal`。 |

由于所有百分比都是两次采样之差，插件不需要假设内核的 `USER_HZ`：整机占比是
`忙Δ / 总Δ`，进程的单核占比是 `进程Δ / 总Δ × 核心数`，jiffy 常量在约分中消掉。
每次会话的第一次读数会用一次短采样预热，因此面板首帧显示的就是真实百分比而非 0。

有两种状态会如实呈现，而不是显示为 0：

- **本窗口内新出现的进程**没有可作差的上一帧，其 CPU 单元格在下一次轮询前显示 `—`。
- **未启用交换内存的主机**显示“未启用”，而不是一个 0% 的空环。

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

- **仅 Linux**。macOS 与 Windows 没有 `/proc`，面板会明确说明。
- **没有进程属主、命令行与进程树**。每行包含进程名、PID、状态、线程数、CPU 与 RSS。
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
