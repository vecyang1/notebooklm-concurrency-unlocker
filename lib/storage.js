/**
 * NotebookLM 并发提问解锁器 - 存储与配置中心 (SSOT)
 * 统一管理配置项与运行指标，保持单一事实来源
 */

const DEFAULT_SETTINGS = {
  maxWorkers: 5,             // 并发工作线程数 (1-7，默认 5，继承自 NotebookLM-CX)
  unfreezeNativeInput: true, // 强制解锁原生输入框与发送按钮
  dispatchMode: 'parallel',  // 原生提问派发模式: 'parallel' (即时并发同屏回答，默认) | 'serial' (原生串行排队)
  autoQueueNative: true,     // 原生提问拦截开关 (向下兼容)
  queryTimeoutSeconds: 180,  // 单次提问超时时间 (秒)
  maxRetries: 3,             // 失败自动重试次数
  showFloatingButton: true,  // 是否在页面显示悬浮助手入口
  autoScrollToLatest: true,  // 并发卡片生成时自动滚动
  language: (typeof navigator !== 'undefined' && navigator.language && navigator.language.toLowerCase().startsWith('zh')) ? 'zh' : 'en' // 'en' | 'zh'
};

const DEFAULT_TELEMETRY = {
  totalQueries: 0,
  successQueries: 0,
  failedQueries: 0,
  avgResponseTimeMs: 0,
  recentHistory: []          // 最近 20 条查询简报
};

class StorageManager {
  constructor() {
    this._hasChromeStorage = typeof chrome !== 'undefined' && Boolean(chrome?.storage?.local);
    this._hasLocalStorage = typeof localStorage !== 'undefined';
    this._memorySettings = { ...DEFAULT_SETTINGS };
    this._memoryTelemetry = { ...DEFAULT_TELEMETRY };
  }

  /**
   * 获取当前全部配置
   */
  async getSettings() {
    if (this._hasChromeStorage) {
      return new Promise((resolve) => {
        chrome.storage.local.get({ settings: DEFAULT_SETTINGS }, (res) => {
          resolve({ ...DEFAULT_SETTINGS, ...(res.settings || {}) });
        });
      });
    }

    if (this._hasLocalStorage) {
      try {
        const raw = localStorage.getItem('nb_concurrency_settings');
        return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
      } catch {
        return { ...DEFAULT_SETTINGS };
      }
    }

    return { ...this._memorySettings };
  }

  /**
   * 保存配置更新
   */
  async updateSettings(delta) {
    const current = await this.getSettings();
    const updated = { ...current, ...delta };

    if (this._hasChromeStorage) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ settings: updated }, () => {
          resolve(updated);
        });
      });
    }

    if (this._hasLocalStorage) {
      try {
        localStorage.setItem('nb_concurrency_settings', JSON.stringify(updated));
      } catch (err) {
        console.error('保存设置失败:', err);
      }
    } else {
      this._memorySettings = updated;
    }

    return updated;
  }

  /**
   * 获取遥测与对账数据
   */
  async getTelemetry() {
    if (this._hasChromeStorage) {
      return new Promise((resolve) => {
        chrome.storage.local.get({ telemetry: DEFAULT_TELEMETRY }, (res) => {
          resolve({ ...DEFAULT_TELEMETRY, ...(res.telemetry || {}) });
        });
      });
    }

    if (this._hasLocalStorage) {
      try {
        const raw = localStorage.getItem('nb_concurrency_telemetry');
        return raw ? { ...DEFAULT_TELEMETRY, ...JSON.parse(raw) } : { ...DEFAULT_TELEMETRY };
      } catch {
        return { ...DEFAULT_TELEMETRY };
      }
    }

    return { ...this._memoryTelemetry };
  }

  /**
   * 记录单次提问指标
   */
  async recordMetric({ success, durationMs, question, error = null }) {
    const telemetry = await this.getTelemetry();
    const total = telemetry.totalQueries + 1;
    const successCount = success ? telemetry.successQueries + 1 : telemetry.successQueries;
    const failedCount = success ? telemetry.failedQueries : telemetry.failedQueries + 1;
    
    // 动态滚动平均耗时 (仅对有效耗时计入平均值，避免失败零耗时稀释指标)
    const avgResponseTimeMs = durationMs > 0
      ? (telemetry.avgResponseTimeMs > 0 ? Math.round(telemetry.avgResponseTimeMs * 0.8 + durationMs * 0.2) : durationMs)
      : (telemetry.avgResponseTimeMs || 0);

    const historyItem = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
      question: (question || '').slice(0, 100),
      durationMs,
      success,
      error: error ? String(error).slice(0, 120) : null
    };

    const recentHistory = [historyItem, ...(telemetry.recentHistory || [])].slice(0, 20);

    const updated = {
      totalQueries: total,
      successQueries: successCount,
      failedQueries: failedCount,
      avgResponseTimeMs,
      recentHistory
    };

    if (this._hasChromeStorage) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ telemetry: updated }, () => {
          resolve(updated);
        });
      });
    }

    if (this._hasLocalStorage) {
      try {
        localStorage.setItem('nb_concurrency_telemetry', JSON.stringify(updated));
      } catch (e) {
        // ignore
      }
    } else {
      this._memoryTelemetry = updated;
    }

    return updated;
  }

  /**
   * 监听配置变动
   */
  onSettingsChanged(callback) {
    if (this._hasChromeStorage) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.settings) {
          callback(changes.settings.newValue || DEFAULT_SETTINGS);
        }
      });
    } else {
      window.addEventListener('storage', (e) => {
        if (e.key === 'nb_concurrency_settings' && e.newValue) {
          callback(JSON.parse(e.newValue));
        }
      });
    }
  }
}

// 导出单例 (支持模块环境与纯浏览器 script 引入)
const storageManager = new StorageManager();
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StorageManager, storageManager, DEFAULT_SETTINGS, DEFAULT_TELEMETRY };
} else {
  window.NBStorage = storageManager;
}
