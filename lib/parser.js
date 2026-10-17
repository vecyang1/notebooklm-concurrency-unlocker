/**
 * NotebookLM 并发提问解锁器 - 官方流式响应解析引擎
 * 兼容 Google Labs Tailwind Orchestration 流式 RPC 报文规范
 */

class StreamingChatParser {
  /**
   * 去除 Google 防跨站脚本前缀 )]}'
   */
  static stripAntiXssi(text) {
    if (!text) return '';
    let cleaned = text.trimStart();
    if (cleaned.startsWith(")]}'")) {
      cleaned = cleaned.slice(4);
    }
    return cleaned.trim();
  }

  /**
   * 解析完整的流式响应文本
   * @param {string} rawResponseText 原始 HTTP 响应正文
   * @returns {{ answer: string, references: Array, conversationId: string|null, isFinal: boolean }}
   */
  static parseFullResponse(rawResponseText) {
    const cleaned = this.stripAntiXssi(rawResponseText);
    if (!cleaned) {
      return { answer: '', references: [], conversationId: null, isFinal: false };
    }

    // 优先按 Google 流式 chunk 块提取 (避免多行字符串被 \\n 切割破坏)
    const chunkBlocks = [];
    const blockRegex = /\d+\s*\n(\[\[[\s\S]*?\]\])(?=\s*\n\d+\s*\n|\s*$)/g;
    let match;
    while ((match = blockRegex.exec(cleaned)) !== null) {
      chunkBlocks.push(match[1]);
    }

    const lines = chunkBlocks.length > 0 ? chunkBlocks : cleaned.split('\n');
    let bestAnswer = '';
    let finalMarkedAnswer = '';
    let bestReferences = [];
    let conversationId = null;
    let sawFinalChunk = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // 跳过纯数字行 (长度前缀)
      if (/^\d+$/.test(line)) continue;

      try {
        const chunkData = JSON.parse(line);
        if (!Array.isArray(chunkData)) continue;

        for (const item of chunkData) {
          if (!Array.isArray(item) || item.length < 2) continue;

          const tag = item[0];
          // 检查服务错误帧
          if (tag === 'er') {
            const errCode = item[2] || 'UNKNOWN_ERROR';
            throw new Error(`Google 服务端响应错误: ${errCode}`);
          }

          if (tag !== 'wrb.fr' || item.length < 3) continue;

          const innerJsonStr = item[2];
          if (typeof innerJsonStr !== 'string') {
            // item[5] 可能为拒绝、配额超限或限流错误信息
            if (item[5] && Array.isArray(item[5])) {
              const str5 = JSON.stringify(item[5]);
              if (str5.includes('UserDisplayableError')) {
                throw new Error('Google 服务端响应错误: 配额超限或聊天功能已被暂时锁定 (Quota Exceeded)');
              }
              throw new Error('Google 服务端响应错误: 请求被服务端拒绝或配额超限');
            }
            continue;
          }

          const innerData = JSON.parse(innerJsonStr);
          if (!Array.isArray(innerData)) continue;

          // envelope[4] 为 isFinalResponse 标记
          const isFinal = innerData[4] === 1 || innerData[4] === true;
          if (isFinal) sawFinalChunk = true;

          // innerData[0] 为具体回答行
          if (Array.isArray(innerData[0]) && innerData[0].length > 0) {
            const answerRow = innerData[0];
            const textCandidate = answerRow[0];

            if (typeof textCandidate === 'string' && textCandidate.trim()) {
              if (isFinal) {
                finalMarkedAnswer = textCandidate;
              }
              if (textCandidate.length > bestAnswer.length) {
                bestAnswer = textCandidate;
              }
            }

            // 提取会话与对齐标识
            if (Array.isArray(answerRow[2]) && answerRow[2][0]) {
              conversationId = answerRow[2][0];
            }

            // 提取引用源 (citations)
            const refsCandidate = this.extractReferences(answerRow);
            if (refsCandidate.length > 0) {
              bestReferences = refsCandidate;
            }
          }
        }
      } catch (e) {
        // 单个 chunk 解析失败，继续扫描下一行
        if (e.message && e.message.includes('Google 服务端响应错误')) {
          throw e;
        }
      }
    }

    const resolvedAnswer = finalMarkedAnswer || bestAnswer;

    return {
      answer: resolvedAnswer,
      references: bestReferences,
      conversationId,
      isFinal: sawFinalChunk || Boolean(resolvedAnswer)
    };
  }

  /**
   * 从回答行提取引用源元数据
   */
  static extractReferences(answerRow) {
    const refs = [];
    if (!Array.isArray(answerRow)) return refs;

    try {
      const typeBlock = answerRow[4];
      let rawList = null;

      if (Array.isArray(typeBlock) && Array.isArray(typeBlock[3])) {
        rawList = typeBlock[3];
      } else if (Array.isArray(answerRow[3])) {
        rawList = answerRow[3];
      }

      if (Array.isArray(rawList)) {
        for (let idx = 0; idx < rawList.length; idx++) {
          const item = rawList[idx];
          if (!item) continue;

          let title = `参考来源 [${idx + 1}]`;
          let snippet = '';
          let url = null;

          if (Array.isArray(item)) {
            // 完整 Google wire format: item[0] 为 chunkId, item[1] 为 detail
            if (Array.isArray(item[1])) {
              const detail = item[1];
              if (detail[5]) {
                title = typeof detail[5] === 'string' ? detail[5] : (detail[5][0] || title);
              }
              if (Array.isArray(detail[4])) {
                snippet = JSON.stringify(detail[4]).slice(0, 150);
              }
            } else if (typeof item[1] === 'string') {
              title = item[1];
              snippet = typeof item[0] === 'string' ? item[0] : '';
              url = typeof item[2] === 'string' ? item[2] : null;
            } else if (typeof item[0] === 'string') {
              snippet = item[0];
            }
          }

          refs.push({
            index: idx + 1,
            title: typeof title === 'string' ? title : String(title || ''),
            snippet: typeof snippet === 'string' ? snippet : String(snippet || ''),
            url
          });
        }
      }
    } catch {
      // 引用提取降级为空
    }
    return refs;
  }

  /**
   * 构建流式提问的请求体与 URL 参数
   * @param {Object} params
   * @param {string} params.notebookId 笔记本 ID
   * @param {string} params.question 提问文本
   * @param {string} params.csrfToken Google CSRF Token (SNlM0e)
   * @param {string} [params.conversationId] 已有会话 ID
   * @param {Array<string>} [params.sourceIds] 限制检索的来源 ID 列表
   * @param {string} [params.sessionId] 会话标识 (FdrFJe)
   * @param {string} [params.buildLabel] 构建版本 (cfb2h)
   */
  static buildRequestPayload({
    notebookId,
    question,
    csrfToken,
    conversationId = null,
    conversationHistory = [],
    sourceIds = [],
    sessionId = '',
    buildLabel = (typeof window !== 'undefined' && window.WIZ_global_data?.cfb2h) ? window.WIZ_global_data.cfb2h : 'boq_labs-tailwind-frontend_20261014.16_p0',
    language = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'zh-CN'
  }) {
    if (!notebookId) throw new Error('缺少必要参数: notebookId');
    if (!question) throw new Error('缺少必要参数: question');

    // 来源多层嵌套: [[[id1]], [[id2]]]
    const sourcesArray = (sourceIds || []).map(id => [[id]]);

    // 标准 Google Labs Tailwind Orchestration 9 元素载荷规范
    const queryParams = [
      sourcesArray,
      question,
      Array.isArray(conversationHistory) ? conversationHistory : [],
      [2, null, [1], [1, null, null, null, null, null, null, null, null, null, [1, 3]]],
      conversationId || null,
      null,
      null,
      notebookId,
      1                         // turn flag
    ];

    const paramsJson = JSON.stringify(queryParams);
    const fReqJson = JSON.stringify([null, paramsJson]);
    const bodyParts = [`f.req=${encodeURIComponent(fReqJson)}`];

    if (csrfToken) {
      bodyParts.push(`at=${encodeURIComponent(csrfToken)}`);
    }

    const postBody = bodyParts.join('&') + '&';

    const reqid = Math.floor(100000 + Math.random() * 900000);
    const urlParams = new URLSearchParams({
      bl: buildLabel,
      hl: language || 'zh-CN',
      _reqid: String(reqid),
      rt: 'c'
    });

    if (sessionId) {
      urlParams.set('f.sid', sessionId);
    }

    if (typeof window !== 'undefined' && window.location) {
      const authuser = new URLSearchParams(window.location.search).get('authuser');
      if (authuser) {
        urlParams.set('authuser', authuser);
      }
      if (window.location.pathname) {
        urlParams.set('source-path', window.location.pathname);
      }
    }

    const baseOrigin = (typeof window !== 'undefined' && window.location && window.location.origin)
      ? window.location.origin
      : 'https://notebooklm.google.com';

    const endpointUrl = `${baseOrigin}/_/LabsTailwindUi/data/google.internal.labs.tailwind.orchestration.v1.LabsTailwindOrchestrationService/GenerateFreeFormStreamed?${urlParams.toString()}`;

    return {
      url: endpointUrl,
      body: postBody,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Same-Domain': '1'
      }
    };
  }

  /**
   * 将多行文本安全分割为问题列表，自动剥离外层列表编号 (如 1. 2、 - • 等)，同时绝不破坏算式与问题内部的数字与加减号
   * @param {string} text
   * @returns {string[]}
   */
  static parseQuestionsFromText(text) {
    if (!text || typeof text !== 'string' || !text.trim()) return [];
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.replace(/^\s*(?:\d+[\.、．\)\]]|[-*•])\s*/, '').trim())
      .filter(line => line.length > 0);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StreamingChatParser };
} else {
  window.NBParser = StreamingChatParser;
}
