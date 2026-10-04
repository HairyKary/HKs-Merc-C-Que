from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

# Userscript release prep.
script_path = Path('HKs-Merc-C-Que.user.js')
script = script_path.read_text(encoding='utf-8')
script = replace_once(script, '  const MAX_PENDING = 50;', '  const MAX_PENDING = 200;', 'pending cap')
branch_url = 'https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/v2.5.13-pda-tempo-bulk/HKs-Merc-C-Que.user.js'
main_url = 'https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/main/HKs-Merc-C-Que.user.js'
if script.count(branch_url) != 2:
    raise SystemExit(f'release URLs: expected 2 branch URLs, found {script.count(branch_url)}')
script = script.replace(branch_url, main_url)
script_path.write_text(script, encoding='utf-8')

# README release status/features.
readme_path = Path('README.md')
readme = readme_path.read_text(encoding='utf-8')
readme = replace_once(readme, '> **Current version:** v2.5.11  ', '> **Current version:** v2.5.13', 'README version')
feature_anchor = '- Smoother drag handling and lighter minimized-launcher updates\n- Optional warning when the same player remains UP too long\n'
feature_replacement = '''- Smoother drag handling and lighter minimized-launcher updates
- Multi-tab synchronization with one elected API leader tab and fast shared queue/chain state
- Compact Torn PDA view for UP / NEXT / ON DECK / chain status
- Optional configurable HIT NOW chain-tempo guidance
- Bulk **ADD / RECORD ALL** and **IGNORE ALL** actions for pending-hit backlogs
- Pending-hit queue capacity increased to 200 events
- Optional warning when the same player remains UP too long
'''
readme = replace_once(readme, feature_anchor, feature_replacement, 'README feature block')
reliability_anchor = '- Automatic reset to HIT #1 when Torn reports no active chain\n'
reliability_replacement = '''- Automatic reset to HIT #1 when Torn reports no active chain
- Multi-tab API leader election so only one active Torn tab performs routine API polling
- BroadcastChannel synchronization with local-storage fallback for queue and chain state across tabs
'''
readme = replace_once(readme, reliability_anchor, reliability_replacement, 'README reliability block')
readme_path.write_text(readme, encoding='utf-8')

# Changelog release entry.
changelog_path = Path('CHANGELOG.md')
changelog = changelog_path.read_text(encoding='utf-8')
release_entry = '''# Changelog

## [2.5.13] - Release

### Multi-tab war synchronization
- Added same-browser multi-tab state synchronization for queue, chain, pending-hit, roster, and API status data
- Added API leader election so only one active Torn tab performs routine polling while follower tabs receive shared updates
- Visible tabs can take leadership from hidden/background tabs, with automatic handoff if the leader closes or becomes unavailable
- Reduced redundant shared-state serialization, DOM refreshes, and UI-only broadcasts after live multi-tab testing

### Torn PDA / chain control
- Added an optional compact PDA view showing UP NOW, NEXT, ON DECK, chain status, pending-hit attention, and tempo guidance
- Compact/full PDA mode is stored locally on the PDA and does not force the same layout onto desktop tabs
- Added optional configurable HIT NOW guidance with a 60-300 second threshold; default is 120 seconds and the feature is off by default
- Warm-up hits 1-9 show HIT NOW / BUILD CHAIN when tempo guidance is enabled

### Pending-hit backlog tools
- Added **ADD / RECORD ALL** to process pending hits oldest-to-newest while preserving individual ledger entries
- Added **IGNORE ALL** to clear a pending backlog while marking the existing ledger entries ignored
- Unknown players encountered by bulk recording are added to the roster only once
- Increased the pending-hit queue capacity from 50 to 200 events for unattended war backlogs

### Validation
- Multi-tab synchronization tested across several Torn tabs and screens
- Desktop and Torn PDA changes tested during multiple live chains, including a chain to 100
- Bulk IGNORE ALL and ADD / RECORD ALL tested repeatedly with large pending-hit backlogs
- JavaScript syntax and diff checks passed during release preparation

'''
if not changelog.startswith('# Changelog\n\n'):
    raise SystemExit('CHANGELOG header not found')
changelog = release_entry + changelog[len('# Changelog\n\n'):]
changelog_path.write_text(changelog, encoding='utf-8')

# Release metadata note.
metadata_path = Path('USERSCRIPT-METADATA.txt')
metadata = metadata_path.read_text(encoding='utf-8')
metadata = replace_once(metadata, 'Current release: v2.5.8', 'Current release: v2.5.13', 'metadata current release')
metadata_path.write_text(metadata, encoding='utf-8')
