// ==UserScript==
// @name         HKs Merc-C-Que v2.5.5 Desktop Persistence Test
// @namespace    hks-merc-c-que-v255-desktop-test
// @version      2.5.5
// @description  Clean v2.5.5-era desktop test with Tampermonkey-backed UI state persistence.
// @author       HairyKary
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @require      https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/v2.5.5-clean-baseline/desktop-ui-state-bridge-v2.5.5.js
// @require      https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/2ba4105667f8d5fb931b5f1fc10f91b715b0ecf8/HKs-Merc-C-Que.user.js
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  function syncUi() {
    try {
      globalThis.__HKMCQ_SYNC_DESKTOP_UI__?.();
    } catch (error) {
      console.warn('[Merc-C-Que] Desktop UI sync trigger failed:', error);
    }
  }

  function syncSoon(delay = 100) {
    setTimeout(syncUi, delay);
  }

  document.addEventListener('pointerup', () => syncSoon(120), true);
  document.addEventListener('pointercancel', () => syncSoon(120), true);
  document.addEventListener('click', () => syncSoon(150), true);
  window.addEventListener('resize', () => syncSoon(150));
  window.addEventListener('pagehide', syncUi);
  window.addEventListener('beforeunload', syncUi);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) syncUi();
  });

  syncSoon(500);
  console.info('[Merc-C-Que] Clean v2.5.5 desktop persistence test loaded.');
})();
