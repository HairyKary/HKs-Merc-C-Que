(() => {
  'use strict';

  const LAUNCHER_ID = 'hkmcq-launcher';
  const DRAG_THRESHOLD = 3;
  const SUPPRESS_MS = 2000;

  let drag = null;
  let suppressUntil = 0;

  function launcherFrom(target) {
    try {
      return target?.closest?.(`#${LAUNCHER_ID}`) || null;
    } catch {
      return null;
    }
  }

  document.addEventListener('pointerdown', event => {
    const launcher = launcherFrom(event.target);
    if (!launcher) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
  }, true);

  document.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (
      Math.abs(event.clientX - drag.startX) > DRAG_THRESHOLD ||
      Math.abs(event.clientY - drag.startY) > DRAG_THRESHOLD
    ) {
      drag.moved = true;
    }
  }, true);

  document.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.moved) suppressUntil = Date.now() + SUPPRESS_MS;
    drag = null;
  }, true);

  document.addEventListener('pointercancel', event => {
    if (drag && event.pointerId === drag.pointerId) drag = null;
  }, true);

  const originalAddEventListener = EventTarget.prototype.addEventListener;
  globalThis.__HKMCQ_ORIGINAL_ADD_EVENT_LISTENER__ = originalAddEventListener;

  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (type === 'click' && this?.id === LAUNCHER_ID && listener) {
      const wrapped = function(event) {
        if (Date.now() < suppressUntil) {
          suppressUntil = 0;
          event.preventDefault();
          event.stopImmediatePropagation();
          console.info('[Merc-C-Que] Same-context guard suppressed launcher restore after drag.');
          return;
        }
        if (typeof listener === 'function') return listener.call(this, event);
        return listener.handleEvent?.call(listener, event);
      };
      return originalAddEventListener.call(this, type, wrapped, options);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };
})();
