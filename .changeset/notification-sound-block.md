---
"@lowdefy/modules-mongodb-plugins": minor
---

**New `NotificationSound` block: an opt-in chirp for live notifications.** It plays a short two-tone chirp synthesised in the browser (no audio file), at most once per batch of notifications across every open tab and reload. The sound is off until the viewer turns it on with the block's Sound switch (`toggle: true`); the setting is kept per app in the browser's `localStorage`, so it holds per device and other tabs follow a change at once. Without `toggle` the block draws nothing and only plays, through its `play(ids)` method.
