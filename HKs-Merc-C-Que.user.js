// ==UserScript==
// @name         HKs Merc-C-Que
// @namespace    hks-merc-c-que
// @version      2.5.12
// @description  Torn faction chain queue organizer with unified Desktop and Torn PDA support.
// @author       HairyKary
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @run-at       document-idle
// @noframes
// @homepageURL  https://github.com/HairyKary/HKs-Merc-C-Que
// @supportURL   https://github.com/HairyKary/HKs-Merc-C-Que/issues
// @updateURL    https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/v2.5.12-multitab-sync/HKs-Merc-C-Que.user.js
// @downloadURL  https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/v2.5.12-multitab-sync/HKs-Merc-C-Que.user.js
// ==/UserScript==

(async () => {
  'use strict';

  const VERSION = '2.5.12';
  const SCHEMA_VERSION = 5;
  const STORAGE_KEY = 'hksMercCQue_v2';
  const LEGACY_KEY = 'tornChainQueue_v1';
  const API_KEY_STORE = 'hksMercCQue_apiKey';
  const API_KEY_FALLBACK_STORE = 'hksMercCQue_apiKey_fallback';
  const PANEL_ID = 'hkmcq-panel';
  const LAUNCHER_ID = 'hkmcq-launcher';
  const STYLE_ID = 'hkmcq-style';
  const TOAST_ID = 'hkmcq-toast';
  const API_BASE = 'https://api.torn.com/v2';
  const PDA_API_KEY_LITERAL = '###PDA-APIKEY###';
  const PDA_API_KEY_PLACEHOLDER = ['###PDA-', 'APIKEY###'].join('');
  const PDA_MINIMIZED_STORE = 'ui_minimized';
  const PDA_LAUNCHER_POSITION_STORE = 'ui_launcher_position';
  const PDA_PANEL_POSITION_STORE = 'ui_panel_position';
  const PDA_SESSION_DISMISS_STORE = 'hkmcq_pda_launcher_dismissed';
  const TAB_SYNC_CHANNEL_NAME = 'hksMercCQue_v2_tab_sync';
  const TAB_SHARED_STATE_STORE = 'hksMercCQue_v2_shared_state';
  const TAB_LEADER_STORE = 'hksMercCQue_v2_api_leader';
  const API_LEADER_LEASE_MS = 4000;
  const API_LEADER_RENEW_MS = 1200;
  const MAX_HISTORY = 40;
  const MAX_PROCESSED = 300;
  const MAX_PENDING = 50;
  const MAX_LEDGER = 200;
  const DANGER_SECONDS = 60;
  const CRITICAL_SECONDS = 30;
  const CHAIN_CLOCK_SAFETY_SECONDS = 3;
  const TORN_CLOCK_SYNC_INTERVAL_MS = 60000;
  const DEFAULT_WAIT_WARNING_SECONDS = 240;
  const DEFAULT_TEMPLATE =
    'HIT #{hit} | UP: {current} | NEXT: {next} (#{next_hit}) | ON DECK: {ondeck} (#{ondeck_hit})';

  const DEFAULT_STATE = {
    schemaVersion: SCHEMA_VERSION,
    roster: [],
    manualNextHit: 1,
    template: DEFAULT_TEMPLATE,
    minimized: false,
    setupOpen: false,
    settingsTab: 'roster',
    position: null,
    launcherPosition: null,
    ui: {
      soundAlerts: false,
      waitWarning: true,
      waitWarningSeconds: DEFAULT_WAIT_WARNING_SECONDS
    },
    ledger: [],
    api: {
      mode: 'manual',
      attackPollSeconds: 8,
      chainPollSeconds: 10,
      paused: false,
      baselineReady: false,
      processedAttackIds: [],
      pendingHits: [],
      chainId: null,
      chainCurrent: null,
      chainMax: null,
      chainTimeout: null,
      chainTimeoutObservedAt: 0,
      lastHit: null,
      status: 'Manual mode',
      lastError: '',
      lastAttackPoll: 0,
      lastChainPoll: 0,
      lastSuccessfulSync: 0,
      consecutiveFailures: 0,
      backoffUntil: 0,
      reconciliationNote: ''
    }
  };

  const PDA_HTTP_GET =
    typeof window.PDA_httpGet === 'function'
      ? window.PDA_httpGet.bind(window)
      : typeof globalThis.PDA_httpGet === 'function'
        ? globalThis.PDA_httpGet.bind(globalThis)
        : null;

  const PDA_STORAGE = (() => {
    try {
      const candidate =
        typeof globalThis.PDA_storage !== 'undefined'
          ? globalThis.PDA_storage
          : typeof window.PDA_storage !== 'undefined'
            ? window.PDA_storage
            : null;
      return candidate && typeof candidate.get === 'function' && typeof candidate.set === 'function'
        ? candidate
        : null;
    } catch {
      return null;
    }
  })();

  const PDA_INJECTED_KEY =
    PDA_HTTP_GET &&
    PDA_API_KEY_LITERAL &&
    PDA_API_KEY_LITERAL !== PDA_API_KEY_PLACEHOLDER
      ? PDA_API_KEY_LITERAL.trim()
      : '';

  const IS_PDA = !!(PDA_HTTP_GET || PDA_STORAGE || PDA_INJECTED_KEY);

  function readPdaDismissedForSession() {
    if (!IS_PDA) return false;
    try { return sessionStorage.getItem(PDA_SESSION_DISMISS_STORE) === '1'; }
    catch { return false; }
  }

  function writePdaDismissedForSession(dismissed) {
    if (!IS_PDA) return;
    try {
      if (dismissed) sessionStorage.setItem(PDA_SESSION_DISMISS_STORE, '1');
      else sessionStorage.removeItem(PDA_SESSION_DISMISS_STORE);
    } catch {}
  }

  let state = loadState();
  if (PDA_STORAGE) {
    const savedPdaUi = await loadPdaUiState();
    if (typeof savedPdaUi.minimized === 'boolean') state.minimized = savedPdaUi.minimized;
    if (savedPdaUi.launcherPosition) state.launcherPosition = savedPdaUi.launcherPosition;
    if (savedPdaUi.panelPosition) state.position = savedPdaUi.panelPosition;
  }

  let history = [];
  let rosterDraft = null;
  let apiKeyDraft = '';
  let saveTimer = null;
  let saveTimerSync = false;
  let pdaUiSaveChain = Promise.resolve();
  let attackInFlight = false;
  let chainInFlight = false;
  let reconciliationInFlight = false;
  let panelDrag = null;
  let launcherDrag = null;
  let rosterDrag = null;
  let suppressLauncherClickUntil = 0;
  let launcherDismissedForSession = readPdaDismissedForSession();
  let pointerMoveFrame = 0;
  let pendingPointerMove = null;
  let lastVisibilityChangeAt = Date.now();
  let lastUpName = '';
  let upSince = Date.now();
  let dangerAlertedForHit = null;
  let criticalAlertedForHit = null;
  let tornClockOffsetMs = 0;
  let tornClockSyncedAt = 0;
  let tornClockSyncInFlight = false;
  let chainDeadlineTornMs = 0;
  const TAB_ID = (() => {
    try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch {}
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  })();
  let syncChannel = null;
  let sharedSequence = 0;
  let lastSharedStamp = { updatedAt: 0, sourceId: '', sequence: 0 };
  let lastPublishedSharedJson = '';
  let lastLeaderRenewAt = 0;
  let wasApiLeader = false;
  let lastReportedTabRole = '';

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function nowUnix() { return Math.floor(Date.now() / 1000); }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function normalizeStoredPosition(value) {
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

  async function pdaStorageGet(key, fallback = null) {
    if (!PDA_STORAGE) return fallback;
    try {
      return await PDA_STORAGE.get(key, fallback);
    } catch (error) {
      console.warn(`[Merc-C-Que] PDA storage read failed for ${key}:`, error);
      return fallback;
    }
  }

  async function pdaStorageSet(key, value) {
    if (!PDA_STORAGE) return false;
    try {
      await PDA_STORAGE.set(key, value);
      return true;
    } catch (error) {
      console.warn(`[Merc-C-Que] PDA storage save failed for ${key}:`, error);
      return false;
    }
  }

  async function loadPdaUiState() {
    const [minimizedRaw, launcherRaw, panelRaw] = await Promise.all([
      pdaStorageGet(PDA_MINIMIZED_STORE, null),
      pdaStorageGet(PDA_LAUNCHER_POSITION_STORE, null),
      pdaStorageGet(PDA_PANEL_POSITION_STORE, null)
    ]);
    return {
      minimized: typeof minimizedRaw === 'boolean' ? minimizedRaw : null,
      launcherPosition: normalizeStoredPosition(launcherRaw),
      panelPosition: normalizeStoredPosition(panelRaw)
    };
  }

  function persistPdaUiState() {
    if (!PDA_STORAGE) return;
    const snapshot = {
      minimized: state.minimized === true,
      launcherPosition: normalizeStoredPosition(state.launcherPosition),
      panelPosition: normalizeStoredPosition(state.position)
    };
    pdaUiSaveChain = pdaUiSaveChain
      .catch(() => {})
      .then(async () => {
        await pdaStorageSet(PDA_MINIMIZED_STORE, snapshot.minimized);
        if (snapshot.launcherPosition) {
          await pdaStorageSet(PDA_LAUNCHER_POSITION_STORE, JSON.stringify(snapshot.launcherPosition));
        }
        if (snapshot.panelPosition) {
          await pdaStorageSet(PDA_PANEL_POSITION_STORE, JSON.stringify(snapshot.panelPosition));
        }
      });
  }

  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
  }

  function makeError(message, props = {}) {
    return Object.assign(new Error(message), props);
  }

  function setPosition(element, { left, top }) {
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }

  // Skips the DOM write (and the re-parse/re-layout) when the markup is unchanged.
  const lastHtml = new WeakMap();
  function setHtml(element, html) {
    if (!element || lastHtml.get(element) === html) return;
    element.innerHTML = html;
    lastHtml.set(element, html);
  }

  function chainUrgency(remaining = remainingChainSeconds()) {
    if (remaining == null) return '';
    if (remaining <= CRITICAL_SECONDS) return 'critical';
    if (remaining <= DANGER_SECONDS) return 'danger';
    return '';
  }

  function formatTime(unix) {
    if (!unix) return '—';
    try {
      return new Date(Number(unix) * 1000).toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    } catch {
      return '—';
    }
  }

  function formatAgo(msTimestamp) {
    if (!msTimestamp) return '—';
    const seconds = Math.max(0, Math.floor((Date.now() - msTimestamp) / 1000));
    if (seconds < 5) return 'now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }

  function formatCountdown(seconds) {
    if (seconds == null || !Number.isFinite(Number(seconds))) return '—';
    const value = Math.max(0, Math.floor(Number(seconds)));
    const mins = Math.floor(value / 60);
    const secs = value % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  function tornNowMs() {
    return Date.now() + tornClockOffsetMs;
  }

  function toEpochMs(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return number < 1e12 ? number * 1000 : number;
  }

  function updateChainDeadline(chain, requestStartedAt, requestFinishedAt) {
    const timeout = Number(chain?.timeout);
    if (!Number.isFinite(timeout) || timeout <= 0 || !tornClockSyncedAt) {
      chainDeadlineTornMs = 0;
      return;
    }

    const startedAt = Number(requestStartedAt) || Date.now();
    const finishedAt = Number(requestFinishedAt) || startedAt;
    const midpointTornMs = ((startedAt + finishedAt) / 2) + tornClockOffsetMs;
    const apiEndMs = toEpochMs(chain?.end);

    if (apiEndMs > midpointTornMs && apiEndMs - midpointTornMs <= 360000) {
      chainDeadlineTornMs = apiEndMs;
      return;
    }

    chainDeadlineTornMs = midpointTornMs + (timeout * 1000);
  }

  function remainingChainSeconds() {
    const current = Number(state.api.chainCurrent);
    const timeout = Number(state.api.chainTimeout);
    if (!Number.isFinite(current) || current < 10 || !Number.isFinite(timeout) || timeout <= 0) {
      return null;
    }

    if (tornClockSyncedAt && chainDeadlineTornMs > 0) {
      const calibrated = Math.floor((chainDeadlineTornMs - tornNowMs()) / 1000);
      return Math.max(0, calibrated - CHAIN_CLOCK_SAFETY_SECONDS);
    }

    const observedAt = Number(state.api.chainTimeoutObservedAt) || Date.now();
    const elapsed = Math.floor((Date.now() - observedAt) / 1000);
    return Math.max(0, timeout - elapsed - CHAIN_CLOCK_SAFETY_SECONDS);
  }

  function isTransientError(error) {
    const status = Number(error?.httpStatus || 0);
    return error?.transient === true || status === 0 || status === 408 || status === 429 || status >= 500;
  }

  function platformLabel() {
    return IS_PDA ? 'Torn PDA' : 'Browser userscript';
  }

  function normalizeParticipant(p) {
    if (typeof p === 'string') return { name: p.trim(), status: 'ready', hits: 0 };
    let status = String(p?.status || 'ready').toLowerCase();
    if (status === 'out') status = 'afk';
    if (!['ready', 'afk'].includes(status)) status = 'ready';
    return {
      name: String(p?.name || '').trim(),
      status,
      hits: Number.isFinite(Number(p?.hits)) ? Math.max(0, Number(p.hits)) : 0
    };
  }

  function normalizeApi(api = {}) {
    return {
      ...clone(DEFAULT_STATE.api),
      ...api,
      mode: ['manual', 'assisted', 'auto'].includes(api?.mode) ? api.mode : 'manual',
      attackPollSeconds: clamp(Number(api?.attackPollSeconds) || 8, 3, 60),
      chainPollSeconds: clamp(Number(api?.chainPollSeconds) || 10, 5, 120),
      processedAttackIds: Array.isArray(api?.processedAttackIds)
        ? api.processedAttackIds.map(String).slice(0, MAX_PROCESSED) : [],
      pendingHits: Array.isArray(api?.pendingHits)
        ? api.pendingHits.slice(0, MAX_PENDING) : [],
      consecutiveFailures: Math.max(0, Number(api?.consecutiveFailures) || 0),
      backoffUntil: Math.max(0, Number(api?.backoffUntil) || 0),
      chainTimeoutObservedAt: Math.max(0, Number(api?.chainTimeoutObservedAt) || 0)
    };
  }

  function normalizeLedgerEntry(item, { id = '', mode = 'manual' } = {}) {
    return {
      id: String(item?.id || id),
      attacker: String(item?.attacker || 'Unknown'),
      chain: Number(item?.chain) || 0,
      kind: String(item?.kind || 'unknown'),
      expected: !!item?.expected,
      mode: String(item?.mode || mode),
      action: String(item?.action || 'detected'),
      timestamp: Number(item?.timestamp) || nowUnix(),
      result: String(item?.result || ''),
      undone: !!item?.undone
    };
  }

  function normalizeLedger(ledger) {
    if (!Array.isArray(ledger)) return [];
    return ledger.filter(Boolean).map(item => normalizeLedgerEntry(item)).slice(0, MAX_LEDGER);
  }

  function migrateState(saved = {}) {
    const next = { ...clone(DEFAULT_STATE), ...saved };
    next.schemaVersion = SCHEMA_VERSION;
    next.roster = Array.isArray(saved.roster) ? saved.roster.map(normalizeParticipant) : [];
    next.api = normalizeApi(saved.api);
    next.ledger = normalizeLedger(saved.ledger);
    next.ui = { ...clone(DEFAULT_STATE.ui), ...(saved.ui || {}) };
    next.ui.waitWarningSeconds = clamp(Number(next.ui.waitWarningSeconds) || DEFAULT_WAIT_WARNING_SECONDS, 60, 900);
    next.minimized = typeof saved.minimized === 'boolean' ? saved.minimized : !!saved.collapsed;
    if (!['roster', 'message', 'api', 'history'].includes(next.settingsTab)) next.settingsTab = 'roster';
    delete next.collapsed;
    return next;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return migrateState(JSON.parse(raw));
      const legacyRaw = localStorage.getItem(LEGACY_KEY);
      if (legacyRaw) {
        const old = JSON.parse(legacyRaw);
        return migrateState({
          roster: Array.isArray(old.roster) ? old.roster : [],
          manualNextHit: Math.max(1, Number(old.hitNumber ?? old.chainNumber ?? 1) || 1),
          template: String(old.template || DEFAULT_TEMPLATE).replace(/\{chain\}/gi, '{hit}'),
          minimized: !!old.collapsed,
          setupOpen: !!old.setupOpen,
          position: old.position || null
        });
      }
    } catch (error) {
      console.warn('[Merc-C-Que] State load failed:', error);
    }
    return clone(DEFAULT_STATE);
  }

  function buildSharedSnapshot() {
    const api = { ...state.api };
    delete api.lastAttackPoll;
    delete api.lastChainPoll;
    return {
      schemaVersion: state.schemaVersion,
      roster: state.roster,
      manualNextHit: state.manualNextHit,
      template: state.template,
      ui: state.ui,
      ledger: state.ledger,
      api,
      history,
      runtime: {
        lastUpName,
        upSince,
        tornClockOffsetMs,
        tornClockSyncedAt,
        chainDeadlineTornMs,
        dangerAlertedForHit,
        criticalAlertedForHit
      }
    };
  }

  function sharedStampIsNewer(envelope) {
    const updatedAt = Number(envelope?.updatedAt) || 0;
    const sourceId = String(envelope?.sourceId || '');
    const sequence = Number(envelope?.sequence) || 0;
    if (updatedAt !== lastSharedStamp.updatedAt) return updatedAt > lastSharedStamp.updatedAt;
    if (sourceId !== lastSharedStamp.sourceId) return sourceId > lastSharedStamp.sourceId;
    return sequence > lastSharedStamp.sequence;
  }

  function recordSharedStamp(envelope) {
    lastSharedStamp = {
      updatedAt: Number(envelope?.updatedAt) || 0,
      sourceId: String(envelope?.sourceId || ''),
      sequence: Number(envelope?.sequence) || 0
    };
  }

  function apiControlsSignature(api = state.api, ui = state.ui) {
    return [
      api.mode,
      api.attackPollSeconds,
      api.chainPollSeconds,
      api.paused ? 1 : 0,
      api.lastError || '',
      api.backoffUntil || 0,
      api.reconciliationNote || '',
      ui.soundAlerts ? 1 : 0,
      ui.waitWarning ? 1 : 0,
      ui.waitWarningSeconds
    ].join('|');
  }

  function publishSharedState(force = false) {
    const snapshot = buildSharedSnapshot();
    const snapshotJson = JSON.stringify(snapshot);
    if (!force && snapshotJson === lastPublishedSharedJson) return;

    const envelope = {
      type: 'state',
      sourceId: TAB_ID,
      updatedAt: Date.now(),
      sequence: ++sharedSequence,
      snapshot
    };
    lastPublishedSharedJson = snapshotJson;
    recordSharedStamp(envelope);

    try { localStorage.setItem(TAB_SHARED_STATE_STORE, JSON.stringify(envelope)); }
    catch (error) { console.warn('[Merc-C-Que] Shared-state save failed:', error); }
    try { syncChannel?.postMessage(envelope); } catch {}
  }

  function applySharedEnvelope(envelope) {
    if (!envelope || envelope.type !== 'state' || envelope.sourceId === TAB_ID) return false;
    if (!sharedStampIsNewer(envelope)) return false;
    const shared = envelope.snapshot;
    if (!shared || typeof shared !== 'object') return false;

    const rosterBefore = JSON.stringify(state.roster);
    const templateBefore = state.template;
    const apiControlsBefore = apiControlsSignature();
    const historyOpen = state.setupOpen && state.settingsTab === 'history';
    const ledgerBefore = historyOpen ? JSON.stringify(state.ledger) : '';
    const lastAttackPoll = state.api.lastAttackPoll;
    const lastChainPoll = state.api.lastChainPoll;

    state.roster = Array.isArray(shared.roster) ? shared.roster.map(normalizeParticipant) : state.roster;
    state.manualNextHit = Math.max(1, Number(shared.manualNextHit) || 1);
    state.template = typeof shared.template === 'string' ? shared.template : state.template;
    state.ui = { ...state.ui, ...(shared.ui || {}) };
    state.ledger = normalizeLedger(shared.ledger);
    state.api = normalizeApi({
      ...state.api,
      ...(shared.api || {}),
      lastAttackPoll,
      lastChainPoll
    });
    history = Array.isArray(shared.history) ? shared.history.slice(-MAX_HISTORY) : history;

    const runtime = shared.runtime || {};
    lastUpName = String(runtime.lastUpName || '');
    upSince = Number(runtime.upSince) || Date.now();
    tornClockOffsetMs = Number(runtime.tornClockOffsetMs) || 0;
    tornClockSyncedAt = Number(runtime.tornClockSyncedAt) || 0;
    chainDeadlineTornMs = Number(runtime.chainDeadlineTornMs) || 0;
    dangerAlertedForHit = runtime.dangerAlertedForHit ?? null;
    criticalAlertedForHit = runtime.criticalAlertedForHit ?? null;

    const rosterChanged = JSON.stringify(state.roster) !== rosterBefore;
    const templateChanged = state.template !== templateBefore;
    const apiControlsChanged = apiControlsSignature() !== apiControlsBefore;
    const ledgerChanged = historyOpen && JSON.stringify(state.ledger) !== ledgerBefore;
    const settingsChanged = state.setupOpen && (
      (state.settingsTab === 'roster' && rosterChanged) ||
      (state.settingsTab === 'message' && templateChanged) ||
      (state.settingsTab === 'api' && apiControlsChanged) ||
      (state.settingsTab === 'history' && ledgerChanged)
    );

    recordSharedStamp(envelope);
    lastPublishedSharedJson = JSON.stringify(buildSharedSnapshot());
    refresh({ roster: rosterChanged, settings: settingsChanged });
    return true;
  }

  function initTabSync() {
    try {
      if (typeof BroadcastChannel === 'function') {
        syncChannel = new BroadcastChannel(TAB_SYNC_CHANNEL_NAME);
        syncChannel.addEventListener('message', event => applySharedEnvelope(event.data));
      }
    } catch (error) {
      console.warn('[Merc-C-Que] BroadcastChannel unavailable; using storage sync:', error);
      syncChannel = null;
    }

    window.addEventListener('storage', event => {
      if (event.key !== TAB_SHARED_STATE_STORE || !event.newValue) return;
      try { applySharedEnvelope(JSON.parse(event.newValue)); } catch {}
    });

    let existing = null;
    try {
      const raw = localStorage.getItem(TAB_SHARED_STATE_STORE);
      if (raw) existing = JSON.parse(raw);
    } catch {}
    if (!applySharedEnvelope(existing)) publishSharedState(true);
  }

  function readApiLeaderLease() {
    try {
      const raw = localStorage.getItem(TAB_LEADER_STORE);
      if (!raw) return null;
      const lease = JSON.parse(raw);
      return lease && lease.id ? lease : null;
    } catch {
      return null;
    }
  }

  function isApiLeader() {
    const lease = readApiLeaderLease();
    return !!lease && lease.id === TAB_ID && Number(lease.expiresAt) > Date.now();
  }

  function releaseApiLeadership() {
    const lease = readApiLeaderLease();
    if (lease?.id === TAB_ID) {
      try { localStorage.removeItem(TAB_LEADER_STORE); } catch {}
    }
    wasApiLeader = false;
    lastLeaderRenewAt = 0;
  }

  function maintainApiLeadership({ forceRenew = false } = {}) {
    if (!automationActive()) {
      releaseApiLeadership();
      return false;
    }

    const now = Date.now();
    const lease = readApiLeaderLease();
    if (lease?.id === TAB_ID && Number(lease.expiresAt) > now) {
      if (forceRenew || now - lastLeaderRenewAt >= API_LEADER_RENEW_MS) {
        const renewed = { id: TAB_ID, expiresAt: now + API_LEADER_LEASE_MS, visible: !document.hidden };
        try { localStorage.setItem(TAB_LEADER_STORE, JSON.stringify(renewed)); } catch {}
        lastLeaderRenewAt = now;
      }
      wasApiLeader = true;
      return true;
    }

    if (lease?.id && Number(lease.expiresAt) > now) {
      const visibleCanPreemptHidden = !document.hidden && lease.visible === false;
      if (!visibleCanPreemptHidden) {
        wasApiLeader = false;
        return false;
      }
    }

    const candidate = { id: TAB_ID, expiresAt: now + API_LEADER_LEASE_MS, visible: !document.hidden };
    try { localStorage.setItem(TAB_LEADER_STORE, JSON.stringify(candidate)); } catch {}
    const confirmed = readApiLeaderLease();
    const won = confirmed?.id === TAB_ID && Number(confirmed.expiresAt) > now;
    if (won && !wasApiLeader) resetPollTimers();
    wasApiLeader = won;
    if (won) lastLeaderRenewAt = now;
    return won;
  }

  function tabApiRole() {
    if (!automationActive()) return '—';
    return isApiLeader() ? 'LEADER' : 'FOLLOWER';
  }

  function saveNow({ sync = true } = {}) {
    const shouldSync = sync || saveTimerSync;
    clearTimeout(saveTimer);
    saveTimer = null;
    saveTimerSync = false;
    state.schemaVersion = SCHEMA_VERSION;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('[Merc-C-Que] State save failed:', error);
    }
    persistPdaUiState();
    if (shouldSync) publishSharedState();
  }

  function saveLocalNow() {
    saveNow({ sync: false });
  }

  function saveSoon(delay = 350, { sync = true } = {}) {
    const pendingSync = saveTimer ? saveTimerSync : false;
    clearTimeout(saveTimer);
    saveTimerSync = pendingSync || sync;
    saveTimer = setTimeout(() => saveNow({ sync: saveTimerSync }), delay);
  }

  function saveLocalSoon(delay = 350) {
    saveSoon(delay, { sync: false });
  }

  function gmGet(key, fallback = '') {
    try {
      if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
    } catch {}
    try {
      return localStorage.getItem(`${API_KEY_FALLBACK_STORE}:${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function gmSet(key, value) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, value);
        return;
      }
    } catch {}
    try {
      localStorage.setItem(`${API_KEY_FALLBACK_STORE}:${key}`, String(value));
    } catch {}
  }

  function gmDelete(key) {
    try {
      if (typeof GM_deleteValue === 'function') {
        GM_deleteValue(key);
        return;
      }
    } catch {}
    try {
      localStorage.removeItem(`${API_KEY_FALLBACK_STORE}:${key}`);
    } catch {}
  }

  function getSavedApiKey() {
    return String(gmGet(API_KEY_STORE, '') || '').trim();
  }

  function getEffectiveApiKey(overrideKey = '') {
    const override = String(overrideKey || '').trim();
    if (override) return override;
    if (PDA_INJECTED_KEY) return PDA_INJECTED_KEY;
    return getSavedApiKey();
  }

  function setApiKey(key) {
    gmSet(API_KEY_STORE, String(key || '').trim());
  }

  function clearApiKey() {
    gmDelete(API_KEY_STORE);
  }

  function hasApiKey() {
    return !!getEffectiveApiKey();
  }

  function pushHistory(reason = 'queue change', meta = {}) {
    history.push({
      reason, meta: clone(meta), roster: clone(state.roster),
      manualNextHit: state.manualNextHit, ledger: clone(state.ledger)
    });
    if (history.length > MAX_HISTORY) history.shift();
  }

  function undo() {
    if (!history.length) return toast('Nothing to undo.');
    const previous = history.pop();
    state.roster = previous.roster;
    state.manualNextHit = previous.manualNextHit;
    state.ledger = previous.ledger;
    if (previous.meta?.attackId) {
      const existing = state.ledger.find(x => String(x.id) === String(previous.meta.attackId));
      if (existing) {
        existing.undone = true;
        existing.action = 'undone';
      } else {
        state.ledger.unshift({
          id: String(previous.meta.attackId),
          attacker: String(previous.meta.attacker || 'Unknown'),
          chain: Number(previous.meta.chain) || 0,
          kind: String(previous.meta.kind || 'expected'),
          expected: !!previous.meta.expected,
          mode: String(previous.meta.mode || state.api.mode),
          action: 'undone', timestamp: nowUnix(), result: '', undone: true
        });
      }
    }
    saveNow();
    refresh({ roster: true, settings: true });
    toast(`Undid: ${previous.reason}.`);
  }

  const readyParticipants = () => state.roster.filter(p => p.status === 'ready');
  const currentIndex = () => state.roster.findIndex(p => p.status === 'ready');

  function findParticipantIndex(name) {
    const needle = String(name || '').trim().toLowerCase();
    return state.roster.findIndex(p => p.name.toLowerCase() === needle);
  }

  const automationActive = () => state.api.mode !== 'manual' && hasApiKey() && !state.api.paused;

  function nextHitNumber() {
    if (state.api.mode !== 'manual' && Number.isFinite(Number(state.api.chainCurrent))) {
      return Math.max(1, Number(state.api.chainCurrent) + 1);
    }
    return Math.max(1, Number(state.manualNextHit) || 1);
  }

  function hitNumbers() {
    const hit = nextHitNumber();
    return { hit, nextHit: hit + 1, onDeckHit: hit + 2 };
  }

  function trackUpTimer() {
    const current = readyParticipants()[0]?.name || '';
    if (current !== lastUpName) {
      lastUpName = current;
      upSince = Date.now();
    }
  }

  function upWaitingSeconds() {
    trackUpTimer();
    if (!lastUpName) return 0;
    return Math.max(0, Math.floor((Date.now() - upSince) / 1000));
  }

  function sendToBack(index, recordHit = false) {
    const [participant] = state.roster.splice(index, 1);
    if (recordHit) participant.hits += 1;
    state.roster.push(participant);
    return participant;
  }

  function commitRosterChange(refreshOptions = { roster: true }) {
    trackUpTimer();
    saveNow();
    refresh(refreshOptions);
  }

  function rotateParticipant(name, { recordHit = false, saveHistory = true, reason = 'queue rotation', meta = {} } = {}) {
    const index = findParticipantIndex(name);
    if (index < 0) return false;
    if (saveHistory) pushHistory(reason, meta);
    sendToBack(index, recordHit);
    trackUpTimer();
    return true;
  }

  function manualDone() {
    if (state.api.mode !== 'manual') return toast('Switch API Mode to Manual before using DONE.');
    const index = currentIndex();
    if (index < 0) return toast('No READY participant.');
    pushHistory('manual DONE');
    const participant = sendToBack(index, true);
    state.manualNextHit = nextHitNumber() + 1;
    addLedger({
      id: `manual-${Date.now()}`, attacker: participant.name,
      chain: state.manualNextHit - 1, kind: 'manual',
      expected: true, mode: 'manual', action: 'manual-recorded'
    });
    commitRosterChange({ roster: true, settings: true });
  }

  function skipCurrent() {
    const index = currentIndex();
    if (index < 0) return toast('No READY participant.');
    pushHistory('SKIP');
    sendToBack(index);
    commitRosterChange();
  }

  function toggleStatus(index) {
    if (!state.roster[index]) return;
    pushHistory('READY / AFK change');
    state.roster[index].status = state.roster[index].status === 'ready' ? 'afk' : 'ready';
    commitRosterChange();
  }

  function removeParticipant(index) {
    if (!state.roster[index]) return;
    pushHistory('remove participant');
    state.roster.splice(index, 1);
    commitRosterChange();
  }

  function moveParticipant(from, to) {
    if (from === to || from < 0 || to < 0 || from >= state.roster.length || to >= state.roster.length) return;
    pushHistory('reorder roster');
    const [participant] = state.roster.splice(from, 1);
    state.roster.splice(to, 0, participant);
    commitRosterChange();
  }

  function parseRosterText(text) {
    const seen = new Set();
    return String(text).split(/\r?\n|,/).map(x => x.trim()).filter(name => {
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function replaceRosterFromText(text) {
    const names = parseRosterText(text);
    const old = new Map(state.roster.map(p => [p.name.toLowerCase(), p]));
    pushHistory('save roster');
    state.roster = names.map(name => {
      const existing = old.get(name.toLowerCase());
      return existing ? { ...existing, name } : { name, status: 'ready', hits: 0 };
    });
    rosterDraft = null;
    trackUpTimer();
    saveNow();
    renderSettings();
    refresh({ roster: true });
    toast(`Roster saved: ${state.roster.length} participant${state.roster.length === 1 ? '' : 's'}.`);
  }

  function setAllReady() {
    if (!state.roster.length) return;
    pushHistory('all READY');
    state.roster.forEach(p => p.status = 'ready');
    commitRosterChange();
  }

  function resetPlayerHits() {
    if (!state.roster.length || !confirm('Reset all participant completed-hit counts to 0?')) return;
    pushHistory('reset player hits');
    state.roster.forEach(p => p.hits = 0);
    saveNow();
    refresh({ roster: true });
  }

  function resetSession() {
    if (!confirm('Reset player hit counts, manual hit number, API pending notices, and set everyone READY? Roster order will stay the same.')) return;
    pushHistory('reset session');
    state.roster.forEach(p => { p.hits = 0; p.status = 'ready'; });
    state.manualNextHit = 1;
    state.api.pendingHits = [];
    state.ledger = [];
    commitRosterChange({ roster: true, settings: true });
  }

  function messageData() {
    const ready = readyParticipants();
    const nums = hitNumbers();
    return {
      current: ready[0]?.name || '—',
      next: ready[1]?.name || '—',
      ondeck: ready[2]?.name || '—',
      hit: String(nums.hit),
      next_hit: String(nums.nextHit),
      ondeck_hit: String(nums.onDeckHit),
      player_hits: String(ready[0]?.hits ?? 0),
      current_hits: String(ready[0]?.hits ?? 0),
      ready_count: String(ready.length),
      total_count: String(state.roster.length),
      queue: ready.map(p => p.name).join(', ') || '—',
      last_hitter: state.api.lastHit?.attacker || '—',
      last_hit: state.api.lastHit?.chain != null ? String(state.api.lastHit.chain) : '—',
      chain_time: formatCountdown(remainingChainSeconds())
    };
  }

  function buildMessage() {
    const data = messageData();
    return String(state.template || '').replace(
      /\{(current|next|ondeck|hit|next_hit|ondeck_hit|player_hits|current_hits|ready_count|total_count|queue|last_hitter|last_hit|chain_time)\}/gi,
      (_, key) => data[key.toLowerCase()] ?? ''
    );
  }

  async function copyText(text, successMessage = 'Copied.') {
    if (!String(text).trim()) return toast('Nothing to copy.');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    toast(successMessage);
  }

  function addLedger(entry) {
    const normalized = normalizeLedgerEntry(entry, { id: `event-${Date.now()}`, mode: state.api.mode });
    const { id } = normalized;
    state.ledger = [normalized, ...state.ledger.filter(item => String(item.id) !== id)].slice(0, MAX_LEDGER);
    return normalized;
  }

  function updateLedgerAction(id, action, extra = {}) {
    const item = state.ledger.find(entry => String(entry.id) === String(id));
    if (!item) return;
    item.action = action;
    Object.assign(item, extra);
  }

  function clearLedger() {
    if (!state.ledger.length || !confirm('Clear Merc-C-Que event history?')) return;
    state.ledger = [];
    saveNow();
    renderSettings();
    toast('Event history cleared.');
  }

  function debugSnapshot() {
    return JSON.stringify({
      mercCQueVersion: VERSION,
      schemaVersion: state.schemaVersion,
      generatedAt: new Date().toISOString(),
      platform: platformLabel(),
      pdaStorage: !!PDA_STORAGE,
      tabSync: { tabId: TAB_ID, apiRole: tabApiRole(), broadcastChannel: !!syncChannel },
      mode: state.api.mode,
      paused: state.api.paused,
      chain: {
        id: state.api.chainId,
        current: state.api.chainCurrent,
        max: state.api.chainMax,
        timeout: remainingChainSeconds()
      },
      sync: {
        lastSuccessfulSync: state.api.lastSuccessfulSync,
        consecutiveFailures: state.api.consecutiveFailures,
        backoffUntil: state.api.backoffUntil,
        reconciliationNote: state.api.reconciliationNote
      },
      queue: state.roster,
      pendingHits: state.api.pendingHits,
      lastHit: state.api.lastHit,
      recentLedger: state.ledger.slice(0, 40)
    }, null, 2);
  }

  function parseApiResponse(response) {
    const status = Number(response?.status ?? 200);
    const responseText = typeof response?.responseText === 'string'
      ? response.responseText
      : typeof response?.body === 'string'
        ? response.body
        : typeof response === 'string' ? response : '';
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : response?.responseJSON || {};
    } catch {
      throw makeError(`API returned invalid JSON (HTTP ${status || 'unknown'}).`, {
        httpStatus: status, transient: status >= 500 || status === 0
      });
    }
    if (data?.error) {
      const code = Number(data.error.code ?? 0);
      const message = data.error.error || data.error.message || 'Unknown API error';
      throw makeError(`API ${code}: ${message}`, {
        apiCode: code, httpStatus: status, transient: [5, 8, 9, 10, 14, 17].includes(code)
      });
    }
    if (status && (status < 200 || status >= 300)) {
      throw makeError(`HTTP ${status}`, {
        httpStatus: status, transient: status === 408 || status === 429 || status >= 500
      });
    }
    return data;
  }

  async function requestOnce(path, params = {}, overrideKey = '') {
    const key = getEffectiveApiKey(overrideKey);
    if (!key) {
      throw new Error(IS_PDA ? 'Torn PDA API key was not injected.' : 'No API key saved.');
    }
    const query = new URLSearchParams({
      ...params,
      timestamp: String(nowUnix()),
      comment: 'HKs Merc-C-Que'
    });
    const url = `${API_BASE}${path}?${query.toString()}`;
    const headers = {
      Authorization: `ApiKey ${key}`,
      Accept: 'application/json'
    };
    if (PDA_HTTP_GET) {
      try {
        const response = await PDA_HTTP_GET(url, headers);
        return parseApiResponse(response);
      } catch (error) {
        if (error?.apiCode || error?.httpStatus) throw error;
        throw makeError(error?.message || 'Torn PDA network request failed.', { transient: true });
      }
    }
    if (typeof GM_xmlhttpRequest !== 'function') {
      throw new Error('No supported HTTP transport is available.');
    }
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET', url, headers, timeout: 12000,
        onload: response => {
          try { resolve(parseApiResponse(response)); }
          catch (error) { reject(error); }
        },
        onerror: () => reject(makeError('Network error contacting api.torn.com.', { transient: true })),
        ontimeout: () => reject(makeError('Torn API request timed out.', { httpStatus: 408, transient: true }))
      });
    });
  }

  async function apiRequest(path, params = {}, overrideKey = '', { retries = 2 } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await requestOnce(path, params, overrideKey);
      } catch (error) {
        lastError = error;
        if (attempt >= retries || !isTransientError(error)) throw error;
        await sleep(700 * (2 ** attempt));
      }
    }
    throw lastError;
  }

  async function syncTornClock({ force = false } = {}) {
    if (!isApiLeader() || !hasApiKey() || tornClockSyncInFlight) return false;
    const now = Date.now();
    if (!force && tornClockSyncedAt && now - tornClockSyncedAt < TORN_CLOCK_SYNC_INTERVAL_MS) return true;

    tornClockSyncInFlight = true;
    const sentAt = Date.now();
    try {
      const data = await requestOnce('/faction/timestamp');
      const receivedAt = Date.now();
      const raw = data?.timestamp ?? data?.time ?? data?.server_time ?? data;
      const value = typeof raw === 'object'
        ? (raw?.timestamp ?? raw?.time ?? raw?.server_time)
        : raw;
      let serverMs = Number(value);
      if (!Number.isFinite(serverMs) || serverMs <= 0) throw new Error('Invalid Torn server timestamp.');
      if (serverMs < 1e12) serverMs *= 1000;
      tornClockOffsetMs = serverMs - ((sentAt + receivedAt) / 2);
      tornClockSyncedAt = receivedAt;
      return true;
    } catch (error) {
      console.warn('[Merc-C-Que] Torn clock calibration failed; using local fallback:', error);
      return false;
    } finally {
      tornClockSyncInFlight = false;
    }
  }

  const fetchChain = (key = '') => apiRequest('/faction/chain', {}, key);
  const fetchAttacks = (key = '') => apiRequest('/faction/attacks', {
    filters: 'outgoing', limit: '100', sort: 'DESC'
  }, key);

  function validChainAttack(attack) {
    return !!(attack && attack.attacker?.name && Number(attack.chain) > 0 && !attack.is_interrupted);
  }

  function attackId(attack) {
    return String(attack?.id ?? attack?.code ?? `${attack?.ended}-${attack?.attacker?.id}-${attack?.chain}`);
  }

  function markProcessed(id) {
    const value = String(id);
    state.api.processedAttackIds = [value, ...state.api.processedAttackIds.filter(x => x !== value)].slice(0, MAX_PROCESSED);
  }

  function addPendingHit(event) {
    if (state.api.pendingHits.some(item => String(item.id) === String(event.id))) return;
    state.api.pendingHits.push(event);
    state.api.pendingHits = state.api.pendingHits.slice(0, MAX_PENDING);
  }

  const hasSyncError = () =>
    !!state.api.lastError || state.api.consecutiveFailures > 0 || state.api.backoffUntil > 0;
  const inBackoff = () => Date.now() < Number(state.api.backoffUntil || 0);

  function resetPollTimers() {
    state.api.lastAttackPoll = 0;
    state.api.lastChainPoll = 0;
  }

  function resetApiWatch() {
    state.api.baselineReady = false;
    state.api.processedAttackIds = [];
    state.api.pendingHits = [];
    state.api.paused = false;
  }

  function recordSuccessfulSync() {
    state.api.lastSuccessfulSync = Date.now();
    state.api.consecutiveFailures = 0;
    state.api.backoffUntil = 0;
    state.api.lastError = '';
  }

  function applyBackoff(error) {
    state.api.consecutiveFailures += 1;
    const failures = state.api.consecutiveFailures;
    const delay = Math.min(60000, 2000 * (2 ** Math.min(5, failures - 1)));
    state.api.backoffUntil = Date.now() + delay;
    state.api.lastError = error?.message || String(error);
    state.api.status = `Temporary API issue — retrying in ${Math.ceil(delay / 1000)}s`;
  }

  function handleApiError(error) {
    const message = error?.message || String(error);
    if ([1, 2, 7].includes(Number(error?.apiCode))) {
      state.api.paused = true;
      state.api.lastError = message;
      state.api.status = `${message} — automation paused`;
    } else if (isTransientError(error)) {
      applyBackoff(error);
    } else {
      state.api.lastError = message;
      state.api.status = message;
    }
    saveNow();
    refresh({ settings: true });
  }

  function handleInternalProcessingError(area, error) {
    const message = error?.message || String(error);
    console.error(`[Merc-C-Que] Internal ${area} processing error:`, error);
    state.api.lastError = `Internal ${area} processing error: ${message}`;
    state.api.status = `Merc-C-Que internal ${area} processing error`;
    refresh({ settings: true });
  }

  function chainSnapshot() {
    return [
      state.api.chainId ?? '',
      state.api.chainCurrent ?? '',
      state.api.chainMax ?? '',
      state.manualNextHit,
      state.api.pendingHits.length
    ].join('|');
  }

  function processDetectedAttack(attack) {
    if (!validChainAttack(attack)) return false;
    const id = attackId(attack);
    const attacker = String(attack.attacker.name);
    const chain = Number(attack.chain);
    const current = readyParticipants()[0]?.name || '';
    const index = findParticipantIndex(attacker);
    const expected = !!current && current.toLowerCase() === attacker.toLowerCase();
    const kind = index < 0 ? 'unknown' : expected ? 'expected' : 'outoforder';
    state.api.chainCurrent = Math.max(Number(state.api.chainCurrent) || 0, chain);
    state.manualNextHit = state.api.chainCurrent + 1;
    state.api.lastHit = {
      attacker, chain, ended: Number(attack.ended) || 0, result: attack.result || ''
    };
    const attackEndedMs = toEpochMs(attack.ended);
    if (chain >= 10 && tornClockSyncedAt && attackEndedMs > 0) {
      chainDeadlineTornMs = attackEndedMs + 300000;
    }
    const event = {
      id, attacker, chain, ended: Number(attack.ended) || 0,
      result: attack.result || '', kind, expectedPlayer: current || '—'
    };
    addLedger({
      id, attacker, chain, kind, expected, mode: state.api.mode,
      action: 'detected', timestamp: Number(attack.ended) || nowUnix(), result: attack.result || ''
    });
    dangerAlertedForHit = null;
    criticalAlertedForHit = null;
    if (state.api.mode === 'auto' && index >= 0 && expected) {
      pushHistory(`AUTO hit #${chain} by ${attacker}`, {
        attackId: id, attacker, chain, kind, expected, mode: state.api.mode
      });
      rotateParticipant(attacker, { recordHit: true, saveHistory: false });
      updateLedgerAction(id, 'auto-recorded');
      state.api.status = `AUTO: ${attacker} recorded at #${chain}`;
      return true;
    }
    addPendingHit(event);
    updateLedgerAction(id, 'pending');
    if (index < 0) state.api.status = `Hit #${chain}: ${attacker} is not in the queue`;
    else if (expected) state.api.status = `Hit #${chain} detected — awaiting confirmation`;
    else state.api.status = `Out-of-order hit #${chain}: ${attacker}`;
    return true;
  }

  async function pollAttacks({ forceBaseline = false, reconciliation = false } = {}) {
    if (!isApiLeader() || attackInFlight || !hasApiKey()) return;
    if (inBackoff()) return;
    attackInFlight = true;
    state.api.lastAttackPoll = Date.now();

    let data;
    try {
      data = await fetchAttacks();
    } catch (error) {
      handleApiError(error);
      attackInFlight = false;
      return;
    }

    try {
      if (!isApiLeader()) return;
      const attacks = Array.isArray(data?.attacks) ? data.attacks : [];
      const hadSyncError = hasSyncError();
      const statusBefore = state.api.status;

      if (forceBaseline || !state.api.baselineReady) {
        attacks.forEach(attack => markProcessed(attackId(attack)));
        state.api.baselineReady = true;
        state.api.status = 'Connected — watching new faction hits';
        if (reconciliation) state.api.reconciliationNote = 'Reconnected and established a fresh attack baseline.';
        recordSuccessfulSync();
        saveNow();
        refresh();
        return;
      }

      const processed = new Set(state.api.processedAttackIds.map(String));
      const fresh = attacks
        .map(attack => ({ attack, id: attackId(attack) }))
        .filter(({ id }) => !processed.has(id))
        .sort((a, b) => (Number(a.attack.ended) - Number(b.attack.ended))
          || (Number(a.attack.chain) - Number(b.attack.chain)) || a.id.localeCompare(b.id));

      let changed = false;
      for (const { attack, id } of fresh) {
        markProcessed(id);
        if (processDetectedAttack(attack)) changed = true;
      }

      if (!fresh.length) state.api.status = 'Connected — watching new faction hits';
      if (reconciliation) {
        state.api.reconciliationNote = fresh.length
          ? `Reconciled ${fresh.length} new attack${fresh.length === 1 ? '' : 's'} after resume.`
          : 'Resume reconciliation complete — no missed attacks found.';
      }

      recordSuccessfulSync();

      const persistentChanged = fresh.length > 0 || reconciliation;
      const statusChanged = state.api.status !== statusBefore;
      const uiChanged = changed || reconciliation || hadSyncError || statusChanged;

      if (persistentChanged) saveNow();
      if (uiChanged) {
        refresh({
          roster: changed,
          pending: changed,
          settings: changed || reconciliation || hadSyncError || statusChanged
        });
      }
    } catch (error) {
      handleInternalProcessingError('attack', error);
    } finally {
      attackInFlight = false;
    }
  }

  async function pollChain({ reconciliation = false } = {}) {
    if (!isApiLeader() || chainInFlight || !hasApiKey()) return;
    if (inBackoff()) return;
    chainInFlight = true;
    state.api.lastChainPoll = Date.now();

    const requestStartedAt = Date.now();
    let requestFinishedAt = requestStartedAt;
    let data;
    try {
      data = await fetchChain();
      requestFinishedAt = Date.now();
    } catch (error) {
      handleApiError(error);
      chainInFlight = false;
      return;
    }

    try {
      if (!isApiLeader()) return;
      const before = chainSnapshot();
      const hadSyncError = hasSyncError();
      const chain = data?.chain || null;
      const chainCurrentValue = Number(chain?.current) || 0;
      const chainTimeoutValue = Number(chain?.timeout) || 0;
      const activeChain = !!chain && chainCurrentValue > 0 && chainTimeoutValue > 0;

      if (activeChain) {
        const previousId = state.api.chainId;
        const previousCurrent = Number(state.api.chainCurrent);
        const newCurrent = chainCurrentValue;
        const newId = chain.id ?? null;
        const newChain = previousId != null && newId != null && String(previousId) !== String(newId);
        if (newChain) {
          state.api.pendingHits = [];
          state.api.status = 'New chain detected — reconciling attack feed';
          state.api.reconciliationNote = 'New chain detected; retained processed attack IDs for safe reconciliation.';
          dangerAlertedForHit = null;
          criticalAlertedForHit = null;
        }
        const sameChain = previousId != null && newId != null && String(previousId) === String(newId);
        const acceptedCurrent = sameChain && Number.isFinite(previousCurrent)
          && previousCurrent >= 10 && newCurrent >= 10 && newCurrent < previousCurrent
          ? previousCurrent : newCurrent;
        state.api.chainId = newId;
        state.api.chainCurrent = acceptedCurrent;
        state.api.chainMax = Number(chain.max) || 0;
        state.api.chainTimeout = chainTimeoutValue;
        state.api.chainTimeoutObservedAt = Date.now();
        updateChainDeadline(chain, requestStartedAt, requestFinishedAt);
        state.manualNextHit = acceptedCurrent + 1;
        if (newChain && state.api.baselineReady) {
          setTimeout(() => pollAttacks({ forceBaseline: false, reconciliation: true }), 50);
        }
      } else {
        state.api.chainId = null;
        state.api.chainCurrent = null;
        state.api.chainMax = null;
        state.api.chainTimeout = null;
        state.api.chainTimeoutObservedAt = 0;
        state.manualNextHit = 1;
        chainDeadlineTornMs = 0;
        dangerAlertedForHit = null;
        criticalAlertedForHit = null;
      }

      if (reconciliation) {
        state.api.reconciliationNote = state.api.reconciliationNote || 'Chain state refreshed after resume.';
      }

      recordSuccessfulSync();

      const changed = chainSnapshot() !== before;
      if (changed || reconciliation) saveNow();
      if (changed || reconciliation || hadSyncError) refresh();
    } catch (error) {
      handleInternalProcessingError('chain', error);
    } finally {
      chainInFlight = false;
    }
  }

  async function reconcileAfterResume(reason = 'resume') {
    if (reconciliationInFlight || !automationActive()) return;
    if (!maintainApiLeadership()) {
      refresh({ settings: true });
      return;
    }
    reconciliationInFlight = true;
    state.api.status = `Rechecking Torn after ${reason}…`;
    refresh();
    try {
      await syncTornClock({ force: true });
      await pollChain({ reconciliation: true });
      await pollAttacks({ forceBaseline: false, reconciliation: true });
      state.api.reconciliationNote = state.api.reconciliationNote || 'Resume reconciliation complete.';
      saveNow();
      refresh({ settings: true });
    } finally {
      reconciliationInFlight = false;
    }
  }

  async function testApiConnection() {
    const key = String(apiKeyDraft || getEffectiveApiKey()).trim();
    if (!key) return toast(IS_PDA ? 'Torn PDA did not inject an API key.' : 'Enter or save an API key first.');
    setApiUiText('Testing API…');
    try {
      const [chainData, attackData] = await Promise.all([fetchChain(key), fetchAttacks(key)]);
      const chain = chainData?.chain;
      const attacks = Array.isArray(attackData?.attacks) ? attackData.attacks : [];
      const current = chain ? Number(chain.current) || 0 : 0;
      state.api.paused = false;
      state.api.lastError = '';
      state.api.status = `API OK — chain ${current}; attack feed accessible (${attacks.length} returned)`;
      recordSuccessfulSync();
      saveNow();
      refresh({ settings: true });
      toast(`API connection successful (${platformLabel()}).`);
    } catch (error) {
      handleApiError(error);
      toast(error?.message || 'API test failed.');
    }
  }

  function saveApiSettings() {
    const keyField = document.querySelector('#hkmcq-api-key');
    const newKey = String(keyField?.value || apiKeyDraft || '').trim();
    if (newKey && !PDA_INJECTED_KEY) {
      setApiKey(newKey);
      apiKeyDraft = '';
      resetApiWatch();
    }
    const modeElement = document.querySelector('#hkmcq-api-mode');
    const attackElement = document.querySelector('#hkmcq-attack-poll');
    const chainElement = document.querySelector('#hkmcq-chain-poll');
    const soundElement = document.querySelector('#hkmcq-sound-alerts');
    const waitElement = document.querySelector('#hkmcq-wait-warning');
    const waitSecondsElement = document.querySelector('#hkmcq-wait-seconds');
    const oldMode = state.api.mode;
    if (modeElement) state.api.mode = modeElement.value;
    if (attackElement) state.api.attackPollSeconds = clamp(Number(attackElement.value) || 8, 3, 60);
    if (chainElement) state.api.chainPollSeconds = clamp(Number(chainElement.value) || 10, 5, 120);
    if (soundElement) state.ui.soundAlerts = !!soundElement.checked;
    if (waitElement) state.ui.waitWarning = !!waitElement.checked;
    if (waitSecondsElement) {
      state.ui.waitWarningSeconds = clamp(Number(waitSecondsElement.value) || DEFAULT_WAIT_WARNING_SECONDS, 60, 900);
    }
    if (oldMode === 'manual' && state.api.mode !== 'manual') {
      resetApiWatch();
      state.api.status = 'Starting API watch…';
    }
    if (state.api.mode === 'manual') {
      state.api.status = hasApiKey() ? 'Manual mode — API watch stopped' : 'Manual mode';
    } else if (!hasApiKey()) {
      state.api.status = 'API key required';
    }
    resetPollTimers();
    state.api.consecutiveFailures = 0;
    state.api.backoffUntil = 0;
    saveNow();
    renderSettings();
    refresh();
    toast('API settings saved.');
    if (automationActive() && maintainApiLeadership()) {
      syncTornClock().finally(() => pollChain());
      pollAttacks({ forceBaseline: !state.api.baselineReady });
    }
  }

  function removeSavedApiKey() {
    if (PDA_INJECTED_KEY) {
      toast('Torn PDA supplies the API key automatically; remove or change it in Torn PDA.');
      return;
    }
    if (!confirm('Remove the saved Torn API key from Merc-C-Que?')) return;
    clearApiKey();
    apiKeyDraft = '';
    state.api.mode = 'manual';
    resetApiWatch();
    state.api.status = 'Manual mode';
    state.api.lastError = '';
    saveNow();
    renderSettings();
    refresh();
    toast('API key removed.');
  }

  function resumeApi() {
    state.api.paused = false;
    state.api.lastError = '';
    state.api.status = 'Resuming API watch…';
    resetPollTimers();
    state.api.backoffUntil = 0;
    state.api.consecutiveFailures = 0;
    saveNow();
    refresh({ settings: true });
    reconcileAfterResume('manual resume');
  }

  function confirmPendingHit(addUnknown = false) {
    const event = state.api.pendingHits[0];
    if (!event) return;
    if (event.kind === 'unknown' && !addUnknown) return;
    pushHistory(`confirm hit #${event.chain} by ${event.attacker}`, {
      attackId: event.id, attacker: event.attacker, chain: event.chain,
      kind: event.kind, expected: event.kind === 'expected', mode: state.api.mode
    });
    if (event.kind === 'unknown') {
      state.roster.push({ name: event.attacker, status: 'ready', hits: 1 });
      updateLedgerAction(event.id, 'added-and-recorded');
    } else {
      rotateParticipant(event.attacker, { recordHit: true, saveHistory: false });
      updateLedgerAction(event.id, 'recorded');
    }
    state.api.pendingHits.shift();
    state.api.status = `Recorded ${event.attacker} at hit #${event.chain}`;
    trackUpTimer();
    saveNow();
    refresh({ roster: true, pending: true, settings: true });
  }

  function ignorePendingHit() {
    const event = state.api.pendingHits.shift();
    if (!event) return;
    updateLedgerAction(event.id, 'ignored');
    state.api.status = `Ignored detected hit #${event.chain} by ${event.attacker}`;
    saveNow();
    refresh({ pending: true, settings: true });
  }

  function desiredPollSeconds(base) {
    const remaining = remainingChainSeconds();
    if (remaining != null && remaining <= DANGER_SECONDS) return 3;
    if (document.hidden) return Math.max(base, 15);
    if (state.api.chainCurrent == null) return Math.max(base, 20);
    return base;
  }

  function beepOnce(frequency = 740) {
    if (!state.ui.soundAlerts) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
      oscillator.addEventListener('ended', () => context.close());
    } catch {}
  }

  function runDangerAlerts() {
    if (state.api.mode === 'manual' || state.api.chainCurrent == null) return;
    const remaining = remainingChainSeconds();
    if (remaining == null) return;
    const hit = nextHitNumber();
    if (remaining <= CRITICAL_SECONDS && criticalAlertedForHit !== hit) {
      criticalAlertedForHit = hit;
      toast(`CHAIN CRITICAL — ${formatCountdown(remaining)} remaining.`);
      beepOnce(920);
      return;
    }
    if (remaining <= DANGER_SECONDS && dangerAlertedForHit !== hit) {
      dangerAlertedForHit = hit;
      toast(`Chain warning — ${formatCountdown(remaining)} remaining.`);
      beepOnce(720);
    }
  }

  function schedulerTick() {
    trackUpTimer();
    const leader = maintainApiLeadership();
    const role = automationActive() ? (leader ? 'LEADER' : 'FOLLOWER') : '—';
    if (role !== lastReportedTabRole) {
      lastReportedTabRole = role;
      updateApiStatusBox(role);
    }
    if (leader) runDangerAlerts();
    if (!(IS_PDA && launcherDismissedForSession)) {
      if (state.minimized) refreshLauncher();
      else refreshLiveIndicators();
    }
    if (!automationActive() || !leader || inBackoff()) return;
    const now = Date.now();
    if (!tornClockSyncedAt || now - tornClockSyncedAt >= TORN_CLOCK_SYNC_INTERVAL_MS) syncTornClock();
    if (now - Number(state.api.lastAttackPoll || 0) >= desiredPollSeconds(state.api.attackPollSeconds) * 1000) pollAttacks();
    if (now - Number(state.api.lastChainPoll || 0) >= desiredPollSeconds(state.api.chainPollSeconds) * 1000) pollChain();
  }

  function schedulerDelay() {
    if (tornClockSyncedAt && chainDeadlineTornMs > 0) {
      const remainingMs = chainDeadlineTornMs - tornNowMs();
      const untilBoundary = ((remainingMs % 1000) + 1000) % 1000;
      return Math.max(100, untilBoundary + 15);
    }
    const now = Date.now();
    const observedAt = Number(state.api.chainTimeoutObservedAt) || 0;
    const phase = observedAt > 0 ? Math.max(0, now - observedAt) % 1000 : now % 1000;
    return Math.max(100, 1000 - phase + 15);
  }

  function startScheduler() {
    const run = () => {
      schedulerTick();
      setTimeout(run, schedulerDelay());
    };
    setTimeout(run, schedulerDelay());
  }

  function detectDarkTheme() {
    try {
      const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.map(Number) || [30, 30, 30];
      return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) < 135;
    } catch {
      return true;
    }
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const dark = detectDarkTheme();
    const colors = dark
      ? { panel:'rgba(28,28,28,.98)', panel2:'#252525', text:'#f1f1f1', muted:'#aaa', border:'#505050', input:'#202020', button:'#333', hover:'#444', strong:'#fff', warn:'#3a2e17', danger:'#4a2020', active:'#4a4a4a' }
      : { panel:'rgba(248,248,248,.99)', panel2:'#ededed', text:'#222', muted:'#666', border:'#c5c5c5', input:'#fff', button:'#e4e4e4', hover:'#d8d8d8', strong:'#111', warn:'#fff4cf', danger:'#ffe0e0', active:'#d2d2d2' };
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}{--p:${colors.panel};--p2:${colors.panel2};--t:${colors.text};--m:${colors.muted};--b:${colors.border};--i:${colors.input};--btn:${colors.button};--hov:${colors.hover};--s:${colors.strong};--warn:${colors.warn};--danger:${colors.danger};--active:${colors.active};position:fixed;top:105px;right:16px;width:min(365px,calc(100vw - 12px));z-index:999999;background:var(--p);color:var(--t);border:1px solid var(--b);border-radius:9px;box-shadow:0 10px 28px rgba(0,0,0,.32);font:13px Arial,Helvetica,sans-serif;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;user-select:none;touch-action:pan-y}
      #${PANEL_ID} *{box-sizing:border-box}
      #${PANEL_ID} .head{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:7px;padding:9px 10px;background:var(--p2);border-bottom:1px solid var(--b);cursor:grab;touch-action:none}
      #${PANEL_ID} .title{flex:1;font-weight:800;color:var(--s)}
      #${PANEL_ID} .sub{font-size:10px;font-weight:400;color:var(--m);margin-top:1px}
      #${PANEL_ID} button,#${PANEL_ID} input,#${PANEL_ID} textarea,#${PANEL_ID} select{font:inherit}
      #${PANEL_ID} button{min-height:32px;border:1px solid var(--b);background:var(--btn);color:var(--t);border-radius:6px;padding:5px 8px;cursor:pointer}
      #${PANEL_ID} button:hover{background:var(--hov)} #${PANEL_ID} button:disabled{cursor:default;opacity:.45}
      #${PANEL_ID} .icon{width:32px;height:32px;padding:0} #${PANEL_ID} .main{padding:10px}
      #${PANEL_ID} .up{text-align:center;padding:10px 8px;background:var(--p2);border:1px solid var(--b);border-radius:8px}
      #${PANEL_ID} .kicker,#${PANEL_ID} .label{font-size:10px;color:var(--m)}
      #${PANEL_ID} .upLine{display:flex;justify-content:center;align-items:baseline;gap:7px;flex-wrap:wrap;margin-top:4px}
      #${PANEL_ID} .upName{font-size:21px;font-weight:800;color:var(--s)} #${PANEL_ID} .hitBadge{font-size:12px;font-weight:700;color:var(--m)}
      #${PANEL_ID} .waitWarn{margin-top:5px;font-size:10px;color:#d39a36;font-weight:700}
      #${PANEL_ID} .nextGrid{display:grid;grid-template-columns:70px 1fr;gap:5px 8px;padding:8px 3px 2px}
      #${PANEL_ID} .nextPerson{display:flex;justify-content:space-between;gap:8px} #${PANEL_ID} .queueHit{color:var(--m);font-size:10px;white-space:nowrap}
      #${PANEL_ID} .controls{display:grid;grid-template-columns:1.5fr 1fr .8fr;gap:6px;margin-top:8px} #${PANEL_ID} .done{font-weight:800} #${PANEL_ID} .done.locked{opacity:.5}
      #${PANEL_ID} .hitRow{display:grid;grid-template-columns:auto 1fr auto;gap:7px;align-items:center;margin-top:8px}
      #${PANEL_ID} input,#${PANEL_ID} textarea,#${PANEL_ID} select{width:100%;border:1px solid var(--b);background:var(--i);color:var(--t);border-radius:6px;padding:7px;outline:none}
      #${PANEL_ID} textarea{min-height:64px;resize:vertical;user-select:text} #${PANEL_ID} .preview{margin-top:8px;min-height:44px;white-space:pre-wrap;word-break:break-word;user-select:text}
      #${PANEL_ID} .copy{width:100%;margin-top:5px;font-weight:700}
      #${PANEL_ID} .apiStrip{margin-top:8px;padding:7px;border:1px solid var(--b);border-radius:6px;font-size:10px;color:var(--m);display:grid;grid-template-columns:auto 1fr auto;gap:6px;align-items:center}
      #${PANEL_ID} .apiStrip strong{color:var(--t)} #${PANEL_ID} .apiStrip.danger{background:var(--warn)} #${PANEL_ID} .apiStrip.critical{background:var(--danger);animation:hkmcqPulse 1s infinite}
      @keyframes hkmcqPulse{50%{opacity:.72}}
      #${PANEL_ID} .pending{margin-top:8px;padding:8px;border:1px solid #9b7a2e;border-radius:7px;background:var(--warn)} #${PANEL_ID} .pendingTitle{font-weight:800;margin-bottom:4px} #${PANEL_ID} .pendingText{font-size:11px;line-height:1.35}
      #${PANEL_ID} .pendingBtns{display:flex;gap:6px;margin-top:7px} #${PANEL_ID} .pendingBtns button{flex:1}
      #${PANEL_ID} .roster{margin-top:9px;max-height:245px;overflow:auto;border-top:1px solid var(--b)} #${PANEL_ID} .row{display:grid;grid-template-columns:28px minmax(0,1fr) 46px 58px 32px;gap:5px;align-items:center;padding:6px 0;border-bottom:1px solid var(--b)}
      #${PANEL_ID} .handle{height:32px;display:grid;place-items:center;color:var(--m);touch-action:none;cursor:grab} #${PANEL_ID} .row.dragging{opacity:.55} #${PANEL_ID} .row.dragover{outline:1px dashed var(--m)}
      #${PANEL_ID} .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap} #${PANEL_ID} .name .assigned{font-size:10px;color:var(--m);margin-left:4px} #${PANEL_ID} .phits{text-align:right;font-size:10px;color:var(--m)}
      #${PANEL_ID} .status{font-size:10px;font-weight:700;padding:3px 5px;text-transform:uppercase} #${PANEL_ID} .status[data-status=afk]{opacity:.55} #${PANEL_ID} .remove{width:32px;height:32px;padding:0}
      #${PANEL_ID} .settingsShell{margin-top:10px;padding-top:10px;border-top:1px solid var(--b)} #${PANEL_ID} .settingsTabs{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px} #${PANEL_ID} .settingsTabs button{padding:5px 3px;font-size:10px} #${PANEL_ID} .settingsTabs button.active{background:var(--active);font-weight:800}
      #${PANEL_ID} .sectionTitle{font-weight:800;margin-bottom:5px} #${PANEL_ID} .help{font-size:10px;color:var(--m);line-height:1.35;margin-top:4px} #${PANEL_ID} .miniRow{display:flex;gap:6px;margin-top:6px} #${PANEL_ID} .miniRow>*{flex:1}
      #${PANEL_ID} .settingsGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px} #${PANEL_ID} .full{grid-column:1/-1} #${PANEL_ID} .checkRow{display:flex;gap:8px;align-items:center;font-size:11px} #${PANEL_ID} .checkRow input{width:auto}
      #${PANEL_ID} .apiStatusBox{margin-top:6px;padding:7px;border:1px solid var(--b);border-radius:6px;font-size:10px;line-height:1.45;color:var(--m)} #${PANEL_ID} .ledger{max-height:250px;overflow:auto;border:1px solid var(--b);border-radius:6px} #${PANEL_ID} .ledgerRow{display:grid;grid-template-columns:58px minmax(0,1fr) auto;gap:6px;padding:6px;border-bottom:1px solid var(--b);font-size:10px} #${PANEL_ID} .ledgerMeta{color:var(--m)}
      #${LAUNCHER_ID}{position:fixed;z-index:1000000;min-width:112px;min-height:42px;padding:0 11px;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid ${colors.border};border-radius:8px;background:${colors.panel2};color:${colors.text};box-shadow:0 6px 18px rgba(0,0,0,.35);font:800 11px Arial,Helvetica,sans-serif;cursor:grab;user-select:none;touch-action:none}
      #${LAUNCHER_ID}.danger{background:${colors.warn}} #${LAUNCHER_ID}.critical{background:${colors.danger};animation:hkmcqPulse 1s infinite} #${LAUNCHER_ID} .launcherDot{width:8px;height:8px;border-radius:50%;background:#777;flex:0 0 auto} #${LAUNCHER_ID}.active .launcherDot{background:#5ca85c} #${LAUNCHER_ID}.paused .launcherDot{background:#c9902f} #${LAUNCHER_ID}.pending .launcherDot{background:#c45b5b}
      #${LAUNCHER_ID} .launcherBadge{position:absolute;top:-7px;right:-7px;min-width:19px;height:19px;padding:0 5px;display:grid;place-items:center;border-radius:999px;background:#b33;color:#fff;font-size:10px;font-weight:800}
      #${LAUNCHER_ID} .launcherClose{width:26px;height:26px;margin-left:2px;display:grid;place-items:center;border-radius:5px;font-size:17px;line-height:1;font-weight:800;opacity:.72;cursor:pointer}
      #${LAUNCHER_ID} .launcherClose:hover{background:rgba(127,127,127,.18);opacity:1}
      #${TOAST_ID}{position:fixed;right:20px;bottom:22px;z-index:1000001;background:rgba(20,20,20,.95);color:#fff;border-radius:7px;padding:9px 12px;font:13px Arial,Helvetica,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35)}
      @media(max-width:600px){#${PANEL_ID}{width:calc(100vw - 8px);left:4px!important;right:auto!important;top:58px;border-radius:8px;font-size:14px}#${PANEL_ID} button{min-height:40px}#${PANEL_ID} .icon,#${PANEL_ID} .remove,#${PANEL_ID} .handle{width:40px;height:40px}#${PANEL_ID} .row{grid-template-columns:40px minmax(0,1fr) 42px 62px 40px}#${PANEL_ID} .roster{max-height:36vh}#${PANEL_ID} .controls{grid-template-columns:1.45fr 1fr 1fr}#${PANEL_ID} .upName{font-size:23px}#${LAUNCHER_ID}{min-height:46px;min-width:126px}}
    `;
    document.head.appendChild(style);
  }

  function defaultLauncherPosition() {
    return {
      left: Math.max(8, window.innerWidth - 135),
      top: Math.max(70, Math.round(window.innerHeight * 0.45))
    };
  }

  function clampPanelPosition(left, top, panel) {
    const mobile = window.innerWidth <= 600;
    if (mobile) {
      return { left: 4, top: clamp(top, 4, Math.max(4, window.innerHeight - 180)) };
    }
    return {
      left: clamp(left, 0, Math.max(0, window.innerWidth - panel.offsetWidth)),
      top: clamp(top, 0, Math.max(0, window.innerHeight - 180))
    };
  }

  function clampLauncherPosition(left, top, launcher) {
    return {
      left: clamp(left, 6, Math.max(6, window.innerWidth - launcher.offsetWidth - 6)),
      top: clamp(top, 6, Math.max(6, window.innerHeight - launcher.offsetHeight - 6))
    };
  }

  function adjustPanelViewport() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    panel.style.maxHeight = `${Math.max(180, window.innerHeight - rect.top - 12)}px`;
  }

  function minimizeApp() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      const rect = panel.getBoundingClientRect();
      state.position = { left: Math.round(rect.left), top: Math.round(rect.top) };
    }
    state.minimized = true;
    saveLocalNow();
    renderApp();
  }

  function restoreApp() {
    state.minimized = false;
    saveLocalNow();
    renderApp();
  }

  function dismissLauncherForSession() {
    if (!IS_PDA) return;
    launcherDismissedForSession = true;
    writePdaDismissedForSession(true);
    launcherDrag = null;
    document.getElementById(LAUNCHER_ID)?.remove();
  }

  function rosterRowsHtml() {
    if (!state.roster.length) return '<div style="padding:10px 2px;color:var(--m);">No participants yet. Open Setup to paste your roster.</div>';
    const base = nextHitNumber();
    let readyOffset = 0;
    return state.roster.map((participant, index) => {
      const assigned = participant.status === 'ready' ? base + readyOffset++ : null;
      return `
        <div class="row" data-index="${index}">
          <div class="handle" data-drag-index="${index}" title="Drag to reorder">☰</div>
          <div class="name" title="${escapeHtml(participant.name)}">${escapeHtml(participant.name)}${assigned != null ? `<span class="assigned">#${assigned}</span>` : ''}</div>
          <div class="phits">${participant.hits}</div>
          <button class="status" data-action="status" data-index="${index}" data-status="${participant.status}">${participant.status}</button>
          <button class="remove" data-action="remove" data-index="${index}" title="Remove from queue">×</button>
        </div>`;
    }).join('');
  }

  function waitWarningHtml() {
    if (!state.ui.waitWarning || !readyParticipants().length) return '';
    const seconds = upWaitingSeconds();
    if (seconds < state.ui.waitWarningSeconds) return '';
    return `<div id="hkmcq-wait-warning" class="waitWarn">Waiting ${formatCountdown(seconds)} — consider SKIP if unavailable</div>`;
  }

  function pendingHtml() {
    const pending = state.api.pendingHits[0];
    if (!pending) return '';
    const count = state.api.pendingHits.length;
    const title = pending.kind === 'expected' ? 'HIT DETECTED' : pending.kind === 'unknown' ? 'UNQUEUED HIT DETECTED' : 'OUT-OF-ORDER HIT';
    let text = `<strong>${escapeHtml(pending.attacker)}</strong> completed HIT #${pending.chain}.`;
    if (pending.kind === 'outoforder') text += `<br>Expected next: <strong>${escapeHtml(pending.expectedPlayer)}</strong>.`;
    if (pending.kind === 'unknown') text += '<br>This player is not currently in Merc-C-Que.';
    if (count > 1) text += `<br>${count - 1} additional detected hit${count - 1 === 1 ? '' : 's'} waiting.`;
    const confirmLabel = pending.kind === 'unknown' ? 'ADD & RECORD' : pending.kind === 'expected' ? 'CONFIRM / ADVANCE' : 'RECORD HIT';
    return `
      <div class="pending">
        <div class="pendingTitle">⚠ ${title}</div>
        <div class="pendingText">${text}</div>
        <div class="pendingBtns">
          <button data-action="confirmPending" data-add-unknown="${pending.kind === 'unknown' ? '1' : '0'}">${confirmLabel}</button>
          <button data-action="ignorePending">IGNORE</button>
        </div>
      </div>`;
  }

  function apiStripHtml() {
    const mode = state.api.mode.toUpperCase();
    if (state.api.mode === 'manual') {
      return `<div class="apiStrip"><strong>MANUAL</strong><span>API watch stopped</span><span>${platformLabel()}</span></div>`;
    }
    const chain = state.api.chainCurrent != null
      ? (state.api.chainMax ? `${state.api.chainCurrent}/${state.api.chainMax}` : state.api.chainCurrent)
      : '—';
    const remaining = remainingChainSeconds();
    const urgency = chainUrgency(remaining);
    const paused = state.api.paused ? ' • PAUSED' : '';
    return `<div class="apiStrip ${urgency}"><strong>${mode}${paused}</strong><span>Chain ${chain}</span><span id="hkmcq-chain-clock">${formatCountdown(remaining)}</span></div>`;
  }

  function settingsTabsHtml() {
    const tabs = [['roster','ROSTER'],['message','MESSAGE'],['api','API'],['history','HISTORY']];
    return `<div class="settingsTabs">${tabs.map(([key,label]) => `<button data-action="settingsTab" data-tab="${key}" class="${state.settingsTab === key ? 'active' : ''}">${label}</button>`).join('')}</div>`;
  }

  function rosterSettingsHtml() {
    return `
      <div class="sectionTitle">Roster setup</div>
      <textarea id="hkmcq-roster-editor" placeholder="HairyKary&#10;AngelValoel&#10;Gooey99">${escapeHtml(rosterDraft ?? state.roster.map(p => p.name).join('\n'))}</textarea>
      <div class="miniRow"><button data-action="saveRoster">SAVE ROSTER</button><button data-action="allReady">ALL READY</button></div>
      <div class="miniRow"><button data-action="resetHits">RESET PLAYER HITS</button><button data-action="resetSession">RESET SESSION</button></div>
      <div class="help">READY players rotate normally. AFK players stay listed but are skipped. Drag the ☰ handle with mouse or touch to reorder.</div>`;
  }

  function messageSettingsHtml() {
    return `
      <div class="sectionTitle">Chat message template</div>
      <textarea id="hkmcq-template">${escapeHtml(state.template)}</textarea>
      <div class="help">Placeholders: {current}, {hit}, {next}, {next_hit}, {ondeck}, {ondeck_hit}, {player_hits}, {ready_count}, {total_count}, {queue}, {last_hitter}, {last_hit}, {chain_time}</div>`;
  }

  function apiSettingsHtml() {
    const hasKey = hasApiKey();
    const pdaKey = !!PDA_INJECTED_KEY;
    const sync = state.api.lastSuccessfulSync ? formatAgo(state.api.lastSuccessfulSync) : '—';
    const backoff = Math.max(0, Math.ceil((Number(state.api.backoffUntil || 0) - Date.now()) / 1000));
    return `
      <div class="sectionTitle">API automation</div>
      <div class="settingsGrid">
        <select id="hkmcq-api-mode" class="full">
          <option value="manual" ${state.api.mode === 'manual' ? 'selected' : ''}>Manual — buttons only</option>
          <option value="assisted" ${state.api.mode === 'assisted' ? 'selected' : ''}>Assisted — detect hits, confirm advancement</option>
          <option value="auto" ${state.api.mode === 'auto' ? 'selected' : ''}>Auto — expected hits advance automatically</option>
        </select>
        <input id="hkmcq-api-key" class="full" type="password" autocomplete="off" ${pdaKey ? 'disabled' : ''}
          placeholder="${pdaKey ? 'Torn PDA API key detected automatically' : hasKey ? 'API key saved — enter a new key only to replace it' : 'Paste Torn API key'}" value="${escapeHtml(apiKeyDraft)}">
        <label class="label">Base attack check (sec)<input id="hkmcq-attack-poll" type="number" min="3" max="60" value="${state.api.attackPollSeconds}"></label>
        <label class="label">Base chain sync (sec)<input id="hkmcq-chain-poll" type="number" min="5" max="120" value="${state.api.chainPollSeconds}"></label>
        <label class="checkRow full"><input id="hkmcq-sound-alerts" type="checkbox" ${state.ui.soundAlerts ? 'checked' : ''}>One-time sound at chain danger thresholds</label>
        <label class="checkRow full"><input id="hkmcq-wait-warning" type="checkbox" ${state.ui.waitWarning ? 'checked' : ''}>Warn when the same player is UP too long</label>
        <label class="label full">Waiting warning (sec)<input id="hkmcq-wait-seconds" type="number" min="60" max="900" value="${state.ui.waitWarningSeconds}"></label>
      </div>
      <div class="miniRow"><button data-action="saveApi">SAVE SETTINGS</button><button data-action="testApi">TEST API</button></div>
      <div class="miniRow"><button data-action="clearApi" ${pdaKey ? 'disabled' : ''}>REMOVE SAVED KEY</button><button data-action="resumeApi" ${state.api.paused ? '' : 'disabled'}>RESUME API</button></div>
      <div id="hkmcq-api-status" class="apiStatusBox">
        Platform: <strong>${platformLabel()}</strong><br>
        Key: <strong>${pdaKey ? 'Torn PDA injected' : hasKey ? 'Saved' : 'Not saved'}</strong><br>
        Status: ${escapeHtml(state.api.status || '—')}
        ${state.api.lastError ? `<br><span style="color:#c66">${escapeHtml(state.api.lastError)}</span>` : ''}<br>
        Tab API role: <strong>${tabApiRole()}</strong><br>
        Current chain: ${state.api.chainCurrent ?? '—'} | Next hit: ${nextHitNumber()}<br>
        Chain clock: ${formatCountdown(remainingChainSeconds())} | Last good sync: ${sync}
        ${backoff > 0 ? `<br>API backoff: ${backoff}s` : ''}
        ${state.api.reconciliationNote ? `<br>Reconciliation: ${escapeHtml(state.api.reconciliationNote)}` : ''}
      </div>
      <div class="help">Merc-C-Que speeds up polling when the chain is under ${DANGER_SECONDS}s, slows down while hidden/inactive, retries temporary failures, and reconciles missed hits after the browser or Torn PDA resumes.</div>`;
  }

  function historySettingsHtml() {
    const rows = state.ledger.length
      ? state.ledger.slice(0, 70).map(item => `
          <div class="ledgerRow">
            <div class="ledgerMeta">${formatTime(item.timestamp)}</div>
            <div><strong>${escapeHtml(item.attacker)}</strong> ${item.chain ? `#${item.chain}` : ''}<div class="ledgerMeta">${escapeHtml(item.kind)} • ${escapeHtml(item.mode)}${item.undone ? ' • undone' : ''}</div></div>
            <div class="ledgerMeta">${escapeHtml(item.action)}</div>
          </div>`).join('')
      : '<div style="padding:10px;color:var(--m);font-size:11px;">No Merc-C-Que events recorded yet.</div>';
    return `
      <div class="sectionTitle">Event history / diagnostics</div>
      <div class="ledger">${rows}</div>
      <div class="miniRow"><button data-action="copyDebug">COPY DEBUG SNAPSHOT</button><button data-action="clearHistory">CLEAR HISTORY</button></div>
      <div class="help">Debug snapshots include platform, sync/backoff, chain state, queue state, pending hits, and recent events. API keys are never included.</div>`;
  }

  function settingsContentHtml() {
    switch (state.settingsTab) {
      case 'message': return messageSettingsHtml();
      case 'api': return apiSettingsHtml();
      case 'history': return historySettingsHtml();
      case 'roster':
      default: return rosterSettingsHtml();
    }
  }

  function settingsShellHtml() {
    if (!state.setupOpen) return '';
    return `<div class="settingsShell">${settingsTabsHtml()}<div id="hkmcq-settings-content">${settingsContentHtml()}</div></div>`;
  }

  function renderPanel() {
    document.getElementById(LAUNCHER_ID)?.remove();
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      document.body.appendChild(panel);
    }
    const ready = readyParticipants();
    const nums = hitNumbers();
    const doneLocked = state.api.mode !== 'manual';
    panel.innerHTML = `
      <div class="head">
        <div class="title">HKs Merc-C-Que<div class="sub">Chain Queue Organizer • v${VERSION} • ${IS_PDA ? 'PDA' : 'Desktop'}</div></div>
        <button class="icon" data-action="setup" title="Roster / message / API setup">⚙</button>
        <button class="icon" data-action="minimize" title="Minimize Merc-C-Que">—</button>
      </div>
      <div class="main">
        <div class="up">
          <div class="kicker">UP NOW</div>
          <div class="upLine"><span id="hkmcq-up-name" class="upName">${escapeHtml(ready[0]?.name || 'No READY participant')}</span><span id="hkmcq-hit-badge" class="hitBadge">• HIT #${nums.hit}</span></div>
          <div id="hkmcq-wait-slot">${waitWarningHtml()}</div>
        </div>
        <div class="nextGrid">
          <div class="label">NEXT</div><div class="nextPerson"><span id="hkmcq-next-name">${escapeHtml(ready[1]?.name || '—')}</span><span id="hkmcq-next-hit" class="queueHit">HIT #${nums.nextHit}</span></div>
          <div class="label">ON DECK</div><div class="nextPerson"><span id="hkmcq-ondeck-name">${escapeHtml(ready[2]?.name || '—')}</span><span id="hkmcq-ondeck-hit" class="queueHit">HIT #${nums.onDeckHit}</span></div>
        </div>
        <div id="hkmcq-pending-slot">${pendingHtml()}</div>
        <div class="controls">
          <button id="hkmcq-done" class="done ${doneLocked ? 'locked' : ''}" data-action="done">✓ ${doneLocked ? 'API ACTIVE' : 'DONE'}</button>
          <button data-action="skip">SKIP</button><button data-action="undo">↶ UNDO</button>
        </div>
        <div class="hitRow"><span class="label">HIT</span><input id="hkmcq-hit-number" type="number" min="1" step="1" value="${nums.hit}" ${state.api.mode !== 'manual' ? 'disabled' : ''}><span id="hkmcq-ready-count" class="label">${ready.length}/${state.roster.length} ready</span></div>
        <div id="hkmcq-api-strip-slot">${apiStripHtml()}</div>
        <div id="hkmcq-preview" class="preview">${escapeHtml(buildMessage())}</div>
        <button class="copy" data-action="copy">COPY MESSAGE</button>
        <div id="hkmcq-roster" class="roster">${rosterRowsHtml()}</div>
        <div id="hkmcq-settings-shell-slot">${settingsShellHtml()}</div>
      </div>`;
    applyPanelPosition(panel);
    bindPanel(panel);
    requestAnimationFrame(adjustPanelViewport);
  }

  function applyPanelPosition(panel) {
    if (state.position && Number.isFinite(Number(state.position.left)) && Number.isFinite(Number(state.position.top))) {
      setPosition(panel, clampPanelPosition(Number(state.position.left), Number(state.position.top), panel));
      panel.style.right = 'auto';
    }
  }

  function renderSettings() {
    const shellSlot = document.getElementById('hkmcq-settings-shell-slot');
    if (!shellSlot) return;
    shellSlot.innerHTML = settingsShellHtml();
  }

  function refresh(options = {}) {
    if (state.minimized) return refreshLauncher();
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return renderPanel();
    const ready = readyParticipants();
    const nums = hitNumbers();
    const setText = (selector, value) => {
      const element = panel.querySelector(selector);
      if (element) element.textContent = value;
    };
    setText('#hkmcq-up-name', ready[0]?.name || 'No READY participant');
    setText('#hkmcq-hit-badge', `• HIT #${nums.hit}`);
    setText('#hkmcq-next-name', ready[1]?.name || '—');
    setText('#hkmcq-next-hit', `HIT #${nums.nextHit}`);
    setText('#hkmcq-ondeck-name', ready[2]?.name || '—');
    setText('#hkmcq-ondeck-hit', `HIT #${nums.onDeckHit}`);
    setText('#hkmcq-ready-count', `${ready.length}/${state.roster.length} ready`);
    const hitInput = panel.querySelector('#hkmcq-hit-number');
    if (hitInput && document.activeElement !== hitInput) {
      hitInput.value = String(nums.hit);
      hitInput.disabled = state.api.mode !== 'manual';
    }
    const doneButton = panel.querySelector('#hkmcq-done');
    if (doneButton) {
      const locked = state.api.mode !== 'manual';
      doneButton.classList.toggle('locked', locked);
      doneButton.textContent = `✓ ${locked ? 'API ACTIVE' : 'DONE'}`;
    }
    setHtml(panel.querySelector('#hkmcq-api-strip-slot'), apiStripHtml());
    setHtml(panel.querySelector('#hkmcq-pending-slot'), pendingHtml());
    setHtml(panel.querySelector('#hkmcq-wait-slot'), waitWarningHtml());
    const preview = panel.querySelector('#hkmcq-preview');
    if (preview) preview.textContent = buildMessage();
    if (options.roster) {
      const roster = panel.querySelector('#hkmcq-roster');
      if (roster) roster.innerHTML = rosterRowsHtml();
    }
    if (options.settings) renderSettings();
    updateApiStatusBox();
    requestAnimationFrame(adjustPanelViewport);
  }

  function refreshLiveIndicators() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const remaining = remainingChainSeconds();
    const clock = panel.querySelector('#hkmcq-chain-clock');
    if (clock) clock.textContent = formatCountdown(remaining);
    setHtml(panel.querySelector('#hkmcq-wait-slot'), waitWarningHtml());
    const strip = panel.querySelector('.apiStrip');
    if (strip) {
      const urgency = chainUrgency(remaining);
      strip.classList.toggle('danger', urgency === 'danger');
      strip.classList.toggle('critical', urgency === 'critical');
    }
  }

  function updateApiStatusBox(roleOverride = null) {
    const box = document.querySelector('#hkmcq-api-status');
    if (!box) return;
    const last = state.api.lastHit ? `${state.api.lastHit.attacker} at #${state.api.lastHit.chain}` : '—';
    const apiRole = roleOverride || tabApiRole();
    box.innerHTML =
      `Platform: <strong>${platformLabel()}</strong>` +
      `<br>Key: <strong>${PDA_INJECTED_KEY ? 'Torn PDA injected' : hasApiKey() ? 'Saved' : 'Not saved'}</strong>` +
      `<br>Status: ${escapeHtml(state.api.status || '—')}` +
      `<br>Tab API role: <strong>${apiRole}</strong>` +
      `<br>Current chain: ${state.api.chainCurrent ?? '—'} | Next hit: ${nextHitNumber()}` +
      `<br>Chain clock: ${formatCountdown(remainingChainSeconds())}` +
      `<br>Last detected: ${escapeHtml(last)}` +
      `<br>Last good sync: ${state.api.lastSuccessfulSync ? formatAgo(state.api.lastSuccessfulSync) : '—'}`;
  }

  function setApiUiText(text) {
    const box = document.querySelector('#hkmcq-api-status');
    if (box) box.textContent = text;
  }

  function launcherStateClasses() {
    const classes = [];
    if (state.api.pendingHits.length) classes.push('pending');
    else if (state.api.paused) classes.push('paused');
    else if (automationActive()) classes.push('active');
    const urgency = chainUrgency();
    if (urgency) classes.push(urgency);
    return classes.join(' ');
  }

  function launcherLabel() {
    const current = readyParticipants()[0]?.name || '—';
    const shortName = current.length > 13 ? `${current.slice(0, 12)}…` : current;
    const remaining = remainingChainSeconds();
    const clock = remaining != null ? ` • ${formatCountdown(remaining)}` : '';
    return `${shortName} #${nextHitNumber()}${clock}`;
  }

  function renderLauncher() {
    document.getElementById(PANEL_ID)?.remove();
    if (IS_PDA && launcherDismissedForSession) {
      document.getElementById(LAUNCHER_ID)?.remove();
      return;
    }
    let launcher = document.getElementById(LAUNCHER_ID);
    if (!launcher) {
      launcher = document.createElement('button');
      launcher.id = LAUNCHER_ID;
      document.body.appendChild(launcher);
      bindLauncher(launcher);
    }
    launcher.className = launcherStateClasses();
    const pendingCount = state.api.pendingHits.length;
    const label = launcherLabel();
    launcher.innerHTML = `
      <span class="launcherDot"></span><span id="hkmcq-launcher-label">${escapeHtml(label)}</span>
      ${IS_PDA ? '<span class="launcherClose" data-launcher-close="1" role="button" aria-label="Hide Merc-C-Que for this session" title="Hide Merc-C-Que for this session">×</span>' : ''}
      ${pendingCount > 0 ? `<span class="launcherBadge" title="${pendingCount} hit${pendingCount === 1 ? '' : 's'} waiting for attention">${pendingCount > 99 ? '99+' : pendingCount}</span>` : ''}`;
    launcher.title = `Merc-C-Que — ${label} — ${state.api.status || state.api.mode}`;
    const saved = state.launcherPosition;
    const initial = saved && Number.isFinite(Number(saved.left)) && Number.isFinite(Number(saved.top))
      ? { left: Number(saved.left), top: Number(saved.top) } : defaultLauncherPosition();
    setPosition(launcher, clampLauncherPosition(initial.left, initial.top, launcher));
    launcher.style.right = 'auto';
    launcher.style.bottom = 'auto';
  }

  function refreshLauncher() {
    if (IS_PDA && launcherDismissedForSession) {
      document.getElementById(LAUNCHER_ID)?.remove();
      return;
    }
    const launcher = document.getElementById(LAUNCHER_ID);
    if (!launcher) return renderLauncher();
    launcher.className = launcherStateClasses();
    const text = launcherLabel();
    const label = launcher.querySelector('#hkmcq-launcher-label');
    if (label && label.textContent !== text) label.textContent = text;

    const pendingCount = state.api.pendingHits.length;
    let badge = launcher.querySelector('.launcherBadge');
    if (pendingCount > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'launcherBadge';
        launcher.appendChild(badge);
      }
      const badgeText = pendingCount > 99 ? '99+' : String(pendingCount);
      if (badge.textContent !== badgeText) badge.textContent = badgeText;
      badge.title = `${pendingCount} hit${pendingCount === 1 ? '' : 's'} waiting for attention`;
    } else if (badge) {
      badge.remove();
    }

    launcher.title = `Merc-C-Que — ${text} — ${state.api.status || state.api.mode}`;
  }

  function renderApp() {
    installStyle();
    if (state.minimized) renderLauncher();
    else renderPanel();
  }

  function bindPanel(panel) {
    if (panel.dataset.hkmcqBound === '1') return;
    panel.dataset.hkmcqBound = '1';
    panel.addEventListener('click', handlePanelClick);
    panel.addEventListener('input', handlePanelInput);
    panel.addEventListener('pointerdown', handlePanelPointerDown);
  }

  function handlePanelClick(event) {
    const element = event.target.closest('[data-action]');
    if (!element) return;
    event.stopPropagation();
    const action = element.dataset.action;
    const index = Number(element.dataset.index);
    switch (action) {
      case 'done': manualDone(); break;
      case 'skip': skipCurrent(); break;
      case 'undo': undo(); break;
      case 'copy': copyText(buildMessage(), 'Merc-C-Que message copied.'); break;
      case 'status': toggleStatus(index); break;
      case 'remove': removeParticipant(index); break;
      case 'saveRoster': {
        const editor = document.querySelector('#hkmcq-roster-editor');
        replaceRosterFromText(editor?.value || '');
        break;
      }
      case 'allReady': setAllReady(); break;
      case 'resetHits': resetPlayerHits(); break;
      case 'resetSession': resetSession(); break;
      case 'saveApi': saveApiSettings(); break;
      case 'testApi': testApiConnection(); break;
      case 'clearApi': removeSavedApiKey(); break;
      case 'resumeApi': resumeApi(); break;
      case 'confirmPending': confirmPendingHit(element.dataset.addUnknown === '1'); break;
      case 'ignorePending': ignorePendingHit(); break;
      case 'minimize': minimizeApp(); break;
      case 'setup':
        state.setupOpen = !state.setupOpen;
        rerenderSettings();
        break;
      case 'settingsTab':
        state.settingsTab = element.dataset.tab;
        rerenderSettings();
        break;
      case 'copyDebug': copyText(debugSnapshot(), 'Debug snapshot copied.'); break;
      case 'clearHistory': clearLedger(); break;
    }
  }

  function rerenderSettings() {
    saveLocalNow();
    renderSettings();
    requestAnimationFrame(adjustPanelViewport);
  }

  function handlePanelInput(event) {
    const target = event.target;
    if (target.matches('#hkmcq-hit-number')) {
      if (state.api.mode !== 'manual') return;
      state.manualNextHit = Math.max(1, Number(target.value) || 1);
      saveNow();
      refresh();
      return;
    }
    if (target.matches('#hkmcq-template')) {
      state.template = target.value;
      saveSoon();
      const preview = document.querySelector('#hkmcq-preview');
      if (preview) preview.textContent = buildMessage();
      return;
    }
    if (target.matches('#hkmcq-roster-editor')) {
      rosterDraft = target.value;
      return;
    }
    if (target.matches('#hkmcq-api-key')) apiKeyDraft = target.value;
  }

  function handlePanelPointerDown(event) {
    if (event.button != null && event.button !== 0) return;
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const handle = event.target.closest('[data-drag-index]');
    if (handle) {
      const row = handle.closest('.row');
      if (!row) return;
      rosterDrag = {
        pointerId: event.pointerId,
        fromIndex: Number(handle.dataset.dragIndex),
        targetIndex: Number(handle.dataset.dragIndex)
      };
      row.classList.add('dragging');
      try { handle.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
      return;
    }
    const header = event.target.closest('.head');
    if (!header || event.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();
    panelDrag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    try { header.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
  }

  function bindLauncher(launcher) {
    if (launcher.dataset.hkmcqBound === '1') return;
    launcher.dataset.hkmcqBound = '1';
    launcher.addEventListener('pointerdown', event => {
      if (event.target.closest?.('[data-launcher-close="1"]')) return;
      if (event.button != null && event.button !== 0) return;
      const rect = launcher.getBoundingClientRect();
      launcherDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        moved: false
      };
      try { launcher.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
    });
    launcher.addEventListener('click', event => {
      event.preventDefault();
      if (event.target.closest?.('[data-launcher-close="1"]')) {
        event.stopPropagation();
        dismissLauncherForSession();
        return;
      }
      if (Date.now() < suppressLauncherClickUntil) return;
      restoreApp();
    });
  }

  function clearRosterDragClasses() {
    document.querySelectorAll(`#${PANEL_ID} .row.dragging, #${PANEL_ID} .row.dragover`).forEach(element => element.classList.remove('dragging', 'dragover'));
  }

  function applyPointerMove(point) {
    if (!point) return;
    const { pointerId, clientX, clientY } = point;
    if (panelDrag && pointerId === panelDrag.pointerId) {
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        setPosition(panel, clampPanelPosition(clientX - panelDrag.offsetX, clientY - panelDrag.offsetY, panel));
        panel.style.right = 'auto';
        adjustPanelViewport();
      }
    }
    if (launcherDrag && pointerId === launcherDrag.pointerId) {
      const launcher = document.getElementById(LAUNCHER_ID);
      if (launcher) {
        if (Math.abs(clientX - launcherDrag.startX) > 3 || Math.abs(clientY - launcherDrag.startY) > 3) launcherDrag.moved = true;
        setPosition(launcher, clampLauncherPosition(clientX - launcherDrag.offsetX, clientY - launcherDrag.offsetY, launcher));
      }
    }
    if (rosterDrag && pointerId === rosterDrag.pointerId) {
      const target = document.elementFromPoint(clientX, clientY)?.closest(`#${PANEL_ID} .row`);
      document.querySelectorAll(`#${PANEL_ID} .row.dragover`).forEach(element => element.classList.remove('dragover'));
      if (target) {
        target.classList.add('dragover');
        rosterDrag.targetIndex = Number(target.dataset.index);
      }
    }
  }

  function flushPointerMove() {
    pointerMoveFrame = 0;
    const point = pendingPointerMove;
    pendingPointerMove = null;
    applyPointerMove(point);
  }

  function flushPendingPointerMove() {
    if (!pendingPointerMove) return;
    if (pointerMoveFrame) cancelAnimationFrame(pointerMoveFrame);
    flushPointerMove();
  }

  document.addEventListener('pointermove', event => {
    pendingPointerMove = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY
    };
    if (!pointerMoveFrame) pointerMoveFrame = requestAnimationFrame(flushPointerMove);
  });

  document.addEventListener('pointerup', event => {
    if (pendingPointerMove?.pointerId === event.pointerId) flushPendingPointerMove();
    if (panelDrag && event.pointerId === panelDrag.pointerId) {
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        const rect = panel.getBoundingClientRect();
        state.position = { left: Math.round(rect.left), top: Math.round(rect.top) };
        saveLocalNow();
        adjustPanelViewport();
      }
      panelDrag = null;
    }
    if (launcherDrag && event.pointerId === launcherDrag.pointerId) {
      const launcher = document.getElementById(LAUNCHER_ID);
      if (launcher) {
        const rect = launcher.getBoundingClientRect();
        state.launcherPosition = { left: Math.round(rect.left), top: Math.round(rect.top) };
        saveLocalNow();
      }
      if (launcherDrag.moved) suppressLauncherClickUntil = Date.now() + 250;
      launcherDrag = null;
    }
    if (rosterDrag && event.pointerId === rosterDrag.pointerId) {
      const from = rosterDrag.fromIndex;
      const to = rosterDrag.targetIndex;
      rosterDrag = null;
      clearRosterDragClasses();
      if (Number.isFinite(from) && Number.isFinite(to) && from !== to) moveParticipant(from, to);
    }
  });

  document.addEventListener('pointercancel', () => {
    if (pointerMoveFrame) cancelAnimationFrame(pointerMoveFrame);
    pointerMoveFrame = 0;
    pendingPointerMove = null;
    panelDrag = null;
    launcherDrag = null;
    rosterDrag = null;
    clearRosterDragClasses();
  });

  window.addEventListener('resize', () => {
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      const rect = panel.getBoundingClientRect();
      const position = clampPanelPosition(rect.left, rect.top, panel);
      setPosition(panel, position);
      state.position = { left: Math.round(position.left), top: Math.round(position.top) };
      adjustPanelViewport();
    }
    const launcher = document.getElementById(LAUNCHER_ID);
    if (launcher) {
      const rect = launcher.getBoundingClientRect();
      const position = clampLauncherPosition(rect.left, rect.top, launcher);
      setPosition(launcher, position);
      state.launcherPosition = { left: Math.round(position.left), top: Math.round(position.top) };
    }
    saveLocalSoon();
  });

  function toast(message) {
    document.getElementById(TOAST_ID)?.remove();
    const element = document.createElement('div');
    element.id = TOAST_ID;
    element.textContent = message;
    document.body.appendChild(element);
    setTimeout(() => element.remove(), 2200);
  }

  function ensureMounted() {
    if (!document.body) return;
    if (IS_PDA && launcherDismissedForSession) {
      document.getElementById(PANEL_ID)?.remove();
      document.getElementById(LAUNCHER_ID)?.remove();
      return;
    }
    if (state.minimized) {
      if (!document.getElementById(LAUNCHER_ID)) renderLauncher();
      document.getElementById(PANEL_ID)?.remove();
    } else {
      if (!document.getElementById(PANEL_ID)) renderPanel();
      document.getElementById(LAUNCHER_ID)?.remove();
    }
  }

  window.addEventListener('pagehide', () => {
    // Flush any debounced save; saveNow() also persists PDA UI state.
    if (saveTimer) saveNow({ sync: saveTimerSync });
    else persistPdaUiState();
    releaseApiLeadership();
  });

  document.addEventListener('visibilitychange', () => {
    const now = Date.now();
    const gap = now - lastVisibilityChangeAt;
    lastVisibilityChangeAt = now;
    if (automationActive()) maintainApiLeadership({ forceRenew: true });
    if (document.hidden) persistPdaUiState();
    if (!document.hidden && gap >= 15000) {
      reconcileAfterResume(IS_PDA ? 'Torn PDA resume' : 'tab resume');
    }
  });

  window.addEventListener('focus', () => {
    const sinceSync = Date.now() - Number(state.api.lastSuccessfulSync || 0);
    if (automationActive() && sinceSync >= 20000) reconcileAfterResume('window focus');
  });

  window.addEventListener('pageshow', event => {
    if (event.persisted && automationActive()) reconcileAfterResume('page restore');
  });

  initTabSync();
  trackUpTimer();
  renderApp();
  setInterval(ensureMounted, 2500);
  startScheduler();

  if (automationActive() && maintainApiLeadership()) {
    resetPollTimers();
    if (!state.api.baselineReady) pollAttacks({ forceBaseline: true });
    syncTornClock({ force: true }).finally(() => pollChain());
  }
})();
