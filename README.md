<!-- Scope: project-local -->
# NotebookLM Concurrency Unlocker (Chrome Extension)

**[English](README.md)** | [中文文档](README.zh-CN.md)

<p align="center">
  <img src="assets/hero-banner.png" alt="NotebookLM Concurrency Unlocker Hero Banner" width="100%">
</p>

> **Unlock simultaneous multi-query streaming and native parallel Q&A on Google NotebookLM with production-grade worker pool architecture.**

---

## 💡 Why NotebookLM Concurrency Unlocker?

On the official **Google NotebookLM** web interface, users are artificially restricted to **one question at a time**:
- While the model is thinking or streaming an answer (often taking 15 to 40 seconds), the bottom input box is set to `disabled` and the submit button is locked.
- Researchers with multiple follow-up inquiries, comparison angles, or parallel hypotheses are forced to wait sequentially, disrupting critical research flow.

Inherited from the battle-tested **BrandWorkerPool** semaphore concurrency patterns in `notebooklm-py` and `notebooklm-CX` (production automated research systems), this extension completely removes the bottleneck through dual-mode dispatch and simultaneous live in-chat streaming:

1. **⚡ Simultaneous Parallel Stream (Default Mode)**:
   - When Question 1 is generating, simply type Question 2, 3, or 4 into the bottom native input box and hit Enter.
   - The extension immediately launches an independent parallel request to Google's official streaming RPC, **rendering the question bubble and live-streaming answer card directly inside the native chat conversation stream simultaneously** alongside Question 1!
2. **⏳ Serial Native Queue (Configurable Mode)**:
   - For conversations that require strict serial context dependencies, subsequent questions automatically queue in a FIFO buffer and are submitted to the native composer one after another with zero delay.
3. **🚀 Multi-Worker Concurrency Drawer**:
   - A floating side drawer providing batch multi-line input, 1-7 parallel worker sliders, one-click Markdown export, and instant clipboard copying.
4. **🌐 Full Bilingual Support (English / 中文)**:
   - Instant one-click toggle between English and Simplified Chinese in the Drawer header, Popup menu, and Settings, persisted to `chrome.storage.local`.
5. **🌓 WCAG AAA Adaptive Dual Theme (Light & Dark Mode)**:
   - Dynamic real-time host theme detection guaranteeing WCAG AAA contrast (>= 7:1) in both NotebookLM Light Mode and Dark Mode. No more unreadable silver text or inverted dark bubbles on light pages!

---

## 🚀 Key Architectural Features

### 1. In-Chat Simultaneous Streaming Q&A
- **Aesthetic Parity**: Injected user bubbles and model response cards seamlessly match NotebookLM's dark luxury Material 3 design system.
- **True Token Streaming**: Powered by `ReadableStream` chunk decoding, text streams in real-time with an active cursor (`▍`), rather than waiting for complete response buffers.
- **Rich Actions**: Includes one-click Markdown copy, "Save to Note" integration (auto-copies structured note text and triggers native note creation), citation pills (`[1]`, `[2]`), and elapsed execution timers.

### 2. Semaphore Concurrency Worker Pool
- **Configurable Parallelism**: Adjust from 1 to 7 concurrent streams (recommended: 3–5).
- **Circuit Breaker Protection**: Automatically halts and resets after 5 consecutive transient network anomalies, preventing accidental account rate-limiting.
- **Exponential Backoff**: Handles transient HTTP 503 or network drops with automatic retry logic.

### 3. UI Observability & Diagnostic-First Verification
- **Every Rule Observable**: Concurrency limit, dispatch mode (Parallel vs. Serial), input unfreezing, and language settings are synchronized across Drawer, Popup, and Chrome Storage.
- **Built-in Connectivity Probe (Ping Probe)**: A one-click diagnostic test inside the panel sends a live wire probe to the Google streaming RPC, reporting status code, round-trip time (RTT), received bytes, and frame decoding validity.

---

## 📦 Installation & Quick Start

This extension is built with **Manifest V3**. To install in developer mode:

1. Open Google Chrome or any Chromium-based browser (Edge, Brave, Arc, Opera);
2. Navigate to `chrome://extensions/`;
3. Enable **Developer mode** in the top-right corner;
4. Click **Load unpacked** in the top-left corner;
5. Select the cloned repository directory (`notebooklm-concurrency-unlocker`).
6. Open or refresh [Google NotebookLM](https://notebooklm.google.com). You will see the `⚡ Concurrent Q&A` floating pill in the bottom-right corner, and the bottom input box will remain unlocked during answer generation!

---

## ⚙️ Configuration & Dispatch Modes

Open the drawer (or the toolbar popup) to configure:

| Setting | Options | Default | Description |
| :--- | :--- | :--- | :--- |
| **Dispatch Mode** | Parallel / Serial | **Parallel** | **Parallel**: Immediately launch concurrent request and stream into chat flow.<br>**Serial**: Queue subsequent questions and dispatch one-by-one. |
| **Workers** | 1 to 7 | **5** | Maximum simultaneous streaming connections to Google NotebookLM. |
| **Language** | English / 中文 | **Auto (English)** | Instant UI language switcher across all surfaces. |
| **Unfreeze Input** | Enabled / Disabled | **Enabled** | Keep bottom composer editable during model generation. |
| **Floating Button** | Visible / Hidden | **Visible** | Show bottom-right floating assistant pill. |

---

## 🧪 Test Suite & Evidence Verification

Following the Evidence Invariant ("An unrun check is not evidence"), this project includes a comprehensive suite of unit and end-to-end tests:

```bash
npm test
```

### Test Coverage:
- `test_parser.js`: Anti-XSSI prefix stripping, Google streaming chunk extraction, citation mapping, error frame rejection, and multi-line question parsing.
- `test_worker_pool.js`: Strict semaphore limit assertions, exponential backoff retries, and circuit breaker trip/reset states.
- `test_storage.js`: Chrome storage vs localStorage fallback and rolling telemetry metrics.
- `test_queue.js`: Native input unfreezing, IME composition protection, scoped form isolation, and dual-channel dispatch (`form.requestSubmit` + `keydown.enter`).
- `test_i18n.js`: Dictionary key parity, token interpolation, and instant language switching.
- `test_parallel_dispatch.js`: Native parallel dispatch interception, in-chat streaming turn generation, and active worker count tracking.
- `e2e_live_smoke.js`: Full automated live smoke test running in `ego-browser` against live Google NotebookLM pages with full visual screenshot audit (`reports/notebooklm_concurrency_verified.png`).

---

## 📄 License

MIT License. Built for researchers, creators, and power users.
