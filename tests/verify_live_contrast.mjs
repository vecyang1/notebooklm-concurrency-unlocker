import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fsSync from 'node:fs';

import os from 'node:os';

const candidateRoots = [
  typeof __PROJECT_ROOT__ !== 'undefined' ? __PROJECT_ROOT__ : null,
  process.env.PROJECT_ROOT,
  process.cwd(),
  path.resolve(process.cwd(), '26.10.16-notebooklm-concurrency-unlocker'),
  path.join(process.env.HOME || os.homedir() || '', 'Documents/A-coding/26.10.16-notebooklm-concurrency-unlocker')
].filter(Boolean);

const projectRoot = candidateRoots.find(c => {
  try { return fsSync.existsSync(path.join(c, 'styles.css')); } catch (_) { return false; }
}) || process.cwd();

const stylesCss = await fs.readFile(path.join(projectRoot, 'styles.css'), 'utf-8');
const themeJs = await fs.readFile(path.join(projectRoot, 'lib', 'theme.js'), 'utf-8');
const i18nJs = await fs.readFile(path.join(projectRoot, 'lib', 'i18n.js'), 'utf-8');
const storageJs = await fs.readFile(path.join(projectRoot, 'lib', 'storage.js'), 'utf-8');
const parserJs = await fs.readFile(path.join(projectRoot, 'lib', 'parser.js'), 'utf-8');
const workerPoolJs = await fs.readFile(path.join(projectRoot, 'lib', 'worker_pool.js'), 'utf-8');
const queueJs = await fs.readFile(path.join(projectRoot, 'lib', 'queue.js'), 'utf-8');
const inpageJs = await fs.readFile(path.join(projectRoot, 'inpage.js'), 'utf-8');
const contentJs = await fs.readFile(path.join(projectRoot, 'content.js'), 'utf-8');

// Connect to task space
const spaces = await listTaskSpaces();
const targetSpace = spaces.find(s => s.recentTabTitles?.some(t => t.includes('Notebook'))) || spaces[0];
console.log('Using space:', targetSpace.id, targetSpace.name);
const task = await claimTaskSpace(targetSpace.id);

let page = null;
try {
  const pages = task.pages();
  if (Array.isArray(pages) && pages.length > 0) {
    page = pages[0];
  }
} catch (_) {}

if (!page) {
  const tabs = await task.tabs();
  const notebookTab = tabs.find(t => t.url.includes('notebook.google.com') && t.active) || tabs.find(t => t.url.includes('notebook.google.com'));
  if (notebookTab && notebookTab.page && notebookTab.page.constructor?.name === 'UnmanagedPage') {
    console.log('Adopting unmanaged tab:', notebookTab.title);
    page = await task.adopt(notebookTab.page, { as: 'contrast_verifier' });
  } else {
    page = task.page('nb') || task.page('live_test') || task.userPage();
  }
}
console.log('Using page:', page ? page.label : 'none');

// 1. Inject styles and scripts into live page
const result = await page.evaluate(async ({ stylesCss, themeJs, i18nJs, storageJs, parserJs, workerPoolJs, queueJs, inpageJs, contentJs }) => {
  // Inject or update styles
  let styleEl = document.getElementById('nb-concurrency-styles');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'nb-concurrency-styles';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = stylesCss;

  // Set force reload
  window.__NB_CONCURRENCY_FORCE_RELOAD__ = true;

  // Stop old unlocker if present
  if (window.__nbNativeUnlocker && typeof window.__nbNativeUnlocker.stopObserving === 'function') {
    window.__nbNativeUnlocker.stopObserving();
  }

  // Evaluate modules
  eval(themeJs);
  eval(i18nJs);
  eval(storageJs);
  eval(parserJs);
  eval(workerPoolJs);
  eval(queueJs);
  eval(inpageJs);
  eval(contentJs);

  // Initialize theme manager on page
  const themeMgr = window.NBTheme || new window.ThemeManager();
  themeMgr.startObserving();
  const detectedTheme = themeMgr.detectTheme();
  themeMgr.applyTheme(detectedTheme);

  // Mount a sample in-chat turn to verify visual contrast
  const scrollContainer = document.querySelector('.chat-panel-content') || document.querySelector('main') || document.body;
  let container = document.getElementById('nb-concurrent-stream-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'nb-concurrent-stream-container';
    container.className = 'nb-concurrent-stream-container';
    scrollContainer.appendChild(container);
  }
  container.setAttribute('data-theme', detectedTheme);

  // Remove previous test turn if any
  const prevTurn = document.getElementById('nb-turn-contrast-test');
  if (prevTurn) prevTurn.remove();

  function getTrustedPolicy() {
    if (window.__nbTrustedPolicy) return window.__nbTrustedPolicy;
    if (typeof window !== 'undefined' && window.trustedTypes && window.trustedTypes.createPolicy) {
      try {
        window.__nbTrustedPolicy = window.trustedTypes.createPolicy('nb-contrast-policy-' + Date.now(), {
          createHTML: (s) => s,
          createScriptURL: (s) => s,
          createScript: (s) => s
        });
      } catch (_) {
        try {
          window.__nbTrustedPolicy = window.trustedTypes.defaultPolicy;
        } catch (__) {}
      }
    }
    return window.__nbTrustedPolicy;
  }

  function safeSetHTML(el, html) {
    if (!el) return;
    const policy = getTrustedPolicy();
    if (policy && policy.createHTML) {
      el.innerHTML = policy.createHTML(html);
    } else {
      el.innerHTML = html;
    }
  }

  const testTurn = document.createElement('div');
  testTurn.className = 'chat-message-pair nb-concurrent-turn';
  testTurn.id = 'nb-turn-contrast-test';
  testTurn.setAttribute('data-task-id', 'contrast-test');
  testTurn.setAttribute('data-theme', detectedTheme);

  safeSetHTML(testTurn, `
    <chat-message class="individual-message">
      <div class="from-user-container">
        <mat-card class="mat-mdc-card mdc-card from-user-message-card-content nb-user-bubble">
          <mat-card-content class="mat-mdc-card-content from-user-message-inner-content message-content">
            <div class="message-text-content mat-body-medium nb-user-text">20个关于认知负债与AI协同的深度思考问题</div>
          </mat-card-content>
        </mat-card>
      </div>
    </chat-message>
    <chat-message class="individual-message">
      <div class="to-user-container">
        <mat-card class="mat-mdc-card mdc-card to-user-message-card-content nb-model-card">
          <div class="nb-model-status-bar">
            <span class="nb-model-status-indicator">
              <span class="nb-status-label completed">已完成 · 耗时 4.8s</span>
            </span>
            <span class="nb-parallel-stream-badge">⚡ 并发流</span>
          </div>
          <mat-card-content class="mat-mdc-card-content message-content to-user-message-inner-content">
            <div class="message-text-content mat-body-medium nb-answer-content">
              围绕《惊奇智库》知识体系与认知科学前沿，针对你的提问为你整理了深度思考框架：<br><br>
              <h3 class="nb-answer-h">一、核心认知负债模型</h3>
              <li class="nb-answer-li"><span class="nb-li-num">1.</span> 什么是AI时代的“认知负债（Cognitive Debt）”？为什么过度依赖AI直接生成答案会导致个人深度思考能力的萎缩？</li>
              <li class="nb-answer-li"><span class="nb-li-num">2.</span> 在AI降维冲击下，为什么“手搓原型与跨学科穿透力”反而会成为极度稀缺的底层壁垒？</li>
              <li class="nb-answer-li"><span class="nb-li-num">3.</span> 如何利用数字分身与并发工作流打造不被替代的个人第二大脑？</li>
              <br>
              <code class="nb-inline-code">const unlocker = new ConcurrencyUnlocker();</code>
              <pre class="nb-code-block"><code>// 并发流式调度核心
await workerPool.dispatch({ query: "认知拓扑推演", sources: 9 });</code></pre>
            </div>
            <div class="nb-model-citations" style="display: flex;">
              <span class="nb-ref-pill" title="Volume 01: 智库深度推演">[1] Volume 01: 智库深度推演</span>
              <span class="nb-ref-pill" title="Volume 04: 宏观分析与体制演进">[2] Volume 04: 宏观分析与体制演进</span>
              <span class="nb-ref-pill" title="Lesson 40: 制度演进与双轨内循环">[3] Lesson 40: 制度演进与双轨内循环</span>
            </div>
          </mat-card-content>
          <mat-card-actions class="mat-mdc-card-actions mdc-card__actions message-actions nb-model-actions" style="display: flex;">
            <button class="nb-action-chip nb-copy-chip">
              <span>📋 复制回答</span>
            </button>
            <button class="nb-action-chip nb-save-note-chip">
              <span>📌 保存为便签</span>
            </button>
            <span class="nb-timing-chip">4.8s</span>
          </mat-card-actions>
        </mat-card>
      </div>
    </chat-message>
  `);

  container.appendChild(testTurn);
  const scrollHost = document.querySelector('.chat-panel-content') || document.querySelector('.chat-scroll-container') || document.querySelector('cdk-virtual-scroll-viewport') || testTurn.parentElement;
  if (scrollHost) {
    scrollHost.scrollTop = scrollHost.scrollHeight + 10000;
  }
  testTurn.scrollIntoView({ behavior: 'instant', block: 'end' });

  // Programmatically compute contrast ratios
  function parseRgb(color, parentBg) {
    if (!color) return { r: 255, g: 255, b: 255 };
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return { r: 255, g: 255, b: 255 };
    let r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3]);
    const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1.0;
    if (alpha < 1.0 && parentBg) {
      const p = parseRgb(parentBg);
      r = Math.round(r * alpha + p.r * (1 - alpha));
      g = Math.round(g * alpha + p.g * (1 - alpha));
      b = Math.round(b * alpha + p.b * (1 - alpha));
    }
    return { r, g, b };
  }
  function getLuminance(r, g, b) {
    const a = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }
  function calcContrast(fgStr, bgStr, parentBgStr) {
    const bg = parseRgb(bgStr, parentBgStr);
    const fg = parseRgb(fgStr, `rgb(${bg.r}, ${bg.g}, ${bg.b})`);
    const l1 = getLuminance(fg.r, fg.g, fg.b);
    const l2 = getLuminance(bg.r, bg.g, bg.b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  const answerEl = testTurn.querySelector('.nb-answer-content');
  const userBubbleEl = testTurn.querySelector('.nb-user-bubble');
  const userTextEl = testTurn.querySelector('.nb-user-text');
  const modelCardEl = testTurn.querySelector('.nb-model-card');
  const pillEl = testTurn.querySelector('.nb-ref-pill');
  const chipEl = testTurn.querySelector('.nb-action-chip');
  const badgeEl = testTurn.querySelector('.nb-parallel-stream-badge');
  const headingEl = testTurn.querySelector('.nb-answer-h');
  const numEl = testTurn.querySelector('.nb-li-num');

  const csAnswer = window.getComputedStyle(answerEl);
  const csCard = window.getComputedStyle(modelCardEl);
  const csUserBubble = window.getComputedStyle(userBubbleEl);
  const csUserText = window.getComputedStyle(userTextEl);
  const csPill = window.getComputedStyle(pillEl);
  const csChip = window.getComputedStyle(chipEl);
  const csBadge = window.getComputedStyle(badgeEl);
  const csHeading = window.getComputedStyle(headingEl);
  const csNum = window.getComputedStyle(numEl);

  const answerContrast = calcContrast(csAnswer.color, csCard.backgroundColor);
  const userBubbleContrast = calcContrast(csUserText.color, csUserBubble.backgroundColor);
  const headingContrast = calcContrast(csHeading.color, csCard.backgroundColor);
  const numContrast = calcContrast(csNum.color, csCard.backgroundColor);
  const pillContrast = calcContrast(csPill.color, csPill.backgroundColor, csCard.backgroundColor);
  const chipContrast = calcContrast(csChip.color, csChip.backgroundColor, csCard.backgroundColor);
  const badgeContrast = calcContrast(csBadge.color, csBadge.backgroundColor, csCard.backgroundColor);

  return {
    detectedTheme,
    styles: {
      answer: { color: csAnswer.color, bg: csCard.backgroundColor, contrast: answerContrast, passesAAA: answerContrast >= 7.0 },
      userBubble: { color: csUserText.color, bg: csUserBubble.backgroundColor, border: csUserBubble.borderColor, contrast: userBubbleContrast, passesAAA: userBubbleContrast >= 7.0 },
      heading: { color: csHeading.color, contrast: headingContrast, passesAAA: headingContrast >= 7.0 },
      num: { color: csNum.color, contrast: numContrast, passesAA: numContrast >= 4.5 },
      pill: { color: csPill.color, bg: csPill.backgroundColor, contrast: pillContrast, passesAAA: pillContrast >= 7.0, passesAA: pillContrast >= 4.5 },
      chip: { color: csChip.color, bg: csChip.backgroundColor, contrast: chipContrast, passesAAA: chipContrast >= 7.0 },
      badge: { color: csBadge.color, bg: csBadge.backgroundColor, contrast: badgeContrast, passesAA: badgeContrast >= 4.5 }
    }
  };
}, { stylesCss, themeJs, i18nJs, storageJs, parserJs, workerPoolJs, queueJs, inpageJs, contentJs });

console.log('Programmatic Contrast Audit:');
console.log(JSON.stringify(result, null, 2));

// Wait 800ms for smooth layout settling and font rendering
await new Promise(r => setTimeout(r, 800));

// Capture high-res screenshot
const screenshotFile = path.join(projectRoot, 'reports', 'notebooklm_light_mode_contrast_verified.png');
console.log('Capturing high-resolution viewport screenshot to:', screenshotFile);
const pngBuffer = await page.cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.writeFile(screenshotFile, Buffer.from(pngBuffer.data, 'base64'));
console.log('Screenshot successfully saved at:', screenshotFile);

// 2. Audit Dark Mode contrast
console.log('Switching to Dark Mode for dual-theme contrast verification...');
const darkResult = await page.evaluate(async () => {
  const themeMgr = window.NBTheme || new window.ThemeManager();
  themeMgr.stopObserving();
  themeMgr.applyTheme('dark');
  await new Promise(r => setTimeout(r, 400));

  const testTurn = document.getElementById('nb-turn-contrast-test');
  function parseRgb(color, parentBg) {
    if (!color) return { r: 255, g: 255, b: 255 };
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return { r: 255, g: 255, b: 255 };
    let r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3]);
    const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1.0;
    if (alpha < 1.0 && parentBg) {
      const p = parseRgb(parentBg);
      r = Math.round(r * alpha + p.r * (1 - alpha));
      g = Math.round(g * alpha + p.g * (1 - alpha));
      b = Math.round(b * alpha + p.b * (1 - alpha));
    }
    return { r, g, b };
  }
  function getLuminance(r, g, b) {
    const a = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }
  function calcContrast(fgStr, bgStr, parentBgStr) {
    const bg = parseRgb(bgStr, parentBgStr);
    const fg = parseRgb(fgStr, `rgb(${bg.r}, ${bg.g}, ${bg.b})`);
    const l1 = getLuminance(fg.r, fg.g, fg.b);
    const l2 = getLuminance(bg.r, bg.g, bg.b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  const answerEl = testTurn.querySelector('.nb-answer-content');
  const userBubbleEl = testTurn.querySelector('.nb-user-bubble');
  const userTextEl = testTurn.querySelector('.nb-user-text');
  const modelCardEl = testTurn.querySelector('.nb-model-card');
  const pillEl = testTurn.querySelector('.nb-ref-pill');
  const chipEl = testTurn.querySelector('.nb-action-chip');
  const badgeEl = testTurn.querySelector('.nb-parallel-stream-badge');
  const headingEl = testTurn.querySelector('.nb-answer-h');
  const numEl = testTurn.querySelector('.nb-li-num');

  const csAnswer = window.getComputedStyle(answerEl);
  const csCard = window.getComputedStyle(modelCardEl);
  const csUserBubble = window.getComputedStyle(userBubbleEl);
  const csUserText = window.getComputedStyle(userTextEl);
  const csPill = window.getComputedStyle(pillEl);
  const csChip = window.getComputedStyle(chipEl);
  const csBadge = window.getComputedStyle(badgeEl);
  const csHeading = window.getComputedStyle(headingEl);
  const csNum = window.getComputedStyle(numEl);

  const answerContrast = calcContrast(csAnswer.color, csCard.backgroundColor);
  const userBubbleContrast = calcContrast(csUserText.color, csUserBubble.backgroundColor);
  const headingContrast = calcContrast(csHeading.color, csCard.backgroundColor);
  const numContrast = calcContrast(csNum.color, csCard.backgroundColor);
  const pillContrast = calcContrast(csPill.color, csPill.backgroundColor, csCard.backgroundColor);
  const chipContrast = calcContrast(csChip.color, csChip.backgroundColor, csCard.backgroundColor);
  const badgeContrast = calcContrast(csBadge.color, csBadge.backgroundColor, csCard.backgroundColor);

  return {
    styles: {
      answer: { color: csAnswer.color, bg: csCard.backgroundColor, contrast: answerContrast, passesAAA: answerContrast >= 7.0 },
      userBubble: { color: csUserText.color, bg: csUserBubble.backgroundColor, border: csUserBubble.borderColor, contrast: userBubbleContrast, passesAAA: userBubbleContrast >= 7.0 },
      heading: { color: csHeading.color, contrast: headingContrast, passesAAA: headingContrast >= 7.0 },
      num: { color: csNum.color, contrast: numContrast, passesAA: numContrast >= 4.5 },
      pill: { color: csPill.color, bg: csPill.backgroundColor, contrast: pillContrast, passesAAA: pillContrast >= 7.0, passesAA: pillContrast >= 4.5 },
      chip: { color: csChip.color, bg: csChip.backgroundColor, contrast: chipContrast, passesAAA: chipContrast >= 7.0 },
      badge: { color: csBadge.color, bg: csBadge.backgroundColor, contrast: badgeContrast, passesAA: badgeContrast >= 4.5 }
    }
  };
});

console.log('Dark Mode Contrast Audit:');
console.log(JSON.stringify(darkResult, null, 2));

const darkScreenshotFile = path.join(projectRoot, 'reports', 'notebooklm_dark_mode_contrast_verified.png');
console.log('Capturing dark mode viewport screenshot to:', darkScreenshotFile);
const darkPngBuffer = await page.cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.writeFile(darkScreenshotFile, Buffer.from(darkPngBuffer.data, 'base64'));
console.log('Dark mode screenshot successfully saved at:', darkScreenshotFile);

// 3. Restore back to original detected theme (Light Mode) and clean up test turn
await page.evaluate(async () => {
  const testTurn = document.getElementById('nb-turn-contrast-test');
  if (testTurn) testTurn.remove();
  const themeMgr = window.NBTheme || new window.ThemeManager();
  themeMgr.applyTheme('light');
  themeMgr.startObserving();
});
console.log('Restored live tab to Light Mode and cleaned up test turn.');

const allLightPass = Object.values(result.styles).every(s => (s.passesAAA || s.passesAA));
const allDarkPass = Object.values(darkResult.styles).every(s => (s.passesAAA || s.passesAA));
if (!allLightPass || !allDarkPass) {
  console.error('Contrast audit failed!');
  process.exit(1);
}
console.log('Dual-theme contrast audit 100% passed (WCAG AA/AAA certified)!');
