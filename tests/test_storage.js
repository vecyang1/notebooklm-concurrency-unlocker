/**
 * 单元测试: 存储与配置中心 (StorageManager)
 */

const assert = require('assert');
const { StorageManager, DEFAULT_SETTINGS } = require('../lib/storage');

async function testStorageBasics() {
  console.log('测试 1: 默认配置与读取更新');
  const storage = new StorageManager();

  const settings = await storage.getSettings();
  assert.strictEqual(settings.maxWorkers, 5, '默认并发数应为 5');
  assert.strictEqual(settings.unfreezeNativeInput, true, '默认开启输入框解禁');

  const updated = await storage.updateSettings({ maxWorkers: 4 });
  assert.strictEqual(updated.maxWorkers, 4, '更新后并发数应为 4');

  const reloaded = await storage.getSettings();
  assert.strictEqual(reloaded.maxWorkers, 4, '重新读取后配置应保持一致');
  console.log('  ✓ 通过: 默认配置正确，更新与二次读取一致');
}

async function testTelemetryMetrics() {
  console.log('测试 2: 遥测指标记录与滚动平均耗时');
  const storage = new StorageManager();

  await storage.recordMetric({
    success: true,
    durationMs: 2000,
    question: '指标测试问题 1'
  });

  let tele = await storage.getTelemetry();
  assert.strictEqual(tele.totalQueries >= 1, true);
  assert.strictEqual(tele.successQueries >= 1, true);
  assert.strictEqual(tele.recentHistory.length >= 1, true);
  assert.strictEqual(tele.recentHistory[0].question, '指标测试问题 1');
  assert.strictEqual(tele.avgResponseTimeMs, 2000, '首次查询平均耗时应精确等于 2000ms');

  await storage.recordMetric({
    success: false,
    durationMs: 0,
    question: '失败测试问题',
    error: '网络中断'
  });

  tele = await storage.getTelemetry();
  assert.strictEqual(tele.failedQueries >= 1, true);
  assert.strictEqual(tele.recentHistory[0].error, '网络中断');
  assert.strictEqual(tele.avgResponseTimeMs, 2000, '0ms 异常失败不应稀释有效历史平均耗时');
  console.log('  ✓ 通过: 成功与失败指标、错误信息及历史记录完整留痕');
}

async function run() {
  console.log('--- 运行 storage.js 单元测试集 ---');
  await testStorageBasics();
  await testTelemetryMetrics();
  console.log('--- storage.js 测试全部通过 ---\n');
}

if (require.main === module) {
  run();
}

module.exports = { run };
