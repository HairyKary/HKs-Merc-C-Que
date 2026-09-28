// ==UserScript==
// @name         HKs Merc-C-Que v2.5.1 Test
// @namespace    hks-merc-c-que-test
// @version      2.5.1
// @description  Temporary v2.5.1 test loader with startup initialization fix and Torn PDA key passthrough.
// @author       HairyKary
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const CORE_URL = 'https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/b80a511b2d5ac003f078e4a86ff3fbc21fa597d3/HKs-Merc-C-Que.user.js';
  const PDA_API_KEY_LITERAL = '###PDA-APIKEY###';
  const PDA_KEY = PDA_API_KEY_LITERAL !== '###PDA-APIKEY###' ? PDA_API_KEY_LITERAL.trim() : '';

  function responseText(response) {
    if (typeof response === 'string') return response;
    if (typeof response?.responseText === 'string') return response.responseText;
    if (typeof response?.body === 'string') return response.body;
    return '';
  }

  async function fetchCore() {
    const pdaGet =
      typeof window.PDA_httpGet === 'function'
        ? window.PDA_httpGet.bind(window)
        : typeof globalThis.PDA_httpGet === 'function'
          ? globalThis.PDA_httpGet.bind(globalThis)
          : null;

    if (pdaGet) {
      const response = await pdaGet(CORE_URL, { Accept: 'text/plain' });
      const text = responseText(response);
      if (!text) throw new Error('Torn PDA returned an empty Merc-C-Que core response.');
      return text;
    }

    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: CORE_URL,
          timeout: 15000,
          onload: response => {
            if (response.status < 200 || response.status >= 300) {
              reject(new Error(`Merc-C-Que core download failed (HTTP ${response.status}).`));
              return;
            }
            resolve(response.responseText || '');
          },
          onerror: () => reject(new Error('Merc-C-Que core download failed.')),
          ontimeout: () => reject(new Error('Merc-C-Que core download timed out.'))
        });
      });
    }

    const response = await fetch(CORE_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Merc-C-Que core download failed (HTTP ${response.status}).`);
    return response.text();
  }

  function patchCore(source) {
    let text = String(source || '');

    const oldClone = '  const clone = value => JSON.parse(JSON.stringify(value));';
    const fixedClone = '  function clone(value) { return JSON.parse(JSON.stringify(value)); }';

    if (!text.includes(oldClone) && !text.includes(fixedClone)) {
      throw new Error('Merc-C-Que startup helper was not found in the test core.');
    }

    text = text.replace(oldClone, fixedClone);
    text = text.replace('// @version      2.5.0', '// @version      2.5.1');
    text = text.replace("const VERSION = '2.5.0';", "const VERSION = '2.5.1';");

    if (PDA_KEY) {
      text = text.replaceAll('###PDA-APIKEY###', PDA_KEY);
    }

    return text;
  }

  async function start() {
    try {
      console.info('[Merc-C-Que] Loading v2.5.1 test build…');
      const source = await fetchCore();
      const patched = patchCore(source);
      eval(patched);
      console.info('[Merc-C-Que] v2.5.1 test build started.');
    } catch (error) {
      console.error('[Merc-C-Que] v2.5.1 test loader failed:', error);
    }
  }

  start();
})();
