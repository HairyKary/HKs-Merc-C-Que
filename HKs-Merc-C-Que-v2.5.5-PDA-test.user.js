// ==UserScript==
// @name         HKs Merc-C-Que v2.5.5 PDA Test
// @namespace    hks-merc-c-que-pda-test
// @version      2.5.5
// @description  Torn PDA test loader with native minimized-state and UI-position persistence.
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
  const PDA_LAUNCHER_POSITION_KEY = 'ui_launcher_position';
  const PDA_PANEL_POSITION_KEY = 'ui_panel_position';
  const PANEL_ID = 'hkmcq-panel';
  const LAUNCHER_ID = 'hkmcq-launcher';

  let lastPersistedMinimized = null;
  let lastLauncherPosition = null;
  let lastPanelPosition = null;
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

  function normalizePosition(value) {
    if (!value) return null;
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      const left = Number(parsed?.left);
      const top = Number(parsed?.top);
      if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
      return { left: Math.round(left), top: Math.round(top) };
    } catch {
      return null;
    }
  }

  async function storageGet(key, fallback = null) {
    try {
      if (typeof PDA_storage !== 'undefined' && typeof PDA_storage.get === 'function') {
        return await PDA_storage.get(key, fallback);
      }
    } catch (error) {
      console.warn(`[Merc-C-Que] PDA storage read failed for ${key}:`, error);
    }
    return fallback;
  }

  async function storageSet(key, value) {
    try {
      if (typeof PDA_storage !== 'undefined' && typeof PDA_storage.set === 'function') {
        await PDA_storage.set(key, value);
        return true;
      }
    } catch (error) {
      console.warn(`[Merc-C-Que] PDA storage save failed for ${key}:`, error);
    }
    return false;
  }

  async function loadUiState() {
    const [minimizedRaw, launcherRaw, panelRaw] = await Promise.all([
      storageGet(PDA_MINIMIZED_KEY, false),
      storageGet(PDA_LAUNCHER_POSITION_KEY, null),
      storageGet(PDA_PANEL_POSITION_KEY, null)
    ]);

    return {
      minimized: minimizedRaw === true,
      launcherPosition: normalizePosition(launcherRaw),
      panelPosition: normalizePosition(panelRaw)
    };
  }

  function samePosition(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.left === b.left && a.top === b.top;
  }

  async function persistMinimizedState(minimized) {
    const value = minimized === true;
    if (lastPersistedMinimized === value) return;
    if (await storageSet(PDA_MINIMIZED_KEY, value)) {
      lastPersistedMinimized = value;
    }
  }

  async function persistPosition(key, position, kind) {
    if (!position) return;
    const normalized = {
      left: Math.round(Number(position.left) || 0),
      top: Math.round(Number(position.top) || 0)
    };
    const previous = kind === 'launcher' ? lastLauncherPosition : lastPanelPosition;
    if (samePosition(previous, normalized)) return;
    if (await storageSet(key, JSON.stringify(normalized))) {
      if (kind === 'launcher') lastLauncherPosition = normalized;
      else lastPanelPosition = normalized;
    }
  }

  function currentPosition(element) {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null;
    return { left: Math.round(rect.left), top: Math.round(rect.top) };
  }

  function scheduleUiStatePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const launcher = document.getElementById(LAUNCHER_ID);
      const panel = document.getElementById(PANEL_ID);

      if (launcher) {
        persistMinimizedState(true);
        persistPosition(PDA_LAUNCHER_POSITION_KEY, currentPosition(launcher), 'launcher');
      } else if (panel) {
        persistMinimizedState(false);
        persistPosition(PDA_PANEL_POSITION_KEY, currentPosition(panel), 'panel');
      }
    }, 120);
  }

  function watchUiState() {
    const observer = new MutationObserver(scheduleUiStatePersist);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style']
    });

    document.addEventListener('pointerup', scheduleUiStatePersist, true);
    document.addEventListener('pointercancel', scheduleUiStatePersist, true);
    window.addEventListener('resize', scheduleUiStatePersist);
    scheduleUiStatePersist();
  }

  function patchCore(source, bootState) {
    let text = String(source || '');

    const oldClone = '  const clone = value => JSON.parse(JSON.stringify(value));';
    const fixedClone = '  function clone(value) { return JSON.parse(JSON.stringify(value)); }';
    if (text.includes(oldClone)) text = text.replace(oldClone, fixedClone);
    else if (!text.includes(fixedClone)) throw new Error('Startup helper not found in Merc-C-Que core.');

    text = text.replace('// @version      2.5.0', '// @version      2.5.5');
    text = text.replace("const VERSION = '2.5.0';", "const VERSION = '2.5.5';");

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

    const bootLines = [
      stateBoot,
      `  state.minimized = ${bootState.minimized ? 'true' : 'false'};`
    ];

    if (bootState.launcherPosition) {
      bootLines.push(`  state.launcherPosition = ${JSON.stringify(bootState.launcherPosition)};`);
    }
    if (bootState.panelPosition) {
      bootLines.push(`  state.position = ${JSON.stringify(bootState.panelPosition)};`);
    }

    text = text.replace(stateBoot, bootLines.join('\n'));
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
      console.info('[Merc-C-Que] Loading v2.5.5 PDA test build…');
      const [core, bootState] = await Promise.all([
        fetchCore(),
        loadUiState()
      ]);

      lastPersistedMinimized = bootState.minimized;
      lastLauncherPosition = bootState.launcherPosition;
      lastPanelPosition = bootState.panelPosition;

      const patched = patchCore(core, bootState);
      await nativeEvaluate(patched);
      watchUiState();

      console.info('[Merc-C-Que] v2.5.5 PDA test build started.', bootState);
    } catch (error) {
      console.error('[Merc-C-Que] v2.5.5 PDA loader failed:', error);
    }
  }

  start();
})();
