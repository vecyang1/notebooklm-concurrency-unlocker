/**
 * NotebookLM 并发提问解锁器 - 工作线程池与并发调度器 (Worker Pool)
 * 深度传承并对齐 NotebookLM-CX (Faktiv) BrandWorkerPool 架构：
 * 信号量并发控制 (1-7 线程)、排队深度估算、熔断器与重试机制。
 */

class ConcurrencyWorkerPool {
  /**
   * @param {Object} options
   * @param {number} [options.maxWorkers=5] 最大并发数 (1-7)
   * @param {number} [options.timeoutSeconds=180] 单次查询超时
   * @param {number} [options.maxRetries=3] 失败重试次数
   */
  constructor({ maxWorkers = 5, timeoutSeconds = 180, maxRetries = 3 } = {}) {
    this.maxWorkers = Math.max(1, Math.min(7, maxWorkers));
    this.timeoutSeconds = timeoutSeconds;
    this.maxRetries = maxRetries;

    this._activeCount = 0;
    this._queue = [];
    this._responseTimes = [];
    this._consecutiveFailures = 0;
    this.CIRCUIT_BREAKER_THRESHOLD = 5;

    // 事件分发器
    this._listeners = new Map();
  }

  setWorkers(count) {
    this.maxWorkers = Math.max(1, Math.min(7, count));
    this._processQueue();
  }

  get activeCount() {
    return this._activeCount;
  }

  get queueDepth() {
    return this._queue.length;
  }

  get avgResponseTimeSeconds() {
    if (this._responseTimes.length === 0) return 15.0;
    const sum = this._responseTimes.reduce((acc, v) => acc + v, 0);
    return Math.round((sum / this._responseTimes.length) * 10) / 10;
  }

  /**
   * 预估排队等待时间 (秒) - 对齐 NotebookLM-CX 计算公式
   */
  get estimatedWaitSeconds() {
    const avg = this.avgResponseTimeSeconds;
    if (this._activeCount < this.maxWorkers) {
      return avg;
    }
    const depth = this._activeCount - this.maxWorkers + 1 + this.queueDepth;
    return Math.round(avg * (1 + depth * 0.5) * 10) / 10;
  }

  /**
   * 提交并发任务
   * @param {Object} task
   * @param {string} task.id 唯一任务 ID
   * @param {string} task.question 提问内容
   * @param {Function} task.executor 执行函数: (task) => Promise<AskResult>
   * @returns {Promise<any>}
   */
  submit(task) {
    return new Promise((resolve, reject) => {
      const item = {
        ...task,
        resolve,
        reject,
        submitTime: Date.now(),
        retryCount: 0
      };

      this._emit('queued', { taskId: item.id, queueDepth: this.queueDepth + 1 });
      this._queue.push(item);
      this._processQueue();
    });
  }

  /**
   * 队列出栈并调度执行 (支持多线程插槽并发填满)
   */
  _processQueue() {
    // 检查熔断器状态
    if (this._consecutiveFailures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      this._emit('circuit_breaker_open', {
        failures: this._consecutiveFailures,
        message: '连续失败次数过多，并发保护已开启，请检查登录会话或网络。'
      });
      return;
    }

    while (this._activeCount < this.maxWorkers && this._queue.length > 0) {
      const item = this._queue.shift();
      if (!item) break;
      this._runTask(item);
    }
  }

  async _runTask(item) {
    this._activeCount++;
    const startTime = Date.now();

    this._emit('start', {
      taskId: item.id,
      activeCount: this._activeCount,
      estimatedWait: this.estimatedWaitSeconds
    });

    try {
      const result = await this._executeWithRetry(item);
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      this._recordSuccess(elapsedSeconds);

      this._emit('complete', {
        taskId: item.id,
        result,
        durationSeconds: elapsedSeconds
      });

      item.resolve(result);
    } catch (error) {
      this._consecutiveFailures++;
      this._emit('error', {
        taskId: item.id,
        error: error.message || error,
        consecutiveFailures: this._consecutiveFailures
      });

      item.reject(error);
    } finally {
      this._activeCount--;
      // 继续调度后续队列
      this._processQueue();
    }
  }

  /**
   * 执行单项提问任务并在遇到瞬态网络异常时自动重试
   */
  async _executeWithRetry(item) {
    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          item.retryCount = attempt;
          this._emit('retry', { taskId: item.id, attempt, maxRetries: this.maxRetries });
          // 指数退避加随机抖动
          const backoffMs = Math.min(10000, 1000 * Math.pow(2, attempt - 1) + Math.random() * 500);
          await new Promise(r => setTimeout(r, backoffMs));
        }

        // 超时控制 (必须及时清理定时器，防止定时器泄露及 Node 事件循环挂起)
        let timerId = null;
        try {
          const timeoutPromise = new Promise((_, reject) => {
            timerId = setTimeout(
              () => reject(new Error(`提问超时 (超过 ${this.timeoutSeconds} 秒)`)),
              this.timeoutSeconds * 1000
            );
          });

          return await Promise.race([
            item.executor(item),
            timeoutPromise
          ]);
        } finally {
          if (timerId) {
            clearTimeout(timerId);
          }
        }
      } catch (err) {
        lastError = err;
        console.warn(`[WorkerPool] 任务 ${item.id} 尝试 ${attempt + 1}/${this.maxRetries + 1} 失败:`, err.message);
      }
    }

    throw lastError || new Error('重试耗尽，任务失败');
  }

  _recordSuccess(seconds) {
    this._consecutiveFailures = 0;
    this._responseTimes.push(seconds);
    if (this._responseTimes.length > 50) {
      this._responseTimes.shift();
    }
  }

  resetCircuitBreaker() {
    this._consecutiveFailures = 0;
    this._processQueue();
  }

  clearQueue() {
    const cancelled = this._queue.splice(0, this._queue.length);
    for (const item of cancelled) {
      item.reject(new Error('用户取消了排队任务'));
    }
    this._emit('queue_cleared', { count: cancelled.length });
  }

  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(handler);
  }

  _emit(event, data) {
    const handlers = this._listeners.get(event) || [];
    for (const h of handlers) {
      try {
        h(data);
      } catch (e) {
        console.error(`[WorkerPool] 事件 ${event} 回调异常:`, e);
      }
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ConcurrencyWorkerPool };
} else {
  window.NBWorkerPool = ConcurrencyWorkerPool;
  window.ConcurrencyWorkerPool = ConcurrencyWorkerPool;
}
