/**
 * 单元测试: 原生提问即时并发派发模式 (Simultaneous Parallel Dispatch)
 */

const assert = require('assert');
const { NativeChatUnlocker } = require('../lib/queue');
const { I18nManager } = require('../lib/i18n');

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

  getBoundingClientRect() {
    return { top: 400, left: 100, width: 600, height: 50 };
  }
}

function setupMockDOM() {
  const elements = {};
  const listeners = {};
  global.document = {
    body: new MockElement('body'),
    querySelector: (selector) => elements[selector] || null,
    getElementById: (id) => (elements['#' + id] || null),
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
    scrollX: 0,
    NBI18n: new I18nManager('zh')
  };
  global.Event = class {
    constructor(type) { this.type = type; }
  };
  return { elements, listeners };
}

function runParallelDispatchTests() {
  console.log('--- 运行 parallel_dispatch.js 单元测试集 ---');

  // 测试 1: 即时同屏并发模式 - 生成中提交不进入串行排队队列，直接触发 onParallelSubmit 回调
  console.log('测试 1: 即时同屏并发模式 - 生成中触发 onParallelSubmit 并清空输入框');
  const { elements } = setupMockDOM();

  const stopButton = new MockElement('button', '', { 'aria-label': 'Stop' });
  const textarea = new MockElement('textarea', 'query-box-input');
  textarea.value = '测试即时并发问题 1';
  elements['button[aria-label*="Stop" i]'] = stopButton;
  elements['textarea.query-box-input'] = textarea;

  let parallelSubmittedQuestion = null;
  const unlocker = new NativeChatUnlocker();
  unlocker.init({
    enabled: true,
    autoQueue: true,
    dispatchMode: 'parallel',
    onParallelSubmit: (q) => {
      parallelSubmittedQuestion = q;
    }
  });

  assert.strictEqual(unlocker.isGenerating(), true, '此时应当检测为生成中状态');

  // 模拟用户在生成中敲击回车
  let enterPrevented = false;
  const mockEnterEvent = {
    type: 'keydown',
    key: 'Enter',
    shiftKey: false,
    altKey: false,
    preventDefault: () => { enterPrevented = true; },
    stopPropagation: () => {},
    stopImmediatePropagation: () => {}
  };

  unlocker._handleKeyDown(mockEnterEvent);

  assert.strictEqual(enterPrevented, true, '生成中按键必须被 preventDefault 拦截');
  assert.strictEqual(parallelSubmittedQuestion, '测试即时并发问题 1', '必须立即将问题传递给 onParallelSubmit 回调');
  assert.strictEqual(unlocker._queue.length, 0, '在 parallel 模式下不应将题目压入串行队列');
  assert.strictEqual(textarea.value, '', '输入框必须被立即清空以供用户继续输入第 3 题');
  console.log('  ✓ 通过: 并发模式下成功拦截并直接拉起并发流调度，串行队列零积压');

  // 测试 2: 活跃并发路数更新与徽标文案对账
  console.log('测试 2: 活跃并发路数更新与徽标文案对账');
  unlocker.setActiveParallelCount(2);
  const badgeEl = unlocker._floatingBadge;
  assert(badgeEl, '浮动徽标必须已被创建');
  assert.strictEqual(badgeEl.style.display, 'inline-flex', '有活跃并发时徽标必须显示');
  assert(badgeEl.innerHTML.includes('2 题并行'), `徽标中必须显示 2 题并行，实际: ${badgeEl.innerHTML}`);

  unlocker.setActiveParallelCount(0);
  assert.strictEqual(badgeEl.style.display, 'none', '并发数归零时徽标必须自动隐藏');
  console.log('  ✓ 通过: 活跃并发状态更新与浮动徽标视觉显隐联动准确');

  // 测试 3: 动态切换为串行排队模式 (Serial Mode)
  console.log('测试 3: 动态切换为串行排队模式');
  unlocker.updateConfig({ dispatchMode: 'serial' });
  textarea.value = '测试串行排队题目 2';

  parallelSubmittedQuestion = null;
  unlocker._handleKeyDown(mockEnterEvent);

  assert.strictEqual(parallelSubmittedQuestion, null, 'serial 模式下绝不能触发 parallel 回调');
  assert.strictEqual(unlocker._queue.length, 1, 'serial 模式下必须压入 _queue 队列');
  assert.strictEqual(unlocker._queue[0], '测试串行排队题目 2');
  console.log('  ✓ 通过: 派发模式动态切换有效，串行排队机制完好无损');

  // 测试 4: 仅靠 activeParallelCount 维持 isGenerating 状态 (即原生完成但扩展并发仍在执行)
  console.log('测试 4: 扩展内部活跃并发维持 isGenerating 保护');
  // 移除原生停止按钮并恢复原生空闲绿灯
  elements['nb-icon-button.submit-button[fonticonname="stop"] button'] = null;
  const idleSubmitBtn = new MockElement('button');
  idleSubmitBtn.setAttribute('aria-label', 'Submit');
  elements['nb-icon-button.submit-button[fonticonname="arrow_upward"]'] = idleSubmitBtn;

  unlocker.setActiveParallelCount(1);
  assert.strictEqual(unlocker.isGenerating(), true, '即便原生 DOM 绿灯，只要 activeParallelCount > 0 必须判定为生成中');
  console.log('  ✓ 通过: 内部并发路数 > 0 严格维持生成中判定，防止后续提问与 Angular 碰撞');

  // 测试 5: 发送按钮点击拦截并在 parallel 模式下拉起并发调度
  console.log('测试 5: 发送按钮点击拦截与并发提交');
  const sendButton = new MockElement('button', 'submit-button', { 'aria-label': 'Submit' });
  elements['button[aria-label*="Submit" i]'] = sendButton;
  elements['nb-icon-button.submit-button button'] = sendButton;

  unlocker.updateConfig({ dispatchMode: 'parallel' });
  textarea.value = '测试点击发送并发题目 3';
  parallelSubmittedQuestion = null;

  let btnClickPrevented = false;
  const mockClickEvent = {
    type: 'click',
    target: sendButton,
    preventDefault: () => { btnClickPrevented = true; },
    stopPropagation: () => {},
    stopImmediatePropagation: () => {}
  };

  unlocker._handleButtonClick(mockClickEvent);
  assert.strictEqual(btnClickPrevented, true, '生成中点击发送按钮必须被拦截');
  assert.strictEqual(parallelSubmittedQuestion, '测试点击发送并发题目 3', '点击发送必须触发 onParallelSubmit');
  assert.strictEqual(textarea.value, '', '点击发送后输入框必须被清空');
  console.log('  ✓ 通过: 生成中点击发送按钮同样安全拦截并触发即时并发调度');

  // 测试 6: 并发生成中输入文本时，发送按钮保持解禁与可用状态
  console.log('测试 6: 并发生成中输入文本发送按钮自动解禁');
  sendButton.disabled = true;
  textarea.value = '待发第 4 题';
  unlocker.unfreezeInput();
  assert.strictEqual(sendButton.disabled, false, '并发生成中有输入内容时，发送按钮必须被解禁');
  console.log('  ✓ 通过: 并发模式下发送按钮随输入实时解禁');

  unlocker.setActiveParallelCount(0);
  unlocker.stopObserving();
  console.log('--- parallel_dispatch.js 测试全部通过 ---\n');
}

if (require.main === module) {
  runParallelDispatchTests();
}

module.exports = { runParallelDispatchTests };
