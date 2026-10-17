/**
 * 自动化测试总运行器 (Test Suite Runner)
 */

const parserTests = require('./test_parser');
const workerPoolTests = require('./test_worker_pool');
const storageTests = require('./test_storage');
const queueTests = require('./test_queue');
const { runI18nTests } = require('./test_i18n');
const { runParallelDispatchTests } = require('./test_parallel_dispatch');
const { runThemeTests } = require('./test_theme');

async function main() {
  console.log('========================================================');
  console.log(' NotebookLM 并发提问解锁器 - 综合工程与算法测试套件');
  console.log('========================================================\n');

  try {
    parserTests.run();
    await workerPoolTests.run();
    await storageTests.run();
    await queueTests.run();
    runI18nTests();
    runParallelDispatchTests();
    runThemeTests();

    console.log('========================================================');
    console.log(' ✅ 所有测试套件全部执行通过！(0 报错，无退化)');
    console.log('========================================================');
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

main();
