# Greasy Fork Release Prep — HKs Merc-C-Que

This file contains the copy-ready details for the first Greasy Fork publication.

## Script title

HKs Merc-C-Que

## Short description

Torn faction chain queue manager for Desktop and Torn PDA with Manual, Assisted, and Auto hit tracking.

## Suggested full description

HKs Merc-C-Que is a Torn.com faction chain queue manager designed for ranked wars, chains, and organized faction hitting.

It keeps the hitter rotation visible with UP NOW, NEXT, and ON DECK positions, tracks hit numbers, and can use the Torn API to detect faction attacks.

Features include:

- Manual, Assisted, and Auto queue modes
- Automatic detection of faction chain hits
- UP NOW / NEXT / ON DECK display
- Per-player hit counts and READY / AFK status
- Out-of-order and unqueued-hit warnings
- Pending-hit review with ADD / RECORD ALL and IGNORE ALL
- Chain countdown with a conservative safety buffer
- Optional HIT NOW tempo guidance
- Multi-tab synchronization with a single API leader tab
- Compact Torn PDA layout
- Persistent panel and launcher positioning
- Event history and a copyable debug snapshot
- Desktop/Tampermonkey and Torn PDA support

Each user should use their own Torn API key when Assisted or Auto mode is enabled.

HKs Merc-C-Que is an unofficial community userscript and is not affiliated with Torn Ltd.

## Greasy Fork source sync URL

https://raw.githubusercontent.com/HairyKary/HKs-Merc-C-Que/main/HKs-Merc-C-Que.user.js

Use the raw main-branch file above as the Greasy Fork sync source.

## Homepage

https://github.com/HairyKary/HKs-Merc-C-Que

## Support

https://github.com/HairyKary/HKs-Merc-C-Que/issues

## License

MIT

## Site / applies to

https://www.torn.com/
https://torn.com/

## Important Greasy Fork behavior

Greasy Fork rewrites the installed script's update/download metadata so users who install from Greasy Fork receive updates from Greasy Fork.

The GitHub repository remains the development source of truth. Publish tested releases to main first, then sync Greasy Fork from the raw main-branch URL.

## Recommended first-publish workflow

1. Finish testing the release intended for Greasy Fork.
2. Merge that release to GitHub main.
3. On Greasy Fork, create a new user script and import/sync from the raw main URL above.
4. Use the title, short description, full description, homepage, support URL, and MIT license listed in this document.
5. Confirm Greasy Fork shows the correct version and code before publishing.
6. After the script is live, configure Greasy Fork source sync to the same raw main URL.
7. Optionally configure a GitHub webhook later for near-immediate synchronization after releases.

## Release rule

Only the tested production main branch should feed Greasy Fork. Do not point Greasy Fork at development/test branches.
