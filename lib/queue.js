/**
 * NotebookLM 并发提问解锁器 - 原生输入解锁与智能排队器 (Native Queue & Unfreeze)
 * 职责：
 * 1. 持续解除 NotebookLM 底部输入框在生成期间的 disabled/锁死状态，让用户随时可继续打字
 * 2. 在已有生成进行中时，拦截后续回车/点击发送，加入顺序排队队列
 * 3. 待上一题生成完毕后，零延迟自动投递下一题并触发提交
 */

class NativeChatUnlocker {
  constructor() {
    this._queue = [];
    this._isMonitoring = false;
    this._isDispatching = false;
    this._awaitingGeneration = false;
    this._dispatchCooldownTimer = null;
    this._observer = null;
    this._unfreezeTimer = null;
    this._floatingBadge = null;
    this._enabled = true;
    this._autoQueue = true;
    this._dispatchMode = 'parallel';
    this._onParallelSubmit = null;
    this._activeParallelCount = 0;
    this._boundKeyDown = this._handleKeyDown.bind(this);
    this._boundFormSubmit = this._handleFormSubmit.bind(this);
    this._boundButtonClick = this._handleButtonClick.bind(this);
  }

  init({ enabled = true, autoQueue = true, dispatchMode = 'parallel', onParallelSubmit = null } = {}) {
    this._enabled = enabled;
    this._autoQueue = autoQueue;
    this._dispatchMode = dispatchMode || 'parallel';
    if (typeof onParallelSubmit === 'function') {
      this._onParallelSubmit = onParallelSubmit;
    }

    if (!this._enabled) return;

    this.startObserving();
    this.ensureFloatingBadge();
  }

  updateConfig({ enabled, autoQueue, dispatchMode, onParallelSubmit }) {
    if (typeof enabled === 'boolean') this._enabled = enabled;
    if (typeof autoQueue === 'boolean') this._autoQueue = autoQueue;
    if (dispatchMode) this._dispatchMode = dispatchMode;
    if (typeof onParallelSubmit === 'function') this._onParallelSubmit = onParallelSubmit;

    if (!this._enabled) {
      this.stopObserving();
      this.hideBadge();
    } else {
      this.startObserving();
      this.updateBadge();
    }
  }

  setActiveParallelCount(count) {
    this._activeParallelCount = Math.max(0, count);
    this.updateBadge();
  }

  getComposerElements() {
    const textarea = document.querySelector('textarea.query-box-input.chat-bidi-enabled') || 
                     document.querySelector('textarea.query-box-input') || 
                     document.querySelector('textarea.query-box-textarea') || 
                     document.querySelector('textarea[aria-label*="Query box" i]') ||
                     document.querySelector('.message-container textarea.query-box-input') ||
                     document.querySelector('textarea[placeholder*="Ask" i]') ||
                     document.querySelector('textarea[placeholder*="提问"]') ||
                     document.querySelector('textarea[placeholder*="输入"]') ||
                     document.querySelector('textarea[aria-label*="提问"]') ||
                     document.querySelector('textarea[aria-label*="Prompt" i]') ||
                     document.querySelector('textarea[aria-label*="Query" i]') ||
                     document.querySelector('textarea');
    
    const form = textarea?.closest ? textarea.closest('form') : (textarea?.form || null);
    const scope = form || document;

    // 发送按钮 (Submit / Send / 发送 / 提交) 或停止按钮 (Stop / 停止)
    const sendButton = scope.querySelector('.submit-button button') ||
                       scope.querySelector('nb-icon-button.submit-button button') ||
                       scope.querySelector('nb-button.submit-button button') ||
                       scope.querySelector('nb-icon-button[aria-label*="Submit" i] button') ||
                       scope.querySelector('button[aria-label*="Submit" i]') ||
                       scope.querySelector('button[aria-label*="Send" i]') ||
                       scope.querySelector('button[aria-label*="发送"]') ||
                       scope.querySelector('button[aria-label*="提交"]') ||
                       scope.querySelector('button.send-button') ||
                       (textarea ? textarea.parentElement?.querySelector('button') : null);

    const stopButton = scope.querySelector('.stop-button button') ||
                       scope.querySelector('nb-button.stop-button button') ||
                       scope.querySelector('nb-icon-button.submit-button[fonticonname="stop"] button') ||
                       scope.querySelector('nb-icon-button[fonticonname="stop"] button') ||
                       scope.querySelector('nb-icon-button[aria-label*="Stop" i] button') ||
                       scope.querySelector('button[aria-label*="Stop" i]') ||
                       scope.querySelector('button[aria-label*="停止"]') ||
                       scope.querySelector('button.stop-button');

    return { textarea, sendButton, stopButton };
  }

  /**
   * 判断官方前端当前是否处于“思考中/流式生成中”状态 (具备并发计数与思考链防误判保护)
   */
  isGenerating() {
    // 0. 如果当前已有活跃的并发请求在执行，或刚刚发起原生提交正处于首帧等待窗口内，必须判定为生成中
    if (this._activeParallelCount > 0) {
      return true;
    }
    if (this._nativeSubmitWindowUntil && Date.now() < this._nativeSubmitWindowUntil) {
      return true;
    }

    const { stopButton, textarea } = this.getComposerElements();

    // 1. 如果有活跃可见的停止按钮，则必然处于流式生成中
    if (stopButton) {
      const isVisible = (typeof stopButton.checkVisibility === 'function')
        ? stopButton.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        : (stopButton.offsetParent !== null || (stopButton.getBoundingClientRect && stopButton.getBoundingClientRect().width > 0));
      if (isVisible) return true;
    }
    const stopIcon = document.querySelector('nb-icon-button[fonticonname="stop"], nb-icon-button[aria-label*="Stop" i], button[aria-label*="Stop" i], [aria-label*="Cancel" i], .stop-button');
    if (stopIcon) {
      const isVisible = (typeof stopIcon.checkVisibility === 'function')
        ? stopIcon.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        : (stopIcon.offsetParent !== null || (stopIcon.getBoundingClientRect && stopIcon.getBoundingClientRect().width > 0));
      if (isVisible) return true;
    }

    // 2. 检查输入框 placeholder 是否变更为“回复中 / 思考中”
    if (textarea && textarea.placeholder) {
      const ph = textarea.placeholder.toLowerCase();
      if (ph.includes('responding') || ph.includes('thinking') || ph.includes('回复') || ph.includes('生成中')) {
        return true;
      }
    }

    // 3. 显式绿灯排他保护：若提问表单提交按钮为 arrow_upward / Submit 且无停止按钮，坚决不误报生成中 (免疫历史展开思考链干扰)
    const form = textarea?.closest ? textarea.closest('form') : (textarea?.form || null);
    const scope = form || document;
    const submitBtn = scope.querySelector('nb-icon-button.submit-button[fonticonname="arrow_upward"], nb-icon-button.submit-button[aria-label="Submit"], button[aria-label="Submit"]:not([aria-label*="Stop" i])');
    if (submitBtn) {
      const isStop = submitBtn.getAttribute('aria-label')?.toLowerCase().includes('stop') ||
                     submitBtn.querySelector('[fonticonname="stop"]');
      if (!isStop) {
        const submitVisible = (typeof submitBtn.checkVisibility === 'function')
          ? submitBtn.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
          : (submitBtn.offsetParent !== null || (submitBtn.getBoundingClientRect && submitBtn.getBoundingClientRect().width > 0));
        if (submitVisible) {
          return false;
        }
      }
    }

    // 4. 检查提问主区域是否存在动态闪烁的生成中指示器 (作用域严格限定在会话与输入流内，防止左侧来源同步转圈误判)
    const activeGeneratingIndicator = document.querySelector(
      '.chat-panel-content .thinking-indicator, chat-panel [data-testid="generating"], .chat-panel-content [aria-busy="true"], .chat-panel-content .mat-progress-spinner, .chat-panel-content .thinking-dots'
    );
    return Boolean(activeGeneratingIndicator);
  }

  /**
   * 启动 DOM 观测器与强制解禁循环
   */
  startObserving() {
    if (this._isMonitoring) return;
    this._isMonitoring = true;

    // 周期性轮询与属性保活
    this._unfreezeTimer = setInterval(() => {
      this.unfreezeInput();
      this.checkAndDispatchQueue();
    }, 250);

    // 监听输入框的回车事件、表单提交拦截与点击拦截 (使用稳定绑定的引用，避免监听器泄露)
    document.addEventListener('keydown', this._boundKeyDown, true);
    document.addEventListener('submit', this._boundFormSubmit, true);
    document.addEventListener('click', this._boundButtonClick, true);
  }

  stopObserving() {
    if (!this._isMonitoring) return;
    this._isMonitoring = false;
    if (this._unfreezeTimer) {
      clearInterval(this._unfreezeTimer);
      this._unfreezeTimer = null;
    }
    if (this._dispatchCooldownTimer) {
      clearInterval(this._dispatchCooldownTimer);
      this._dispatchCooldownTimer = null;
    }
    this._isDispatching = false;
    this._awaitingGeneration = false;
    document.removeEventListener('keydown', this._boundKeyDown, true);
    document.removeEventListener('submit', this._boundFormSubmit, true);
    document.removeEventListener('click', this._boundButtonClick, true);
    this.hideBadge();
  }

  /**
   * 强制解除原生输入框的只读与禁用状态
   */
  unfreezeInput() {
    if (!this._enabled) return;
    const { textarea, sendButton } = this.getComposerElements();

    if (textarea) {
      if (textarea.disabled) textarea.disabled = false;
      if (textarea.readOnly) textarea.readOnly = false;
      if (textarea.getAttribute('aria-disabled') === 'true') {
        textarea.setAttribute('aria-disabled', 'false');
      }
      textarea.style.pointerEvents = 'auto';

      // 强制解除包装器隐藏 (Google Angular 会在生成期间或配额限制时挂载 query-box-input-hide)
      const wrapper = textarea.closest ? textarea.closest('.query-box-input-wrapper') : null;
      const targetWrapper = wrapper || document.querySelector('.query-box-input-wrapper');
      if (targetWrapper) {
        if (targetWrapper.classList && targetWrapper.classList.contains('query-box-input-hide')) {
          targetWrapper.classList.remove('query-box-input-hide');
        }
        targetWrapper.style.display = 'flex';
        targetWrapper.style.visibility = 'visible';
      }

      if (textarea.placeholder && (textarea.placeholder.toLowerCase().includes('responding') || textarea.placeholder.toLowerCase().includes('thinking') || textarea.placeholder.includes('回复') || textarea.placeholder.includes('生成中'))) {
        const isParallel = this._dispatchMode === 'parallel' && typeof this._onParallelSubmit === 'function';
        const i18n = (typeof window !== 'undefined' && window.NBI18n) ? window.NBI18n : null;
        textarea.placeholder = isParallel
          ? (i18n ? i18n.t('inputPlaceholderParallel') : '输入下一题并按回车即时并发回答...')
          : (i18n ? i18n.t('inputPlaceholderSerial') : '输入下一题并按回车智能排队...');
      }
    }

    // 在有排队任务或并发模式生成中且有输入文本时，发送按钮保持可用视觉状态
    const hasContent = textarea && textarea.value && textarea.value.trim().length > 0;
    const shouldEnableSend = (this._queue.length > 0) || (this._dispatchMode === 'parallel' && hasContent && this.isGenerating());
    if (sendButton && shouldEnableSend) {
      sendButton.removeAttribute('disabled');
      sendButton.disabled = false;
      sendButton.style.pointerEvents = 'auto';
      if (sendButton.classList && sendButton.classList.contains('mat-mdc-button-disabled')) {
        sendButton.classList.remove('mat-mdc-button-disabled');
      }
    }
  }

  /**
   * 键盘事件拦截：当生成进行中时，阻止误触破坏生成，转为进入排队队列或即时并发流式回答
   */
  _handleKeyDown(event) {
    if (!this._enabled || !this._autoQueue) return;

    // 严防输入法 (IME) 组字阶段的回车误拦截 (兼容 macOS/Windows 的 isComposing 与 229 keyCode)
    if (event.isComposing || event.keyCode === 229 || event.which === 229) {
      return;
    }

    if ((event.key === 'Enter' || event.keyCode === 13) && !event.shiftKey && !event.altKey) {
      const { textarea } = this.getComposerElements();
      const targetTextarea = (event.target && event.target.tagName === 'TEXTAREA') ? event.target : textarea;
      if (!targetTextarea) return;
      if (textarea && event.target && event.target !== textarea && event.target !== targetTextarea) return;

      const questionText = (targetTextarea.value || textarea?.value || '').trim();
      if (!questionText) return;

      // 如果当前正处于生成中，或处于并发模式且原生输入通道被锁定，拦截并根据派发模式分流
      const form = targetTextarea.closest ? targetTextarea.closest('form') : (targetTextarea.form || null);
      const scope = form || document;
      const isQuotaLocked = Boolean(scope.querySelector('.quota-disabled-message'));
      const shouldIntercept = this.isGenerating() || (this._dispatchMode === 'parallel' && isQuotaLocked);

      if (shouldIntercept) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }

        // 清空输入框，供用户立即继续输入后续题目
        this._setTextareaValue(targetTextarea, '');

        const parallelHandler = this._onParallelSubmit || (typeof window !== 'undefined' ? window.__nbHandleParallelSubmit : null);
        if (this._dispatchMode === 'parallel' && typeof parallelHandler === 'function') {
          console.log(`[NativeUnlocker] 触发即时并发同屏流式调度: ${questionText.slice(0, 30)}...`);
          parallelHandler(questionText);
        } else {
          this.enqueue(questionText);
        }
      } else if (!this._isDispatching) {
        // 第 1 题通过原生通道发送时，开启 4 秒首帧保护窗口，确保用户在毫秒级连发第 2 题时立即触发并发流
        this._nativeSubmitWindowUntil = Date.now() + 4000;
      }
    }
  }

  /**
   * 表单提交事件拦截：当生成进行中时拦截提问表单提交行为
   */
  _handleFormSubmit(event) {
    if (!this._enabled || !this._autoQueue) return;

    const { textarea } = this.getComposerElements();
    if (!textarea) return;

    const form = textarea.closest ? textarea.closest('form') : (textarea.form || null);
    // 关键作用域防护：只拦截来自当前提问输入框所在 form 的提交事件，严禁误伤上传、重命名、搜索等其他页面表单
    if (form && event.target && event.target !== form && !(typeof form.contains === 'function' && form.contains(event.target))) {
      return;
    }

    const scope = form || document;
    const isQuotaLocked = Boolean(scope.querySelector('.quota-disabled-message'));
    const shouldIntercept = this.isGenerating() || (this._dispatchMode === 'parallel' && isQuotaLocked);

    if (shouldIntercept) {
      const questionText = textarea.value.trim();
      if (!questionText) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }

      this._setTextareaValue(textarea, '');

      const parallelHandler = this._onParallelSubmit || (typeof window !== 'undefined' ? window.__nbHandleParallelSubmit : null);
      if (this._dispatchMode === 'parallel' && typeof parallelHandler === 'function') {
        console.log(`[NativeUnlocker] 触发即时并发同屏流式调度: ${questionText.slice(0, 30)}...`);
        parallelHandler(questionText);
      } else {
        this.enqueue(questionText);
      }
    } else if (!this._isDispatching && textarea.value && textarea.value.trim()) {
      this._nativeSubmitWindowUntil = Date.now() + 4000;
    }
  }

  /**
   * 发送按钮点击拦截：当处于生成中时拦截点击并按派发模式投递
   */
  _handleButtonClick(event) {
    if (!this._enabled || !this._autoQueue) return;
    const { textarea, sendButton } = this.getComposerElements();
    if (!textarea || !sendButton) return;

    const target = event.target;
    const isSendClick = target === sendButton || (sendButton.contains && sendButton.contains(target));
    if (!isSendClick) return;

    const form = textarea.closest ? textarea.closest('form') : (textarea.form || null);
    const scope = form || document;
    const isQuotaLocked = Boolean(scope.querySelector('.quota-disabled-message'));
    const shouldIntercept = this.isGenerating() || (this._dispatchMode === 'parallel' && isQuotaLocked);

    if (shouldIntercept) {
      const questionText = textarea.value.trim();
      if (!questionText) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }

      this._setTextareaValue(textarea, '');

      const parallelHandler = this._onParallelSubmit || (typeof window !== 'undefined' ? window.__nbHandleParallelSubmit : null);
      if (this._dispatchMode === 'parallel' && typeof parallelHandler === 'function') {
        console.log(`[NativeUnlocker] 点击发送触发即时并发流式调度: ${questionText.slice(0, 30)}...`);
        parallelHandler(questionText);
      } else {
        this.enqueue(questionText);
      }
    } else if (!this._isDispatching && textarea.value && textarea.value.trim()) {
      this._nativeSubmitWindowUntil = Date.now() + 4000;
    }
  }

  /**
   * 跨框架安全设置 textarea 内容 (优先 execCommand，兼容 Angular FormControl 与 Lit)
   */
  _setTextareaValue(textarea, val) {
    if (!textarea) return;

    try {
      if (textarea.focus) textarea.focus();
    } catch (_) {}

    // 1. 如果支持 document.execCommand，优先通过 execCommand 修改以保持撤销栈与原生感知
    let execSuccess = false;
    try {
      if (typeof document !== 'undefined' && document.execCommand) {
        if (textarea.select) textarea.select();
        if (val === '') {
          execSuccess = document.execCommand('delete');
        } else {
          execSuccess = document.execCommand('insertText', false, val);
        }
      }
    } catch (_) {}

    // 2. 原型 setter 兜底，确保在 execCommand 受限时强行穿透
    if (!execSuccess || textarea.value !== val) {
      const proto = typeof window !== 'undefined' && window.HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : (typeof textarea === 'object' && textarea ? Object.getPrototypeOf(textarea) : null);
      const nativeSetter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;
      if (nativeSetter) {
        nativeSetter.call(textarea, val);
      } else {
        textarea.value = val;
      }
    }

    // 3. 完整分发 InputEvent 与 Event 事件流，穿透 Angular NgModel/FormControl 与 CDK
    try {
      if (typeof InputEvent !== 'undefined') {
        textarea.dispatchEvent(new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType: val ? 'insertText' : 'deleteContentBackward',
          data: val || null
        }));
        textarea.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          composed: true,
          inputType: val ? 'insertText' : 'deleteContentBackward',
          data: val || null
        }));
      }
    } catch (_) {}

    textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  enqueue(questionText) {
    this._queue.push(questionText);
    this.updateBadge();
    console.log(`[NativeUnlocker] 题目已加入原生排队队列 (当前队列: ${this._queue.length} 题): ${questionText.slice(0, 30)}...`);
  }

  /**
   * 检查上一题是否已完成生成，若空闲则自动投递
   */
  checkAndDispatchQueue() {
    if (this._queue.length === 0 || this._isDispatching || this._awaitingGeneration) return;
    if (this.isGenerating()) {
      this.updateBadge();
      return;
    }

    const { textarea, sendButton } = this.getComposerElements();
    if (!textarea) return;

    this._isDispatching = true;
    this._awaitingGeneration = true;
    const nextQuestion = this._queue.shift();
    if (!nextQuestion) {
      this._isDispatching = false;
      this._awaitingGeneration = false;
      return;
    }

    console.log(`[NativeUnlocker] 前一题已完成，自动投递排队题目: ${nextQuestion.slice(0, 30)}...`);

    // 填入输入框并触发完整事件流
    this._setTextareaValue(textarea, nextQuestion);

    // 延迟 60ms 触发发送，确保 Angular/CDK 变更检测与数据绑定同步完毕
    setTimeout(() => {
      this._submitComposer(textarea, sendButton);
      this.updateBadge();

      // 动态监听生成状态：在触发后等待流式启动，最多等待 3000ms
      let checkCount = 0;
      if (this._dispatchCooldownTimer) {
        clearInterval(this._dispatchCooldownTimer);
      }
      this._dispatchCooldownTimer = setInterval(() => {
        checkCount++;
        if (this.isGenerating() || checkCount >= 12) { // 12 * 250ms = 3000ms
          clearInterval(this._dispatchCooldownTimer);
          this._dispatchCooldownTimer = null;
          this._awaitingGeneration = false;
          this._isDispatching = false;
          // 若生成已结束且队列中还有题目，则继续出队
          if (!this.isGenerating() && this._queue.length > 0) {
            this.checkAndDispatchQueue();
          }
        }
      }, 250);
    }, 60);
  }

  /**
   * 多阶级 Angular 表单提交与事件分发联动
   */
  _submitComposer(textarea, sendButton) {
    const form = textarea?.closest ? textarea.closest('form') : (textarea?.form || null);
    let submitted = false;

    const innerBtn = sendButton || (form?.querySelector ? form.querySelector('button[type="submit"], nb-icon-button.submit-button button') : null);

    // 关键前置解除 disabled 锁定，防止标准 HTML5 引擎因 submitter.disabled=true 拒绝提交
    if (innerBtn) {
      try {
        innerBtn.removeAttribute('disabled');
        innerBtn.disabled = false;
        innerBtn.style.pointerEvents = 'auto';
      } catch (_) {}
    }

    // 阶级 1: W3C 标准 form.requestSubmit(innerBtn) 优先调度，穿透触发 Angular (ngSubmit)
    if (form && typeof form.requestSubmit === 'function') {
      try {
        if (innerBtn) {
          form.requestSubmit(innerBtn);
        } else {
          form.requestSubmit();
        }
        submitted = true;
      } catch (err) {
        console.warn('[NativeUnlocker] form.requestSubmit() 异常，切换备用通道:', err);
      }
    }

    // 阶级 2: 分发标准 Enter 键盘事件（Angular KeyEventsPlugin 监听 keydown.enter）
    // 注意：无论阶级 1 是否调用，均向 textarea 补充分发 Enter keydown 事件，确保单向监听 keydown.enter 的 Angular 组件 100% 触发
    if (textarea && typeof KeyboardEvent !== 'undefined') {
      try {
        const enterDown = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
          composed: true
        });
        textarea.dispatchEvent(enterDown);
        submitted = true;
      } catch (err) {
        console.warn('[NativeUnlocker] dispatch Enter keydown 异常:', err);
      }
    }

    // 阶级 3: 触发发送按钮点击 (兼顾无 form 包装容器与 Mock 环境)
    if (innerBtn) {
      try {
        innerBtn.click();
      } catch (_) {}
    }
  }

  _setSafeHTML(el, html) {
    if (!el) return;
    let policy = null;
    if (typeof window !== 'undefined' && window.trustedTypes && window.trustedTypes.createPolicy) {
      try {
        policy = window.__nbTrustedPolicy || (window.__nbTrustedPolicy = window.trustedTypes.createPolicy('nb-concurrency-policy', {
          createHTML: (s) => s,
          createScriptURL: (s) => s,
          createScript: (s) => s
        }));
      } catch (_) {
        try {
          policy = window.trustedTypes.defaultPolicy;
        } catch (__) {}
      }
    }
    if (policy && policy.createHTML) {
      el.innerHTML = policy.createHTML(html);
    } else {
      el.innerHTML = html;
    }
  }

  ensureFloatingBadge() {
    if (this._floatingBadge && document.body && (document.body.contains ? document.body.contains(this._floatingBadge) : true)) return;
    const existing = (typeof document.getElementById === 'function') 
      ? document.getElementById('nb-native-queue-badge')
      : (typeof document.querySelector === 'function' ? document.querySelector('#nb-native-queue-badge') : null);
    if (existing) {
      this._floatingBadge = existing;
      return;
    }
    if (!document.body) return;

    const badge = document.createElement('div');
    badge.id = 'nb-native-queue-badge';
    badge.className = 'nb-queue-chip';
    const currentTheme = (typeof window !== 'undefined' && window.NBTheme && typeof window.NBTheme.getTheme === 'function') 
      ? window.NBTheme.getTheme() 
      : 'light';
    badge.setAttribute('data-theme', currentTheme);
    badge.style.display = 'none';
    document.body.appendChild(badge);
    this._floatingBadge = badge;
  }

  updateBadge() {
    this.ensureFloatingBadge();
    if (!this._floatingBadge) return;
    if (typeof window !== 'undefined' && window.NBTheme && typeof window.NBTheme.getTheme === 'function') {
      this._floatingBadge.setAttribute('data-theme', window.NBTheme.getTheme());
    }

    const isParallel = this._dispatchMode === 'parallel' && typeof this._onParallelSubmit === 'function';
    const i18n = (typeof window !== 'undefined' && window.NBI18n) ? window.NBI18n : null;

    if (isParallel) {
      if (this._activeParallelCount === 0 && this._queue.length === 0) {
        this._floatingBadge.style.display = 'none';
        return;
      }
    } else {
      if (this._queue.length === 0) {
        this._floatingBadge.style.display = 'none';
        return;
      }
    }

    const { textarea } = this.getComposerElements();
    if (textarea) {
      const rect = textarea.getBoundingClientRect();
      this._floatingBadge.style.position = 'fixed';
      this._floatingBadge.style.top = `${Math.max(10, rect.top - 38)}px`;
      this._floatingBadge.style.left = `${rect.left + 16}px`;
    }

    if (isParallel && this._activeParallelCount > 0) {
      const text = i18n
        ? i18n.t('badgeParallelStreaming', { n: this._activeParallelCount })
        : `⚡ 并发流式生成中: ${this._activeParallelCount} 题并行`;
      this._setSafeHTML(this._floatingBadge, `
        <span class="nb-pulse-dot active"></span>
        <span>${text}</span>
      `);
    } else {
      const text = i18n
        ? i18n.t('badgeQueueing', { n: this._queue.length })
        : `⚡ 并发排队中: <strong>${this._queue.length}</strong> 题待发`;
      const clearTip = i18n ? i18n.t('clearQueue') : '清空排队';
      this._setSafeHTML(this._floatingBadge, `
        <span class="nb-pulse-dot"></span>
        <span>${text}</span>
        <button class="nb-clear-queue-btn" title="${clearTip}">✕</button>
      `);

      const clearBtn = this._floatingBadge.querySelector('.nb-clear-queue-btn');
      if (clearBtn) {
        clearBtn.onclick = (e) => {
          e.stopPropagation();
          this._queue = [];
          this.updateBadge();
        };
      }
    }
    this._floatingBadge.style.display = 'inline-flex';
  }

  hideBadge() {
    if (this._floatingBadge) {
      this._floatingBadge.style.display = 'none';
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NativeChatUnlocker };
} else {
  window.NBNativeUnlocker = NativeChatUnlocker;
  window.NativeChatUnlocker = NativeChatUnlocker;
}
