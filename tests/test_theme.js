/**
 * 单元测试: 主题探测与自适应配色管理器 (Theme Manager)
 * 校验 WCAG 2.1 色彩对比度数学模型、深浅色探测逻辑与 DOM 属性广播
 */

const assert = require('assert');
const { ThemeManager } = require('../lib/theme');

function runThemeTests() {
  console.log('--- 运行 theme.js 单元测试集 ---');

  // 测试 1: 颜色字符串安全解析 (Hex, RGB, RGBA, 边界异常)
  console.log('测试 1: 颜色解析器 (Hex, RGB, RGBA, 关键字及容错)');
  assert.deepStrictEqual(ThemeManager.parseColor('#ffffff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepStrictEqual(ThemeManager.parseColor('#000'), { r: 0, g: 0, b: 0, a: 1 });
  assert.deepStrictEqual(ThemeManager.parseColor('rgb(31, 41, 55)'), { r: 31, g: 41, b: 55, a: 1 });
  assert.deepStrictEqual(ThemeManager.parseColor('rgba(242, 240, 240, 0.8)'), { r: 242, g: 240, b: 240, a: 0.8 });
  assert.deepStrictEqual(ThemeManager.parseColor('invalid-color'), { r: 255, g: 255, b: 255, a: 1 });
  console.log('  ✓ 通过: 颜色格式解析与容错回退测试通过');

  // 测试 2: WCAG 2.1 对比度数学精度校验
  console.log('测试 2: WCAG 2.1 相对亮度与对比度数学计算');
  const blackWhiteContrast = ThemeManager.getContrastRatio('#000000', '#ffffff');
  assert(Math.abs(blackWhiteContrast - 21) < 0.05, `黑白对比度应接近 21:1，实际为: ${blackWhiteContrast}`);

  // 浅色模式关键对比度校验 (Light Mode Invariants)
  const lightAnswerContrast = ThemeManager.getContrastRatio('#1f2937', '#ffffff');
  assert(lightAnswerContrast >= 7.0, `浅色模式回答正文对比度应满足 WCAG AAA (>= 7:1)，实际: ${lightAnswerContrast.toFixed(2)}`);

  const lightUserBubbleContrast = ThemeManager.getContrastRatio('#1f2937', '#f2f0f0');
  assert(lightUserBubbleContrast >= 7.0, `浅色模式用户气泡文字对比度应满足 WCAG AAA (>= 7:1)，实际: ${lightUserBubbleContrast.toFixed(2)}`);

  const lightCitationContrast = ThemeManager.getContrastRatio('#1e293b', '#f1f5f9');
  assert(lightCitationContrast >= 7.0, `浅色模式引用胶囊对比度应满足 WCAG AAA (>= 7:1)，实际: ${lightCitationContrast.toFixed(2)}`);

  const lightChipContrast = ThemeManager.getContrastRatio('#1e293b', '#f8fafc');
  assert(lightChipContrast >= 7.0, `浅色模式操作按钮对比度应满足 WCAG AAA (>= 7:1)，实际: ${lightChipContrast.toFixed(2)}`);

  // 深色模式关键对比度校验 (Dark Mode Invariants)
  const darkAnswerContrast = ThemeManager.getContrastRatio('#f8fafc', '#1e293b');
  assert(darkAnswerContrast >= 7.0, `深色模式回答正文对比度应满足 WCAG AAA (>= 7:1)，实际: ${darkAnswerContrast.toFixed(2)}`);

  const darkUserBubbleContrast = ThemeManager.getContrastRatio('#f8fafc', '#26262b');
  assert(darkUserBubbleContrast >= 7.0, `深色模式用户气泡文字对比度应满足 WCAG AAA (>= 7:1)，实际: ${darkUserBubbleContrast.toFixed(2)}`);

  console.log('  ✓ 通过: 全部深浅色调方案均严格超越 WCAG AA/AAA 对比度红线');

  // 测试 3: 类名与 DOM 属性主题探测
  console.log('测试 3: 类名与 data-theme 探测');
  const themeMgr = new ThemeManager();

  // Mock DOM
  const mockDocDarkClass = {
    documentElement: { className: '', getAttribute: () => null, setAttribute: () => {} },
    body: { className: 'luminous-ui dark-theme', getAttribute: () => null, setAttribute: () => {} },
    querySelectorAll: () => []
  };
  assert.strictEqual(themeMgr.detectTheme(mockDocDarkClass), 'dark');

  const mockDocLightClass = {
    documentElement: { className: '', getAttribute: () => null, setAttribute: () => {} },
    body: { className: 'luminous-ui light-theme', getAttribute: () => null, setAttribute: () => {} },
    querySelectorAll: () => []
  };
  assert.strictEqual(themeMgr.detectTheme(mockDocLightClass), 'light');

  const mockDocDataThemeDark = {
    documentElement: { className: '', getAttribute: (k) => (k === 'data-theme' ? 'dark' : null), setAttribute: () => {} },
    body: { className: '', getAttribute: () => null, setAttribute: () => {} },
    querySelectorAll: () => []
  };
  assert.strictEqual(themeMgr.detectTheme(mockDocDataThemeDark), 'dark');
  console.log('  ✓ 通过: 类名与 DOM 特征属性探测完全准确');

  // 测试 4: 背景色感知亮度探测 (NotebookLM 默认浅色 #faf9f9)
  console.log('测试 4: 计算背景色感知亮度探测');
  // 模拟 window.getComputedStyle
  global.window = global.window || {};
  global.window.getComputedStyle = (el) => {
    return { backgroundColor: el._bg || 'rgba(0, 0, 0, 0)' };
  };

  const mockDocLightBg = {
    documentElement: { className: '', getAttribute: () => null, setAttribute: () => {} },
    body: { className: 'luminous-ui mat-app-background notebook', _bg: 'rgb(250, 249, 249)', getAttribute: () => null, setAttribute: () => {} },
    querySelector: () => null,
    querySelectorAll: () => []
  };
  assert.strictEqual(themeMgr.detectTheme(mockDocLightBg), 'light');

  const mockDocDarkBg = {
    documentElement: { className: '', getAttribute: () => null, setAttribute: () => {} },
    body: { className: 'mat-app-background notebook', _bg: 'rgb(30, 30, 30)', getAttribute: () => null, setAttribute: () => {} },
    querySelector: () => null,
    querySelectorAll: () => []
  };
  assert.strictEqual(themeMgr.detectTheme(mockDocDarkBg), 'dark');
  console.log('  ✓ 通过: 背景色感知亮度精准区分深色 (<140) 与浅色 (>=140)');

  // 测试 5: 主题应用与 DOM 属性广播
  console.log('测试 5: 主题应用、节点属性同步与订阅通知');
  const appliedAttrs = {};
  const mockTarget = {
    setAttribute: (k, v) => { appliedAttrs['target_' + k] = v; }
  };
  const mockDocApply = {
    documentElement: { setAttribute: (k, v) => { appliedAttrs['html_' + k] = v; }, getAttribute: () => null },
    body: { setAttribute: (k, v) => { appliedAttrs['body_' + k] = v; }, getAttribute: () => null },
    querySelectorAll: () => [mockTarget]
  };

  let notifiedTheme = null;
  const unsubscribe = themeMgr.onChange((t) => {
    notifiedTheme = t;
  });

  themeMgr.applyTheme('light', mockDocApply);
  assert.strictEqual(themeMgr.getTheme(), 'light');
  assert.strictEqual(appliedAttrs['html_data-nb-theme'], 'light');
  assert.strictEqual(appliedAttrs['body_data-nb-theme'], 'light');
  assert.strictEqual(appliedAttrs['target_data-theme'], 'light');

  themeMgr.applyTheme('dark', mockDocApply);
  assert.strictEqual(themeMgr.getTheme(), 'dark');
  assert.strictEqual(notifiedTheme, 'dark');
  assert.strictEqual(appliedAttrs['html_data-nb-theme'], 'dark');
  assert.strictEqual(appliedAttrs['body_data-nb-theme'], 'dark');
  assert.strictEqual(appliedAttrs['target_data-theme'], 'dark');

  unsubscribe();
  console.log('  ✓ 通过: 全局与子元素属性同步及订阅广播正常');

  console.log('--- theme.js 测试全部通过 ---\n');
}

if (require.main === module) {
  runThemeTests();
}

module.exports = { runThemeTests };
