// ==UserScript==
// @name         HKs Merc-C-Que v2.5.3 Desktop Proxy
// @namespace    hks-merc-c-que-desktop-proxy-v253
// @version      2.5.3
// @description  Original v2.5.1 Merc-C-Que core with a Tampermonkey-backed localStorage proxy for persistent desktop state.
// @author       HairyKary
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @require      https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/desktop-first-return-baseline/desktop-localstorage-proxy-prelude-v2.5.3.js
// @require      https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/b412a58e871c6f4cf5b9237b89953d5614181930/HKs-Merc-C-Que.user.js
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  console.info('[Merc-C-Que] v2.5.3 Desktop Proxy loaded.');
})();
