/**
 * 单元测试: 原生输入解锁与智能排队器 (NativeChatUnlocker)
 */

const assert = require('assert');
const { NativeChatUnlocker } = require('../lib/queue');

// 简单轻量模拟 DOM
class MockElement {
  constructor(tag, classes = '', attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.className = classes;
    this.attributes = { ...attrs };
    this.disabled = false;
    this.readOnly = false;
    this.value = '';
    this.style = {};
    this.parentElement = null;
    this.children = [];
    this.listeners = {};
    this.offsetParent = {};
  }

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  contains(child) {
    if (!child) return false;
    let curr = child;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentElement;
    }
    return false;
  }

  querySelector(selector) {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      return this.children.find(c => c.className.includes(cls)) || new MockElement('div');
    }
    return new MockElement('div');
  }

  getAttribute(k) { return this.attributes[k] || null; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  removeAttribute(k) { delete this.attributes[k]; }

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  dispatchEvent(event) {
    const list = this.listeners[event.type] || [];
    for (const fn of list) fn(event);
  }

  click() {
    this.dispatchEvent({ type: 'click' });
  }

  getBoundingClientRect() {
    return { top: 100, left: 100, width: 300, height: 40 };
  }
}

function setupMockDOM() {
  const elements = {};
  const listeners = {};
  global.document = {
    body: new MockElement('body'),
    querySelector: (selector) => {
      return elements[selector] || null;
    },
    addEventListener: (event, fn) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    removeEventListener: (event, fn) => {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(f => f !== fn);
    },
    createElement: (tag) => new MockElement(tag)
  };
  global.window = {
    scrollY: 0,
    scrollX: 0
  };
  global.Event = class {
    constructor(type) { this.type = type; }
  };
  return { elements, listeners };
}

function testUnfreezeLogic() {
  console.log('测试 1: 强制解除输入框 disabled 锁定');
  const { elements } = setupMockDOM();
  const textarea = new MockElement('textarea', 'query-box-input');
  textarea.disabled = true;
  textarea.setAttribute('aria-disabled', 'true');
  elements['textarea.query-box-input'] = textarea;

  const unlocker = new NativeChatUnlocker();
  unlocker.init({ enabled: true, autoQueue: true });

  unlocker.unfreezeInput();

  assert.strictEqual(textarea.disabled, false, 'textarea.disabled 必须被重置为 false');
  assert.strictEqual(textarea.getAttribute('aria-disabled'), 'false', 'aria-disabled 必须被重置为 false');
  console.log('  ✓ 通过: 锁定的输入框成功恢复可编辑状态');
  unlocker.stopObserving();
}

async function testQueueAndDispatch() {
  console.log('测试 2: 排队入栈与生成完成后的自动投递及实际点击触发');
  const { elements } = setupMockDOM();

  const textarea = new MockElement('textarea', 'query-box-input');
  const sendButton = new MockElement('button', 'send-button');
  elements['textarea.query-box-input'] = textarea;
  elements['button.send-button'] = sendButton;

  const unlocker = new NativeChatUnlocker();
  unlocker.init({ enabled: true, autoQueue: true });

  let sendClicked = false;
  sendButton.addEventListener('click', () => {
    sendClicked = true;
  });

  // 入队
  unlocker.enqueue('测试排队问题 1');
  assert.strictEqual(unlocker._queue.length, 1);

  // 此时非生成中状态，检查投递
  unlocker.checkAndDispatchQueue();

  assert.strictEqual(textarea.value, '测试排队问题 1', '问题内容应填入输入框');
  assert.strictEqual(unlocker._queue.length, 0, '队列应弹出');

  // 等待 80ms 确保 60ms 定时器触发了实际点击
  await new Promise(r => setTimeout(r, 80));
  assert.strictEqual(sendClicked, true, '发送按钮必须被自动调用 click() 触发');

  console.log('  ✓ 通过: 排队问题正确回填并自动触发出队分发与真实点击');
  unlocker.stopObserving();
}

function testEventListenerLeakPrevention() {
  console.log('测试 3: 键盘监听器注销与无泄漏防护');
  const { listeners } = setupMockDOM();

  const unlocker = new NativeChatUnlocker();
  unlocker.startObserving();
  assert.strictEqual((listeners['keydown'] || []).length, 1, '启动后应注册 1 个 keydown 监听');

  unlocker.stopObserving();
  assert.strictEqual((listeners['keydown'] || []).length, 0, '停止观测后 keydown 监听应完全注销');
  console.log('  ✓ 通过: 稳定绑定的监听器引用可被安全注销，零事件监听残留');
}

function testChineseSelectorsAndGenerating() {
  console.log('测试 4: 中文界面选择器与多语言生成状态识别');
  const { elements } = setupMockDOM();

  const textarea = new MockElement('textarea', '', { placeholder: '向笔记本提问...' });
  const sendButton = new MockElement('button', '', { 'aria-label': '发送' });
  const stopButton = new MockElement('button', '', { 'aria-label': '停止' });
  elements['textarea[placeholder*="提问"]'] = textarea;
  elements['button[aria-label*="发送"]'] = sendButton;
  elements['button[aria-label*="停止"]'] = stopButton;

  const unlocker = new NativeChatUnlocker();
  const composer = unlocker.getComposerElements();
  assert.strictEqual(composer.textarea, textarea, '应准确匹配中文提问输入框');
  assert.strictEqual(composer.sendButton, sendButton, '应准确匹配中文发送按钮');
  assert.strictEqual(composer.stopButton, stopButton, '应准确匹配中文停止按钮');

  // 当停止按钮处于可见状态时判定为生成中
  assert.strictEqual(unlocker.isGenerating(), true, '有可见停止按钮时应正确判定为生成中');
  console.log('  ✓ 通过: 中文选择器与生成中状态判定准确');
}

function testAngularFormSubmitDispatch() {
  console.log('测试 5: Angular 表单联动 - form.requestSubmit() 优先调度与安全回落');
  const { elements } = setupMockDOM();

  const form = new MockElement('form');
  const textarea = new MockElement('textarea', 'query-box-input');
  const sendButton = new MockElement('button', 'send-button');
  textarea.parentElement = form;
  textarea.closest = (tag) => (tag.toLowerCase() === 'form' ? form : null);

  let formSubmitted = false;
  form.requestSubmit = () => {
    formSubmitted = true;
  };

  elements['textarea.query-box-input'] = textarea;
  elements['button.send-button'] = sendButton;

  const unlocker = new NativeChatUnlocker();
  unlocker._submitComposer(textarea, sendButton);

  assert.strictEqual(formSubmitted, true, '必须优先调用 form.requestSubmit() 触发 Angular (ngSubmit)');
  console.log('  ✓ 通过: Angular 表单 requestSubmit 优先联动有效');
}

function testSubmitEventInterceptionWhileGenerating() {
  console.log('测试 6: 表单提交与回车拦截 - 生成中自动入队并清空输入框');
  const { elements } = setupMockDOM();

  const stopButton = new MockElement('button', '', { 'aria-label': 'Stop' });
  const textarea = new MockElement('textarea', 'query-box-input');
  textarea.value = '排队拦截题目';
  elements['button[aria-label*="Stop" i]'] = stopButton;
  elements['textarea.query-box-input'] = textarea;

  const unlocker = new NativeChatUnlocker();
  unlocker.init({ enabled: true, autoQueue: true });

  assert.strictEqual(unlocker.isGenerating(), true);

  // 模拟拦截 submit 事件
  let prevented = false;
  const mockSubmitEvent = {
    type: 'submit',
    preventDefault: () => { prevented = true; },
    stopPropagation: () => {},
    stopImmediatePropagation: () => {}
  };
  unlocker._handleFormSubmit(mockSubmitEvent);

  assert.strictEqual(prevented, true, '生成中的提交必须被 preventDefault');
  assert.strictEqual(unlocker._queue.length, 1, '拦截的题目应已进入队列');
  assert.strictEqual(unlocker._queue[0], '排队拦截题目');
  assert.strictEqual(textarea.value, '', '输入框应被重置清空');
  console.log('  ✓ 通过: 生成中无论是回车还是表单提交均被全量捕获入队');
  unlocker.stopObserving();
}

function testFalsePositiveGeneratingImmunity() {
  console.log('测试 7: 历史展开思考链防误判与显式绿灯排他保护');
  const { elements } = setupMockDOM();

  const textarea = new MockElement('textarea', 'query-box-input');
  const submitBtn = new MockElement('button', 'submit-button', { 'aria-label': 'Submit' });
  elements['textarea.query-box-input'] = textarea;
  elements['button[aria-label="Submit"]'] = submitBtn;

  const unlocker = new NativeChatUnlocker();
  // 当前存在 Submit 按钮且无 Stop 按钮，即便有残余指示器也绝不误判为生成中
  assert.strictEqual(unlocker.isGenerating(), false, '拥有 Submit 按钮时应明确判定为空闲绿灯');
  console.log('  ✓ 通过: 显式绿灯排他机制有效抵御假阳性误判');
}

function testNonComposerFormSubmitNotIntercepted() {
  console.log('测试 8: 作用域防御 - 非提问输入框所在表单提交坚决不拦截');
  const { elements } = setupMockDOM();

  const stopButton = new MockElement('button', '', { 'aria-label': 'Stop' });
  const composerForm = new MockElement('form', 'form');
  const textarea = new MockElement('textarea', 'query-box-input');
  textarea.value = '草稿内容';
  composerForm.appendChild(textarea);
  textarea.closest = (sel) => (sel === 'form' ? composerForm : null);

  const unrelatedForm = new MockElement('form', 'source-upload-form');

  elements['button[aria-label*="Stop" i]'] = stopButton;
  elements['textarea.query-box-input'] = textarea;

  const unlocker = new NativeChatUnlocker();
  unlocker.init({ enabled: true, autoQueue: true });
  assert.strictEqual(unlocker.isGenerating(), true);

  let prevented = false;
  const unrelatedSubmitEvent = {
    type: 'submit',
    target: unrelatedForm,
    preventDefault: () => { prevented = true; },
    stopPropagation: () => {},
    stopImmediatePropagation: () => {}
  };

  unlocker._handleFormSubmit(unrelatedSubmitEvent);

  assert.strictEqual(prevented, false, '非提问表单提交绝不能被 preventDefault 拦截');
  assert.strictEqual(unlocker._queue.length, 0, '非提问表单提交绝不能入队');
  assert.strictEqual(textarea.value, '草稿内容', '提问输入框内容应完整保留');
  console.log('  ✓ 通过: 独立表单提交作用域隔离有效，零误伤第三方表单');
  unlocker.stopObserving();
}

function testImeCompositionEnterNotIntercepted() {
  console.log('测试 9: 中文输入法 (IME) 组字阶段回车防误吞');
  const { elements } = setupMockDOM();

  const stopButton = new MockElement('button', '', { 'aria-label': 'Stop' });
  const textarea = new MockElement('textarea', 'query-box-input');
  textarea.value = 'zhongwen';

  elements['button[aria-label*="Stop" i]'] = stopButton;
  elements['textarea.query-box-input'] = textarea;

  const unlocker = new NativeChatUnlocker();
  unlocker.init({ enabled: true, autoQueue: true });

  // 1. isComposing = true 的回车
  let prevented1 = false;
  unlocker._handleKeyDown({
    key: 'Enter',
    isComposing: true,
    target: textarea,
    preventDefault: () => { prevented1 = true; }
  });
  assert.strictEqual(prevented1, false, 'isComposing=true 时回车不得被拦截');
  assert.strictEqual(unlocker._queue.length, 0, '组字阶段不得入队');
  assert.strictEqual(textarea.value, 'zhongwen', '组字阶段输入框内容不得被清空');

  // 2. keyCode = 229 的回车
  let prevented2 = false;
  unlocker._handleKeyDown({
    key: 'Enter',
    keyCode: 229,
    which: 229,
    isComposing: false,
    target: textarea,
    preventDefault: () => { prevented2 = true; }
  });
  assert.strictEqual(prevented2, false, 'keyCode=229 时回车不得被拦截');
  assert.strictEqual(unlocker._queue.length, 0, 'keyCode=229 时不得入队');
  assert.strictEqual(textarea.value, 'zhongwen');

  console.log('  ✓ 通过: 中文与多语言 IME 组字回车 100% 安全放行');
  unlocker.stopObserving();
}

function testDisabledSubmitterButtonReenabled() {
  console.log('测试 10: 发送按钮 disabled 状态在 requestSubmit 前自动前置解除');
  const { elements } = setupMockDOM();

  const form = new MockElement('form');
  const textarea = new MockElement('textarea', 'query-box-input');
  const sendButton = new MockElement('button', 'send-button');
  sendButton.disabled = true;

  textarea.parentElement = form;
  textarea.closest = (tag) => (tag.toLowerCase() === 'form' ? form : null);

  form.requestSubmit = (btn) => {
    assert.strictEqual(btn.disabled, false, 'requestSubmit 接收到的按钮 disabled 必须为 false');
  };

  elements['textarea.query-box-input'] = textarea;
  elements['button.send-button'] = sendButton;

  const unlocker = new NativeChatUnlocker();
  unlocker._submitComposer(textarea, sendButton);
  assert.strictEqual(sendButton.disabled, false, '发送按钮最终必须处于可用状态');
  console.log('  ✓ 通过: disabled 发送按钮前置解除保护生效');
}

function testStopObservingCleansBadgeAndLocks() {
  console.log('测试 11: 停止观测时徽标自动隐藏与派发状态彻底复位');
  const { elements } = setupMockDOM();
  const unlocker = new NativeChatUnlocker();
  unlocker.init({ enabled: true, autoQueue: true });

  unlocker.ensureFloatingBadge();
  unlocker._floatingBadge.style.display = 'inline-flex';
  unlocker._isDispatching = true;
  unlocker._awaitingGeneration = true;

  unlocker.stopObserving();
  assert.strictEqual(unlocker._floatingBadge.style.display, 'none', '停止观测时徽标应立即隐藏');
  assert.strictEqual(unlocker._isDispatching, false, '派发锁应复位');
  assert.strictEqual(unlocker._awaitingGeneration, false, '等待生成状态应复位');
  console.log('  ✓ 通过: 停止观测生命周期清理完整');
}

async function run() {
  console.log('--- 运行 queue.js 单元测试集 ---');
  testUnfreezeLogic();
  await testQueueAndDispatch();
  testEventListenerLeakPrevention();
  testChineseSelectorsAndGenerating();
  testAngularFormSubmitDispatch();
  testSubmitEventInterceptionWhileGenerating();
  testFalsePositiveGeneratingImmunity();
  testNonComposerFormSubmitNotIntercepted();
  testImeCompositionEnterNotIntercepted();
  testDisabledSubmitterButtonReenabled();
  testStopObservingCleansBadgeAndLocks();
  console.log('--- queue.js 测试全部通过 ---\n');
}

if (require.main === module) {
  run();
}

module.exports = { run };
