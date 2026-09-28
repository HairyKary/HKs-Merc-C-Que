// ==UserScript==
// @name         HKs Merc-C-Que v2.5.3 PDA Test
// @namespace    hks-merc-c-que-pda-test
// @version      2.5.3
// @description  Torn PDA test loader using PDA native evaluation bridge.
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

  function patchCore(source) {
    let text = String(source || '');

    const oldClone = '  const clone = value => JSON.parse(JSON.stringify(value));';
    const fixedClone = '  function clone(value) { return JSON.parse(JSON.stringify(value)); }';
    if (text.includes(oldClone)) text = text.replace(oldClone, fixedClone);
    else if (!text.includes(fixedClone)) throw new Error('Startup helper not found in Merc-C-Que core.');

    text = text.replace('// @version      2.5.0', '// @version      2.5.3');
    text = text.replace("const VERSION = '2.5.0';", "const VERSION = '2.5.3';");

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
      console.info('[Merc-C-Que] Loading v2.5.3 PDA test build…');
      const core = await fetchCore();
      const patched = patchCore(core);
      await nativeEvaluate(patched);
      console.info('[Merc-C-Que] v2.5.3 PDA test build started.');
    } catch (error) {
      console.error('[Merc-C-Que] v2.5.3 PDA loader failed:', error);
    }
  }

  start();
})();
