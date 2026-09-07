---
"@lowdefy/modules-mongodb-ai-assistant": minor
"@lowdefy/modules-mongodb-plugins": patch
---

ai-assistant: add a `feedback_values` var so stored ratings come back

The chat block persists no rating: `on_feedback` hands one to the app and the app stores
it. There was no way to hand it back, so a reload or a thread switch showed every message
unrated even where the app had recorded the rating — a lost write rather than a display
gap, as far as the user could tell.

`feedback_values` takes a map of message id to `like` or `dislike`, in the same vocabulary
`on_feedback` reports. A rating clicked during the visit takes precedence, so the thumb
still responds immediately. Rebuild the map for the thread being opened — `on_thread_change`
is the seam for that.

Requires Lowdefy 5.6.0, the release carrying the AgentChat `feedbackValues` property; on
an older build the property is ignored and nothing changes. The plugin package's Lowdefy
peer range now accepts `5.6.0` and no longer accepts
`0.0.0-experimental-20260827105525` — that build predates the property, so it was only
ever the pre-release stand-in for this release.
