/**
 * NotebookLM 并发提问解锁器 - 后台服务工作者 (Background Service Worker)
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] NotebookLM 并发提问解锁器安装/更新完成');
  chrome.action.setBadgeBackgroundColor({ color: '#0284c7' });
  chrome.action.setBadgeText({ text: '5' });
});

// 监听来自 content script 的状态同步
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_BADGE') {
    const text = message.text || '5';
    chrome.action.setBadgeText({ text });
    sendResponse({ ok: true });
  }
});
