// ==UserScript==
// @name         HKs Merc-C-Que
// @namespace    hks-merc-c-que
// @version      2.5.2
// @description  Torn faction chain queue organizer with the v2.5.1 desktop core and persistent Tampermonkey-backed state.
// @author       HairyKary
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @require      https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/desktop-ui-persistence-core-fix/desktop-state-store-v2.5.1.js
// @require      https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/b412a58e871c6f4cf5b9237b89953d5614181930/HKs-Merc-C-Que.user.js
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const LOCAL_STATE_KEY = 'hksMercCQue_v2';
  let lastSeenState = '';

  function syncIfChanged() {
    try {
      const current = localStorage.getItem(LOCAL_STATE_KEY) || '';
      if (!current || current === lastSeenState) return;
      lastSeenState = current;
      globalThis.__HKMCQ_DESKTOP_STATE_SYNC__?.();
    } catch (error) {
      console.warn('[Merc-C-Que] Desktop state watcher failed:', error);
    }
  }

  syncIfChanged();
  const timer = setInterval(syncIfChanged, 250);

  window.addEventListener('pagehide', () => {
    syncIfChanged();
    clearInterval(timer);
  }, { once: true });

  window.addEventListener('beforeunload', syncIfChanged);

  console.info('[Merc-C-Que] v2.5.2 desktop state persistence build loaded.');
})();
