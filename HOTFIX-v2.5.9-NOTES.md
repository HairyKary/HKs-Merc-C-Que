# v2.5.9 Hotfix Test Notes

Fixes false critical chain warnings when Torn reports an inactive chain with a zero timeout.

Expected behavior:
- No active chain: neutral UI, no red pulse, no danger/critical sound or toast, countdown shown as unavailable.
- Active chain with time remaining: countdown and normal urgency states continue to work.
- Active chain at <= 60 seconds: danger state still activates.
- Active chain at <= 30 seconds: critical red pulse still activates.

This file is temporary test documentation for the v2.5.9 hotfix branch and should be removed before merge if not wanted in main.
