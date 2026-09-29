# HKs Merc-C-Que Regression Testing Checklist

## Environment

- Merc-C-Que version:
- Platform: Desktop / Torn PDA
- Browser / Torn PDA version:
- Userscript manager (desktop):
- Desktop resolution / scaling (if applicable):
- API mode tested: Manual / Assisted / Auto

## Basic Queue

- [ ] Add several Torn usernames
- [ ] Save roster
- [ ] Reorder users by dragging
- [ ] Toggle READY -> AFK
- [ ] Toggle AFK -> READY
- [ ] Remove a user with X
- [ ] Change Torn screens and confirm the queue is preserved
- [ ] Move the floating panel
- [ ] Panel remains on-screen after resizing/orientation changes

## Minimize / Launcher

- [ ] Minimize the panel with the — button
- [ ] Launcher shows current player / next hit information
- [ ] Drag the launcher to a new screen position
- [ ] Click launcher to restore the panel
- [ ] Change Torn screens while minimized and confirm minimized state is preserved
- [ ] Launcher position is preserved across Torn navigation
- [ ] Restored panel returns to its saved position
- [ ] API-active launcher status indicator appears when automation is running
- [ ] Paused indicator appears if API automation pauses
- [ ] Pending-attention indicator / badge appears when a hit needs confirmation

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

## Desktop Persistence

- [ ] Full panel position survives Torn page changes
- [ ] Minimized/open state survives Torn page changes
- [ ] Launcher position survives Torn page changes
- [ ] Roster/settings survive Torn page changes
- [ ] Startup does not fall back to default state when saved data exists

## Torn PDA

- [ ] Header/API area identifies the platform as Torn PDA
- [ ] Panel position persists across Torn PDA screen changes
- [ ] Minimized/open state persists across Torn PDA screen changes
- [ ] Launcher position persists across Torn PDA screen changes
- [ ] Restored panel position persists
- [ ] Roster/settings persist
- [ ] TEST API succeeds using the Torn PDA injected API key
- [ ] Assisted mode works
- [ ] Auto mode works
- [ ] Resume after app/background suspension reconciles without duplicate advancement

## API Resilience / Performance

- [ ] Temporary API/network failure enters retry/backoff state
- [ ] Recovery clears the error state
- [ ] Internal processing errors are not mislabeled as Torn API/network failures
- [ ] No-op attack polls do not repeatedly change the queue/UI
- [ ] No-op chain polls do not repeatedly write persistent state
- [ ] Chain countdown remains live even when no persistent save is needed
- [ ] Hidden/inactive polling slows down
- [ ] Polling speeds up near chain danger thresholds

## Event History / Diagnostics

- [ ] HISTORY shows recent manual and API events newest-first
- [ ] Auto events identify Auto behavior
- [ ] Assisted confirmations identify recorded behavior
- [ ] Ignored hits identify ignored behavior
- [ ] Undone API queue changes identify undone behavior
- [ ] COPY DEBUG SNAPSHOT copies valid readable JSON
- [ ] Debug snapshot includes platform, queue, mode, chain, sync/backoff, pending hits, and recent history
- [ ] Debug snapshot does **not** contain the saved Torn API key
- [ ] CLEAR HISTORY removes only diagnostic history and does not erase the roster

## Chat Readout

- [ ] Message preview updates when queue changes
- [ ] Message preview updates when manual hit number changes
- [ ] COPY MESSAGE works
- [ ] Custom template saves after typing
- [ ] Template remains after navigation/refresh
- [ ] `{current}` works
- [ ] `{hit}` works
- [ ] `{next}` / `{next_hit}` work
- [ ] `{ondeck}` / `{ondeck_hit}` work
- [ ] `{chain_time}` works

## Persistence / Migration

- [ ] Existing v2.4 roster survives upgrade to v2.5.8
- [ ] Existing READY / AFK states survive upgrade
- [ ] Existing saved panel position survives upgrade
- [ ] Existing launcher position survives upgrade
- [ ] Existing API mode/settings survive upgrade
- [ ] Navigation does not duplicate players or reset hit counts

## Interface

- [ ] Header remains accessible while the panel scrolls
- [ ] Dark mode is readable
- [ ] Light mode is readable
- [ ] No important buttons are cut off
- [ ] Roster drag/drop still works after API or settings updates
- [ ] Mouse/touch/pointer dragging works on supported platforms
- [ ] Clicking controls does not unexpectedly jump panel scroll position

## Bug Report Notes

Capture:
1. What you were doing.
2. Who was UP NOW.
3. Current Torn chain number.
4. Merc-C-Que mode.
5. Desktop or Torn PDA.
6. What Merc-C-Que displayed.
7. What happened after the hit/navigation.
8. Whether restarting/refreshing fixed it.
9. A debug snapshot from **Settings → HISTORY → COPY DEBUG SNAPSHOT**, when useful.

Never include your API key.
