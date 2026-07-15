---
"@lowdefy/modules-mongodb-plugins": minor
---

Add the `require` signal: a narrow, pre-hook-only cascade that reopens a `not-required` form/check action back to `action-required`. It is the `not-required` counterpart of `unblock` (which narrowly reopens `blocked`) and is kept distinct from the broad `activate` so a cascade can re-enable a skipped action without accidentally reopening completed (`done`) work. Enables patterns like a boolean form field that toggles a dependent action between `action-required` and `not-required` indefinitely.
