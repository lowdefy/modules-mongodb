---
"@lowdefy/modules-mongodb-workflows": patch
---

**Check-action modal header restructure** — the compact modal header is split into two rows: status pill · message title · in-flow close on the top row, and the assignee / due-date chips on their own right-aligned row below (a long title no longer fights the chips for width). The modal sets `closable: false` — an in-flow close button replaces the native floating X, which had no title strip to live in and overlapped the header; mask-click and Esc still close.

The workflow-closed banner moved below the header (title-then-notice reading order), and the signal button bar now hides wholesale on a closed workflow instead of showing disabled buttons.
