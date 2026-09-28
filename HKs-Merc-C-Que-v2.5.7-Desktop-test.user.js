// ==UserScript==
// @name         HKs Merc-C-Que v2.5.7 Desktop Test
// @namespace    hks-merc-c-que-desktop-test
// @version      2.5.7
// @description  Desktop/Tampermonkey test loader with stable persistent UI state and positions.
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

    text = text.replace('// @version      2.5.0', '// @version      2.5.7');
    text = text.replace("const VERSION = '2.5.0';", "const VERSION = '2.5.7';");

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

  function persistPanelPosition() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const position = currentPosition(panel);
    if (position) writeStored(UI_PANEL_POSITION_KEY, position);
  }

  function persistLauncherPosition() {
    const launcher = document.getElementById(LAUNCHER_ID);
    if (!launcher) return;
    const position = currentPosition(launcher);
    if (position) writeStored(UI_LAUNCHER_POSITION_KEY, position);
  }

  function persistVisiblePosition() {
    if (document.getElementById(LAUNCHER_ID)) persistLauncherPosition();
    else if (document.getElementById(PANEL_ID)) persistPanelPosition();
  }

  function scheduleVisiblePositionPersist(delay = 0) {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistVisiblePosition, delay);
  }

  function installPersistenceListeners() {
    document.addEventListener('click', event => {
      const actionTarget = event.target.closest?.('[data-action]');
      const action = actionTarget?.dataset?.action;

      if (action === 'minimize') {
        persistPanelPosition();
        writeStored(UI_MINIMIZED_KEY, true);
        setTimeout(persistLauncherPosition, 0);
        return;
      }

      if (event.target.closest?.(`#${LAUNCHER_ID}`)) {
        persistLauncherPosition();
        writeStored(UI_MINIMIZED_KEY, false);
        setTimeout(persistPanelPosition, 0);
      }
    }, true);

    document.addEventListener('pointerup', () => scheduleVisiblePositionPersist(0), true);
    document.addEventListener('pointercancel', () => scheduleVisiblePositionPersist(0), true);
    window.addEventListener('resize', () => scheduleVisiblePositionPersist(100));

    window.addEventListener('pagehide', () => {
      persistVisiblePosition();
      writeStored(UI_MINIMIZED_KEY, !!document.getElementById(LAUNCHER_ID));
    });

    window.addEventListener('beforeunload', () => {
      persistVisiblePosition();
      writeStored(UI_MINIMIZED_KEY, !!document.getElementById(LAUNCHER_ID));
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      persistVisiblePosition();
      writeStored(UI_MINIMIZED_KEY, !!document.getElementById(LAUNCHER_ID));
    });
  }

  async function start() {
    try {
      console.info('[Merc-C-Que] Loading v2.5.7 desktop test build…');
      const bootUi = loadBootUi();
      const source = await fetchCore();
      const patched = patchCore(source, bootUi);
      eval(patched);
      installPersistenceListeners();
      console.info('[Merc-C-Que] v2.5.7 desktop test build started.');
    } catch (error) {
      console.error('[Merc-C-Que] v2.5.7 desktop loader failed:', error);
    }
  }

  start();
})();
