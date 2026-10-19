# Privacy Policy for NotebookLM Concurrency Unlocker

**Last updated:** October 19, 2026

## Overview

NotebookLM Concurrency Unlocker is designed to respect user privacy and operates entirely within your browser.

## Data Collection and Usage

1. **No Personal Data Collected:**
   - The extension does not collect, transmit, or store any personal data, prompts, notebook content, uploaded files, or research outputs.
   - All NotebookLM queries and responses remain strictly between your browser session and Google's official NotebookLM servers.

2. **Local Storage:**
   - The extension uses Chrome's `storage.local` API solely to persist your local user preferences (such as maximum parallel streams, UI theme preference, and queue dispatch mode).
   - This configuration data is stored locally on your device and is never transmitted to external servers.

3. **Permissions Rationale:**
   - `storage`: Required to save user preferences across browser sessions.
   - `activeTab`: Used when opening the extension popup to check if the active tab is an open NotebookLM session.
   - Host Permissions (`https://notebooklm.google.com/*`, `https://notebook.google.com/*`): Required exclusively to interact with the NotebookLM interface, manage concurrent request streams, and unblock the question input box.

4. **Third-Party Services:**
   - The extension does not integrate any third-party tracking, analytics, ads, or external telemetry libraries.
   - No remote code or scripts are executed.

## Contact

If you have any questions or feedback regarding this privacy policy, please contact:
- **Developer:** Vec Yang
- **Email:** `yanghxmail@gmail.com`
