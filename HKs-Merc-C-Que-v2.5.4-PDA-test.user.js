// ==UserScript==
// @name         HKs Merc-C-Que v2.5.4 PDA Test
// @namespace    hks-merc-c-que-pda-test
// @version      2.5.4
// @description  Torn PDA test loader with native minimized-state persistence.
// @author       HairyKary
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const CORE_URL = 'https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/b80a511b2d5ac003f078e4a86ff3fbc21fa597d3/HKs-Merc-C-Que.user.js';
  const PDA_API_KEY_LITERAL = '###PDA-APIKEY###';
  const PDA_PLACEHOLDER = ['###PDA-', 'APIKEY###'].join('');
  const PDA_KEY = PDA_API_KEY_LITERAL !== PDA_PLACEHOLDER ? PDA_API_KEY_LITERAL.trim() : '';
  const PDA_MINIMIZED_KEY = 'ui_minimized';
  const PANEL_ID = 'hkmcq-panel';
  const LAUNCHER_ID = 'hkmcq-launcher';

  let lastPersistedMinimized = null;
  let persistTimer = null;

  function responseText(response) {
    if (typeof response === 'string') return response;
    if (typeof response?.responseText === 'string') return response.responseText;
    if (typeof response?.body === 'string') return response.body;
    return '';
  }

  async function fetchCore() {
    if (typeof PDA_httpGet !== 'function') {
      throw new Error('Torn PDA HTTP bridge is not available.');
    }
    const response = await PDA_httpGet(CORE_URL, { Accept: 'text/plain' });
    const text = responseText(response);
    if (!text) throw new Error('Torn PDA returned an empty Merc-C-Que core response.');
    return text;
  }

  async function loadMinimizedState() {
    try {
      if (typeof PDA_storage !== 'undefined' && typeof PDA_storage.get === 'function') {
        const saved = await PDA_storage.get(PDA_MINIMIZED_KEY, false);
        return saved === true;
      }
    } catch (error) {
      console.warn('[Merc-C-Que] PDA minimized-state read failed:', error);
    }
    return false;
  }

  async function persistMinimizedState(minimized) {
    const value = minimized === true;
    if (lastPersistedMinimized === value) return;
    lastPersistedMinimized = value;
    try {
      if (typeof PDA_storage !== 'undefined' && typeof PDA_storage.set === 'function') {
        await PDA_storage.set(PDA_MINIMIZED_KEY, value);
      }
    } catch (error) {
      console.warn('[Merc-C-Que] PDA minimized-state save failed:', error);
      lastPersistedMinimized = null;
    }
  }

  function scheduleUiStatePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const launcher = document.getElementById(LAUNCHER_ID);
      const panel = document.getElementById(PANEL_ID);
      if (launcher) persistMinimizedState(true);
      else if (panel) persistMinimizedState(false);
    }, 75);
  }

  function watchUiState() {
    const observer = new MutationObserver(scheduleUiStatePersist);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scheduleUiStatePersist();
  }

  function patchCore(source, bootMinimized) {
    let text = String(source || '');

    const oldClone = '  const clone = value => JSON.parse(JSON.stringify(value));';
    const fixedClone = '  function clone(value) { return JSON.parse(JSON.stringify(value)); }';
    if (text.includes(oldClone)) text = text.replace(oldClone, fixedClone);
    else if (!text.includes(fixedClone)) throw new Error('Startup helper not found in Merc-C-Que core.');

    text = text.replace('// @version      2.5.0', '// @version      2.5.4');
    text = text.replace("const VERSION = '2.5.0';", "const VERSION = '2.5.4';");

    text = text.replace(
      "  const PDA_INJECTED_KEY =\n    PDA_API_KEY_LITERAL &&\n    PDA_API_KEY_LITERAL !== '###PDA-APIKEY###'\n      ? PDA_API_KEY_LITERAL.trim()\n      : '';",
      "  const PDA_INJECTED_KEY = PDA_HTTP_GET ? String(PDA_API_KEY_LITERAL || '').trim() : '';"
    );

    if (PDA_KEY) {
      text = text.replace(
        "const PDA_API_KEY_LITERAL = '###PDA-APIKEY###';",
        `const PDA_API_KEY_LITERAL = ${JSON.stringify(PDA_KEY)};`
      );
    }

    const stateBoot = '  let state = loadState();';
    if (!text.includes(stateBoot)) throw new Error('Merc-C-Que state bootstrap was not found.');
    text = text.replace(
      stateBoot,
      `${stateBoot}\n  state.minimized = ${bootMinimized ? 'true' : 'false'};`
    );

    return text;
  }

  async function nativeEvaluate(source) {
    if (!window.flutter_inappwebview?.callHandler) {
      throw new Error('Torn PDA native JavaScript bridge is not available.');
    }
    await window.flutter_inappwebview.callHandler('PDA_evaluateJavascript', source);
  }

  async function start() {
    try {
      console.info('[Merc-C-Que] Loading v2.5.4 PDA test build…');
      const [core, bootMinimized] = await Promise.all([
        fetchCore(),
        loadMinimizedState()
      ]);
      lastPersistedMinimized = bootMinimized;
      const patched = patchCore(core, bootMinimized);
      await nativeEvaluate(patched);
      watchUiState();
      console.info(`[Merc-C-Que] v2.5.4 PDA test build started (${bootMinimized ? 'minimized' : 'expanded'}).`);
    } catch (error) {
      console.error('[Merc-C-Que] v2.5.4 PDA loader failed:', error);
    }
  }

  start();
})();
