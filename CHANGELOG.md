# Changelog

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