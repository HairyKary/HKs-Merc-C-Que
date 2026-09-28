# HKs Merc-C-Que

**A chain queue organizer for Torn.com**

HKs Merc-C-Que helps faction chain coordinators keep an ordered rotation of hitters, track who is up next, and generate a quick faction-chat readout.

> **Status:** Public Beta  
> **Current beta:** v2.4.0  
> This is an unofficial community userscript and is not affiliated with Torn Ltd.

## Features

- Ordered chain queue
- **UP NOW / NEXT / ON DECK** display
- Hit number shown next to each queued player
- READY / AFK status
- Drag-and-drop queue reordering
- Remove players who leave the queue
- Manual, Assisted, and Auto API modes
- Automatic detection of faction chain hits
- Out-of-order and unqueued-hit warnings
- Per-player completed hit counts
- Undo and Skip controls
- Auto-mode undo that reverses the local queue change without re-detecting the same Torn hit
- Customizable faction-chat message
- One-click copy to clipboard
- Scrollable floating panel
- Minimize to a compact draggable **MCQ #hit** launcher
- Minimized launcher remembers its screen position
- Launcher status indicator for API active / paused / pending attention
- Pending-hit badge while minimized
- Tabbed settings for **Roster / Message / API / History**
- Event history / diagnostics ledger
- Copyable debug snapshot that excludes the API key
- Dark/light friendly interface
- Versioned saved-state migration
- Local queue persistence between page refreshes

## Installation

### Requirements

- A userscript manager such as **Tampermonkey**
- Torn.com account
- Optional: a Torn API key with the permissions required for faction attack data

### Install from GitHub

1. Open the raw userscript:  
   `https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/main/HKs-Merc-C-Que.user.js`
2. Tampermonkey should open an installation screen.
3. Click **Install**.
4. Refresh Torn.

If Tampermonkey does not open automatically, create a new userscript and paste the contents of `HKs-Merc-C-Que.user.js`.

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

Merc-C-Que becomes a small draggable launcher showing the next assigned hit number, for example `MCQ #427`. Its position is remembered after refresh. Click the launcher to restore the full panel.

The launcher status dot indicates whether API automation is active, paused, or waiting for attention. Pending Assisted / out-of-order / unqueued hits also show a badge count.

## API Modes

### Manual

No recurring API calls are made. Use **DONE** after the current person completes their hit.

### Assisted

Merc-C-Que watches faction attack data and alerts you when a hit is detected. You confirm the queue advancement.

### Auto

When the expected **UP NOW** player makes a detected chain hit, Merc-C-Que records the hit and advances the queue automatically.

Unexpected or out-of-order hits still require manual confirmation.

## Undo Behavior

Merc-C-Que keeps local queue history for manual and API-driven queue changes.

For an Auto-mode hit, **UNDO** restores the prior Merc-C-Que roster / hit-count state but deliberately leaves the Torn attack marked as processed. The actual Torn hit still happened, so Merc-C-Que will not immediately detect and apply the same attack a second time.

## Event History / Diagnostics

Open **Settings → HISTORY** to view recent Merc-C-Que events, including detected hits, Auto recordings, confirmations, ignored hits, and undone events.

**COPY DEBUG SNAPSHOT** copies a compact diagnostic record containing queue state, chain state, pending hits, and recent event history. The saved Torn API key is not included.

## API Key Safety

Each tester should use **their own Torn API key**.

Do not post API keys in GitHub Issues, screenshots, Discord, the repository, or script source code.

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

Example:

`HIT #{hit} | UP: {current} | NEXT: {next} (#{next_hit}) | ON DECK: {ondeck} (#{ondeck_hit})`

## Beta Testing

See [TESTING.md](TESTING.md) for the test checklist.

## Reporting Bugs

Open a GitHub Issue and include:

- Merc-C-Que version
- Browser
- Userscript manager/version
- API mode being used
- What you expected
- What happened instead
- Steps to reproduce the problem
- A debug snapshot when useful

**Remove private information before posting screenshots or logs. The built-in debug snapshot does not include your saved API key.**

## Disclaimer

This is an unofficial third-party userscript. Test beta versions carefully. Torn API behavior and page structure may change and can affect script functionality.

## Author

Created by **HairyKary**.