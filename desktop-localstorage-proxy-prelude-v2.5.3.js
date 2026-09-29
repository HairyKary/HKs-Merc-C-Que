(() => {
  'use strict';

  const STATE_KEY = 'hksMercCQue_v2';
  const GM_STATE_KEY = 'hksMercCQue_desktopProxyState_v253';

  if (typeof GM_getValue !== 'function' || typeof GM_setValue !== 'function') {
    console.warn('[Merc-C-Que] GM storage unavailable; desktop proxy state bridge not installed.');
    return;
  }

  const nativeStorage = globalThis.localStorage;
  if (!nativeStorage) {
    console.warn('[Merc-C-Que] localStorage unavailable; desktop proxy state bridge not installed.');
    return;
  }

  function validState(raw) {
    if (typeof raw !== 'string' || !raw) return false;
    try {
      const parsed = JSON.parse(raw);
      return !!parsed && typeof parsed === 'object';
    } catch {
      return false;
    }
  }

  try {
    const gmRaw = GM_getValue(GM_STATE_KEY, '');
    const localRaw = nativeStorage.getItem(STATE_KEY) || '';
    if (!validState(gmRaw) && validState(localRaw)) {
      GM_setValue(GM_STATE_KEY, localRaw);
      console.info('[Merc-C-Que] Seeded v2.5.3 proxy state from existing Torn storage.');
    }
  } catch (error) {
    console.warn('[Merc-C-Que] Could not seed proxy state:', error);
  }

  const proxy = new Proxy(nativeStorage, {
    get(target, prop) {
      if (prop === 'getItem') {
        return key => {
          if (String(key) === STATE_KEY) {
            try {
              const gmRaw = GM_getValue(GM_STATE_KEY, '');
              if (validState(gmRaw)) return gmRaw;
            } catch (error) {
              console.warn('[Merc-C-Que] Proxy state read failed:', error);
            }
          }
          return target.getItem(key);
        };
      }

      if (prop === 'setItem') {
        return (key, value) => {
          const text = String(value);
          if (String(key) === STATE_KEY) {
            try {
              if (validState(text)) GM_setValue(GM_STATE_KEY, text);
            } catch (error) {
              console.warn('[Merc-C-Que] Proxy state save failed:', error);
            }
          }
          return target.setItem(key, value);
        };
      }

      if (prop === 'removeItem') {
        return key => {
          if (String(key) === STATE_KEY) {
            try { GM_setValue(GM_STATE_KEY, ''); } catch {}
          }
          return target.removeItem(key);
        };
      }

      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });

  let installed = false;
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      enumerable: true,
      value: proxy
    });
    installed = globalThis.localStorage === proxy;
  } catch (error) {
    console.warn('[Merc-C-Que] Could not define proxied localStorage:', error);
  }

  if (!installed) {
    try {
      globalThis.localStorage = proxy;
      installed = globalThis.localStorage === proxy;
    } catch (error) {
      console.warn('[Merc-C-Que] Could not assign proxied localStorage:', error);
    }
  }

  console.info(`[Merc-C-Que] v2.5.3 desktop localStorage proxy ${installed ? 'active' : 'FAILED'}.`);
})();
