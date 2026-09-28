// ==UserScript==
// @name         HKs Merc-C-Que v2.5.1 Event Diagnostic
// @namespace    hks-merc-c-que-event-diagnostic
// @version      2.5.1-diag1
// @description  Original v2.5.1 Merc-C-Que core with a lightweight on-screen diagnostic log.
// @author       HairyKary
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @require      https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/b412a58e871c6f4cf5b9237b89953d5614181930/HKs-Merc-C-Que.user.js
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const STATE_KEY = 'hksMercCQue_v2';
  const LOG_KEY = 'hkmcq_event_diag_log_v1';
  const PANEL_ID = 'hkmcq-panel';
  const LAUNCHER_ID = 'hkmcq-launcher';
  const OVERLAY_ID = 'hkmcq-event-diag';
  const MAX_LOGS = 80;

  let lastState = '';
  let lastDom = '';
  let pointerStart = null;

  function readState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      const s = raw ? JSON.parse(raw) : {};
      return {
        minimized: s.minimized,
        panel: s.position ?? null,
        launcher: s.launcherPosition ?? null
      };
    } catch (error) {
      return { error: error?.message || String(error) };
    }
  }

  function loadLogs() {
    try {
      const raw = localStorage.getItem(LOG_KEY);
      const logs = raw ? JSON.parse(raw) : [];
      return Array.isArray(logs) ? logs : [];
    } catch {
      return [];
    }
  }

  function storeLogs(logs) {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(-MAX_LOGS))); } catch {}
  }

  function nowText() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function describeDom() {
    return document.getElementById(LAUNCHER_ID) ? 'launcher' : document.getElementById(PANEL_ID) ? 'panel' : 'none';
  }

  function writeLog(message) {
    const logs = loadLogs();
    logs.push(`${nowText()} ${message}`);
    storeLogs(logs);
    renderOverlay();
    console.info(`[Merc-C-Que diag] ${message}`);
  }

  function renderOverlay() {
    let box = document.getElementById(OVERLAY_ID);
    if (!box) {
      box = document.createElement('div');
      box.id = OVERLAY_ID;
      box.style.cssText = [
        'position:fixed','left:8px','bottom:8px','z-index:1000002','width:min(560px,calc(100vw - 16px))',
        'max-height:190px','overflow:auto','background:rgba(10,10,10,.94)','color:#eee','border:1px solid #666',
        'border-radius:6px','padding:7px','font:11px/1.35 monospace','white-space:pre-wrap','user-select:text'
      ].join(';');
      document.body.appendChild(box);
    }
    const logs = loadLogs().slice(-12);
    const state = readState();
    box.textContent = `Merc-C-Que diagnostic\nDOM: ${describeDom()}\nState: ${JSON.stringify(state)}\n\n${logs.join('\n')}`;
  }

  function watchStateAndDom() {
    const state = JSON.stringify(readState());
    if (state !== lastState) {
      if (lastState) writeLog(`STATE ${lastState} -> ${state}`);
      lastState = state;
    }

    const dom = describeDom();
    if (dom !== lastDom) {
      if (lastDom) writeLog(`DOM ${lastDom} -> ${dom}`);
      lastDom = dom;
    }
  }

  document.addEventListener('pointerdown', event => {
    const launcher = event.target instanceof Element ? event.target.closest(`#${LAUNCHER_ID}`) : null;
    if (!launcher) return;
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    writeLog(`launcher pointerdown id=${event.pointerId} x=${Math.round(event.clientX)} y=${Math.round(event.clientY)}`);
  }, true);

  document.addEventListener('pointerup', event => {
    if (!pointerStart || event.pointerId !== pointerStart.id) return;
    const dx = Math.round(event.clientX - pointerStart.x);
    const dy = Math.round(event.clientY - pointerStart.y);
    writeLog(`launcher pointerup dx=${dx} dy=${dy}`);
    pointerStart = null;
    setTimeout(watchStateAndDom, 0);
    setTimeout(watchStateAndDom, 100);
  }, true);

  document.addEventListener('click', event => {
    const launcher = event.target instanceof Element ? event.target.closest(`#${LAUNCHER_ID}`) : null;
    if (!launcher) return;
    writeLog(`launcher click detail=${event.detail}`);
    setTimeout(watchStateAndDom, 0);
    setTimeout(watchStateAndDom, 100);
  }, true);

  window.addEventListener('pagehide', () => {
    writeLog(`pagehide ${location.href}`);
  });

  window.addEventListener('pageshow', event => {
    writeLog(`pageshow persisted=${event.persisted} ${location.href}`);
    setTimeout(watchStateAndDom, 100);
  });

  setInterval(watchStateAndDom, 150);
  setInterval(renderOverlay, 500);

  lastState = JSON.stringify(readState());
  lastDom = describeDom();
  writeLog(`diagnostic started host=${location.host} dom=${lastDom} state=${lastState}`);
})();
