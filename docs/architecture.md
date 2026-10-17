<!-- Scope: project-local -->
# NotebookLM 并发提问解锁器 - 系统架构图 (Architecture Map)

## 1. 总体架构概览

本工程为 Chrome 扩展程序 (Manifest V3)，采用分层解耦与双轨并发模型：

```
+-----------------------------------------------------------------------------------+
|                        Google Chrome 运行环境 (Browser)                           |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  [主世界 MAIN World]                                                               |
|    └─ inpage.js                                                                   |
|         ├─ 读取 window.WIZ_global_data (SNlM0e, FdrFJe, cfb2h)                    |
|         ├─ 发起同源流式 Fetch (GenerateFreeFormStreamed)                           |
|         └─ 执行对账连通性探针 (Ping Probe)                                         |
|                 ▲                                                                 |
|                 │ (window.postMessage 双向通信)                                    |
|                 ▼                                                                 |
|  [隔离世界 ISOLATED World]                                                         |
|    ├─ content.js (核心编排器)                                                     |
|    ├─ lib/queue.js (NativeChatUnlocker: 原生输入解禁 + MutationObserver + FIFO 排队) |
|    ├─ lib/worker_pool.js (ConcurrencyWorkerPool: 1-7 并发信号量 + 熔断器 + 重试)   |
|    ├─ lib/parser.js (StreamingChatParser: 官方流式 Wire RPC 解码器)                |
|    └─ lib/storage.js (StorageManager: chrome.storage.local SSOT 状态中心)          |
|                                                                                   |
|  [扩展后台与界面 Chrome Extension Surface]                                         |
|    ├─ background.js (Service Worker: 图标 Badge 线程数同步)                       |
|    ├─ popup.html / popup.js (工具栏快速设置与连接对账卡)                          |
|    └─ styles.css (半透明奢华深色面板、原生排队浮动 Chip 与卡片样式)                |
|                                                                                   |
+-----------------------------------------------------------------------------------+
```

## 2. 核心状态与数据契约 (SSOT)

- 配置与遥测持久化统一由 `lib/storage.js` 托管至 `chrome.storage.local`：
  - `maxWorkers`: 默认 5 (范围 1-7)
  - `unfreezeNativeInput`: 默认 true
  - `autoQueueNative`: 默认 true
  - `queryTimeoutSeconds`: 默认 180s
  - `maxRetries`: 默认 3
- 官方流式 RPC 契约：
  - 请求端点：`/_/LabsTailwindUi/data/google.internal.labs.tailwind.orchestration.v1.LabsTailwindOrchestrationService/GenerateFreeFormStreamed`
  - 参数格式：`f.req=[null, "[ [sources], question, null, [2,null,[1],[1]], conv_id, null, null, notebook_id, 1 ]"]`
  - 令牌：`at=SNlM0e`
  - 会话：`f.sid=FdrFJe`
