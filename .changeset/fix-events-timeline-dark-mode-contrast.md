---
"@lowdefy/modules-mongodb-plugins": patch
---

**Fix: EventsTimeline inline card text invisible in dark mode** — the action card set a fixed light background tint but rendered its message with no explicit color, so the text inherited the theme foreground and washed out to light-on-light in dark mode. The message now uses the status's `titleColor` (the same dark accent already used for the badge dot), with an undefined `titleColor` for unknown statuses correctly falling back to inherited color.
