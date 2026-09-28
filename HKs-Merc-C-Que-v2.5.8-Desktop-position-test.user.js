// ==UserScript==
// @name         HKs Merc-C-Que v2.5.8 Desktop Position Test
// @namespace    hks-merc-c-que-desktop-position-test
// @version      2.5.8
// @description  Desktop/Tampermonkey position persistence test with no eval().
// @author       HairyKary
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @require      https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/v2.5-pda-resilience/HKs-Merc-C-Que.user.js
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const PANEL_ID = 'hkmcq-panel';
  const LAUNCHER_ID = 'hkmcq-launcher';
  const PANEL_POSITION_KEY = 'desktop_ui_panel_position_v258';
  const LAUNCHER_POSITION_KEY = 'desktop_ui_launcher_position_v258';

  const applied = new WeakSet();

  function readStored(key) {
    try {
      return GM_getValue(key, null);
    } catch (error) {
      console.warn(`[Merc-C-Que] Could not read ${key}:`, error);
      return null;
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
      return { left, top };
    } catch {
      return null;
    }
  }

  function clampPosition(element, position) {
    if (!element || !position) return null;
    const width = element.offsetWidth || 0;
    const height = element.offsetHeight || 0;
    const maxLeft = Math.max(0, window.innerWidth - Math.min(width, window.innerWidth));
    const maxTop = Math.max(0, window.innerHeight - Math.min(height, window.innerHeight));
    return {
      left: Math.max(0, Math.min(position.left, maxLeft)),
      top: Math.max(0, Math.min(position.top, maxTop))
    };
  }

  function applyPositionOnce(element, key) {
    if (!element || applied.has(element)) return;
    applied.add(element);

    const saved = normalizePosition(readStored(key));
    if (!saved) return;

    requestAnimationFrame(() => {
      const position = clampPosition(element, saved);
      if (!position) return;
      element.style.left = `${Math.round(position.left)}px`;
      element.style.top = `${Math.round(position.top)}px`;
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    });
  }

  function applySavedPositions() {
    applyPositionOnce(document.getElementById(PANEL_ID), PANEL_POSITION_KEY);
    applyPositionOnce(document.getElementById(LAUNCHER_ID), LAUNCHER_POSITION_KEY);
  }

  function savePosition(element, key) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    writeStored(key, {
      left: Math.round(rect.left),
      top: Math.round(rect.top)
    });
  }

  function saveVisiblePosition() {
    const launcher = document.getElementById(LAUNCHER_ID);
    if (launcher) {
      savePosition(launcher, LAUNCHER_POSITION_KEY);
      return;
    }

    const panel = document.getElementById(PANEL_ID);
    if (panel) savePosition(panel, PANEL_POSITION_KEY);
  }

  document.addEventListener('pointerup', () => {
    setTimeout(saveVisiblePosition, 0);
  }, false);

  document.addEventListener('pointercancel', () => {
    setTimeout(saveVisiblePosition, 0);
  }, false);

  window.addEventListener('pagehide', saveVisiblePosition);
  window.addEventListener('beforeunload', saveVisiblePosition);

  const observer = new MutationObserver(() => {
    applySavedPositions();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  applySavedPositions();
  setTimeout(applySavedPositions, 250);
  setTimeout(applySavedPositions, 1000);

  console.info('[Merc-C-Que] v2.5.8 desktop position persistence shim loaded (no eval).');
})();
