<!-- Scope: project-local -->
# NotebookLM 并发提问解锁器 (Chrome 扩展)

[![Latest Release](https://img.shields.io/github/v/release/vecyang1/notebooklm-concurrency-unlocker)](https://github.com/vecyang1/notebooklm-concurrency-unlocker/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-success.svg)](manifest.json)

[English](README.md) | **[中文文档](README.zh-CN.md)**

<p align="center">
  <img src="assets/hero-banner.png" alt="NotebookLM Concurrency Unlocker 视觉横幅" width="100%">
</p>

> **基于 Google NotebookLM 官方流式 RPC 与 NotebookLM-CX / notebooklm-py 生产级架构构建的浏览器多路并发与原生流式问答解锁扩展。**

---

## 💡 为什么需要此扩展？

在官方 **Google NotebookLM** 网页版界面中，系统默认限制用户**同一时刻只能进行 1 项提问**：
- 当模型正在思考或流式输出回答时，底部输入框被设置为 `disabled` 状态，发送按钮锁定；
- 用户若有 3 到 5 个关联问题或对比问题，必须苦等上一题生成完成（通常 15~40 秒）才能输入下一题，极大破坏研究心流。

本项目传承自 `notebooklm-py` 与 `notebooklm-CX` (Faktiv 生产系统) 中的 **BrandWorkerPool** 信号量并发调度理念，通过双轨与即时同屏并发流彻底解锁限制：
1. **即时同屏并发流 (Simultaneous Parallel Stream，默认模式)**：
   - 当上一题在生成中时，在底部原生输入框键入后续第 2、3、4 题并按回车；
   - 扩展立即发起独立的并发流式请求，**并在原生聊天对话流中直接挂载问题气泡与实时流式回答卡片**，与官方首题同屏并行生成！
2. **原生输入智能排队 (Serial Native Queue，可配置模式)**：
   - 适合需要严格依赖上下文的会话流，自动拦截回车进入 FIFO 队列，前一题完毕后零延迟自动向原生输入框投递下一题。
3. **多线程并发控制抽屉 (Drawer Mode)**：
   - 提供内置的并发提问控制台，支持批量粘贴多行问题，支持 1-7 路并行问答、一键导出 Markdown 汇总、一键复制单题答案。
4. **全双语国际化 (Bilingual i18n)**：
   - 支持英文与简体中文一键即时无缝切换（抽屉顶栏、Popup 界面及设置均提供即时切换按钮，配置持久化至 Chrome Storage）。
5. **🌓 WCAG AAA 自适应双模主题 (浅色与深色模式)**：
   - 动态感知页面背景与主题属性，确保在 NotebookLM 浅色与深色模式下均严格满足 WCAG AAA 对比度红线 (>= 7:1)，告别浅色背景下文字浅银看不清及黑底反差气泡问题。

---

## 🚀 核心架构与功能特性

### 1. 原生聊天流即时同屏并发 (In-Chat Simultaneous Streaming)
- **视觉完全贴合**：注入的问题气泡和流式回答卡片精准匹配 NotebookLM 官方 Material 3 奢华深色排版规范。
- **实时分块流式渲染**：采用 `ReadableStream` 流式分块解析器，回答内容伴随闪烁光标实时吐字，非单次等待完成后吐出。
- **便签与剪贴板联动**：提供一键复制 Markdown 回答，点击“保存为便签”自动复制完整标题与正文并触发界面便签创建。

### 2. 信号量并发工作池 (Worker Pool)
- **并发度配置**：支持 1 到 7 线程并发控制（默认推荐 5 路）。
- **过载与熔断保护 (Circuit Breaker)**：连续 5 次遇到网络抖动或异常时自动熔断保护，防止短时间过度请求导致账号被 Google 临时限流。
- **瞬态重试与指数退避**：遭遇网络偶发 503 等瞬态抖动时，自动按照指数退避算法进行重试。

### 3. UI 可观测性与对账器 (UI Observability & Diagnostic-First)
- **凡称可配置，必须可检查**：并发数、派发模式（即时同屏并发 vs 原生串行排队）、输入框解锁开关、双语语言选项等均持久化在 Chrome Storage，并在抽屉与插件 Popup 中双向实时同步。
- **连通性对账探测 (Ping Probe)**：内置独立诊断面板，可一键向官方流式端点发起探针请求，实时查看 HTTP 状态码、往返延迟 (RTT)、接收字节数与报文解析详情，直接验算端到端连通性。

---

## 📦 安装与加载运行

由于本工具为开源的 Chrome 扩展程序 (Manifest V3)，请按以下步骤加载：

1. 打开 Google Chrome 或基于 Chromium 的浏览器（Edge、Brave、Arc 等）；
2. 在地址栏输入 `chrome://extensions/` 并回车；
3. 打开右上角的 **“开发者模式” (Developer mode)** 开关；
4. 点击左上角的 **“加载已解压的扩展程序” (Load unpacked)**；
5. 在文件选择对话框中，选择已克隆的本项目目录（`notebooklm-concurrency-unlocker`）；
6. 加载完成后，打开或刷新 [Google NotebookLM](https://notebooklm.google.com)，即可体验多题同时并发问答与右下角 `⚡ 并发问答` 悬浮入口！

---

## 🧪 自动化测试套件

本项目严格践行“没人跑的检查不算证据”，包含全套单元测试与端到端实测校验：

```bash
npm test
```

### 覆盖测试集：
- `test_parser.js`：Google Anti-XSSI 前缀剔除、流式 RPC 分块解析、引用源提取、错误帧处理、多层嵌套来源参数组装。
- `test_worker_pool.js`：信号量并发上限不变量断言（严格不超过 N 个并发）、指数退避重试机制、连续失败熔断器状态机。
- `test_storage.js`：单一事实来源配置读取、更新与滚动平均遥测指标计算。
- `test_queue.js`：原生输入框解禁、事件拦截、FIFO 排队与自动投递流程。
- `test_i18n.js`：中英文双语字典完整性、变量插值替换与即时语言切换测试。
- `test_parallel_dispatch.js`：原生输入框并发派发模式切换、事件拦截与即时同屏并发调度断言。
- `e2e_live_smoke.js`：基于真实 Google NotebookLM 活体页面运行的端到端自动化验收与全景视觉截图对账。
