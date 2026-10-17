/**
 * NotebookLM 并发提问解锁器 - Content Script 核心编排器
 * 编排原生输入即时并发流式回答、双语切换 (i18n)、助手抽屉、工作线程池与主世界探针通信
 */

(() => {
  if (window.__NB_CONCURRENCY_CONTENT_LOADED__ && !window.__NB_CONCURRENCY_FORCE_RELOAD__) return;
  window.__NB_CONCURRENCY_CONTENT_LOADED__ = true;

  console.log('[NotebookLM Unlocker] 扩展已成功注入页面');

  // 1. 初始化各模块
  const i18n = window.NBI18n || (typeof I18nManager !== 'undefined' ? new I18nManager() : null);
  const storage = window.NBStorage || (typeof StorageManager !== 'undefined' ? new StorageManager() : null);
  const themeManager = window.NBTheme || (typeof ThemeManager !== 'undefined' ? new ThemeManager() : null);
  const PoolClass = window.ConcurrencyWorkerPool || window.NBWorkerPool || (typeof ConcurrencyWorkerPool !== 'undefined' ? ConcurrencyWorkerPool : null);
  const workerPool = PoolClass ? new PoolClass({ maxWorkers: 5 }) : null;
  const UnlockerClass = window.NativeChatUnlocker || window.NBNativeUnlocker || (typeof NativeChatUnlocker !== 'undefined' ? NativeChatUnlocker : null);
  const nativeUnlocker = UnlockerClass ? new UnlockerClass() : null;

  if (themeManager && typeof themeManager.startObserving === 'function') {
    themeManager.startObserving();
  }

  let activeParallelRequests = 0;
  let floatBtn = null;
  let modal = null;
  let activeTab = 'tab-ask';
  const pendingMessages = new Map();
  let currentSettings = typeof DEFAULT_SETTINGS !== 'undefined' ? { ...DEFAULT_SETTINGS } : {
    maxWorkers: 5,
    dispatchMode: 'parallel',
    unfreezeNativeInput: true,
    autoQueueNative: true,
    showFloatingButton: true,
    language: 'en'
  };

  // Trusted Types 安全策略支持 (针对 Google NotebookLM CSP)
  function getTrustedPolicy() {
    if (window.__nbTrustedPolicy) return window.__nbTrustedPolicy;
    if (typeof window !== 'undefined' && window.trustedTypes && window.trustedTypes.createPolicy) {
      try {
        window.__nbTrustedPolicy = window.trustedTypes.createPolicy('nb-concurrency-policy', {
          createHTML: (s) => s,
          createScriptURL: (s) => s,
          createScript: (s) => s
        });
      } catch (_) {
        try {
          window.__nbTrustedPolicy = window.trustedTypes.defaultPolicy;
        } catch (__) {}
      }
    }
    return window.__nbTrustedPolicy;
  }

  function safeSetHTML(el, html) {
    if (!el) return;
    const policy = getTrustedPolicy();
    if (policy && policy.createHTML) {
      el.innerHTML = policy.createHTML(html);
    } else {
      el.innerHTML = html;
    }
  }

  // 2. 注入 parser 与 inpage 探针到主世界 (在 Manifest V3 world: MAIN 未就绪时的安全降级)
  function injectMainWorldScripts() {
    if (window.__NB_CONCURRENCY_INPAGE_LOADED__) return;
    const scripts = ['lib/parser.js', 'inpage.js'];
    const policy = getTrustedPolicy();
    for (const src of scripts) {
      try {
        const fullUrl = (chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL(src) : src;
        const script = document.createElement('script');
        if (policy && policy.createScriptURL) {
          script.src = policy.createScriptURL(fullUrl);
        } else {
          script.src = fullUrl;
        }
        script.async = false;
        script.onload = () => script.remove();
        (document.head || document.documentElement).appendChild(script);
      } catch (err) {
        console.warn('[NotebookLM Unlocker] 降级探针已通过 world: MAIN 激活', err);
      }
    }
  }
  injectMainWorldScripts();

  // 3. 与 inpage.js 进行跨世界 postMessage 通信封装 (支持分块流式实时回调)
  function postToInPage(type, payload = {}, onChunk = null) {
    return new Promise((resolve) => {
      const messageId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      pendingMessages.set(messageId, { resolve, onChunk });

      window.postMessage({
        type,
        messageId,
        direction: 'to_inpage',
        payload
      }, '*');

      // 180秒超时保护 (适应多来源复杂文档深层流式生成)
      setTimeout(() => {
        if (pendingMessages.has(messageId)) {
          pendingMessages.delete(messageId);
          resolve({ success: false, error: '通信超时 (超过 180 秒)' });
        }
      }, 180000);
    });
  }

  if (window.__nbContentMessageHandler) {
    window.removeEventListener('message', window.__nbContentMessageHandler);
  }
  window.__nbContentMessageHandler = (event) => {
    if (event.source !== window || !event.data || !event.data.messageId) return;
    if (event.data.direction !== 'to_content') return;

    const { type, messageId, payload, success, error } = event.data;

    // 增量流式分块通知
    if (type === 'NB_STREAM_CHUNK') {
      const entry = pendingMessages.get(messageId);
      if (entry && typeof entry.onChunk === 'function') {
        entry.onChunk(payload);
      }
      return;
    }

    // 最终完整响应
    if (type && type.endsWith('_RESPONSE')) {
      const entry = pendingMessages.get(messageId);
      if (entry) {
        pendingMessages.delete(messageId);
        entry.resolve({ success: success !== false, payload, error });
      }
    }
  };
  window.addEventListener('message', window.__nbContentMessageHandler);

  // 停止旧的解锁器监听，防止重复注入产生事件泄漏
  if (window.__nbNativeUnlocker && typeof window.__nbNativeUnlocker.stopObserving === 'function') {
    window.__nbNativeUnlocker.stopObserving();
  }

  // 4. 同步立即初始化原生解锁器 (零延迟接管输入框)，异步持久化配置就绪后自动热同步
  nativeUnlocker.init({
    enabled: currentSettings.unfreezeNativeInput,
    autoQueue: currentSettings.autoQueueNative,
    dispatchMode: currentSettings.dispatchMode || 'parallel',
    onParallelSubmit: handleNativeParallelSubmit
  });
  renderFloatButton(currentSettings.showFloatingButton);

  storage.getSettings().then((settings) => {
    currentSettings = { ...settings };
    if (i18n && settings.language) {
      i18n.setLanguage(settings.language);
    }
    workerPool.setWorkers(settings.maxWorkers || 5);
    nativeUnlocker.updateConfig({
      enabled: settings.unfreezeNativeInput,
      autoQueue: settings.autoQueueNative,
      dispatchMode: settings.dispatchMode || 'parallel',
      onParallelSubmit: handleNativeParallelSubmit
    });
    renderFloatButton(settings.showFloatingButton);
  });

  if (i18n && typeof i18n.onChange === 'function') {
    i18n.onChange(() => {
      applyLanguageToUI();
    });
  }

  // 监听配置实时热更新
  storage.onSettingsChanged((newSettings) => {
    currentSettings = { ...newSettings };
    if (i18n && newSettings.language && newSettings.language !== i18n.getLanguage()) {
      i18n.setLanguage(newSettings.language);
      applyLanguageToUI();
    }
    workerPool.setWorkers(newSettings.maxWorkers || 5);
    nativeUnlocker.updateConfig({
      enabled: newSettings.unfreezeNativeInput,
      autoQueue: newSettings.autoQueueNative,
      dispatchMode: newSettings.dispatchMode || 'parallel',
      onParallelSubmit: handleNativeParallelSubmit
    });
    renderFloatButton(newSettings.showFloatingButton);
    updateDrawerUIWithSettings(newSettings);
  });

  // 并发任务全局登记册 (SSOT，保证抽屉重渲染、语言切换与对话流重锚定时零丢失)
  const concurrentTurnRegistry = window.__nbTurnRegistry || new Map();
  window.__nbTurnRegistry = concurrentTurnRegistry;
  let inChatContainerObserver = null;

  // 5. 原生提问即时同屏并发流式执行核心 (Simultaneous In-Chat Parallel Stream)
  async function handleNativeParallelSubmit(questionText) {
    activeParallelRequests++;
    nativeUnlocker.setActiveParallelCount(activeParallelRequests);

    const taskId = `nb_turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // 记录至全局登记册
    concurrentTurnRegistry.set(taskId, {
      taskId,
      question: questionText,
      answer: '',
      references: [],
      durationSeconds: '',
      status: 'generating'
    });

    // 1. 在原生聊天对话流中立即挂载问题气泡与实时流式回答卡片
    const inChatTurn = createInChatTurn(taskId, questionText);

    // 2. 同时在并发侧边栏抽屉中同步创建/挂载任务卡片
    ensureModal();
    let drawerCard = null;
    if (modal) {
      const listContainer = modal.querySelector('#nb-results-list');
      if (listContainer) {
        drawerCard = createQACard(taskId, questionText);
        listContainer.prepend(drawerCard);
      }
    }

    // 3. 提交至并发线程池执行同源流式提问
    try {
      const env = await postToInPage('NB_GET_AUTH_STATE');
      const notebookId = env.payload?.notebookId || getActiveNotebookId();
      const activeConversationId = env.payload?.activeConversationId || window.__nbActiveConversationId || null;

      const result = await workerPool.submit({
        id: taskId,
        question: questionText,
        executor: async () => {
          const startTime = performance.now();
          const res = await postToInPage('NB_EXECUTE_STREAM_QUERY', {
            question: questionText,
            notebookId,
            sourceIds: env.payload?.sourceIds || [],
            conversationId: activeConversationId
          }, (chunk) => {
            // 更新登记册
            const record = concurrentTurnRegistry.get(taskId);
            if (record) {
              record.answer = chunk.partialAnswer;
              if (chunk.references && chunk.references.length > 0) {
                record.references = chunk.references;
              }
            }
            // 流式分块实时刷新聊天气泡与侧栏抽屉
            updateInChatStreamChunk(inChatTurn, chunk.partialAnswer);
            if (drawerCard) {
              updateCardStreaming(drawerCard, chunk.partialAnswer);
            }
          });

          const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(1);
          if (!res.success) {
            throw new Error(res.error || (i18n ? i18n.t('cardFailed') : '提问异常失败'));
          }

          if (res.payload?.conversationId) {
            window.__nbActiveConversationId = res.payload.conversationId;
          }

          return {
            answer: res.payload.answer,
            references: res.payload.references || [],
            durationSeconds: elapsedSec,
            conversationId: res.payload.conversationId || activeConversationId
          };
        }
      });

      // 登记最终完成态
      const record = concurrentTurnRegistry.get(taskId);
      if (record) {
        record.answer = result.answer;
        record.references = result.references;
        record.durationSeconds = result.durationSeconds;
        record.status = 'completed';
      }

      // 渲染最终完成态
      updateInChatComplete(inChatTurn, result);
      if (drawerCard) {
        updateCardComplete(drawerCard, result);
      }
      allCompletedQA.push({
        question: questionText,
        answer: result.answer,
        duration: result.durationSeconds
      });
      await storage.recordMetric({
        success: true,
        durationMs: Math.round(result.durationSeconds * 1000),
        question: questionText
      });
    } catch (err) {
      const record = concurrentTurnRegistry.get(taskId);
      if (record) {
        record.status = 'error';
        record.error = err.message;
      }
      updateInChatError(inChatTurn, err.message);
      if (drawerCard) {
        updateCardError(drawerCard, err.message);
      }
      await storage.recordMetric({
        success: false,
        durationMs: 0,
        question: questionText,
        error: err.message
      });
    } finally {
      activeParallelRequests = Math.max(0, activeParallelRequests - 1);
      nativeUnlocker.setActiveParallelCount(activeParallelRequests);
    }
  }

  // 暴露调试句柄以供端到端验收与对账观测
  window.__nbHandleParallelSubmit = handleNativeParallelSubmit;
  window.__nbNativeUnlocker = nativeUnlocker;
  window.__nbWorkerPool = workerPool;
  window.__nbI18n = i18n;
  window.__nbTurnRegistry = concurrentTurnRegistry;

  function getChatScrollContainer() {
    return document.querySelector('.chat-panel-content') || 
           document.querySelector('.chat-panel') ||
           document.querySelector('.conversation-container') ||
           document.querySelector('main');
  }

  function scrollToBottom(container) {
    if (!container) return;
    try {
      container.scrollTop = container.scrollHeight;
    } catch (_) {}
  }

  /**
   * 获取或创建持久化聊天并发容器 (确保 Angular Change Detection 与新轮次渲染绝不冲刷并发气泡)
   */
  function getOrCreateConcurrentContainer() {
    const chatScroll = getChatScrollContainer();
    if (!chatScroll) return null;

    let c = chatScroll.querySelector('#nb-concurrent-stream-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'nb-concurrent-stream-container';
      c.className = 'nb-concurrent-stream-container';
      if (themeManager && typeof themeManager.getTheme === 'function') {
        c.setAttribute('data-theme', themeManager.getTheme());
      }
      chatScroll.appendChild(c);
    } else if (c.parentElement !== chatScroll || chatScroll.lastElementChild !== c) {
      // 保持底置重锚定，永远紧跟在最新对话流后方
      if (themeManager && typeof themeManager.getTheme === 'function') {
        c.setAttribute('data-theme', themeManager.getTheme());
      }
      chatScroll.appendChild(c);
    }

    if (!inChatContainerObserver && typeof MutationObserver !== 'undefined') {
      inChatContainerObserver = new MutationObserver(() => {
        const currentScroll = getChatScrollContainer();
        const currentC = currentScroll?.querySelector('#nb-concurrent-stream-container');
        if (currentScroll && currentC && currentScroll.lastElementChild !== currentC) {
          currentScroll.appendChild(currentC);
        }
      });
      inChatContainerObserver.observe(chatScroll, { childList: true });
    }

    return c;
  }

  function createInChatTurn(taskId, questionText) {
    const container = getOrCreateConcurrentContainer() || getChatScrollContainer();
    if (!container) return null;

    let pair = container.querySelector(`[data-task-id="${taskId}"]`);
    if (pair) return pair;

    pair = document.createElement('div');
    pair.className = 'chat-message-pair nb-concurrent-turn';
    pair.id = 'nb-turn-' + taskId;
    pair.setAttribute('data-task-id', taskId);
    if (themeManager && typeof themeManager.getTheme === 'function') {
      pair.setAttribute('data-theme', themeManager.getTheme());
    }

    const generatingText = i18n ? i18n.t('generatingParallel') : '正在并发生成回答...';
    const streamBadgeText = i18n ? i18n.t('parallelStreamBadge') : '并发流';
    const copyText = i18n ? i18n.t('copyAnswer') : '复制回答';
    const saveNoteText = i18n ? i18n.t('saveToNote') : '保存为便签';

    safeSetHTML(pair, `
      <chat-message class="individual-message">
        <div class="from-user-container">
          <mat-card class="mat-mdc-card mdc-card from-user-message-card-content nb-user-bubble">
            <mat-card-content class="mat-mdc-card-content from-user-message-inner-content message-content">
              <div class="message-text-content mat-body-medium nb-user-text">${escapeHtml(questionText)}</div>
            </mat-card-content>
          </mat-card>
        </div>
      </chat-message>
      <chat-message class="individual-message">
        <div class="to-user-container">
          <mat-card class="mat-mdc-card mdc-card to-user-message-card-content nb-model-card">
            <div class="nb-model-status-bar">
              <span class="nb-model-status-indicator">
                <span class="nb-pulse-spinner"></span>
                <span class="nb-status-label">${generatingText}</span>
              </span>
              <span class="nb-parallel-stream-badge">⚡ ${streamBadgeText}</span>
            </div>
            <mat-card-content class="mat-mdc-card-content message-content to-user-message-inner-content">
              <div class="message-text-content mat-body-medium nb-answer-content">
                <span class="nb-streaming-cursor">▍</span>
              </div>
              <div class="nb-model-citations" style="display: none;"></div>
            </mat-card-content>
            <mat-card-actions class="mat-mdc-card-actions mdc-card__actions message-actions nb-model-actions" style="display: none;">
              <button class="nb-action-chip nb-copy-chip">
                <span>📋 ${copyText}</span>
              </button>
              <button class="nb-action-chip nb-save-note-chip">
                <span>📌 ${saveNoteText}</span>
              </button>
              <span class="nb-timing-chip"></span>
            </mat-card-actions>
          </mat-card>
        </div>
      </chat-message>
    `);

    container.appendChild(pair);
    const scrollContainer = getChatScrollContainer();
    if (scrollContainer) scrollToBottom(scrollContainer);
    return pair;
  }

  function updateInChatStreamChunk(pair, partialAnswer) {
    if (!pair) return;
    const answerEl = pair.querySelector('.nb-answer-content');
    if (answerEl && partialAnswer) {
      const formatted = renderMarkdownToHtml(partialAnswer);
      safeSetHTML(answerEl, `${formatted}<span class="nb-streaming-cursor">▍</span>`);
      const container = getChatScrollContainer();
      if (container) scrollToBottom(container);
    }
  }

  function updateInChatComplete(pair, { answer, references, durationSeconds }) {
    if (!pair) return;
    const statusBar = pair.querySelector('.nb-model-status-bar');
    if (statusBar) {
      const spinner = statusBar.querySelector('.nb-pulse-spinner');
      if (spinner) spinner.remove();
      const statusLabel = statusBar.querySelector('.nb-status-label');
      if (statusLabel) {
        statusLabel.textContent = i18n ? i18n.t('cardCompleted', { s: durationSeconds }) : `已完成 · 耗时 ${durationSeconds}s`;
        statusLabel.className = 'nb-status-label completed';
      }
    }

    const answerEl = pair.querySelector('.nb-answer-content');
    if (answerEl) {
      safeSetHTML(answerEl, renderMarkdownToHtml(answer || '未获取到文本回答'));
    }

    if (references && references.length > 0) {
      const citationsEl = pair.querySelector('.nb-model-citations');
      if (citationsEl) {
        safeSetHTML(citationsEl, references.map(r => 
          `<span class="nb-ref-pill" title="${escapeHtml(r.snippet || '')}">[${r.index}] ${escapeHtml(r.title)}</span>`
        ).join(''));
        citationsEl.style.display = 'flex';
      }
    }

    const actionsEl = pair.querySelector('.nb-model-actions');
    if (actionsEl) {
      actionsEl.style.display = 'flex';
      const copyBtn = actionsEl.querySelector('.nb-copy-chip');
      if (copyBtn) {
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(answer);
          const copiedTip = i18n ? i18n.t('copied') : '已复制';
          const defaultTip = i18n ? i18n.t('copyAnswer') : '复制回答';
          copyBtn.textContent = `✓ ${copiedTip}`;
          setTimeout(() => { copyBtn.textContent = `📋 ${defaultTip}`; }, 2000);
        };
      }

      const saveNoteBtn = actionsEl.querySelector('.nb-save-note-chip');
      if (saveNoteBtn) {
        saveNoteBtn.onclick = () => {
          const q = pair.querySelector('.nb-user-text')?.textContent || '';
          const noteText = `## ${q}\n\n${answer}`;
          navigator.clipboard.writeText(noteText);
          const savedTip = i18n ? i18n.t('savedToNote') : '已保存便签';
          const defaultTip = i18n ? i18n.t('saveToNote') : '保存为便签';
          saveNoteBtn.textContent = `✓ ${savedTip}`;

          // 若页面存在原生 "+ Create note" 按钮，顺畅触发创建
          const nativeNoteBtn = document.querySelector('nb-button.add-note-button button, button.add-note-button');
          if (nativeNoteBtn) {
            try { nativeNoteBtn.click(); } catch (_) {}
          }
          setTimeout(() => { saveNoteBtn.textContent = `📌 ${defaultTip}`; }, 2000);
        };
      }

      const timingEl = actionsEl.querySelector('.nb-timing-chip');
      if (timingEl) {
        timingEl.textContent = `${durationSeconds}s`;
      }
    }

    const container = getChatScrollContainer();
    if (container) scrollToBottom(container);
  }

  function updateInChatError(pair, errorMsg) {
    if (!pair) return;
    const statusBar = pair.querySelector('.nb-model-status-bar');
    if (statusBar) {
      const spinner = statusBar.querySelector('.nb-pulse-spinner');
      if (spinner) spinner.remove();
      const statusLabel = statusBar.querySelector('.nb-status-label');
      if (statusLabel) {
        statusLabel.textContent = i18n ? i18n.t('cardFailed') : '提问失败';
        statusLabel.className = 'nb-status-label error';
      }
    }
    const answerEl = pair.querySelector('.nb-answer-content');
    if (answerEl) {
      const prefix = i18n ? i18n.t('errorPrefix') : '错误详情:';
      answerEl.textContent = `${prefix} ${errorMsg}`;
      const isDark = themeManager ? (themeManager.getTheme() === 'dark') : false;
      answerEl.style.color = isDark ? '#f87171' : '#dc2626';
    }
  }

  // 极简高性能 Markdown 渲染器 (支持标题、加粗、斜体、列表、代码块与换行)
  function renderMarkdownToHtml(md) {
    if (!md) return '';
    let html = escapeHtml(md);
    html = html.replace(/```([\s\S]*?)```/g, '<pre class="nb-code-block"><code>$1</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code class="nb-inline-code">$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/^### (.*$)/gim, '<h4 class="nb-answer-h">$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3 class="nb-answer-h">$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2 class="nb-answer-h">$1</h2>');
    html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li class="nb-answer-li">• $1</li>');
    html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li class="nb-answer-li"><span class="nb-li-num">$1.</span> $2</li>');
    html = html.replace(/\n\n+/g, '<br><br>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function getActiveNotebookId() {
    const match = window.location.pathname.match(/\/notebook\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  // 6. 渲染悬浮入口按钮
  function renderFloatButton(visible = true) {
    if (!visible) {
      const existing = document.getElementById('nb-concurrency-float-btn');
      if (existing) existing.style.display = 'none';
      return;
    }

    floatBtn = document.getElementById('nb-concurrency-float-btn');
    const label = i18n ? i18n.t('floatBtnText') : '并发问答';
    const unit = i18n ? (i18n.getLanguage() === 'zh' ? '路' : 'w') : '路';

    if (!floatBtn) {
      floatBtn = document.createElement('div');
      floatBtn.id = 'nb-concurrency-float-btn';
      if (themeManager && typeof themeManager.getTheme === 'function') {
        floatBtn.setAttribute('data-theme', themeManager.getTheme());
      }
      safeSetHTML(floatBtn, `
        <span class="nb-float-label">⚡ ${label}</span>
        <span class="nb-btn-badge" id="nb-float-worker-badge">${workerPool.maxWorkers}${unit}</span>
      `);
      floatBtn.onclick = toggleModal;
      (document.body || document.documentElement).appendChild(floatBtn);
    } else {
      floatBtn.style.display = 'flex';
      if (themeManager && typeof themeManager.getTheme === 'function') {
        floatBtn.setAttribute('data-theme', themeManager.getTheme());
      }
      floatBtn.onclick = toggleModal;
      const labelEl = floatBtn.querySelector('.nb-float-label');
      if (labelEl) labelEl.textContent = `⚡ ${label}`;
      const badge = floatBtn.querySelector('#nb-float-worker-badge');
      if (badge) badge.textContent = `${workerPool.maxWorkers}${unit}`;
    }
  }

  // 7. 渲染并发助手主抽屉面板 (全双语 i18n 与设置派发模式支持)
  function ensureModal() {
    if (modal && document.body.contains(modal)) return modal;
    const existing = document.getElementById('nb-concurrency-modal');
    if (existing) {
      modal = existing;
      if (themeManager && typeof themeManager.getTheme === 'function') {
        modal.setAttribute('data-theme', themeManager.getTheme());
      }
      renderModalContent();
      bindModalEvents();
      return modal;
    }

    modal = document.createElement('div');
    modal.id = 'nb-concurrency-modal';
    if (themeManager && typeof themeManager.getTheme === 'function') {
      modal.setAttribute('data-theme', themeManager.getTheme());
    }
    modal.style.display = 'none';

    renderModalContent();
    document.body.appendChild(modal);
    bindModalEvents();
    return modal;
  }

  function renderModalContent() {
    if (!modal) return;
    const t = (k, p) => (i18n ? i18n.t(k, p) : k);
    const isParallel = (currentSettings.dispatchMode || 'parallel') === 'parallel';
    const currentLang = i18n ? i18n.getLanguage() : 'en';

    safeSetHTML(modal, `
      <div class="nb-panel-header">
        <div class="nb-header-left">
          <span class="nb-header-title">${t('headerTitle')}</span>
          <span class="nb-header-tag" id="nb-header-status-tag">${workerPool.maxWorkers} ${t('headerTagSuffix')}</span>
        </div>
        <div class="nb-header-actions">
          <button class="nb-lang-toggle-btn" id="nb-modal-lang-toggle" title="Switch Language">${t('langSwitchBtn')}</button>
          <button class="nb-icon-btn" id="nb-modal-minimize" title="最小化">−</button>
          <button class="nb-icon-btn" id="nb-modal-close" title="关闭">✕</button>
        </div>
      </div>

      <div class="nb-panel-tabs">
        <button class="nb-tab-btn ${activeTab === 'tab-ask' ? 'active' : ''}" data-tab="tab-ask">${t('tabAsk')}</button>
        <button class="nb-tab-btn ${activeTab === 'tab-settings' ? 'active' : ''}" data-tab="tab-settings">${t('tabSettings')}</button>
        <button class="nb-tab-btn ${activeTab === 'tab-diagnostics' ? 'active' : ''}" data-tab="tab-diagnostics">${t('tabDiagnostics')}</button>
      </div>

      <div class="nb-panel-body">
        <!-- 视图 1: 并发提问 -->
        <div class="nb-tab-view ${activeTab === 'tab-ask' ? 'active' : ''}" id="tab-ask">
          <div class="nb-concurrency-control-bar">
            <div class="nb-control-label">
              <span>${t('workerControlLabel')}</span>
            </div>
            <div class="nb-worker-slider-wrapper">
              <input type="range" class="nb-worker-slider" id="nb-ask-worker-slider" min="1" max="7" value="${workerPool.maxWorkers}" />
              <span class="nb-worker-val-badge" id="nb-ask-worker-val">${workerPool.maxWorkers}</span>
            </div>
          </div>

          <div>
            <textarea class="nb-textarea-box" id="nb-batch-input" placeholder="${t('batchInputPlaceholder')}"></textarea>
            <div class="nb-input-hint">
              <span>${t('batchInputHint')}</span>
              <span id="nb-question-count-hint">0 ${t('threads')}</span>
            </div>
          </div>

          <div class="nb-action-row">
            <button class="nb-btn-primary" id="nb-start-concurrent-btn">
              <span>${t('startConcurrentBtn')}</span>
            </button>
            <button class="nb-btn-secondary" id="nb-export-markdown-btn" title="导出已生成的全部问答">
              <span>${t('exportMarkdownBtn')}</span>
            </button>
            <button class="nb-btn-secondary" id="nb-clear-cards-btn" title="清空卡片列表">
              <span>${t('clearCardsBtn')}</span>
            </button>
          </div>

          <div class="nb-cards-container" id="nb-results-list">
            <!-- 提问结果卡片动态插入至此 -->
          </div>
        </div>

        <!-- 视图 2: 规则配置 -->
        <div class="nb-tab-view ${activeTab === 'tab-settings' ? 'active' : ''}" id="tab-settings">
          <div class="nb-setting-item" style="flex-direction: column; align-items: flex-start; gap: 10px;">
            <div class="nb-setting-text">
              <span class="nb-setting-title">${t('dispatchModeTitle')}</span>
              <span class="nb-setting-desc">${t('dispatchModeDesc')}</span>
            </div>
            <div class="nb-mode-group">
              <label class="nb-mode-option ${isParallel ? 'selected' : ''}" id="nb-mode-opt-parallel">
                <input type="radio" name="nb-dispatch-mode" class="nb-mode-radio" value="parallel" ${isParallel ? 'checked' : ''} />
                <div class="nb-mode-text">
                  <span class="nb-mode-label">${t('modeParallelLabel')}</span>
                  <span class="nb-mode-sub">${t('modeParallelDesc')}</span>
                </div>
              </label>
              <label class="nb-mode-option ${!isParallel ? 'selected' : ''}" id="nb-mode-opt-serial">
                <input type="radio" name="nb-dispatch-mode" class="nb-mode-radio" value="serial" ${!isParallel ? 'checked' : ''} />
                <div class="nb-mode-text">
                  <span class="nb-mode-label">${t('modeSerialLabel')}</span>
                  <span class="nb-mode-sub">${t('modeSerialDesc')}</span>
                </div>
              </label>
            </div>
          </div>

          <div class="nb-setting-item">
            <div class="nb-setting-text">
              <span class="nb-setting-title">${t('maxWorkersTitle')}</span>
              <span class="nb-setting-desc">${t('maxWorkersDesc')}</span>
            </div>
            <div class="nb-worker-slider-wrapper">
              <input type="range" class="nb-worker-slider" id="nb-setting-workers-slider" min="1" max="7" value="${workerPool.maxWorkers}" />
              <span class="nb-worker-val-badge" id="nb-setting-workers-val">${workerPool.maxWorkers}</span>
            </div>
          </div>

          <div class="nb-setting-item">
            <div class="nb-setting-text">
              <span class="nb-setting-title">${t('unfreezeTitle')}</span>
              <span class="nb-setting-desc">${t('unfreezeDesc')}</span>
            </div>
            <label class="nb-switch">
              <input type="checkbox" id="nb-setting-unfreeze-input" ${currentSettings.unfreezeNativeInput ? 'checked' : ''} />
              <span class="nb-slider"></span>
            </label>
          </div>

          <div class="nb-setting-item">
            <div class="nb-setting-text">
              <span class="nb-setting-title">${t('autoQueueTitle')}</span>
              <span class="nb-setting-desc">${t('autoQueueDesc')}</span>
            </div>
            <label class="nb-switch">
              <input type="checkbox" id="nb-setting-auto-queue" ${currentSettings.autoQueueNative ? 'checked' : ''} />
              <span class="nb-slider"></span>
            </label>
          </div>

          <div class="nb-setting-item">
            <div class="nb-setting-text">
              <span class="nb-setting-title">${t('showFloatTitle')}</span>
              <span class="nb-setting-desc">${t('showFloatDesc')}</span>
            </div>
            <label class="nb-switch">
              <input type="checkbox" id="nb-setting-show-float" ${currentSettings.showFloatingButton ? 'checked' : ''} />
              <span class="nb-slider"></span>
            </label>
          </div>

          <div class="nb-setting-item">
            <div class="nb-setting-text">
              <span class="nb-setting-title">${t('languageTitle')}</span>
              <span class="nb-setting-desc">${t('languageDesc')}</span>
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="nb-action-chip ${currentLang === 'en' ? 'selected' : ''}" id="nb-btn-lang-en" style="${currentLang === 'en' ? 'background: #0284c7; color: white;' : ''}">English</button>
              <button class="nb-action-chip ${currentLang === 'zh' ? 'selected' : ''}" id="nb-btn-lang-zh" style="${currentLang === 'zh' ? 'background: #0284c7; color: white;' : ''}">简体中文</button>
            </div>
          </div>
        </div>

        <!-- 视图 3: 对账器与自检 -->
        <div class="nb-tab-view ${activeTab === 'tab-diagnostics' ? 'active' : ''}" id="tab-diagnostics">
          <div class="nb-diagnostic-box">
            <div class="nb-diag-row">
              <span class="nb-diag-key">${t('diagNotebookId')}</span>
              <span class="nb-diag-val" id="nb-diag-nb-id">${t('statusDetecting')}</span>
            </div>
            <div class="nb-diag-row">
              <span class="nb-diag-key">${t('diagCsrfToken')}</span>
              <span class="nb-diag-val" id="nb-diag-csrf">${t('statusDetecting')}</span>
            </div>
            <div class="nb-diag-row">
              <span class="nb-diag-key">${t('diagSessionId')}</span>
              <span class="nb-diag-val" id="nb-diag-sid">${t('statusDetecting')}</span>
            </div>
            <div class="nb-diag-row">
              <span class="nb-diag-key">${t('diagSourcesCount')}</span>
              <span class="nb-diag-val" id="nb-diag-sources">0</span>
            </div>
            <div class="nb-diag-row">
              <span class="nb-diag-key">${t('diagWorkerStatus')}</span>
              <span class="nb-diag-val healthy" id="nb-diag-worker-status">${t('statusIdle')}</span>
            </div>
          </div>

          <div class="nb-action-row">
            <button class="nb-btn-primary" id="nb-run-probe-btn">
              <span>${t('diagRunProbeBtn')}</span>
            </button>
            <button class="nb-btn-secondary" id="nb-refresh-diag-btn">
              <span>${t('diagRefreshBtn')}</span>
            </button>
          </div>

          <div class="nb-diagnostic-box" id="nb-probe-result-box" style="display: none;">
            <div class="nb-diag-row">
              <span class="nb-diag-key">${t('diagProbeStatus')}</span>
              <span class="nb-diag-val" id="nb-probe-http-status">-</span>
            </div>
            <div class="nb-diag-row">
              <span class="nb-diag-key">${t('diagProbeRtt')}</span>
              <span class="nb-diag-val" id="nb-probe-rtt">-</span>
            </div>
            <div class="nb-diag-row">
              <span class="nb-diag-key">${t('diagProbeBytes')}</span>
              <span class="nb-diag-val" id="nb-probe-bytes">-</span>
            </div>
            <div class="nb-diag-row">
              <span class="nb-diag-key">${t('diagProbePreview')}</span>
              <span class="nb-diag-val" id="nb-probe-preview">-</span>
            </div>
          </div>

          <div class="nb-diagnostic-box">
            <div class="nb-diag-row">
              <span class="nb-diag-key">${t('diagTotalQueries')}</span>
              <span class="nb-diag-val" id="nb-telemetry-total">0</span>
            </div>
            <div class="nb-diag-row">
              <span class="nb-diag-key">${t('diagSuccessRate')}</span>
              <span class="nb-diag-val healthy" id="nb-telemetry-rate">100%</span>
            </div>
            <div class="nb-diag-row">
              <span class="nb-diag-key">${t('diagAvgTime')}</span>
              <span class="nb-diag-val" id="nb-telemetry-avg">0s</span>
            </div>
          </div>
        </div>
      </div>
    `);

    // 恢复全局登记册中的全部并发卡片 (防抽屉重渲染或语言切换冲刷卡片)
    const listContainer = modal.querySelector('#nb-results-list');
    if (listContainer) {
      for (const [taskId, record] of Array.from(concurrentTurnRegistry.entries()).reverse()) {
        const card = createQACard(taskId, record.question);
        if (record.status === 'completed') {
          updateCardComplete(card, record);
        } else if (record.status === 'error') {
          updateCardError(card, record.error);
        } else if (record.answer) {
          updateCardStreaming(card, record.answer);
        }
        listContainer.appendChild(card);
      }
    }
  }

  function applyLanguageToUI() {
    renderFloatButton(currentSettings.showFloatingButton);
    const m = modal || document.getElementById('nb-concurrency-modal');
    if (m) {
      modal = m;
      renderModalContent();
      bindModalEvents();
      if (activeTab === 'tab-diagnostics') {
        refreshDiagnostics();
      }
    }
    if (nativeUnlocker) nativeUnlocker.updateBadge();
  }

  window.__nbApplyLanguageToUI = applyLanguageToUI;

  function toggleModal() {
    const el = ensureModal();
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) {
      refreshDiagnostics();
    }
  }

  function bindModalEvents() {
    if (!modal) return;

    // 最小化与关闭
    modal.querySelector('#nb-modal-close').onclick = () => { modal.style.display = 'none'; };
    modal.querySelector('#nb-modal-minimize').onclick = () => { modal.style.display = 'none'; };

    // 一键中英文切换
    const langBtn = modal.querySelector('#nb-modal-lang-toggle');
    if (langBtn) {
      langBtn.onclick = () => {
        const nextLang = i18n.getLanguage() === 'zh' ? 'en' : 'zh';
        i18n.setLanguage(nextLang);
        storage.updateSettings({ language: nextLang });
        applyLanguageToUI();
      };
    }

    // 设置页语言切换按钮
    const btnEn = modal.querySelector('#nb-btn-lang-en');
    const btnZh = modal.querySelector('#nb-btn-lang-zh');
    if (btnEn) {
      btnEn.onclick = () => {
        i18n.setLanguage('en');
        storage.updateSettings({ language: 'en' });
        applyLanguageToUI();
      };
    }
    if (btnZh) {
      btnZh.onclick = () => {
        i18n.setLanguage('zh');
        storage.updateSettings({ language: 'zh' });
        applyLanguageToUI();
      };
    }

    // Tabs 切换
    const tabBtns = modal.querySelectorAll('.nb-tab-btn');
    tabBtns.forEach((btn) => {
      btn.onclick = () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeTab = btn.getAttribute('data-tab');

        modal.querySelectorAll('.nb-tab-view').forEach(v => v.classList.remove('active'));
        const targetView = modal.querySelector(`#${activeTab}`);
        if (targetView) targetView.classList.add('active');

        if (activeTab === 'tab-diagnostics') {
          refreshDiagnostics();
        }
      };
    });

    // 提问输入框字数与题目数监听
    const textarea = modal.querySelector('#nb-batch-input');
    const hint = modal.querySelector('#nb-question-count-hint');
    if (textarea && hint) {
      textarea.oninput = () => {
        const questions = parseQuestionsFromText(textarea.value);
        hint.textContent = i18n ? i18n.t('questionCount', { n: questions.length }) : `${questions.length} 个问题`;
      };
    }

    // 并发数滑块 (提问页与设置页联动)
    const askSlider = modal.querySelector('#nb-ask-worker-slider');
    const askVal = modal.querySelector('#nb-ask-worker-val');
    const settingSlider = modal.querySelector('#nb-setting-workers-slider');
    const settingVal = modal.querySelector('#nb-setting-workers-val');

    function syncWorkers(val) {
      const count = parseInt(val, 10) || 5;
      if (askSlider) askSlider.value = count;
      if (askVal) askVal.textContent = count;
      if (settingSlider) settingSlider.value = count;
      if (settingVal) settingVal.textContent = count;

      const suffix = i18n ? i18n.t('headerTagSuffix') : '线程并发';
      modal.querySelector('#nb-header-status-tag').textContent = `${count} ${suffix}`;
      workerPool.setWorkers(count);
      storage.updateSettings({ maxWorkers: count });
      renderFloatButton(currentSettings.showFloatingButton);
    }

    if (askSlider) askSlider.oninput = (e) => syncWorkers(e.target.value);
    if (settingSlider) settingSlider.oninput = (e) => syncWorkers(e.target.value);

    // 派发模式选择器切换
    const optParallel = modal.querySelector('#nb-mode-opt-parallel');
    const optSerial = modal.querySelector('#nb-mode-opt-serial');
    function selectDispatchMode(mode) {
      currentSettings.dispatchMode = mode;
      storage.updateSettings({ dispatchMode: mode });
      nativeUnlocker.updateConfig({ dispatchMode: mode });
      if (optParallel && optSerial) {
        if (mode === 'parallel') {
          optParallel.classList.add('selected');
          optSerial.classList.remove('selected');
          optParallel.querySelector('input').checked = true;
        } else {
          optSerial.classList.add('selected');
          optParallel.classList.remove('selected');
          optSerial.querySelector('input').checked = true;
        }
      }
    }

    if (optParallel) optParallel.onclick = () => selectDispatchMode('parallel');
    if (optSerial) optSerial.onclick = () => selectDispatchMode('serial');

    // 设置开关监听
    modal.querySelector('#nb-setting-unfreeze-input').onchange = (e) => {
      storage.updateSettings({ unfreezeNativeInput: e.target.checked });
    };
    modal.querySelector('#nb-setting-auto-queue').onchange = (e) => {
      storage.updateSettings({ autoQueueNative: e.target.checked });
    };
    modal.querySelector('#nb-setting-show-float').onchange = (e) => {
      storage.updateSettings({ showFloatingButton: e.target.checked });
    };

    // 并发提问触发按钮
    modal.querySelector('#nb-start-concurrent-btn').onclick = handleStartConcurrentAsk;

    // 清空结果按钮
    modal.querySelector('#nb-clear-cards-btn').onclick = () => {
      safeSetHTML(modal.querySelector('#nb-results-list'), '');
      allCompletedQA = [];
    };

    // 导出 Markdown 按钮
    modal.querySelector('#nb-export-markdown-btn').onclick = handleExportMarkdown;

    // 诊断自检按钮
    modal.querySelector('#nb-run-probe-btn').onclick = handleRunDiagnosticProbe;
    modal.querySelector('#nb-refresh-diag-btn').onclick = refreshDiagnostics;
  }

  function updateDrawerUIWithSettings(settings) {
    if (!modal) return;
    const askSlider = modal.querySelector('#nb-ask-worker-slider');
    const askVal = modal.querySelector('#nb-ask-worker-val');
    const settingSlider = modal.querySelector('#nb-setting-workers-slider');
    const settingVal = modal.querySelector('#nb-setting-workers-val');

    const count = settings.maxWorkers || 5;
    if (askSlider) askSlider.value = count;
    if (askVal) askVal.textContent = count;
    if (settingSlider) settingSlider.value = count;
    if (settingVal) settingVal.textContent = count;

    const suffix = i18n ? i18n.t('headerTagSuffix') : '线程并发';
    modal.querySelector('#nb-header-status-tag').textContent = `${count} ${suffix}`;
    modal.querySelector('#nb-setting-unfreeze-input').checked = Boolean(settings.unfreezeNativeInput);
    modal.querySelector('#nb-setting-auto-queue').checked = Boolean(settings.autoQueueNative);
    modal.querySelector('#nb-setting-show-float').checked = Boolean(settings.showFloatingButton);
  }

  function parseQuestionsFromText(text) {
    if (typeof StreamingChatParser !== 'undefined' && StreamingChatParser.parseQuestionsFromText) {
      return StreamingChatParser.parseQuestionsFromText(text);
    }
    if (!text || !text.trim()) return [];
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.replace(/^\s*(?:\d+[\.、．\)\]]|[-*•])\s*/, '').trim())
      .filter(line => line.length > 0);
  }

  let allCompletedQA = [];

  /**
   * 侧边栏批量并发提问调度
   */
  async function handleStartConcurrentAsk() {
    const textarea = modal.querySelector('#nb-batch-input');
    const questions = parseQuestionsFromText(textarea.value);

    if (questions.length === 0) {
      alert(i18n ? (i18n.getLanguage() === 'zh' ? '请先输入至少一个问题' : 'Please enter at least one question') : '请先输入至少一个问题');
      return;
    }

    const startBtn = modal.querySelector('#nb-start-concurrent-btn');
    startBtn.disabled = true;

    const env = await postToInPage('NB_GET_AUTH_STATE');
    if (!env.payload?.notebookId) {
      alert(i18n ? (i18n.getLanguage() === 'zh' ? '未检测到当前 NotebookLM 笔记本 ID，请确认当前处于某一本笔记本页面内。' : 'Active notebook ID not detected. Please make sure you are inside a notebook page.') : '未检测到当前 NotebookLM 笔记本 ID');
      startBtn.disabled = false;
      return;
    }

    const listContainer = modal.querySelector('#nb-results-list');

    const tasks = questions.map((q, idx) => {
      const taskId = `task_${Date.now()}_${idx}`;
      const card = createQACard(taskId, q);
      listContainer.prepend(card);

      // 若启用了即时同屏并发流，同时也挂载到页面主聊天流内
      let inChatTurn = null;
      if ((currentSettings.dispatchMode || 'parallel') === 'parallel') {
        inChatTurn = createInChatTurn(taskId, q);
      }

      return {
        id: taskId,
        question: q,
        card,
        executor: async () => {
          updateCardStatus(card, 'generating', i18n ? i18n.t('cardGenerating') : '并发生成中...');
          const startTime = performance.now();

          const res = await postToInPage('NB_EXECUTE_STREAM_QUERY', {
            question: q,
            notebookId: env.payload.notebookId,
            sourceIds: env.payload.sourceIds
          }, (chunk) => {
            if (inChatTurn) {
              updateInChatStreamChunk(inChatTurn, chunk.partialAnswer);
            }
            updateCardStreaming(card, chunk.partialAnswer);
          });

          const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(1);

          if (!res.success) {
            throw new Error(res.error || (i18n ? i18n.t('cardFailed') : '提问异常失败'));
          }

          return {
            answer: res.payload.answer,
            references: res.payload.references || [],
            durationSeconds: elapsedSec,
            inChatTurn
          };
        }
      };
    });

    const promises = tasks.map(async (task) => {
      try {
        const result = await workerPool.submit(task);
        updateCardComplete(task.card, result);
        if (result.inChatTurn) {
          updateInChatComplete(result.inChatTurn, result);
        }
        allCompletedQA.push({
          question: task.question,
          answer: result.answer,
          duration: result.durationSeconds
        });
        await storage.recordMetric({
          success: true,
          durationMs: Math.round(result.durationSeconds * 1000),
          question: task.question
        });
      } catch (err) {
        updateCardError(task.card, err.message);
        await storage.recordMetric({
          success: false,
          durationMs: 0,
          question: task.question,
          error: err.message
        });
      }
    });

    await Promise.allSettled(promises);
    startBtn.disabled = false;
  }

  function createQACard(taskId, question) {
    const card = document.createElement('div');
    card.className = 'nb-qa-card';
    card.id = 'nb-drawer-' + taskId;
    card.setAttribute('data-task-id', taskId);
    const queuedText = i18n ? i18n.t('cardQueued') : '排队中';
    const copyText = i18n ? i18n.t('copyAnswer') : '复制回答';
    const sendText = i18n ? i18n.t('sendToNative') : '送入原生输入框';

    safeSetHTML(card, `
      <div class="nb-card-header">
        <div class="nb-card-question">${escapeHtml(question)}</div>
        <div class="nb-card-status queued">${queuedText}</div>
      </div>
      <div class="nb-card-body" style="display:none;"></div>
      <div class="nb-card-refs" style="display:none;"></div>
      <div class="nb-card-actions" style="display:none;">
        <button class="nb-card-btn copy-btn">📋 ${copyText}</button>
        <button class="nb-card-btn send-native-btn">💬 ${sendText}</button>
      </div>
    `);
    return card;
  }

  function updateCardStatus(card, statusClass, text) {
    const statusEl = card.querySelector('.nb-card-status');
    statusEl.className = `nb-card-status ${statusClass}`;
    statusEl.textContent = text;
    card.className = `nb-qa-card status-${statusClass}`;
  }

  function updateCardStreaming(card, partialAnswer) {
    if (!card || !partialAnswer) return;
    const bodyEl = card.querySelector('.nb-card-body');
    if (bodyEl) {
      bodyEl.textContent = partialAnswer.slice(-300);
      bodyEl.style.display = 'block';
    }
  }

  function updateCardComplete(card, { answer, references, durationSeconds }) {
    const completeText = i18n ? i18n.t('cardCompleted', { s: durationSeconds }) : `已完成 · 耗时 ${durationSeconds}s`;
    updateCardStatus(card, 'completed', completeText);
    const bodyEl = card.querySelector('.nb-card-body');
    bodyEl.textContent = answer || '未获取到文本回答';
    bodyEl.style.display = 'block';

    const actionsEl = card.querySelector('.nb-card-actions');
    actionsEl.style.display = 'flex';

    // 复制按钮
    actionsEl.querySelector('.copy-btn').onclick = () => {
      navigator.clipboard.writeText(answer);
      alert(i18n ? i18n.t('copySuccess') : '已成功复制回答内容至剪贴板');
    };

    // 送入原生输入框
    actionsEl.querySelector('.send-native-btn').onclick = () => {
      const q = card.querySelector('.nb-card-question').textContent;
      const { textarea } = nativeUnlocker.getComposerElements();
      if (textarea) {
        nativeUnlocker._setTextareaValue(textarea, q);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
        modal.style.display = 'none';
      }
    };

    // 渲染引用标签
    if (references && references.length > 0) {
      const refsEl = card.querySelector('.nb-card-refs');
      safeSetHTML(refsEl, references.map(r => `<span class="nb-ref-tag" title="${escapeHtml(r.snippet || '')}">[${r.index}] ${escapeHtml(r.title)}</span>`).join(''));
      refsEl.style.display = 'flex';
    }
  }

  function updateCardError(card, errorMsg) {
    updateCardStatus(card, 'error', i18n ? i18n.t('cardFailed') : '提问失败');
    const bodyEl = card.querySelector('.nb-card-body');
    const prefix = i18n ? i18n.t('errorPrefix') : '错误详情:';
    bodyEl.textContent = `${prefix} ${errorMsg}`;
    const isDark = themeManager ? (themeManager.getTheme() === 'dark') : false;
    bodyEl.style.color = isDark ? '#f87171' : '#dc2626';
    bodyEl.style.display = 'block';
  }

  function handleExportMarkdown() {
    if (allCompletedQA.length === 0) {
      alert(i18n ? i18n.t('noCardsToExport') : '暂无已生成的问答记录可导出');
      return;
    }

    const title = i18n ? i18n.t('exportHeaderTitle') : 'NotebookLM 并发问答汇总报告';
    const timeLabel = i18n ? i18n.t('exportExportTime') : '导出时间:';
    const workerLabel = i18n ? i18n.t('exportWorkers') : '并发执行数:';

    let md = `# ${title}\n\n${timeLabel} ${new Date().toLocaleString()}\n${workerLabel} ${workerPool.maxWorkers}\n\n---\n\n`;
    allCompletedQA.forEach((qa, idx) => {
      md += `### ${idx + 1}. ${qa.question}\n\n> 耗时: ${qa.duration}s\n\n${qa.answer}\n\n---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notebooklm-qa-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 诊断对账器刷新与执行
   */
  async function refreshDiagnostics() {
    if (!modal) return;
    const res = await postToInPage('NB_GET_AUTH_STATE');
    const env = res.payload || {};

    const nbIdEl = modal.querySelector('#nb-diag-nb-id');
    const csrfEl = modal.querySelector('#nb-diag-csrf');
    const sidEl = modal.querySelector('#nb-diag-sid');
    const sourcesEl = modal.querySelector('#nb-diag-sources');
    const workerStatusEl = modal.querySelector('#nb-diag-worker-status');

    if (nbIdEl) nbIdEl.textContent = env.notebookId || (i18n ? (i18n.getLanguage() === 'zh' ? '未进入具体笔记本' : 'No notebook active') : '未进入具体笔记本');
    if (csrfEl) {
      csrfEl.textContent = env.csrfToken;
      csrfEl.className = env.hasFullCsrf ? 'nb-diag-val healthy' : 'nb-diag-val warn';
    }
    if (sidEl) sidEl.textContent = env.sessionId;
    if (sourcesEl) sourcesEl.textContent = `${env.sourceCount || 0}`;

    if (workerStatusEl) {
      const activeText = i18n ? i18n.t('statusActive', {
        active: workerPool.activeCount,
        queue: workerPool.queueDepth,
        max: workerPool.maxWorkers
      }) : `活跃: ${workerPool.activeCount} / 队列: ${workerPool.queueDepth} / 最大并发: ${workerPool.maxWorkers}`;
      workerStatusEl.textContent = activeText;
    }

    // 刷新遥测指标
    const telemetry = await storage.getTelemetry();
    const totalEl = modal.querySelector('#nb-telemetry-total');
    const rateEl = modal.querySelector('#nb-telemetry-rate');
    const avgEl = modal.querySelector('#nb-telemetry-avg');

    if (totalEl) totalEl.textContent = `${telemetry.totalQueries}`;
    if (rateEl) {
      const rate = telemetry.totalQueries > 0 ? Math.round((telemetry.successQueries / telemetry.totalQueries) * 100) : 100;
      rateEl.textContent = `${rate}%`;
    }
    if (avgEl) {
      avgEl.textContent = `${((telemetry.avgResponseTimeMs || 0) / 1000).toFixed(1)}s`;
    }
  }

  async function handleRunDiagnosticProbe() {
    const probeBtn = modal.querySelector('#nb-run-probe-btn');
    probeBtn.disabled = true;
    probeBtn.textContent = i18n ? i18n.t('statusProbeRunning') : '探测执行中...';

    const resultBox = modal.querySelector('#nb-probe-result-box');
    resultBox.style.display = 'flex';

    try {
      const res = await postToInPage('NB_RUN_DIAGNOSTIC_PROBE');
      if (res.success && res.payload) {
        modal.querySelector('#nb-probe-http-status').textContent = `${res.payload.statusCode} OK`;
        modal.querySelector('#nb-probe-http-status').className = 'nb-diag-val healthy';
        modal.querySelector('#nb-probe-rtt').textContent = `${res.payload.durationMs}ms`;
        modal.querySelector('#nb-probe-bytes').textContent = `${res.payload.bytesReceived} B`;
        modal.querySelector('#nb-probe-preview').textContent = res.payload.answerPreview || (i18n ? i18n.t('statusProbeSuccess') : 'Google 流式 RPC 连通正常');
      } else {
        modal.querySelector('#nb-probe-http-status').textContent = `FAIL: ${res.error || 'No response'}`;
        modal.querySelector('#nb-probe-http-status').className = 'nb-diag-val warn';
      }
    } catch (e) {
      modal.querySelector('#nb-probe-http-status').textContent = `ERR: ${e.message}`;
    } finally {
      probeBtn.disabled = false;
      probeBtn.textContent = i18n ? i18n.t('diagRunProbeBtn') : '🩺 发起连通性对账探测';
      refreshDiagnostics();
    }
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
