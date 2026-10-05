---
"@lowdefy/modules-mongodb-notifications": minor
---

Notification writes keep the tenant wall; none of them uses `tenant: none` any more.

- A dispatch's `mark_sent` and failure bookkeeping run as the signed-in caller,
  so they are filtered and stamped with the caller's organization, and their
  change-log rows carry it.
- `drain-notifications` still reads unsent records across organizations, and
  now retries each one bound to the record's `organization_id` (`CallApi`
  `organization`). The retry's claim, `mark_sent` and failure bookkeeping keep
  the wall. Call the drain from a schedule: Lowdefy accepts the binding only in
  a trusted system run.
- Needs a Lowdefy version whose `CallApi` takes `organization`.
