/**
 * 单元测试: 并发工作线程池与信号量调度器 (ConcurrencyWorkerPool)
 */

const assert = require('assert');
const { ConcurrencyWorkerPool } = require('../lib/worker_pool');

async function testConcurrencyLimiting() {
  console.log('测试 1: 严格信号量并发上限控制 (Max Workers Invariant)');
  const pool = new ConcurrencyWorkerPool({ maxWorkers: 3 });

  let currentActive = 0;
  let maxActiveObserved = 0;
  const completed = [];

  const tasks = Array.from({ length: 9 }, (_, i) => ({
    id: `task_${i + 1}`,
    question: `问题 ${i + 1}`,
    executor: async () => {
      currentActive++;
      maxActiveObserved = Math.max(maxActiveObserved, currentActive);
      // 模拟 50ms 的异步请求耗时
      await new Promise(r => setTimeout(r, 50));
      currentActive--;
      completed.push(i + 1);
      return { answer: `回答 ${i + 1}` };
    }
  }));

  const promises = tasks.map(t => pool.submit(t));
  await Promise.all(promises);

  assert.strictEqual(completed.length, 9, '全部 9 个任务应顺利完成');
  assert.strictEqual(maxActiveObserved <= 3, true, `最大同时执行数 (${maxActiveObserved}) 严禁超过设定并发数 3`);
  assert.strictEqual(pool.activeCount, 0, '执行完成后活跃线程数应归零');
  assert.strictEqual(pool.queueDepth, 0, '执行完成后排队深度应归零');
  console.log(`  ✓ 通过: 9 个任务执行完毕，峰值并发数准确限制在 ${maxActiveObserved}，无泄漏`);
}

async function testRetryLogic() {
  console.log('测试 2: 瞬态网络异常指数退避与自动重试');
  const pool = new ConcurrencyWorkerPool({ maxWorkers: 2, maxRetries: 3 });

  let attempts = 0;
  const task = {
    id: 'retry_task',
    question: '重试测试',
    executor: async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('模拟网络抖动 503');
      }
      return { answer: '重试后成功获取回答' };
    }
  };

  const result = await pool.submit(task);
  assert.strictEqual(attempts, 3, '应当在第 3 次尝试时成功');
  assert.strictEqual(result.answer, '重试后成功获取回答');
  console.log('  ✓ 通过: 自动重试机制在经历 2 次瞬态失败后第 3 次成功完成');
}

async function testCircuitBreaker() {
  console.log('测试 3: 熔断器保护机制 (Circuit Breaker)');
  const pool = new ConcurrencyWorkerPool({ maxWorkers: 2, maxRetries: 0 });

  let breakerOpened = false;
  pool.on('circuit_breaker_open', () => {
    breakerOpened = true;
  });

  // 连续提交 5 个必失败任务
  const failedTasks = Array.from({ length: 5 }, (_, i) => ({
    id: `fail_${i}`,
    question: `失败测试 ${i}`,
    executor: async () => {
      throw new Error('强制服务端报错');
    }
  }));

  for (const t of failedTasks) {
    try {
      await pool.submit(t);
    } catch {
      // 捕获预期失败
    }
  }

  assert.strictEqual(pool._consecutiveFailures >= 5, true, '连续失败应达到 5 次');

  // 第 6 个任务提交，应触发熔断拦截
  const blockedTask = {
    id: 'blocked_task',
    question: '被阻断任务',
    executor: async () => ({ answer: 'OK' })
  };

  pool.submit(blockedTask);
  // 等待微任务
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(breakerOpened, true, '熔断器应当处于开启状态');

  // 重置熔断器
  pool.resetCircuitBreaker();
  assert.strictEqual(pool._consecutiveFailures, 0, '熔断器重置后失败计数应归零');
  console.log('  ✓ 通过: 连续 5 次失败准确开启熔断，调用 resetCircuitBreaker 后安全恢复');
}

async function testMultiSlotWorkerBatchDispatch() {
  console.log('测试 4: 批量插槽并发快速填满与队列出栈');
  const pool = new ConcurrencyWorkerPool({ maxWorkers: 5 });

  // 先通过开启熔断阻塞出栈，积压 5 个任务
  pool._consecutiveFailures = 5;

  const runningIds = [];
  const tasks = Array.from({ length: 5 }, (_, i) => ({
    id: `batch_${i + 1}`,
    question: `并发测试 ${i + 1}`,
    executor: async () => {
      runningIds.push(i + 1);
      await new Promise(r => setTimeout(r, 30));
      return { answer: 'done' };
    }
  }));

  const promises = tasks.map(t => pool.submit(t));
  assert.strictEqual(pool.queueDepth, 5, '5 个任务应积压在队列中');
  assert.strictEqual(pool.activeCount, 0, '熔断期间活跃数应为 0');

  // 解除熔断，触发批量插槽填满
  pool.resetCircuitBreaker();

  // 微任务等待，此时所有 5 个任务应同时并发启动
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(pool.activeCount, 5, '解除熔断后全部 5 个工作线程插槽应立即被填满');
  assert.strictEqual(pool.queueDepth, 0, '队列深度应立即清空');

  await Promise.all(promises);
  assert.strictEqual(runningIds.length, 5, '全部任务应执行完成');
  console.log('  ✓ 通过: 工作池在插槽空闲时立即一次性出栈填满全部 5 路并发');
}

async function run() {
  console.log('--- 运行 worker_pool.js 单元测试集 ---');
  await testConcurrencyLimiting();
  await testRetryLogic();
  await testCircuitBreaker();
  await testMultiSlotWorkerBatchDispatch();
  console.log('--- worker_pool.js 测试全部通过 ---\n');
}

if (require.main === module) {
  run();
}

module.exports = { run };
