# Task 6: Wire the demo notifications `send_routine` — SUPERSEDED

**This task is superseded by [`designs/demo-notifications/design.md`](../../../../../demo-notifications/design.md).**

The original scope (one wired notification: `action-approve` × `send-quote` → inbox doc for the quote submitter) is carried over there unchanged, widened with:

- inserted docs aligned to the production notification pipeline's schema (minus email fields);
- the user-admin `invite-user` / `resend-user-invite` dispatches mocked as inbox notifications (no emails anywhere);
- the demo's missing `global.enums.event_types` wiring (inbox chips + type filter).

Design item 9's policy (everything else falls through default-ignored) and the recipient choice (quote submitter, derived from the action's `in-review` status entry) are preserved. The e2e assertion remains with task 8.
