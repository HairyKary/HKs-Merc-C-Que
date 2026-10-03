from pathlib import Path
p = Path('HKs-Merc-C-Que.user.js')
s = p.read_text(encoding='utf-8')
old = """        Status: ${escapeHtml(state.api.status || '—')}
        ${state.api.lastError ? `<br><span style=\"color:#c66\">${escapeHtml(state.api.lastError)}</span>` : ''}<br>
        Current chain: ${state.api.chainCurrent ?? '—'} | Next hit: ${nextHitNumber()}<br>"""
new = """        Status: ${escapeHtml(state.api.status || '—')}
        ${state.api.lastError ? `<br><span style=\"color:#c66\">${escapeHtml(state.api.lastError)}</span>` : ''}<br>
        Tab API role: <strong>${tabApiRole()}</strong><br>
        Current chain: ${state.api.chainCurrent ?? '—'} | Next hit: ${nextHitNumber()}<br>"""
count = s.count(old)
if count != 1:
    raise SystemExit(f'expected one role display anchor, found {count}')
p.write_text(s.replace(old, new, 1), encoding='utf-8')
