from pathlib import Path

path = Path('HKs-Merc-C-Que.user.js')
text = path.read_text(encoding='utf-8')

old = '''  function apiControlsSignature(api = state.api, ui = state.ui) {
    return [
      api.mode,
      api.attackPollSeconds,
      api.chainPollSeconds,
      api.paused ? 1 : 0,
      ui.soundAlerts ? 1 : 0,
      ui.waitWarning ? 1 : 0,
      ui.waitWarningSeconds
    ].join('|');
  }
'''

new = '''  function apiControlsSignature(api = state.api, ui = state.ui) {
    return [
      api.mode,
      api.attackPollSeconds,
      api.chainPollSeconds,
      api.paused ? 1 : 0,
      api.lastError || '',
      api.backoffUntil || 0,
      api.reconciliationNote || '',
      ui.soundAlerts ? 1 : 0,
      ui.waitWarning ? 1 : 0,
      ui.waitWarningSeconds
    ].join('|');
  }
'''

count = text.count(old)
if count != 1:
    raise SystemExit(f'api diagnostics signature: expected 1 match, found {count}')

path.write_text(text.replace(old, new, 1), encoding='utf-8')
