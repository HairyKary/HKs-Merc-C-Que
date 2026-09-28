(() => {
  'use strict';

  const STATE_KEY = 'hksMercCQue_v2';
  const MINIMIZED_KEY = 'desktop_ui_minimized_v2511';
  const PANEL_POSITION_KEY = 'desktop_ui_panel_position_v2511';
  const LAUNCHER_POSITION_KEY = 'desktop_ui_launcher_position_v2511';

  function readStored(key, fallback = null) {
    try {
      return typeof GM_getValue === 'function' ? GM_getValue(key, fallback) : fallback;
    } catch {
      return fallback;
    }
  }

  function normalizePosition(value) {
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

  try {
    let state = {};
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) state = JSON.parse(raw) || {};
    } catch {}

    const minimized = readStored(MINIMIZED_KEY, null);
    const panelPosition = normalizePosition(readStored(PANEL_POSITION_KEY, null));
    const launcherPosition = normalizePosition(readStored(LAUNCHER_POSITION_KEY, null));

    if (typeof minimized === 'boolean') state.minimized = minimized;
    if (panelPosition) state.position = panelPosition;
    if (launcherPosition) state.launcherPosition = launcherPosition;

    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    console.info('[Merc-C-Que] v2.5.11 UI state preloaded:', {
      minimized: typeof minimized === 'boolean' ? minimized : 'unset',
      panelPosition,
      launcherPosition
    });
  } catch (error) {
    console.warn('[Merc-C-Que] v2.5.11 desktop state preload failed:', error);
  }
})();
