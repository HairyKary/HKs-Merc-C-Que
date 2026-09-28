# HKs Merc-C-Que

**A chain queue organizer for Torn.com**

HKs Merc-C-Que helps faction chain coordinators keep an ordered rotation of hitters, track who is up next, and generate a quick faction-chat readout.

> **Status:** Public Beta  
> **Current beta:** v2.2.0  
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
- Out-of-order hit warnings
- Per-player hit counts
- Undo and Skip controls
- Customizable faction-chat message
- One-click copy to clipboard
- Scrollable floating panel
- Minimize to a compact draggable **MCQ** launcher
- Minimized launcher remembers its screen position
- Pending-hit badge while minimized
- Dark/light friendly interface
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
4. Paste your queue roster, one Torn username per line.
5. Click **Save Roster**.
6. Choose Manual, Assisted, or Auto mode.

## Minimize / Restore

Click the **—** button in the Merc-C-Que header to minimize the panel.

Merc-C-Que becomes a small **MCQ** launcher that can be dragged anywhere on the screen. Its position is remembered after refresh. Click the launcher to restore the full panel.

If Assisted or Auto mode has a detected hit waiting for attention, the minimized launcher shows a badge with the number of pending hits.

## API Modes

### Manual
No recurring API calls are made. Use **DONE** after the current person completes their hit.

### Assisted
Merc-C-Que watches faction attack data and alerts you when a hit is detected. You confirm the queue advancement.

### Auto
When the expected **UP NOW** player makes a detected chain hit, Merc-C-Que records the hit and advances the queue automatically.

Unexpected or out-of-order hits still require manual confirmation.

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

**Remove API keys and private information before posting screenshots or logs.**

## Disclaimer

This is an unofficial third-party userscript. Test beta versions carefully. Torn API behavior and page structure may change and can affect script functionality.

## Author

Created by **HairyKary** for... why not, I just hope its liked.
