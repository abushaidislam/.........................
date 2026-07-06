/**
 * Announcer content script. Runs on the Aegis web app origins ONLY
 * (see `content_scripts.matches` in manifest.json). Its sole job is to
 * stamp the extension's own runtime ID onto the page so the web app's
 * `syncVaultToExtension()` can discover it without any hard-coded ID.
 *
 * Runs at document_start so React code sees the attribute on first
 * render.
 */

/// <reference types="chrome" />

try {
  const id = chrome.runtime.id;
  const root = document.documentElement;
  if (id && root) {
    root.dataset.aegisExtensionId = id;
    root.dataset.aegisExtensionVersion = chrome.runtime.getManifest().version;
    // Also fire an event so late listeners can react without polling.
    window.dispatchEvent(
      new CustomEvent("aegis:extension-ready", { detail: { id } }),
    );
  }
} catch {
  /* Some pages (about:, chrome:) can throw — harmless. */
}

export {};
