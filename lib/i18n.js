/**
 * NotebookLM 并发提问解锁器 - 国际化引擎 (i18n Engine)
 * 支持中英文即时无缝切换，单源持久化至 storage
 */

const I18N_DICTIONARIES = {
  en: {
    // General
    extensionName: "NotebookLM Concurrency Unlocker",
    extensionDescription: "Unlock Google NotebookLM single-query limits with 1-5 parallel Q&A streams and native input queueing.",
    threads: "threads",
    parallelThreads: "threads concurrent",
    activeStreamsBadge: "parallel active",
    saveSuccess: "Saved successfully",

    // Header & Navigation
    headerTitle: "NotebookLM Concurrency Unlocker",
    headerTagSuffix: "Workers Active",
    tabAsk: "🚀 Concurrent Q&A",
    tabSettings: "⚙️ Settings",
    tabDiagnostics: "🩺 Diagnostics",
    langSwitchBtn: "中文",

    // Ask View
    workerControlLabel: "Concurrency Workers:",
    batchInputPlaceholder: "Type questions to ask simultaneously (one per line):\n1. Summarize core findings\n2. Analyze potential risks\n3. Outline actionable next steps",
    batchInputHint: "One question per line. All questions will execute in parallel (1-7 workers).",
    questionCount: "{n} questions",
    startConcurrentBtn: "🚀 Start Concurrent Q&A",
    exportMarkdownBtn: "Export Markdown",
    clearCardsBtn: "Clear",

    // Card States
    cardQueued: "Queued",
    cardGenerating: "Generating in parallel...",
    cardCompleted: "Completed · {s}s",
    cardFailed: "Failed",
    copyAnswer: "Copy Answer",
    sendToNative: "Send to Native Box",
    saveToNote: "Save to Note",
    copySuccess: "Answer copied to clipboard!",
    copied: "Copied!",
    savedToNote: "Saved!",
    noCardsToExport: "No completed Q&A records to export.",
    exportHeaderTitle: "NotebookLM Concurrent Q&A Report",
    exportExportTime: "Exported at:",
    exportWorkers: "Workers:",

    // In-Chat Concurrent Turn
    parallelStreamBadge: "Parallel Stream",
    generatingParallel: "Generating answer in parallel...",
    streamingThoughts: "Analyzing sources & reasoning...",
    errorPrefix: "Error:",
    openDrawer: "Open in Drawer",

    // Floating Badge & Button
    floatBtnText: "Concurrent Q&A",
    floatBtnWorkers: "{n} streams",
    badgeParallelStreaming: "⚡ Parallel Streaming: {n} active",
    badgeQueueing: "⚡ Queueing: {n} waiting",
    clearQueue: "Clear queue",
    inputPlaceholderParallel: "Type next question and press Enter to stream in parallel...",
    inputPlaceholderSerial: "Type next question and press Enter to queue...",

    // Settings View
    dispatchModeTitle: "Native Input Dispatch Mode",
    dispatchModeDesc: "Choose how questions submitted in the bottom native input box while generating are handled:",
    modeParallelLabel: "⚡ Simultaneous Parallel Stream (Recommended)",
    modeParallelDesc: "Immediately launches a parallel stream and renders live in the chat flow at the same time.",
    modeSerialLabel: "⏳ Serial Native Queue",
    modeSerialDesc: "Queues questions and sends them one after another when previous question finishes.",
    maxWorkersTitle: "Max Concurrency Workers",
    maxWorkersDesc: "Maximum simultaneous requests to Google NotebookLM. Recommended: 3-5 workers, up to 7.",
    unfreezeTitle: "Force Unlock Native Input Box",
    unfreezeDesc: "Continuously remove the disabled/frozen state from the bottom input box during generation.",
    autoQueueTitle: "Native Auto Queue / Dispatch",
    autoQueueDesc: "Intercept Enter/submit during generation to queue or stream questions based on dispatch mode.",
    showFloatTitle: "Show Bottom-Right Floating Button",
    showFloatDesc: "Display the quick-access floating concurrency capsule in the bottom-right corner.",
    languageTitle: "Display Language",
    languageDesc: "Toggle between English and Simplified Chinese interface.",

    // Diagnostics View
    diagNotebookId: "Active Notebook ID:",
    diagCsrfToken: "CSRF Token (SNlM0e):",
    diagSessionId: "Session ID (FdrFJe):",
    diagSourcesCount: "Indexed Sources:",
    diagWorkerStatus: "Worker Pool Status:",
    diagRunProbeBtn: "🩺 Run Live Connectivity Probe",
    diagRefreshBtn: "Refresh Readings",
    diagProbeStatus: "Probe HTTP Status:",
    diagProbeRtt: "Round Trip Time (RTT):",
    diagProbeBytes: "Bytes Received:",
    diagProbePreview: "Response Preview:",
    diagTotalQueries: "Total Queries Handled:",
    diagSuccessRate: "Success Rate:",
    diagAvgTime: "Historical Avg Duration:",
    statusDetecting: "Detecting...",
    statusIdle: "Ready & Idle",
    statusActive: "Active: {active} / Queued: {queue} / Max: {max}",
    statusProbeRunning: "Probe running...",
    statusProbeSuccess: "Connected · Ready",

    // Popup
    popTitle: "NotebookLM Unlocker",
    popConnected: "Connected to NotebookLM page",
    popNotConnected: "Not on a NotebookLM page",
    popOpenNotebook: "Open / Switch to NotebookLM"
  },

  zh: {
    // General
    extensionName: "NotebookLM 并发提问解锁器",
    extensionDescription: "解锁 Google NotebookLM 单题提问限制，支持 1-5 路真正并行并发问答与原生输入智能排队。",
    threads: "路",
    parallelThreads: "线程并发",
    activeStreamsBadge: "路并行",
    saveSuccess: "保存成功",

    // Header & Navigation
    headerTitle: "NotebookLM 并发提问解锁器",
    headerTagSuffix: "线程并发",
    tabAsk: "🚀 并发提问",
    tabSettings: "⚙️ 规则配置",
    tabDiagnostics: "🩺 对账器与自检",
    langSwitchBtn: "EN",

    // Ask View
    workerControlLabel: "并发线程控制:",
    batchInputPlaceholder: "输入你想同时提问的问题，支持多行批量输入：\n1. 总结核心要点\n2. 分析潜在风险\n3. 列出下一步行动建议",
    batchInputHint: "每行一个问题，点击后将同时并发发起提问，支持 1 到 7 路并行。",
    questionCount: "{n} 个问题",
    startConcurrentBtn: "🚀 开始并发提问",
    exportMarkdownBtn: "导出 Markdown",
    clearCardsBtn: "清空",

    // Card States
    cardQueued: "排队中",
    cardGenerating: "并发生成中...",
    cardCompleted: "已完成 · 耗时 {s}s",
    cardFailed: "提问失败",
    copyAnswer: "复制回答",
    sendToNative: "送入原生输入框",
    saveToNote: "保存为便签",
    copySuccess: "已成功复制回答内容至剪贴板",
    copied: "已复制",
    savedToNote: "已保存便签",
    noCardsToExport: "暂无已生成的问答记录可导出",
    exportHeaderTitle: "NotebookLM 并发问答汇总报告",
    exportExportTime: "导出时间:",
    exportWorkers: "并发执行数:",

    // In-Chat Concurrent Turn
    parallelStreamBadge: "并发流",
    generatingParallel: "正在并发生成回答...",
    streamingThoughts: "检索来源中并进行思考推演...",
    errorPrefix: "错误详情:",
    openDrawer: "在侧栏查看",

    // Floating Badge & Button
    floatBtnText: "并发问答",
    floatBtnWorkers: "{n}路",
    badgeParallelStreaming: "⚡ 并发流式生成中: {n} 题并行",
    badgeQueueing: "⚡ 并发排队中: {n} 题待发",
    clearQueue: "清空排队",
    inputPlaceholderParallel: "输入下一题并按回车即时并发回答...",
    inputPlaceholderSerial: "输入下一题并按回车智能排队...",

    // Settings View
    dispatchModeTitle: "原生提问派发模式",
    dispatchModeDesc: "在已有回答生成中时，于原生输入框提交后续问题的处理方式：",
    modeParallelLabel: "⚡ 即时并发同屏回答 (推荐)",
    modeParallelDesc: "立即发起独立并行请求，并在原生聊天流中同屏实时生成回答。",
    modeSerialLabel: "⏳ 原生串行排队",
    modeSerialDesc: "将问题加入先进先出排队队列，待上一题完毕后零延迟自动投递。",
    maxWorkersTitle: "最大并发工作线程数",
    maxWorkersDesc: "控制同时向 Google NotebookLM 发起的并发请求上限，推荐 3 到 5 路，最高 7 路。",
    unfreezeTitle: "强制解锁原生输入框",
    unfreezeDesc: "持续移除 NotebookLM 底部输入框在生成中的 disabled 锁定状态。",
    autoQueueTitle: "原生提问拦截与派发",
    autoQueueDesc: "在生成进行中拦截回车/提交，根据派发模式自动并发或排队。",
    showFloatTitle: "显示页面右下角悬浮入口",
    showFloatDesc: "控制是否在 NotebookLM 页面显示悬浮提问助手入口胶囊。",
    languageTitle: "界面语言",
    languageDesc: "在简体中文与英文之间切换。",

    // Diagnostics View
    diagNotebookId: "当前笔记本 ID:",
    diagCsrfToken: "CSRF 令牌 (SNlM0e):",
    diagSessionId: "会话标识 (FdrFJe):",
    diagSourcesCount: "已索引来源数:",
    diagWorkerStatus: "并发线程运行状态:",
    diagRunProbeBtn: "🩺 发起连通性对账探测",
    diagRefreshBtn: "刷新读数",
    diagProbeStatus: "探测 HTTP 状态:",
    diagProbeRtt: "往返耗时 (RTT):",
    diagProbeBytes: "接收有效报文长度:",
    diagProbePreview: "回答解析预览:",
    diagTotalQueries: "累计处理提问:",
    diagSuccessRate: "成功率:",
    diagAvgTime: "历史平均响应耗时:",
    statusDetecting: "检测中...",
    statusIdle: "就绪空闲",
    statusActive: "活跃: {active} / 队列: {queue} / 最大并发: {max}",
    statusProbeRunning: "探测执行中...",
    statusProbeSuccess: "Google 流式 RPC 连通正常，首帧就绪",

    // Popup
    popTitle: "NotebookLM 并发解锁",
    popConnected: "已连接 NotebookLM 页面",
    popNotConnected: "当前未处于 NotebookLM 页面",
    popOpenNotebook: "打开 / 切换至 NotebookLM"
  }
};

class I18nManager {
  constructor(initialLang = null) {
    this._currentLang = initialLang || this.detectInitialLanguage();
    this._listeners = new Set();
  }

  detectInitialLanguage() {
    if (typeof navigator !== 'undefined' && navigator.language) {
      const l = navigator.language.toLowerCase();
      if (l.startsWith('zh')) return 'zh';
    }
    return 'en';
  }

  getLanguage() {
    return this._currentLang;
  }

  setLanguage(lang) {
    const valid = lang === 'zh' ? 'zh' : 'en';
    if (this._currentLang === valid) return;
    this._currentLang = valid;
    this._notify();
  }

  t(key, params = {}) {
    const dict = I18N_DICTIONARIES[this._currentLang] || I18N_DICTIONARIES.en;
    let template = dict[key] || I18N_DICTIONARIES.en[key] || key;
    if (typeof template !== 'string') return template;

    for (const [k, v] of Object.entries(params)) {
      template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    return template;
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    for (const fn of this._listeners) {
      try { fn(this._currentLang); } catch (_) {}
    }
  }
}

const defaultI18n = new I18nManager();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { I18nManager, I18N_DICTIONARIES, defaultI18n };
} else {
  window.NBI18n = defaultI18n;
  window.I18nManager = I18nManager;
}
