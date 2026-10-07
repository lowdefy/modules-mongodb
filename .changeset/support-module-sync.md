---
"@lowdefy/modules-mongodb-support": minor
---

New `support` module, the reporter's side of the Pelican support desk. This release lays its base: the module's vars, the `support_pelican` connection to Pelican's support API, the user's copy of their tickets in `support-tickets`, and three endpoints. `sync-tickets` fills the copy from Pelican, the tickets the team logged for the user included, and lists them newest first; `sync-ticket` refreshes one ticket and marks it read; `mark-read` marks one read. Every endpoint answers `{ ok, error }` with an error `kind` of `fix`, `retry` or `unavailable` instead of failing on Pelican's answer. See `docs/support/`.
