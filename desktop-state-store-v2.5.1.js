(() => {
  'use strict';

  const LOCAL_STATE_KEY = 'hksMercCQue_v2';
  const GM_STATE_KEY = 'hksMercCQue_desktopState_v251';

  try {
    if (typeof GM_getValue === 'function') {
      const saved = GM_getValue(GM_STATE_KEY, '');
      if (typeof saved === 'string' && saved) {
        localStorage.setItem(LOCAL_STATE_KEY, saved);
      }
    }
  } catch (error) {
    console.warn('[Merc-C-Que] Desktop state preload failed:', error);
  }

  globalThis.__HKMCQ_DESKTOP_STATE_SYNC__ = () => {
    try {
      if (typeof GM_setValue !== 'function') return;
      const current = localStorage.getItem(LOCAL_STATE_KEY) || '';
      if (current) GM_setValue(GM_STATE_KEY, current);
    } catch (error) {
      console.warn('[Merc-C-Que] Desktop state sync failed:', error);
    }
  };
})();
