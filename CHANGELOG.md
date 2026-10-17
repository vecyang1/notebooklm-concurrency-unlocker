# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-10-17

### Added
- **WCAG 2.1 AAA/AA 自适应明暗主题系统 (Adaptive Light/Dark Theme Engine)**：
  - 新增 [`lib/theme.js`](lib/theme.js)，构建 `ThemeManager` 核心类，内置 W3C WCAG 2.1 相对亮度计算算法、对比度比值方程及感知亮度计算器。
  - 支持多层级探测：宿主 class、`data-theme` 属性、计算背景色感知亮度 (`luminance < 140` 为暗色，`>= 140` 为浅色) 及系统级 `prefers-color-scheme` 媒体查询。
  - 通过 `MutationObserver` 监听宿主 `html` / `body` / 聊天流容器类名与属性变动，实现零延迟实时自适应主题广播。
- **浅色模式色彩系统与视觉对齐 (Light Mode Luxury Palette)**：
  - 彻底重构 [`styles.css`](styles.css) 为基于 CSS Custom Properties 的设计令牌架构。
  - 用户提问气泡 (`.nb-user-bubble`)：浅色模式下采用 NotebookLM 原生浅灰圆角胶囊 (`#f2f0f0`)，文字颜色 `#1f2937`，达成 12.93:1 WCAG AAA 极高对比度。
  - 模型回答正文 (`.nb-answer-content`)：浅色模式下采用深炭灰 (`#1f2937`)，相对纯白背景达成 14.68:1 对比度，彻底消灭 `#cbd5e1` 浅银青色文字不可读问题。
  - 标题 (`h1`-`h4`) 与列表序号：采用 `#0f172a` (17.85:1) 与 `#475569` (5.93:1)，满足 WCAG AAA 标杆。
  - 引用源药丸 (`.nb-ref-pill`) 与操作芯片 (`.nb-action-chip`)：浅色模式下分别达成 9.45:1 与 9.90:1 对比度。
  - 浮动徽标 (`#nb-concurrency-float-btn`) 与多任务并发抽屉 (`#nb-concurrency-modal`)：全面升级自适应设计令牌。
- **单元测试与活体验证套件**：
  - 新增 [`tests/test_theme.js`](tests/test_theme.js)，覆盖颜色解析、WCAG 数学模型、类名检测、计算样式与主题广播。
  - 更新 [`tests/run_all_tests.js`](tests/run_all_tests.js)，全量 7 个测试套件 100% 通过（0 报错）。
  - 通过 `ego-browser` 在真实的 Google NotebookLM 浅色界面中进行 E2E 活体挂载与对比度断言，并在 `reports/` 下保留视觉证明截图。

## [1.1.0] - 2026-10-17

### Added
- **聊天对话流即时并发同屏流式问答 (In-Chat Simultaneous Parallel Stream)**：
  - 彻底打破单问答串行等待限制：在前一个问题仍在生成时，在原生底部输入框提交新问题，系统自动拦截并立即启动并发流式 RPC 请求（`WorkerPool` + `GenerateFreeFormStreamed`），同时清空输入框支持无缝连续提问。
  - 直接在原生聊天流（`.chat-panel-content`）中追加挂载 `.chat-message-pair.nb-concurrent-turn` 问答卡片，采用 NotebookLM 深度原生 Material 3 深色奢华调色板（`#0f172a` 背景、微光阴影、`38bdf8` 状态指示），与原生界面无缝融合。
  - 引入基于 `ReadableStream` 的增量字符流式解析，实时推流渲染并附带 `▍` 呼吸光标，并联动聊天流容器平滑自动向下滚动。
  - 问答完成后自动呈现富文本 Markdown 排版、引用源药丸（`.nb-ref-pill`）、耗时记录芯片，并集成“复制回答”与“保存为便签”操作芯片。
  - 聊天流与并发侧边抽屉保持双向实时对账：在聊天流中并发提问的同时，侧边抽屉自动同步创建对应任务卡片。
- **派发模式自由切换 (Configurable Dispatch Mode)**：
  - 引入“即时并发同屏回答 (Simultaneous Parallel Stream)”与“原生串行排队 (Serial Native Queue)”双模式切换，默认开启即时并发同屏回答。
  - 用户可在并发抽屉设置面板与扩展 Popup 中实时切换，完全兼容旧版串行 FIFO 排队偏好。
- **全系统双语国际化引擎 (Full Bilingual i18n Engine)**：
  - 新增 `lib/i18n.js`，实现 84 项中英文词条字典严密对齐、动态参数插值（`{param}`）与状态变更订阅广播。
  - 新增 Chrome Extension 标准 `_locales/en/messages.json` 与 `_locales/zh_CN/messages.json` 本地化资源。
  - 在抽屉顶部、扩展弹窗与设置面板均提供一键语言即时无闪烁切换，自动根据浏览器语言首选自适应，并持久化于 `chrome.storage.local`。
  - `README.md` 采用标准英文为主，并在顶部显眼位置双向链接 `README.zh-CN.md`。
- **幂等性热更新与防泄漏 IPC 架构**：
  - 为 `inpage.js` 与 `content.js` 引入具名可注销消息监听句柄与强制重载守卫，杜绝热重载过程中的事件监听器残留与重复挂载。
- **自动化测试套件扩充**：
  - 新增 `tests/test_i18n.js`（验证双语词典对齐度 100%、插值与订阅广播）。
  - 新增 `tests/test_parallel_dispatch.js`（验证并发拦截调度、活跃路数统计与模式切换）。
  - 升级 `tests/e2e_live_smoke.js`，全面覆盖探针、双语切换、派发模式、同屏流式问答与截图留痕。

### Fixed
- **E2E 活体验证键盘事件元素分发与焦点修复 (Focused Keydown vs Keyboard API)**：
  - 修复 `tests/e2e_live_smoke.js` 中使用 `page.keyboard.press("Enter")` 在无头 CDP 远程环境下未向输入框派发事件的静默失败缺陷，改为显式目标派发 `page.press(textareaSel, "Enter")`，确保捕获拦截器 100% 捕获后续连续回车提问。
- **并发调度器跨作用域句柄自动保底 (Parallel Handler Window SSOT Fallback)**：
  - 在 `lib/queue.js` 的 `_handleKeyDown`、`_handleFormSubmit` 与 `_handleButtonClick` 中引入 `this._onParallelSubmit || window.__nbHandleParallelSubmit` 回退机制，杜绝未显式传入回调函数时静默降级为串行排队。
- **DOM 污染与旧轮次残留消除 (Stale Turn Purification & Trusted Types Safety)**：
  - 针对 E2E 活体测试增加执行前重置清理机制，使用 `replaceChildren()` 清除历史 `.chat-message-pair.nb-concurrent-turn` 残留，消除测试断言读取旧轮次数据的假阳性隐患，严格遵循 Google CSP Trusted Types 规范。
- **In-Chat 加载微光与状态指示节点物理清除 (`spinner.remove()`)**：
  - 修复 `content.js` 中 `updateInChatComplete` 与 `updateInChatError` 仅设置 `spinner.style.display = 'none'` 导致 `.nb-pulse-spinner` 节点驻留 DOM 影响断言判定的隐患，全面改为物理移除节点 (`spinner.remove()`)，确保 DOM 洁净度。
- **活体隔离测试事件竞态防御与双实例干扰消除**：
  - 在 `tests/e2e_live_smoke.js` 原生排队活体测试中，前置暂停全局观察器实例 (`stopObserving()`)，并在初始化测试实例后即时置位 `isGenerating = () => false;`，消除 250ms 解冻定时器出队与测试监听器挂载之间的微任务竞态。

## [1.0.4] - 2026-10-16

### Fixed
- **原生表单隔离防护 (Global Form Scoping Isolation)**：修复全局 `submit` 事件捕获监听器误伤非输入框表单（如笔记本重命名、来源上传、设置模态框等）的严重缺陷，增加严格的作用域校验 `if (form && event.target && event.target !== form && !(typeof form.contains === 'function' && form.contains(event.target))) return;`，实现精准隔离。
- **输入框与按钮双通道事件分发 (Dual-Channel Dispatch & Pre-unlock)**：彻底解决 Angular 受控按钮在非用户物理点击时因 `disabled=true` 导致标准 `form.requestSubmit()` 被静默忽略的问题。在分发前预先解除 `innerBtn.disabled` 锁定，并同步分发 `KeyboardEvent('keydown', { key: 'Enter' })` 穿透 Angular `KeyEventsPlugin`，双保底确保 100% 触发生成。
- **中文/CJK 输入法安全防御 (IME Composition Guard)**：在原生回车拦截中增加 `if (event.isComposing || event.keyCode === 229 || event.which === 229) return;` 及 `!event.altKey` 校验，彻底杜绝中文拼音输入选词过程中的回车被误捕获入队的问题。
- **出队调度竞态与状态碰撞消除 (Dispatch Collision Elimination)**：出队投递由脆弱的硬编码延时升级为 `_awaitingGeneration` 动态轮询等待门禁（上限 3000ms），严格确保 Google 后端确认进入流式生成状态后才允许出队下一题，杜绝连续出队相互踩踏。
- **生命周期安全重置与排队徽标定位修复**：`stopObserving()` 注销时重置所有调度与等待锁，避免状态泄漏；更新 `.nb-queue-chip` 为 `position: fixed`，实现跨视口滚动绝对稳定的输入框浮动定位。

### Added
- **单元测试扩充 (Unit Tests 11/11)**：在 `tests/test_queue.js` 增加测试用例 8、9、10、11，全面覆盖非输入框表单隔离、IME 输入法组合中回车免疫、预解锁属性以及生命周期彻底注销。
- **全链路活体验证 (E2E Live Verification)**：升级 `tests/e2e_live_smoke.js`，通过真实 Google NotebookLM 活体页面完成对账探针 200 OK、IME 防御、表单隔离、双通道分发、双路并行提问及全景视觉截图留痕。

## [1.0.3] - 2026-10-16

### Fixed
- **Angular 表单提交事件联动与 W3C 标准 `form.requestSubmit()` 支持**：彻底解决原生排队出队时仅调用 `sendButton.click()` 无法触发 Angular `(ngSubmit)` 提交的核心痛点。升级为三级联动调度通道：阶级 1 优先调用 W3C 标准 `form.requestSubmit(innerBtn)` 穿透触发 Angular 内部生命周期；阶级 2 分发标准 `keydown.enter` 键盘事件响应 Angular `KeyEventsPlugin`；阶级 3 触发传统 `sendButton.click()`。
- **生成中表单提交全量拦截与多源入队**：新增全局 `submit` 事件捕获监听器，确保用户在生成中无论是敲击回车还是触发任何表单提交动作，均被安全拦截并放入 FIFO 排队队列，同时可靠清空输入框供连续输入。
- **跨框架 Textarea 清空与数据绑定修复**：修复 `val === ''` 时 `execCommand('insertText')` 无法清空文本的浏览器缺陷，引入 `execCommand('delete')` 与全套 `beforeinput`/`input`/`change` (含 `InputEvent` 与 `Event`) 事件穿透，确保 Angular `FormControl` 与 CDK Textarea 状态同步更新。
- **`isGenerating` 显式绿灯排他保护**：当检测到可见的 Submit 按钮（`fonticonname="arrow_upward"` 或 `aria-label="Submit"`）且无 Stop 按钮时，明确判定为空闲绿灯，彻底免疫历史旧消息中已展开思考链造成的假阳性误判。
- **诊断探针首帧流式轻量化对账**：针对 `NB_RUN_DIAGNOSTIC_PROBE`，采用 `ReadableStreamReader` 读取首个数据块即完成连通性校验并优雅取消后续流式传输，将对账探测耗时由 20s+ 缩短至 5-6s。

### Added
- **活体端到端回归验收套件 (`npm run test:e2e`)**：新增 `tests/e2e_live_smoke.js`，通过 `ego-browser` 在真实 Google NotebookLM 页面自动化验证对账探针 200 连通性与原生输入排队出队提交联动。
- **单元测试扩充**：在 `tests/test_queue.js` 增加测试用例 5、6、7，覆盖 `form.requestSubmit()` 优先调度、生成中表单提交拦截与显式绿灯排他机制。

## [1.0.2] - 2026-10-16

### Fixed
- **主世界通信自身回环自解析致命缺陷 (Fatal IPC Echo Bug)**：修复 `content.js` 的 `window.message` 监听器过早拦截自身发出的请求包（`direction: 'to_inpage'`）导致立即以空 Payload 触发 Promise resolve 的致命缺陷。增加 `direction: 'to_content'` 双向隔离与响应帧类型守卫，确保所有跨世界 IPC 指令（`NB_GET_AUTH_STATE`、`NB_EXECUTE_STREAM_QUERY`、`NB_RUN_DIAGNOSTIC_PROBE`）严格等待页面真实响应。
- **历史折叠思考链导致的原生队列永久假死 (False Positive Generating State)**：在 `NativeChatUnlocker.isGenerating` 中精确排除已折叠的历史思考链节点（`.thinking-chain--collapsed`），彻底解决因页面保留旧对话思考链而永久判定为“生成中”导致原生排队题目无法自动投递的阻塞性问题。
- **批量提问编号剥离正则误删算式字符 (Question Math Stripping Bug)**：重构 `StreamingChatParser.parseQuestionsFromText`，仅精准剥离外层列表序号（如 `1.`、`2、`、`-`、`•`），彻底杜绝原正则表达式将加减法算式（如 `1 + 1`、`100 - 50`）以及年份开头的正常提问误伤截断的问题。
- **通信与深层生成超时容限升级**：将跨世界通信超时由 60 秒延长至 180 秒，从容应对 Google NotebookLM 索引 10+ 来源时复杂长文本推理的耗时需求。
- **DOM 挂载与按需重绑定幂等性增强**：在 `renderFloatButton` 与 `ensureModal` 中支持动态检查并复用现有 DOM 节点，重新绑定最新上下文事件监听，避免重复挂载与无效孤立实例。

### Added
- **多行批量问题解析单元测试**：在 `tests/test_parser.js` 增加测试用例 5，全面覆盖各种格式序号剥离、算式保留、纯年份保留及空值防御。

## [1.0.1] - 2026-10-16

### Fixed
- **主世界解析模块注入修复 (致命功能缺陷)**：在 `content.js` 中补齐 `lib/parser.js` 的主世界注入顺序，杜绝 `inpage.js` 在页面环境调用 `window.NBParser` 时报错 `undefined`。
- **定时器句柄泄露与测试挂起修复**：在 `ConcurrencyWorkerPool._executeWithRetry` 引入 `try...finally` 清理超时定时器，杜绝未清理的 180 秒定时器导致事件循环挂起。
- **多插槽并发饥饿修复**：将 `_processQueue` 从单次提取升级为 `while` 循环调度，确保工作池空闲时能够一次性并行拉起多路并发插槽。
- **DOM 事件监听器泄露修复**：将 `NativeChatUnlocker` 的键盘事件绑定固化为实例成员 `_boundKeyDown`，使 `removeEventListener` 能准确注销，杜绝重复绑定与内存泄露。
- **中文与多语言前端选择器增强**：补充对中文环境输入框（`textarea[placeholder*="提问"]`）与按钮（`aria-label*="发送"`、`aria-label*="停止"`）的原生匹配支持。
- **框架兼容性写入**：采用 `HTMLTextAreaElement.prototype` 原生描述符写入机制，确保在各种前端框架接管受控表单时均可触发真实数据绑定。
- **遥测平均耗时计算防护**：在 `StorageManager.recordMetric` 过滤 0 毫秒异常失败耗时，防止异常中断稀释有效的历史平均响应时间。
- **单一语言规范收敛**：移除用户界面与诊断日志中的中英双语括号，遵循工作区单一语言与无技术栈泄漏准则。

### Added
- **综合测试集扩充**：新增针对真实点击触发验证、监听器注销防泄露、中文选择器匹配、多插槽批量并发拉起与遥测防稀释的自动化断言。

## [1.0.0] - 2026-10-16

### Added
- **Manifest V3 架构 Chrome 扩展程序**：专用于 `https://notebooklm.google.com/*`。
- **并发调度工作池 (ConcurrencyWorkerPool)**：
  - 继承自 NotebookLM-CX 的 `BrandWorkerPool` 架构，支持 1-7 路并发（默认 5 路）。
  - 内置信号量控制、排队深度计算与等待耗时预估。
  - 具备 5 次连续失败自动熔断保护与指数退避重试。
- **双轨解锁模式**：
  - **原生输入解锁与智能排队 (NativeChatUnlocker)**：持续解禁官方底部输入框与发送按钮，在生成进行时拦截回车进入 FIFO 队列，并在上题生成完毕后秒级自动投递。
  - **多线程真正并行问答抽屉 (Concurrency Hub)**：支持批量多行问题输入，使用官方流式 RPC 端点并行生成并在卡片中展示结果与引用源。
- **对账器优先与 UI 可观测性**：
  - 内置独立诊断探针（Ping Probe），可一键向官方服务端发起连通性自检，验算 HTTP 状态码、延迟与报文解析。
  - 实时展示笔记本 ID、CSRF Token (SNlM0e) 提取状态、会话 ID 与已索引来源数。
- **配置与数据持久化 (StorageManager)**：
  - 单一事实来源 (SSOT) 管理配置项与遥测数据，支持抽屉与浏览器 Popup 双向同步。
- **自动化测试套件**：
  - 覆盖流式响应解码、信号量并发上限控制、指数退避重试、连续失败熔断、配置读取与原生排队逻辑。
