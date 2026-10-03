from pathlib import Path

path = Path('HKs-Merc-C-Que.user.js')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    text = text.replace(old, new, 1)


# Version / branch metadata.
replace_once('// @version      2.5.12', '// @version      2.5.13', 'metadata version')
replace_once('https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/v2.5.12-multitab-sync/HKs-Merc-C-Que.user.js',
             'https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/v2.5.13-pda-tempo-bulk/HKs-Merc-C-Que.user.js',
             'update url')
replace_once('https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/v2.5.12-multitab-sync/HKs-Merc-C-Que.user.js',
             'https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/v2.5.13-pda-tempo-bulk/HKs-Merc-C-Que.user.js',
             'download url')
replace_once("  const VERSION = '2.5.12';\n  const SCHEMA_VERSION = 5;",
             "  const VERSION = '2.5.13';\n  const SCHEMA_VERSION = 6;",
             'script/schema version')

replace_once(
    "  const PDA_MINIMIZED_STORE = 'ui_minimized';\n  const PDA_LAUNCHER_POSITION_STORE = 'ui_launcher_position';",
    "  const PDA_MINIMIZED_STORE = 'ui_minimized';\n  const PDA_COMPACT_STORE = 'ui_compact';\n  const PDA_LAUNCHER_POSITION_STORE = 'ui_launcher_position';",
    'pda compact store'
)
replace_once(
    "  const TORN_CLOCK_SYNC_INTERVAL_MS = 60000;\n  const DEFAULT_WAIT_WARNING_SECONDS = 240;",
    "  const TORN_CLOCK_SYNC_INTERVAL_MS = 60000;\n  const DEFAULT_WAIT_WARNING_SECONDS = 240;\n  const DEFAULT_HIT_TEMPO_SECONDS = 120;",
    'tempo default'
)
replace_once(
    "    minimized: false,\n    setupOpen: false,",
    "    minimized: false,\n    compact: false,\n    setupOpen: false,",
    'compact state default'
)
replace_once(
    "      soundAlerts: false,\n      waitWarning: true,\n      waitWarningSeconds: DEFAULT_WAIT_WARNING_SECONDS",
    "      soundAlerts: false,\n      waitWarning: true,\n      waitWarningSeconds: DEFAULT_WAIT_WARNING_SECONDS,\n      hitTempoEnabled: false,\n      hitTempoSeconds: DEFAULT_HIT_TEMPO_SECONDS",
    'tempo ui defaults'
)

# PDA persistence for compact view.
replace_once(
    "    if (typeof savedPdaUi.minimized === 'boolean') state.minimized = savedPdaUi.minimized;\n    if (savedPdaUi.launcherPosition) state.launcherPosition = savedPdaUi.launcherPosition;",
    "    if (typeof savedPdaUi.minimized === 'boolean') state.minimized = savedPdaUi.minimized;\n    if (typeof savedPdaUi.compact === 'boolean') state.compact = savedPdaUi.compact;\n    if (savedPdaUi.launcherPosition) state.launcherPosition = savedPdaUi.launcherPosition;",
    'load compact pda state'
)
replace_once(
    """  async function loadPdaUiState() {
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
""",
    """  async function loadPdaUiState() {
    const [minimizedRaw, compactRaw, launcherRaw, panelRaw] = await Promise.all([
      pdaStorageGet(PDA_MINIMIZED_STORE, null),
      pdaStorageGet(PDA_COMPACT_STORE, null),
      pdaStorageGet(PDA_LAUNCHER_POSITION_STORE, null),
      pdaStorageGet(PDA_PANEL_POSITION_STORE, null)
    ]);
    return {
      minimized: typeof minimizedRaw === 'boolean' ? minimizedRaw : null,
      compact: typeof compactRaw === 'boolean' ? compactRaw : null,
      launcherPosition: normalizeStoredPosition(launcherRaw),
      panelPosition: normalizeStoredPosition(panelRaw)
    };
  }
""",
    'load pda ui function'
)
replace_once(
    """    const snapshot = {
      minimized: state.minimized === true,
      launcherPosition: normalizeStoredPosition(state.launcherPosition),
      panelPosition: normalizeStoredPosition(state.position)
    };
""",
    """    const snapshot = {
      minimized: state.minimized === true,
      compact: state.compact === true,
      launcherPosition: normalizeStoredPosition(state.launcherPosition),
      panelPosition: normalizeStoredPosition(state.position)
    };
""",
    'compact pda snapshot'
)
replace_once(
    "        await pdaStorageSet(PDA_MINIMIZED_STORE, snapshot.minimized);\n        if (snapshot.launcherPosition) {",
    "        await pdaStorageSet(PDA_MINIMIZED_STORE, snapshot.minimized);\n        await pdaStorageSet(PDA_COMPACT_STORE, snapshot.compact);\n        if (snapshot.launcherPosition) {",
    'persist compact pda state'
)

# Migration/default normalization.
replace_once(
    "    next.ui.waitWarningSeconds = clamp(Number(next.ui.waitWarningSeconds) || DEFAULT_WAIT_WARNING_SECONDS, 60, 900);\n    next.minimized = typeof saved.minimized === 'boolean' ? saved.minimized : !!saved.collapsed;",
    "    next.ui.waitWarningSeconds = clamp(Number(next.ui.waitWarningSeconds) || DEFAULT_WAIT_WARNING_SECONDS, 60, 900);\n    next.ui.hitTempoEnabled = next.ui.hitTempoEnabled === true;\n    next.ui.hitTempoSeconds = clamp(Number(next.ui.hitTempoSeconds) || DEFAULT_HIT_TEMPO_SECONDS, 60, 300);\n    next.minimized = typeof saved.minimized === 'boolean' ? saved.minimized : !!saved.collapsed;\n    next.compact = typeof saved.compact === 'boolean' ? saved.compact : false;",
    'migrate tempo and compact'
)
replace_once(
    "      ui.waitWarning ? 1 : 0,\n      ui.waitWarningSeconds\n    ].join('|');",
    "      ui.waitWarning ? 1 : 0,\n      ui.waitWarningSeconds,\n      ui.hitTempoEnabled ? 1 : 0,\n      ui.hitTempoSeconds\n    ].join('|');",
    'tempo signature'
)

# API settings state save.
replace_once(
    "    const waitElement = document.querySelector('#hkmcq-wait-warning');\n    const waitSecondsElement = document.querySelector('#hkmcq-wait-seconds');",
    "    const waitElement = document.querySelector('#hkmcq-wait-warning');\n    const waitSecondsElement = document.querySelector('#hkmcq-wait-seconds');\n    const tempoElement = document.querySelector('#hkmcq-hit-tempo');\n    const tempoSecondsElement = document.querySelector('#hkmcq-hit-tempo-seconds');",
    'tempo api inputs'
)
replace_once(
    """    if (waitSecondsElement) {
      state.ui.waitWarningSeconds = clamp(Number(waitSecondsElement.value) || DEFAULT_WAIT_WARNING_SECONDS, 60, 900);
    }
""",
    """    if (waitSecondsElement) {
      state.ui.waitWarningSeconds = clamp(Number(waitSecondsElement.value) || DEFAULT_WAIT_WARNING_SECONDS, 60, 900);
    }
    if (tempoElement) state.ui.hitTempoEnabled = !!tempoElement.checked;
    if (tempoSecondsElement) {
      state.ui.hitTempoSeconds = clamp(Number(tempoSecondsElement.value) || DEFAULT_HIT_TEMPO_SECONDS, 60, 300);
    }
""",
    'save tempo settings'
)

# Bulk pending-hit actions.
replace_once(
    """  function ignorePendingHit() {
    const event = state.api.pendingHits.shift();
    if (!event) return;
    updateLedgerAction(event.id, 'ignored');
    state.api.status = `Ignored detected hit #${event.chain} by ${event.attacker}`;
    saveNow();
    refresh({ pending: true, settings: true });
  }

  function desiredPollSeconds(base) {
""",
    """  function ignorePendingHit() {
    const event = state.api.pendingHits.shift();
    if (!event) return;
    updateLedgerAction(event.id, 'ignored');
    state.api.status = `Ignored detected hit #${event.chain} by ${event.attacker}`;
    saveNow();
    refresh({ pending: true, settings: true });
  }

  function recordAllPendingHits() {
    const count = state.api.pendingHits.length;
    if (!count) return;
    if (!confirm(`Record all ${count} pending hits? Unknown players will be added to the queue.`)) return;

    const pending = [...state.api.pendingHits].sort((a, b) =>
      (Number(a.ended) - Number(b.ended)) ||
      (Number(a.chain) - Number(b.chain)) ||
      String(a.id).localeCompare(String(b.id))
    );
    pushHistory(`record all ${count} pending hits`);

    let added = 0;
    for (const event of pending) {
      const index = findParticipantIndex(event.attacker);
      if (index < 0) {
        state.roster.push({ name: event.attacker, status: 'ready', hits: 1 });
        added += 1;
        updateLedgerAction(event.id, 'added-and-recorded');
      } else {
        rotateParticipant(event.attacker, { recordHit: true, saveHistory: false });
        updateLedgerAction(event.id, 'recorded');
      }
    }

    state.api.pendingHits = [];
    state.api.status = `Recorded ${count} pending hit${count === 1 ? '' : 's'}${added ? `; added ${added} new player${added === 1 ? '' : 's'}` : ''}`;
    trackUpTimer();
    saveNow();
    refresh({ roster: true, pending: true, settings: true });
    toast(`Recorded ${count} pending hit${count === 1 ? '' : 's'}.`);
  }

  function ignoreAllPendingHits() {
    const count = state.api.pendingHits.length;
    if (!count) return;
    if (!confirm(`Ignore all ${count} pending hits?`)) return;
    state.api.pendingHits.forEach(event => updateLedgerAction(event.id, 'ignored'));
    state.api.pendingHits = [];
    state.api.status = `Ignored ${count} pending hit${count === 1 ? '' : 's'}`;
    saveNow();
    refresh({ pending: true, settings: true });
    toast(`Ignored ${count} pending hit${count === 1 ? '' : 's'}.`);
  }

  function desiredPollSeconds(base) {
""",
    'bulk pending functions'
)

# CSS for tempo / bulk / compact PDA.
replace_once(
    "      #${PANEL_ID} .waitWarn{margin-top:5px;font-size:10px;color:#d39a36;font-weight:700}\n",
    "      #${PANEL_ID} .waitWarn{margin-top:5px;font-size:10px;color:#d39a36;font-weight:700}\n      #${PANEL_ID} .hitTempo{margin-top:7px;padding:6px 8px;border:1px solid var(--b);border-radius:6px;font-size:11px;font-weight:800;text-align:center}\n      #${PANEL_ID} .hitTempo.hold{color:var(--m)} #${PANEL_ID} .hitTempo.now{border-color:#5ca85c;color:var(--s);background:rgba(92,168,92,.14)}\n",
    'tempo css'
)
replace_once(
    "      #${PANEL_ID} .pendingBtns{display:flex;gap:6px;margin-top:7px} #${PANEL_ID} .pendingBtns button{flex:1}\n",
    "      #${PANEL_ID} .pendingBtns{display:flex;gap:6px;margin-top:7px} #${PANEL_ID} .pendingBtns button{flex:1}\n      #${PANEL_ID} .pendingBulk{display:flex;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(127,127,127,.28)} #${PANEL_ID} .pendingBulk button{flex:1;font-size:10px}\n      #${PANEL_ID} .compactPending{width:100%;margin-top:7px;font-weight:800}\n",
    'bulk css'
)
replace_once(
    "      #${PANEL_ID} .apiStatusBox{margin-top:6px;padding:7px;border:1px solid var(--b);border-radius:6px;font-size:10px;line-height:1.45;color:var(--m)} #${PANEL_ID} .ledger{max-height:250px;overflow:auto;border:1px solid var(--b);border-radius:6px} #${PANEL_ID} .ledgerRow{display:grid;grid-template-columns:58px minmax(0,1fr) auto;gap:6px;padding:6px;border-bottom:1px solid var(--b);font-size:10px} #${PANEL_ID} .ledgerMeta{color:var(--m)}\n",
    "      #${PANEL_ID} .apiStatusBox{margin-top:6px;padding:7px;border:1px solid var(--b);border-radius:6px;font-size:10px;line-height:1.45;color:var(--m)} #${PANEL_ID} .ledger{max-height:250px;overflow:auto;border:1px solid var(--b);border-radius:6px} #${PANEL_ID} .ledgerRow{display:grid;grid-template-columns:58px minmax(0,1fr) auto;gap:6px;padding:6px;border-bottom:1px solid var(--b);font-size:10px} #${PANEL_ID} .ledgerMeta{color:var(--m)}\n      #${PANEL_ID}.compactPanel{width:min(300px,calc(100vw - 12px));font-size:13px} #${PANEL_ID}.compactPanel .compactMain{padding:8px} #${PANEL_ID}.compactPanel .up{padding:8px 6px} #${PANEL_ID}.compactPanel .upName{font-size:19px} #${PANEL_ID}.compactPanel .nextGrid{padding:7px 2px 0}\n",
    'compact css'
)
replace_once(
    "#${PANEL_ID} .upName{font-size:23px}#${LAUNCHER_ID}{min-height:46px;min-width:126px}}",
    "#${PANEL_ID} .upName{font-size:23px}#${PANEL_ID}.compactPanel{width:min(300px,calc(100vw - 8px))!important;font-size:13px}#${PANEL_ID}.compactPanel .upName{font-size:20px}#${LAUNCHER_ID}{min-height:46px;min-width:126px}}",
    'compact mobile css'
)

# Tempo display helpers + bulk pending UI.
replace_once(
    """  function pendingHtml() {
""",
    """  function hitTempoState() {
    if (!state.ui.hitTempoEnabled || state.api.mode === 'manual' || state.api.paused) return null;
    const current = Number(state.api.chainCurrent);
    if (!Number.isFinite(current) || current <= 0) return null;
    if (current < 10) return { kind: 'now', text: 'HIT NOW • BUILD CHAIN' };

    const remaining = remainingChainSeconds();
    if (remaining == null) return null;
    const threshold = clamp(Number(state.ui.hitTempoSeconds) || DEFAULT_HIT_TEMPO_SECONDS, 60, 300);
    if (remaining <= threshold) {
      return { kind: 'now', text: `HIT NOW • ${formatCountdown(remaining)} LEFT` };
    }
    return { kind: 'hold', text: `HOLD • ${formatCountdown(remaining)} LEFT • HIT AT ${formatCountdown(threshold)}` };
  }

  function hitTempoHtml() {
    const tempo = hitTempoState();
    if (!tempo) return '';
    return `<div class=\"hitTempo ${tempo.kind}\">${escapeHtml(tempo.text)}</div>`;
  }

  function compactPendingHtml() {
    const count = state.api.pendingHits.length;
    if (!count) return '';
    return `<button class=\"compactPending\" data-action=\"expand\">⚠ ${count} PENDING HIT${count === 1 ? '' : 'S'} • REVIEW</button>`;
  }

  function pendingHtml() {
""",
    'tempo helpers'
)
replace_once(
    """        <div class="pendingBtns">
          <button data-action="confirmPending" data-add-unknown="${pending.kind === 'unknown' ? '1' : '0'}">${confirmLabel}</button>
          <button data-action="ignorePending">IGNORE</button>
        </div>
      </div>`;
""",
    """        <div class="pendingBtns">
          <button data-action="confirmPending" data-add-unknown="${pending.kind === 'unknown' ? '1' : '0'}">${confirmLabel}</button>
          <button data-action="ignorePending">IGNORE</button>
        </div>
        ${count > 1 ? `<div class="pendingBulk"><button data-action="recordAllPending">ADD / RECORD ALL (${count})</button><button data-action="ignoreAllPending">IGNORE ALL (${count})</button></div>` : ''}
      </div>`;
""",
    'bulk pending buttons'
)

# API settings UI for HIT NOW guidance.
replace_once(
    """        <label class="checkRow full"><input id="hkmcq-wait-warning" type="checkbox" ${state.ui.waitWarning ? 'checked' : ''}>Warn when the same player is UP too long</label>
        <label class="label full">Waiting warning (sec)<input id="hkmcq-wait-seconds" type="number" min="60" max="900" value="${state.ui.waitWarningSeconds}"></label>
""",
    """        <label class="checkRow full"><input id="hkmcq-wait-warning" type="checkbox" ${state.ui.waitWarning ? 'checked' : ''}>Warn when the same player is UP too long</label>
        <label class="label full">Waiting warning (sec)<input id="hkmcq-wait-seconds" type="number" min="60" max="900" value="${state.ui.waitWarningSeconds}"></label>
        <label class="checkRow full"><input id="hkmcq-hit-tempo" type="checkbox" ${state.ui.hitTempoEnabled ? 'checked' : ''}>Show HIT NOW chain-tempo guidance</label>
        <label class="label full">HIT NOW threshold (sec, 60–300)<input id="hkmcq-hit-tempo-seconds" type="number" min="60" max="300" step="15" value="${state.ui.hitTempoSeconds}"></label>
""",
    'tempo settings html'
)

# Replace panel renderer with full + PDA compact variants.
start = text.index('  function renderPanel() {')
end = text.index('\n  function applyPanelPosition(panel) {', start)
old_render = text[start:end]
new_render = '''  function renderPanel() {
    document.getElementById(LAUNCHER_ID)?.remove();
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      document.body.appendChild(panel);
    }
    const ready = readyParticipants();
    const nums = hitNumbers();
    const compact = IS_PDA && state.compact;
    const doneLocked = state.api.mode !== 'manual';
    panel.className = compact ? 'compactPanel' : '';

    if (compact) {
      panel.innerHTML = `
        <div class="head">
          <div class="title">HKs Merc-C-Que<div class="sub">COMPACT • v${VERSION}</div></div>
          <button class="icon" data-action="expand" title="Open full Merc-C-Que">□</button>
          <button class="icon" data-action="minimize" title="Minimize Merc-C-Que">—</button>
        </div>
        <div class="compactMain">
          <div class="up">
            <div class="kicker">UP NOW</div>
            <div class="upLine"><span id="hkmcq-up-name" class="upName">${escapeHtml(ready[0]?.name || 'No READY participant')}</span><span id="hkmcq-hit-badge" class="hitBadge">• HIT #${nums.hit}</span></div>
            <div id="hkmcq-tempo-slot">${hitTempoHtml()}</div>
            <div id="hkmcq-wait-slot">${waitWarningHtml()}</div>
          </div>
          <div class="nextGrid">
            <div class="label">NEXT</div><div class="nextPerson"><span id="hkmcq-next-name">${escapeHtml(ready[1]?.name || '—')}</span><span id="hkmcq-next-hit" class="queueHit">HIT #${nums.nextHit}</span></div>
            <div class="label">ON DECK</div><div class="nextPerson"><span id="hkmcq-ondeck-name">${escapeHtml(ready[2]?.name || '—')}</span><span id="hkmcq-ondeck-hit" class="queueHit">HIT #${nums.onDeckHit}</span></div>
          </div>
          <div id="hkmcq-pending-slot">${compactPendingHtml()}</div>
          <div id="hkmcq-api-strip-slot">${apiStripHtml()}</div>
        </div>`;
    } else {
      panel.innerHTML = `
        <div class="head">
          <div class="title">HKs Merc-C-Que<div class="sub">Chain Queue Organizer • v${VERSION} • ${IS_PDA ? 'PDA' : 'Desktop'}</div></div>
          <button class="icon" data-action="setup" title="Roster / message / API setup">⚙</button>
          ${IS_PDA ? '<button class="icon" data-action="compact" title="Compact PDA view">▣</button>' : ''}
          <button class="icon" data-action="minimize" title="Minimize Merc-C-Que">—</button>
        </div>
        <div class="main">
          <div class="up">
            <div class="kicker">UP NOW</div>
            <div class="upLine"><span id="hkmcq-up-name" class="upName">${escapeHtml(ready[0]?.name || 'No READY participant')}</span><span id="hkmcq-hit-badge" class="hitBadge">• HIT #${nums.hit}</span></div>
            <div id="hkmcq-tempo-slot">${hitTempoHtml()}</div>
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
    }
    applyPanelPosition(panel);
    bindPanel(panel);
    requestAnimationFrame(adjustPanelViewport);
  }
'''
text = text[:start] + new_render + text[end:]

# Targeted refreshes for tempo + compact pending indicator.
replace_once(
    "    setHtml(panel.querySelector('#hkmcq-api-strip-slot'), apiStripHtml());\n    setHtml(panel.querySelector('#hkmcq-pending-slot'), pendingHtml());\n    setHtml(panel.querySelector('#hkmcq-wait-slot'), waitWarningHtml());",
    "    setHtml(panel.querySelector('#hkmcq-api-strip-slot'), apiStripHtml());\n    setHtml(panel.querySelector('#hkmcq-pending-slot'), IS_PDA && state.compact ? compactPendingHtml() : pendingHtml());\n    setHtml(panel.querySelector('#hkmcq-tempo-slot'), hitTempoHtml());\n    setHtml(panel.querySelector('#hkmcq-wait-slot'), waitWarningHtml());",
    'refresh tempo compact pending'
)
replace_once(
    "    if (clock) clock.textContent = formatCountdown(remaining);\n    setHtml(panel.querySelector('#hkmcq-wait-slot'), waitWarningHtml());",
    "    if (clock) clock.textContent = formatCountdown(remaining);\n    setHtml(panel.querySelector('#hkmcq-tempo-slot'), hitTempoHtml());\n    setHtml(panel.querySelector('#hkmcq-wait-slot'), waitWarningHtml());",
    'live tempo refresh'
)

# Click handlers for bulk + compact/full.
replace_once(
    "      case 'confirmPending': confirmPendingHit(element.dataset.addUnknown === '1'); break;\n      case 'ignorePending': ignorePendingHit(); break;\n      case 'minimize': minimizeApp(); break;",
    "      case 'confirmPending': confirmPendingHit(element.dataset.addUnknown === '1'); break;\n      case 'ignorePending': ignorePendingHit(); break;\n      case 'recordAllPending': recordAllPendingHits(); break;\n      case 'ignoreAllPending': ignoreAllPendingHits(); break;\n      case 'compact':\n        if (IS_PDA) { state.compact = true; saveLocalNow(); renderApp(); }\n        break;\n      case 'expand':\n        state.compact = false; saveLocalNow(); renderApp();\n        break;\n      case 'minimize': minimizeApp(); break;",
    'panel bulk compact actions'
)

path.write_text(text, encoding='utf-8')
