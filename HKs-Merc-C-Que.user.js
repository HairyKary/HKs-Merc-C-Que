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

    // =========================================================
    // CONSTANTS
    // =========================================================

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
    const MAX_PROCESSED_ATTACKS = 150;
    const MAX_PENDING_HITS = 30;
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

    // =========================================================
    // RUNTIME
    // =========================================================

    let state = loadState();
    let history = [];

    let rosterDraft = null;
    let apiKeyDraft = '';

    let panelDrag = null;
    let launcherDrag = null;
    let launcherDragged = false;
    let suppressLauncherClickUntil = 0;
    let rosterDragIndex = null;

    let attackInFlight = false;
    let chainInFlight = false;

    let saveTimer = null;

    // =========================================================
    // GENERAL HELPERS
    // =========================================================

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function nowUnix() {
        return Math.floor(Date.now() / 1000);
    }

    function formatTime(unix) {
        if (!unix) return '—';

        try {
            return new Date(Number(unix) * 1000).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch {
            return '—';
        }
    }

    function normalizeParticipant(participant) {
        if (typeof participant === 'string') {
            return {
                name: participant.trim(),
                status: 'ready',
                hits: 0
            };
        }

        let status = String(participant?.status || 'ready').toLowerCase();

        if (status === 'out') status = 'afk';
        if (!['ready', 'afk'].includes(status)) status = 'ready';

        return {
            name: String(participant?.name || '').trim(),
            status,
            hits: Number.isFinite(Number(participant?.hits))
                ? Math.max(0, Number(participant.hits))
                : 0
        };
    }

    function normalizeApi(api) {
        return {
            ...clone(DEFAULT_STATE.api),
            ...(api || {}),

            mode: ['manual', 'assisted', 'auto'].includes(api?.mode)
                ? api.mode
                : 'manual',

            attackPollSeconds: clamp(
                Number(api?.attackPollSeconds) || 5,
                3,
                60
            ),

            chainPollSeconds: clamp(
                Number(api?.chainPollSeconds) || 10,
                5,
                120
            ),

            processedAttackIds: Array.isArray(api?.processedAttackIds)
                ? api.processedAttackIds.map(String).slice(0, MAX_PROCESSED_ATTACKS)
                : [],

            pendingHits: Array.isArray(api?.pendingHits)
                ? api.pendingHits.slice(0, MAX_PENDING_HITS)
                : []
        };
    }

    function normalizeLedger(ledger) {
        if (!Array.isArray(ledger)) return [];

        return ledger
            .filter(Boolean)
            .map(item => ({
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
            }))
            .slice(0, MAX_LEDGER);
    }

    // =========================================================
    // SAVED STATE / MIGRATION
    // =========================================================

    function migrateState(saved) {
        const migrated = {
            ...clone(DEFAULT_STATE),
            ...(saved || {})
        };

        migrated.schemaVersion = SCHEMA_VERSION;

        migrated.roster = Array.isArray(saved?.roster)
            ? saved.roster.map(normalizeParticipant)
            : [];

        migrated.api = normalizeApi(saved?.api);
        migrated.ledger = normalizeLedger(saved?.ledger);

        if (typeof saved?.minimized === 'boolean') {
            migrated.minimized = saved.minimized;
        } else if ('collapsed' in (saved || {})) {
            migrated.minimized = !!saved.collapsed;
        }

        if (!['roster', 'message', 'api', 'history'].includes(migrated.settingsTab)) {
            migrated.settingsTab = 'roster';
        }

        delete migrated.collapsed;

        return migrated;
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);

            if (raw) {
                return migrateState(JSON.parse(raw));
            }

            const legacyRaw = localStorage.getItem(LEGACY_KEY);

            if (legacyRaw) {
                const old = JSON.parse(legacyRaw);

                return migrateState({
                    roster: Array.isArray(old.roster) ? old.roster : [],
                    manualNextHit: Math.max(
                        1,
                        Number(old.hitNumber ?? old.chainNumber ?? 1) || 1
                    ),
                    template: String(old.template || DEFAULT_TEMPLATE)
                        .replace(/\{chain\}/gi, '{hit}'),
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

    function saveStateNow() {
        clearTimeout(saveTimer);
        saveTimer = null;

        state.schemaVersion = SCHEMA_VERSION;

        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(state)
        );
    }

    function scheduleSave(delay = 350) {
        clearTimeout(saveTimer);

        saveTimer = setTimeout(
            saveStateNow,
            delay
        );
    }

    function commit(mutator, options = {}) {
        const {
            save = true,
            render = 'dynamic'
        } = options;

        mutator();

        if (save) saveStateNow();

        if (render === 'full') {
            renderApp();
        } else if (render === 'dynamic') {
            refreshDynamicUi();
        } else if (render === 'settings') {
            renderSettingsContent();
            refreshDynamicUi();
        } else if (render === 'launcher') {
            renderLauncher();
        }
    }

    // =========================================================
    // API KEY STORAGE
    // =========================================================

    function getApiKey() {
        try {
            return String(GM_getValue(API_KEY_STORE, '') || '').trim();
        } catch {
            return '';
        }
    }

    function setApiKey(key) {
        GM_setValue(
            API_KEY_STORE,
            String(key || '').trim()
        );
    }

    function clearApiKey() {
        GM_deleteValue(API_KEY_STORE);
    }

    // =========================================================
    // HISTORY / UNDO
    // =========================================================

    function pushQueueHistory(reason = 'queue change', meta = {}) {
        history.push({
            reason,
            meta: clone(meta),
            roster: clone(state.roster),
            manualNextHit: state.manualNextHit,
            ledger: clone(state.ledger)
        });

        if (history.length > MAX_HISTORY) {
            history.shift();
        }
    }

    function undo() {
        if (!history.length) {
            toast('Nothing to undo.');
            return;
        }

        const previous = history.pop();

        state.roster = previous.roster;
        state.manualNextHit = previous.manualNextHit;
        state.ledger = previous.ledger;

        // Important: API processed IDs and live chain state are intentionally
        // not rolled back. The actual Torn hit still occurred, so undo should
        // reverse only Merc-C-Que's local queue effect and never re-detect it.
        if (previous.meta?.attackId) {
            const existing = state.ledger.find(
                item => String(item.id) === String(previous.meta.attackId)
            );

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
                    action: 'undone',
                    timestamp: nowUnix(),
                    result: '',
                    undone: true
                });
            }
        }

        saveStateNow();
        refreshDynamicUi({ roster: true, settings: true });

        toast(`Undid: ${previous.reason}.`);
    }

    // =========================================================
    // QUEUE
    // =========================================================

    function readyParticipants() {
        return state.roster.filter(
            participant => participant.status === 'ready'
        );
    }

    function currentIndex() {
        return state.roster.findIndex(
            participant => participant.status === 'ready'
        );
    }

    function findParticipantIndex(name) {
        const needle = String(name || '').trim().toLowerCase();

        return state.roster.findIndex(
            participant => participant.name.toLowerCase() === needle
        );
    }

    function automationActive() {
        return (
            state.api.mode !== 'manual' &&
            !!getApiKey() &&
            !state.api.paused
        );
    }

    function nextHitNumber() {
        if (
            state.api.mode !== 'manual' &&
            Number.isFinite(Number(state.api.chainCurrent))
        ) {
            return Math.max(
                1,
                Number(state.api.chainCurrent) + 1
            );
        }

        return Math.max(
            1,
            Number(state.manualNextHit) || 1
        );
    }

    function hitNumbers() {
        const hit = nextHitNumber();

        return {
            hit,
            nextHit: hit + 1,
            onDeckHit: hit + 2
        };
    }

    function rotateRosterParticipant(
        name,
        {
            recordHit = false,
            pushHistory = true,
            historyReason = 'queue rotation',
            historyMeta = {}
        } = {}
    ) {
        const index = findParticipantIndex(name);

        if (index < 0) return false;

        if (pushHistory) {
            pushQueueHistory(historyReason, historyMeta);
        }

        const [participant] = state.roster.splice(index, 1);

        if (recordHit) {
            participant.hits += 1;
        }

        state.roster.push(participant);

        return true;
    }

    function manualDone() {
        if (state.api.mode !== 'manual') {
            toast('Switch API Mode to Manual before using DONE.');
            return;
        }

        const index = currentIndex();

        if (index < 0) {
            toast('No READY participant.');
            return;
        }

        const participant = state.roster[index];

        pushQueueHistory('manual DONE');

        state.roster.splice(index, 1);
        participant.hits += 1;
        state.roster.push(participant);

        state.manualNextHit = nextHitNumber() + 1;

        addLedger({
            id: `manual-${Date.now()}`,
            attacker: participant.name,
            chain: state.manualNextHit - 1,
            kind: 'manual',
            expected: true,
            mode: 'manual',
            action: 'manual-recorded'
        });

        saveStateNow();
        refreshDynamicUi({ roster: true, settings: true });
    }

    function skipCurrent() {
        const index = currentIndex();

        if (index < 0) {
            toast('No READY participant.');
            return;
        }

        const participant = state.roster[index];

        pushQueueHistory('SKIP');

        state.roster.splice(index, 1);
        state.roster.push(participant);

        saveStateNow();
        refreshDynamicUi({ roster: true });
    }

    function toggleStatus(index) {
        if (!state.roster[index]) return;

        pushQueueHistory('READY / AFK change');

        state.roster[index].status =
            state.roster[index].status === 'ready'
                ? 'afk'
                : 'ready';

        saveStateNow();
        refreshDynamicUi({ roster: true });
    }

    function removeParticipant(index) {
        if (!state.roster[index]) return;

        pushQueueHistory('remove participant');

        state.roster.splice(index, 1);

        saveStateNow();
        refreshDynamicUi({ roster: true });
    }

    function moveParticipant(from, to) {
        if (
            from === to ||
            from < 0 ||
            to < 0 ||
            from >= state.roster.length ||
            to >= state.roster.length
        ) {
            return;
        }

        pushQueueHistory('reorder roster');

        const [participant] = state.roster.splice(from, 1);

        state.roster.splice(
            to,
            0,
            participant
        );

        saveStateNow();
        refreshDynamicUi({ roster: true });
    }

    // =========================================================
    // ROSTER SETUP
    // =========================================================

    function parseRosterText(text) {
        return String(text)
            .split(/\r?\n|,/)
            .map(value => value.trim())
            .filter(Boolean)
            .filter(
                (name, index, names) =>
                    names.findIndex(
                        value =>
                            value.toLowerCase() === name.toLowerCase()
                    ) === index
            );
    }

    function replaceRosterFromText(text) {
        const names = parseRosterText(text);

        const oldRoster = new Map(
            state.roster.map(
                participant => [
                    participant.name.toLowerCase(),
                    participant
                ]
            )
        );

        pushQueueHistory('save roster');

        state.roster = names.map(name => {
            const existing = oldRoster.get(name.toLowerCase());

            return existing
                ? {
                    ...existing,
                    name
                }
                : {
                    name,
                    status: 'ready',
                    hits: 0
                };
        });

        rosterDraft = null;

        saveStateNow();
        renderSettingsContent();
        refreshDynamicUi({ roster: true });

        toast(
            `Roster saved: ${state.roster.length} participant${
                state.roster.length === 1 ? '' : 's'
            }.`
        );
    }

    function setAllReady() {
        if (!state.roster.length) return;

        pushQueueHistory('all READY');

        state.roster.forEach(
            participant => participant.status = 'ready'
        );

        saveStateNow();
        refreshDynamicUi({ roster: true });
    }

    function resetPlayerHits() {
        if (!state.roster.length) return;

        if (!confirm('Reset all participant completed-hit counts to 0?')) {
            return;
        }

        pushQueueHistory('reset player hits');

        state.roster.forEach(
            participant => participant.hits = 0
        );

        saveStateNow();
        refreshDynamicUi({ roster: true });
    }

    function resetSession() {
        if (
            !confirm(
                'Reset player hit counts, manual hit number, API pending notices, and set everyone READY? Roster order will stay the same.'
            )
        ) {
            return;
        }

        pushQueueHistory('reset session');

        state.roster.forEach(participant => {
            participant.hits = 0;
            participant.status = 'ready';
        });

        state.manualNextHit = 1;
        state.api.pendingHits = [];
        state.ledger = [];

        saveStateNow();
        refreshDynamicUi({ roster: true, pending: true, settings: true });
    }

    // =========================================================
    // CHAT MESSAGE
    // =========================================================

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

            queue:
                ready.map(participant => participant.name).join(', ') ||
                '—',

            last_hitter:
                state.api.lastHit?.attacker ||
                '—',

            last_hit:
                state.api.lastHit?.chain != null
                    ? String(state.api.lastHit.chain)
                    : '—'
        };
    }

    function buildMessage() {
        const data = messageData();

        return String(state.template || '').replace(
            /\{(current|next|ondeck|hit|next_hit|ondeck_hit|player_hits|current_hits|ready_count|total_count|queue|last_hitter|last_hit)\}/gi,
            (_, key) =>
                data[key.toLowerCase()] ?? ''
        );
    }

    async function copyText(text, successMessage = 'Copied.') {
        if (!String(text).trim()) {
            toast('Nothing to copy.');
            return;
        }

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

    function copyMessage() {
        return copyText(
            buildMessage(),
            'Merc-C-Que message copied.'
        );
    }

    // =========================================================
    // EVENT LEDGER
    // =========================================================

    function addLedger(entry) {
        const id = String(entry?.id || `event-${Date.now()}`);

        const normalized = {
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

        state.ledger = [
            normalized,
            ...state.ledger.filter(
                item => String(item.id) !== id
            )
        ].slice(0, MAX_LEDGER);

        return normalized;
    }

    function updateLedgerAction(id, action, extra = {}) {
        const item = state.ledger.find(
            entry => String(entry.id) === String(id)
        );

        if (!item) return;

        item.action = action;
        Object.assign(item, extra);
    }

    function clearLedger() {
        if (!state.ledger.length) return;

        if (!confirm('Clear Merc-C-Que event history?')) return;

        state.ledger = [];
        saveStateNow();
        renderSettingsContent();
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

    // =========================================================
    // TORN API
    // =========================================================

    function apiRequest(path, params = {}, overrideKey = '') {
        const key = String(
            overrideKey ||
            getApiKey()
        ).trim();

        if (!key) {
            return Promise.reject(
                new Error('No API key saved.')
            );
        }

        const query = new URLSearchParams({
            ...params,
            timestamp: String(nowUnix()),
            comment: 'HKs Merc-C-Que'
        });

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',

                url:
                    `${API_BASE}${path}?${query.toString()}`,

                headers: {
                    Authorization:
                        `ApiKey ${key}`,
                    Accept:
                        'application/json'
                },

                timeout: 12000,

                onload: response => {
                    let data;

                    try {
                        data = JSON.parse(
                            response.responseText || '{}'
                        );
                    } catch {
                        reject(
                            new Error(
                                `API returned invalid JSON (HTTP ${response.status}).`
                            )
                        );
                        return;
                    }

                    if (data?.error) {
                        const code =
                            Number(data.error.code ?? 0);

                        const message =
                            data.error.error ||
                            data.error.message ||
                            'Unknown API error';

                        const error =
                            new Error(
                                `API ${code}: ${message}`
                            );

                        error.apiCode = code;

                        reject(error);
                        return;
                    }

                    if (
                        response.status < 200 ||
                        response.status >= 300
                    ) {
                        reject(
                            new Error(
                                `HTTP ${response.status}`
                            )
                        );
                        return;
                    }

                    resolve(data);
                },

                onerror: () =>
                    reject(
                        new Error(
                            'Network error contacting api.torn.com.'
                        )
                    ),

                ontimeout: () =>
                    reject(
                        new Error(
                            'Torn API request timed out.'
                        )
                    )
            });
        });
    }

    function fetchChain(key = '') {
        return apiRequest(
            '/faction/chain',
            {},
            key
        );
    }

    function fetchAttacks(key = '') {
        return apiRequest(
            '/faction/attacks',
            {
                filters: 'outgoing',
                limit: '50',
                sort: 'DESC'
            },
            key
        );
    }

    function validChainAttack(attack) {
        return !!(
            attack &&
            attack.attacker?.name &&
            Number(attack.chain) > 0 &&
            !attack.is_interrupted
        );
    }

    function attackId(attack) {
        return String(
            attack?.id ??
            attack?.code ??
            `${attack?.ended}-${attack?.attacker?.id}-${attack?.chain}`
        );
    }

    function markProcessed(id) {
        const stringId = String(id);

        state.api.processedAttackIds = [
            stringId,
            ...state.api.processedAttackIds.filter(
                value => value !== stringId
            )
        ].slice(0, MAX_PROCESSED_ATTACKS);
    }

    function addPendingHit(event) {
        if (
            state.api.pendingHits.some(
                item => String(item.id) === String(event.id)
            )
        ) {
            return;
        }

        state.api.pendingHits.push(event);

        state.api.pendingHits =
            state.api.pendingHits.slice(
                0,
                MAX_PENDING_HITS
            );
    }

    function processDetectedAttack(attack) {
        if (!validChainAttack(attack)) {
            return false;
        }

        const id = attackId(attack);
        const attacker = String(attack.attacker.name);
        const chain = Number(attack.chain);

        const current =
            readyParticipants()[0]?.name || '';

        const index =
            findParticipantIndex(attacker);

        const expected =
            !!current &&
            current.toLowerCase() === attacker.toLowerCase();

        const kind =
            index < 0
                ? 'unknown'
                : expected
                    ? 'expected'
                    : 'outoforder';

        state.api.chainCurrent = chain;
        state.manualNextHit = chain + 1;

        state.api.lastHit = {
            attacker,
            chain,
            ended: Number(attack.ended) || 0,
            result: attack.result || ''
        };

        const event = {
            id,
            attacker,
            chain,
            ended: Number(attack.ended) || 0,
            result: attack.result || '',
            kind,
            expectedPlayer: current || '—'
        };

        addLedger({
            id,
            attacker,
            chain,
            kind,
            expected,
            mode: state.api.mode,
            action: 'detected',
            timestamp: Number(attack.ended) || nowUnix(),
            result: attack.result || ''
        });

        if (
            state.api.mode === 'auto' &&
            index >= 0 &&
            expected
        ) {
            pushQueueHistory(
                `AUTO hit #${chain} by ${attacker}`,
                {
                    attackId: id,
                    attacker,
                    chain,
                    kind,
                    expected,
                    mode: state.api.mode
                }
            );

            rotateRosterParticipant(
                attacker,
                {
                    recordHit: true,
                    pushHistory: false
                }
            );

            updateLedgerAction(
                id,
                'auto-recorded'
            );

            state.api.status =
                `AUTO: ${attacker} recorded at #${chain}`;

            return true;
        }

        addPendingHit(event);

        updateLedgerAction(
            id,
            'pending'
        );

        if (index < 0) {
            state.api.status =
                `Hit #${chain}: ${attacker} is not in the queue`;
        } else if (expected) {
            state.api.status =
                `Hit #${chain} detected — awaiting confirmation`;
        } else {
            state.api.status =
                `Out-of-order hit #${chain}: ${attacker}`;
        }

        return true;
    }

    async function pollAttacks(forceBaseline = false) {
        if (
            attackInFlight ||
            !getApiKey()
        ) {
            return;
        }

        attackInFlight = true;
        state.api.lastAttackPoll = Date.now();

        try {
            const data = await fetchAttacks();

            const attacks =
                Array.isArray(data?.attacks)
                    ? data.attacks
                    : [];

            if (
                forceBaseline ||
                !state.api.baselineReady
            ) {
                attacks.forEach(
                    attack =>
                        markProcessed(
                            attackId(attack)
                        )
                );

                state.api.baselineReady = true;
                state.api.status =
                    'Connected — watching new faction hits';
                state.api.lastError = '';

                saveStateNow();
                refreshDynamicUi();

                return;
            }

            const processed =
                new Set(
                    state.api.processedAttackIds.map(String)
                );

            const fresh =
                attacks
                    .filter(
                        attack =>
                            !processed.has(
                                attackId(attack)
                            )
                    )
                    .sort(
                        (a, b) =>
                            (
                                Number(a.ended) -
                                Number(b.ended)
                            ) ||
                            attackId(a).localeCompare(
                                attackId(b)
                            )
                    );

            let changed = false;

            for (const attack of fresh) {
                markProcessed(
                    attackId(attack)
                );

                if (
                    processDetectedAttack(
                        attack
                    )
                ) {
                    changed = true;
                }
            }

            if (!fresh.length) {
                state.api.status =
                    'Connected — watching new faction hits';
            }

            state.api.lastError = '';

            saveStateNow();

            refreshDynamicUi({
                roster: changed,
                pending: changed,
                settings: changed
            });
        } catch (error) {
            handleApiError(error);
        } finally {
            attackInFlight = false;
        }
    }

    async function pollChain() {
        if (
            chainInFlight ||
            !getApiKey()
        ) {
            return;
        }

        chainInFlight = true;
        state.api.lastChainPoll = Date.now();

        try {
            const data = await fetchChain();
            const chain = data?.chain || null;

            if (chain) {
                const previousId =
                    state.api.chainId;

                const previousCurrent =
                    Number(
                        state.api.chainCurrent
                    );

                const newCurrent =
                    Number(chain.current) || 0;

                const newId =
                    chain.id ?? null;

                if (
                    previousId != null &&
                    newId != null &&
                    String(previousId) !== String(newId)
                ) {
                    state.api.baselineReady = false;
                    state.api.processedAttackIds = [];
                    state.api.pendingHits = [];

                    state.api.status =
                        'New chain detected — re-baselining attack watch';
                }

                const sameChain =
                    previousId != null &&
                    newId != null &&
                    String(previousId) === String(newId);

                const acceptedCurrent =
                    sameChain &&
                    Number.isFinite(previousCurrent) &&
                    newCurrent < previousCurrent
                        ? previousCurrent
                        : newCurrent;

                state.api.chainId =
                    newId;

                state.api.chainCurrent =
                    acceptedCurrent;

                state.api.chainMax =
                    Number(chain.max) || 0;

                state.api.chainTimeout =
                    Number(chain.timeout) || 0;

                state.manualNextHit =
                    acceptedCurrent + 1;
            } else {
                state.api.chainId = null;
                state.api.chainCurrent = null;
                state.api.chainMax = null;
                state.api.chainTimeout = null;
            }

            state.api.lastError = '';

            saveStateNow();
            refreshDynamicUi();
        } catch (error) {
            handleApiError(error);
        } finally {
            chainInFlight = false;
        }
    }

    function handleApiError(error) {
        const message =
            error?.message ||
            String(error);

        state.api.lastError =
            message;

        state.api.status =
            message;

        if (
            [1, 2, 7].includes(
                Number(error?.apiCode)
            )
        ) {
            state.api.paused = true;
            state.api.status =
                `${message} — automation paused`;
        }

        saveStateNow();
        refreshDynamicUi({ settings: true });
    }

    async function testApiConnection() {
        const key = String(
            apiKeyDraft ||
            getApiKey()
        ).trim();

        if (!key) {
            toast('Enter or save an API key first.');
            return;
        }

        setApiUiText('Testing API…');

        try {
            const [
                chainData,
                attackData
            ] = await Promise.all([
                fetchChain(key),
                fetchAttacks(key)
            ]);

            const chain =
                chainData?.chain;

            const attacks =
                Array.isArray(attackData?.attacks)
                    ? attackData.attacks
                    : [];

            const current =
                chain
                    ? Number(chain.current) || 0
                    : 0;

            state.api.paused = false;
            state.api.lastError = '';
            state.api.status =
                `API OK — chain ${current}; attack feed accessible (${attacks.length} returned)`;

            saveStateNow();
            refreshDynamicUi({ settings: true });

            toast('API connection successful.');
        } catch (error) {
            handleApiError(error);

            toast(
                error?.message ||
                'API test failed.'
            );
        }
    }

    function saveApiSettings() {
        const keyField =
            document.querySelector(
                '#hkmcq-api-key'
            );

        const newKey =
            String(
                keyField?.value ||
                apiKeyDraft ||
                ''
            ).trim();

        if (newKey) {
            setApiKey(newKey);
            apiKeyDraft = '';

            state.api.baselineReady = false;
            state.api.processedAttackIds = [];
            state.api.pendingHits = [];
            state.api.paused = false;
        }

        const modeElement =
            document.querySelector(
                '#hkmcq-api-mode'
            );

        const attackElement =
            document.querySelector(
                '#hkmcq-attack-poll'
            );

        const chainElement =
            document.querySelector(
                '#hkmcq-chain-poll'
            );

        const oldMode =
            state.api.mode;

        if (modeElement) {
            state.api.mode =
                modeElement.value;
        }

        if (attackElement) {
            state.api.attackPollSeconds =
                clamp(
                    Number(attackElement.value) || 5,
                    3,
                    60
                );
        }

        if (chainElement) {
            state.api.chainPollSeconds =
                clamp(
                    Number(chainElement.value) || 10,
                    5,
                    120
                );
        }

        if (
            oldMode === 'manual' &&
            state.api.mode !== 'manual'
        ) {
            state.api.baselineReady = false;
            state.api.processedAttackIds = [];
            state.api.pendingHits = [];
            state.api.paused = false;
            state.api.status =
                'Starting API watch…';
        }

        if (
            state.api.mode === 'manual'
        ) {
            state.api.status =
                getApiKey()
                    ? 'Manual mode — API watch stopped'
                    : 'Manual mode';
        } else if (!getApiKey()) {
            state.api.status =
                'API key required';
        }

        state.api.lastAttackPoll = 0;
        state.api.lastChainPoll = 0;

        saveStateNow();
        renderSettingsContent();
        refreshDynamicUi();

        toast('API settings saved.');

        if (automationActive()) {
            pollChain();
            pollAttacks(true);
        }
    }

    function removeSavedApiKey() {
        if (
            !confirm(
                'Remove the saved Torn API key from Merc-C-Que?'
            )
        ) {
            return;
        }

        clearApiKey();

        apiKeyDraft = '';

        state.api.mode = 'manual';
        state.api.paused = false;
        state.api.baselineReady = false;
        state.api.processedAttackIds = [];
        state.api.pendingHits = [];
        state.api.status = 'Manual mode';
        state.api.lastError = '';

        saveStateNow();
        renderSettingsContent();
        refreshDynamicUi();

        toast('API key removed.');
    }

    function confirmPendingHit(addUnknown = false) {
        const event =
            state.api.pendingHits[0];

        if (!event) return;

        pushQueueHistory(
            `confirm hit #${event.chain} by ${event.attacker}`,
            {
                attackId: event.id,
                attacker: event.attacker,
                chain: event.chain,
                kind: event.kind,
                expected: event.kind === 'expected',
                mode: state.api.mode
            }
        );

        if (event.kind === 'unknown') {
            if (!addUnknown) return;

            state.roster.push({
                name: event.attacker,
                status: 'ready',
                hits: 1
            });

            updateLedgerAction(
                event.id,
                'added-and-recorded'
            );
        } else {
            rotateRosterParticipant(
                event.attacker,
                {
                    recordHit: true,
                    pushHistory: false
                }
            );

            updateLedgerAction(
                event.id,
                'recorded'
            );
        }

        state.api.pendingHits.shift();

        state.api.status =
            `Recorded ${event.attacker} at hit #${event.chain}`;

        saveStateNow();
        refreshDynamicUi({ roster: true, pending: true, settings: true });
    }

    function ignorePendingHit() {
        const event =
            state.api.pendingHits.shift();

        if (!event) return;

        updateLedgerAction(
            event.id,
            'ignored'
        );

        state.api.status =
            `Ignored detected hit #${event.chain} by ${event.attacker}`;

        saveStateNow();
        refreshDynamicUi({ pending: true, settings: true });
    }

    function schedulerTick() {
        if (!automationActive()) return;

        const now = Date.now();

        if (
            now -
                Number(state.api.lastAttackPoll || 0) >=
            state.api.attackPollSeconds * 1000
        ) {
            pollAttacks(false);
        }

        if (
            now -
                Number(state.api.lastChainPoll || 0) >=
            state.api.chainPollSeconds * 1000
        ) {
            pollChain();
        }
    }

    // =========================================================
    // THEME / STYLE
    // =========================================================

    function detectDarkTheme() {
        try {
            const rgb =
                getComputedStyle(document.body)
                    .backgroundColor
                    .match(/\d+/g)
                    ?.map(Number) ||
                [30, 30, 30];

            return (
                0.299 * rgb[0] +
                0.587 * rgb[1] +
                0.114 * rgb[2]
            ) < 135;
        } catch {
            return true;
        }
    }

    function installStyle() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const dark = detectDarkTheme();

        const colors = dark
            ? {
                panel: 'rgba(28,28,28,.98)',
                panel2: '#252525',
                text: '#f1f1f1',
                muted: '#aaa',
                border: '#505050',
                input: '#202020',
                button: '#333',
                hover: '#444',
                strong: '#fff',
                warn: '#3a2e17',
                active: '#4a4a4a'
            }
            : {
                panel: 'rgba(248,248,248,.99)',
                panel2: '#ededed',
                text: '#222',
                muted: '#666',
                border: '#c5c5c5',
                input: '#fff',
                button: '#e4e4e4',
                hover: '#d8d8d8',
                strong: '#111',
                warn: '#fff4cf',
                active: '#d2d2d2'
            };

        const style =
            document.createElement('style');

        style.id = STYLE_ID;

        style.textContent = `
            #${PANEL_ID} {
                --p:${colors.panel};
                --p2:${colors.panel2};
                --t:${colors.text};
                --m:${colors.muted};
                --b:${colors.border};
                --i:${colors.input};
                --btn:${colors.button};
                --hov:${colors.hover};
                --s:${colors.strong};
                --warn:${colors.warn};
                --active:${colors.active};

                position:fixed;
                top:105px;
                right:16px;
                width:365px;
                z-index:999999;
                background:var(--p);
                color:var(--t);
                border:1px solid var(--b);
                border-radius:9px;
                box-shadow:0 10px 28px rgba(0,0,0,.32);
                font:13px Arial,Helvetica,sans-serif;
                overflow-y:auto;
                overflow-x:hidden;
                overscroll-behavior:contain;
                scrollbar-gutter:stable;
                user-select:none;
            }

            #${PANEL_ID} * {
                box-sizing:border-box;
            }

            #${PANEL_ID} .head {
                position:sticky;
                top:0;
                z-index:10;
                display:flex;
                align-items:center;
                gap:7px;
                padding:9px 10px;
                background:var(--p2);
                border-bottom:1px solid var(--b);
                cursor:move;
            }

            #${PANEL_ID} .title {
                flex:1;
                font-weight:800;
                color:var(--s);
                letter-spacing:.2px;
            }

            #${PANEL_ID} .sub {
                font-size:10px;
                font-weight:400;
                color:var(--m);
                margin-top:1px;
            }

            #${PANEL_ID} button,
            #${PANEL_ID} input,
            #${PANEL_ID} textarea,
            #${PANEL_ID} select {
                font:inherit;
            }

            #${PANEL_ID} button {
                border:1px solid var(--b);
                background:var(--btn);
                color:var(--t);
                border-radius:6px;
                padding:5px 8px;
                cursor:pointer;
            }

            #${PANEL_ID} button:hover {
                background:var(--hov);
            }

            #${PANEL_ID} button:disabled {
                cursor:default;
                opacity:.45;
            }

            #${PANEL_ID} .icon {
                width:28px;
                height:28px;
                padding:0;
                display:grid;
                place-items:center;
            }

            #${PANEL_ID} .main {
                padding:10px;
            }

            #${PANEL_ID} .up {
                text-align:center;
                padding:10px 8px;
                background:var(--p2);
                border:1px solid var(--b);
                border-radius:8px;
            }

            #${PANEL_ID} .kicker {
                font-size:10px;
                color:var(--m);
                letter-spacing:1px;
            }

            #${PANEL_ID} .upLine {
                display:flex;
                justify-content:center;
                align-items:baseline;
                gap:7px;
                flex-wrap:wrap;
                margin-top:4px;
            }

            #${PANEL_ID} .upName {
                font-size:21px;
                font-weight:800;
                color:var(--s);
            }

            #${PANEL_ID} .hitBadge {
                font-size:12px;
                font-weight:700;
                color:var(--m);
            }

            #${PANEL_ID} .nextGrid {
                display:grid;
                grid-template-columns:70px 1fr;
                gap:5px 8px;
                padding:8px 3px 2px;
            }

            #${PANEL_ID} .label {
                font-size:11px;
                color:var(--m);
            }

            #${PANEL_ID} .nextPerson {
                display:flex;
                justify-content:space-between;
                gap:8px;
            }

            #${PANEL_ID} .queueHit {
                color:var(--m);
                font-size:10px;
                white-space:nowrap;
            }

            #${PANEL_ID} .controls {
                display:grid;
                grid-template-columns:1.5fr 1fr .8fr;
                gap:6px;
                margin-top:8px;
            }

            #${PANEL_ID} .done {
                font-weight:800;
                padding:8px 10px;
            }

            #${PANEL_ID} .done.locked {
                opacity:.5;
            }

            #${PANEL_ID} .hitRow {
                display:grid;
                grid-template-columns:auto 1fr auto;
                gap:7px;
                align-items:center;
                margin-top:8px;
            }

            #${PANEL_ID} input,
            #${PANEL_ID} textarea,
            #${PANEL_ID} select {
                width:100%;
                border:1px solid var(--b);
                background:var(--i);
                color:var(--t);
                border-radius:6px;
                padding:6px 7px;
                outline:none;
            }

            #${PANEL_ID} textarea {
                min-height:58px;
                resize:vertical;
                user-select:text;
                max-width:100%;
            }

            #${PANEL_ID} .preview {
                margin-top:8px;
                min-height:44px;
                white-space:pre-wrap;
                word-break:break-word;
                user-select:text;
            }

            #${PANEL_ID} .copy {
                width:100%;
                margin-top:5px;
                font-weight:700;
            }

            #${PANEL_ID} .apiStrip {
                margin-top:8px;
                padding:6px 7px;
                border:1px solid var(--b);
                border-radius:6px;
                font-size:10px;
                color:var(--m);
                display:flex;
                gap:7px;
                justify-content:space-between;
                align-items:center;
            }

            #${PANEL_ID} .apiStrip strong {
                color:var(--t);
            }

            #${PANEL_ID} .pending {
                margin-top:8px;
                padding:8px;
                border:1px solid #9b7a2e;
                border-radius:7px;
                background:var(--warn);
            }

            #${PANEL_ID} .pendingTitle {
                font-weight:800;
                margin-bottom:4px;
            }

            #${PANEL_ID} .pendingText {
                font-size:11px;
                line-height:1.35;
            }

            #${PANEL_ID} .pendingBtns {
                display:flex;
                gap:6px;
                margin-top:7px;
            }

            #${PANEL_ID} .pendingBtns button {
                flex:1;
            }

            #${PANEL_ID} .roster {
                margin-top:9px;
                max-height:245px;
                overflow:auto;
                border-top:1px solid var(--b);
            }

            #${PANEL_ID} .row {
                display:grid;
                grid-template-columns:20px minmax(0,1fr) 46px 54px 25px;
                gap:5px;
                align-items:center;
                padding:6px 0;
                border-bottom:1px solid var(--b);
            }

            #${PANEL_ID} .row[draggable=true] {
                cursor:grab;
            }

            #${PANEL_ID} .row.dragover {
                outline:1px dashed var(--m);
            }

            #${PANEL_ID} .handle {
                text-align:center;
                color:var(--m);
            }

            #${PANEL_ID} .name {
                overflow:hidden;
                text-overflow:ellipsis;
                white-space:nowrap;
            }

            #${PANEL_ID} .name .assigned {
                font-size:10px;
                color:var(--m);
                margin-left:4px;
            }

            #${PANEL_ID} .phits {
                text-align:right;
                font-size:10px;
                color:var(--m);
            }

            #${PANEL_ID} .status {
                font-size:10px;
                font-weight:700;
                padding:3px 5px;
                text-transform:uppercase;
            }

            #${PANEL_ID} .status[data-status=afk] {
                opacity:.55;
            }

            #${PANEL_ID} .remove {
                width:25px;
                height:25px;
                padding:0;
            }

            #${PANEL_ID} .settingsShell {
                margin-top:10px;
                padding-top:10px;
                border-top:1px solid var(--b);
            }

            #${PANEL_ID} .settingsTabs {
                display:grid;
                grid-template-columns:repeat(4,1fr);
                gap:4px;
                margin-bottom:8px;
            }

            #${PANEL_ID} .settingsTabs button {
                padding:5px 3px;
                font-size:10px;
            }

            #${PANEL_ID} .settingsTabs button.active {
                background:var(--active);
                font-weight:800;
            }

            #${PANEL_ID} .sectionTitle {
                font-weight:800;
                margin-bottom:5px;
            }

            #${PANEL_ID} .help {
                font-size:10px;
                color:var(--m);
                line-height:1.35;
                margin-top:4px;
            }

            #${PANEL_ID} .miniRow {
                display:flex;
                gap:6px;
                margin-top:6px;
            }

            #${PANEL_ID} .miniRow > * {
                flex:1;
            }

            #${PANEL_ID} .settingsGrid {
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:6px;
            }

            #${PANEL_ID} .full {
                grid-column:1 / -1;
            }

            #${PANEL_ID} .apiStatusBox {
                margin-top:6px;
                padding:7px;
                border:1px solid var(--b);
                border-radius:6px;
                font-size:10px;
                line-height:1.4;
                color:var(--m);
            }

            #${PANEL_ID} .ledger {
                max-height:250px;
                overflow:auto;
                border:1px solid var(--b);
                border-radius:6px;
            }

            #${PANEL_ID} .ledgerRow {
                display:grid;
                grid-template-columns:58px minmax(0,1fr) auto;
                gap:6px;
                padding:6px;
                border-bottom:1px solid var(--b);
                font-size:10px;
            }

            #${PANEL_ID} .ledgerRow:last-child {
                border-bottom:0;
            }

            #${PANEL_ID} .ledgerMeta {
                color:var(--m);
            }

            #${LAUNCHER_ID} {
                position:fixed;
                z-index:1000000;
                min-width:78px;
                height:38px;
                padding:0 11px;
                display:flex;
                align-items:center;
                justify-content:center;
                gap:6px;
                border:1px solid ${colors.border};
                border-radius:8px;
                background:${colors.panel2};
                color:${colors.text};
                box-shadow:0 6px 18px rgba(0,0,0,.35);
                font:800 11px Arial,Helvetica,sans-serif;
                letter-spacing:.4px;
                cursor:grab;
                user-select:none;
            }

            #${LAUNCHER_ID}:hover {
                background:${colors.hover};
            }

            #${LAUNCHER_ID}.dragging {
                cursor:grabbing;
                opacity:.9;
            }

            #${LAUNCHER_ID} .launcherDot {
                width:8px;
                height:8px;
                border-radius:50%;
                background:#777;
                flex:0 0 auto;
            }

            #${LAUNCHER_ID}.active .launcherDot {
                background:#5ca85c;
            }

            #${LAUNCHER_ID}.paused .launcherDot {
                background:#c9902f;
            }

            #${LAUNCHER_ID}.pending .launcherDot {
                background:#c45b5b;
            }

            #${LAUNCHER_ID} .launcherBadge {
                position:absolute;
                top:-7px;
                right:-7px;
                min-width:19px;
                height:19px;
                padding:0 5px;
                display:grid;
                place-items:center;
                border-radius:999px;
                background:#b33;
                color:#fff;
                font-size:10px;
                font-weight:800;
                box-shadow:0 2px 7px rgba(0,0,0,.35);
            }

            #${TOAST_ID} {
                position:fixed;
                right:20px;
                bottom:22px;
                z-index:1000001;
                background:rgba(20,20,20,.95);
                color:#fff;
                border-radius:7px;
                padding:9px 12px;
                font:13px Arial,Helvetica,sans-serif;
                box-shadow:0 6px 20px rgba(0,0,0,.35);
            }
        `;

        document.head.appendChild(style);
    }

    // =========================================================
    // POSITIONING
    // =========================================================

    function defaultLauncherPosition() {
        return {
            left:
                Math.max(
                    8,
                    window.innerWidth - 95
                ),
            top:
                Math.max(
                    70,
                    Math.round(
                        window.innerHeight * 0.45
                    )
                )
        };
    }

    function clampPanelPosition(left, top, panel) {
        return {
            left:
                clamp(
                    left,
                    0,
                    Math.max(
                        0,
                        window.innerWidth -
                        panel.offsetWidth
                    )
                ),
            top:
                clamp(
                    top,
                    0,
                    Math.max(
                        0,
                        window.innerHeight -
                        180
                    )
                )
        };
    }

    function clampLauncherPosition(left, top, launcher) {
        return {
            left:
                clamp(
                    left,
                    6,
                    Math.max(
                        6,
                        window.innerWidth -
                        launcher.offsetWidth -
                        6
                    )
                ),
            top:
                clamp(
                    top,
                    6,
                    Math.max(
                        6,
                        window.innerHeight -
                        launcher.offsetHeight -
                        6
                    )
                )
        };
    }

    function adjustPanelViewport() {
        const panel =
            document.getElementById(PANEL_ID);

        if (!panel) return;

        const rect =
            panel.getBoundingClientRect();

        const available =
            Math.max(
                180,
                window.innerHeight -
                rect.top -
                12
            );

        panel.style.maxHeight =
            `${available}px`;
    }

    function minimizeApp() {
        const panel =
            document.getElementById(PANEL_ID);

        if (panel) {
            const rect =
                panel.getBoundingClientRect();

            state.position = {
                left:
                    Math.round(rect.left),
                top:
                    Math.round(rect.top)
            };
        }

        state.minimized = true;
        saveStateNow();
        renderApp();
    }

    function restoreApp() {
        state.minimized = false;
        saveStateNow();
        renderApp();
    }

    // =========================================================
    // HTML PARTIALS
    // =========================================================

    function rosterRowsHtml() {
        if (!state.roster.length) {
            return `
                <div style="padding:10px 2px;color:var(--m);">
                    No participants yet. Open Setup to paste your roster.
                </div>
            `;
        }

        const base =
            nextHitNumber();

        let readyOffset = 0;

        return state.roster
            .map((participant, index) => {
                const assigned =
                    participant.status === 'ready'
                        ? base + readyOffset++
                        : null;

                return `
                    <div
                        class="row"
                        draggable="true"
                        data-index="${index}"
                    >
                        <div class="handle" title="Drag to reorder">☰</div>

                        <div
                            class="name"
                            title="${escapeHtml(participant.name)}"
                        >
                            ${escapeHtml(participant.name)}
                            ${
                                assigned != null
                                    ? `<span class="assigned">#${assigned}</span>`
                                    : ''
                            }
                        </div>

                        <div
                            class="phits"
                            title="Completed hits recorded for this player"
                        >
                            ${participant.hits} hit${participant.hits === 1 ? '' : 's'}
                        </div>

                        <button
                            class="status"
                            data-action="status"
                            data-index="${index}"
                            data-status="${participant.status}"
                            title="Toggle READY / AFK"
                        >
                            ${participant.status}
                        </button>

                        <button
                            class="remove"
                            data-action="remove"
                            data-index="${index}"
                            title="Remove from queue"
                        >
                            ×
                        </button>
                    </div>
                `;
            })
            .join('');
    }

    function pendingHtml() {
        const pending =
            state.api.pendingHits[0];

        if (!pending) return '';

        const count =
            state.api.pendingHits.length;

        const title =
            pending.kind === 'expected'
                ? 'HIT DETECTED'
                : pending.kind === 'unknown'
                    ? 'UNQUEUED HIT DETECTED'
                    : 'OUT-OF-ORDER HIT';

        let text =
            `<strong>${escapeHtml(pending.attacker)}</strong> completed HIT #${pending.chain}.`;

        if (pending.kind === 'outoforder') {
            text +=
                `<br>Expected next: <strong>${escapeHtml(pending.expectedPlayer)}</strong>.`;
        }

        if (pending.kind === 'unknown') {
            text +=
                '<br>This player is not currently in Merc-C-Que.';
        }

        if (count > 1) {
            text +=
                `<br>${count - 1} additional detected hit${count - 1 === 1 ? '' : 's'} waiting.`;
        }

        const confirmLabel =
            pending.kind === 'unknown'
                ? 'ADD & RECORD'
                : pending.kind === 'expected'
                    ? 'CONFIRM / ADVANCE'
                    : 'RECORD HIT';

        return `
            <div class="pending">
                <div class="pendingTitle">⚠ ${title}</div>

                <div class="pendingText">${text}</div>

                <div class="pendingBtns">
                    <button
                        data-action="confirmPending"
                        data-add-unknown="${pending.kind === 'unknown' ? '1' : '0'}"
                    >
                        ${confirmLabel}
                    </button>

                    <button data-action="ignorePending">
                        IGNORE
                    </button>
                </div>
            </div>
        `;
    }

    function apiStripHtml() {
        const mode =
            state.api.mode.toUpperCase();

        if (state.api.mode === 'manual') {
            return `
                <div class="apiStrip">
                    <strong>MANUAL</strong>
                    <span>API watch stopped</span>
                </div>
            `;
        }

        const chain =
            state.api.chainCurrent != null
                ? state.api.chainCurrent
                : '—';

        const last =
            state.api.lastHit
                ? `${escapeHtml(state.api.lastHit.attacker)} #${state.api.lastHit.chain}`
                : '—';

        const paused =
            state.api.paused
                ? ' • PAUSED'
                : '';

        return `
            <div class="apiStrip">
                <strong>${mode}${paused}</strong>
                <span>Chain ${chain}</span>
                <span>Last ${last}</span>
            </div>
        `;
    }

    function settingsTabsHtml() {
        const tabs = [
            ['roster', 'ROSTER'],
            ['message', 'MESSAGE'],
            ['api', 'API'],
            ['history', 'HISTORY']
        ];

        return `
            <div class="settingsTabs">
                ${tabs.map(([key, label]) => `
                    <button
                        data-action="settingsTab"
                        data-tab="${key}"
                        class="${state.settingsTab === key ? 'active' : ''}"
                    >
                        ${label}
                    </button>
                `).join('')}
            </div>
        `;
    }

    function rosterSettingsHtml() {
        return `
            <div class="sectionTitle">
                Roster setup
            </div>

            <textarea
                id="hkmcq-roster-editor"
                placeholder="HairyKary&#10;AngelValoel&#10;Gooey99&#10;LucianCrossborn&#10;Ziggy_Goodsbane"
            >${escapeHtml(
                rosterDraft ??
                state.roster
                    .map(participant => participant.name)
                    .join('\n')
            )}</textarea>

            <div class="miniRow">
                <button data-action="saveRoster">
                    SAVE ROSTER
                </button>

                <button data-action="allReady">
                    ALL READY
                </button>
            </div>

            <div class="miniRow">
                <button data-action="resetHits">
                    RESET PLAYER HITS
                </button>

                <button data-action="resetSession">
                    RESET SESSION
                </button>
            </div>

            <div class="help">
                READY players rotate normally. AFK players remain listed
                but are skipped. Use × to remove someone entirely.
            </div>
        `;
    }

    function messageSettingsHtml() {
        return `
            <div class="sectionTitle">
                Chat message template
            </div>

            <textarea
                id="hkmcq-template"
            >${escapeHtml(state.template)}</textarea>

            <div class="help">
                Placeholders:
                {current}, {hit}, {next}, {next_hit},
                {ondeck}, {ondeck_hit}, {player_hits},
                {ready_count}, {total_count}, {queue},
                {last_hitter}, {last_hit}
            </div>
        `;
    }

    function apiSettingsHtml() {
        const hasKey =
            !!getApiKey();

        const status =
            escapeHtml(
                state.api.status ||
                ''
            );

        const error =
            state.api.lastError
                ? `
                    <br>
                    <span style="color:#c66">
                        ${escapeHtml(state.api.lastError)}
                    </span>
                `
                : '';

        return `
            <div class="sectionTitle">
                API automation
            </div>

            <div class="settingsGrid">
                <select
                    id="hkmcq-api-mode"
                    class="full"
                >
                    <option
                        value="manual"
                        ${state.api.mode === 'manual' ? 'selected' : ''}
                    >
                        Manual — buttons only
                    </option>

                    <option
                        value="assisted"
                        ${state.api.mode === 'assisted' ? 'selected' : ''}
                    >
                        Assisted — detect hits, confirm advancement
                    </option>

                    <option
                        value="auto"
                        ${state.api.mode === 'auto' ? 'selected' : ''}
                    >
                        Auto — expected hits advance automatically
                    </option>
                </select>

                <input
                    id="hkmcq-api-key"
                    class="full"
                    type="password"
                    autocomplete="off"
                    placeholder="${
                        hasKey
                            ? 'API key saved — enter a new key only to replace it'
                            : 'Paste Torn API key'
                    }"
                    value="${escapeHtml(apiKeyDraft)}"
                >

                <label class="label">
                    Attack check (sec)

                    <input
                        id="hkmcq-attack-poll"
                        type="number"
                        min="3"
                        max="60"
                        value="${state.api.attackPollSeconds}"
                    >
                </label>

                <label class="label">
                    Chain sync (sec)

                    <input
                        id="hkmcq-chain-poll"
                        type="number"
                        min="5"
                        max="120"
                        value="${state.api.chainPollSeconds}"
                    >
                </label>
            </div>

            <div class="miniRow">
                <button data-action="saveApi">
                    SAVE API SETTINGS
                </button>

                <button data-action="testApi">
                    TEST API
                </button>
            </div>

            <div class="miniRow">
                <button data-action="clearApi">
                    REMOVE SAVED KEY
                </button>

                <button
                    data-action="resumeApi"
                    ${state.api.paused ? '' : 'disabled'}
                >
                    RESUME API
                </button>
            </div>

            <div
                id="hkmcq-api-status"
                class="apiStatusBox"
            >
                Key:
                <strong>${hasKey ? 'Saved' : 'Not saved'}</strong>

                <br>

                Status:
                ${status || '—'}
                ${error}

                <br>

                Current chain:
                ${state.api.chainCurrent ?? '—'}
                |
                Next hit:
                ${nextHitNumber()}

                <br>

                Last detected:
                ${
                    state.api.lastHit
                        ? `${escapeHtml(state.api.lastHit.attacker)} at #${state.api.lastHit.chain}`
                        : '—'
                }
            </div>

            <div class="help">
                The API key is stored through your userscript manager.
                Manual mode makes no recurring API calls.
            </div>
        `;
    }

    function historySettingsHtml() {
        const rows =
            state.ledger.length
                ? state.ledger.slice(0, 60).map(item => `
                    <div class="ledgerRow">
                        <div class="ledgerMeta">
                            ${formatTime(item.timestamp)}
                        </div>

                        <div>
                            <strong>${escapeHtml(item.attacker)}</strong>
                            ${item.chain ? `#${item.chain}` : ''}
                            <div class="ledgerMeta">
                                ${escapeHtml(item.kind)}
                                • ${escapeHtml(item.mode)}
                                ${item.undone ? ' • undone' : ''}
                            </div>
                        </div>

                        <div class="ledgerMeta">
                            ${escapeHtml(item.action)}
                        </div>
                    </div>
                `).join('')
                : `
                    <div style="padding:10px;color:var(--m);font-size:11px;">
                        No Merc-C-Que events recorded yet.
                    </div>
                `;

        return `
            <div class="sectionTitle">
                Event history / diagnostics
            </div>

            <div class="ledger">
                ${rows}
            </div>

            <div class="miniRow">
                <button data-action="copyDebug">
                    COPY DEBUG SNAPSHOT
                </button>

                <button data-action="clearHistory">
                    CLEAR HISTORY
                </button>
            </div>

            <div class="help">
                History helps troubleshoot duplicate, out-of-order,
                Assisted, and Auto behavior. Debug snapshots do not include
                your API key.
            </div>
        `;
    }

    function settingsContentHtml() {
        switch (state.settingsTab) {
            case 'message':
                return messageSettingsHtml();
            case 'api':
                return apiSettingsHtml();
            case 'history':
                return historySettingsHtml();
            case 'roster':
            default:
                return rosterSettingsHtml();
        }
    }

    function settingsShellHtml() {
        if (!state.setupOpen) return '';

        return `
            <div class="settingsShell">
                ${settingsTabsHtml()}
                <div id="hkmcq-settings-content">
                    ${settingsContentHtml()}
                </div>
            </div>
        `;
    }

    // =========================================================
    // RENDERING
    // =========================================================

    function renderPanel() {
        document
            .getElementById(LAUNCHER_ID)
            ?.remove();

        let panel =
            document.getElementById(PANEL_ID);

        if (!panel) {
            panel =
                document.createElement('div');

            panel.id = PANEL_ID;

            document.body.appendChild(panel);
        }

        const ready =
            readyParticipants();

        const nums =
            hitNumbers();

        const doneLocked =
            state.api.mode !== 'manual';

        panel.innerHTML = `
            <div class="head">
                <div class="title">
                    HKs Merc-C-Que

                    <div class="sub">
                        Chain Queue Organizer • v${VERSION}
                    </div>
                </div>

                <button
                    class="icon"
                    data-action="setup"
                    title="Roster / message / API setup"
                >
                    ⚙
                </button>

                <button
                    class="icon"
                    data-action="minimize"
                    title="Minimize Merc-C-Que"
                >
                    —
                </button>
            </div>

            <div class="main">
                <div class="up">
                    <div class="kicker">
                        UP NOW
                    </div>

                    <div class="upLine">
                        <span
                            id="hkmcq-up-name"
                            class="upName"
                        >
                            ${escapeHtml(ready[0]?.name || 'No READY participant')}
                        </span>

                        <span
                            id="hkmcq-hit-badge"
                            class="hitBadge"
                        >
                            • HIT #${nums.hit}
                        </span>
                    </div>
                </div>

                <div class="nextGrid">
                    <div class="label">
                        NEXT
                    </div>

                    <div class="nextPerson">
                        <span id="hkmcq-next-name">
                            ${escapeHtml(ready[1]?.name || '—')}
                        </span>

                        <span
                            id="hkmcq-next-hit"
                            class="queueHit"
                        >
                            HIT #${nums.nextHit}
                        </span>
                    </div>

                    <div class="label">
                        ON DECK
                    </div>

                    <div class="nextPerson">
                        <span id="hkmcq-ondeck-name">
                            ${escapeHtml(ready[2]?.name || '—')}
                        </span>

                        <span
                            id="hkmcq-ondeck-hit"
                            class="queueHit"
                        >
                            HIT #${nums.onDeckHit}
                        </span>
                    </div>
                </div>

                <div id="hkmcq-pending-slot">
                    ${pendingHtml()}
                </div>

                <div class="controls">
                    <button
                        id="hkmcq-done"
                        class="done ${doneLocked ? 'locked' : ''}"
                        data-action="done"
                        title="${
                            doneLocked
                                ? 'Switch API Mode to Manual to use DONE'
                                : 'Record hit and advance'
                        }"
                    >
                        ✓ ${doneLocked ? 'API ACTIVE' : 'DONE'}
                    </button>

                    <button data-action="skip">
                        SKIP
                    </button>

                    <button data-action="undo">
                        ↶ UNDO
                    </button>
                </div>

                <div class="hitRow">
                    <span class="label">
                        HIT
                    </span>

                    <input
                        id="hkmcq-hit-number"
                        type="number"
                        min="1"
                        step="1"
                        value="${nums.hit}"
                        ${state.api.mode !== 'manual' ? 'disabled' : ''}
                    >

                    <span
                        id="hkmcq-ready-count"
                        class="label"
                    >
                        ${ready.length}/${state.roster.length} ready
                    </span>
                </div>

                <div id="hkmcq-api-strip-slot">
                    ${apiStripHtml()}
                </div>

                <div
                    id="hkmcq-preview"
                    class="preview"
                >
                    ${escapeHtml(buildMessage())}
                </div>

                <button
                    class="copy"
                    data-action="copy"
                >
                    COPY MESSAGE
                </button>

                <div
                    id="hkmcq-roster"
                    class="roster"
                >
                    ${rosterRowsHtml()}
                </div>

                <div id="hkmcq-settings-shell-slot">
                    ${settingsShellHtml()}
                </div>
            </div>
        `;

        applyPanelPosition(panel);
        bindPanelOnce(panel);

        requestAnimationFrame(
            adjustPanelViewport
        );
    }

    function applyPanelPosition(panel) {
        if (
            state.position &&
            Number.isFinite(Number(state.position.left)) &&
            Number.isFinite(Number(state.position.top))
        ) {
            const position =
                clampPanelPosition(
                    Number(state.position.left),
                    Number(state.position.top),
                    panel
                );

            panel.style.left =
                `${position.left}px`;

            panel.style.top =
                `${position.top}px`;

            panel.style.right =
                'auto';
        }
    }

    function renderSettingsContent() {
        const shellSlot =
            document.getElementById(
                'hkmcq-settings-shell-slot'
            );

        if (!shellSlot) return;

        if (!state.setupOpen) {
            shellSlot.innerHTML = '';
            return;
        }

        const shell =
            shellSlot.querySelector(
                '.settingsShell'
            );

        if (!shell) {
            shellSlot.innerHTML =
                settingsShellHtml();
            return;
        }

        const tabs =
            shell.querySelector(
                '.settingsTabs'
            );

        const content =
            shell.querySelector(
                '#hkmcq-settings-content'
            );

        if (tabs) {
            tabs.innerHTML =
                settingsTabsHtml()
                    .replace(
                        /^<div class="settingsTabs">|<\/div>\s*$/g,
                        ''
                    );
        }

        if (content) {
            content.innerHTML =
                settingsContentHtml();
        }
    }

    function refreshDynamicUi(options = {}) {
        if (state.minimized) {
            renderLauncher();
            return;
        }

        const panel =
            document.getElementById(PANEL_ID);

        if (!panel) {
            renderPanel();
            return;
        }

        const ready =
            readyParticipants();

        const nums =
            hitNumbers();

        const setText = (selector, value) => {
            const element =
                panel.querySelector(selector);

            if (element) {
                element.textContent = value;
            }
        };

        setText(
            '#hkmcq-up-name',
            ready[0]?.name ||
            'No READY participant'
        );

        setText(
            '#hkmcq-hit-badge',
            `• HIT #${nums.hit}`
        );

        setText(
            '#hkmcq-next-name',
            ready[1]?.name || '—'
        );

        setText(
            '#hkmcq-next-hit',
            `HIT #${nums.nextHit}`
        );

        setText(
            '#hkmcq-ondeck-name',
            ready[2]?.name || '—'
        );

        setText(
            '#hkmcq-ondeck-hit',
            `HIT #${nums.onDeckHit}`
        );

        setText(
            '#hkmcq-ready-count',
            `${ready.length}/${state.roster.length} ready`
        );

        const hitInput =
            panel.querySelector(
                '#hkmcq-hit-number'
            );

        if (
            hitInput &&
            document.activeElement !== hitInput
        ) {
            hitInput.value =
                String(nums.hit);

            hitInput.disabled =
                state.api.mode !== 'manual';
        }

        const doneButton =
            panel.querySelector(
                '#hkmcq-done'
            );

        if (doneButton) {
            const locked =
                state.api.mode !== 'manual';

            doneButton.classList.toggle(
                'locked',
                locked
            );

            doneButton.textContent =
                `✓ ${locked ? 'API ACTIVE' : 'DONE'}`;

            doneButton.title =
                locked
                    ? 'Switch API Mode to Manual to use DONE'
                    : 'Record hit and advance';
        }

        const apiStripSlot =
            panel.querySelector(
                '#hkmcq-api-strip-slot'
            );

        if (apiStripSlot) {
            apiStripSlot.innerHTML =
                apiStripHtml();
        }

        const pendingSlot =
            panel.querySelector(
                '#hkmcq-pending-slot'
            );

        if (pendingSlot) {
            pendingSlot.innerHTML =
                pendingHtml();
        }

        const preview =
            panel.querySelector(
                '#hkmcq-preview'
            );

        if (preview) {
            preview.textContent =
                buildMessage();
        }

        if (options.roster) {
            const roster =
                panel.querySelector(
                    '#hkmcq-roster'
                );

            if (roster) {
                roster.innerHTML =
                    rosterRowsHtml();
            }
        }

        if (options.settings) {
            renderSettingsContent();
        }

        updateApiStatusBox();
        requestAnimationFrame(adjustPanelViewport);
    }

    function updateApiStatusBox() {
        const box =
            document.querySelector(
                '#hkmcq-api-status'
            );

        if (!box) return;

        const last =
            state.api.lastHit
                ? `${state.api.lastHit.attacker} at #${state.api.lastHit.chain}`
                : '—';

        box.innerHTML =
            `Key: <strong>${getApiKey() ? 'Saved' : 'Not saved'}</strong>` +
            `<br>Status: ${escapeHtml(state.api.status || '—')}` +
            `<br>Current chain: ${state.api.chainCurrent ?? '—'} | Next hit: ${nextHitNumber()}` +
            `<br>Last detected: ${escapeHtml(last)}`;
    }

    function setApiUiText(text) {
        const box =
            document.querySelector(
                '#hkmcq-api-status'
            );

        if (box) {
            box.textContent = text;
        }
    }

    // =========================================================
    // MINIMIZED LAUNCHER
    // =========================================================

    function launcherClass() {
        if (state.api.pendingHits.length) return 'pending';
        if (state.api.paused) return 'paused';
        if (automationActive()) return 'active';
        return '';
    }

    function renderLauncher() {
        document
            .getElementById(PANEL_ID)
            ?.remove();

        let launcher =
            document.getElementById(LAUNCHER_ID);

        if (!launcher) {
            launcher =
                document.createElement('button');

            launcher.id = LAUNCHER_ID;

            document.body.appendChild(launcher);
            bindLauncherOnce(launcher);
        }

        launcher.className =
            launcherClass();

        const pendingCount =
            state.api.pendingHits.length;

        launcher.innerHTML = `
            <span class="launcherDot"></span>
            <span>MCQ #${nextHitNumber()}</span>

            ${
                pendingCount > 0
                    ? `
                        <span
                            class="launcherBadge"
                            title="${pendingCount} hit${pendingCount === 1 ? '' : 's'} waiting for attention"
                        >
                            ${pendingCount > 99 ? '99+' : pendingCount}
                        </span>
                    `
                    : ''
            }
        `;

        const ready =
            readyParticipants();

        launcher.title =
            `Merc-C-Que — UP: ${ready[0]?.name || '—'} — HIT #${nextHitNumber()} — ${state.api.status || state.api.mode}`;

        const savedPosition =
            state.launcherPosition;

        const initial =
            savedPosition &&
            Number.isFinite(Number(savedPosition.left)) &&
            Number.isFinite(Number(savedPosition.top))
                ? {
                    left: Number(savedPosition.left),
                    top: Number(savedPosition.top)
                }
                : defaultLauncherPosition();

        const position =
            clampLauncherPosition(
                initial.left,
                initial.top,
                launcher
            );

        launcher.style.left =
            `${position.left}px`;

        launcher.style.top =
            `${position.top}px`;

        launcher.style.right =
            'auto';

        launcher.style.bottom =
            'auto';
    }

    function renderApp() {
        installStyle();

        if (state.minimized) {
            renderLauncher();
        } else {
            renderPanel();
        }
    }

    // =========================================================
    // EVENT DELEGATION
    // =========================================================

    function bindPanelOnce(panel) {
        if (panel.dataset.hkmcqBound === '1') {
            return;
        }

        panel.dataset.hkmcqBound = '1';

        panel.addEventListener(
            'click',
            handlePanelClick
        );

        panel.addEventListener(
            'input',
            handlePanelInput
        );

        panel.addEventListener(
            'dragstart',
            handleRosterDragStart
        );

        panel.addEventListener(
            'dragover',
            handleRosterDragOver
        );

        panel.addEventListener(
            'dragleave',
            handleRosterDragLeave
        );

        panel.addEventListener(
            'drop',
            handleRosterDrop
        );

        panel.addEventListener(
            'dragend',
            handleRosterDragEnd
        );

        panel.addEventListener(
            'mousedown',
            handlePanelMouseDown
        );
    }

    function handlePanelClick(event) {
        const element =
            event.target.closest(
                '[data-action]'
            );

        if (!element) return;

        event.stopPropagation();

        const action =
            element.dataset.action;

        const index =
            Number(
                element.dataset.index
            );

        switch (action) {
            case 'done':
                manualDone();
                break;

            case 'skip':
                skipCurrent();
                break;

            case 'undo':
                undo();
                break;

            case 'copy':
                copyMessage();
                break;

            case 'status':
                toggleStatus(index);
                break;

            case 'remove':
                removeParticipant(index);
                break;

            case 'saveRoster': {
                const editor =
                    document.querySelector(
                        '#hkmcq-roster-editor'
                    );

                replaceRosterFromText(
                    editor?.value || ''
                );
                break;
            }

            case 'allReady':
                setAllReady();
                break;

            case 'resetHits':
                resetPlayerHits();
                break;

            case 'resetSession':
                resetSession();
                break;

            case 'saveApi':
                saveApiSettings();
                break;

            case 'testApi':
                testApiConnection();
                break;

            case 'clearApi':
                removeSavedApiKey();
                break;

            case 'resumeApi':
                state.api.paused = false;
                state.api.lastError = '';
                state.api.status =
                    'Resuming API watch…';
                state.api.lastAttackPoll = 0;
                state.api.lastChainPoll = 0;

                saveStateNow();
                refreshDynamicUi({ settings: true });
                break;

            case 'confirmPending':
                confirmPendingHit(
                    element.dataset.addUnknown === '1'
                );
                break;

            case 'ignorePending':
                ignorePendingHit();
                break;

            case 'minimize':
                minimizeApp();
                break;

            case 'setup':
                state.setupOpen =
                    !state.setupOpen;

                saveStateNow();
                renderSettingsContent();
                requestAnimationFrame(adjustPanelViewport);
                break;

            case 'settingsTab':
                state.settingsTab =
                    element.dataset.tab;

                saveStateNow();
                renderSettingsContent();
                requestAnimationFrame(adjustPanelViewport);
                break;

            case 'copyDebug':
                copyText(
                    debugSnapshot(),
                    'Debug snapshot copied.'
                );
                break;

            case 'clearHistory':
                clearLedger();
                break;
        }
    }

    function handlePanelInput(event) {
        const target =
            event.target;

        if (
            target.matches(
                '#hkmcq-hit-number'
            )
        ) {
            if (state.api.mode !== 'manual') return;

            state.manualNextHit =
                Math.max(
                    1,
                    Number(target.value) || 1
                );

            saveStateNow();
            refreshDynamicUi();
            return;
        }

        if (
            target.matches(
                '#hkmcq-template'
            )
        ) {
            state.template =
                target.value;

            scheduleSave(400);

            const preview =
                document.querySelector(
                    '#hkmcq-preview'
                );

            if (preview) {
                preview.textContent =
                    buildMessage();
            }

            return;
        }

        if (
            target.matches(
                '#hkmcq-roster-editor'
            )
        ) {
            rosterDraft =
                target.value;
            return;
        }

        if (
            target.matches(
                '#hkmcq-api-key'
            )
        ) {
            apiKeyDraft =
                target.value;
        }
    }

    function handleRosterDragStart(event) {
        const row =
            event.target.closest(
                '.row'
            );

        if (!row) return;

        rosterDragIndex =
            Number(
                row.dataset.index
            );
    }

    function handleRosterDragOver(event) {
        const row =
            event.target.closest(
                '.row'
            );

        if (!row) return;

        event.preventDefault();
        row.classList.add('dragover');
    }

    function handleRosterDragLeave(event) {
        const row =
            event.target.closest(
                '.row'
            );

        row?.classList.remove(
            'dragover'
        );
    }

    function handleRosterDrop(event) {
        const row =
            event.target.closest(
                '.row'
            );

        if (!row) return;

        event.preventDefault();

        row.classList.remove(
            'dragover'
        );

        if (rosterDragIndex !== null) {
            moveParticipant(
                rosterDragIndex,
                Number(row.dataset.index)
            );
        }

        rosterDragIndex = null;
    }

    function handleRosterDragEnd() {
        rosterDragIndex = null;

        document
            .querySelectorAll(
                `#${PANEL_ID} .dragover`
            )
            .forEach(
                element =>
                    element.classList.remove(
                        'dragover'
                    )
            );
    }

    function handlePanelMouseDown(event) {
        const panel =
            document.getElementById(PANEL_ID);

        if (!panel) return;

        const header =
            event.target.closest(
                '.head'
            );

        if (!header) return;

        if (
            event.target.closest(
                'button'
            )
        ) {
            return;
        }

        const rect =
            panel.getBoundingClientRect();

        panelDrag = {
            offsetX:
                event.clientX -
                rect.left,
            offsetY:
                event.clientY -
                rect.top
        };

        event.preventDefault();
    }

    function bindLauncherOnce(launcher) {
        if (launcher.dataset.hkmcqBound === '1') {
            return;
        }

        launcher.dataset.hkmcqBound = '1';

        launcher.addEventListener(
            'mousedown',
            event => {
                if (event.button !== 0) return;

                const rect =
                    launcher.getBoundingClientRect();

                launcherDrag = {
                    startX: event.clientX,
                    startY: event.clientY,
                    offsetX:
                        event.clientX -
                        rect.left,
                    offsetY:
                        event.clientY -
                        rect.top
                };

                launcherDragged = false;

                launcher.classList.add(
                    'dragging'
                );

                event.preventDefault();
            }
        );

        launcher.addEventListener(
            'click',
            event => {
                event.preventDefault();

                if (
                    Date.now() <
                    suppressLauncherClickUntil
                ) {
                    return;
                }

                restoreApp();
            }
        );
    }

    // =========================================================
    // DRAGGING
    // =========================================================

    document.addEventListener(
        'mousemove',
        event => {
            if (panelDrag) {
                const panel =
                    document.getElementById(PANEL_ID);

                if (panel) {
                    const position =
                        clampPanelPosition(
                            event.clientX -
                                panelDrag.offsetX,
                            event.clientY -
                                panelDrag.offsetY,
                            panel
                        );

                    panel.style.left =
                        `${position.left}px`;

                    panel.style.top =
                        `${position.top}px`;

                    panel.style.right =
                        'auto';

                    adjustPanelViewport();
                }
            }

            if (launcherDrag) {
                const launcher =
                    document.getElementById(LAUNCHER_ID);

                if (launcher) {
                    if (
                        Math.abs(
                            event.clientX -
                            launcherDrag.startX
                        ) > 3 ||
                        Math.abs(
                            event.clientY -
                            launcherDrag.startY
                        ) > 3
                    ) {
                        launcherDragged =
                            true;
                    }

                    const position =
                        clampLauncherPosition(
                            event.clientX -
                                launcherDrag.offsetX,
                            event.clientY -
                                launcherDrag.offsetY,
                            launcher
                        );

                    launcher.style.left =
                        `${position.left}px`;

                    launcher.style.top =
                        `${position.top}px`;

                    launcher.style.right =
                        'auto';

                    launcher.style.bottom =
                        'auto';
                }
            }
        }
    );

    document.addEventListener(
        'mouseup',
        () => {
            if (panelDrag) {
                const panel =
                    document.getElementById(PANEL_ID);

                if (panel) {
                    const rect =
                        panel.getBoundingClientRect();

                    state.position = {
                        left:
                            Math.round(rect.left),
                        top:
                            Math.round(rect.top)
                    };

                    saveStateNow();
                    adjustPanelViewport();
                }

                panelDrag = null;
            }

            if (launcherDrag) {
                const launcher =
                    document.getElementById(LAUNCHER_ID);

                if (launcher) {
                    const rect =
                        launcher.getBoundingClientRect();

                    state.launcherPosition = {
                        left:
                            Math.round(rect.left),
                        top:
                            Math.round(rect.top)
                    };

                    saveStateNow();

                    launcher.classList.remove(
                        'dragging'
                    );
                }

                if (launcherDragged) {
                    suppressLauncherClickUntil =
                        Date.now() + 250;
                }

                launcherDrag = null;
                launcherDragged = false;
            }
        }
    );

    window.addEventListener(
        'resize',
        () => {
            const panel =
                document.getElementById(PANEL_ID);

            if (panel) {
                const rect =
                    panel.getBoundingClientRect();

                const position =
                    clampPanelPosition(
                        rect.left,
                        rect.top,
                        panel
                    );

                panel.style.left =
                    `${position.left}px`;

                panel.style.top =
                    `${position.top}px`;

                panel.style.right =
                    'auto';

                state.position = {
                    left:
                        Math.round(position.left),
                    top:
                        Math.round(position.top)
                };

                adjustPanelViewport();
            }

            const launcher =
                document.getElementById(LAUNCHER_ID);

            if (launcher) {
                const rect =
                    launcher.getBoundingClientRect();

                const position =
                    clampLauncherPosition(
                        rect.left,
                        rect.top,
                        launcher
                    );

                launcher.style.left =
                    `${position.left}px`;

                launcher.style.top =
                    `${position.top}px`;

                state.launcherPosition = {
                    left:
                        Math.round(position.left),
                    top:
                        Math.round(position.top)
                };
            }

            saveStateNow();
        }
    );

    // =========================================================
    // TOAST
    // =========================================================

    function toast(message) {
        document
            .getElementById(TOAST_ID)
            ?.remove();

        const element =
            document.createElement('div');

        element.id = TOAST_ID;
        element.textContent = message;

        document.body.appendChild(
            element
        );

        setTimeout(
            () => element.remove(),
            1800
        );
    }

    // =========================================================
    // DYNAMIC TORN SUPPORT
    // =========================================================

    function ensureMounted() {
        if (!document.body) return;

        if (state.minimized) {
            if (
                !document.getElementById(
                    LAUNCHER_ID
                )
            ) {
                renderLauncher();
            }

            document
                .getElementById(PANEL_ID)
                ?.remove();
        } else {
            if (
                !document.getElementById(
                    PANEL_ID
                )
            ) {
                renderPanel();
            }

            document
                .getElementById(LAUNCHER_ID)
                ?.remove();
        }
    }

    // =========================================================
    // START
    // =========================================================

    renderApp();

    setInterval(
        ensureMounted,
        2500
    );

    setInterval(
        schedulerTick,
        1000
    );

    if (automationActive()) {
        state.api.lastAttackPoll = 0;
        state.api.lastChainPoll = 0;

        if (!state.api.baselineReady) {
            pollAttacks(true);
        }

        pollChain();
    }
})();