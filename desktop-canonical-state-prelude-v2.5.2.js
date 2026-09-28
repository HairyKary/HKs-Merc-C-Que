(() => {
  'use strict';

  const STATE_KEY = 'hksMercCQue_v2';
  const GM_STATE_KEY = 'hksMercCQue_desktopCanonicalState_v252';

  if (typeof GM_getValue !== 'function' || typeof GM_setValue !== 'function') return;

  const storageProto = Storage.prototype;
  const originalGetItem = storageProto.getItem;
  const originalSetItem = storageProto.setItem;
  const originalRemoveItem = storageProto.removeItem;

  function isStateKey(storage, key) {
    return storage === localStorage && String(key) === STATE_KEY;
  }

  function validState(raw) {
    if (typeof raw !== 'string' || !raw) return false;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object';
    } catch {
      return false;
    }
  }

  try {
    const gmRaw = GM_getValue(GM_STATE_KEY, '');
    const localRaw = originalGetItem.call(localStorage, STATE_KEY) || '';

    if (!validState(gmRaw) && validState(localRaw)) {
      GM_setValue(GM_STATE_KEY, localRaw);
      console.info('[Merc-C-Que] Seeded canonical desktop state from existing Torn storage.');
    }
  } catch (error) {
    console.warn('[Merc-C-Que] Could not seed canonical desktop state:', error);
  }

  storageProto.getItem = function(key) {
    if (isStateKey(this, key)) {
      try {
        const gmRaw = GM_getValue(GM_STATE_KEY, '');
        if (validState(gmRaw)) return gmRaw;
      } catch (error) {
        console.warn('[Merc-C-Que] Canonical desktop state read failed:', error);
      }
    }
    return originalGetItem.call(this, key);
  };

  storageProto.setItem = function(key, value) {
    if (isStateKey(this, key)) {
      const text = String(value);
      try {
        if (validState(text)) GM_setValue(GM_STATE_KEY, text);
      } catch (error) {
        console.warn('[Merc-C-Que] Canonical desktop state save failed:', error);
      }
    }
    return originalSetItem.call(this, key, value);
  };

  storageProto.removeItem = function(key) {
    if (isStateKey(this, key)) {
      try { GM_setValue(GM_STATE_KEY, ''); } catch {}
    }
    return originalRemoveItem.call(this, key);
  };

  console.info('[Merc-C-Que] Canonical desktop state bridge active.');
})();
