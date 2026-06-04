'use strict';

// ── Context menu ──────────────────────────────────────────────────────────────
function registerContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'capture-full-window',
      title: 'Capture full window (includes side panels)',
      contexts: ['action'],
    });
  });
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
  registerContextMenu();
});

chrome.runtime.onStartup.addListener(registerContextMenu);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function openEditor(base64, anchorTab) {
  const captureId = crypto.randomUUID();
  await chrome.storage.local.set({ [`capture_${captureId}`]: base64 });
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`editor.html?id=${captureId}`),
    index: (anchorTab?.index ?? 0) + 1,
    active: true,
  });
}

// ── Default click: captureVisibleTab ─────────────────────────────────────────
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  const blocked = ['chrome://', 'chrome-extension://', 'edge://', 'about:'];
  if (blocked.some(p => tab.url.startsWith(p))) return;

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    await openEditor(dataUrl.slice('data:image/png;base64,'.length), tab);
  } catch (err) {
    console.error('[Screenshot] captureVisibleTab failed:', err);

    if (tab.url.startsWith('file://')) {
      // Open a helper page explaining how to allow file access
      await chrome.tabs.create({
        url: chrome.runtime.getURL('file-access.html'),
        index: tab.index + 1,
        active: true,
      });
    }
  }
});

// ── Right-click: full window via desktopCapture ───────────────────────────────
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'capture-full-window') return;

  chrome.desktopCapture.chooseDesktopMedia(['window', 'screen'], tab, async (streamId) => {
    if (!streamId) return; // user cancelled picker

    try {
      await ensureOffscreenDocument();

      // Ask the offscreen doc to capture a frame from the stream
      const base64 = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('offscreen timeout')), 15000);

        function listener(message) {
          if (message.type !== 'capture-complete') return;
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(listener);
          resolve(message.base64);
        }
        chrome.runtime.onMessage.addListener(listener);
        chrome.runtime.sendMessage({ type: 'capture-stream', streamId });
      });

      await openEditor(base64, tab);
    } catch (err) {
      console.error('[Screenshot] Full-window capture failed:', err);
    }
  });
});

// ── Offscreen document management ────────────────────────────────────────────
async function ensureOffscreenDocument() {
  const url = chrome.runtime.getURL('offscreen.html');
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url],
  });
  if (existing.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Capture a frame from the desktopCapture stream for full-window screenshots',
  });
}
