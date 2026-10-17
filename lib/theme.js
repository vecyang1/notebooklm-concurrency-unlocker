/**
 * NotebookLM 并发提问解锁器 - 主题探测与自适应配色管理器 (Theme Manager)
 * 遵循 /ui-ux-pro-max 规范与 WCAG 2.1 AA/AAA 对比度标准
 * 支持自动探测 Google NotebookLM 浅色 (Light Mode) 与深色 (Dark Mode)
 * 并提供动态实时监听、对比度数学验证与全局主题属性同步
 */

class ThemeManager {
  constructor(options = {}) {
    this._currentTheme = options.defaultTheme || 'light';
    this._listeners = new Set();
    this._observer = null;
    this._mediaQueryList = null;
    this._mediaHandler = null;
    this._isObserving = false;
  }

  /**
   * 将颜色字符串 (Hex / rgb / rgba) 解析为 { r, g, b, a }
   */
  static parseColor(colorStr) {
    if (!colorStr || typeof colorStr !== 'string') {
      return { r: 0, g: 0, b: 0, a: 1 };
    }
    const str = colorStr.trim().toLowerCase();

    // 1. Hex: #rgb, #rgba, #rrggbb, #rrggbbaa
    if (str.startsWith('#')) {
      let hex = str.slice(1);
      if (hex.length === 3 || hex.length === 4) {
        hex = hex.split('').map(c => c + c).join('');
      }
      if (hex.length === 6) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
          a: 1
        };
      }
      if (hex.length === 8) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
          a: parseInt(hex.slice(6, 8), 16) / 255
        };
      }
    }

    // 2. rgb(r, g, b) 或 rgba(r, g, b, a)
    const match = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (match) {
      return {
        r: Math.round(parseFloat(match[1])),
        g: Math.round(parseFloat(match[2])),
        b: Math.round(parseFloat(match[3])),
        a: match[4] !== undefined ? parseFloat(match[4]) : 1
      };
    }

    // 3. 常见颜色回退
    if (str === 'white') return { r: 255, g: 255, b: 255, a: 1 };
    if (str === 'black') return { r: 0, g: 0, b: 0, a: 1 };

    return { r: 255, g: 255, b: 255, a: 1 };
  }

  /**
   * 计算 WCAG 2.1 相对亮度 (Relative Luminance)
   * 范围: 0.0 (黑) ~ 1.0 (白)
   */
  static getRelativeLuminance(r, g, b) {
    const sRGB = [r, g, b].map(val => {
      const v = Math.max(0, Math.min(255, val)) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
  }

  /**
   * 计算两组颜色之间的 WCAG 对比度比率 (Contrast Ratio)
   * 公式: (L1 + 0.05) / (L2 + 0.05)，其中 L1 为较亮颜色
   * 返回值: 1.0 ~ 21.0
   */
  static getContrastRatio(foreground, background) {
    const fg = typeof foreground === 'string' ? ThemeManager.parseColor(foreground) : foreground;
    const bg = typeof background === 'string' ? ThemeManager.parseColor(background) : background;

    const l1 = ThemeManager.getRelativeLuminance(fg.r, fg.g, fg.b);
    const l2 = ThemeManager.getRelativeLuminance(bg.r, bg.g, bg.b);

    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);

    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * 感知亮度算法 (Perceived Brightness)
   * 范围: 0 ~ 255
   */
  static getPerceivedBrightness(r, g, b) {
    return (r * 299 + g * 587 + b * 114) / 1000;
  }

  /**
   * 探测页面当前所处的视觉主题 (Light vs Dark)
   * 优先级:
   * 1. html / body classList 显式标记 (dark-theme, dark-mode, dark vs light-theme, light-mode, light)
   * 2. html / body data-theme / data-color-scheme 属性
   * 3. 聊天容器或 body 的实际 computedStyle 背景色感知亮度
   * 4. 系统 prefers-color-scheme: dark 媒体查询
   * 5. 默认回退: light
   */
  detectTheme(doc) {
    const documentRef = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentRef || !documentRef.body) {
      return this._currentTheme || 'light';
    }

    const html = documentRef.documentElement;
    const body = documentRef.body;

    // 1. 检查属性
    const dataTheme = html.getAttribute('data-theme') || 
                      body.getAttribute('data-theme') ||
                      html.getAttribute('data-color-scheme') ||
                      body.getAttribute('data-color-scheme');
    if (dataTheme) {
      const lower = dataTheme.toLowerCase();
      if (lower.includes('dark')) return 'dark';
      if (lower.includes('light')) return 'light';
    }

    // 2. 检查类名 (NotebookLM 原生浅色为 luminous-ui，若开启深色则挂载 dark-theme)
    const combinedClasses = `${html.className || ''} ${body.className || ''}`.toLowerCase();
    const hasDarkClass = combinedClasses.includes('dark-theme') || 
                         combinedClasses.includes('dark-mode') || 
                         combinedClasses.split(/\s+/).includes('dark');
    const hasLightClass = combinedClasses.includes('light-theme') || 
                          combinedClasses.includes('light-mode') || 
                          combinedClasses.includes('luminous-ui') ||
                          combinedClasses.split(/\s+/).includes('light');

    if (hasDarkClass) return 'dark';
    if (hasLightClass) return 'light';

    // 3. 检查计算样式背景色 (针对 Google NotebookLM .chat-panel / .notebook / .luminous-ui / body / html)
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      const candidateElements = [
        documentRef.querySelector('.chat-panel'),
        documentRef.querySelector('.notebook'),
        documentRef.querySelector('.luminous-ui'),
        documentRef.querySelector('.chat-panel-content'),
        documentRef.querySelector('mat-card'),
        documentRef.querySelector('main'),
        body,
        html
      ].filter(Boolean);

      for (const el of candidateElements) {
        try {
          const style = window.getComputedStyle(el);
          const bg = style.backgroundColor;
          if (bg && bg !== 'transparent' && !bg.startsWith('rgba(0, 0, 0, 0)')) {
            const parsed = ThemeManager.parseColor(bg);
            if (parsed.a > 0.2) {
              const brightness = ThemeManager.getPerceivedBrightness(parsed.r, parsed.g, parsed.b);
              return brightness < 140 ? 'dark' : 'light';
            }
          }
        } catch (_) {}
      }
    }

    // 4. NotebookLM 默认是浅色 Luminous 界面，默认严格回退浅色 (Light Mode)
    // 坚决避免因客户端操作系统的深色外观设置而污染 Google NotebookLM 浅色页面的对比度
    return 'light';
  }

  /**
   * 获取当前生效的主题
   */
  getTheme() {
    return this._currentTheme;
  }

  /**
   * 应用主题并将属性同步到 DOM 节点
   */
  applyTheme(theme, doc) {
    const documentRef = doc || (typeof document !== 'undefined' ? document : null);
    const validTheme = (theme === 'dark' || theme === 'light') ? theme : 'light';
    const oldTheme = this._currentTheme;
    this._currentTheme = validTheme;

    if (documentRef) {
      if (documentRef.documentElement) {
        documentRef.documentElement.setAttribute('data-nb-theme', validTheme);
        documentRef.documentElement.setAttribute('data-theme', validTheme);
      }
      if (documentRef.body) {
        documentRef.body.setAttribute('data-nb-theme', validTheme);
        documentRef.body.setAttribute('data-theme', validTheme);
      }

      // 同步到已注入的扩展根元素
      const targetSelectors = [
        '#nb-concurrent-stream-container',
        '.nb-concurrent-turn',
        '#nb-concurrency-modal',
        '#nb-concurrency-float-btn',
        '#nb-native-queue-badge'
      ];

      for (const sel of targetSelectors) {
        try {
          const elements = documentRef.querySelectorAll(sel);
          for (const el of elements) {
            el.setAttribute('data-theme', validTheme);
          }
        } catch (_) {}
      }
    }

    if (oldTheme !== validTheme) {
      this._notify(validTheme);
    }

    return validTheme;
  }

  /**
   * 启动实时监听：MutationObserver 监听属性变更 + matchMedia 监听系统切换
   */
  startObserving(doc) {
    if (this._isObserving) return;
    const documentRef = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentRef) return;

    // 首次即时探测并应用
    const initialTheme = this.detectTheme(documentRef);
    this.applyTheme(initialTheme, documentRef);

    // 1. MutationObserver: 监听 body & html 的 class 与 style 变动
    if (typeof MutationObserver !== 'undefined' && documentRef.body) {
      this._observer = new MutationObserver(() => {
        const detected = this.detectTheme(documentRef);
        if (detected !== this._currentTheme) {
          this.applyTheme(detected, documentRef);
        }
      });

      this._observer.observe(documentRef.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme']
      });

      this._observer.observe(documentRef.body, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme']
      });
    }

    // 2. matchMedia: 监听操作系统深浅色模式切换
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try {
        this._mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
        this._mediaHandler = () => {
          const detected = this.detectTheme(documentRef);
          this.applyTheme(detected, documentRef);
        };
        if (this._mediaQueryList.addEventListener) {
          this._mediaQueryList.addEventListener('change', this._mediaHandler);
        } else if (this._mediaQueryList.addListener) {
          this._mediaQueryList.addListener(this._mediaHandler);
        }
      } catch (_) {}
    }

    this._isObserving = true;
  }

  /**
   * 停止监听并释放引用
   */
  stopObserving() {
    if (this._observer) {
      try { this._observer.disconnect(); } catch (_) {}
      this._observer = null;
    }
    if (this._mediaQueryList && this._mediaHandler) {
      try {
        if (this._mediaQueryList.removeEventListener) {
          this._mediaQueryList.removeEventListener('change', this._mediaHandler);
        } else if (this._mediaQueryList.removeListener) {
          this._mediaQueryList.removeListener(this._mediaHandler);
        }
      } catch (_) {}
      this._mediaQueryList = null;
      this._mediaHandler = null;
    }
    this._isObserving = false;
  }

  /**
   * 订阅主题变更事件
   */
  onChange(fn) {
    if (typeof fn === 'function') {
      this._listeners.add(fn);
    }
    return () => this._listeners.delete(fn);
  }

  _notify(theme) {
    for (const fn of this._listeners) {
      try { fn(theme); } catch (_) {}
    }
  }
}

const defaultTheme = new ThemeManager();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ThemeManager, defaultTheme };
} else {
  window.NBTheme = defaultTheme;
  window.ThemeManager = ThemeManager;
}
