/**
 * Fills gaps in older Android System WebViews (minSdk 24 devices may run a WebView older than
 * Chrome 103). Imported first in main.tsx, before any other module code runs.
 */

// AbortSignal.timeout: Chrome 103, Safari 16. Without it every timed fetch throws synchronously (LUMEN-APP-2).
if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = (ms: number): AbortSignal => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), ms);
    return controller.signal;
  };
}

export {};
