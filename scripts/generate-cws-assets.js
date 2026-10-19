const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "cws-assets");
fs.mkdirSync(outDir, { recursive: true });

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function renderAsset({ html, width, height, outputPath }) {
  const tmpHtml = path.join(os.tmpdir(), `cws-render-nlm-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmpHtml, html, "utf8");
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "cws-render-nlm-profile-"));

  try {
    execFileSync(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-component-update",
        "--mute-audio",
        `--user-data-dir=${profileDir}`,
        `--window-size=${width},${height}`,
        `--screenshot=${outputPath}`,
        `file://${tmpHtml}`
      ],
      { stdio: "ignore", timeout: 20000 }
    );
  } finally {
    fs.rmSync(profileDir, { recursive: true, force: true });
    try { fs.unlinkSync(tmpHtml); } catch {}
  }
}

// 1. Icon 128 (128x128, no alpha)
const icon128Html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 128px;
      height: 128px;
      background: #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .badge {
      width: 110px;
      height: 110px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border-radius: 26px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
      border: 2px solid rgba(255, 255, 255, 0.2);
    }
    .arrows {
      display: flex;
      gap: 6px;
      align-items: center;
      justify-content: center;
      margin-bottom: 4px;
    }
    .arrow {
      width: 8px;
      height: 38px;
      background: #ffffff;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    .arrow:nth-child(2) {
      height: 52px;
      background: #fef08a;
    }
    .arrow:nth-child(3) {
      height: 44px;
    }
    .label {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 15px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="badge">
    <div class="arrows">
      <div class="arrow"></div>
      <div class="arrow"></div>
      <div class="arrow"></div>
    </div>
    <div class="label">NLM 5X</div>
  </div>
</body>
</html>`;

// 2. Screenshot 1: 1-5 Parallel Streams Live (1280x800)
const screenshot1Html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1280px;
      height: 800px;
      background: #0b0f19;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    header {
      height: 64px;
      background: #111827;
      border-bottom: 1px solid #1f2937;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 28px;
    }
    .logo-group {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .nlm-title {
      font-size: 18px;
      font-weight: 600;
      color: #f8fafc;
    }
    .badge-unlock {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(52, 211, 153, 0.3);
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .badge-dot {
      width: 8px;
      height: 8px;
      background: #10b981;
      border-radius: 50%;
    }
    .main-view {
      flex: 1;
      display: flex;
      padding: 24px 28px;
      gap: 24px;
    }
    .sidebar {
      width: 280px;
      background: #111827;
      border-radius: 16px;
      border: 1px solid #1f2937;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .source-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 12px;
      font-size: 13px;
      color: #cbd5e1;
    }
    .content-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .stream-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      flex: 1;
    }
    .stream-card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 14px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      position: relative;
    }
    .stream-card.active {
      border-color: #10b981;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.15);
    }
    .stream-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid #1f2937;
    }
    .stream-num {
      font-size: 12px;
      font-weight: 700;
      color: #10b981;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .stream-time {
      font-size: 11px;
      color: #94a3b8;
    }
    .stream-query {
      font-size: 13px;
      font-weight: 600;
      color: #f8fafc;
      margin-bottom: 10px;
      line-height: 1.4;
    }
    .stream-response {
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.6;
      flex: 1;
    }
    .stream-status {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      font-size: 11px;
      color: #34d399;
      font-weight: 500;
    }
    .input-bar {
      height: 68px;
      background: #111827;
      border: 1px solid #334155;
      border-radius: 16px;
      display: flex;
      align-items: center;
      padding: 0 20px;
      justify-content: space-between;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    }
    .input-mock {
      font-size: 14px;
      color: #94a3b8;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .queue-indicator {
      background: #047857;
      color: #ecfdf5;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
  </style>
</head>
<body>
  <header>
    <div class="logo-group">
      <div class="nlm-title">Google NotebookLM</div>
      <div class="badge-unlock"><div class="badge-dot"></div> 3 Active Parallel Streams (Max 5)</div>
    </div>
    <div style="font-size: 13px; color: #94a3b8;">NotebookLM Concurrency Unlocker v1.1.1</div>
  </header>
  <div class="main-view">
    <div class="sidebar">
      <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Sources (8 files)</div>
      <div class="source-card">📄 Technical Architecture.pdf</div>
      <div class="source-card">📊 Q3 Financial Statements.xlsx</div>
      <div class="source-card">📝 Executive Strategy Deck.md</div>
      <div class="source-card">🔍 User Behavioral Metrics.json</div>
    </div>
    <div class="content-area">
      <div class="stream-grid">
        <div class="stream-card active">
          <div class="stream-header">
            <span class="stream-num">⚡ Stream 1</span>
            <span class="stream-time">Streaming... 3.2s</span>
          </div>
          <div class="stream-query">What were the key revenue growth drivers in Q3 compared to Q2?</div>
          <div class="stream-response">Based on the financial statements, Q3 gross revenue grew 42% primarily driven by enterprise contract renewals and expansion in APAC cloud operations...</div>
          <div class="stream-status"><div class="badge-dot"></div> Generating response concurrently</div>
        </div>
        <div class="stream-card active">
          <div class="stream-header">
            <span class="stream-num">⚡ Stream 2</span>
            <span class="stream-time">Streaming... 1.8s</span>
          </div>
          <div class="stream-query">Summarize the latency optimization steps in the architecture document.</div>
          <div class="stream-response">The architecture specification details three latency reduction tiers: 1) Local indexed caching, 2) Zero-roundtrip SSE stream proxies, 3) Asynchronous vector embedding pre-indexing...</div>
          <div class="stream-status"><div class="badge-dot"></div> Generating response concurrently</div>
        </div>
        <div class="stream-card active">
          <div class="stream-header">
            <span class="stream-num">⚡ Stream 3</span>
            <span class="stream-time">Streaming... 0.6s</span>
          </div>
          <div class="stream-query">Extract all risk factors mentioned in the strategy deck.</div>
          <div class="stream-response">The strategic risk factors highlighted include: currency volatility across cross-border payouts, API rate limit changes on third-party AI endpoints, and EU data compliance audits...</div>
          <div class="stream-status"><div class="badge-dot"></div> Generating response concurrently</div>
        </div>
      </div>
      <div class="input-bar">
        <div class="input-mock">
          <span>Type another question while streams generate (Enter to auto-queue)...</span>
        </div>
        <div class="queue-indicator">
          <span>Queue Mode: Instant Parallel</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

// 3. Screenshot 2: Native Input Queueing (1280x800)
const screenshot2Html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1280px;
      height: 800px;
      background: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      padding: 40px;
      justify-content: space-between;
    }
    .headline {
      max-width: 900px;
    }
    .tag {
      display: inline-block;
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 34px;
      font-weight: 800;
      color: #ffffff;
      line-height: 1.25;
      margin-bottom: 12px;
    }
    p {
      font-size: 16px;
      color: #94a3b8;
      line-height: 1.6;
    }
    .comparison-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin-top: 30px;
    }
    .box {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 18px;
      padding: 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .box.highlight {
      border-color: #10b981;
      background: #11222e;
      box-shadow: 0 8px 32px rgba(16, 185, 129, 0.15);
    }
    .box-title {
      font-size: 18px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .box-title.red { color: #f87171; }
    .box-title.green { color: #34d399; }
    .list-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      font-size: 14px;
      color: #cbd5e1;
      line-height: 1.5;
    }
    .status-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
    }
    .status-badge.blocked { background: #7f1d1d; color: #fca5a5; }
    .status-badge.unlocked { background: #065f46; color: #a7f3d0; }
  </style>
</head>
<body>
  <div class="headline">
    <div class="tag">⚡ Smart Input Lock Bypass & Auto-Queue</div>
    <h1>Never Wait for NotebookLM to Finish Before Asking Next Question</h1>
    <p>Normally, Google NotebookLM locks the question box with a disabled state while thinking. This extension unlocks the input and lets you stack questions into a seamless queue or concurrent streams.</p>
  </div>
  <div class="comparison-container">
    <div class="box">
      <div class="box-title red">❌ Default NotebookLM Behavior</div>
      <div class="list-item">
        <span class="status-badge blocked">LOCKED</span>
        <span>Input field disabled while processing a prompt (30-90s wait).</span>
      </div>
      <div class="list-item">
        <span class="status-badge blocked">BLOCKED</span>
        <span>Attempting to submit follow-up prompts is rejected by the UI.</span>
      </div>
      <div class="list-item">
        <span class="status-badge blocked">IDLE</span>
        <span>Researchers must sit and wait before typing their next insight.</span>
      </div>
    </div>
    <div class="box highlight">
      <div class="box-title green">✅ Concurrency Unlocker Enabled</div>
      <div class="list-item">
        <span class="status-badge unlocked">ALWAYS EDITABLE</span>
        <span>Input box stays fully editable and responsive at 100% of the time.</span>
      </div>
      <div class="list-item">
        <span class="status-badge unlocked">1-5X STREAMS</span>
        <span>Submit up to 5 concurrent prompts that stream answers simultaneously.</span>
      </div>
      <div class="list-item">
        <span class="status-badge unlocked">AUTO-QUEUE</span>
        <span>Surplus questions queue in FIFO order and submit automatically as slots clear.</span>
      </div>
    </div>
  </div>
  <div style="font-size: 12px; color: #64748b; margin-top: 10px;">NotebookLM Concurrency Unlocker · Production Grade Productivity Tool</div>
</body>
</html>`;

// 4. Screenshot 3: Settings Popup & Control (1280x800)
const screenshot3Html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1280px;
      height: 800px;
      background: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 60px;
      padding: 60px;
    }
    .left-desc {
      flex: 1;
      max-width: 520px;
    }
    .badge {
      display: inline-block;
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(52, 211, 153, 0.3);
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 20px;
    }
    h2 {
      font-size: 36px;
      font-weight: 800;
      color: #ffffff;
      line-height: 1.25;
      margin-bottom: 16px;
    }
    p {
      font-size: 15px;
      color: #94a3b8;
      line-height: 1.7;
      margin-bottom: 24px;
    }
    .feature-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      font-size: 14px;
      color: #cbd5e1;
    }
    .popup-card {
      width: 360px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 20px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .popup-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #334155;
      padding-bottom: 14px;
    }
    .popup-title {
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
    }
    .slider-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .slider-label {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      color: #cbd5e1;
      font-weight: 500;
    }
    .slider-val {
      color: #10b981;
      font-weight: 700;
    }
    .slider-bar {
      height: 8px;
      background: #334155;
      border-radius: 9999px;
      position: relative;
    }
    .slider-fill {
      width: 60%;
      height: 100%;
      background: #10b981;
      border-radius: 9999px;
    }
    .option-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .option-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: #0f172a;
      border-radius: 10px;
      border: 1px solid #334155;
      font-size: 13px;
    }
    .switch-on {
      width: 36px;
      height: 20px;
      background: #10b981;
      border-radius: 9999px;
      position: relative;
    }
    .switch-knob {
      width: 16px;
      height: 16px;
      background: #ffffff;
      border-radius: 50%;
      position: absolute;
      top: 2px;
      right: 2px;
    }
  </style>
</head>
<body>
  <div class="left-desc">
    <div class="badge">⚙️ Granular Control & Customization</div>
    <h2>Configure Parallelism in 1 Click</h2>
    <p>Adjust concurrency levels from 1 to 5 streams depending on your network and research intensity. Switch seamlessly between Instant Parallel streaming and FIFO Auto-Queueing.</p>
    <div class="feature-list">
      <div>✓ Real-time stream telemetry and token throughput tracking</div>
      <div>✓ Adaptive UI matching light, dark, and auto system themes</div>
      <div>✓ Safe error recovery with automatic retry on transient network drops</div>
    </div>
  </div>
  <div class="popup-card">
    <div class="popup-header">
      <div class="popup-title">Concurrency Unlocker</div>
      <div style="font-size: 12px; color: #10b981; font-weight: 600;">v1.1.1</div>
    </div>
    <div class="slider-box">
      <div class="slider-label">
        <span>Max Parallel Streams</span>
        <span class="slider-val">3 Streams</span>
      </div>
      <div class="slider-bar">
        <div class="slider-fill"></div>
      </div>
    </div>
    <div class="option-group">
      <div class="option-row">
        <span>Instant Parallel Dispatch</span>
        <div class="switch-on"><div class="switch-knob"></div></div>
      </div>
      <div class="option-row">
        <span>Adaptive Theme Match</span>
        <div class="switch-on"><div class="switch-knob"></div></div>
      </div>
      <div class="option-row">
        <span>Circuit Breaker Guard</span>
        <div class="switch-on"><div class="switch-knob"></div></div>
      </div>
    </div>
  </div>
</body>
</html>`;

// 5. Promo Small (440x280)
const promoSmallHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 440px;
      height: 280px;
      background: linear-gradient(135deg, #090d16 0%, #111e2e 100%);
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 24px;
      border: 1px solid #1e293b;
    }
    .badge {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(52, 211, 153, 0.4);
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 12px;
    }
    h2 {
      font-size: 22px;
      font-weight: 800;
      line-height: 1.3;
      margin-bottom: 8px;
    }
    p {
      font-size: 12px;
      color: #94a3b8;
      max-width: 340px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="badge">GOOGLE NOTEBOOKLM</div>
  <h2>Concurrency Unlocker</h2>
  <p>1-5 Parallel Q&A Streams · Native Input Lock Bypass · Zero Wait Time</p>
</body>
</html>`;

// 6. Promo Marquee (1400x560)
const promoMarqueeHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1400px;
      height: 560px;
      background: linear-gradient(135deg, #070a12 0%, #0d1726 50%, #0a251d 100%);
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 60px 80px;
      overflow: hidden;
      position: relative;
    }
    .content {
      max-width: 720px;
      z-index: 2;
    }
    .tag {
      display: inline-block;
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(52, 211, 153, 0.4);
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 46px;
      font-weight: 800;
      line-height: 1.2;
      margin-bottom: 16px;
    }
    p {
      font-size: 18px;
      color: #94a3b8;
      line-height: 1.6;
      margin-bottom: 30px;
    }
    .stats {
      display: flex;
      gap: 36px;
    }
    .stat-val {
      font-size: 28px;
      font-weight: 800;
      color: #34d399;
    }
    .stat-label {
      font-size: 13px;
      color: #94a3b8;
      margin-top: 4px;
    }
    .art {
      width: 440px;
      height: 380px;
      background: rgba(16, 185, 129, 0.05);
      border: 1px solid rgba(16, 185, 129, 0.2);
      border-radius: 28px;
      padding: 30px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.6);
    }
    .stream-bar {
      height: 52px;
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 12px;
      display: flex;
      align-items: center;
      padding: 0 18px;
      justify-content: space-between;
      font-size: 14px;
    }
    .stream-bar.green {
      border-color: #10b981;
      background: #064e3b;
    }
  </style>
</head>
<body>
  <div class="content">
    <div class="tag">NOTEBOOKLM PRODUCTIVITY EXTENSION</div>
    <h1>Unlock 5X Research Speed with Parallel Streams</h1>
    <p>Break Google NotebookLM's single-query barrier. Ask multiple questions at once, stack thoughts into an auto-dispatch queue, and review side-by-side answers in real time.</p>
    <div class="stats">
      <div>
        <div class="stat-val">1-5X</div>
        <div class="stat-label">Parallel Q&A Streams</div>
      </div>
      <div>
        <div class="stat-val">0ms</div>
        <div class="stat-label">Input Lock Wait Time</div>
      </div>
      <div>
        <div class="stat-val">100%</div>
        <div class="stat-label">Native UI Integration</div>
      </div>
    </div>
  </div>
  <div class="art">
    <div class="stream-bar green">
      <span>⚡ Stream 1: Financial Drivers</span>
      <span style="color: #6ee7b7; font-weight: 700;">Live</span>
    </div>
    <div class="stream-bar green">
      <span>⚡ Stream 2: Latency Bottlenecks</span>
      <span style="color: #6ee7b7; font-weight: 700;">Live</span>
    </div>
    <div class="stream-bar green">
      <span>⚡ Stream 3: Risk Factors</span>
      <span style="color: #6ee7b7; font-weight: 700;">Live</span>
    </div>
    <div class="stream-bar">
      <span>⏳ Stream 4: Strategic Recommendations</span>
      <span style="color: #94a3b8;">Queued</span>
    </div>
  </div>
</body>
</html>`;

console.log("Rendering CWS assets for NotebookLM Concurrency Unlocker...");

renderAsset({ html: icon128Html, width: 128, height: 128, outputPath: path.join(outDir, "icon-128.png") });
console.log("  Rendered icon-128.png (128x128)");

renderAsset({ html: screenshot1Html, width: 1280, height: 800, outputPath: path.join(outDir, "screenshot-1-parallel-streams.png") });
console.log("  Rendered screenshot-1-parallel-streams.png (1280x800)");

renderAsset({ html: screenshot2Html, width: 1280, height: 800, outputPath: path.join(outDir, "screenshot-2-native-input-queue.png") });
console.log("  Rendered screenshot-2-native-input-queue.png (1280x800)");

renderAsset({ html: screenshot3Html, width: 1280, height: 800, outputPath: path.join(outDir, "screenshot-3-settings-popup.png") });
console.log("  Rendered screenshot-3-settings-popup.png (1280x800)");

renderAsset({ html: promoSmallHtml, width: 440, height: 280, outputPath: path.join(outDir, "promo-small-440x280.png") });
console.log("  Rendered promo-small-440x280.png (440x280)");

renderAsset({ html: promoMarqueeHtml, width: 1400, height: 560, outputPath: path.join(outDir, "promo-marquee-1400x560.png") });
console.log("  Rendered promo-marquee-1400x560.png (1400x560)");

console.log("All CWS assets generated successfully in", outDir);
