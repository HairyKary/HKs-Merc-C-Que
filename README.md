# HKs Merc-C-QUE

**A chain queue organizer for Torn.com**

HKs Merc-C-QUE helps faction chain coordinators keep an ordered rotation of hitters, track who is up next, and generate a quick faction-chat readout.

> **Status:** Public Beta  
> **Current beta:** v2.1.1  
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
- Dark/light friendly interface
- Local queue persistence between page refreshes

## Installation

### Requirements

- A userscript manager such as **Tampermonkey**
- Torn.com account
- Optional: a Torn API key with the permissions required for faction attack data

### Install from GitHub

1. Open the raw userscript:  
   `https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/HKs-Merc-C-QUE/main/HKs-Merc-C-QUE.user.js`
2. Tampermonkey should open an installation screen.
3. Click **Install**.
4. Refresh Torn.

If Tampermonkey does not open automatically, create a new userscript and paste the contents of `HKs-Merc-C-QUE.user.js`.

## First Setup

1. Open Torn.
2. Find the **HKs Merc-C-QUE** floating panel.
3. Click the **gear icon**.
4. Paste your queue roster, one Torn username per line.
5. Click **Save Roster**.
6. Choose Manual, Assisted, or Auto mode.

## API Modes

### Manual
No recurring API calls are made. Use **DONE** after the current person completes their hit.

### Assisted
Merc-C-QUE watches faction attack data and alerts you when a hit is detected. You confirm the queue advancement.

### Auto
When the expected **UP NOW** player makes a detected chain hit, Merc-C-QUE records the hit and advances the queue automatically.

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

- Merc-C-QUE version
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

Created by **HairyKary** for The Mercs community.
