/**
 * NotebookLM 并发提问解锁器 - 页面主执行环境探针 (In-Page Bridge)
 * 运行于 NotebookLM 主世界 (MAIN World)，直接读取 Google 全局变量与环境状态
 */

(() => {
  if (window.__NB_CONCURRENCY_INPAGE_LOADED__ && !window.__NB_CONCURRENCY_FORCE_RELOAD__) return;
  window.__NB_CONCURRENCY_INPAGE_LOADED__ = true;

  console.log('[InPageBridge] NotebookLM 并发提问解锁器主探针已注入');

  function getWizGlobalData() {
    return window.WIZ_global_data || {};
  }

  function getCsrfToken() {
    const wiz = getWizGlobalData();
    if (wiz.SNlM0e) return wiz.SNlM0e;

    // 备用正则扫描页面 script
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const match = s.textContent.match(/"SNlM0e":"([^"]+)"/);
      if (match && match[1]) return match[1];
    }
    return '';
  }

  function getSessionId() {
    const wiz = getWizGlobalData();
    if (wiz.FdrFJe) return wiz.FdrFJe;

    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const match = s.textContent.match(/"FdrFJe":"([^"]+)"/);
      if (match && match[1]) return match[1];
    }
    return '';
  }

  function getBuildLabel() {
    const wiz = getWizGlobalData();
    if (wiz.cfb2h) return wiz.cfb2h;

    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const match = s.textContent.match(/"cfb2h":"([^"]+)"/);
      if (match && match[1]) return match[1];
    }
    return 'boq_labs-tailwind-frontend_20261014.16_p0';
  }

  function getActiveNotebookId() {
    const match = window.location.pathname.match(/\/notebook\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  function getParser() {
    if (window.NBParser) return window.NBParser;
    if (typeof StreamingChatParser !== 'undefined') return StreamingChatParser;
    throw new Error('解析模块尚未就绪，请刷新重试');
  }

  /**
   * 收集当前笔记本的所有可用来源 ID (优先提取已勾选来源)
   */
  function extractPageSourceIds() {
    const checkedIds = [];
    const allIds = [];

    // 1. 扫描带有 UUID 的 source-item 按钮与元素
    document.querySelectorAll('[id*="source-item-more-button-"]').forEach(el => {
      const match = el.id.match(/source-item-more-button-([a-f0-9-]+)/i);
      if (match && !allIds.includes(match[1])) {
        allIds.push(match[1]);
        // 检查该来源对应项是否被勾选
        const parent = el.closest('.source-item, [class*="source-item"]') || el.parentElement?.parentElement;
        if (parent) {
          const cb = parent.querySelector('mat-checkbox, input[type="checkbox"], [role="checkbox"]');
          const isChecked = cb && (cb.classList.contains('mat-mdc-checkbox-checked') || cb.checked || cb.getAttribute('aria-checked') === 'true');
          if (isChecked && !checkedIds.includes(match[1])) {
            checkedIds.push(match[1]);
          }
        }
      }
    });

    // 2. 备用通用属性扫描
    const elements = document.querySelectorAll(
      '[data-source-id], [data-id*="source"], [data-doc-id], [data-document-id], input[data-source-id]'
    );
    for (const el of elements) {
      const raw = el.getAttribute('data-source-id') || 
                 el.getAttribute('data-id') || 
                 el.getAttribute('data-doc-id') || 
                 el.getAttribute('data-document-id');
      const m = raw ? raw.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i) : null;
      const id = m ? m[1] : raw;
      if (id && !allIds.includes(id)) {
        allIds.push(id);
      }
    }

    return checkedIds.length > 0 ? checkedIds : allIds;
  }

  /**
   * 获取完整环境诊断快照
   */
  function getEnvironmentSnapshot() {
    const notebookId = getActiveNotebookId();
    const csrfToken = getCsrfToken();
    const sessionId = getSessionId();
    const buildLabel = getBuildLabel();
    const sourceIds = extractPageSourceIds();

    return {
      notebookId,
      csrfToken: csrfToken ? `${csrfToken.slice(0, 8)}...${csrfToken.slice(-6)}` : '未捕获',
      hasFullCsrf: Boolean(csrfToken),
      sessionId: sessionId || '未捕获',
      buildLabel,
      sourceCount: sourceIds.length,
      sourceIds,
      url: window.location.href,
      timestamp: Date.now()
    };
  }

  // 智能会话 ID 嗅探与状态保持 (支持多轮与并发共享 Google 服务端聊天上下文)
  if (!window.__nbFetchHooked__) {
    window.__nbFetchHooked__ = true;
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      try {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        if (typeof url === 'string' && url.includes('GenerateFreeFormStreamed')) {
          const body = args[1]?.body;
          if (typeof body === 'string' && body.includes('f.req=')) {
            const match = body.match(/f\.req=([^&]+)/);
            if (match && match[1]) {
              const decoded = decodeURIComponent(match[1]);
              const outer = JSON.parse(decoded);
              if (Array.isArray(outer) && typeof outer[1] === 'string') {
                const params = JSON.parse(outer[1]);
                if (Array.isArray(params) && params[4]) {
                  window.__nbActiveConversationId = params[4];
                }
              }
            }
          }
        }
      } catch (_) {}
      return originalFetch.apply(this, args);
    };
  }

  // 监听来自 content.js 的指令
  if (window.__nbInpageMessageHandler) {
    window.removeEventListener('message', window.__nbInpageMessageHandler);
  }
  window.__nbInpageMessageHandler = async (event) => {
    if (event.source !== window || !event.data || !event.data.type) return;
    // 忽略发给 content.js 的响应包或非发往 inpage 的包
    if (event.data.direction === 'to_content' || event.data.type.endsWith('_RESPONSE')) return;

    const { type, payload, messageId } = event.data;

    // 1. 环境快照查询
    if (type === 'NB_GET_AUTH_STATE') {
      const snapshot = getEnvironmentSnapshot();
      window.postMessage({
        type: 'NB_AUTH_STATE_RESPONSE',
        messageId,
        direction: 'to_content',
        success: true,
        payload: {
          ...snapshot,
          rawCsrfToken: getCsrfToken(),
          activeConversationId: window.__nbActiveConversationId || null
        }
      }, '*');
      return;
    }

    // 2. 真实流式提问执行 (运行于页面同源环境，携带完整 Cookie)
    if (type === 'NB_EXECUTE_STREAM_QUERY') {
      const { question, notebookId, sourceIds, conversationId } = payload || {};
      const targetConvId = conversationId || window.__nbActiveConversationId || null;
      const csrfToken = getCsrfToken();
      const sessionId = getSessionId();
      const buildLabel = getBuildLabel();

      try {
        const parser = getParser();
        const payloadData = parser.buildRequestPayload({
          notebookId: notebookId || getActiveNotebookId(),
          question,
          csrfToken,
          sessionId,
          buildLabel,
          sourceIds: sourceIds || extractPageSourceIds(),
          conversationId: targetConvId
        });

        const response = await fetch(payloadData.url, {
          method: 'POST',
          headers: payloadData.headers,
          body: payloadData.body,
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error(`HTTP 状态异常: ${response.status} ${response.statusText}`);
        }

        let rawText = '';
        let lastDispatchedAnswer = '';

        if (response.body && typeof response.body.getReader === 'function') {
          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            rawText += decoder.decode(value, { stream: true });

            try {
              const intermediate = parser.parseFullResponse(rawText);
              if (intermediate.conversationId && !window.__nbActiveConversationId) {
                window.__nbActiveConversationId = intermediate.conversationId;
              }
              if (intermediate.answer && intermediate.answer !== lastDispatchedAnswer) {
                lastDispatchedAnswer = intermediate.answer;
                window.postMessage({
                  type: 'NB_STREAM_CHUNK',
                  messageId,
                  direction: 'to_content',
                  payload: {
                    partialAnswer: intermediate.answer,
                    references: intermediate.references || [],
                    conversationId: intermediate.conversationId || window.__nbActiveConversationId || null
                  }
                }, '*');
              }
            } catch (_) {}
          }
          rawText += decoder.decode();
        } else {
          rawText = await response.text();
        }

        const parsed = parser.parseFullResponse(rawText);
        if (parsed.conversationId) {
          window.__nbActiveConversationId = parsed.conversationId;
        }

        window.postMessage({
          type: 'NB_STREAM_QUERY_RESPONSE',
          messageId,
          direction: 'to_content',
          success: true,
          payload: {
            answer: parsed.answer,
            references: parsed.references,
            conversationId: parsed.conversationId || window.__nbActiveConversationId || null,
            rawLength: rawText.length
          }
        }, '*');
      } catch (err) {
        window.postMessage({
          type: 'NB_STREAM_QUERY_RESPONSE',
          messageId,
          direction: 'to_content',
          success: false,
          error: err.message || String(err)
        }, '*');
      }
      return;
    }

    // 3. 对账探针
    if (type === 'NB_RUN_DIAGNOSTIC_PROBE') {
      const notebookId = getActiveNotebookId();
      const csrfToken = getCsrfToken();

      if (!notebookId) {
        window.postMessage({
          type: 'NB_DIAGNOSTIC_PROBE_RESPONSE',
          messageId,
          direction: 'to_content',
          success: false,
          error: '请先进入任意 NotebookLM 笔记本页面'
        }, '*');
        return;
      }

      const startTime = performance.now();
      try {
        const parser = getParser();
        const payloadData = parser.buildRequestPayload({
          notebookId,
          question: 'ping',
          csrfToken,
          sessionId: getSessionId(),
          buildLabel: getBuildLabel(),
          sourceIds: []
        });

        const res = await fetch(payloadData.url, {
          method: 'POST',
          headers: payloadData.headers,
          body: payloadData.body,
          credentials: 'include'
        });

        const duration = Math.round(performance.now() - startTime);

        // 优化：探针只需读取首个数据分块以验证 200 连通性与 CSRF/会话有效性，取消后续流式避免长时等待
        let chunkPreview = '';
        let bytesCount = 0;
        if (res.body && typeof res.body.getReader === 'function') {
          try {
            const reader = res.body.getReader();
            const { value } = await reader.read();
            if (value) {
              bytesCount = value.length;
              chunkPreview = new TextDecoder().decode(value).slice(0, 100);
            }
            reader.cancel().catch(() => {});
          } catch (_) {}
        } else {
          const text = await res.text();
          bytesCount = text.length;
          chunkPreview = text.slice(0, 100);
        }

        window.postMessage({
          type: 'NB_DIAGNOSTIC_PROBE_RESPONSE',
          messageId,
          direction: 'to_content',
          success: res.ok,
          payload: {
            statusCode: res.status,
            durationMs: duration,
            bytesReceived: bytesCount,
            answerPreview: res.ok ? 'Google 流式 RPC 连通正常，首帧就绪' : chunkPreview,
            hasCsrf: Boolean(csrfToken)
          }
        }, '*');
      } catch (e) {
        window.postMessage({
          type: 'NB_DIAGNOSTIC_PROBE_RESPONSE',
          messageId,
          direction: 'to_content',
          success: false,
          error: e.message || String(e)
        }, '*');
      }
    }
  };
  window.addEventListener('message', window.__nbInpageMessageHandler);
})();
