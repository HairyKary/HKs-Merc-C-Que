(() => {
  'use strict';

  const LOCAL_STATE_KEY = 'hksMercCQue_v2';
  const GM_UI_KEY = 'hksMercCQue_desktopUi_v255';

  function normalizePosition(value) {
    if (!value) return null;
    const left = Number(value.left);
    const top = Number(value.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    return { left: Math.round(left), top: Math.round(top) };
  }

  function readLocalState() {
    try {
      const raw = localStorage.getItem(LOCAL_STATE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function writeLocalState(state) {
    try {
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('[Merc-C-Que] Desktop UI preload failed:', error);
    }
  }

  function readSavedUi() {
    try {
      if (typeof GM_getValue !== 'function') return null;
      const value = GM_getValue(GM_UI_KEY, null);
      if (!value) return null;
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return null;
    }
  }

  function preloadUiState() {
    const saved = readSavedUi();
    if (!saved) return;

    const state = readLocalState();
    if (typeof saved.minimized === 'boolean') state.minimized = saved.minimized;

    const panelPosition = normalizePosition(saved.position);
    const launcherPosition = normalizePosition(saved.launcherPosition);
    if (panelPosition) state.position = panelPosition;
    if (launcherPosition) state.launcherPosition = launcherPosition;

    writeLocalState(state);
  }

  function syncUiStateToGm() {
    try {
      if (typeof GM_setValue !== 'function') return;
      const state = readLocalState();
      GM_setValue(GM_UI_KEY, {
        minimized: state.minimized === true,
        position: normalizePosition(state.position),
        launcherPosition: normalizePosition(state.launcherPosition)
      });
    } catch (error) {
      console.warn('[Merc-C-Que] Desktop UI state sync failed:', error);
    }
  }

  preloadUiState();
  globalThis.__HKMCQ_SYNC_DESKTOP_UI__ = syncUiStateToGm;
})();
