---
"@lowdefy/modules-mongodb-release-notes": minor
"@lowdefy/modules-mongodb-support": minor
---

**Breaking: the release-notes module no longer renders `CHANGELOG.md`.** It now takes release notes the team announces from Pelican, which arrive on the support module's signed webhook. The support webhook hands `release.*` events to the module, and the module answers Pelican's `release.audience` with live counts of who an announcement would reach.

- **release-notes:** the `content` var is removed. New vars: `audiences` (the groups Pelican can announce to, each a filter over the person's `user-members` row), `email_template` and `region` (required). The module now depends on `notifications`, `files` and `events`, declares three collections (`release-notes`, `release-notes-recipients`, `release-notes-preferences`) and read-only views of the auth `user-members`, `users` and `user-organizations`, and exports an internal `receive` endpoint.
- **support:** new var `release_notes_endpoint`, the release-notes receiver's full endpoint id (such as `release-notes/receive`). With it null, the webhook answers `release.*` events 404. `app_version` is now described as the app's bare X.Y.Z version, which Pelican compares with the release it announces.

Migration:

- Remove `content` from the release-notes entry and set `region` (the public files bucket's region) and any `audiences`.
- Add an `events` module entry if the app has none.
- Set the support module's `release_notes_endpoint` to `{release-notes entry id}/receive`, and `app_version` from the build.
- Create the two indexes on `release-notes-recipients` listed in the module's docs.
