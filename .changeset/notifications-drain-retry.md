---
"@lowdefy/modules-mongodb-notifications": minor
---

Add a drain retry for unsent notifications, and factor a single shared send path:

- New exported `drain-notifications` endpoint re-sends records left at
  `sent: false` by a failed send, from their stored render outputs (no
  re-render). Payload knobs: `max_attempts` (default 5), `limit` (default 50).
  Each record is claimed with an optimistic lock before sending, so
  overlapping drain runs cannot double-send. Only records with at least one
  failed attempt drain — in-flight first sends and legacy (Lambda-era)
  records are never picked up. The module ships no schedule; apps wire a
  cron-only endpoint that CallApis the drain (see the demo app's
  `api/notifications-drain.yaml`).
- The send block (transport switch, mark-sent bookkeeping, failure catch) is
  factored out of `dispatch-notification-item` into an internal
  `send-notification-record` endpoint shared by dispatch and drain.
  Behavior change: inbox-only dispatches no longer throw on an invalid
  `transport` var — the guard now lives in the send path.
