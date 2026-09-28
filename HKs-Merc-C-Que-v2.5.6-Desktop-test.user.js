// ==UserScript==
// @name         HKs Merc-C-Que v2.5.6 Desktop Test
// @namespace    hks-merc-c-que-desktop-test
// @version      2.5.6
// @description  Desktop/Tampermonkey test loader with persistent minimized state and UI positions.
// @author       HairyKary
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      raw.githubusercontent.com
// @connect      api.torn.com
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const CORE_URL = 'https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/b80a511b2d5ac003f078e4a86ff3fbc21fa597d3/HKs-Merc-C-Que.user.js';
  const PANEL_ID = 'hkmcq-panel';
  const LAUNCHER_ID = 'hkmcq-launcher';

  const UI_MINIMIZED_KEY = 'desktop_ui_minimized';
  const UI_PANEL_POSITION_KEY = 'desktop_ui_panel_position';
  const UI_LAUNCHER_POSITION_KEY = 'desktop_ui_launcher_position';

  let lastSnapshot = '';
  let persistTimer = null;

  function readStored(key, fallback = null) {
    try {
      const value = GM_getValue(key, fallback);
      return value == null ? fallback : value;
    } catch (error) {
      console.warn(`[Merc-C-Que] Could not read ${key}:`, error);
      return fallback;
    }
  }

  function writeStored(key, value) {
    try {
      GM_setValue(key, value);
    } catch (error) {
      console.warn(`[Merc-C-Que] Could not save ${key}:`, error);
    }
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

  function loadBootUi() {
    return {
      minimized: readStored(UI_MINIMIZED_KEY, false) === true,
      panelPosition: normalizePosition(readStored(UI_PANEL_POSITION_KEY, null)),
      launcherPosition: normalizePosition(readStored(UI_LAUNCHER_POSITION_KEY, null))
    };
  }

  function fetchCore() {
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

  function patchCore(source, bootUi) {
    let text = String(source || '');

    const oldClone = '  const clone = value => JSON.parse(JSON.stringify(value));';
    const fixedClone = '  function clone(value) { return JSON.parse(JSON.stringify(value)); }';
    if (text.includes(oldClone)) text = text.replace(oldClone, fixedClone);
    else if (!text.includes(fixedClone)) throw new Error('Startup helper not found in Merc-C-Que core.');

    text = text.replace('// @version      2.5.0', '// @version      2.5.6');
    text = text.replace("const VERSION = '2.5.0';", "const VERSION = '2.5.6';");

    const stateBoot = '  let state = loadState();';
    if (!text.includes(stateBoot)) throw new Error('Merc-C-Que state bootstrap was not found.');

    text = text.replace(
      stateBoot,
      `${stateBoot}\n` +
      `  state.minimized = ${bootUi.minimized ? 'true' : 'false'};\n` +
      `  state.position = ${JSON.stringify(bootUi.panelPosition)};\n` +
      `  state.launcherPosition = ${JSON.stringify(bootUi.launcherPosition)};`
    );

    return text;
  }

  function currentPosition(element) {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top)
    };
  }

  function persistUiState() {
    const panel = document.getElementById(PANEL_ID);
    const launcher = document.getElementById(LAUNCHER_ID);
    if (!panel && !launcher) return;

    const snapshot = {
      minimized: !!launcher,
      panelPosition: panel ? currentPosition(panel) : normalizePosition(readStored(UI_PANEL_POSITION_KEY, null)),
      launcherPosition: launcher ? currentPosition(launcher) : normalizePosition(readStored(UI_LAUNCHER_POSITION_KEY, null))
    };

    const signature = JSON.stringify(snapshot);
    if (signature === lastSnapshot) return;
    lastSnapshot = signature;

    writeStored(UI_MINIMIZED_KEY, snapshot.minimized);
    if (snapshot.panelPosition) writeStored(UI_PANEL_POSITION_KEY, snapshot.panelPosition);
    if (snapshot.launcherPosition) writeStored(UI_LAUNCHER_POSITION_KEY, snapshot.launcherPosition);
  }

  function schedulePersist(delay = 50) {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistUiState, delay);
  }

  function installPersistenceWatchers() {
    document.addEventListener('pointerup', () => schedulePersist(0), true);
    document.addEventListener('pointercancel', () => schedulePersist(0), true);
    window.addEventListener('resize', () => schedulePersist(100));
    window.addEventListener('pagehide', persistUiState);
    window.addEventListener('beforeunload', persistUiState);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) persistUiState();
    });

    const observer = new MutationObserver(() => schedulePersist(75));
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    schedulePersist(100);
  }

  async function start() {
    try {
      console.info('[Merc-C-Que] Loading v2.5.6 desktop test build…');
      const bootUi = loadBootUi();
      const source = await fetchCore();
      const patched = patchCore(source, bootUi);
      eval(patched);
      installPersistenceWatchers();
      console.info('[Merc-C-Que] v2.5.6 desktop test build started.');
    } catch (error) {
      console.error('[Merc-C-Que] v2.5.6 desktop loader failed:', error);
    }
  }

  start();
})();
