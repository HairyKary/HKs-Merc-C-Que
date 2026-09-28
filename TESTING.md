# HKs Merc-C-QUE Beta Testing Checklist

## Environment

- Merc-C-QUE version:
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
- [ ] Minimize the panel with the — button
- [ ] Drag the MCQ launcher to a new screen position
- [ ] Click MCQ to restore the panel
- [ ] Refresh while minimized and confirm the launcher position is preserved
- [ ] Confirm pending-hit badge appears on MCQ when a hit needs attention

## Manual Mode

- [ ] Set a starting hit number
- [ ] Press DONE
- [ ] Current player moves to the bottom
- [ ] Hit number increases correctly
- [ ] Player hit total increases
- [ ] Press SKIP
- [ ] Skipped player moves without recording a hit
- [ ] Press UNDO

## Assisted Mode

- [ ] API test succeeds
- [ ] A new chain hit is detected
- [ ] Expected hitter generates a confirmation prompt
- [ ] Confirming advances the correct player
- [ ] Ignoring does not alter the queue
- [ ] Out-of-order hit identifies the correct hitter
- [ ] AFK player remains excluded from active rotation

## Auto Mode

- [ ] Expected UP NOW player advances automatically
- [ ] Player hit total increases once
- [ ] No duplicate advancement occurs
- [ ] Out-of-order hit does not silently rearrange the queue
- [ ] Unknown/unqueued hitter produces a warning
- [ ] Chain/hit numbering remains synchronized

## Chat Readout

- [ ] Message preview updates with queue
- [ ] COPY MESSAGE works
- [ ] Custom template saves

## Interface

- [ ] Panel scrolls when settings exceed screen height
- [ ] Header remains accessible
- [ ] Minimized launcher does not interfere with Torn chat after being positioned
- [ ] Dark mode is readable
- [ ] Light mode is readable
- [ ] No important buttons are cut off

## Bug Report Notes

Capture:
1. What you were doing.
2. Who was UP NOW.
3. Current Torn chain number.
4. What Merc-C-QUE displayed.
5. What happened after the hit.
6. Whether refreshing fixed it.

Never include your API key.
