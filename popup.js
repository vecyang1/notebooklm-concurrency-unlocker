/**
 * NotebookLM 并发提问解锁器 - 弹出菜单控制器 (Popup Controller)
 * 支持双语即时切换、派发模式选择、工作线程配置与遥测对账
 */

document.addEventListener('DOMContentLoaded', async () => {
  const i18n = window.NBI18n || (typeof I18nManager !== 'undefined' ? new I18nManager() : null);
  const storage = window.NBStorage || new StorageManager();

  const headerTitle = document.getElementById('pop-header-title');
  const langToggleBtn = document.getElementById('pop-lang-toggle');
  const statusDot = document.getElementById('status-dot');
  const statusLabel = document.getElementById('status-label');

  const modeTitle = document.getElementById('pop-mode-title');
  const optParallel = document.getElementById('pop-opt-parallel');
  const optSerial = document.getElementById('pop-opt-serial');
  const modeParallelText = document.getElementById('pop-mode-parallel-text');
  const modeSerialText = document.getElementById('pop-mode-serial-text');

  const workersTitle = document.getElementById('pop-workers-title');
  const slider = document.getElementById('pop-workers-slider');
  const sliderVal = document.getElementById('pop-workers-val');

  const unfreezeTitle = document.getElementById('pop-unfreeze-title');
  const unfreezeSwitch = document.getElementById('pop-unfreeze-switch');

  const autoQueueTitle = document.getElementById('pop-auto-queue-title');
  const autoQueueSwitch = document.getElementById('pop-auto-queue-switch');

  const showFloatTitle = document.getElementById('pop-show-float-title');
  const showFloatSwitch = document.getElementById('pop-show-float-switch');

  const btnOpen = document.getElementById('btn-open-notebook');

  const totalLabel = document.getElementById('pop-tel-total-label');
  const totalQueriesEl = document.getElementById('pop-total-queries');
  const rateLabel = document.getElementById('pop-tel-rate-label');
  const successRateEl = document.getElementById('pop-success-rate');
  const timeLabel = document.getElementById('pop-tel-time-label');
  const avgTimeEl = document.getElementById('pop-avg-time');

  let isPageConnected = false;

  function t(k, p) {
    return i18n ? i18n.t(k, p) : k;
  }

  function applyLanguage() {
    if (!i18n) return;
    const isZh = i18n.getLanguage() === 'zh';
    langToggleBtn.textContent = isZh ? 'EN' : '中文';
    headerTitle.textContent = isZh ? '⚡ NotebookLM 并发解锁' : '⚡ NotebookLM Unlocker';

    if (isPageConnected) {
      statusLabel.textContent = t('popConnected');
    } else {
      statusLabel.textContent = t('popNotConnected');
    }

    modeTitle.textContent = isZh ? '原生提问派发模式:' : 'Dispatch Mode:';
    modeParallelText.textContent = isZh ? '⚡ 即时并发同屏回答' : '⚡ Simultaneous Parallel Stream';
    modeSerialText.textContent = isZh ? '⏳ 原生串行排队' : '⏳ Serial Native Queue';

    workersTitle.textContent = isZh ? '并发工作线程数' : 'Concurrency Workers';
    unfreezeTitle.textContent = isZh ? '强制解锁原生输入框' : 'Force Unlock Input Box';
    autoQueueTitle.textContent = isZh ? '原生提问自动拦截' : 'Native Intercept / Queue';
    showFloatTitle.textContent = isZh ? '显示页面悬浮按钮' : 'Show Floating Button';
    btnOpen.textContent = t('popOpenNotebook');

    totalLabel.textContent = isZh ? '累计提问' : 'Total Queries';
    rateLabel.textContent = isZh ? '成功率' : 'Success Rate';
    timeLabel.textContent = isZh ? '平均耗时' : 'Avg Duration';
  }

  // 1. 检查当前激活标签页
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      isPageConnected = Boolean(activeTab && activeTab.url && (activeTab.url.includes('notebooklm.google.com') || activeTab.url.includes('notebook.google.com')));
      if (isPageConnected) {
        statusDot.className = 'status-dot';
      } else {
        statusDot.className = 'status-dot inactive';
      }
      applyLanguage();
    });
  }

  // 2. 加载当前持久化设置
  const settings = await storage.getSettings();
  if (i18n && settings.language) {
    i18n.setLanguage(settings.language);
  }

  slider.value = settings.maxWorkers || 5;
  sliderVal.textContent = settings.maxWorkers || 5;
  unfreezeSwitch.checked = Boolean(settings.unfreezeNativeInput);
  autoQueueSwitch.checked = Boolean(settings.autoQueueNative);
  showFloatSwitch.checked = Boolean(settings.showFloatingButton);

  const mode = settings.dispatchMode || 'parallel';
  if (mode === 'parallel') {
    optParallel.classList.add('selected');
    optSerial.classList.remove('selected');
    optParallel.querySelector('input').checked = true;
  } else {
    optSerial.classList.add('selected');
    optParallel.classList.remove('selected');
    optSerial.querySelector('input').checked = true;
  }

  applyLanguage();

  // 3. 加载遥测数据
  const telemetry = await storage.getTelemetry();
  totalQueriesEl.textContent = `${telemetry.totalQueries || 0}`;
  const rate = telemetry.totalQueries > 0 ? Math.round((telemetry.successQueries / telemetry.totalQueries) * 100) : 100;
  successRateEl.textContent = `${rate}%`;
  avgTimeEl.textContent = `${((telemetry.avgResponseTimeMs || 0) / 1000).toFixed(1)}s`;

  // 4. 事件监听与热写回
  langToggleBtn.addEventListener('click', () => {
    const next = i18n.getLanguage() === 'zh' ? 'en' : 'zh';
    i18n.setLanguage(next);
    storage.updateSettings({ language: next });
    applyLanguage();
  });

  optParallel.addEventListener('click', () => {
    optParallel.classList.add('selected');
    optSerial.classList.remove('selected');
    optParallel.querySelector('input').checked = true;
    storage.updateSettings({ dispatchMode: 'parallel' });
  });

  optSerial.addEventListener('click', () => {
    optSerial.classList.add('selected');
    optParallel.classList.remove('selected');
    optSerial.querySelector('input').checked = true;
    storage.updateSettings({ dispatchMode: 'serial' });
  });

  slider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10) || 5;
    sliderVal.textContent = val;
    storage.updateSettings({ maxWorkers: val });
    if (typeof chrome !== 'undefined' && chrome.action) {
      chrome.action.setBadgeText({ text: String(val) });
    }
  });

  unfreezeSwitch.addEventListener('change', (e) => {
    storage.updateSettings({ unfreezeNativeInput: e.target.checked });
  });

  autoQueueSwitch.addEventListener('change', (e) => {
    storage.updateSettings({ autoQueueNative: e.target.checked });
  });

  showFloatSwitch.addEventListener('change', (e) => {
    storage.updateSettings({ showFloatingButton: e.target.checked });
  });

  btnOpen.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: 'https://notebooklm.google.com' });
    } else {
      window.open('https://notebooklm.google.com', '_blank');
    }
  });
});
