// ==UserScript==
// @homepageURL  https://github.com/HairyKary/HKs-Merc-C-QUE
// @supportURL   https://github.com/HairyKary/HKs-Merc-C-QUE/issues
// @updateURL    https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-QUE/main/HKs-Merc-C-QUE.user.js
// @downloadURL  https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-QUE/main/HKs-Merc-C-QUE.user.js
// @name         HKs Merc-C-QUE
// @namespace    hks-merc-c-que
// @version      2.1.1
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
// ==/UserScript==

(() => {
    'use strict';

    const STORAGE_KEY = 'hksMercCQue_v2';
    const LEGACY_KEY = 'tornChainQueue_v1';
    const API_KEY_STORE = 'hksMercCQue_apiKey';

    const PANEL_ID = 'hkmcq-panel';

    const MAX_HISTORY = 30;
    const MAX_PROCESSED_ATTACKS = 100;
    const MAX_PENDING_HITS = 20;

    const API_BASE = 'https://api.torn.com/v2';

    const DEFAULT_STATE = {
        roster: [],

        manualNextHit: 1,

        template:
            'HIT #{hit} | UP: {current} | NEXT: {next} (#{next_hit}) | ON DECK: {ondeck} (#{ondeck_hit})',

        collapsed: false,
        setupOpen: false,
        position: null,

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

    let dragParticipantIndex = null;

    let panelDrag = null;

    let attackInFlight = false;
    let chainInFlight = false;

    let apiKeyDraft = '';
    let rosterDraft = null;


    // =========================================================
    // GENERAL HELPERS
    // =========================================================

    function clone(value) {
        return JSON.parse(
            JSON.stringify(value)
        );
    }


    function clamp(
        value,
        min,
        max
    ) {
        return Math.min(
            max,
            Math.max(
                min,
                value
            )
        );
    }


    function normalizeParticipant(p) {

        if (
            typeof p === 'string'
        ) {
            return {
                name:
                    p.trim(),

                status:
                    'ready',

                hits:
                    0
            };
        }

        let status =
            String(
                p?.status ||
                'ready'
            ).toLowerCase();


        // Older versions supported OUT.
        // OUT now becomes AFK.

        if (
            status === 'out'
        ) {
            status =
                'afk';
        }


        if (
            ![
                'ready',
                'afk'
            ].includes(status)
        ) {
            status =
                'ready';
        }


        return {
            name:
                String(
                    p?.name ||
                    ''
                ).trim(),

            status,

            hits:
                Number.isFinite(
                    Number(
                        p?.hits
                    )
                )
                    ? Math.max(
                        0,
                        Number(
                            p.hits
                        )
                    )
                    : 0
        };
    }


    function normalizeApi(api) {

        return {
            ...DEFAULT_STATE.api,
            ...(api || {}),

            mode:
                [
                    'manual',
                    'assisted',
                    'auto'
                ].includes(
                    api?.mode
                )
                    ? api.mode
                    : 'manual',

            attackPollSeconds:
                clamp(
                    Number(
                        api?.attackPollSeconds
                    ) || 5,
                    3,
                    60
                ),

            chainPollSeconds:
                clamp(
                    Number(
                        api?.chainPollSeconds
                    ) || 10,
                    5,
                    120
                ),

            processedAttackIds:
                Array.isArray(
                    api?.processedAttackIds
                )
                    ? api
                        .processedAttackIds
                        .map(String)
                        .slice(
                            0,
                            MAX_PROCESSED_ATTACKS
                        )
                    : [],

            pendingHits:
                Array.isArray(
                    api?.pendingHits
                )
                    ? api
                        .pendingHits
                        .slice(
                            0,
                            MAX_PENDING_HITS
                        )
                    : []
        };
    }


    // =========================================================
    // SAVED STATE
    // =========================================================

    function loadState() {

        try {

            const raw =
                localStorage.getItem(
                    STORAGE_KEY
                );


            if (raw) {

                const saved =
                    JSON.parse(raw);


                return {
                    ...DEFAULT_STATE,
                    ...saved,

                    roster:
                        Array.isArray(
                            saved.roster
                        )
                            ? saved.roster.map(
                                normalizeParticipant
                            )
                            : [],

                    api:
                        normalizeApi(
                            saved.api
                        )
                };
            }


            // -----------------------------------------
            // Migrate older Merc-C-QUE installation.
            // -----------------------------------------

            const legacyRaw =
                localStorage.getItem(
                    LEGACY_KEY
                );


            if (legacyRaw) {

                const old =
                    JSON.parse(
                        legacyRaw
                    );


                const oldHit =
                    Math.max(
                        1,
                        Number(
                            old.hitNumber ??
                            old.chainNumber ??
                            1
                        ) || 1
                    );


                const oldTemplate =
                    String(
                        old.template ||
                        DEFAULT_STATE.template
                    ).replace(
                        /\{chain\}/gi,
                        '{hit}'
                    );


                return {
                    ...clone(
                        DEFAULT_STATE
                    ),

                    roster:
                        Array.isArray(
                            old.roster
                        )
                            ? old.roster.map(
                                normalizeParticipant
                            )
                            : [],

                    manualNextHit:
                        oldHit,

                    template:
                        oldTemplate,

                    collapsed:
                        !!old.collapsed,

                    setupOpen:
                        !!old.setupOpen,

                    position:
                        old.position ||
                        null
                };
            }

        } catch (err) {

            console.warn(
                '[Merc-C-QUE] Could not load saved state:',
                err
            );
        }


        return clone(
            DEFAULT_STATE
        );
    }


    function saveState() {

        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(
                state
            )
        );
    }


    // =========================================================
    // API KEY STORAGE
    // =========================================================

    function getApiKey() {

        try {

            return String(
                GM_getValue(
                    API_KEY_STORE,
                    ''
                ) || ''
            ).trim();

        } catch {

            return '';
        }
    }


    function setApiKey(key) {

        GM_setValue(
            API_KEY_STORE,
            String(
                key || ''
            ).trim()
        );
    }


    function clearApiKey() {

        GM_deleteValue(
            API_KEY_STORE
        );
    }


    // =========================================================
    // HISTORY / UNDO
    // =========================================================

    function pushQueueHistory() {

        history.push({
            roster:
                clone(
                    state.roster
                ),

            manualNextHit:
                state.manualNextHit
        });


        if (
            history.length >
            MAX_HISTORY
        ) {
            history.shift();
        }
    }


    function undo() {

        if (
            !history.length
        ) {

            toast(
                'Nothing to undo.'
            );

            return;
        }


        const previous =
            history.pop();


        state.roster =
            previous.roster;


        state.manualNextHit =
            previous.manualNextHit;


        saveState();

        render();


        toast(
            'Queue change undone.'
        );
    }


    // =========================================================
    // QUEUE HELPERS
    // =========================================================

    function readyParticipants() {

        return state.roster.filter(
            p =>
                p.status ===
                'ready'
        );
    }


    function currentIndex() {

        return state.roster.findIndex(
            p =>
                p.status ===
                'ready'
        );
    }


    function findParticipantIndex(
        name
    ) {

        const needle =
            String(
                name || ''
            )
                .trim()
                .toLowerCase();


        return state.roster.findIndex(
            p =>
                p.name
                    .toLowerCase() ===
                needle
        );
    }


    function automationActive() {

        return (
            state.api.mode !==
                'manual' &&
            !!getApiKey() &&
            !state.api.paused
        );
    }


    function nextHitNumber() {

        if (
            state.api.mode !==
                'manual' &&
            Number.isFinite(
                Number(
                    state.api.chainCurrent
                )
            )
        ) {

            return Math.max(
                1,
                Number(
                    state.api.chainCurrent
                ) + 1
            );
        }


        return Math.max(
            1,
            Number(
                state.manualNextHit
            ) || 1
        );
    }


    function hitNumbers() {

        const hit =
            nextHitNumber();


        return {
            hit,

            nextHit:
                hit + 1,

            onDeckHit:
                hit + 2
        };
    }


    // =========================================================
    // CHAT MESSAGE
    // =========================================================

    function messageData() {

        const ready =
            readyParticipants();


        const nums =
            hitNumbers();


        return {

            current:
                ready[0]?.name ||
                '—',

            next:
                ready[1]?.name ||
                '—',

            ondeck:
                ready[2]?.name ||
                '—',

            hit:
                String(
                    nums.hit
                ),

            next_hit:
                String(
                    nums.nextHit
                ),

            ondeck_hit:
                String(
                    nums.onDeckHit
                ),

            player_hits:
                String(
                    ready[0]?.hits ??
                    0
                ),

            current_hits:
                String(
                    ready[0]?.hits ??
                    0
                ),

            ready_count:
                String(
                    ready.length
                ),

            total_count:
                String(
                    state.roster.length
                ),

            queue:
                ready
                    .map(
                        p => p.name
                    )
                    .join(', ') ||
                '—',

            last_hitter:
                state.api.lastHit
                    ?.attacker ||
                '—',

            last_hit:
                state.api.lastHit
                    ?.chain != null
                    ? String(
                        state.api
                            .lastHit
                            .chain
                    )
                    : '—'
        };
    }


    function buildMessage() {

        const data =
            messageData();


        return String(
            state.template || ''
        ).replace(

            /\{(current|next|ondeck|hit|next_hit|ondeck_hit|player_hits|current_hits|ready_count|total_count|queue|last_hitter|last_hit)\}/gi,

            (
                _,
                key
            ) =>
                data[
                    key.toLowerCase()
                ] ?? ''
        );
    }


    async function copyMessage() {

        const text =
            buildMessage();


        if (
            !text.trim()
        ) {

            toast(
                'Message is empty.'
            );

            return;
        }


        try {

            await navigator
                .clipboard
                .writeText(
                    text
                );

        } catch {

            const ta =
                document.createElement(
                    'textarea'
                );


            ta.value =
                text;


            ta.style.position =
                'fixed';

            ta.style.opacity =
                '0';


            document.body.appendChild(
                ta
            );


            ta.select();


            document.execCommand(
                'copy'
            );


            ta.remove();
        }


        toast(
            'Merc-C-QUE message copied.'
        );
    }


    // =========================================================
    // MANUAL QUEUE ACTIONS
    // =========================================================

    function manualDone() {

        if (
            state.api.mode !==
            'manual'
        ) {

            toast(
                'Switch API Mode to Manual before using DONE.'
            );

            return;
        }


        const idx =
            currentIndex();


        if (
            idx < 0
        ) {

            toast(
                'No READY participant.'
            );

            return;
        }


        pushQueueHistory();


        const [p] =
            state.roster.splice(
                idx,
                1
            );


        p.hits += 1;


        state.roster.push(
            p
        );


        state.manualNextHit =
            nextHitNumber() + 1;


        saveState();

        render();
    }


    function skipCurrent() {

        const idx =
            currentIndex();


        if (
            idx < 0
        ) {

            toast(
                'No READY participant.'
            );

            return;
        }


        pushQueueHistory();


        const [p] =
            state.roster.splice(
                idx,
                1
            );


        state.roster.push(
            p
        );


        saveState();

        render();
    }


    function recordRosterHit(
        name
    ) {

        const idx =
            findParticipantIndex(
                name
            );


        if (
            idx < 0
        ) {
            return false;
        }


        pushQueueHistory();


        const [p] =
            state.roster.splice(
                idx,
                1
            );


        p.hits += 1;


        state.roster.push(
            p
        );


        return true;
    }


    function addAndRecordUnknown(
        name
    ) {

        pushQueueHistory();


        state.roster.push({
            name,

            status:
                'ready',

            hits:
                1
        });
    }


    function toggleStatus(
        index
    ) {

        if (
            !state.roster[
                index
            ]
        ) {
            return;
        }


        pushQueueHistory();


        state.roster[
            index
        ].status =
            state.roster[index]
                .status ===
                'ready'
                ? 'afk'
                : 'ready';


        saveState();

        render();
    }


    function removeParticipant(
        index
    ) {

        if (
            !state.roster[
                index
            ]
        ) {
            return;
        }


        pushQueueHistory();


        state.roster.splice(
            index,
            1
        );


        saveState();

        render();
    }


    function moveParticipant(
        from,
        to
    ) {

        if (
            from === to ||
            from < 0 ||
            to < 0 ||
            from >=
                state.roster.length ||
            to >=
                state.roster.length
        ) {
            return;
        }


        pushQueueHistory();


        const [item] =
            state.roster.splice(
                from,
                1
            );


        state.roster.splice(
            to,
            0,
            item
        );


        saveState();

        render();
    }


    // =========================================================
    // ROSTER SETUP
    // =========================================================

    function parseRosterText(
        text
    ) {

        return String(text)
            .split(
                /\r?\n|,/
            )
            .map(
                s =>
                    s.trim()
            )
            .filter(Boolean)
            .filter(
                (
                    name,
                    i,
                    arr
                ) =>
                    arr.findIndex(
                        x =>
                            x.toLowerCase() ===
                            name.toLowerCase()
                    ) === i
            );
    }


    function replaceRosterFromText(
        text
    ) {

        const names =
            parseRosterText(
                text
            );


        const old =
            new Map(
                state.roster.map(
                    p => [
                        p.name
                            .toLowerCase(),
                        p
                    ]
                )
            );


        pushQueueHistory();


        state.roster =
            names.map(
                name => {

                    const existing =
                        old.get(
                            name.toLowerCase()
                        );


                    return existing
                        ? {
                            ...existing,
                            name
                        }
                        : {
                            name,

                            status:
                                'ready',

                            hits:
                                0
                        };
                }
            );


        rosterDraft =
            null;


        saveState();

        render();


        toast(
            `Roster saved: ${state.roster.length} participant${
                state.roster.length === 1
                    ? ''
                    : 's'
            }.`
        );
    }


    function setAllReady() {

        if (
            !state.roster.length
        ) {
            return;
        }


        pushQueueHistory();


        state.roster.forEach(
            p =>
                p.status =
                    'ready'
        );


        saveState();

        render();
    }


    function resetPlayerHits() {

        if (
            !state.roster.length
        ) {
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
            p =>
                p.hits = 0
        );


        saveState();

        render();
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
            p => {

                p.hits =
                    0;

                p.status =
                    'ready';
            }
        );


        state.manualNextHit =
            1;


        state.api.pendingHits =
            [];


        saveState();

        render();
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


        if (
            !key
        ) {

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
                    'HKs Merc-C-QUE'
            });


        return new Promise(
            (
                resolve,
                reject
            ) => {

                GM_xmlhttpRequest({

                    method:
                        'GET',

                    url:
                        `${API_BASE}${path}?${query.toString()}`,

                    headers: {

                        Authorization:
                            `ApiKey ${key}`,

                        Accept:
                            'application/json'
                    },

                    timeout:
                        12000,


                    onload:
                        response => {

                            let data;


                            try {

                                data =
                                    JSON.parse(
                                        response
                                            .responseText ||
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


                            if (
                                data?.error
                            ) {

                                const code =
                                    Number(
                                        data.error
                                            .code ??
                                        0
                                    );


                                const msg =
                                    data.error
                                        .error ||
                                    data.error
                                        .message ||
                                    'Unknown API error';


                                const err =
                                    new Error(
                                        `API ${code}: ${msg}`
                                    );


                                err.apiCode =
                                    code;


                                reject(
                                    err
                                );

                                return;
                            }


                            if (
                                response.status <
                                    200 ||
                                response.status >=
                                    300
                            ) {

                                reject(
                                    new Error(
                                        `HTTP ${response.status}`
                                    )
                                );

                                return;
                            }


                            resolve(
                                data
                            );
                        },


                    onerror:
                        () =>
                            reject(
                                new Error(
                                    'Network error contacting api.torn.com.'
                                )
                            ),


                    ontimeout:
                        () =>
                            reject(
                                new Error(
                                    'Torn API request timed out.'
                                )
                            )
                });
            }
        );
    }


    async function fetchChain(
        key = ''
    ) {

        return apiRequest(
            '/faction/chain',
            {},
            key
        );
    }


    async function fetchAttacks(
        key = ''
    ) {

        return apiRequest(

            '/faction/attacks',

            {
                filters:
                    'outgoing',

                limit:
                    '50',

                sort:
                    'DESC'
            },

            key
        );
    }


    // =========================================================
    // ATTACK DETECTION
    // =========================================================

    function validChainAttack(
        attack
    ) {

        return !!(
            attack &&
            attack.attacker?.name &&
            Number(
                attack.chain
            ) > 0 &&
            !attack.is_interrupted
        );
    }


    function attackId(
        attack
    ) {

        return String(
            attack?.id ??
            attack?.code ??
            `${attack?.ended}-${attack?.attacker?.id}-${attack?.chain}`
        );
    }


    function markProcessed(
        id
    ) {

        const sid =
            String(id);


        state.api
            .processedAttackIds =
            [
                sid,

                ...state.api
                    .processedAttackIds
                    .filter(
                        x =>
                            x !== sid
                    )
            ].slice(
                0,
                MAX_PROCESSED_ATTACKS
            );
    }


    function addPendingHit(
        event
    ) {

        if (
            state.api.pendingHits
                .some(
                    x =>
                        String(
                            x.id
                        ) ===
                        String(
                            event.id
                        )
                )
        ) {
            return;
        }


        state.api.pendingHits
            .push(
                event
            );


        state.api.pendingHits =
            state.api.pendingHits
                .slice(
                    0,
                    MAX_PENDING_HITS
                );
    }


    function processDetectedAttack(
        attack
    ) {

        if (
            !validChainAttack(
                attack
            )
        ) {
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


        const idx =
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

            id:
                attackId(
                    attack
                ),

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
                idx < 0
                    ? 'unknown'
                    : expected
                        ? 'expected'
                        : 'outoforder',

            expectedPlayer:
                current ||
                '—'
        };


        // -----------------------------------------
        // AUTO MODE
        //
        // Expected player advances automatically.
        //
        // Out-of-order players still require
        // confirmation.
        // -----------------------------------------

        if (
            state.api.mode ===
                'auto' &&
            idx >= 0 &&
            expected
        ) {

            recordRosterHit(
                attacker
            );


            state.api.status =
                `AUTO: ${attacker} recorded at #${chain}`;


            return true;
        }


        // -----------------------------------------
        // Assisted mode or unexpected hit
        // -----------------------------------------

        addPendingHit(
            event
        );


        if (
            idx < 0
        ) {

            state.api.status =
                `Hit #${chain}: ${attacker} is not in the queue`;

        } else if (
            expected
        ) {

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


        attackInFlight =
            true;


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


            // -----------------------------------------
            // First API check only establishes
            // a baseline.
            //
            // This prevents old attacks from being
            // replayed when you first enable API mode.
            // -----------------------------------------

            if (
                forceBaseline ||
                !state.api
                    .baselineReady
            ) {

                attacks.forEach(
                    a =>
                        markProcessed(
                            attackId(a)
                        )
                );


                state.api
                    .baselineReady =
                    true;


                state.api.status =
                    'Connected — watching new faction hits';


                state.api.lastError =
                    '';


                saveState();

                updateApiStatusUi();

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
                        a =>
                            !processed.has(
                                attackId(a)
                            )
                    )

                    .sort(
                        (
                            a,
                            b
                        ) =>
                            (
                                Number(
                                    a.ended
                                ) -
                                Number(
                                    b.ended
                                )
                            ) ||
                            attackId(a)
                                .localeCompare(
                                    attackId(b)
                                )
                    );


            let changed =
                false;


            for (
                const attack
                of fresh
            ) {

                markProcessed(
                    attackId(
                        attack
                    )
                );


                if (
                    processDetectedAttack(
                        attack
                    )
                ) {

                    changed =
                        true;
                }
            }


            if (
                !fresh.length
            ) {

                state.api.status =
                    'Connected — watching new faction hits';
            }


            state.api.lastError =
                '';


            saveState();


            if (
                changed
            ) {

                render();

            } else {

                updateApiStatusUi();
            }

        } catch (err) {

            handleApiError(
                err
            );

        } finally {

            attackInFlight =
                false;
        }
    }


    async function pollChain() {

        if (
            chainInFlight ||
            !getApiKey()
        ) {
            return;
        }


        chainInFlight =
            true;


        state.api.lastChainPoll =
            Date.now();


        try {

            const data =
                await fetchChain();


            const chain =
                data?.chain ||
                null;


            if (
                chain
            ) {

                const previousId =
                    state.api.chainId;


                const previousCurrent =
                    Number(
                        state.api
                            .chainCurrent
                    );


                const newCurrent =
                    Number(
                        chain.current
                    ) || 0;


                const newId =
                    chain.id ??
                    null;


                // -----------------------------------------
                // New chain detected.
                // -----------------------------------------

                if (
                    previousId != null &&
                    newId != null &&
                    String(
                        previousId
                    ) !==
                        String(
                            newId
                        )
                ) {

                    state.api
                        .baselineReady =
                        false;


                    state.api
                        .processedAttackIds =
                        [];


                    state.api
                        .pendingHits =
                        [];


                    state.api.status =
                        'New chain detected — re-baselining attack watch';
                }


                // -----------------------------------------
                // Prevent a temporarily stale chain API
                // response from rolling us backward.
                // -----------------------------------------

                const sameChain =
                    previousId != null &&
                    newId != null &&
                    String(
                        previousId
                    ) ===
                        String(
                            newId
                        );


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
                    acceptedCurrent +
                    1;

            } else {

                state.api.chainId =
                    null;


                state.api.chainCurrent =
                    null;


                state.api.chainMax =
                    null;


                state.api.chainTimeout =
                    null;
            }


            state.api.lastError =
                '';


            saveState();


            updateApiStatusUi();

            updateHitDisplays();

        } catch (err) {

            handleApiError(
                err
            );

        } finally {

            chainInFlight =
                false;
        }
    }


    function handleApiError(
        err
    ) {

        const message =
            err?.message ||
            String(err);


        state.api.lastError =
            message;


        state.api.status =
            message;


        // Invalid / inactive / unauthorized keys
        // pause automatic requests.

        if (
            [
                1,
                2,
                7
            ].includes(
                Number(
                    err?.apiCode
                )
            )
        ) {

            state.api.paused =
                true;


            state.api.status =
                `${message} — automation paused`;
        }


        saveState();

        updateApiStatusUi();
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


        if (
            !key
        ) {

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
                    fetchChain(
                        key
                    ),

                    fetchAttacks(
                        key
                    )
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


            state.api.paused =
                false;


            state.api.lastError =
                '';


            state.api.status =
                `API OK — chain ${current}; attack feed accessible (${attacks.length} returned)`;


            saveState();

            render();


            toast(
                'API connection successful.'
            );

        } catch (err) {

            handleApiError(
                err
            );


            render();


            toast(
                err?.message ||
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


        if (
            newKey
        ) {

            setApiKey(
                newKey
            );


            apiKeyDraft =
                '';


            state.api
                .baselineReady =
                false;


            state.api
                .processedAttackIds =
                [];


            state.api
                .pendingHits =
                [];


            state.api.paused =
                false;
        }


        const modeEl =
            document.querySelector(
                '#hkmcq-api-mode'
            );


        const attackEl =
            document.querySelector(
                '#hkmcq-attack-poll'
            );


        const chainEl =
            document.querySelector(
                '#hkmcq-chain-poll'
            );


        const oldMode =
            state.api.mode;


        if (
            modeEl
        ) {

            state.api.mode =
                modeEl.value;
        }


        if (
            attackEl
        ) {

            state.api
                .attackPollSeconds =
                clamp(
                    Number(
                        attackEl.value
                    ) || 5,
                    3,
                    60
                );
        }


        if (
            chainEl
        ) {

            state.api
                .chainPollSeconds =
                clamp(
                    Number(
                        chainEl.value
                    ) || 10,
                    5,
                    120
                );
        }


        if (
            oldMode ===
                'manual' &&
            state.api.mode !==
                'manual'
        ) {

            state.api
                .baselineReady =
                false;


            state.api
                .processedAttackIds =
                [];


            state.api
                .pendingHits =
                [];


            state.api.paused =
                false;


            state.api.status =
                'Starting API watch…';
        }


        if (
            state.api.mode ===
            'manual'
        ) {

            state.api.status =
                getApiKey()
                    ? 'Manual mode — API watch stopped'
                    : 'Manual mode';

        } else if (
            !getApiKey()
        ) {

            state.api.status =
                'API key required';
        }


        state.api.lastAttackPoll =
            0;


        state.api.lastChainPoll =
            0;


        saveState();

        render();


        toast(
            'API settings saved.'
        );


        if (
            automationActive()
        ) {

            pollChain();

            pollAttacks(
                true
            );
        }
    }


    function removeSavedApiKey() {

        if (
            !confirm(
                'Remove the saved Torn API key from Merc-C-QUE?'
            )
        ) {
            return;
        }


        clearApiKey();


        apiKeyDraft =
            '';


        state.api.mode =
            'manual';


        state.api.paused =
            false;


        state.api.baselineReady =
            false;


        state.api.processedAttackIds =
            [];


        state.api.pendingHits =
            [];


        state.api.status =
            'Manual mode';


        state.api.lastError =
            '';


        saveState();

        render();


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
            state.api
                .pendingHits[0];


        if (
            !event
        ) {
            return;
        }


        if (
            event.kind ===
            'unknown'
        ) {

            if (
                !addUnknown
            ) {
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


        state.api.pendingHits
            .shift();


        state.api.status =
            `Recorded ${event.attacker} at hit #${event.chain}`;


        saveState();

        render();
    }


    function ignorePendingHit() {

        const event =
            state.api.pendingHits
                .shift();


        if (
            !event
        ) {
            return;
        }


        state.api.status =
            `Ignored detected hit #${event.chain} by ${event.attacker}`;


        saveState();

        render();
    }


    // =========================================================
    // API SCHEDULER
    // =========================================================

    function schedulerTick() {

        if (
            !automationActive()
        ) {
            return;
        }


        const now =
            Date.now();


        if (
            now -
                Number(
                    state.api
                        .lastAttackPoll ||
                    0
                ) >=
            state.api
                .attackPollSeconds *
                1000
        ) {

            pollAttacks(
                false
            );
        }


        if (
            now -
                Number(
                    state.api
                        .lastChainPoll ||
                    0
                ) >=
            state.api
                .chainPollSeconds *
                1000
        ) {

            pollChain();
        }
    }


    // =========================================================
    // HTML HELPERS
    // =========================================================

    function escapeHtml(
        value
    ) {

        return String(value)
            .replaceAll(
                '&',
                '&amp;'
            )
            .replaceAll(
                '<',
                '&lt;'
            )
            .replaceAll(
                '>',
                '&gt;'
            )
            .replaceAll(
                '"',
                '&quot;'
            )
            .replaceAll(
                "'",
                '&#039;'
            );
    }


    function detectDarkTheme() {

        try {

            const rgb =
                getComputedStyle(
                    document.body
                )
                    .backgroundColor
                    .match(
                        /\d+/g
                    )
                    ?.map(Number) ||
                [
                    30,
                    30,
                    30
                ];


            return (
                0.299 *
                    rgb[0] +
                0.587 *
                    rgb[1] +
                0.114 *
                    rgb[2]
            ) < 135;

        } catch {

            return true;
        }
    }


    // =========================================================
    // STYLES
    // =========================================================

    function installStyle() {

        if (
            document.querySelector(
                '#hkmcq-style'
            )
        ) {
            return;
        }


        const dark =
            detectDarkTheme();


        const c =
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

                --p:${c.panel};
                --p2:${c.panel2};
                --t:${c.text};
                --m:${c.muted};
                --b:${c.border};
                --i:${c.input};
                --btn:${c.button};
                --hov:${c.hover};
                --s:${c.strong};
                --warn:${c.warn};

                position:fixed;

                top:105px;
                right:16px;

                width:365px;

                z-index:999999;

                background:var(--p);

                color:var(--t);

                border:
                    1px solid
                    var(--b);

                border-radius:
                    9px;

                box-shadow:
                    0 10px 28px
                    rgba(
                        0,
                        0,
                        0,
                        .32
                    );

                font:
                    13px
                    Arial,
                    Helvetica,
                    sans-serif;


                /*
                 * Scrollable panel.
                 * No manual resizing.
                 */

                overflow-y:auto;
                overflow-x:hidden;

                overscroll-behavior:
                    contain;

                scrollbar-gutter:
                    stable;

                user-select:none;
            }


            #${PANEL_ID} * {

                box-sizing:
                    border-box;
            }


            /*
             * Keep the title bar visible
             * while scrolling.
             */

            #${PANEL_ID} .head {

                position:
                    sticky;

                top:
                    0;

                z-index:
                    10;

                display:
                    flex;

                align-items:
                    center;

                gap:
                    7px;

                padding:
                    9px 10px;

                background:
                    var(--p2);

                border-bottom:
                    1px solid
                    var(--b);

                cursor:
                    move;
            }


            #${PANEL_ID} .title {

                flex:
                    1;

                font-weight:
                    800;

                color:
                    var(--s);

                letter-spacing:
                    .2px;
            }


            #${PANEL_ID} .sub {

                font-size:
                    10px;

                font-weight:
                    400;

                color:
                    var(--m);

                margin-top:
                    1px;
            }


            #${PANEL_ID} button,
            #${PANEL_ID} input,
            #${PANEL_ID} textarea,
            #${PANEL_ID} select {

                font:
                    inherit;
            }


            #${PANEL_ID} button {

                border:
                    1px solid
                    var(--b);

                background:
                    var(--btn);

                color:
                    var(--t);

                border-radius:
                    6px;

                padding:
                    5px 8px;

                cursor:
                    pointer;
            }


            #${PANEL_ID} button:hover {

                background:
                    var(--hov);
            }


            #${PANEL_ID} button:disabled {

                cursor:
                    default;

                opacity:
                    .45;
            }


            #${PANEL_ID} .icon {

                width:
                    28px;

                height:
                    28px;

                padding:
                    0;

                display:
                    grid;

                place-items:
                    center;
            }


            #${PANEL_ID} .main {

                padding:
                    10px;
            }


            #${PANEL_ID} .up {

                text-align:
                    center;

                padding:
                    10px 8px;

                background:
                    var(--p2);

                border:
                    1px solid
                    var(--b);

                border-radius:
                    8px;
            }


            #${PANEL_ID} .kicker {

                font-size:
                    10px;

                color:
                    var(--m);

                letter-spacing:
                    1px;
            }


            #${PANEL_ID} .upLine {

                display:
                    flex;

                justify-content:
                    center;

                align-items:
                    baseline;

                gap:
                    7px;

                flex-wrap:
                    wrap;

                margin-top:
                    4px;
            }


            #${PANEL_ID} .upName {

                font-size:
                    21px;

                font-weight:
                    800;

                color:
                    var(--s);
            }


            #${PANEL_ID} .hitBadge {

                font-size:
                    12px;

                font-weight:
                    700;

                color:
                    var(--m);
            }


            #${PANEL_ID} .nextGrid {

                display:
                    grid;

                grid-template-columns:
                    70px 1fr;

                gap:
                    5px 8px;

                padding:
                    8px 3px 2px;
            }


            #${PANEL_ID} .label {

                font-size:
                    11px;

                color:
                    var(--m);
            }


            #${PANEL_ID} .nextPerson {

                display:
                    flex;

                justify-content:
                    space-between;

                gap:
                    8px;
            }


            #${PANEL_ID} .queueHit {

                color:
                    var(--m);

                font-size:
                    10px;

                white-space:
                    nowrap;
            }


            #${PANEL_ID} .controls {

                display:
                    grid;

                grid-template-columns:
                    1.5fr
                    1fr
                    .8fr;

                gap:
                    6px;

                margin-top:
                    8px;
            }


            #${PANEL_ID} .done {

                font-weight:
                    800;

                padding:
                    8px 10px;
            }


            #${PANEL_ID} .done.locked {

                opacity:
                    .5;
            }


            #${PANEL_ID} .hitRow {

                display:
                    grid;

                grid-template-columns:
                    auto
                    1fr
                    auto;

                gap:
                    7px;

                align-items:
                    center;

                margin-top:
                    8px;
            }


            #${PANEL_ID} input,
            #${PANEL_ID} textarea,
            #${PANEL_ID} select {

                width:
                    100%;

                border:
                    1px solid
                    var(--b);

                background:
                    var(--i);

                color:
                    var(--t);

                border-radius:
                    6px;

                padding:
                    6px 7px;

                outline:
                    none;
            }


            #${PANEL_ID} textarea {

                min-height:
                    58px;

                resize:
                    vertical;

                user-select:
                    text;

                max-width:
                    100%;
            }


            #${PANEL_ID} .preview {

                margin-top:
                    8px;

                min-height:
                    44px;

                white-space:
                    pre-wrap;

                word-break:
                    break-word;

                user-select:
                    text;
            }


            #${PANEL_ID} .copy {

                width:
                    100%;

                margin-top:
                    5px;

                font-weight:
                    700;
            }


            #${PANEL_ID} .apiStrip {

                margin-top:
                    8px;

                padding:
                    6px 7px;

                border:
                    1px solid
                    var(--b);

                border-radius:
                    6px;

                font-size:
                    10px;

                color:
                    var(--m);

                display:
                    flex;

                gap:
                    7px;

                justify-content:
                    space-between;

                align-items:
                    center;
            }


            #${PANEL_ID} .apiStrip strong {

                color:
                    var(--t);
            }


            #${PANEL_ID} .pending {

                margin-top:
                    8px;

                padding:
                    8px;

                border:
                    1px solid
                    #9b7a2e;

                border-radius:
                    7px;

                background:
                    var(--warn);
            }


            #${PANEL_ID} .pendingTitle {

                font-weight:
                    800;

                margin-bottom:
                    4px;
            }


            #${PANEL_ID} .pendingText {

                font-size:
                    11px;

                line-height:
                    1.35;
            }


            #${PANEL_ID} .pendingBtns {

                display:
                    flex;

                gap:
                    6px;

                margin-top:
                    7px;
            }


            #${PANEL_ID} .pendingBtns button {

                flex:
                    1;
            }


            #${PANEL_ID} .roster {

                margin-top:
                    9px;

                max-height:
                    245px;

                overflow:
                    auto;

                border-top:
                    1px solid
                    var(--b);
            }


            #${PANEL_ID} .row {

                display:
                    grid;

                grid-template-columns:
                    20px
                    minmax(0,1fr)
                    46px
                    54px
                    25px;

                gap:
                    5px;

                align-items:
                    center;

                padding:
                    6px 0;

                border-bottom:
                    1px solid
                    var(--b);
            }


            #${PANEL_ID} .row[draggable=true] {

                cursor:
                    grab;
            }


            #${PANEL_ID} .row.dragover {

                outline:
                    1px dashed
                    var(--m);
            }


            #${PANEL_ID} .handle {

                text-align:
                    center;

                color:
                    var(--m);
            }


            #${PANEL_ID} .name {

                overflow:
                    hidden;

                text-overflow:
                    ellipsis;

                white-space:
                    nowrap;
            }


            #${PANEL_ID} .name .assigned {

                font-size:
                    10px;

                color:
                    var(--m);

                margin-left:
                    4px;
            }


            #${PANEL_ID} .phits {

                text-align:
                    right;

                font-size:
                    10px;

                color:
                    var(--m);
            }


            #${PANEL_ID} .status {

                font-size:
                    10px;

                font-weight:
                    700;

                padding:
                    3px 5px;

                text-transform:
                    uppercase;
            }


            #${PANEL_ID} .status[data-status=afk] {

                opacity:
                    .55;
            }


            #${PANEL_ID} .remove {

                width:
                    25px;

                height:
                    25px;

                padding:
                    0;
            }


            #${PANEL_ID} .section {

                margin-top:
                    10px;

                padding-top:
                    10px;

                max-width:
                    100%;

                border-top:
                    1px solid
                    var(--b);
            }


            #${PANEL_ID} .sectionTitle {

                font-weight:
                    800;

                margin-bottom:
                    5px;
            }


            #${PANEL_ID} .help {

                font-size:
                    10px;

                color:
                    var(--m);

                line-height:
                    1.35;

                margin-top:
                    4px;
            }


            #${PANEL_ID} .miniRow {

                display:
                    flex;

                gap:
                    6px;

                margin-top:
                    6px;
            }


            #${PANEL_ID} .miniRow > * {

                flex:
                    1;
            }


            #${PANEL_ID} .settingsGrid {

                display:
                    grid;

                grid-template-columns:
                    1fr
                    1fr;

                gap:
                    6px;
            }


            #${PANEL_ID} .full {

                grid-column:
                    1 / -1;
            }


            #${PANEL_ID} .apiStatusBox {

                margin-top:
                    6px;

                padding:
                    7px;

                border:
                    1px solid
                    var(--b);

                border-radius:
                    6px;

                font-size:
                    10px;

                line-height:
                    1.4;

                color:
                    var(--m);
            }


            #${PANEL_ID}.collapsed {

                overflow:
                    hidden !important;
            }


            #${PANEL_ID}.collapsed .main {

                display:
                    none;
            }


            #hkmcq-toast {

                position:
                    fixed;

                right:
                    20px;

                bottom:
                    22px;

                z-index:
                    1000000;

                background:
                    rgba(
                        20,
                        20,
                        20,
                        .95
                    );

                color:
                    #fff;

                border-radius:
                    7px;

                padding:
                    9px 12px;

                font:
                    13px
                    Arial,
                    Helvetica,
                    sans-serif;

                box-shadow:
                    0 6px 20px
                    rgba(
                        0,
                        0,
                        0,
                        .35
                    );
            }
        `;


        document.head.appendChild(
            style
        );
    }


    // =========================================================
    // PANEL VIEWPORT / SCROLL HEIGHT
    // =========================================================

    function adjustPanelViewport() {

        const panel =
            document.getElementById(
                PANEL_ID
            );


        if (
            !panel
        ) {
            return;
        }


        if (
            state.collapsed
        ) {

            panel.style.maxHeight =
                'none';

            return;
        }


        const rect =
            panel.getBoundingClientRect();


        /*
         * Available room beneath the current
         * position of the panel.
         */

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


    // =========================================================
    // ROSTER HTML
    // =========================================================

    function rosterRowsHtml() {

        if (
            !state.roster.length
        ) {

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


        let readyOffset =
            0;


        return state.roster
            .map(
                (
                    p,
                    i
                ) => {

                    const assigned =
                        p.status ===
                            'ready'
                            ? base +
                                readyOffset++
                            : null;


                    return `
                        <div
                            class="row"
                            draggable="true"
                            data-index="${i}"
                        >

                            <div
                                class="handle"
                                title="Drag to reorder"
                            >
                                ☰
                            </div>

                            <div
                                class="name"
                                title="${escapeHtml(p.name)}"
                            >

                                ${escapeHtml(p.name)}

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
                                ${p.hits} hit${p.hits === 1 ? '' : 's'}
                            </div>

                            <button
                                class="status"
                                data-action="status"
                                data-index="${i}"
                                data-status="${p.status}"
                                title="Toggle READY / AFK"
                            >
                                ${p.status}
                            </button>

                            <button
                                class="remove"
                                data-action="remove"
                                data-index="${i}"
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

        const p =
            state.api
                .pendingHits[0];


        if (
            !p
        ) {
            return '';
        }


        const count =
            state.api
                .pendingHits
                .length;


        const title =
            p.kind ===
                'expected'
                ? 'HIT DETECTED'
                : p.kind ===
                    'unknown'
                    ? 'UNQUEUED HIT DETECTED'
                    : 'OUT-OF-ORDER HIT';


        let text =
            `<strong>${escapeHtml(p.attacker)}</strong> completed HIT #${p.chain}.`;


        if (
            p.kind ===
            'outoforder'
        ) {

            text +=
                `<br>Expected next: <strong>${escapeHtml(p.expectedPlayer)}</strong>.`;
        }


        if (
            p.kind ===
            'unknown'
        ) {

            text +=
                '<br>This player is not currently in Merc-C-QUE.';
        }


        if (
            count > 1
        ) {

            text +=
                `<br>${count - 1} additional detected hit${count - 1 === 1 ? '' : 's'} waiting.`;
        }


        const confirmLabel =
            p.kind ===
                'unknown'
                ? 'ADD & RECORD'
                : p.kind ===
                    'expected'
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
                        data-add-unknown="${p.kind === 'unknown' ? '1' : '0'}"
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
            state.api.mode
                .toUpperCase();


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
            state.api.chainCurrent !=
                null
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

                    Use a Limited Torn API key with Faction API Access
                    for the attack feed.

                    The key is stored in your userscript manager.

                    Manual mode makes no recurring API calls.

                </div>

            </div>
        `;
    }


    // =========================================================
    // MAIN RENDER
    // =========================================================

    function render() {

        installStyle();


        let panel =
            document.getElementById(
                PANEL_ID
            );


        if (
            !panel
        ) {

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
                state.position.left
            ) &&
            Number.isFinite(
                state.position.top
            )
        ) {

            panel.style.left =
                `${state.position.left}px`;


            panel.style.top =
                `${state.position.top}px`;


            panel.style.right =
                'auto';
        }


        panel.classList.toggle(
            'collapsed',
            !!state.collapsed
        );


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


        const ondeck =
            ready[2]?.name ||
            '—';


        const doneLocked =
            state.api.mode !==
            'manual';


        panel.innerHTML = `

            <div class="head">

                <div class="title">

                    HKs Merc-C-QUE

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
                    data-action="collapse"
                    title="${state.collapsed ? 'Expand' : 'Collapse'}"
                >
                    ${state.collapsed ? '▾' : '▴'}
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
                            ${escapeHtml(ondeck)}
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
                                    p => p.name
                                )
                                .join(
                                    '\n'
                                )
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

                        </div>

                    </div>

                `
                        : ''
                }

            </div>
        `;


        bindEvents(
            panel
        );


        /*
         * Apply a scroll height based on where
         * the panel currently sits on screen.
         */

        requestAnimationFrame(
            adjustPanelViewport
        );
    }


    // =========================================================
    // UI EVENTS
    // =========================================================

    function bindEvents(
        panel
    ) {

        panel
            .querySelectorAll(
                '[data-action]'
            )
            .forEach(
                el => {

                    el.addEventListener(
                        'click',
                        event => {

                            event.stopPropagation();


                            const action =
                                el.dataset.action;


                            const index =
                                Number(
                                    el.dataset.index
                                );


                            if (
                                action ===
                                'done'
                            ) {
                                manualDone();
                            }


                            if (
                                action ===
                                'skip'
                            ) {
                                skipCurrent();
                            }


                            if (
                                action ===
                                'undo'
                            ) {
                                undo();
                            }


                            if (
                                action ===
                                'copy'
                            ) {
                                copyMessage();
                            }


                            if (
                                action ===
                                'status'
                            ) {

                                toggleStatus(
                                    index
                                );
                            }


                            if (
                                action ===
                                'remove'
                            ) {

                                removeParticipant(
                                    index
                                );
                            }


                            if (
                                action ===
                                'saveRoster'
                            ) {

                                replaceRosterFromText(
                                    panel
                                        .querySelector(
                                            '#hkmcq-roster-editor'
                                        )
                                        ?.value ||
                                    ''
                                );
                            }


                            if (
                                action ===
                                'allReady'
                            ) {
                                setAllReady();
                            }


                            if (
                                action ===
                                'resetHits'
                            ) {
                                resetPlayerHits();
                            }


                            if (
                                action ===
                                'resetSession'
                            ) {
                                resetSession();
                            }


                            if (
                                action ===
                                'saveApi'
                            ) {
                                saveApiSettings();
                            }


                            if (
                                action ===
                                'testApi'
                            ) {
                                testApiConnection();
                            }


                            if (
                                action ===
                                'clearApi'
                            ) {
                                removeSavedApiKey();
                            }


                            if (
                                action ===
                                'resumeApi'
                            ) {

                                state.api.paused =
                                    false;


                                state.api.lastError =
                                    '';


                                state.api.status =
                                    'Resuming API watch…';


                                state.api.lastAttackPoll =
                                    0;


                                state.api.lastChainPoll =
                                    0;


                                saveState();

                                render();
                            }


                            if (
                                action ===
                                'confirmPending'
                            ) {

                                confirmPendingHit(
                                    el.dataset
                                        .addUnknown ===
                                    '1'
                                );
                            }


                            if (
                                action ===
                                'ignorePending'
                            ) {

                                ignorePendingHit();
                            }


                            if (
                                action ===
                                'collapse'
                            ) {

                                state.collapsed =
                                    !state.collapsed;


                                saveState();

                                render();
                            }


                            if (
                                action ===
                                'setup'
                            ) {

                                state.setupOpen =
                                    !state.setupOpen;


                                saveState();

                                render();
                            }
                        }
                    );
                }
            );


        // -----------------------------------------
        // Manual hit number
        // -----------------------------------------

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

                updateHitDisplays();

                updatePreviewOnly();
            }
        );


        // -----------------------------------------
        // Message template
        // -----------------------------------------

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


        // -----------------------------------------
        // Preserve unsaved roster text
        // -----------------------------------------

        const rosterEditor =
            panel.querySelector(
                '#hkmcq-roster-editor'
            );


        rosterEditor?.addEventListener(
            'input',
            () =>
                rosterDraft =
                    rosterEditor.value
        );


        // -----------------------------------------
        // API key draft
        // -----------------------------------------

        const keyInput =
            panel.querySelector(
                '#hkmcq-api-key'
            );


        keyInput?.addEventListener(
            'input',
            () =>
                apiKeyDraft =
                    keyInput.value
        );


        // -----------------------------------------
        // Drag roster ordering
        // -----------------------------------------

        panel
            .querySelectorAll(
                '.row'
            )
            .forEach(
                row => {

                    row.addEventListener(
                        'dragstart',
                        () => {

                            dragParticipantIndex =
                                Number(
                                    row.dataset.index
                                );
                        }
                    );


                    row.addEventListener(
                        'dragover',
                        e => {

                            e.preventDefault();


                            row.classList.add(
                                'dragover'
                            );
                        }
                    );


                    row.addEventListener(
                        'dragleave',
                        () =>
                            row.classList.remove(
                                'dragover'
                            )
                    );


                    row.addEventListener(
                        'drop',
                        e => {

                            e.preventDefault();


                            row.classList.remove(
                                'dragover'
                            );


                            if (
                                dragParticipantIndex !==
                                null
                            ) {

                                moveParticipant(
                                    dragParticipantIndex,
                                    Number(
                                        row.dataset.index
                                    )
                                );
                            }


                            dragParticipantIndex =
                                null;
                        }
                    );


                    row.addEventListener(
                        'dragend',
                        () => {

                            dragParticipantIndex =
                                null;


                            panel
                                .querySelectorAll(
                                    '.dragover'
                                )
                                .forEach(
                                    x =>
                                        x.classList.remove(
                                            'dragover'
                                        )
                                );
                        }
                    );
                }
            );


        // -----------------------------------------
        // Drag entire Merc-C-QUE panel
        // -----------------------------------------

        const header =
            panel.querySelector(
                '.head'
            );


        header?.addEventListener(
            'mousedown',
            e => {

                if (
                    e.target.closest(
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
                        e.clientX -
                        rect.left,

                    offsetY:
                        e.clientY -
                        rect.top
                };


                e.preventDefault();
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


        if (
            preview
        ) {

            preview.textContent =
                buildMessage();
        }
    }


    function updateHitDisplays() {

        const nums =
            hitNumbers();


        const badge =
            document.querySelector(
                `#${PANEL_ID} .hitBadge`
            );


        if (
            badge
        ) {

            badge.textContent =
                `• HIT #${nums.hit}`;
        }


        const queueHits =
            document.querySelectorAll(
                `#${PANEL_ID} .nextGrid .queueHit`
            );


        if (
            queueHits[0]
        ) {

            queueHits[0]
                .textContent =
                `HIT #${nums.nextHit}`;
        }


        if (
            queueHits[1]
        ) {

            queueHits[1]
                .textContent =
                `HIT #${nums.onDeckHit}`;
        }


        const input =
            document.querySelector(
                '#hkmcq-hit-number'
            );


        if (
            input &&
            document.activeElement !==
                input
        ) {

            input.value =
                String(
                    nums.hit
                );
        }


        updatePreviewOnly();
    }


    function setApiUiText(
        text
    ) {

        const box =
            document.querySelector(
                '#hkmcq-api-status'
            );


        if (
            box
        ) {

            box.textContent =
                text;
        }
    }


    function updateApiStatusUi() {

        const box =
            document.querySelector(
                '#hkmcq-api-status'
            );


        if (
            box
        ) {

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


        const strip =
            document.querySelector(
                `#${PANEL_ID} .apiStrip`
            );


        if (
            strip
        ) {

            strip.outerHTML =
                apiStripHtml();
        }
    }


    // =========================================================
    // PANEL DRAGGING
    // =========================================================

    document.addEventListener(
        'mousemove',
        e => {

            if (
                !panelDrag
            ) {
                return;
            }


            const panel =
                document.getElementById(
                    PANEL_ID
                );


            if (
                !panel
            ) {
                return;
            }


            const maxLeft =
                Math.max(
                    0,
                    window.innerWidth -
                    panel.offsetWidth
                );


            /*
             * Keep enough vertical room visible
             * for the panel to remain usable.
             */

            const maxTop =
                Math.max(
                    0,
                    window.innerHeight -
                    180
                );


            const left =
                Math.min(
                    maxLeft,
                    Math.max(
                        0,
                        e.clientX -
                        panelDrag.offsetX
                    )
                );


            const top =
                Math.min(
                    maxTop,
                    Math.max(
                        0,
                        e.clientY -
                        panelDrag.offsetY
                    )
                );


            panel.style.left =
                `${left}px`;


            panel.style.top =
                `${top}px`;


            panel.style.right =
                'auto';


            adjustPanelViewport();
        }
    );


    document.addEventListener(
        'mouseup',
        () => {

            if (
                !panelDrag
            ) {
                return;
            }


            const panel =
                document.getElementById(
                    PANEL_ID
                );


            if (
                panel
            ) {

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


            panelDrag =
                null;
        }
    );


    window.addEventListener(
        'resize',
        () => {

            const panel =
                document.getElementById(
                    PANEL_ID
                );


            if (
                !panel
            ) {
                return;
            }


            const rect =
                panel.getBoundingClientRect();


            const maxLeft =
                Math.max(
                    0,
                    window.innerWidth -
                    panel.offsetWidth
                );


            const maxTop =
                Math.max(
                    0,
                    window.innerHeight -
                    180
                );


            if (
                rect.left >
                maxLeft
            ) {

                panel.style.left =
                    `${maxLeft}px`;

                panel.style.right =
                    'auto';
            }


            if (
                rect.top >
                maxTop
            ) {

                panel.style.top =
                    `${maxTop}px`;
            }


            adjustPanelViewport();
        }
    );


    // =========================================================
    // TOAST
    // =========================================================

    function toast(
        message
    ) {

        document
            .getElementById(
                'hkmcq-toast'
            )
            ?.remove();


        const el =
            document.createElement(
                'div'
            );


        el.id =
            'hkmcq-toast';


        el.textContent =
            message;


        document.body.appendChild(
            el
        );


        setTimeout(
            () =>
                el.remove(),
            1800
        );
    }


    // =========================================================
    // TORN DYNAMIC PAGE SUPPORT
    // =========================================================

    function ensureMounted() {

        if (
            document.body &&
            !document.getElementById(
                PANEL_ID
            )
        ) {

            render();
        }
    }


    // =========================================================
    // START
    // =========================================================

    render();


    setInterval(
        ensureMounted,
        2500
    );


    setInterval(
        schedulerTick,
        1000
    );


    /*
     * If API automation was already enabled
     * before the page refresh, reconnect.
     */

    if (
        automationActive()
    ) {

        state.api.lastAttackPoll =
            0;


        state.api.lastChainPoll =
            0;


        if (
            !state.api.baselineReady
        ) {

            pollAttacks(
                true
            );
        }


        pollChain();
    }

})();