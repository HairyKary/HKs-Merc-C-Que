// ==UserScript==
// @name         HKs Merc-C-Que v2.5.2 Same-Context Drag Test
// @namespace    hks-merc-c-que-same-context-drag-test
// @version      2.5.2
// @description  Exact v2.5.1 Merc-C-Que core with an in-context launcher drag/click guard for desktop testing.
// @author       HairyKary
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @require      https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/desktop-first-return-baseline/launcher-drag-same-context-prepatch.js
// @require      https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/b412a58e871c6f4cf5b9237b89953d5614181930/HKs-Merc-C-Que.user.js
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const original = globalThis.__HKMCQ_ORIGINAL_ADD_EVENT_LISTENER__;
  if (typeof original === 'function') {
    EventTarget.prototype.addEventListener = original;
    delete globalThis.__HKMCQ_ORIGINAL_ADD_EVENT_LISTENER__;
  }

  console.info('[Merc-C-Que] v2.5.2 same-context launcher drag test loaded.');
})();
