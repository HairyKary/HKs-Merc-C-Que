# HKs Merc-C-Que

**A chain queue organizer for Torn.com**

HKs Merc-C-Que helps faction chain coordinators keep an ordered rotation of hitters, track who is up next, and generate a quick faction-chat readout.

> **Status:** Public Release  
> **Current version:** v2.5.14
> Tested on desktop/Tampermonkey and Torn PDA.  
> This is an unofficial community userscript and is not affiliated with Torn Ltd.

## Features

- Ordered chain queue
- **UP NOW / NEXT / ON DECK** display
- Hit number shown next to each queued player
- READY / AFK status
- Drag-and-drop queue reordering with mouse/touch/pointer support
- Remove players who leave the queue
- Manual, Assisted, and Auto API modes
- Automatic detection of faction chain hits
- Out-of-order and unqueued-hit warnings
- Per-player completed hit counts
- Undo and Skip controls
- Auto-mode undo that reverses the local queue change without re-detecting the same Torn hit
- Customizable faction-chat message
- One-click copy to clipboard
- Scrollable floating panel with responsive mobile layout
- Minimize to a compact draggable launcher showing current player, hit number, and chain clock
- Minimized launcher remembers its screen position
- Launcher status indicator for API active / paused / pending attention
- Pending-hit badge while minimized
- Tabbed settings for **Roster / Message / API / History**
- Event history / diagnostics ledger
- Copyable debug snapshot that excludes the API key
- Dark/light friendly interface
- Versioned saved-state migration
- Persistent panel/minimized/launcher state across Torn navigation
- Native Torn PDA UI-state persistence
- Torn PDA API transport and injected-key support
- Adaptive polling with retry/backoff and resume reconciliation
- Reduced storage writes during unchanged API polls
- Chain danger/critical countdown alerts with optional sound
- Torn-calibrated chain countdown with a conservative 3-second safety buffer
- Broken or expired chains reset Auto/Assisted hit numbering back to HIT #1
- Torn PDA minimized launcher can be temporarily hidden for the current session
- Smoother drag handling and lighter minimized-launcher updates
- Multi-tab synchronization with one elected API leader tab and fast shared queue/chain state
- Compact Torn PDA view for UP / NEXT / ON DECK / chain status
- Optional configurable HIT NOW chain-tempo guidance
- Bulk **ADD / RECORD ALL** and **IGNORE ALL** actions for pending-hit backlogs
- Pending-hit queue capacity increased to 200 events
- Leaner Undo history and lighter same-browser tab synchronization
- Change-aware Torn PDA UI storage to reduce redundant writes
- Safe pending-backlog overflow protection that pauses before a hit can be dropped
- Edge-anchored panel and launcher positions that remain attached to the chosen side when the browser is resized
- Optional warning when the same player remains UP too long

## Installation

### Requirements

- Desktop: a userscript manager such as **Tampermonkey**
- Mobile: **Torn PDA** with userscript support
- Torn.com account
- Optional: a Torn API key with the permissions required for faction attack data

### Install from GitHub

1. Open the raw userscript:  
   `https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/main/HKs-Merc-C-Que.user.js`
2. Install it with Tampermonkey or Torn PDA.
3. Refresh/reopen Torn.

Desktop installs include automatic update metadata pointing to the `main` branch.

## First Setup

1. Open Torn.
2. Find the **HKs Merc-C-Que** floating panel.
3. Click the **gear icon**.
4. Open the **ROSTER** tab.
5. Paste your queue roster, one Torn username per line.
6. Click **Save Roster**.
7. Open the **API** tab if you want Assisted or Auto mode.

## Minimize / Restore

Click the **—** button in the Merc-C-Que header to minimize the panel.

Merc-C-Que becomes a small draggable launcher showing the current queued player, assigned hit number, and chain clock when available. Its position is remembered. Click the launcher to restore the full panel.

On Torn PDA, the minimized launcher also includes a small **×** that hides Merc-C-Que for the current PDA/webview session without deleting queue, API, or saved UI data.

The launcher status dot indicates whether API automation is active, paused, or waiting for attention. Pending Assisted / out-of-order / unqueued hits also show a badge count.

## API Modes

### Manual

No recurring API calls are made. Use **DONE** after the current person completes their hit.

### Assisted

Merc-C-Que watches faction attack data and alerts you when a hit is detected. You confirm the queue advancement.

### Auto

When the expected **UP NOW** player makes a detected chain hit, Merc-C-Que records the hit and advances the queue automatically.

Unexpected or out-of-order hits still require manual confirmation.

## Desktop / Torn PDA

The same userscript now supports both desktop browsers and Torn PDA.

On Torn PDA, Merc-C-Que uses Torn PDA's native HTTP bridge, injected API key, and persistent PDA storage for panel/minimized/launcher UI state. On desktop, it uses the standard userscript APIs and Torn-page local storage.

## Reliability / Performance

Merc-C-Que includes:

- Adaptive polling that speeds up near chain danger and slows while hidden/inactive
- Retry/backoff for temporary Torn API/network failures
- Resume/focus reconciliation after suspension
- Processed-attack tracking to avoid duplicate queue advancement
- Separate handling for API/network errors vs internal processing errors
- Change-aware chain polling so unchanged polls avoid unnecessary state serialization/storage writes
- Torn server-time calibration for the live chain clock, with local fallback if calibration is unavailable
- Conservative 3-second chain-clock safety margin
- Automatic reset to HIT #1 when Torn reports no active chain
- Multi-tab API leader election so only one active Torn tab performs routine API polling
- BroadcastChannel synchronization with local-storage fallback for queue and chain state across tabs

## Undo Behavior

Merc-C-Que keeps local queue history for manual and API-driven queue changes.

For an Auto-mode hit, **UNDO** restores the prior Merc-C-Que roster / hit-count state but deliberately leaves the Torn attack marked as processed. The actual Torn hit still happened, so Merc-C-Que will not immediately detect and apply the same attack a second time.

## Event History / Diagnostics

Open **Settings → HISTORY** to view recent Merc-C-Que events, including detected hits, Auto recordings, confirmations, ignored hits, and undone events.

**COPY DEBUG SNAPSHOT** copies a compact diagnostic record containing platform, queue state, chain state, sync/backoff state, pending hits, and recent event history. The saved Torn API key is not included.

## API Key Safety

Use **your own Torn API key**.

Do not post API keys in GitHub Issues, screenshots, Discord, the repository, or script source code.

On Torn PDA, the app-supplied/injected key is used automatically when available.

## Chat Message Placeholders

- `{current}`
- `{hit}`
- `{next}`
- `{next_hit}`
- `{ondeck}`
- `{ondeck_hit}`
- `{player_hits}`
- `{ready_count}`
- `{total_count}`
- `{queue}`
- `{last_hitter}`
- `{last_hit}`
- `{chain_time}`

Example:

`HIT #{hit} | UP: {current} | NEXT: {next} (#{next_hit}) | ON DECK: {ondeck} (#{ondeck_hit})`

## Testing

See [TESTING.md](TESTING.md) for the regression checklist used during development.

## Reporting Bugs

Open a GitHub Issue and include:

- Merc-C-Que version
- Desktop browser/userscript manager or Torn PDA version
- API mode being used
- What you expected
- What happened instead
- Steps to reproduce the problem
- A debug snapshot when useful

**Remove private information before posting screenshots or logs. The built-in debug snapshot does not include your saved API key.**

## Disclaimer

This is an unofficial third-party userscript. Torn API behavior and page structure may change and can affect script functionality.

## Author

Created by **HairyKary**.
