/**
 * 单元测试: 国际化双语引擎 (i18n Engine)
 */

const assert = require('assert');
const { I18nManager, I18N_DICTIONARIES } = require('../lib/i18n');

function runI18nTests() {
  console.log('--- 运行 i18n.js 单元测试集 ---');

  // 测试 1: 中英文词典键对齐校验 (Parity Check)
  console.log('测试 1: 中英文双语词典键完全对齐校验');
  const enKeys = Object.keys(I18N_DICTIONARIES.en);
  const zhKeys = Object.keys(I18N_DICTIONARIES.zh);

  const missingInZh = enKeys.filter(k => !zhKeys.includes(k));
  const missingInEn = zhKeys.filter(k => !enKeys.includes(k));

  assert.strictEqual(missingInZh.length, 0, `中文词典缺少键: ${missingInZh.join(', ')}`);
  assert.strictEqual(missingInEn.length, 0, `英文词典缺少键: ${missingInEn.join(', ')}`);
  console.log(`  ✓ 通过: 全部 ${enKeys.length} 个双语词条 100% 严格对齐`);

  // 测试 2: 动态变量插值替换
  console.log('测试 2: 动态变量插值替换 ({param})');
  const i18n = new I18nManager('en');
  assert.strictEqual(i18n.t('questionCount', { n: 4 }), '4 questions');
  assert.strictEqual(i18n.t('cardCompleted', { s: '3.2' }), 'Completed · 3.2s');

  i18n.setLanguage('zh');
  assert.strictEqual(i18n.t('questionCount', { n: 4 }), '4 个问题');
  assert.strictEqual(i18n.t('cardCompleted', { s: '3.2' }), '已完成 · 耗时 3.2s');
  console.log('  ✓ 通过: 英文与中文动态变量替换均准确无误');

  // 测试 3: 即时无缝语言切换与变更监听器
  console.log('测试 3: 即时语言切换与状态订阅广播');
  let notifiedLang = null;
  const unsubscribe = i18n.onChange((lang) => {
    notifiedLang = lang;
  });

  i18n.setLanguage('en');
  assert.strictEqual(i18n.getLanguage(), 'en');
  assert.strictEqual(notifiedLang, 'en');

  i18n.setLanguage('zh');
  assert.strictEqual(i18n.getLanguage(), 'zh');
  assert.strictEqual(notifiedLang, 'zh');

  unsubscribe();
  i18n.setLanguage('en');
  // 取消订阅后不再通知
  assert.strictEqual(notifiedLang, 'zh');
  console.log('  ✓ 通过: 语言切换与状态订阅广播生命周期完整');

  console.log('--- i18n.js 测试全部通过 ---\n');
}

if (require.main === module) {
  runI18nTests();
}

module.exports = { runI18nTests };
