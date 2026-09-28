# HKs Merc-C-Que Beta Testing Checklist

## Environment

- Merc-C-Que version:
- Browser:
- Userscript manager:
- Desktop resolution / scaling:
- API mode tested: Manual / Assisted / Auto

## Basic Queue

- [ ] Add several Torn usernames
- [ ] Save roster
- [ ] Reorder users by dragging
- [ ] Toggle READY -> AFK
- [ ] Toggle AFK -> READY
- [ ] Remove a user with X
- [ ] Refresh Torn and confirm the queue is preserved
- [ ] Move the floating panel
- [ ] Panel remains on-screen after resizing the browser

## Minimize / Launcher

- [ ] Minimize the panel with the — button
- [ ] Launcher shows `MCQ #<next hit>`
- [ ] Drag the MCQ launcher to a new screen position
- [ ] Click MCQ to restore the panel
- [ ] Refresh while minimized and confirm launcher position is preserved
- [ ] API-active launcher status indicator appears when automation is running
- [ ] Paused indicator appears if API automation pauses
- [ ] Pending-attention indicator / badge appears when a hit needs confirmation
- [ ] Minimized launcher does not interfere with Torn chat after being positioned

## Settings Tabs

- [ ] Open the gear/settings panel
- [ ] ROSTER tab opens and saves roster changes
- [ ] MESSAGE tab opens and saves the custom template
- [ ] API tab opens and preserves API settings
- [ ] HISTORY tab opens and shows recent Merc-C-Que events
- [ ] Switching tabs does not change queue order or hit numbers
- [ ] Panel remains scrollable when settings are taller than the viewport

## Manual Mode

- [ ] Set a starting hit number
- [ ] Press DONE
- [ ] Current player moves to the bottom
- [ ] Hit number increases correctly
- [ ] Player hit total increases exactly once
- [ ] Manual hit appears in HISTORY
- [ ] Press SKIP
- [ ] Skipped player moves without recording a hit
- [ ] Press UNDO and verify previous queue state returns

## Assisted Mode

- [ ] API test succeeds
- [ ] A new chain hit is detected
- [ ] Expected hitter generates a confirmation prompt
- [ ] Confirming advances the correct player
- [ ] Confirmed hit appears in HISTORY
- [ ] Ignoring does not alter the queue
- [ ] Ignored hit appears in HISTORY as ignored
- [ ] Out-of-order hit identifies the correct hitter
- [ ] AFK player remains excluded from active rotation
- [ ] Unknown hitter can be added and recorded only after confirmation

## Auto Mode

- [ ] Expected UP NOW player advances automatically
- [ ] Player hit total increases exactly once
- [ ] Auto-recorded hit appears in HISTORY
- [ ] No duplicate advancement occurs on later API polls
- [ ] Out-of-order hit does not silently rearrange the queue
- [ ] Unknown/unqueued hitter produces a warning
- [ ] Chain/hit numbering remains synchronized

## Auto Undo Regression Test

This is an important v2.4 test.

1. Put the script in Auto mode.
2. Record the current UP NOW player and their completed-hit count.
3. Let that player make a valid chain hit.
4. Confirm Merc-C-Que rotates them automatically and increments their local hit count.
5. Press UNDO.

Verify:

- [ ] Queue order returns to the state immediately before the Auto rotation
- [ ] Player completed-hit count returns to the previous value
- [ ] Actual Torn chain number does **not** roll backward
- [ ] The attack is not automatically applied again on the next API poll
- [ ] HISTORY shows the event as undone

## Event History / Diagnostics

- [ ] HISTORY shows recent manual and API events newest-first
- [ ] Auto events identify Auto behavior
- [ ] Assisted confirmations identify recorded behavior
- [ ] Ignored hits identify ignored behavior
- [ ] Undone API queue changes identify undone behavior
- [ ] COPY DEBUG SNAPSHOT copies valid readable JSON
- [ ] Debug snapshot includes queue, mode, chain, pending hits, and recent history
- [ ] Debug snapshot does **not** contain the saved Torn API key
- [ ] CLEAR HISTORY removes only diagnostic history and does not erase the roster

## Chat Readout

- [ ] Message preview updates when queue changes
- [ ] Message preview updates when manual hit number changes
- [ ] COPY MESSAGE works
- [ ] Custom template saves after typing
- [ ] Template remains after page refresh
- [ ] `{current}` works
- [ ] `{hit}` works
- [ ] `{next}` / `{next_hit}` work
- [ ] `{ondeck}` / `{ondeck_hit}` work

## Persistence / Migration

- [ ] Existing v2.2 roster survives upgrade to v2.4
- [ ] Existing READY / AFK states survive upgrade
- [ ] Existing saved panel position survives upgrade
- [ ] Existing launcher position survives upgrade
- [ ] Existing API mode/settings survive upgrade
- [ ] Refresh does not duplicate players or reset hit counts

## Interface

- [ ] Header remains accessible while the panel scrolls
- [ ] Dark mode is readable
- [ ] Light mode is readable
- [ ] No important buttons are cut off
- [ ] Roster drag/drop still works after API or settings updates
- [ ] Clicking controls does not unexpectedly jump panel scroll position

## Bug Report Notes

Capture:
1. What you were doing.
2. Who was UP NOW.
3. Current Torn chain number.
4. Merc-C-Que mode.
5. What Merc-C-Que displayed.
6. What happened after the hit.
7. Whether refreshing fixed it.
8. A debug snapshot from **Settings → HISTORY → COPY DEBUG SNAPSHOT**, when useful.

Never include your API key.