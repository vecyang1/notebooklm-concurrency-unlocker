/**
 * 单元测试: 流式响应解析器 (StreamingChatParser)
 */

const assert = require('assert');
const { StreamingChatParser } = require('../lib/parser');

function testStripAntiXssi() {
  console.log('测试 1: 去除 Anti-XSSI 前缀');
  const input1 = ")]}'\n123\n[[\"wrb.fr\",null,\"[]\"]]";
  const cleaned1 = StreamingChatParser.stripAntiXssi(input1);
  assert.strictEqual(cleaned1.startsWith(")]}'"), false, '必须去除 )]}\' 前缀');
  assert.strictEqual(cleaned1.startsWith('123'), true, '去除前缀后应直接暴露内容');

  const input2 = "   )]}'  [[\"wrb.fr\"]]";
  const cleaned2 = StreamingChatParser.stripAntiXssi(input2);
  assert.strictEqual(cleaned2.startsWith(")]}'"), false);
  console.log('  ✓ 通过: 正常与带有前导空格的 XSSI 前缀均被剔除');
}

function testParseFullResponse() {
  console.log('测试 2: 解析有效 Google 流式响应与引用源');
  
  // 模拟带有中间帧与最终帧的响应
  const rawPayload = `)]}'
52
[["wrb.fr",null,"[[\\"部分流式回答片段\\",null,[\\"conv_123\\"],null,null],null,null,null,0]"]]
88
[["wrb.fr",null,"[[\\"这是 NotebookLM 生成的完整回答，包含详细阐述。\\",null,[\\"conv_123\\"],null,[null,null,null,[[\\"引用文段一\\",\\"文档 A.pdf\\",\\"http://example.com/a\\"]]]],null,null,null,1]"]]
`;

  const result = StreamingChatParser.parseFullResponse(rawPayload);
  assert.strictEqual(result.answer, '这是 NotebookLM 生成的完整回答，包含详细阐述。', '应正确提取标记为 final 的完整回答');
  assert.strictEqual(result.conversationId, 'conv_123', '应正确提取会话标识');
  assert.strictEqual(result.isFinal, true, 'isFinal 应为 true');
  assert.strictEqual(result.references.length, 1, '应成功提取 1 条引用');
  assert.strictEqual(result.references[0].title, '文档 A.pdf');
  assert.strictEqual(result.references[0].snippet, '引用文段一');
  console.log('  ✓ 通过: 完整回答文本、会话 ID 及引用元数据提取准确');
}

function testErrorFrameHandling() {
  console.log('测试 3: 服务端错误帧 (er) 识别与抛出');
  const errorPayload = `)]}'
34
[["er",null,"PERMISSION_DENIED"]]
`;

  assert.throws(() => {
    StreamingChatParser.parseFullResponse(errorPayload);
  }, /Google 服务端响应错误: PERMISSION_DENIED/, '必须将 er 帧转化为显式错误');
  console.log('  ✓ 通过: 服务端错误帧被精确识别并抛出');
}

function testRequestPayloadBuilder() {
  console.log('测试 4: 流式提问请求体组装');
  const payload = StreamingChatParser.buildRequestPayload({
    notebookId: 'nb_test_999',
    question: '并发测试提问内容',
    csrfToken: 'token_mock_xyz',
    sourceIds: ['source_1', 'source_2'],
    sessionId: 'sid_12345'
  });

  assert.strictEqual(payload.url.includes('notebooklm.google.com'), true);
  assert.strictEqual(payload.url.includes('f.sid=sid_12345'), true);
  assert.strictEqual(payload.body.includes('at=token_mock_xyz'), true);
  assert.strictEqual(payload.body.includes('f.req='), true);

  // 解码 f.req 验证参数结构
  const bodyParams = new URLSearchParams(payload.body);
  const fReqRaw = bodyParams.get('f.req');
  const fReq = JSON.parse(fReqRaw);
  const innerParams = JSON.parse(fReq[1]);

  // innerParams[0] 应为嵌套来源 [[[source_1]], [[source_2]]]
  assert.deepStrictEqual(innerParams[0], [[['source_1']], [['source_2']]]);
  // innerParams[1] 为问题
  assert.strictEqual(innerParams[1], '并发测试提问内容');
  // innerParams[2] 应为会话历史数组 (默认为空数组)
  assert.deepStrictEqual(innerParams[2], []);
  // innerParams[3] 为高级设置数组
  assert.strictEqual(Array.isArray(innerParams[3]), true);
  // innerParams[7] 为 notebookId
  assert.strictEqual(innerParams[7], 'nb_test_999');
  // innerParams[8] 为 turn flag
  assert.strictEqual(innerParams[8], 1);

  // 测试在 notebook.google.com 环境下的动态 origin 与 authuser
  global.window = {
    location: {
      origin: 'https://notebook.google.com',
      pathname: '/notebook/nb_test_999',
      search: '?authuser=2'
    },
    WIZ_global_data: {
      cfb2h: 'boq_labs-tailwind-frontend_20261014.16_p0'
    }
  };

  const dynamicPayload = StreamingChatParser.buildRequestPayload({
    notebookId: 'nb_test_999',
    question: '测试 notebook.google.com',
    csrfToken: 'token_mock_xyz'
  });

  assert.strictEqual(dynamicPayload.url.startsWith('https://notebook.google.com/_/LabsTailwindUi'), true);
  assert.strictEqual(dynamicPayload.url.includes('authuser=2'), true);
  assert.strictEqual(dynamicPayload.url.includes('source-path=%2Fnotebook%2Fnb_test_999'), true);
  delete global.window;

  console.log('  ✓ 通过: 请求 URL、多层嵌套来源参数、Token、会话参数及 notebook.google.com 动态域校验一致');
}

function testParseQuestionsFromText() {
  console.log('测试 5: 多行批量问题解析与编号安全剥离 (防过度截断)');

  const rawInput = `
    1. 1 + 1 等于几？请简短回答
    2、 2 + 2 等于几？请简短回答
    3) 3 * 3 等于几？
    4] 100 - 50 是多少？
    - 总结当前要点
    * 分析核心架构
    • 列出下一步计划
    2026年全球宏观经济走势如何？
    
  `;

  const parsed = StreamingChatParser.parseQuestionsFromText(rawInput);
  assert.strictEqual(parsed.length, 8, '应正确解析出 8 个有效问题');
  assert.strictEqual(parsed[0], '1 + 1 等于几？请简短回答', '加法算式内部的 1+1 绝不能被误判为序号截断');
  assert.strictEqual(parsed[1], '2 + 2 等于几？请简短回答', '顿号序号后算式内部的 2+2 完整保留');
  assert.strictEqual(parsed[2], '3 * 3 等于几？', '括号序号应安全剥离');
  assert.strictEqual(parsed[3], '100 - 50 是多少？', '减法算式内部的 100-50 完整保留');
  assert.strictEqual(parsed[4], '总结当前要点', '破折号列表符应安全剥离');
  assert.strictEqual(parsed[5], '分析核心架构', '星号列表符应安全剥离');
  assert.strictEqual(parsed[6], '列出下一步计划', '圆点列表符应安全剥离');
  assert.strictEqual(parsed[7], '2026年全球宏观经济走势如何？', '开头带有纯年份数字的问题绝不能被误删');

  // 空值与边界防护
  assert.deepStrictEqual(StreamingChatParser.parseQuestionsFromText(''), []);
  assert.deepStrictEqual(StreamingChatParser.parseQuestionsFromText(null), []);
  assert.deepStrictEqual(StreamingChatParser.parseQuestionsFromText('   \n  \n  '), []);

  console.log('  ✓ 通过: 各类列表序号安全剥离，算式数字加减号及年份等问题正文 100% 完整保留');
}

function testQuotaErrorHandling() {
  console.log('测试 6: Google Quota 配额超限与 UserDisplayableError 精准识别与抛出');
  const quotaPayload = `)]}'

223
[["wrb.fr",null,null,null,null,[8,null,[["type.googleapis.com/google.internal.labs.tailwind.orchestration.v1.UserDisplayableError",[null,null,null,null,null,null,null,null,null,null,null,[[3],[1792185241,136199000]]]]]]]]
60
[["di",3431],["af.httprm",3431,"8844124203156100806",169]]
25
[["e",4,null,null,321]]
`;

  assert.throws(() => {
    StreamingChatParser.parseFullResponse(quotaPayload);
  }, /Google 服务端响应错误: 配额超限或聊天功能已被暂时锁定 \(Quota Exceeded\)/, '必须将 UserDisplayableError 转化为配额超限错误并显式抛出');
  console.log('  ✓ 通过: 配额超限与限流错误被 100% 精确捕获并抛出，绝不静默吞没');
}

function run() {
  console.log('--- 运行 parser.js 单元测试集 ---');
  testStripAntiXssi();
  testParseFullResponse();
  testErrorFrameHandling();
  testRequestPayloadBuilder();
  testParseQuestionsFromText();
  testQuotaErrorHandling();
  console.log('--- parser.js 测试全部通过 ---\n');
}

if (require.main === module) {
  run();
}

module.exports = { run };
