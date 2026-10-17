# Project Documentation

This directory contains durable project architectural specifications and engineering documentation for NotebookLM Concurrency Unlocker.

## Key Documents

| Document | Purpose |
| --- | --- |
| [`docs/architecture.md`](architecture.md) | System architecture map, data flow contracts, and runtime topology. |

## Architecture Summary

NotebookLM Concurrency Unlocker is a high-performance Chrome Extension (Manifest V3) that unlocks multi-threaded parallel Q&A on Google NotebookLM via:
1. **Inpage Streaming Wire RPC Interceptor** (`inpage.js`): Executes lightweight same-origin streamed Fetch requests and decodes Google's proprietary streaming chunk protocol.
2. **Semaphore Concurrency Worker Pool** (`lib/worker_pool.js`): Regulates 1–7 parallel requests with circuit-breaker protection and exponential backoff retry.
3. **Native Chat UI Unlocker & Observer** (`lib/queue.js`): Unfreezes the native disabled input box and manages FIFO queuing or instant parallel in-chat stream dispatch.
4. **Theme & Contrast Manager** (`lib/theme.js`): Provides dynamic real-time theme adaptation ensuring WCAG AAA (>= 7:1) contrast in both Light and Dark modes.
