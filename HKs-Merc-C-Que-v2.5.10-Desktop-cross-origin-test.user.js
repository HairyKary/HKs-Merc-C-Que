// ==UserScript==
// @name         HKs Merc-C-Que v2.5.10 Desktop Cross-Origin Test
// @namespace    hks-merc-c-que-desktop-cross-origin-test
// @version      2.5.10
// @description  Desktop/Tampermonkey UI state and position persistence across torn.com and www.torn.com.
// @author       HairyKary
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @require      https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/v2.5-pda-resilience/desktop-state-preload-v2.5.10.js
// @require      https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/v2.5-pda-resilience/HKs-Merc-C-Que.user.js
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const PANEL_ID = 'hkmcq-panel';
  const LAUNCHER_ID = 'hkmcq-launcher';
  const MINIMIZED_KEY = 'desktop_ui_minimized_v2510';
  const PANEL_POSITION_KEY = 'desktop_ui_panel_position_v2510';
  const LAUNCHER_POSITION_KEY = 'desktop_ui_launcher_position_v2510';

  const applied = new WeakSet();

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

    const saved = normalizePosition(readStored(key, null));
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

  function saveVisibleState() {
    const launcher = document.getElementById(LAUNCHER_ID);
    const panel = document.getElementById(PANEL_ID);

    if (launcher) {
      savePosition(launcher, LAUNCHER_POSITION_KEY);
      writeStored(MINIMIZED_KEY, true);
      return;
    }

    if (panel) {
      savePosition(panel, PANEL_POSITION_KEY);
      writeStored(MINIMIZED_KEY, false);
    }
  }

  document.addEventListener('click', event => {
    const minimizeButton = event.target.closest?.('[data-action="minimize"]');
    if (minimizeButton) {
      savePosition(document.getElementById(PANEL_ID), PANEL_POSITION_KEY);
      writeStored(MINIMIZED_KEY, true);
      return;
    }

    const launcher = event.target.closest?.(`#${LAUNCHER_ID}`);
    if (launcher) {
      savePosition(launcher, LAUNCHER_POSITION_KEY);
      writeStored(MINIMIZED_KEY, false);
    }
  }, true);

  document.addEventListener('pointerup', () => {
    setTimeout(saveVisibleState, 0);
  }, false);

  document.addEventListener('pointercancel', () => {
    setTimeout(saveVisibleState, 0);
  }, false);

  window.addEventListener('pagehide', saveVisibleState);
  window.addEventListener('beforeunload', saveVisibleState);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveVisibleState();
  });

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

  console.info('[Merc-C-Que] v2.5.10 desktop cross-origin state shim loaded.');
})();
