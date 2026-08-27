---
"@lowdefy/modules-mongodb-ai-assistant": minor
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

Requires a Lowdefy build carrying the AgentChat `feedbackValues` property; on an older
build the property is ignored and nothing changes.
