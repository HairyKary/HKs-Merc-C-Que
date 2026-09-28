// ==UserScript==
// @name         HKs Merc-C-Que
// @namespace    hks-merc-c-que
// @version      2.4.0
// @description  Torn faction chain queue organizer with Manual, Assisted, and Auto API modes.
// @author       HairyKary
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @run-at       document-idle
// @homepageURL  https://github.com/HairyKary/HKs-Merc-C-Que
// @supportURL   https://github.com/HairyKary/HKs-Merc-C-Que/issues
// @updateURL    https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/main/HKs-Merc-C-Que.user.js
// @downloadURL  https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/main/HKs-Merc-C-Que.user.js
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '2.4.0';
  const SCHEMA_VERSION = 4;
  const STORAGE_KEY = 'hksMercCQue_v2';
  const LEGACY_KEY = 'tornChainQueue_v1';
  const API_KEY_STORE = 'hksMercCQue_apiKey';
  const PANEL_ID = 'hkmcq-panel';
  const LAUNCHER_ID = 'hkmcq-launcher';
  const STYLE_ID = 'hkmcq-style';
  const TOAST_ID = 'hkmcq-toast';
  const API_BASE = 'https://api.torn.com/v2';
  const MAX_HISTORY = 40;
  const MAX_PROCESSED = 150;
  const MAX_PENDING = 30;
  const MAX_LEDGER = 150;
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
    ledger: [],
    api: {
      mode: 'manual',
      attackPollSeconds: 5,
      chainPollSeconds: 10,
      paused: false,
      baselineReady: false,
      processedAttackIds: [],
      pendingHits: [],
      chainId: null,
      chainCurrent: null,
      chainMax: null,
      chainTimeout: null,
      lastHit: null,
      status: 'Manual mode',
      lastError: '',
      lastAttackPoll: 0,
      lastChainPoll: 0
    }
  };

  let state = loadState();
  let history = [];
  let rosterDraft = null;
  let apiKeyDraft = '';
  let saveTimer = null;
  let attackInFlight = false;
  let chainInFlight = false;
  let rosterDragIndex = null;
  let panelDrag = null;
  let launcherDrag = null;
  let launcherDragged = false;
  let suppressLauncherClickUntil = 0;

  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const nowUnix = () => Math.floor(Date.now() / 1000);

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
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

  function normalizeApi(api) {
    return {
      ...clone(DEFAULT_STATE.api),
      ...(api || {}),
      mode: ['manual', 'assisted', 'auto'].includes(api?.mode) ? api.mode : 'manual',
      attackPollSeconds: clamp(Number(api?.attackPollSeconds) || 5, 3, 60),
      chainPollSeconds: clamp(Number(api?.chainPollSeconds) || 10, 5, 120),
      processedAttackIds: Array.isArray(api?.processedAttackIds)
        ? api.processedAttackIds.map(String).slice(0, MAX_PROCESSED) : [],
      pendingHits: Array.isArray(api?.pendingHits)
        ? api.pendingHits.slice(0, MAX_PENDING) : []
    };
  }

  function normalizeLedger(ledger) {
    if (!Array.isArray(ledger)) return [];
    return ledger.filter(Boolean).map(item => ({
      id: String(item.id || ''),
      attacker: String(item.attacker || 'Unknown'),
      chain: Number(item.chain) || 0,
      kind: String(item.kind || 'unknown'),
      expected: !!item.expected,
      mode: String(item.mode || 'manual'),
      action: String(item.action || 'detected'),
      timestamp: Number(item.timestamp) || nowUnix(),
      result: String(item.result || ''),
      undone: !!item.undone
    })).slice(0, MAX_LEDGER);
  }

  function migrateState(saved = {}) {
    const next = { ...clone(DEFAULT_STATE), ...saved };
    next.schemaVersion = SCHEMA_VERSION;
    next.roster = Array.isArray(saved.roster) ? saved.roster.map(normalizeParticipant) : [];
    next.api = normalizeApi(saved.api);
    next.ledger = normalizeLedger(saved.ledger);
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

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    state.schemaVersion = SCHEMA_VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function saveSoon(delay = 400) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, delay);
  }

  function getApiKey() {
    try { return String(GM_getValue(API_KEY_STORE, '') || '').trim(); }
    catch { return ''; }
  }
  const setApiKey = key => GM_setValue(API_KEY_STORE, String(key || '').trim());
  const clearApiKey = () => GM_deleteValue(API_KEY_STORE);

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

    // Keep processed API IDs/live Torn chain intact. The hit really happened;
    // Undo only reverses the local Merc-C-Que queue effect.
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

  const automationActive = () =>
    state.api.mode !== 'manual' && !!getApiKey() && !state.api.paused;

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

  function rotateParticipant(name, { recordHit = false, saveHistory = true, reason = 'queue rotation', meta = {} } = {}) {
    const index = findParticipantIndex(name);
    if (index < 0) return false;
    if (saveHistory) pushHistory(reason, meta);
    const [participant] = state.roster.splice(index, 1);
    if (recordHit) participant.hits += 1;
    state.roster.push(participant);
    return true;
  }

  function manualDone() {
    if (state.api.mode !== 'manual') return toast('Switch API Mode to Manual before using DONE.');
    const index = currentIndex();
    if (index < 0) return toast('No READY participant.');

    const participant = state.roster[index];
    pushHistory('manual DONE');
    state.roster.splice(index, 1);
    participant.hits += 1;
    state.roster.push(participant);
    state.manualNextHit = nextHitNumber() + 1;
    addLedger({
      id: `manual-${Date.now()}`, attacker: participant.name,
      chain: state.manualNextHit - 1, kind: 'manual',
      expected: true, mode: 'manual', action: 'manual-recorded'
    });
    saveNow();
    refresh({ roster: true, settings: true });
  }

  function skipCurrent() {
    const index = currentIndex();
    if (index < 0) return toast('No READY participant.');
    pushHistory('SKIP');
    const [participant] = state.roster.splice(index, 1);
    state.roster.push(participant);
    saveNow();
    refresh({ roster: true });
  }

  function toggleStatus(index) {
    if (!state.roster[index]) return;
    pushHistory('READY / AFK change');
    state.roster[index].status = state.roster[index].status === 'ready' ? 'afk' : 'ready';
    saveNow();
    refresh({ roster: true });
  }

  function removeParticipant(index) {
    if (!state.roster[index]) return;
    pushHistory('remove participant');
    state.roster.splice(index, 1);
    saveNow();
    refresh({ roster: true });
  }

  function moveParticipant(from, to) {
    if (from === to || from < 0 || to < 0 || from >= state.roster.length || to >= state.roster.length) return;
    pushHistory('reorder roster');
    const [participant] = state.roster.splice(from, 1);
    state.roster.splice(to, 0, participant);
    saveNow();
    refresh({ roster: true });
  }

  function parseRosterText(text) {
    return String(text).split(/\r?\n|,/).map(x => x.trim()).filter(Boolean)
      .filter((name, i, arr) => arr.findIndex(x => x.toLowerCase() === name.toLowerCase()) === i);
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
    saveNow();
    renderSettings();
    refresh({ roster: true });
    toast(`Roster saved: ${state.roster.length} participant${state.roster.length === 1 ? '' : 's'}.`);
  }

  function setAllReady() {
    if (!state.roster.length) return;
    pushHistory('all READY');
    state.roster.forEach(p => p.status = 'ready');
    saveNow();
    refresh({ roster: true });
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
    saveNow();
    refresh({ roster: true, settings: true });
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
      last_hit: state.api.lastHit?.chain != null ? String(state.api.lastHit.chain) : '—'
    };
  }

  function buildMessage() {
    const data = messageData();
    return String(state.template || '').replace(
      /\{(current|next|ondeck|hit|next_hit|ondeck_hit|player_hits|current_hits|ready_count|total_count|queue|last_hitter|last_hit)\}/gi,
      (_, key) => data[key.toLowerCase()] ?? ''
    );
  }

  async function copyText(text, success = 'Copied.') {
    if (!String(text).trim()) return toast('Nothing to copy.');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      Object.assign(ta.style, { position: 'fixed', opacity: '0' });
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(success);
  }

  const copyMessage = () => copyText(buildMessage(), 'Merc-C-Que message copied.');

  function addLedger(entry) {
    const id = String(entry?.id || `event-${Date.now()}`);
    const item = {
      id,
      attacker: String(entry?.attacker || 'Unknown'),
      chain: Number(entry?.chain) || 0,
      kind: String(entry?.kind || 'unknown'),
      expected: !!entry?.expected,
      mode: String(entry?.mode || state.api.mode),
      action: String(entry?.action || 'detected'),
      timestamp: Number(entry?.timestamp) || nowUnix(),
      result: String(entry?.result || ''),
      undone: !!entry?.undone
    };
    state.ledger = [item, ...state.ledger.filter(x => String(x.id) !== id)].slice(0, MAX_LEDGER);
    return item;
  }

  function updateLedger(id, action, extra = {}) {
    const item = state.ledger.find(x => String(x.id) === String(id));
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
      mode: state.api.mode,
      paused: state.api.paused,
      chain: {
        id: state.api.chainId,
        current: state.api.chainCurrent,
        max: state.api.chainMax,
        timeout: state.api.chainTimeout
      },
      queue: state.roster,
      pendingHits: state.api.pendingHits,
      lastHit: state.api.lastHit,
      recentLedger: state.ledger.slice(0, 30)
    }, null, 2);
  }

  function apiRequest(path, params = {}, overrideKey = '') {
    const key = String(overrideKey || getApiKey()).trim();
    if (!key) return Promise.reject(new Error('No API key saved.'));

    const query = new URLSearchParams({
      ...params,
      timestamp: String(nowUnix()),
      comment: 'HKs Merc-C-Que'
    });

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${API_BASE}${path}?${query}`,
        headers: { Authorization: `ApiKey ${key}`, Accept: 'application/json' },
        timeout: 12000,
        onload: response => {
          let data;
          try { data = JSON.parse(response.responseText || '{}'); }
          catch {
            reject(new Error(`API returned invalid JSON (HTTP ${response.status}).`));
            return;
          }
          if (data?.error) {
            const code = Number(data.error.code ?? 0);
            const message = data.error.error || data.error.message || 'Unknown API error';
            const error = new Error(`API ${code}: ${message}`);
            error.apiCode = code;
            reject(error);
            return;
          }
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`HTTP ${response.status}`));
            return;
          }
          resolve(data);
        },
        onerror: () => reject(new Error('Network error contacting api.torn.com.')),
        ontimeout: () => reject(new Error('Torn API request timed out.'))
      });
    });
  }

  const fetchChain = (key = '') => apiRequest('/faction/chain', {}, key);
  const fetchAttacks = (key = '') => apiRequest(
    '/faction/attacks',
    { filters: 'outgoing', limit: '50', sort: 'DESC' },
    key
  );

  const validChainAttack = attack =>
    !!(attack && attack.attacker?.name && Number(attack.chain) > 0 && !attack.is_interrupted);

  const attackId = attack => String(
    attack?.id ?? attack?.code ??
    `${attack?.ended}-${attack?.attacker?.id}-${attack?.chain}`
  );

  function markProcessed(id) {
    const sid = String(id);
    state.api.processedAttackIds =
      [sid, ...state.api.processedAttackIds.filter(x => x !== sid)].slice(0, MAX_PROCESSED);
  }

  function addPending(event) {
    if (state.api.pendingHits.some(x => String(x.id) === String(event.id))) return;
    state.api.pendingHits.push(event);
    state.api.pendingHits = state.api.pendingHits.slice(0, MAX_PENDING);
  }

  function processAttack(attack) {
    if (!validChainAttack(attack)) return false;

    const id = attackId(attack);
    const attacker = String(attack.attacker.name);
    const chain = Number(attack.chain);
    const current = readyParticipants()[0]?.name || '';
    const index = findParticipantIndex(attacker);
    const expected = !!current && current.toLowerCase() === attacker.toLowerCase();
    const kind = index < 0 ? 'unknown' : expected ? 'expected' : 'outoforder';

    state.api.chainCurrent = chain;
    state.manualNextHit = chain + 1;
    state.api.lastHit = {
      attacker, chain, ended: Number(attack.ended) || 0, result: attack.result || ''
    };

    const event = {
      id, attacker, chain, ended: Number(attack.ended) || 0,
      result: attack.result || '', kind, expectedPlayer: current || '—'
    };

    addLedger({
      id, attacker, chain, kind, expected, mode: state.api.mode,
      action: 'detected', timestamp: Number(attack.ended) || nowUnix(),
      result: attack.result || ''
    });

    if (state.api.mode === 'auto' && index >= 0 && expected) {
      pushHistory(`AUTO hit #${chain} by ${attacker}`, {
        attackId: id, attacker, chain, kind, expected, mode: state.api.mode
      });
      rotateParticipant(attacker, { recordHit: true, saveHistory: false });
      updateLedger(id, 'auto-recorded');
      state.api.status = `AUTO: ${attacker} recorded at #${chain}`;
      return true;
    }

    addPending(event);
    updateLedger(id, 'pending');

    state.api.status = index < 0
      ? `Hit #${chain}: ${attacker} is not in the queue`
      : expected
        ? `Hit #${chain} detected — awaiting confirmation`
        : `Out-of-order hit #${chain}: ${attacker}`;

    return true;
  }

  async function pollAttacks(forceBaseline = false) {
    if (attackInFlight || !getApiKey()) return;
    attackInFlight = true;
    state.api.lastAttackPoll = Date.now();

    try {
      const data = await fetchAttacks();
      const attacks = Array.isArray(data?.attacks) ? data.attacks : [];

      if (forceBaseline || !state.api.baselineReady) {
        attacks.forEach(a => markProcessed(attackId(a)));
        state.api.baselineReady = true;
        state.api.status = 'Connected — watching new faction hits';
        state.api.lastError = '';
        saveNow();
        refresh();
        return;
      }

      const processed = new Set(state.api.processedAttackIds.map(String));
      const fresh = attacks
        .filter(a => !processed.has(attackId(a)))
        .sort((a, b) => (Number(a.ended) - Number(b.ended)) || attackId(a).localeCompare(attackId(b)));

      let changed = false;
      for (const attack of fresh) {
        markProcessed(attackId(attack));
        if (processAttack(attack)) changed = true;
      }

      if (!fresh.length) state.api.status = 'Connected — watching new faction hits';
      state.api.lastError = '';
      saveNow();
      refresh({ roster: changed, settings: changed });
    } catch (error) {
      handleApiError(error);
    } finally {
      attackInFlight = false;
    }
  }

  async function pollChain() {
    if (chainInFlight || !getApiKey()) return;
    chainInFlight = true;
    state.api.lastChainPoll = Date.now();

    try {
      const data = await fetchChain();
      const chain = data?.chain || null;

      if (chain) {
        const previousId = state.api.chainId;
        const previousCurrent = Number(state.api.chainCurrent);
        const newCurrent = Number(chain.current) || 0;
        const newId = chain.id ?? null;

        if (
          previousId != null && newId != null &&
          String(previousId) !== String(newId)
        ) {
          state.api.baselineReady = false;
          state.api.processedAttackIds = [];
          state.api.pendingHits = [];
          state.api.status = 'New chain detected — re-baselining attack watch';
        }

        const sameChain =
          previousId != null && newId != null &&
          String(previousId) === String(newId);

        const acceptedCurrent =
          sameChain && Number.isFinite(previousCurrent) && newCurrent < previousCurrent
            ? previousCurrent : newCurrent;

        state.api.chainId = newId;
        state.api.chainCurrent = acceptedCurrent;
        state.api.chainMax = Number(chain.max) || 0;
        state.api.chainTimeout = Number(chain.timeout) || 0;
        state.manualNextHit = acceptedCurrent + 1;
      } else {
        state.api.chainId = null;
        state.api.chainCurrent = null;
        state.api.chainMax = null;
        state.api.chainTimeout = null;
      }

      state.api.lastError = '';
      saveNow();
      refresh({ roster: true });
    } catch (error) {
      handleApiError(error);
    } finally {
      chainInFlight = false;
    }
  }

  function handleApiError(error) {
    const message = error?.message || String(error);
    state.api.lastError = message;
    state.api.status = message;
    if ([1, 2, 7].includes(Number(error?.apiCode))) {
      state.api.paused = true;
      state.api.status = `${message} — automation paused`;
    }
    saveNow();
    refresh({ settings: true });
  }

  async function testApi() {
    const key = String(apiKeyDraft || getApiKey()).trim();
    if (!key) return toast('Enter or save an API key first.');

    setApiStatusText('Testing API…');
    try {
      const [chainData, attackData] = await Promise.all([fetchChain(key), fetchAttacks(key)]);
      const current = chainData?.chain ? Number(chainData.chain.current) || 0 : 0;
      const attacks = Array.isArray(attackData?.attacks) ? attackData.attacks : [];
      state.api.paused = false;
      state.api.lastError = '';
      state.api.status = `API OK — chain ${current}; attack feed accessible (${attacks.length} returned)`;
      saveNow();
      refresh({ settings: true });
      toast('API connection successful.');
    } catch (error) {
      handleApiError(error);
      toast(error?.message || 'API test failed.');
    }
  }

  function saveApiSettings() {
    const newKey = String(
      document.querySelector('#hkmcq-api-key')?.value || apiKeyDraft || ''
    ).trim();

    if (newKey) {
      setApiKey(newKey);
      apiKeyDraft = '';
      state.api.baselineReady = false;
      state.api.processedAttackIds = [];
      state.api.pendingHits = [];
      state.api.paused = false;
    }

    const oldMode = state.api.mode;
    const mode = document.querySelector('#hkmcq-api-mode');
    const attackPoll = document.querySelector('#hkmcq-attack-poll');
    const chainPoll = document.querySelector('#hkmcq-chain-poll');

    if (mode) state.api.mode = mode.value;
    if (attackPoll) state.api.attackPollSeconds = clamp(Number(attackPoll.value) || 5, 3, 60);
    if (chainPoll) state.api.chainPollSeconds = clamp(Number(chainPoll.value) || 10, 5, 120);

    if (oldMode === 'manual' && state.api.mode !== 'manual') {
      state.api.baselineReady = false;
      state.api.processedAttackIds = [];
      state.api.pendingHits = [];
      state.api.paused = false;
      state.api.status = 'Starting API watch…';
    }

    if (state.api.mode === 'manual') {
      state.api.status = getApiKey() ? 'Manual mode — API watch stopped' : 'Manual mode';
    } else if (!getApiKey()) {
      state.api.status = 'API key required';
    }

    state.api.lastAttackPoll = 0;
    state.api.lastChainPoll = 0;
    saveNow();
    renderSettings();
    refresh({ roster: true });
    toast('API settings saved.');

    if (automationActive()) {
      pollChain();
      pollAttacks(true);
    }
  }

  function removeApiKey() {
    if (!confirm('Remove the saved Torn API key from Merc-C-Que?')) return;
    clearApiKey();
    apiKeyDraft = '';
    Object.assign(state.api, {
      mode: 'manual', paused: false, baselineReady: false,
      processedAttackIds: [], pendingHits: [],
      status: 'Manual mode', lastError: ''
    });
    saveNow();
    renderSettings();
    refresh({ roster: true });
    toast('API key removed.');
  }

  function confirmPending(addUnknown = false) {
    const event = state.api.pendingHits[0];
    if (!event) return;
    if (event.kind === 'unknown' && !addUnknown) return;

    pushHistory(`confirm hit #${event.chain} by ${event.attacker}`, {
      attackId: event.id, attacker: event.attacker, chain: event.chain,
      kind: event.kind, expected: event.kind === 'expected', mode: state.api.mode
    });

    if (event.kind === 'unknown') {
      state.roster.push({ name: event.attacker, status: 'ready', hits: 1 });
      updateLedger(event.id, 'added-and-recorded');
    } else {
      rotateParticipant(event.attacker, { recordHit: true, saveHistory: false });
      updateLedger(event.id, 'recorded');
    }

    state.api.pendingHits.shift();
    state.api.status = `Recorded ${event.attacker} at hit #${event.chain}`;
    saveNow();
    refresh({ roster: true, settings: true });
  }

  function ignorePending() {
    const event = state.api.pendingHits.shift();
    if (!event) return;
    updateLedger(event.id, 'ignored');
    state.api.status = `Ignored detected hit #${event.chain} by ${event.attacker}`;
    saveNow();
    refresh({ settings: true });
  }

  function schedulerTick() {
    if (!automationActive()) return;
    const now = Date.now();
    if (now - Number(state.api.lastAttackPoll || 0) >= state.api.attackPollSeconds * 1000) {
      pollAttacks(false);
    }
    if (now - Number(state.api.lastChainPoll || 0) >= state.api.chainPollSeconds * 1000) {
      pollChain();
    }
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
    const c = dark ? {
      p: 'rgba(28,28,28,.98)', p2: '#252525', t: '#f1f1f1', m: '#aaa',
      b: '#505050', i: '#202020', btn: '#333', hov: '#444', s: '#fff',
      warn: '#3a2e17', active: '#4a4a4a'
    } : {
      p: 'rgba(248,248,248,.99)', p2: '#ededed', t: '#222', m: '#666',
      b: '#c5c5c5', i: '#fff', btn: '#e4e4e4', hov: '#d8d8d8', s: '#111',
      warn: '#fff4cf', active: '#d2d2d2'
    };

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#${PANEL_ID}{--p:${c.p};--p2:${c.p2};--t:${c.t};--m:${c.m};--b:${c.b};--i:${c.i};--btn:${c.btn};--hov:${c.hov};--s:${c.s};--warn:${c.warn};--active:${c.active};position:fixed;top:105px;right:16px;width:365px;z-index:999999;background:var(--p);color:var(--t);border:1px solid var(--b);border-radius:9px;box-shadow:0 10px 28px rgba(0,0,0,.32);font:13px Arial,Helvetica,sans-serif;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable;user-select:none}
#${PANEL_ID} *{box-sizing:border-box}
#${PANEL_ID} .head{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:7px;padding:9px 10px;background:var(--p2);border-bottom:1px solid var(--b);cursor:move}
#${PANEL_ID} .title{flex:1;font-weight:800;color:var(--s);letter-spacing:.2px}
#${PANEL_ID} .sub{font-size:10px;font-weight:400;color:var(--m);margin-top:1px}
#${PANEL_ID} button,#${PANEL_ID} input,#${PANEL_ID} textarea,#${PANEL_ID} select{font:inherit}
#${PANEL_ID} button{border:1px solid var(--b);background:var(--btn);color:var(--t);border-radius:6px;padding:5px 8px;cursor:pointer}
#${PANEL_ID} button:hover{background:var(--hov)}
#${PANEL_ID} button:disabled{cursor:default;opacity:.45}
#${PANEL_ID} .icon{width:28px;height:28px;padding:0;display:grid;place-items:center}
#${PANEL_ID} .main{padding:10px}
#${PANEL_ID} .up{text-align:center;padding:10px 8px;background:var(--p2);border:1px solid var(--b);border-radius:8px}
#${PANEL_ID} .kicker{font-size:10px;color:var(--m);letter-spacing:1px}
#${PANEL_ID} .upLine{display:flex;justify-content:center;align-items:baseline;gap:7px;flex-wrap:wrap;margin-top:4px}
#${PANEL_ID} .upName{font-size:21px;font-weight:800;color:var(--s)}
#${PANEL_ID} .hitBadge{font-size:12px;font-weight:700;color:var(--m)}
#${PANEL_ID} .nextGrid{display:grid;grid-template-columns:70px 1fr;gap:5px 8px;padding:8px 3px 2px}
#${PANEL_ID} .label{font-size:11px;color:var(--m)}
#${PANEL_ID} .nextPerson{display:flex;justify-content:space-between;gap:8px}
#${PANEL_ID} .queueHit{color:var(--m);font-size:10px;white-space:nowrap}
#${PANEL_ID} .controls{display:grid;grid-template-columns:1.5fr 1fr .8fr;gap:6px;margin-top:8px}
#${PANEL_ID} .done{font-weight:800;padding:8px 10px}
#${PANEL_ID} .done.locked{opacity:.5}
#${PANEL_ID} .hitRow{display:grid;grid-template-columns:auto 1fr auto;gap:7px;align-items:center;margin-top:8px}
#${PANEL_ID} input,#${PANEL_ID} textarea,#${PANEL_ID} select{width:100%;border:1px solid var(--b);background:var(--i);color:var(--t);border-radius:6px;padding:6px 7px;outline:none}
#${PANEL_ID} textarea{min-height:58px;resize:vertical;user-select:text;max-width:100%}
#${PANEL_ID} .preview{margin-top:8px;min-height:44px;white-space:pre-wrap;word-break:break-word;user-select:text}
#${PANEL_ID} .copy{width:100%;margin-top:5px;font-weight:700}
#${PANEL_ID} .apiStrip{margin-top:8px;padding:6px 7px;border:1px solid var(--b);border-radius:6px;font-size:10px;color:var(--m);display:flex;gap:7px;justify-content:space-between;align-items:center}
#${PANEL_ID} .apiStrip strong{color:var(--t)}
#${PANEL_ID} .pending{margin-top:8px;padding:8px;border:1px solid #9b7a2e;border-radius:7px;background:var(--warn)}
#${PANEL_ID} .pendingTitle{font-weight:800;margin-bottom:4px}
#${PANEL_ID} .pendingText{font-size:11px;line-height:1.35}
#${PANEL_ID} .pendingBtns{display:flex;gap:6px;margin-top:7px}
#${PANEL_ID} .pendingBtns button{flex:1}
#${PANEL_ID} .roster{margin-top:9px;max-height:245px;overflow:auto;border-top:1px solid var(--b)}
#${PANEL_ID} .row{display:grid;grid-template-columns:20px minmax(0,1fr) 46px 54px 25px;gap:5px;align-items:center;padding:6px 0;border-bottom:1px solid var(--b)}
#${PANEL_ID} .row[draggable=true]{cursor:grab}
#${PANEL_ID} .row.dragover{outline:1px dashed var(--m)}
#${PANEL_ID} .handle{text-align:center;color:var(--m)}
#${PANEL_ID} .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#${PANEL_ID} .assigned{font-size:10px;color:var(--m);margin-left:4px}
#${PANEL_ID} .phits{text-align:right;font-size:10px;color:var(--m)}
#${PANEL_ID} .status{font-size:10px;font-weight:700;padding:3px 5px;text-transform:uppercase}
#${PANEL_ID} .status[data-status=afk]{opacity:.55}
#${PANEL_ID} .remove{width:25px;height:25px;padding:0}
#${PANEL_ID} .settingsShell{margin-top:10px;padding-top:10px;border-top:1px solid var(--b)}
#${PANEL_ID} .settingsTabs{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px}
#${PANEL_ID} .settingsTabs button{padding:5px 3px;font-size:10px}
#${PANEL_ID} .settingsTabs button.active{background:var(--active);font-weight:800}
#${PANEL_ID} .sectionTitle{font-weight:800;margin-bottom:5px}
#${PANEL_ID} .help{font-size:10px;color:var(--m);line-height:1.35;margin-top:4px}
#${PANEL_ID} .miniRow{display:flex;gap:6px;margin-top:6px}
#${PANEL_ID} .miniRow>*{flex:1}
#${PANEL_ID} .settingsGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#${PANEL_ID} .full{grid-column:1/-1}
#${PANEL_ID} .apiStatusBox{margin-top:6px;padding:7px;border:1px solid var(--b);border-radius:6px;font-size:10px;line-height:1.4;color:var(--m)}
#${PANEL_ID} .ledger{max-height:250px;overflow:auto;border:1px solid var(--b);border-radius:6px}
#${PANEL_ID} .ledgerRow{display:grid;grid-template-columns:58px minmax(0,1fr) auto;gap:6px;padding:6px;border-bottom:1px solid var(--b);font-size:10px}
#${PANEL_ID} .ledgerRow:last-child{border-bottom:0}
#${PANEL_ID} .ledgerMeta{color:var(--m)}
#${LAUNCHER_ID}{position:fixed;z-index:1000000;min-width:78px;height:38px;padding:0 11px;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid ${c.b};border-radius:8px;background:${c.p2};color:${c.t};box-shadow:0 6px 18px rgba(0,0,0,.35);font:800 11px Arial,Helvetica,sans-serif;letter-spacing:.4px;cursor:grab;user-select:none}
#${LAUNCHER_ID}:hover{background:${c.hov}}
#${LAUNCHER_ID}.dragging{cursor:grabbing;opacity:.9}
#${LAUNCHER_ID} .launcherDot{width:8px;height:8px;border-radius:50%;background:#777;flex:0 0 auto}
#${LAUNCHER_ID}.active .launcherDot{background:#5ca85c}
#${LAUNCHER_ID}.paused .launcherDot{background:#c9902f}
#${LAUNCHER_ID}.pending .launcherDot{background:#c45b5b}
#${LAUNCHER_ID} .launcherBadge{position:absolute;top:-7px;right:-7px;min-width:19px;height:19px;padding:0 5px;display:grid;place-items:center;border-radius:999px;background:#b33;color:#fff;font-size:10px;font-weight:800;box-shadow:0 2px 7px rgba(0,0,0,.35)}
#${TOAST_ID}{position:fixed;right:20px;bottom:22px;z-index:1000001;background:rgba(20,20,20,.95);color:#fff;border-radius:7px;padding:9px 12px;font:13px Arial,Helvetica,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35)}
`;
    document.head.appendChild(style);
  }

  function defaultLauncherPosition() {
    return {
      left: Math.max(8, window.innerWidth - 95),
      top: Math.max(70, Math.round(window.innerHeight * 0.45))
    };
  }

  function clampPanelPosition(left, top, panel) {
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
    saveNow();
    renderApp();
  }

  function restoreApp() {
    state.minimized = false;
    saveNow();
    renderApp();
  }

  function rosterRowsHtml() {
    if (!state.roster.length) {
      return '<div style="padding:10px 2px;color:var(--m)">No participants yet. Open Setup to paste your roster.</div>';
    }
    const base = nextHitNumber();
    let readyOffset = 0;
    return state.roster.map((p, i) => {
      const assigned = p.status === 'ready' ? base + readyOffset++ : null;
      return `<div class="row" draggable="true" data-index="${i}">
        <div class="handle" title="Drag to reorder">☰</div>
        <div class="name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}${assigned != null ? `<span class="assigned">#${assigned}</span>` : ''}</div>
        <div class="phits" title="Completed hits recorded for this player">${p.hits} hit${p.hits === 1 ? '' : 's'}</div>
        <button class="status" data-action="status" data-index="${i}" data-status="${p.status}" title="Toggle READY / AFK">${p.status}</button>
        <button class="remove" data-action="remove" data-index="${i}" title="Remove from queue">×</button>
      </div>`;
    }).join('');
  }

  function pendingHtml() {
    const p = state.api.pendingHits[0];
    if (!p) return '';
    const count = state.api.pendingHits.length;
    const title = p.kind === 'expected' ? 'HIT DETECTED'
      : p.kind === 'unknown' ? 'UNQUEUED HIT DETECTED' : 'OUT-OF-ORDER HIT';
    let text = `<strong>${escapeHtml(p.attacker)}</strong> completed HIT #${p.chain}.`;
    if (p.kind === 'outoforder') text += `<br>Expected next: <strong>${escapeHtml(p.expectedPlayer)}</strong>.`;
    if (p.kind === 'unknown') text += '<br>This player is not currently in Merc-C-Que.';
    if (count > 1) text += `<br>${count - 1} additional detected hit${count - 1 === 1 ? '' : 's'} waiting.`;
    const confirm = p.kind === 'unknown' ? 'ADD & RECORD' : p.kind === 'expected' ? 'CONFIRM / ADVANCE' : 'RECORD HIT';
    return `<div class="pending"><div class="pendingTitle">⚠ ${title}</div>
      <div class="pendingText">${text}</div><div class="pendingBtns">
      <button data-action="confirmPending" data-add-unknown="${p.kind === 'unknown' ? '1' : '0'}">${confirm}</button>
      <button data-action="ignorePending">IGNORE</button></div></div>`;
  }

  function apiStripHtml() {
    if (state.api.mode === 'manual') {
      return '<div class="apiStrip"><strong>MANUAL</strong><span>API watch stopped</span></div>';
    }
    const mode = state.api.mode.toUpperCase();
    const chain = state.api.chainCurrent ?? '—';
    const last = state.api.lastHit
      ? `${escapeHtml(state.api.lastHit.attacker)} #${state.api.lastHit.chain}` : '—';
    return `<div class="apiStrip"><strong>${mode}${state.api.paused ? ' • PAUSED' : ''}</strong>
      <span>Chain ${chain}</span><span>Last ${last}</span></div>`;
  }

  function tabsHtml() {
    return ['roster', 'message', 'api', 'history'].map(key =>
      `<button data-action="settingsTab" data-tab="${key}" class="${state.settingsTab === key ? 'active' : ''}">${key.toUpperCase()}</button>`
    ).join('');
  }

  function rosterSettingsHtml() {
    return `<div class="sectionTitle">Roster setup</div>
      <textarea id="hkmcq-roster-editor" placeholder="HairyKary&#10;AngelValoel&#10;Gooey99&#10;LucianCrossborn&#10;Ziggy_Goodsbane">${escapeHtml(rosterDraft ?? state.roster.map(p => p.name).join('\n'))}</textarea>
      <div class="miniRow"><button data-action="saveRoster">SAVE ROSTER</button><button data-action="allReady">ALL READY</button></div>
      <div class="miniRow"><button data-action="resetHits">RESET PLAYER HITS</button><button data-action="resetSession">RESET SESSION</button></div>
      <div class="help">READY players rotate normally. AFK players remain listed but are skipped. Use × to remove someone entirely.</div>`;
  }

  function messageSettingsHtml() {
    return `<div class="sectionTitle">Chat message template</div>
      <textarea id="hkmcq-template">${escapeHtml(state.template)}</textarea>
      <div class="help">Placeholders: {current}, {hit}, {next}, {next_hit}, {ondeck}, {ondeck_hit}, {player_hits}, {ready_count}, {total_count}, {queue}, {last_hitter}, {last_hit}</div>`;
  }

  function apiSettingsHtml() {
    const hasKey = !!getApiKey();
    return `<div class="sectionTitle">API automation</div>
      <div class="settingsGrid">
        <select id="hkmcq-api-mode" class="full">
          <option value="manual" ${state.api.mode === 'manual' ? 'selected' : ''}>Manual — buttons only</option>
          <option value="assisted" ${state.api.mode === 'assisted' ? 'selected' : ''}>Assisted — detect hits, confirm advancement</option>
          <option value="auto" ${state.api.mode === 'auto' ? 'selected' : ''}>Auto — expected hits advance automatically</option>
        </select>
        <input id="hkmcq-api-key" class="full" type="password" autocomplete="off"
          placeholder="${hasKey ? 'API key saved — enter a new key only to replace it' : 'Paste Torn API key'}"
          value="${escapeHtml(apiKeyDraft)}">
        <label class="label">Attack check (sec)<input id="hkmcq-attack-poll" type="number" min="3" max="60" value="${state.api.attackPollSeconds}"></label>
        <label class="label">Chain sync (sec)<input id="hkmcq-chain-poll" type="number" min="5" max="120" value="${state.api.chainPollSeconds}"></label>
      </div>
      <div class="miniRow"><button data-action="saveApi">SAVE API SETTINGS</button><button data-action="testApi">TEST API</button></div>
      <div class="miniRow"><button data-action="clearApi">REMOVE SAVED KEY</button>
        <button data-action="resumeApi" ${state.api.paused ? '' : 'disabled'}>RESUME API</button></div>
      <div id="hkmcq-api-status" class="apiStatusBox"></div>
      <div class="help">The API key is stored through your userscript manager. Manual mode makes no recurring API calls.</div>`;
  }

  function historySettingsHtml() {
    const rows = state.ledger.length ? state.ledger.slice(0, 60).map(item =>
      `<div class="ledgerRow"><div class="ledgerMeta">${formatTime(item.timestamp)}</div>
       <div><strong>${escapeHtml(item.attacker)}</strong> ${item.chain ? `#${item.chain}` : ''}
       <div class="ledgerMeta">${escapeHtml(item.kind)} • ${escapeHtml(item.mode)}${item.undone ? ' • undone' : ''}</div></div>
       <div class="ledgerMeta">${escapeHtml(item.action)}</div></div>`
    ).join('') : '<div style="padding:10px;color:var(--m);font-size:11px">No Merc-C-Que events recorded yet.</div>';

    return `<div class="sectionTitle">Event history / diagnostics</div><div class="ledger">${rows}</div>
      <div class="miniRow"><button data-action="copyDebug">COPY DEBUG SNAPSHOT</button><button data-action="clearHistory">CLEAR HISTORY</button></div>
      <div class="help">History helps troubleshoot duplicate, out-of-order, Assisted, and Auto behavior. Debug snapshots do not include your API key.</div>`;
  }

  function settingsContentHtml() {
    if (state.settingsTab === 'message') return messageSettingsHtml();
    if (state.settingsTab === 'api') return apiSettingsHtml();
    if (state.settingsTab === 'history') return historySettingsHtml();
    return rosterSettingsHtml();
  }

  function settingsShellHtml() {
    if (!state.setupOpen) return '';
    return `<div class="settingsShell"><div class="settingsTabs">${tabsHtml()}</div>
      <div id="hkmcq-settings-content">${settingsContentHtml()}</div></div>`;
  }

  function renderSettings() {
    const slot = document.getElementById('hkmcq-settings-shell-slot');
    if (!slot) return;
    slot.innerHTML = settingsShellHtml();
    updateApiStatusBox();
    requestAnimationFrame(adjustPanelViewport);
  }

  function applyPanelPosition(panel) {
    if (!state.position || !Number.isFinite(Number(state.position.left)) || !Number.isFinite(Number(state.position.top))) return;
    const pos = clampPanelPosition(Number(state.position.left), Number(state.position.top), panel);
    Object.assign(panel.style, { left: `${pos.left}px`, top: `${pos.top}px`, right: 'auto' });
  }

  function renderPanel() {
    document.getElementById(LAUNCHER_ID)?.remove();
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      document.body.appendChild(panel);
      bindPanel(panel);
    }

    const ready = readyParticipants();
    const nums = hitNumbers();
    const locked = state.api.mode !== 'manual';

    panel.innerHTML = `<div class="head"><div class="title">HKs Merc-C-Que
      <div class="sub">Chain Queue Organizer • v${VERSION}</div></div>
      <button class="icon" data-action="setup" title="Roster / message / API setup">⚙</button>
      <button class="icon" data-action="minimize" title="Minimize Merc-C-Que">—</button></div>
      <div class="main">
      <div class="up"><div class="kicker">UP NOW</div><div class="upLine">
        <span id="hkmcq-up-name" class="upName">${escapeHtml(ready[0]?.name || 'No READY participant')}</span>
        <span id="hkmcq-hit-badge" class="hitBadge">• HIT #${nums.hit}</span></div></div>
      <div class="nextGrid"><div class="label">NEXT</div><div class="nextPerson">
        <span id="hkmcq-next-name">${escapeHtml(ready[1]?.name || '—')}</span><span id="hkmcq-next-hit" class="queueHit">HIT #${nums.nextHit}</span></div>
        <div class="label">ON DECK</div><div class="nextPerson"><span id="hkmcq-ondeck-name">${escapeHtml(ready[2]?.name || '—')}</span>
        <span id="hkmcq-ondeck-hit" class="queueHit">HIT #${nums.onDeckHit}</span></div></div>
      <div id="hkmcq-pending-slot">${pendingHtml()}</div>
      <div class="controls"><button id="hkmcq-done" class="done ${locked ? 'locked' : ''}" data-action="done"
        title="${locked ? 'Switch API Mode to Manual to use DONE' : 'Record hit and advance'}">✓ ${locked ? 'API ACTIVE' : 'DONE'}</button>
        <button data-action="skip">SKIP</button><button data-action="undo">↶ UNDO</button></div>
      <div class="hitRow"><span class="label">HIT</span><input id="hkmcq-hit-number" type="number" min="1" step="1"
        value="${nums.hit}" ${locked ? 'disabled' : ''}><span id="hkmcq-ready-count" class="label">${ready.length}/${state.roster.length} ready</span></div>
      <div id="hkmcq-api-strip-slot">${apiStripHtml()}</div>
      <div id="hkmcq-preview" class="preview">${escapeHtml(buildMessage())}</div>
      <button class="copy" data-action="copy">COPY MESSAGE</button>
      <div id="hkmcq-roster" class="roster">${rosterRowsHtml()}</div>
      <div id="hkmcq-settings-shell-slot">${settingsShellHtml()}</div></div>`;

    applyPanelPosition(panel);
    updateApiStatusBox();
    requestAnimationFrame(adjustPanelViewport);
  }

  function setText(panel, selector, value) {
    const el = panel.querySelector(selector);
    if (el) el.textContent = value;
  }

  function refresh({ roster = false, settings = false } = {}) {
    if (state.minimized) return renderLauncher();
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return renderPanel();

    const ready = readyParticipants();
    const nums = hitNumbers();
    setText(panel, '#hkmcq-up-name', ready[0]?.name || 'No READY participant');
    setText(panel, '#hkmcq-hit-badge', `• HIT #${nums.hit}`);
    setText(panel, '#hkmcq-next-name', ready[1]?.name || '—');
    setText(panel, '#hkmcq-next-hit', `HIT #${nums.nextHit}`);
    setText(panel, '#hkmcq-ondeck-name', ready[2]?.name || '—');
    setText(panel, '#hkmcq-ondeck-hit', `HIT #${nums.onDeckHit}`);
    setText(panel, '#hkmcq-ready-count', `${ready.length}/${state.roster.length} ready`);

    const hitInput = panel.querySelector('#hkmcq-hit-number');
    if (hitInput && document.activeElement !== hitInput) {
      hitInput.value = String(nums.hit);
      hitInput.disabled = state.api.mode !== 'manual';
    }

    const done = panel.querySelector('#hkmcq-done');
    if (done) {
      const locked = state.api.mode !== 'manual';
      done.classList.toggle('locked', locked);
      done.textContent = `✓ ${locked ? 'API ACTIVE' : 'DONE'}`;
      done.title = locked ? 'Switch API Mode to Manual to use DONE' : 'Record hit and advance';
    }

    const strip = panel.querySelector('#hkmcq-api-strip-slot');
    if (strip) strip.innerHTML = apiStripHtml();
    const pending = panel.querySelector('#hkmcq-pending-slot');
    if (pending) pending.innerHTML = pendingHtml();
    const preview = panel.querySelector('#hkmcq-preview');
    if (preview) preview.textContent = buildMessage();
    if (roster) {
      const rosterEl = panel.querySelector('#hkmcq-roster');
      if (rosterEl) rosterEl.innerHTML = rosterRowsHtml();
    }
    if (settings) renderSettings();
    updateApiStatusBox();
    requestAnimationFrame(adjustPanelViewport);
  }

  function updateApiStatusBox() {
    const box = document.querySelector('#hkmcq-api-status');
    if (!box) return;
    const last = state.api.lastHit ? `${state.api.lastHit.attacker} at #${state.api.lastHit.chain}` : '—';
    box.innerHTML =
      `Key: <strong>${getApiKey() ? 'Saved' : 'Not saved'}</strong>` +
      `<br>Status: ${escapeHtml(state.api.status || '—')}` +
      `<br>Current chain: ${state.api.chainCurrent ?? '—'} | Next hit: ${nextHitNumber()}` +
      `<br>Last detected: ${escapeHtml(last)}`;
  }

  function setApiStatusText(text) {
    const box = document.querySelector('#hkmcq-api-status');
    if (box) box.textContent = text;
  }

  function launcherClass() {
    if (state.api.pendingHits.length) return 'pending';
    if (state.api.paused) return 'paused';
    if (automationActive()) return 'active';
    return '';
  }

  function renderLauncher() {
    document.getElementById(PANEL_ID)?.remove();
    let launcher = document.getElementById(LAUNCHER_ID);
    if (!launcher) {
      launcher = document.createElement('button');
      launcher.id = LAUNCHER_ID;
      document.body.appendChild(launcher);
      bindLauncher(launcher);
    }

    launcher.className = launcherClass();
    const pending = state.api.pendingHits.length;
    launcher.innerHTML =
      `<span class="launcherDot"></span><span>MCQ #${nextHitNumber()}</span>` +
      (pending ? `<span class="launcherBadge" title="${pending} hit${pending === 1 ? '' : 's'} waiting for attention">${pending > 99 ? '99+' : pending}</span>` : '');

    const ready = readyParticipants();
    launcher.title = `Merc-C-Que — UP: ${ready[0]?.name || '—'} — HIT #${nextHitNumber()} — ${state.api.status || state.api.mode}`;

    const saved = state.launcherPosition;
    const initial = saved && Number.isFinite(Number(saved.left)) && Number.isFinite(Number(saved.top))
      ? { left: Number(saved.left), top: Number(saved.top) } : defaultLauncherPosition();
    const pos = clampLauncherPosition(initial.left, initial.top, launcher);
    Object.assign(launcher.style, {
      left: `${pos.left}px`, top: `${pos.top}px`, right: 'auto', bottom: 'auto'
    });
  }

  function renderApp() {
    installStyle();
    state.minimized ? renderLauncher() : renderPanel();
  }

  function bindPanel(panel) {
    panel.addEventListener('click', handleClick);
    panel.addEventListener('input', handleInput);
    panel.addEventListener('dragstart', e => {
      const row = e.target.closest('.row');
      if (row) rosterDragIndex = Number(row.dataset.index);
    });
    panel.addEventListener('dragover', e => {
      const row = e.target.closest('.row');
      if (!row) return;
      e.preventDefault();
      row.classList.add('dragover');
    });
    panel.addEventListener('dragleave', e => e.target.closest('.row')?.classList.remove('dragover'));
    panel.addEventListener('drop', e => {
      const row = e.target.closest('.row');
      if (!row) return;
      e.preventDefault();
      row.classList.remove('dragover');
      if (rosterDragIndex !== null) moveParticipant(rosterDragIndex, Number(row.dataset.index));
      rosterDragIndex = null;
    });
    panel.addEventListener('dragend', () => {
      rosterDragIndex = null;
      panel.querySelectorAll('.dragover').forEach(el => el.classList.remove('dragover'));
    });
    panel.addEventListener('mousedown', e => {
      if (!e.target.closest('.head') || e.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      panelDrag = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
      e.preventDefault();
    });
  }

  function handleClick(event) {
    const el = event.target.closest('[data-action]');
    if (!el) return;
    event.stopPropagation();
    const action = el.dataset.action;
    const index = Number(el.dataset.index);

    switch (action) {
      case 'done': manualDone(); break;
      case 'skip': skipCurrent(); break;
      case 'undo': undo(); break;
      case 'copy': copyMessage(); break;
      case 'status': toggleStatus(index); break;
      case 'remove': removeParticipant(index); break;
      case 'saveRoster':
        replaceRosterFromText(document.querySelector('#hkmcq-roster-editor')?.value || '');
        break;
      case 'allReady': setAllReady(); break;
      case 'resetHits': resetPlayerHits(); break;
      case 'resetSession': resetSession(); break;
      case 'saveApi': saveApiSettings(); break;
      case 'testApi': testApi(); break;
      case 'clearApi': removeApiKey(); break;
      case 'resumeApi':
        state.api.paused = false;
        state.api.lastError = '';
        state.api.status = 'Resuming API watch…';
        state.api.lastAttackPoll = 0;
        state.api.lastChainPoll = 0;
        saveNow();
        refresh({ settings: true });
        break;
      case 'confirmPending': confirmPending(el.dataset.addUnknown === '1'); break;
      case 'ignorePending': ignorePending(); break;
      case 'minimize': minimizeApp(); break;
      case 'setup':
        state.setupOpen = !state.setupOpen;
        saveNow();
        renderSettings();
        break;
      case 'settingsTab':
        state.settingsTab = el.dataset.tab;
        saveNow();
        renderSettings();
        break;
      case 'copyDebug': copyText(debugSnapshot(), 'Debug snapshot copied.'); break;
      case 'clearHistory': clearLedger(); break;
    }
  }

  function handleInput(event) {
    const el = event.target;
    if (el.matches('#hkmcq-hit-number')) {
      if (state.api.mode !== 'manual') return;
      state.manualNextHit = Math.max(1, Number(el.value) || 1);
      saveNow();
      refresh({ roster: true });
    } else if (el.matches('#hkmcq-template')) {
      state.template = el.value;
      saveSoon();
      const preview = document.querySelector('#hkmcq-preview');
      if (preview) preview.textContent = buildMessage();
    } else if (el.matches('#hkmcq-roster-editor')) {
      rosterDraft = el.value;
    } else if (el.matches('#hkmcq-api-key')) {
      apiKeyDraft = el.value;
    }
  }

  function bindLauncher(launcher) {
    launcher.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      const rect = launcher.getBoundingClientRect();
      launcherDrag = {
        startX: e.clientX, startY: e.clientY,
        offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top
      };
      launcherDragged = false;
      launcher.classList.add('dragging');
      e.preventDefault();
    });
    launcher.addEventListener('click', e => {
      e.preventDefault();
      if (Date.now() < suppressLauncherClickUntil) return;
      restoreApp();
    });
  }

  document.addEventListener('mousemove', e => {
    if (panelDrag) {
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        const pos = clampPanelPosition(
          e.clientX - panelDrag.offsetX, e.clientY - panelDrag.offsetY, panel
        );
        Object.assign(panel.style, { left: `${pos.left}px`, top: `${pos.top}px`, right: 'auto' });
        adjustPanelViewport();
      }
    }

    if (launcherDrag) {
      const launcher = document.getElementById(LAUNCHER_ID);
      if (launcher) {
        if (
          Math.abs(e.clientX - launcherDrag.startX) > 3 ||
          Math.abs(e.clientY - launcherDrag.startY) > 3
        ) launcherDragged = true;

        const pos = clampLauncherPosition(
          e.clientX - launcherDrag.offsetX, e.clientY - launcherDrag.offsetY, launcher
        );
        Object.assign(launcher.style, {
          left: `${pos.left}px`, top: `${pos.top}px`, right: 'auto', bottom: 'auto'
        });
      }
    }
  });

  document.addEventListener('mouseup', () => {
    if (panelDrag) {
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        const rect = panel.getBoundingClientRect();
        state.position = { left: Math.round(rect.left), top: Math.round(rect.top) };
        saveNow();
        adjustPanelViewport();
      }
      panelDrag = null;
    }

    if (launcherDrag) {
      const launcher = document.getElementById(LAUNCHER_ID);
      if (launcher) {
        const rect = launcher.getBoundingClientRect();
        state.launcherPosition = { left: Math.round(rect.left), top: Math.round(rect.top) };
        saveNow();
        launcher.classList.remove('dragging');
      }
      if (launcherDragged) suppressLauncherClickUntil = Date.now() + 250;
      launcherDrag = null;
      launcherDragged = false;
    }
  });

  window.addEventListener('resize', () => {
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      const rect = panel.getBoundingClientRect();
      const pos = clampPanelPosition(rect.left, rect.top, panel);
      Object.assign(panel.style, { left: `${pos.left}px`, top: `${pos.top}px`, right: 'auto' });
      state.position = { left: Math.round(pos.left), top: Math.round(pos.top) };
      adjustPanelViewport();
    }

    const launcher = document.getElementById(LAUNCHER_ID);
    if (launcher) {
      const rect = launcher.getBoundingClientRect();
      const pos = clampLauncherPosition(rect.left, rect.top, launcher);
      Object.assign(launcher.style, { left: `${pos.left}px`, top: `${pos.top}px` });
      state.launcherPosition = { left: Math.round(pos.left), top: Math.round(pos.top) };
    }
    saveNow();
  });

  function toast(message) {
    document.getElementById(TOAST_ID)?.remove();
    const el = document.createElement('div');
    el.id = TOAST_ID;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  function ensureMounted() {
    if (!document.body) return;
    if (state.minimized) {
      if (!document.getElementById(LAUNCHER_ID)) renderLauncher();
      document.getElementById(PANEL_ID)?.remove();
    } else {
      if (!document.getElementById(PANEL_ID)) renderPanel();
      document.getElementById(LAUNCHER_ID)?.remove();
    }
  }

  renderApp();
  setInterval(ensureMounted, 2500);
  setInterval(schedulerTick, 1000);

  if (automationActive()) {
    state.api.lastAttackPoll = 0;
    state.api.lastChainPoll = 0;
    if (!state.api.baselineReady) pollAttacks(true);
    pollChain();
  }
})();