# Task 6: Wire the demo notifications `send_routine` — `action-approve` × `send-quote`

## Context

The demo wires exactly **one** notification (design item 9): Part 38's engine dispatches notifications post-commit by calling the notifications module's `send-notification` endpoint with `{ event_ids }` for every committed workflow event; the consuming app's `send_routine` re-fetches the event doc(s) and decides what to do (this delegation is the settled contract — Part 41 defers any roles/fan-out model). The demo handles the `action-approve` event type (Part 38's `SubmitWorkflowAction → action-{signal}` event-type table) **filtered to the `send-quote` action type** — *every* approve in *any* workflow emits `action-approve`, so the routine branches on both the event type and the action type. Everything else falls through default-ignored.

Current state:

- `apps/demo/modules/notifications/vars.yaml:5-6` — the `send_routine` ref is commented out.
- `apps/demo/modules/notifications/send-routine.yaml` — dead config: a single `AxiosHttp` step against a `consume-notifications` connection that exists nowhere in the repo. Rewrite it.
- Event docs (Part 38 task 12): `type: action-approve`, `metadata: { action_type, workflow_type, signal, current_key, status_before, status_after }`, `references: { workflow_ids, action_ids, lead_ids }` — `action_ids` lists every action the plan touched, including the approved one.
- Notification docs (read by the module's bell/inbox): `{ contact_id, read: false, title, description, event_type?, created: <change stamp incl. app_name, timestamp> }` — see `unread-count-request.yaml` ($match on `read`, `contact_id`, `created.app_name`) and `get-notifications.yaml` / `view-notification.yaml` for the fields the surfaces use.

## Task

1. **`apps/demo/modules/notifications/vars.yaml`** — uncomment the `send_routine` ref:

   ```yaml
   send_routine:
     _ref: modules/notifications/send-routine.yaml
   ```

2. **`apps/demo/modules/notifications/send-routine.yaml`** — rewrite as the demo's dispatch routine. Contract: receives `{ event_ids }` in the payload; fetch the event doc(s) by id, match `type == action-approve` **and** `metadata.action_type == send-quote`, dispatch an in-app inbox notification for matches; everything else is a no-op.

   Suggested shape (steps run inside the notifications module's `send-notification` InternalApi, so cross-module connections need `_module.connectionId: { id: ..., module: ... }` — these resolve at app level in entry vars):

   - **Step 1 — fetch matching events:** `MongoDBAggregation` on the events module's `events-collection`: `$match` `{ _id: { $in: <event_ids> }, type: 'action-approve', 'metadata.action_type': 'send-quote' }`, then `$lookup` the approved action from the workflows `actions-collection` via `references.action_ids` to derive the **recipient: the quote submitter** — the action's `status` history entry whose `stage` is `in-review` (the submit transition; `status.0` is current/newest), field `created.user.id`. Project one doc per matching event with the recipient id and the fields the notification needs.
   - **Step 2 — insert notification(s):** behind a routine `:if` on "step 1 returned matches", insert into the notifications module's `notifications-collection` one doc per match:
     - `contact_id`: the derived recipient
     - `read: false`
     - `title`: e.g. `Quote approved`
     - `description`: e.g. `Your quote was approved.`
     - `event_type: action-approve`
     - `created`: the events module's `change_stamp` (carries `app_name` + timestamp — required for the inbox/bell `$match` on `created.app_name`)

   A `$merge`-into-`notifications` final stage on the step-1 aggregation is an acceptable alternative to a separate insert step — pick whichever reads cleaner; the acceptance criteria below are behavioral.

## Acceptance Criteria

- Approving a `send-quote` action (in any workflow) produces exactly one unread inbox notification for the user who submitted the quote; the bell count increments and the inbox renders it.
- Approving any **other** action type, and every other workflow event type (`action-submit`, lifecycle `workflow-started`/`-cancelled`/`-closed`, tracker mirrors, …), produces **no** notification and no routine error — non-matches fall through silently.
- `send-notification` invoked with `event_ids` pointing at non-existent docs is a no-op (defensive: the `$match` simply finds nothing).
- No `consume-notifications` / `AxiosHttp` remnant remains.
- Demo app builds.

## Notes

- **Recipient is an implementation choice this task makes** (flag deviations in review, not silently): the design says only "dispatches the notification"; recipient/fan-out policy is explicitly app-owned and the roles model is deferred to Part 41. "Notify the quote submitter that their quote was approved" is the minimal realistic reading — the approver (the event's own `created.user`) would be notifying themselves. The submitter is derivable from data the routine already has (the action's `in-review` status entry's user stamp).
- Do **not** build a generic event-type→handler map or transport abstraction — one wired notification is the demo's whole policy (same as Part 38 task 20's carried-over policy: new lifecycle event types are ignore-unless-wired).
- In the e2e flow both submitter and approver are the same mock session user — the spec (task 8) can assert the notification against that user's `contact_id`.
