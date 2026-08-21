---
"@lowdefy/modules-mongodb-events": patch
"@lowdefy/modules-mongodb-user-account": patch
"@lowdefy/modules-mongodb-user-admin": patch
"@lowdefy/modules-mongodb-organizations": patch
---

fix: Correct audit-trail attribution across workspaces (T1, T2, T18).

Change stamps and identity displays no longer name the wrong identity:

- The first save after onboarding stamped an empty actor name (the write that creates the
  caller's name stamped from the pre-write session). The shared write-profile fragment now
  repairs an empty stamped name from the freshly-derived profile name on self-writes only,
  and the update-profile audit event carries the same repaired actor (T1).
- The verify-time contact mint recorded no actor at all. The signup hook now passes the
  verifying user's id (and name when known) into ensure-contact, which stamps it in system
  context (T2).
- "Invited by" on pending invitations read the deployment-global users row, so an inviter's
  name edited in another workspace leaked into this one's list. The shared invitations base
  now prefers the inviter's per-organization member display copy, falling back to the global
  row (T18 module half; the engine half — per-organization `_user: name`/`image` — ships in
  the framework's `fix/per-org-caller-name`).
