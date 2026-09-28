# Changelog

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
- Scrollable Merc-C-QUE panel
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
- Collapsible/movable panel
- Dark/light friendly styling
