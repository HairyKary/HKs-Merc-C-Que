# Changelog

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

## [2.5.11] - Release

### Chain clock / safety
- Added a conservative 3-second safety buffer so Merc-C-Que warns slightly earlier than Torn's displayed chain deadline
- Calibrated the live countdown against Torn server time and aligned local countdown updates to calibrated second boundaries
- Added a local fallback path if Torn clock calibration is unavailable
- Preserved neutral danger/critical alerts during hits 1-9

### Chain reset behavior
- Fixed Auto/Assisted hit numbering remaining stuck on a previous short or broken chain
- When Torn reports no active chain, Merc-C-Que now clears stale chain state and returns the next assigned hit to HIT #1
- Backward-count protection is limited to established 10+ chains so a new warm-up can begin normally

### Torn PDA / UI polish
- Added a temporary PDA-only × control on the minimized launcher to hide Merc-C-Que for the current session
- Session-close state survives Torn page navigation within the same PDA/webview session
- Batched drag movement with requestAnimationFrame for smoother touch/mouse dragging
- Reduced unnecessary minimized-launcher DOM rebuilding and hidden UI refresh work

### Validation
- JavaScript syntax/verification checks passed during development
- Broken-chain reset behavior was confirmed during several live short-chain tests before release

## [2.5.10] - Release

### Chain warm-up alerts
- Chain danger/critical alerts now remain neutral during Torn's pre-chain warm-up (hits 1-9)
- The live danger/critical countdown now activates only once the chain is established at hit 10 or higher
- Preserved the existing 60-second danger and 30-second critical behavior for established chains

### Refactoring / performance
- Centralized chain urgency handling so the panel and minimized launcher use the same alert decision
- Reduced redundant DOM writes by caching unchanged generated markup
- Consolidated API error creation, backoff checks, polling resets, and API-watch resets into shared helpers
- Reused calculated attack IDs during attack-feed processing
- Consolidated repeated roster rotation/save/refresh logic and improved roster-name de-duplication

### Validation
- Confirmed the v2.5.10 warm-up behavior and normal Merc-C-Que operation on desktop/Tampermonkey
- Confirmed the same v2.5.10 build on Torn PDA

## [2.5.9] - Hotfix

### Chain alerts
- Fixed inactive/neutral chains being treated as if the chain timer had reached zero
- Danger/critical pulse, sound, and warning states now require an active chain with a positive timeout
- Inactive chains now remain neutral and show no live chain countdown

## [2.5.8] - Release

### Desktop + Torn PDA
- Unified Desktop/Tampermonkey and Torn PDA into one userscript
- Added Torn PDA native `PDA_httpGet` transport support
- Added Torn PDA injected API-key support with corrected placeholder detection
- Added Torn PDA persistent minimized state, panel position, and launcher position using native PDA storage
- Added touch/pointer-friendly dragging and responsive mobile layout

### Reliability
- Fixed startup-order bugs in `clone()`, `clamp()`, and `nowUnix()` that could cause saved state to fall back to defaults after Torn navigation
- Preserved minimized/open state and UI positions across Torn screen changes
- Added resume/focus reconciliation after tab or Torn PDA suspension
- Retained processed attack IDs across chain changes to reduce duplicate/missed attack handling
- Increased attack-feed lookback to 100 results
- Added retry/backoff for temporary API/network failures
- Separated API/network failures from internal Merc-C-Que processing errors

### Performance
- Added adaptive polling: faster near chain danger, slower while hidden/inactive
- Reduced unnecessary `saveNow()` calls during unchanged API polls
- Added change-aware chain snapshots so no-op chain polls avoid full state serialization and storage writes
- Avoided unnecessary PDA-native storage writes during no-op polling

### Chain awareness / alerts
- Added live chain countdown
- Added 60-second danger and 30-second critical states
- Added optional one-time sound alerts
- Added optional warning when the same player remains UP too long
- Improved minimized launcher to show current player, hit number, and chain clock

### Release housekeeping
- Restored stable userscript name/namespace
- Restored GitHub `@updateURL` / `@downloadURL` metadata
- Confirmed v2.5.7 unified build on desktop and Torn PDA before release

## [2.4.0] - Beta

### Architecture / performance
- Reworked most routine UI updates so Merc-C-Que no longer rebuilds the entire panel for every queue or API change
- Added event delegation so panel buttons and roster controls use shared listeners instead of being rebound after each update
- Added a centralized saved-state schema version (`schemaVersion: 4`) with migration from older saved data
- Added debounced saving for the editable chat-message template
- Increased internal queue-history and processed-event limits for longer sessions

### Queue / undo
- Expanded local queue history to include roster hit counts and event-ledger state
- Improved Undo for API-driven queue changes
- Auto-mode Undo now reverses Merc-C-Que's local queue advancement without rolling back the real Torn chain state
- Processed attack IDs remain processed after Undo so the same Torn hit is not automatically applied a second time

### Event ledger / diagnostics
- Added an internal event ledger for manual hits, detected API hits, Auto recordings, Assisted confirmations, ignored hits, and undone events
- Added **Settings → HISTORY** with a readable recent-event list
- Added **COPY DEBUG SNAPSHOT** for easier beta troubleshooting
- Debug snapshots include Merc-C-Que queue/API state but do not include the saved API key
- Added **CLEAR HISTORY**

### Interface
- Reorganized setup into compact **ROSTER / MESSAGE / API / HISTORY** tabs
- Minimized launcher now shows the next assigned hit number, such as `MCQ #427`
- Added launcher status dot for API active, paused, and pending-attention states
- Preserved the pending-hit badge on the minimized launcher
- Kept the draggable launcher position and draggable full-panel position persistent across refreshes
- Full panel remains vertically scrollable with a sticky header

### Existing behavior preserved
- Manual / Assisted / Auto modes
- READY / AFK queue handling
- Drag-to-reorder roster
- DONE / SKIP / UNDO
- Out-of-order and unqueued-hit confirmations
- Chain synchronization and stale-response protection
- Custom chat-message placeholders
- Dark/light friendly styling

## [2.2.0] - Beta

### Added
- Minimize Merc-C-Que to a compact MCQ launcher
- Draggable minimized launcher with remembered screen position
- Pending-hit badge on the minimized launcher

### Changed
- Replaced the old collapsed panel behavior with true minimize / restore behavior
- Default minimized position avoids Torn's bottom-right chat area

## [2.1.1] - Beta

### Added
- Scrollable Merc-C-Que panel
- Sticky header while scrolling
- Manual, Assisted, and Auto API modes
- Faction attack monitoring
- Live chain synchronization
- Out-of-order hit detection
- Unknown/unqueued hitter detection
- API connection test
- Configurable polling intervals
- Hit number beside queued player names
- Per-player completed hit totals
- Customizable faction-chat readout

### Changed
- Simplified player status to READY / AFK
- Removed OUT status
- Replaced CHAIN label with HIT where referring to assigned hit number
- API mode protects manual DONE action from accidental double advancement

### Existing
- Drag-and-drop queue ordering
- Skip
- Undo
- Local persistence
- Movable panel
- Dark/light friendly styling
