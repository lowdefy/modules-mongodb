# Task 2: Rewrite `send-routine.yaml` — quote-approved branch, wire `send_routine`

## Context

The notifications module's `send-notification` endpoint (`modules/notifications/api/send-notification.yaml`) is an `InternalApi` whose routine is `_module.var: send_routine` (manifest default `[]`, a no-op). Three callers dispatch into it with payload `{ event_ids: [...] }`:

- the workflows engine, post-commit, for every committed workflow event;
- `modules/user-admin/api/invite-user.yaml:187` (event type `invite-user`);
- `modules/user-admin/api/resend-invite.yaml:55` (event type `resend-user-invite`).

In the demo app, `apps/demo/modules/notifications/vars.yaml:5-6` has the `send_routine` ref **commented out**, and `apps/demo/modules/notifications/send-routine.yaml` is dead config — a single `AxiosHttp` step against a `consume-notifications` connection that exists nowhere (a remnant of a replaced Lambda architecture).

This task rewrites the routine file with the first of two branches: **`action-approve` × `send-quote`** — approving the demo onboarding workflow's quote inserts one unread inbox notification for the quote submitter, deep-linking to the lead. (Task 3 adds the invite branch as a second step in the same file.)

**Event doc shape** (as *stored*, not as the planner builds it): the engine planner (`planEventDispatch.js`) returns a doc with nested `display` and `references` objects, but the events module's single writer (`modules/events/api/new-event.yaml`) flattens both onto the top level via `_object.assign` before insert. So the *stored* doc in the events collection (raw name `log-events`) carries `_id` (string), `type: 'action-approve'`, the reference arrays **as top-level fields** — `workflow_ids`, `action_ids`, `lead_ids` (`lead_ids` is the demo onboarding config's `entity_ref_key`) — the display block keyed by app name at the top level (`demo: { title }`), `metadata: { action_type, workflow_type, signal, ... }` (the only nested sub-doc), and `created` (events-module change stamp incl. `user.name` / `user.id` / `timestamp`). Read reference arrays as `$action_ids` / `$lead_ids`, **not** `$references.*`. This matches how `GetEventsTimeline` joins (`localField: 'action_ids'`) and matches the app display block (`{ [app_name]: { $ne: null } }`).

**Action doc shape**: the `actions` collection (raw name `actions`); each action has `type` (e.g. `send-quote`) and a `status` history array of `{ stage, event_id, created: <change stamp> }` entries. The entry with `stage: 'in-review'` is the submit transition — its `created.user.id` is the quote submitter (the notification recipient).

**Target collection**: raw name `notifications` (the notifications module's connection writes to it with `write: true`).

## Task

1. **Rewrite `apps/demo/modules/notifications/send-routine.yaml`** as a routine array with one `MongoDBAggregation` step (delete the `AxiosHttp` config wholesale). The step runs on the events module's collection and ends in a `$merge` into `notifications` — an empty `$match` merges nothing, so every non-matching dispatch is a silent no-op by construction (no `:if` plumbing, no error paths).

   ```yaml
   - id: notify_quote_approved
     type: MongoDBAggregation
     connectionId:
       _module.connectionId:
         id: events-collection
         module: events
     properties:
       pipeline:
         # ── select the handled events ──
         - $match:
             _id:
               $in:
                 _payload: event_ids
             type: action-approve
             metadata.action_type: send-quote
         # ── join the send-quote action (action_ids may include
         #    cascade-touched actions, so filter by type) ──
         - $lookup:
             from: actions
             let:
               action_ids: $action_ids
             pipeline:
               - $match:
                   $expr:
                     $and:
                       - $in:
                           - $_id
                           - $$action_ids
                       - $eq:
                           - $type
                           - send-quote
             as: quote_action
         - $set:
             quote_action:
               $first: $quote_action
         # ── recipient: the submit transition's user (last in-review entry) ──
         - $set:
             recipient_id:
               $let:
                 vars:
                   submit_entry:
                     $last:
                       $filter:
                         input: $quote_action.status
                         as: entry
                         cond:
                           $eq:
                             - $$entry.stage
                             - in-review
                 in: $$submit_entry.created.user.id
         # ── shape the notification doc ──
         - $project:
             _id:
               $function:
                 body: |
                   function(){
                     return UUID().toString().split('"')[1]
                   }
                 args: []
                 lang: js
             key:
               $concat:
                 - $_id
                 - ":"
                 - $recipient_id
                 - ":"
                 - $dateToString:
                     date: $created.timestamp
             popup:
               $literal: false
             contact_id: $recipient_id
             title: Quote approved
             description:
               $concat:
                 - $created.user.name
                 - " approved your quote."
             body: "<p>Your quote was approved.</p>"
             links:
               button:
                 pageId: lead-view
                 urlQuery:
                   _id:
                     $first: $lead_ids
             type: quote-approved
             event_type: action-approve
             event_id: $_id
             created:
               _ref:
                 module: events
                 component: change_stamp
             read:
               $literal: false
             priority:
               $literal: 50
         - $merge:
             into: notifications
             on: _id
             whenMatched: keepExisting # uuids never collide; defensive
             whenNotMatched: insert
   ```

   Shape notes (the snippet above is the design's contract; adjust YAML details only if the build/runtime demands it):

   - **`_module.connectionId: { id: events-collection, module: events }`** resolves at app level since the routine is entry-vars config (design-resolved). It targets the events module's scoped connection (collection `log-events`).
   - **`$project` literal gotcha:** in `$project`, bare `false` excludes a field and bare numbers act as inclusion flags — `popup`, `read`, and `priority` **must** use `$literal`. Plain strings not starting with `$` (`title`, `body`, `type`, `event_type`) are safe literals.
   - **`created` is the events-module change stamp**, injected config-side via the cross-module component `_ref` — it resolves to the demo's change-stamp template (`apps/demo/modules/events/vars.yaml`) whose runtime operators (`_user`, `_date`) evaluate per request, so the stamp's user is the approver. This is the design's single deviation from the production schema (`user`/`version` instead of `service_name`); `timestamp` + `app_name` — the fields the surfaces `$match` on — are present.
   - **`_id` must be a uuid string** (the link page matches `_id` against the URL-query string; an ObjectId would never match). The `$function` body is the established production idiom; it requires server-side JavaScript on the target deployment (available; production-proven).
   - **`key`** is written for schema fidelity only — no dedup lookup (descoped by design).
   - **No `content` field, no email fields** (`lowercase_email`, `text`, `send_email`, etc.) — dropped by design.
   - `recipient_id` is a temp field consumed by `$project` (not underscore-prefixed, per repo rule).

2. **Uncomment the `send_routine` ref in `apps/demo/modules/notifications/vars.yaml`:**

   ```yaml
   send_routine:
     _ref: modules/notifications/send-routine.yaml
   ```

## Acceptance Criteria

- Demo app builds; no `consume-notifications` / `AxiosHttp` remnant remains anywhere in the demo app.
- Approving the demo onboarding `send-quote` action produces **exactly one** notification doc: `read: false`, `popup: false`, `priority: 50`, `contact_id` = the quote submitter's user id, `type: 'quote-approved'`, `event_type: 'action-approve'`, `event_id` = the approve event's `_id`, string-uuid `_id`, `key`, `created` change stamp (timestamp, user, app_name, version), `title`/`description`/`body` as specified, `links.button` = `{ pageId: lead-view, urlQuery: { _id: <lead id> } }`.
- The bell unread count increments for the submitter; the inbox renders the card with the `action-approve` type chip (task 1's enum entry); clicking through deep-links to the lead view.
- Approving any **other** action type inserts nothing and raises nothing; every other workflow/event type falls through silently; `send-notification` invoked with unknown `event_ids` is a no-op.
- No doc carries `content` or any email field.

## Files

- `apps/demo/modules/notifications/send-routine.yaml` — rewrite — delete the `AxiosHttp` step; add the `notify_quote_approved` aggregation step.
- `apps/demo/modules/notifications/vars.yaml` — modify — uncomment the `send_routine` ref.

## Notes

- **Recipient policy** (from the design, carried from Part 45 task 06): the quote submitter — the approver would be notifying themselves. Recipient/fan-out policy stays app-owned; the roles model is deferred to workflows Part 41. With resubmit cycles there can be multiple `in-review` entries; `$last` takes the most recent submitter.
- **`$merge` bypasses the connection's `changeLog` plugin** — notification inserts aren't change-logged. Accepted by design (production's Lambda inserts bypass it identically).
- Re-dispatching the same event would duplicate (uuid `_id` always inserts). Accepted: the engine dispatches once per committed event.
- In the e2e flow (Part 45 task 08 owns the happy-path assertion) submitter and approver are the same mock session user — manual verification here can use a single user too.
