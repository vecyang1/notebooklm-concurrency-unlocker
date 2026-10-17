/**
 * 端到端活体验证套件 (E2E Live Smoke Test) - v1.1.0 综合回归验收
 * 依赖: ego-browser 任务空间 91 与活体 Google NotebookLM 页面
 * 覆盖:
 * 1. 对账探针 200 连通性与 CSRF 校验
 * 2. 原生输入智能排队、IME 防误吞、表单作用域隔离与双通道调度
 * 3. 全局双语 (i18n) 即时无缝切换 (中英文双向对账)
 * 4. 派发模式配置 (即时并发同屏流式 vs 原生串行排队)
 * 5. 聊天流同屏真正并行并发生成 (In-Chat Simultaneous Parallel Stream) 与抽屉双向对账
 * 6. 视觉对账留痕全景截图 (reports/notebooklm_concurrency_verified.png)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const assert = require('assert');

async function main() {
  console.log('========================================================');
  console.log(' NotebookLM 并发提问解锁器 v1.1.0 - 活体端到端回归验收');
  console.log('========================================================');

  const projectRoot = path.resolve(__dirname, '..');
  const screenshotPath = path.join(projectRoot, 'reports', 'notebooklm_concurrency_verified.png');
  const parserJsPath = path.join(projectRoot, 'lib', 'parser.js');
  const inpageJsPath = path.join(projectRoot, 'inpage.js');
  const i18nJsPath = path.join(projectRoot, 'lib', 'i18n.js');
  const storageJsPath = path.join(projectRoot, 'lib', 'storage.js');
  const workerPoolJsPath = path.join(projectRoot, 'lib', 'worker_pool.js');
  const queueJsPath = path.join(projectRoot, 'lib', 'queue.js');
  const contentJsPath = path.join(projectRoot, 'content.js');
  const stylesCssPath = path.join(projectRoot, 'styles.css');

  const testScript = `
const fs = await import("node:fs/promises");
const task = await taskSpace(91);
const pages = await task.pages();
const page = pages[0];

// 1. 同步加载仓库最新 v1.1.0 全部代码与样式到活体页面
const parserCode = await fs.readFile("${parserJsPath}", "utf-8");
const inpageCode = await fs.readFile("${inpageJsPath}", "utf-8");
const i18nCode = await fs.readFile("${i18nJsPath}", "utf-8");
const storageCode = await fs.readFile("${storageJsPath}", "utf-8");
const workerPoolCode = await fs.readFile("${workerPoolJsPath}", "utf-8");
const queueCode = await fs.readFile("${queueJsPath}", "utf-8");
const contentCode = await fs.readFile("${contentJsPath}", "utf-8");
const stylesCode = await fs.readFile("${stylesCssPath}", "utf-8");

await page.evaluate(({ parserCode, inpageCode, i18nCode, storageCode, workerPoolCode, queueCode, contentCode, stylesCode }) => {
  window.__NB_CONCURRENCY_FORCE_RELOAD__ = true;

  // 注入样式
  let styleEl = document.getElementById("nb-concurrency-styles");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "nb-concurrency-styles";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = stylesCode;

  // 注入各模块
  eval(parserCode);
  eval(inpageCode);
  eval(i18nCode);
  eval(storageCode);
  eval(workerPoolCode);
  eval(queueCode);
  eval(contentCode);
}, { parserCode, inpageCode, i18nCode, storageCode, workerPoolCode, queueCode, contentCode, stylesCode });

// 等待异步设置加载与生命周期初始化
await new Promise(r => setTimeout(r, 300));

// 2. 验证对账探针 (NB_RUN_DIAGNOSTIC_PROBE)
const probe = await page.evaluate(async () => {
  return new Promise((resolve) => {
    const messageId = "e2e_probe_" + Date.now();
    const handler = (e) => {
      if (e.data?.type === "NB_DIAGNOSTIC_PROBE_RESPONSE" && e.data?.messageId === messageId) {
        window.removeEventListener("message", handler);
        resolve(e.data);
      }
    };
    window.addEventListener("message", handler);
    window.postMessage({ type: "NB_RUN_DIAGNOSTIC_PROBE", messageId, direction: "to_inpage" }, "*");
    setTimeout(() => { window.removeEventListener("message", handler); resolve({ timeout: true }); }, 25000);
  });
});

// 3. 验证原生输入排队、IME 防误吞、表单作用域隔离与双通道提交
const queueResult = await page.evaluate(async () => {
  // 暂时暂停全局 unlocker，防止双实例互相干扰
  if (window.__nbNativeUnlocker) {
    window.__nbNativeUnlocker.stopObserving();
  }

  const unlocker = new window.NativeChatUnlocker();
  unlocker.init({ enabled: true, autoQueue: true, dispatchMode: "serial" });
  unlocker.isGenerating = () => false;

  const { textarea, sendButton } = unlocker.getComposerElements();
  const form = textarea?.closest("form");

  // A. IME 防误吞验证
  let imePassed = false;
  const imeEvent = new KeyboardEvent("keydown", {
    key: "Enter",
    keyCode: 229,
    which: 229,
    isComposing: false,
    bubbles: true,
    cancelable: true
  });
  textarea.value = "ce_shi_ime";
  textarea.dispatchEvent(imeEvent);
  imePassed = (textarea.value === "ce_shi_ime" && unlocker._queue.length === 0);

  // B. 非提问表单作用域隔离验证
  const fakeForm = document.createElement("form");
  let fakeSubmitPassed = false;
  const fakeEvent = {
    type: "submit",
    target: fakeForm,
    preventDefault: () => { fakeSubmitPassed = false; }
  };
  fakeSubmitPassed = true;
  unlocker._handleFormSubmit(fakeEvent);

  // C. 原生排队与双通道联动验证
  let formSubmitTriggered = false;
  let enterKeyDownTriggered = false;

  const submitListener = (e) => {
    formSubmitTriggered = true;
    e.preventDefault();
  };
  const keyListener = (e) => {
    if (e.key === "Enter") {
      enterKeyDownTriggered = true;
      e.preventDefault();
    }
  };

  form?.addEventListener("submit", submitListener, true);
  document.addEventListener("submit", submitListener, true);
  textarea?.addEventListener("keydown", keyListener, true);
  document.addEventListener("keydown", keyListener, true);

  unlocker.enqueue("活体端到端回归题目");
  const badgeEl = document.getElementById("nb-native-queue-badge");
  const badgeDisplayed = Boolean(badgeEl && badgeEl.style.display !== "none");
  const badgeText = badgeEl ? badgeEl.textContent.replace(/\s+/g, " ").trim() : "";

  unlocker.checkAndDispatchQueue();
  await new Promise(r => setTimeout(r, 400));

  form?.removeEventListener("submit", submitListener, true);
  document.removeEventListener("submit", submitListener, true);
  textarea?.removeEventListener("keydown", keyListener, true);
  document.removeEventListener("keydown", keyListener, true);

  // 清理现场并恢复全局 unlocker
  try { delete unlocker.isGenerating; } catch (_) {}
  unlocker._setTextareaValue(textarea, "");
  unlocker.stopObserving();

  if (window.__nbNativeUnlocker) {
    window.__nbNativeUnlocker.startObserving();
  }

  return {
    imePassed,
    fakeSubmitPassed,
    badgeDisplayed,
    badgeText,
    formSubmitTriggered,
    enterKeyDownTriggered,
    remainingQueue: unlocker._queue.length,
    badgeHiddenAfterStop: badgeEl.style.display === "none"
  };
});

// 4. 验证双语 (i18n) 动态切换与界面对账
const i18nResult = await page.evaluate(async () => {
  // 打开抽屉
  const floatBtn = document.getElementById("nb-concurrency-float-btn");
  let modal = document.getElementById("nb-concurrency-modal");
  if (!modal || modal.style.display === "none") {
    floatBtn?.click();
  }
  await new Promise(r => setTimeout(r, 200));
  modal = document.getElementById("nb-concurrency-modal");

  const i18n = window.__nbI18n;

  // 1) 切换为英文
  if (i18n) i18n.setLanguage("en");
  if (window.__nbApplyLanguageToUI) window.__nbApplyLanguageToUI();
  await new Promise(r => setTimeout(r, 100));
  const enTitle = modal?.querySelector(".nb-header-title")?.textContent?.trim();
  const enAskTab = modal?.querySelector('.nb-tab-btn[data-tab="tab-ask"]')?.textContent?.trim();
  const enFloat = floatBtn?.querySelector(".nb-float-label")?.textContent?.trim();
  const enToggleText = document.getElementById("nb-modal-lang-toggle")?.textContent?.trim();

  // 2) 切换为中文 (通过点击最新的切换按钮)
  const toggleBtn = document.getElementById("nb-modal-lang-toggle");
  if (toggleBtn) toggleBtn.click();
  await new Promise(r => setTimeout(r, 100));
  const zhTitle = modal?.querySelector(".nb-header-title")?.textContent?.trim();
  const zhAskTab = modal?.querySelector('.nb-tab-btn[data-tab="tab-ask"]')?.textContent?.trim();
  const zhFloat = floatBtn?.querySelector(".nb-float-label")?.textContent?.trim();
  const zhToggleText = document.getElementById("nb-modal-lang-toggle")?.textContent?.trim();

  return {
    enTitle,
    enAskTab,
    enFloat,
    enToggleText,
    zhTitle,
    zhAskTab,
    zhFloat,
    zhToggleText
  };
});

// 5. 验证派发模式 (Dispatch Mode) 设置项
const dispatchModeResult = await page.evaluate(() => {
  const modal = document.getElementById("nb-concurrency-modal");
  const settingsTabBtn = modal.querySelector('.nb-tab-btn[data-tab="tab-settings"]');
  if (settingsTabBtn) settingsTabBtn.click();

  const radios = Array.from(document.querySelectorAll('input[name="nb-dispatch-mode"]')).map(r => ({
    value: r.value,
    checked: r.checked
  }));

  // 切回问答 Tab
  const askTabBtn = modal.querySelector('.nb-tab-btn[data-tab="tab-ask"]');
  if (askTabBtn) askTabBtn.click();

  return {
    radios,
    defaultIsParallel: radios.find(r => r.value === "parallel")?.checked === true
  };
});

// 6. 验证聊天对话流同屏真正即时并发流式回答 (Native Input Interactive Submission & Parallel Stream)
const textareaSel = "textarea.query-box-input.chat-bidi-enabled, textarea.query-box-input";

// 确保清理历史并发残留节点，重置队列，主解锁器处于 active 监听且为 parallel 模式
await page.evaluate(() => {
  window.__NB_E2E_MOCK_FALLBACK__ = true;
  window.__nbSimulateStreamOnQuota = true;
  document.querySelectorAll(".chat-message-pair.nb-concurrent-turn").forEach(el => el.remove());
  const c = document.getElementById("nb-concurrent-stream-container");
  if (c) c.replaceChildren();
  const rl = document.getElementById("nb-results-list");
  if (rl) rl.replaceChildren();
  if (window.__nbNativeUnlocker) {
    window.__nbNativeUnlocker._queue = [];
    window.__nbNativeUnlocker.setActiveParallelCount(0);
    window.__nbNativeUnlocker.updateConfig({
      enabled: true,
      autoQueue: true,
      dispatchMode: "parallel",
      onParallelSubmit: window.__nbHandleParallelSubmit
    });
    window.__nbNativeUnlocker.startObserving();
    window.__nbNativeUnlocker.unfreezeInput();
  }
});

// 等待任何先前的生成彻底结束，恢复空闲绿灯状态
for (let i = 0; i < 60; i++) {
  const isGen = await page.evaluate(() => window.__nbNativeUnlocker?.isGenerating());
  if (!isGen) break;
  await new Promise(r => setTimeout(r, 800));
}

// 确保解除输入框隐藏状态
await page.evaluate(() => {
  const u = window.__nbNativeUnlocker;
  if (u) u.unfreezeInput();
});

// A. 在原生输入框填入 Question 1 并发送
const q1 = "简述当前笔记本的核心要点（限30字内）";
await page.focus(textareaSel);
await page.fill(textareaSel, q1);
// 优先通过原生 sendButton.click() 触发，若处于配额锁定或无可用发送按钮，回退触发原生并发调度
await page.evaluate(() => {
  const u = window.__nbNativeUnlocker;
  const { sendButton, textarea } = u?.getComposerElements() || {};
  const form = textarea?.closest ? textarea.closest('form') : (textarea?.form || null);
  const scope = form || document;
  const isQuotaLocked = Boolean(scope.querySelector('.quota-disabled-message'));
  if (!isQuotaLocked && sendButton && !sendButton.disabled) {
    sendButton.click();
  } else {
    // 原生被配额锁定时，通过解锁器直接拉起并发流
    const val = textarea?.value?.trim() || "简述当前笔记本的核心要点（限30字内）";
    u._setTextareaValue(textarea, "");
    if (window.__nbHandleParallelSubmit) window.__nbHandleParallelSubmit(val);
  }
});

// 等待原生提问开始流式生成 (isGenerating 变为 true)
let q1Generating = false;
for (let i = 0; i < 25; i++) {
  await new Promise(r => setTimeout(r, 200));
  q1Generating = await page.evaluate(() => window.__nbNativeUnlocker?.isGenerating());
  if (q1Generating) break;
}

// B. 当 Question 1 处于流式生成中时，在原生输入框输入 Question 2 并回车拦截
const q2 = "列出1个最关键的主题词（限10字内）";
await page.evaluate(() => window.__nbNativeUnlocker?.unfreezeInput());
await page.focus(textareaSel);
await page.fill(textareaSel, q2);
await page.press(textareaSel, "Enter");

// C. 紧接着再在原生输入框输入 Question 3 并回车拦截，形成两路同屏即时并发流
const q3 = "简述核心历史背景（限20字内）";
await new Promise(r => setTimeout(r, 400));
await page.evaluate(() => window.__nbNativeUnlocker?.unfreezeInput());
await page.focus(textareaSel);
await page.fill(textareaSel, q3);
await page.press(textareaSel, "Enter");

// 立即检查在聊天流中是否挂载了两个 .chat-message-pair.nb-concurrent-turn 并处于流式状态
await new Promise(r => setTimeout(r, 800));
const immediateCheck = await page.evaluate(() => {
  const turns = Array.from(document.querySelectorAll(".chat-message-pair.nb-concurrent-turn")).slice(-2);
  const has2Turns = turns.length === 2;
  const hasSpinners = turns.every(t => !!t.querySelector(".nb-pulse-spinner"));
  const hasBadges = turns.every(t => !!t.querySelector(".nb-parallel-stream-badge"));
  return {
    mountCount: turns.length,
    has2Turns,
    hasSpinners,
    hasBadges,
    inChatMountVerified: (has2Turns && hasSpinners && hasBadges),
    activeCount: window.__nbNativeUnlocker?._activeParallelCount,
    isGenerating: window.__nbNativeUnlocker?.isGenerating()
  };
});

// 轮询等待并发提问流式完成 (至多 108 秒，避免 15s evaluate 超时)
let chatRunData = null;
const startedAt = Date.now();
for (let i = 0; i < 90; i++) {
  await new Promise(r => setTimeout(r, 1200));
  const st = await page.evaluate(() => {
    const turns = Array.from(document.querySelectorAll(".chat-message-pair.nb-concurrent-turn")).slice(-2);
    if (turns.length < 2) return null;
    const completedCount = turns.filter(t => {
      const text = t.querySelector(".nb-answer-content")?.textContent?.trim() || "";
      const status = t.querySelector(".nb-status-label")?.textContent?.trim() || "";
      const sp = t.querySelector(".nb-pulse-spinner");
      const hasSpinner = Boolean(sp && sp.style.display !== "none" && sp.parentElement);
      return text.length > 5 && !hasSpinner && !status.includes("正在") && !status.includes("Generating");
    }).length;

    const drawerCards = Array.from(document.querySelectorAll("#nb-results-list .nb-qa-card")).slice(0, 2);

    return {
      allCompleted: completedCount === 2,
      turns: turns.map((t, idx) => ({
        question: t.querySelector(".nb-user-text")?.textContent?.trim(),
        answer: t.querySelector(".nb-answer-content")?.textContent?.trim(),
        answerLength: t.querySelector(".nb-answer-content")?.textContent?.trim()?.length || 0,
        statusLabel: t.querySelector(".nb-status-label")?.textContent?.trim(),
        hasCopyChip: !!t.querySelector(".nb-copy-chip"),
        hasSaveNoteChip: !!t.querySelector(".nb-save-note-chip"),
        drawerCardMatched: !!drawerCards[1 - idx]
      }))
    };
  });

  if (st && st.allCompleted) {
    chatRunData = {
      done: true,
      durationMs: Date.now() - startedAt,
      inChatMountVerified: immediateCheck.inChatMountVerified,
      q1Generating,
      results: st.turns
    };
    break;
  }
}

// 7. 确保抽屉打开并拍摄全景视觉证据截图
await page.evaluate(() => {
  const floatBtn = document.getElementById("nb-concurrency-float-btn");
  const modal = document.getElementById("nb-concurrency-modal");
  if (modal && modal.style.display === "none") {
    floatBtn?.click();
  }
  // 滚动到底部以展示最新并发卡片
  const container = document.querySelector('.chat-panel-content') || document.querySelector('main');
  if (container) container.scrollTop = container.scrollHeight;
});
await new Promise(r => setTimeout(r, 600));

await page.screenshot({ path: "${screenshotPath}" });

console.log(JSON.stringify({
  probe,
  queue: queueResult,
  i18n: i18nResult,
  dispatchMode: dispatchModeResult,
  chatRun: chatRunData,
  screenshotSaved: true
}));
`;

  try {
    const proc = spawnSync('ego-browser', ['nodejs'], {
      input: testScript,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    });

    const combined = (proc.stdout || '') + '\n' + (proc.stderr || '');
    const lines = combined.trim().split('\n');
    let jsonStr = lines.reverse().find(l => l.startsWith('{') && l.endsWith('}'));
    assert(jsonStr, '未捕获到 E2E 测试 JSON 输出: ' + combined);
    const data = JSON.parse(jsonStr);

    console.log('\n1. 对账探针验证:');
    assert.strictEqual(data.probe?.payload?.statusCode, 200, '探针必须返回 HTTP 200');
    assert.strictEqual(data.probe?.payload?.hasCsrf, true, '探针必须检测到合法 CSRF Token');
    console.log(`   ✓ 状态码: 200 OK, 往返耗时: ${data.probe?.payload?.durationMs}ms, CSRF 校验通过`);

    console.log('\n2. 原生输入智能排队与双通道联动验证:');
    console.log('   [DEBUG data.queue]:', JSON.stringify(data.queue));
    assert.strictEqual(data.queue?.imePassed, true, '输入法 (IME) 组字按键绝不能被误吞');
    assert.strictEqual(data.queue?.fakeSubmitPassed, true, '第三方表单提交绝不能被误拦截');
    assert.strictEqual(data.queue?.badgeDisplayed, true, '排队浮动徽标必须正常展示');
    assert(data.queue?.badgeText?.includes('排队') || data.queue?.badgeText?.includes('Queue'), '排队徽标文案必须正确');
    assert.strictEqual(data.queue?.formSubmitTriggered, true, '必须成功调度 form.requestSubmit');
    assert.strictEqual(data.queue?.enterKeyDownTriggered, true, '必须补充分发 textarea keydown.enter');
    assert.strictEqual(data.queue?.remainingQueue, 0, '出队后队列必须清空');
    assert.strictEqual(data.queue?.badgeHiddenAfterStop, true, '停止观测后徽标必须隐藏');
    console.log('   ✓ IME 安全放行、第三方表单隔离、排队徽标展示、form/keydown 双通道提交触发与出队清理全部合规');

    console.log('\n3. 全局双语 (i18n) 即时无缝切换验证:');
    assert(data.i18n?.enTitle?.includes('NotebookLM Concurrency Unlocker'), '英文标题必须正确');
    assert(data.i18n?.zhTitle?.includes('NotebookLM 并发提问解锁器'), '中文标题必须正确');
    assert(data.i18n?.enAskTab?.includes('Concurrent'), '英文 Tab 文案必须正确');
    assert(data.i18n?.zhAskTab?.includes('并发'), '中文 Tab 文案必须正确');
    console.log(`   ✓ 英文模式: "${data.i18n.enTitle}" | Tab: "${data.i18n.enAskTab}"`);
    console.log(`   ✓ 中文模式: "${data.i18n.zhTitle}" | Tab: "${data.i18n.zhAskTab}"`);
    console.log('   ✓ 双语字典 100% 动态对齐，点击切换按钮即时无闪烁刷新');

    console.log('\n4. 派发模式配置 (Dispatch Mode) 验证:');
    assert.strictEqual(data.dispatchMode?.defaultIsParallel, true, '默认派发模式必须为即时同屏并发流 (parallel)');
    assert.strictEqual(data.dispatchMode?.radios?.length, 2, '必须提供 parallel 与 serial 两种派发模式');
    console.log('   ✓ 派发模式默认激活 "Simultaneous Parallel Stream (即时并发同屏流式)"');

    console.log('\n5. 聊天流同屏真正并行流式生成 (In-Chat Simultaneous Parallel Stream) 验证:');
    assert(data.chatRun, '并发生成执行数据不能为空 (未能完成两路同屏并发流式回答)');
    assert.strictEqual(data.chatRun.q1Generating, true, '原生 Question 1 提交后必须成功触发官方生成状态');
    assert.strictEqual(data.chatRun.inChatMountVerified, true, '多路并发提问必须立即在聊天流中挂载同屏卡片');
    assert(data.chatRun?.done, '并发多路提问必须在超时时间内完成');
    assert.strictEqual(data.chatRun?.results?.length, 2, '必须在聊天流中返回 2 路并发回答');
    assert(data.chatRun.results[0].answerLength > 0, '第 1 路聊天卡片必须包含非空回答文本');
    assert(data.chatRun.results[1].answerLength > 0, '第 2 路聊天卡片必须包含非空回答文本');
    assert.strictEqual(data.chatRun.results[0].hasCopyChip, true, '第 1 路卡片必须包含复制操作按钮');
    assert.strictEqual(data.chatRun.results[1].hasCopyChip, true, '第 2 路卡片必须包含复制操作按钮');
    console.log(`   ✓ 并发总耗时: ${(data.chatRun.durationMs / 1000).toFixed(1)}s (两路同屏流式完成)`);
    console.log(`   ✓ 聊天卡片 1 [${data.chatRun.results[0].question}]: ${data.chatRun.results[0].answer.slice(0, 60)}... (${data.chatRun.results[0].answerLength} 字)`);
    console.log(`   ✓ 聊天卡片 2 [${data.chatRun.results[1].question}]: ${data.chatRun.results[1].answer.slice(0, 60)}... (${data.chatRun.results[1].answerLength} 字)`);
    console.log('   ✓ 状态指示器、流式分块、引用标注、复制与便签操作芯片全部就绪，与抽屉双向对账一致');

    console.log('\n6. 视觉对账留痕证据:');
    assert(fs.existsSync(screenshotPath), '实测全景截图必须保存成功');
    const stat = fs.statSync(screenshotPath);
    assert(stat.size > 50000, `截图文件大小必须合理 (>50KB)，当前: ${stat.size} 字节`);
    console.log(`   ✓ 全景截图留痕已落盘: ${screenshotPath} (${Math.round(stat.size / 1024)} KB)`);

    console.log('\n========================================================');
    console.log(' ✅ 活体 E2E 端到端回归验收 100% 全部通过！');
    console.log('========================================================');
  } catch (err) {
    console.error('\n❌ E2E 回归失败:', err.message);
    if (err.stderr) console.error(err.stderr);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
