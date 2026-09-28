// ==UserScript==
// @name         HKs Merc-C-Que
// @namespace    hks-merc-c-que
// @version      2.2.0
// @description  Chain queue organizer for Torn with Manual, Assisted, and Auto faction-API hit detection.
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

    const STORAGE_KEY = 'hksMercCQue_v2';
    const LEGACY_KEY = 'tornChainQueue_v1';
    const API_KEY_STORE = 'hksMercCQue_apiKey';

    const PANEL_ID = 'hkmcq-panel';
    const LAUNCHER_ID = 'hkmcq-launcher';

    const MAX_HISTORY = 30;
    const MAX_PROCESSED_ATTACKS = 100;
    const MAX_PENDING_HITS = 20;

    const API_BASE = 'https://api.torn.com/v2';

    const DEFAULT_STATE = {
        roster: [],
        manualNextHit: 1,
        template:
            'HIT #{hit} | UP: {current} | NEXT: {next} (#{next_hit}) | ON DECK: {ondeck} (#{ondeck_hit})',

        minimized: false,
        setupOpen: false,
        position: null,
        launcherPosition: null,

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

    let rosterDragIndex = null;
    let panelDrag = null;
    let launcherDrag = null;
    let launcherDragged = false;
    let suppressLauncherClickUntil = 0;

    let attackInFlight = false;
    let chainInFlight = false;

    let apiKeyDraft = '';
    let rosterDraft = null;

    // =========================================================
    // BASIC HELPERS
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

    function normalizeParticipant(participant) {
        if (typeof participant === 'string') {
            return {
                name: participant.trim(),
                status: 'ready',
                hits: 0
            };
        }

        let status = String(participant?.status || 'ready').toLowerCase();

        // Older versions had OUT. Keep the person but treat them as AFK.
        if (status === 'out') {
            status = 'afk';
        }

        if (!['ready', 'afk'].includes(status)) {
            status = 'ready';
        }

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
            ...DEFAULT_STATE.api,
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

    // =========================================================
    // SAVED STATE
    // =========================================================

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);

            if (raw) {
                const saved = JSON.parse(raw);

                return {
                    ...clone(DEFAULT_STATE),
                    ...saved,

                    // v2.1 used "collapsed". Treat that as minimized once.
                    minimized:
                        typeof saved.minimized === 'boolean'
                            ? saved.minimized
                            : !!saved.collapsed,

                    roster: Array.isArray(saved.roster)
                        ? saved.roster.map(normalizeParticipant)
                        : [],

                    api: normalizeApi(saved.api)
                };
            }

            const legacyRaw = localStorage.getItem(LEGACY_KEY);

            if (legacyRaw) {
                const old = JSON.parse(legacyRaw);

                return {
                    ...clone(DEFAULT_STATE),

                    roster: Array.isArray(old.roster)
                        ? old.roster.map(normalizeParticipant)
                        : [],

                    manualNextHit: Math.max(
                        1,
                        Number(old.hitNumber ?? old.chainNumber ?? 1) || 1
                    ),

                    template: String(
                        old.template || DEFAULT_STATE.template
                    ).replace(/\{chain\}/gi, '{hit}'),

                    minimized: !!old.collapsed,
                    setupOpen: !!old.setupOpen,
                    position: old.position || null
                };
            }
        } catch (error) {
            console.warn(
                '[Merc-C-Que] Could not load saved state:',
                error
            );
        }

        return clone(DEFAULT_STATE);
    }

    function saveState() {
        // Do not carry the old collapsed property forward.
        if ('collapsed' in state) {
            delete state.collapsed;
        }

        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(state)
        );
    }

    // =========================================================
    // API KEY STORAGE
    // =========================================================

    function getApiKey() {
        try {
            return String(
                GM_getValue(API_KEY_STORE, '') || ''
            ).trim();
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

    function pushQueueHistory() {
        history.push({
            roster: clone(state.roster),
            manualNextHit: state.manualNextHit
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

        saveState();
        renderApp();

        toast('Queue change undone.');
    }

    // =========================================================
    // QUEUE HELPERS
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
        const needle = String(name || '')
            .trim()
            .toLowerCase();

        return state.roster.findIndex(
            participant =>
                participant.name.toLowerCase() === needle
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

    function recordRosterHit(name) {
        const index = findParticipantIndex(name);

        if (index < 0) {
            return false;
        }

        pushQueueHistory();

        const [participant] =
            state.roster.splice(index, 1);

        participant.hits += 1;

        state.roster.push(participant);

        return true;
    }

    function addAndRecordUnknown(name) {
        pushQueueHistory();

        state.roster.push({
            name,
            status: 'ready',
            hits: 1
        });
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

    async function copyMessage() {
        const text = buildMessage();

        if (!text.trim()) {
            toast('Message is empty.');
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

        toast('Merc-C-Que message copied.');
    }

    // =========================================================
    // MANUAL QUEUE ACTIONS
    // =========================================================

    function manualDone() {
        if (state.api.mode !== 'manual') {
            toast(
                'Switch API Mode to Manual before using DONE.'
            );
            return;
        }

        const index = currentIndex();

        if (index < 0) {
            toast('No READY participant.');
            return;
        }

        pushQueueHistory();

        const [participant] =
            state.roster.splice(index, 1);

        participant.hits += 1;

        state.roster.push(participant);

        state.manualNextHit =
            nextHitNumber() + 1;

        saveState();
        renderApp();
    }

    function skipCurrent() {
        const index = currentIndex();

        if (index < 0) {
            toast('No READY participant.');
            return;
        }

        pushQueueHistory();

        const [participant] =
            state.roster.splice(index, 1);

        state.roster.push(participant);

        saveState();
        renderApp();
    }

    function toggleStatus(index) {
        if (!state.roster[index]) {
            return;
        }

        pushQueueHistory();

        state.roster[index].status =
            state.roster[index].status === 'ready'
                ? 'afk'
                : 'ready';

        saveState();
        renderApp();
    }

    function removeParticipant(index) {
        if (!state.roster[index]) {
            return;
        }

        pushQueueHistory();

        state.roster.splice(index, 1);

        saveState();
        renderApp();
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

        pushQueueHistory();

        const [participant] =
            state.roster.splice(from, 1);

        state.roster.splice(
            to,
            0,
            participant
        );

        saveState();
        renderApp();
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
                            value.toLowerCase() ===
                            name.toLowerCase()
                    ) === index
            );
    }

    function replaceRosterFromText(text) {
        const names = parseRosterText(text);

        const oldRoster =
            new Map(
                state.roster.map(
                    participant => [
                        participant.name.toLowerCase(),
                        participant
                    ]
                )
            );

        pushQueueHistory();

        state.roster =
            names.map(name => {
                const existing =
                    oldRoster.get(
                        name.toLowerCase()
                    );

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

        saveState();
        renderApp();

        toast(
            `Roster saved: ${state.roster.length} participant${
                state.roster.length === 1
                    ? ''
                    : 's'
            }.`
        );
    }

    function setAllReady() {
        if (!state.roster.length) {
            return;
        }

        pushQueueHistory();

        state.roster.forEach(
            participant =>
                participant.status = 'ready'
        );

        saveState();
        renderApp();
    }

    function resetPlayerHits() {
        if (!state.roster.length) {
            return;
        }

        if (
            !confirm(
                'Reset all participant completed-hit counts to 0?'
            )
        ) {
            return;
        }

        pushQueueHistory();

        state.roster.forEach(
            participant =>
                participant.hits = 0
        );

        saveState();
        renderApp();
    }

    function resetSession() {
        if (
            !confirm(
                'Reset player hit counts, manual hit number, API pending notices, and set everyone READY? Roster order will stay the same.'
            )
        ) {
            return;
        }

        pushQueueHistory();

        state.roster.forEach(
            participant => {
                participant.hits = 0;
                participant.status = 'ready';
            }
        );

        state.manualNextHit = 1;
        state.api.pendingHits = [];

        saveState();
        renderApp();
    }

    // =========================================================
    // TORN API
    // =========================================================

    function apiRequest(
        path,
        params = {},
        overrideKey = ''
    ) {
        const key =
            String(
                overrideKey ||
                getApiKey()
            ).trim();

        if (!key) {
            return Promise.reject(
                new Error(
                    'No API key saved.'
                )
            );
        }

        const query =
            new URLSearchParams({
                ...params,

                timestamp:
                    String(
                        Math.floor(
                            Date.now() /
                            1000
                        )
                    ),

                comment:
                    'HKs Merc-C-Que'
            });

        return new Promise(
            (resolve, reject) => {
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
                            data =
                                JSON.parse(
                                    response.responseText ||
                                    '{}'
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
                                Number(
                                    data.error.code ??
                                    0
                                );

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
            }
        );
    }

    async function fetchChain(key = '') {
        return apiRequest(
            '/faction/chain',
            {},
            key
        );
    }

    async function fetchAttacks(key = '') {
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

    // =========================================================
    // ATTACK DETECTION
    // =========================================================

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

            ...state.api
                .processedAttackIds
                .filter(
                    value =>
                        value !== stringId
                )
        ].slice(
            0,
            MAX_PROCESSED_ATTACKS
        );
    }

    function addPendingHit(event) {
        if (
            state.api.pendingHits.some(
                item =>
                    String(item.id) ===
                    String(event.id)
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

        const attacker =
            String(
                attack.attacker.name
            );

        const chain =
            Number(
                attack.chain
            );

        const current =
            readyParticipants()[0]
                ?.name ||
            '';

        const index =
            findParticipantIndex(
                attacker
            );

        const expected =
            !!current &&
            current.toLowerCase() ===
                attacker.toLowerCase();

        state.api.chainCurrent =
            chain;

        state.manualNextHit =
            chain + 1;

        state.api.lastHit = {
            attacker,
            chain,

            ended:
                Number(
                    attack.ended
                ) || 0,

            result:
                attack.result ||
                ''
        };

        const event = {
            id: attackId(attack),
            attacker,
            chain,

            ended:
                Number(
                    attack.ended
                ) || 0,

            result:
                attack.result ||
                '',

            kind:
                index < 0
                    ? 'unknown'
                    : expected
                        ? 'expected'
                        : 'outoforder',

            expectedPlayer:
                current ||
                '—'
        };

        if (
            state.api.mode === 'auto' &&
            index >= 0 &&
            expected
        ) {
            recordRosterHit(attacker);

            state.api.status =
                `AUTO: ${attacker} recorded at #${chain}`;

            return true;
        }

        addPendingHit(event);

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

    // =========================================================
    // API POLLING
    // =========================================================

    async function pollAttacks(
        forceBaseline = false
    ) {
        if (
            attackInFlight ||
            !getApiKey()
        ) {
            return;
        }

        attackInFlight = true;
        state.api.lastAttackPoll =
            Date.now();

        try {
            const data =
                await fetchAttacks();

            const attacks =
                Array.isArray(
                    data?.attacks
                )
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

                state.api.baselineReady =
                    true;

                state.api.status =
                    'Connected — watching new faction hits';

                state.api.lastError =
                    '';

                saveState();
                renderApp();
                return;
            }

            const processed =
                new Set(
                    state.api
                        .processedAttackIds
                        .map(String)
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
                            attackId(a)
                                .localeCompare(
                                    attackId(b)
                                )
                    );

            let changed = false;

            for (
                const attack
                of fresh
            ) {
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

            state.api.lastError =
                '';

            saveState();

            if (changed) {
                renderApp();
            } else {
                updateLiveUi();
            }
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
        state.api.lastChainPoll =
            Date.now();

        try {
            const data =
                await fetchChain();

            const chain =
                data?.chain ||
                null;

            if (chain) {
                const previousId =
                    state.api.chainId;

                const previousCurrent =
                    Number(
                        state.api.chainCurrent
                    );

                const newCurrent =
                    Number(
                        chain.current
                    ) || 0;

                const newId =
                    chain.id ??
                    null;

                if (
                    previousId != null &&
                    newId != null &&
                    String(previousId) !==
                    String(newId)
                ) {
                    state.api.baselineReady =
                        false;

                    state.api.processedAttackIds =
                        [];

                    state.api.pendingHits =
                        [];

                    state.api.status =
                        'New chain detected — re-baselining attack watch';
                }

                const sameChain =
                    previousId != null &&
                    newId != null &&
                    String(previousId) ===
                    String(newId);

                const acceptedCurrent =
                    sameChain &&
                    Number.isFinite(
                        previousCurrent
                    ) &&
                    newCurrent <
                        previousCurrent
                        ? previousCurrent
                        : newCurrent;

                state.api.chainId =
                    newId;

                state.api.chainCurrent =
                    acceptedCurrent;

                state.api.chainMax =
                    Number(
                        chain.max
                    ) || 0;

                state.api.chainTimeout =
                    Number(
                        chain.timeout
                    ) || 0;

                state.manualNextHit =
                    acceptedCurrent + 1;
            } else {
                state.api.chainId = null;
                state.api.chainCurrent = null;
                state.api.chainMax = null;
                state.api.chainTimeout = null;
            }

            state.api.lastError = '';

            saveState();
            updateLiveUi();
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
                Number(
                    error?.apiCode
                )
            )
        ) {
            state.api.paused =
                true;

            state.api.status =
                `${message} — automation paused`;
        }

        saveState();
        renderApp();
    }

    // =========================================================
    // API SETTINGS
    // =========================================================

    async function testApiConnection() {
        const key =
            String(
                apiKeyDraft ||
                getApiKey()
            ).trim();

        if (!key) {
            toast(
                'Enter or save an API key first.'
            );
            return;
        }

        setApiUiText(
            'Testing API…'
        );

        try {
            const [
                chainData,
                attackData
            ] =
                await Promise.all([
                    fetchChain(key),
                    fetchAttacks(key)
                ]);

            const chain =
                chainData?.chain;

            const attacks =
                Array.isArray(
                    attackData?.attacks
                )
                    ? attackData.attacks
                    : [];

            const current =
                chain
                    ? Number(
                        chain.current
                    ) || 0
                    : 0;

            state.api.paused = false;
            state.api.lastError = '';

            state.api.status =
                `API OK — chain ${current}; attack feed accessible (${attacks.length} returned)`;

            saveState();
            renderApp();

            toast(
                'API connection successful.'
            );
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
                    Number(
                        attackElement.value
                    ) || 5,
                    3,
                    60
                );
        }

        if (chainElement) {
            state.api.chainPollSeconds =
                clamp(
                    Number(
                        chainElement.value
                    ) || 10,
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

        saveState();
        renderApp();

        toast(
            'API settings saved.'
        );

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

        saveState();
        renderApp();

        toast(
            'API key removed.'
        );
    }

    // =========================================================
    // PENDING / ASSISTED HITS
    // =========================================================

    function confirmPendingHit(
        addUnknown = false
    ) {
        const event =
            state.api.pendingHits[0];

        if (!event) {
            return;
        }

        if (
            event.kind === 'unknown'
        ) {
            if (!addUnknown) {
                return;
            }

            addAndRecordUnknown(
                event.attacker
            );
        } else {
            recordRosterHit(
                event.attacker
            );
        }

        state.api.pendingHits.shift();

        state.api.status =
            `Recorded ${event.attacker} at hit #${event.chain}`;

        saveState();
        renderApp();
    }

    function ignorePendingHit() {
        const event =
            state.api.pendingHits.shift();

        if (!event) {
            return;
        }

        state.api.status =
            `Ignored detected hit #${event.chain} by ${event.attacker}`;

        saveState();
        renderApp();
    }

    // =========================================================
    // API SCHEDULER
    // =========================================================

    function schedulerTick() {
        if (!automationActive()) {
            return;
        }

        const now =
            Date.now();

        if (
            now -
                Number(
                    state.api.lastAttackPoll ||
                    0
                ) >=
            state.api.attackPollSeconds *
                1000
        ) {
            pollAttacks(false);
        }

        if (
            now -
                Number(
                    state.api.lastChainPoll ||
                    0
                ) >=
            state.api.chainPollSeconds *
                1000
        ) {
            pollChain();
        }
    }

    // =========================================================
    // THEME / STYLES
    // =========================================================

    function detectDarkTheme() {
        try {
            const rgb =
                getComputedStyle(
                    document.body
                )
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
        if (
            document.getElementById(
                'hkmcq-style'
            )
        ) {
            return;
        }

        const dark =
            detectDarkTheme();

        const colors =
            dark
                ? {
                    panel:
                        'rgba(28,28,28,.98)',
                    panel2:
                        '#252525',
                    text:
                        '#f1f1f1',
                    muted:
                        '#aaa',
                    border:
                        '#505050',
                    input:
                        '#202020',
                    button:
                        '#333',
                    hover:
                        '#444',
                    strong:
                        '#fff',
                    warn:
                        '#3a2e17'
                }
                : {
                    panel:
                        'rgba(248,248,248,.99)',
                    panel2:
                        '#ededed',
                    text:
                        '#222',
                    muted:
                        '#666',
                    border:
                        '#c5c5c5',
                    input:
                        '#fff',
                    button:
                        '#e4e4e4',
                    hover:
                        '#d8d8d8',
                    strong:
                        '#111',
                    warn:
                        '#fff4cf'
                };

        const style =
            document.createElement(
                'style'
            );

        style.id =
            'hkmcq-style';

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

                position: fixed;
                top: 105px;
                right: 16px;
                width: 365px;
                z-index: 999999;

                background: var(--p);
                color: var(--t);

                border: 1px solid var(--b);
                border-radius: 9px;

                box-shadow:
                    0 10px 28px
                    rgba(0,0,0,.32);

                font:
                    13px Arial,
                    Helvetica,
                    sans-serif;

                overflow-y: auto;
                overflow-x: hidden;

                overscroll-behavior: contain;
                scrollbar-gutter: stable;

                user-select: none;
            }

            #${PANEL_ID} * {
                box-sizing: border-box;
            }

            #${PANEL_ID} .head {
                position: sticky;
                top: 0;
                z-index: 10;

                display: flex;
                align-items: center;
                gap: 7px;

                padding: 9px 10px;

                background: var(--p2);
                border-bottom: 1px solid var(--b);

                cursor: move;
            }

            #${PANEL_ID} .title {
                flex: 1;

                font-weight: 800;
                color: var(--s);
                letter-spacing: .2px;
            }

            #${PANEL_ID} .sub {
                font-size: 10px;
                font-weight: 400;
                color: var(--m);
                margin-top: 1px;
            }

            #${PANEL_ID} button,
            #${PANEL_ID} input,
            #${PANEL_ID} textarea,
            #${PANEL_ID} select {
                font: inherit;
            }

            #${PANEL_ID} button {
                border: 1px solid var(--b);
                background: var(--btn);
                color: var(--t);

                border-radius: 6px;
                padding: 5px 8px;

                cursor: pointer;
            }

            #${PANEL_ID} button:hover {
                background: var(--hov);
            }

            #${PANEL_ID} button:disabled {
                cursor: default;
                opacity: .45;
            }

            #${PANEL_ID} .icon {
                width: 28px;
                height: 28px;
                padding: 0;

                display: grid;
                place-items: center;
            }

            #${PANEL_ID} .main {
                padding: 10px;
            }

            #${PANEL_ID} .up {
                text-align: center;
                padding: 10px 8px;

                background: var(--p2);
                border: 1px solid var(--b);
                border-radius: 8px;
            }

            #${PANEL_ID} .kicker {
                font-size: 10px;
                color: var(--m);
                letter-spacing: 1px;
            }

            #${PANEL_ID} .upLine {
                display: flex;
                justify-content: center;
                align-items: baseline;
                gap: 7px;
                flex-wrap: wrap;
                margin-top: 4px;
            }

            #${PANEL_ID} .upName {
                font-size: 21px;
                font-weight: 800;
                color: var(--s);
            }

            #${PANEL_ID} .hitBadge {
                font-size: 12px;
                font-weight: 700;
                color: var(--m);
            }

            #${PANEL_ID} .nextGrid {
                display: grid;
                grid-template-columns: 70px 1fr;
                gap: 5px 8px;
                padding: 8px 3px 2px;
            }

            #${PANEL_ID} .label {
                font-size: 11px;
                color: var(--m);
            }

            #${PANEL_ID} .nextPerson {
                display: flex;
                justify-content: space-between;
                gap: 8px;
            }

            #${PANEL_ID} .queueHit {
                color: var(--m);
                font-size: 10px;
                white-space: nowrap;
            }

            #${PANEL_ID} .controls {
                display: grid;
                grid-template-columns:
                    1.5fr 1fr .8fr;

                gap: 6px;
                margin-top: 8px;
            }

            #${PANEL_ID} .done {
                font-weight: 800;
                padding: 8px 10px;
            }

            #${PANEL_ID} .done.locked {
                opacity: .5;
            }

            #${PANEL_ID} .hitRow {
                display: grid;
                grid-template-columns:
                    auto 1fr auto;

                gap: 7px;
                align-items: center;
                margin-top: 8px;
            }

            #${PANEL_ID} input,
            #${PANEL_ID} textarea,
            #${PANEL_ID} select {
                width: 100%;

                border: 1px solid var(--b);
                background: var(--i);
                color: var(--t);

                border-radius: 6px;
                padding: 6px 7px;

                outline: none;
            }

            #${PANEL_ID} textarea {
                min-height: 58px;
                resize: vertical;
                user-select: text;
                max-width: 100%;
            }

            #${PANEL_ID} .preview {
                margin-top: 8px;
                min-height: 44px;

                white-space: pre-wrap;
                word-break: break-word;

                user-select: text;
            }

            #${PANEL_ID} .copy {
                width: 100%;
                margin-top: 5px;
                font-weight: 700;
            }

            #${PANEL_ID} .apiStrip {
                margin-top: 8px;
                padding: 6px 7px;

                border: 1px solid var(--b);
                border-radius: 6px;

                font-size: 10px;
                color: var(--m);

                display: flex;
                gap: 7px;
                justify-content: space-between;
                align-items: center;
            }

            #${PANEL_ID} .apiStrip strong {
                color: var(--t);
            }

            #${PANEL_ID} .pending {
                margin-top: 8px;
                padding: 8px;

                border: 1px solid #9b7a2e;
                border-radius: 7px;

                background: var(--warn);
            }

            #${PANEL_ID} .pendingTitle {
                font-weight: 800;
                margin-bottom: 4px;
            }

            #${PANEL_ID} .pendingText {
                font-size: 11px;
                line-height: 1.35;
            }

            #${PANEL_ID} .pendingBtns {
                display: flex;
                gap: 6px;
                margin-top: 7px;
            }

            #${PANEL_ID} .pendingBtns button {
                flex: 1;
            }

            #${PANEL_ID} .roster {
                margin-top: 9px;
                max-height: 245px;
                overflow: auto;

                border-top: 1px solid var(--b);
            }

            #${PANEL_ID} .row {
                display: grid;
                grid-template-columns:
                    20px
                    minmax(0,1fr)
                    46px
                    54px
                    25px;

                gap: 5px;
                align-items: center;

                padding: 6px 0;
                border-bottom: 1px solid var(--b);
            }

            #${PANEL_ID} .row[draggable=true] {
                cursor: grab;
            }

            #${PANEL_ID} .row.dragover {
                outline: 1px dashed var(--m);
            }

            #${PANEL_ID} .handle {
                text-align: center;
                color: var(--m);
            }

            #${PANEL_ID} .name {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #${PANEL_ID} .name .assigned {
                font-size: 10px;
                color: var(--m);
                margin-left: 4px;
            }

            #${PANEL_ID} .phits {
                text-align: right;
                font-size: 10px;
                color: var(--m);
            }

            #${PANEL_ID} .status {
                font-size: 10px;
                font-weight: 700;
                padding: 3px 5px;
                text-transform: uppercase;
            }

            #${PANEL_ID} .status[data-status=afk] {
                opacity: .55;
            }

            #${PANEL_ID} .remove {
                width: 25px;
                height: 25px;
                padding: 0;
            }

            #${PANEL_ID} .section {
                margin-top: 10px;
                padding-top: 10px;
                max-width: 100%;

                border-top: 1px solid var(--b);
            }

            #${PANEL_ID} .sectionTitle {
                font-weight: 800;
                margin-bottom: 5px;
            }

            #${PANEL_ID} .help {
                font-size: 10px;
                color: var(--m);
                line-height: 1.35;
                margin-top: 4px;
            }

            #${PANEL_ID} .miniRow {
                display: flex;
                gap: 6px;
                margin-top: 6px;
            }

            #${PANEL_ID} .miniRow > * {
                flex: 1;
            }

            #${PANEL_ID} .settingsGrid {
                display: grid;
                grid-template-columns:
                    1fr 1fr;
                gap: 6px;
            }

            #${PANEL_ID} .full {
                grid-column: 1 / -1;
            }

            #${PANEL_ID} .apiStatusBox {
                margin-top: 6px;
                padding: 7px;

                border: 1px solid var(--b);
                border-radius: 6px;

                font-size: 10px;
                line-height: 1.4;
                color: var(--m);
            }

            #${LAUNCHER_ID} {
                position: fixed;
                z-index: 1000000;

                min-width: 58px;
                height: 38px;

                padding: 0 12px;

                display: flex;
                align-items: center;
                justify-content: center;

                border: 1px solid ${colors.border};
                border-radius: 8px;

                background: ${colors.panel2};
                color: ${colors.text};

                box-shadow:
                    0 6px 18px
                    rgba(0,0,0,.35);

                font:
                    800 12px Arial,
                    Helvetica,
                    sans-serif;

                letter-spacing: .6px;

                cursor: grab;
                user-select: none;
            }

            #${LAUNCHER_ID}:hover {
                background: ${colors.hover};
            }

            #${LAUNCHER_ID}.dragging {
                cursor: grabbing;
                opacity: .9;
            }

            #${LAUNCHER_ID} .launcherBadge {
                position: absolute;
                top: -7px;
                right: -7px;

                min-width: 19px;
                height: 19px;

                padding: 0 5px;

                display: grid;
                place-items: center;

                border-radius: 999px;

                background: #b33;
                color: #fff;

                font-size: 10px;
                font-weight: 800;

                box-shadow:
                    0 2px 7px
                    rgba(0,0,0,.35);
            }

            #hkmcq-toast {
                position: fixed;
                right: 20px;
                bottom: 22px;
                z-index: 1000001;

                background:
                    rgba(20,20,20,.95);

                color: #fff;

                border-radius: 7px;
                padding: 9px 12px;

                font:
                    13px Arial,
                    Helvetica,
                    sans-serif;

                box-shadow:
                    0 6px 20px
                    rgba(0,0,0,.35);
            }
        `;

        document.head.appendChild(style);
    }

    // =========================================================
    // PANEL / LAUNCHER POSITIONING
    // =========================================================

    function defaultLauncherPosition() {
        return {
            left:
                Math.max(
                    8,
                    window.innerWidth - 78
                ),

            top:
                Math.max(
                    70,
                    Math.round(
                        window.innerHeight *
                        0.45
                    )
                )
        };
    }

    function clampPanelPosition(
        left,
        top,
        panel
    ) {
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

    function clampLauncherPosition(
        left,
        top,
        launcher
    ) {
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
            document.getElementById(
                PANEL_ID
            );

        if (!panel) {
            return;
        }

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
            document.getElementById(
                PANEL_ID
            );

        if (panel) {
            const rect =
                panel.getBoundingClientRect();

            state.position = {
                left:
                    Math.round(
                        rect.left
                    ),

                top:
                    Math.round(
                        rect.top
                    )
            };
        }

        state.minimized = true;

        saveState();
        renderApp();
    }

    function restoreApp() {
        state.minimized = false;

        saveState();
        renderApp();
    }

    // =========================================================
    // ROSTER HTML
    // =========================================================

    function rosterRowsHtml() {
        if (!state.roster.length) {
            return `
                <div
                    style="
                        padding:10px 2px;
                        color:var(--m);
                    "
                >
                    No participants yet.
                    Open Setup to paste your roster.
                </div>
            `;
        }

        const base =
            nextHitNumber();

        let readyOffset = 0;

        return state.roster
            .map(
                (participant, index) => {
                    const assigned =
                        participant.status === 'ready'
                            ? base +
                                readyOffset++
                            : null;

                    return `
                        <div
                            class="row"
                            draggable="true"
                            data-index="${index}"
                        >
                            <div
                                class="handle"
                                title="Drag to reorder"
                            >
                                ☰
                            </div>

                            <div
                                class="name"
                                title="${escapeHtml(participant.name)}"
                            >
                                ${escapeHtml(participant.name)}

                                ${
                                    assigned != null
                                        ? `
                                            <span
                                                class="assigned"
                                            >
                                                #${assigned}
                                            </span>
                                        `
                                        : ''
                                }
                            </div>

                            <div
                                class="phits"
                                title="Completed hits recorded for this player"
                            >
                                ${participant.hits}
                                hit${participant.hits === 1 ? '' : 's'}
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
                }
            )
            .join('');
    }

    // =========================================================
    // PENDING HIT HTML
    // =========================================================

    function pendingHtml() {
        const pending =
            state.api.pendingHits[0];

        if (!pending) {
            return '';
        }

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

        if (
            pending.kind ===
            'outoforder'
        ) {
            text +=
                `<br>Expected next: <strong>${escapeHtml(pending.expectedPlayer)}</strong>.`;
        }

        if (
            pending.kind ===
            'unknown'
        ) {
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
                <div class="pendingTitle">
                    ⚠ ${title}
                </div>

                <div class="pendingText">
                    ${text}
                </div>

                <div class="pendingBtns">
                    <button
                        data-action="confirmPending"
                        data-add-unknown="${
                            pending.kind === 'unknown'
                                ? '1'
                                : '0'
                        }"
                    >
                        ${confirmLabel}
                    </button>

                    <button
                        data-action="ignorePending"
                    >
                        IGNORE
                    </button>
                </div>
            </div>
        `;
    }

    // =========================================================
    // API STATUS HTML
    // =========================================================

    function apiStripHtml() {
        const mode =
            state.api.mode.toUpperCase();

        if (
            state.api.mode ===
            'manual'
        ) {
            return `
                <div class="apiStrip">
                    <strong>
                        MANUAL
                    </strong>

                    <span>
                        API watch stopped
                    </span>
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
                <strong>
                    ${mode}${paused}
                </strong>

                <span>
                    Chain ${chain}
                </span>

                <span>
                    Last ${last}
                </span>
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
                    <span
                        style="color:#c66"
                    >
                        ${escapeHtml(state.api.lastError)}
                    </span>
                `
                : '';

        return `
            <div class="section">
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
                    <button
                        data-action="saveApi"
                    >
                        SAVE API SETTINGS
                    </button>

                    <button
                        data-action="testApi"
                    >
                        TEST API
                    </button>
                </div>

                <div class="miniRow">
                    <button
                        data-action="clearApi"
                    >
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
                    <strong>
                        ${hasKey ? 'Saved' : 'Not saved'}
                    </strong>

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
                    Use your own Torn API key with the faction access
                    needed for the attack feed.

                    The key is saved through your userscript manager,
                    not hard-coded into Merc-C-Que.

                    Manual mode makes no recurring API calls.
                </div>
            </div>
        `;
    }

    // =========================================================
    // PANEL RENDER
    // =========================================================

    function renderPanel() {
        document
            .getElementById(
                LAUNCHER_ID
            )
            ?.remove();

        let panel =
            document.getElementById(
                PANEL_ID
            );

        if (!panel) {
            panel =
                document.createElement(
                    'div'
                );

            panel.id =
                PANEL_ID;

            document.body.appendChild(
                panel
            );
        }

        if (
            state.position &&
            Number.isFinite(
                Number(
                    state.position.left
                )
            ) &&
            Number.isFinite(
                Number(
                    state.position.top
                )
            )
        ) {
            const position =
                clampPanelPosition(
                    Number(
                        state.position.left
                    ),
                    Number(
                        state.position.top
                    ),
                    panel
                );

            panel.style.left =
                `${position.left}px`;

            panel.style.top =
                `${position.top}px`;

            panel.style.right =
                'auto';
        }

        const ready =
            readyParticipants();

        const nums =
            hitNumbers();

        const current =
            ready[0]?.name ||
            'No READY participant';

        const next =
            ready[1]?.name ||
            '—';

        const onDeck =
            ready[2]?.name ||
            '—';

        const doneLocked =
            state.api.mode !==
            'manual';

        panel.innerHTML = `
            <div class="head">
                <div class="title">
                    HKs Merc-C-Que

                    <div class="sub">
                        Chain Queue Organizer
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
                        <span class="upName">
                            ${escapeHtml(current)}
                        </span>

                        <span class="hitBadge">
                            • HIT #${nums.hit}
                        </span>
                    </div>
                </div>

                <div class="nextGrid">
                    <div class="label">
                        NEXT
                    </div>

                    <div class="nextPerson">
                        <span>
                            ${escapeHtml(next)}
                        </span>

                        <span class="queueHit">
                            HIT #${nums.nextHit}
                        </span>
                    </div>

                    <div class="label">
                        ON DECK
                    </div>

                    <div class="nextPerson">
                        <span>
                            ${escapeHtml(onDeck)}
                        </span>

                        <span class="queueHit">
                            HIT #${nums.onDeckHit}
                        </span>
                    </div>
                </div>

                ${pendingHtml()}

                <div class="controls">
                    <button
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

                    <button
                        data-action="skip"
                    >
                        SKIP
                    </button>

                    <button
                        data-action="undo"
                    >
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

                    <span class="label">
                        ${ready.length}/${state.roster.length} ready
                    </span>
                </div>

                ${apiStripHtml()}

                <div class="preview">
                    ${escapeHtml(buildMessage())}
                </div>

                <button
                    class="copy"
                    data-action="copy"
                >
                    COPY MESSAGE
                </button>

                <div class="roster">
                    ${rosterRowsHtml()}
                </div>

                ${
                    state.setupOpen
                        ? `
                    <div class="section">
                        <div class="sectionTitle">
                            Roster setup
                        </div>

                        <textarea
                            id="hkmcq-roster-editor"
                            placeholder="HairyKary&#10;AngelValoel&#10;Gooey99&#10;LucianCrossborn&#10;Ziggy_Goodsbane"
                        >${escapeHtml(
                            rosterDraft ??
                            state.roster
                                .map(
                                    participant =>
                                        participant.name
                                )
                                .join('\n')
                        )}</textarea>

                        <div class="miniRow">
                            <button
                                data-action="saveRoster"
                            >
                                SAVE ROSTER
                            </button>

                            <button
                                data-action="allReady"
                            >
                                ALL READY
                            </button>
                        </div>
                    </div>

                    <div class="section">
                        <div class="sectionTitle">
                            Chat message template
                        </div>

                        <textarea
                            id="hkmcq-template"
                        >${escapeHtml(state.template)}</textarea>

                        <div class="help">
                            Placeholders:
                            {current},
                            {hit},
                            {next},
                            {next_hit},
                            {ondeck},
                            {ondeck_hit},
                            {player_hits},
                            {ready_count},
                            {total_count},
                            {queue},
                            {last_hitter},
                            {last_hit}
                        </div>
                    </div>

                    ${apiSettingsHtml()}

                    <div class="section">
                        <div class="miniRow">
                            <button
                                data-action="resetHits"
                            >
                                RESET PLAYER HITS
                            </button>

                            <button
                                data-action="resetSession"
                            >
                                RESET SESSION
                            </button>
                        </div>

                        <div class="help">
                            READY players rotate normally.

                            AFK players remain listed but are skipped.

                            Use × to remove someone entirely.

                            In AUTO mode only the expected UP NOW player
                            advances automatically.

                            Out-of-order hits require confirmation.

                            Minimize with the — button. The MCQ launcher
                            can be dragged anywhere on your screen.
                        </div>
                    </div>
                `
                        : ''
                }
            </div>
        `;

        bindPanelEvents(panel);

        requestAnimationFrame(
            adjustPanelViewport
        );
    }

    // =========================================================
    // MINIMIZED LAUNCHER
    // =========================================================

    function renderLauncher() {
        document
            .getElementById(
                PANEL_ID
            )
            ?.remove();

        let launcher =
            document.getElementById(
                LAUNCHER_ID
            );

        if (!launcher) {
            launcher =
                document.createElement(
                    'button'
                );

            launcher.id =
                LAUNCHER_ID;

            document.body.appendChild(
                launcher
            );
        }

        const pendingCount =
            state.api.pendingHits.length;

        const ready =
            readyParticipants();

        launcher.innerHTML = `
            <span>
                MCQ
            </span>

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

        launcher.title =
            `Merc-C-Que — UP: ${ready[0]?.name || '—'} — HIT #${nextHitNumber()}`;

        const savedPosition =
            state.launcherPosition;

        const initial =
            savedPosition &&
            Number.isFinite(
                Number(
                    savedPosition.left
                )
            ) &&
            Number.isFinite(
                Number(
                    savedPosition.top
                )
            )
                ? {
                    left:
                        Number(
                            savedPosition.left
                        ),

                    top:
                        Number(
                            savedPosition.top
                        )
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

        launcher.onmousedown =
            event => {
                if (event.button !== 0) {
                    return;
                }

                const rect =
                    launcher
                        .getBoundingClientRect();

                launcherDrag = {
                    startX:
                        event.clientX,

                    startY:
                        event.clientY,

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
            };

        launcher.onclick =
            event => {
                event.preventDefault();

                if (
                    Date.now() <
                    suppressLauncherClickUntil
                ) {
                    return;
                }

                restoreApp();
            };
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
    // PANEL EVENTS
    // =========================================================

    function bindPanelEvents(panel) {
        panel
            .querySelectorAll(
                '[data-action]'
            )
            .forEach(
                element => {
                    element.addEventListener(
                        'click',
                        event => {
                            event.stopPropagation();

                            const action =
                                element.dataset.action;

                            const index =
                                Number(
                                    element.dataset.index
                                );

                            if (action === 'done') {
                                manualDone();
                            }

                            if (action === 'skip') {
                                skipCurrent();
                            }

                            if (action === 'undo') {
                                undo();
                            }

                            if (action === 'copy') {
                                copyMessage();
                            }

                            if (action === 'status') {
                                toggleStatus(index);
                            }

                            if (action === 'remove') {
                                removeParticipant(index);
                            }

                            if (action === 'saveRoster') {
                                replaceRosterFromText(
                                    panel
                                        .querySelector(
                                            '#hkmcq-roster-editor'
                                        )
                                        ?.value ||
                                    ''
                                );
                            }

                            if (action === 'allReady') {
                                setAllReady();
                            }

                            if (action === 'resetHits') {
                                resetPlayerHits();
                            }

                            if (action === 'resetSession') {
                                resetSession();
                            }

                            if (action === 'saveApi') {
                                saveApiSettings();
                            }

                            if (action === 'testApi') {
                                testApiConnection();
                            }

                            if (action === 'clearApi') {
                                removeSavedApiKey();
                            }

                            if (action === 'resumeApi') {
                                state.api.paused = false;
                                state.api.lastError = '';
                                state.api.status =
                                    'Resuming API watch…';

                                state.api.lastAttackPoll = 0;
                                state.api.lastChainPoll = 0;

                                saveState();
                                renderApp();
                            }

                            if (action === 'confirmPending') {
                                confirmPendingHit(
                                    element.dataset.addUnknown ===
                                    '1'
                                );
                            }

                            if (action === 'ignorePending') {
                                ignorePendingHit();
                            }

                            if (action === 'minimize') {
                                minimizeApp();
                            }

                            if (action === 'setup') {
                                state.setupOpen =
                                    !state.setupOpen;

                                saveState();
                                renderApp();
                            }
                        }
                    );
                }
            );

        const hitInput =
            panel.querySelector(
                '#hkmcq-hit-number'
            );

        hitInput?.addEventListener(
            'input',
            () => {
                if (
                    state.api.mode !==
                    'manual'
                ) {
                    return;
                }

                state.manualNextHit =
                    Math.max(
                        1,
                        Number(
                            hitInput.value
                        ) || 1
                    );

                saveState();
                updateLiveUi();
            }
        );

        const template =
            panel.querySelector(
                '#hkmcq-template'
            );

        template?.addEventListener(
            'input',
            () => {
                state.template =
                    template.value;

                saveState();
                updatePreviewOnly();
            }
        );

        const rosterEditor =
            panel.querySelector(
                '#hkmcq-roster-editor'
            );

        rosterEditor?.addEventListener(
            'input',
            () => {
                rosterDraft =
                    rosterEditor.value;
            }
        );

        const keyInput =
            panel.querySelector(
                '#hkmcq-api-key'
            );

        keyInput?.addEventListener(
            'input',
            () => {
                apiKeyDraft =
                    keyInput.value;
            }
        );

        // Roster drag ordering.
        panel
            .querySelectorAll(
                '.row'
            )
            .forEach(
                row => {
                    row.addEventListener(
                        'dragstart',
                        () => {
                            rosterDragIndex =
                                Number(
                                    row.dataset.index
                                );
                        }
                    );

                    row.addEventListener(
                        'dragover',
                        event => {
                            event.preventDefault();

                            row.classList.add(
                                'dragover'
                            );
                        }
                    );

                    row.addEventListener(
                        'dragleave',
                        () => {
                            row.classList.remove(
                                'dragover'
                            );
                        }
                    );

                    row.addEventListener(
                        'drop',
                        event => {
                            event.preventDefault();

                            row.classList.remove(
                                'dragover'
                            );

                            if (
                                rosterDragIndex !==
                                null
                            ) {
                                moveParticipant(
                                    rosterDragIndex,
                                    Number(
                                        row.dataset.index
                                    )
                                );
                            }

                            rosterDragIndex = null;
                        }
                    );

                    row.addEventListener(
                        'dragend',
                        () => {
                            rosterDragIndex = null;

                            panel
                                .querySelectorAll(
                                    '.dragover'
                                )
                                .forEach(
                                    element =>
                                        element
                                            .classList
                                            .remove(
                                                'dragover'
                                            )
                                );
                        }
                    );
                }
            );

        // Drag the full Merc-C-Que window.
        const header =
            panel.querySelector(
                '.head'
            );

        header?.addEventListener(
            'mousedown',
            event => {
                if (
                    event.target.closest(
                        'button'
                    )
                ) {
                    return;
                }

                const rect =
                    panel
                        .getBoundingClientRect();

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
        );
    }

    // =========================================================
    // LIVE DISPLAY UPDATES
    // =========================================================

    function updatePreviewOnly() {
        const preview =
            document.querySelector(
                `#${PANEL_ID} .preview`
            );

        if (preview) {
            preview.textContent =
                buildMessage();
        }
    }

    function updateLiveUi() {
        if (state.minimized) {
            renderLauncher();
            return;
        }

        const nums =
            hitNumbers();

        const badge =
            document.querySelector(
                `#${PANEL_ID} .hitBadge`
            );

        if (badge) {
            badge.textContent =
                `• HIT #${nums.hit}`;
        }

        const queueHits =
            document.querySelectorAll(
                `#${PANEL_ID} .nextGrid .queueHit`
            );

        if (queueHits[0]) {
            queueHits[0].textContent =
                `HIT #${nums.nextHit}`;
        }

        if (queueHits[1]) {
            queueHits[1].textContent =
                `HIT #${nums.onDeckHit}`;
        }

        const input =
            document.querySelector(
                '#hkmcq-hit-number'
            );

        if (
            input &&
            document.activeElement !== input
        ) {
            input.value =
                String(
                    nums.hit
                );
        }

        const statusBox =
            document.querySelector(
                '#hkmcq-api-status'
            );

        if (statusBox) {
            const last =
                state.api.lastHit
                    ? `${state.api.lastHit.attacker} at #${state.api.lastHit.chain}`
                    : '—';

            statusBox.innerHTML =
                `Key: <strong>${getApiKey() ? 'Saved' : 'Not saved'}</strong>` +
                `<br>Status: ${escapeHtml(state.api.status || '—')}` +
                `<br>Current chain: ${state.api.chainCurrent ?? '—'} | Next hit: ${nextHitNumber()}` +
                `<br>Last detected: ${escapeHtml(last)}`;
        }

        const apiStrip =
            document.querySelector(
                `#${PANEL_ID} .apiStrip`
            );

        if (apiStrip) {
            apiStrip.outerHTML =
                apiStripHtml();
        }

        updatePreviewOnly();
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
    // DRAGGING
    // =========================================================

    document.addEventListener(
        'mousemove',
        event => {
            if (panelDrag) {
                const panel =
                    document.getElementById(
                        PANEL_ID
                    );

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
                    document.getElementById(
                        LAUNCHER_ID
                    );

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
                    document.getElementById(
                        PANEL_ID
                    );

                if (panel) {
                    const rect =
                        panel
                            .getBoundingClientRect();

                    state.position = {
                        left:
                            Math.round(
                                rect.left
                            ),

                        top:
                            Math.round(
                                rect.top
                            )
                    };

                    saveState();
                    adjustPanelViewport();
                }

                panelDrag = null;
            }

            if (launcherDrag) {
                const launcher =
                    document.getElementById(
                        LAUNCHER_ID
                    );

                if (launcher) {
                    const rect =
                        launcher
                            .getBoundingClientRect();

                    state.launcherPosition = {
                        left:
                            Math.round(
                                rect.left
                            ),

                        top:
                            Math.round(
                                rect.top
                            )
                    };

                    saveState();

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
                document.getElementById(
                    PANEL_ID
                );

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
                        Math.round(
                            position.left
                        ),

                    top:
                        Math.round(
                            position.top
                        )
                };

                adjustPanelViewport();
            }

            const launcher =
                document.getElementById(
                    LAUNCHER_ID
                );

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
                        Math.round(
                            position.left
                        ),

                    top:
                        Math.round(
                            position.top
                        )
                };
            }

            saveState();
        }
    );

    // =========================================================
    // TOAST
    // =========================================================

    function toast(message) {
        document
            .getElementById(
                'hkmcq-toast'
            )
            ?.remove();

        const element =
            document.createElement(
                'div'
            );

        element.id =
            'hkmcq-toast';

        element.textContent =
            message;

        document.body.appendChild(
            element
        );

        setTimeout(
            () =>
                element.remove(),
            1800
        );
    }

    // =========================================================
    // TORN DYNAMIC PAGE SUPPORT
    // =========================================================

    function ensureMounted() {
        if (!document.body) {
            return;
        }

        if (state.minimized) {
            if (
                !document.getElementById(
                    LAUNCHER_ID
                )
            ) {
                renderLauncher();
            }

            document
                .getElementById(
                    PANEL_ID
                )
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
                .getElementById(
                    LAUNCHER_ID
                )
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

        if (
            !state.api.baselineReady
        ) {
            pollAttacks(true);
        }

        pollChain();
    }
})();
