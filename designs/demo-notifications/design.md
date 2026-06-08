# Demo notifications — send routine with production-shaped docs

The demo app's notifications module is wired for display only: the bell, inbox, and deep-link pages all exist, but the `send_routine` var is commented out and the routine file is dead config from a previous architecture, so nothing ever inserts a notification document. This design rewrites the demo's `send_routine` to handle three event types — the workflow quote approval, and the two user-invite events (mocked as inbox docs instead of emails) — inserting documents shaped like the production notification pipeline's docs, minus all email fields. It also wires the `enums.event_types` global the inbox surfaces depend on, which the demo is currently missing entirely.

This supersedes [Part 45 task 06](../workflows-module/parts/_completed/45-demo-rebuild/tasks/06-notifications-send-routine.md) (one wired notification), widening its scope to the invite mocks, the production doc schema, and the enums global.

## Proposed change

1. **Rewrite `apps/demo/modules/notifications/send-routine.yaml`** as the demo's dispatch routine and uncomment the `send_routine` ref in `apps/demo/modules/notifications/vars.yaml`. The dead `AxiosHttp` → `consume-notifications` config is deleted.
2. **Branch 1 — `action-approve` × `send-quote`:** approving the demo onboarding workflow's quote inserts one unread inbox notification for the quote submitter, deep-linking to the lead.
3. **Branch 2 — `invite-user` / `resend-user-invite`:** the user-admin invite APIs' dispatches insert an inbox notification for the invited contact — the demo's mock of the production invite *email*. No email is sent anywhere.
4. **Inserted docs follow the production `consumeNotifications` schema minus email fields** (see schema table): `_id` (uuid string), `key`, `popup`, `contact_id`, `title`, `description`, `body`, `links`, `type`, `event_type`, `event_id`, `created` (events-module change stamp), `read`, `priority`.
5. **Every other event type falls through silently** — no generic event-type→handler map, no notification, no error (same default-ignored policy as Part 45 item 9).
6. **Wire `global.enums.event_types` in the demo app** (currently absent) via the events module's exported `event_types` component, and add an enum entry for `action-approve` (the invite event types already arrive via the composed component — see decision below) — this makes the inbox type chips render and fixes the inbox type-filter dropdown, which builds its options from this global and is empty today.

## Current state

- `apps/demo/modules/notifications/vars.yaml:5-6` — `send_routine` ref commented out, so the module-manifest default (`[]`, a no-op routine) applies.
- `apps/demo/modules/notifications/send-routine.yaml` — a single `AxiosHttp` step against a `consume-notifications` connection that exists nowhere in the repo: a remnant of the Lambda architecture this design replaces. Deleted wholesale.
- **Three callers dispatch into `send-notification`** (the notifications module's InternalApi, `modules/notifications/api/send-notification.yaml`), all passing `{ event_ids }`:
  - the workflows engine, post-commit, for every committed workflow event (Part 38);
  - `modules/user-admin/api/invite-user.yaml:187` with the `invite-user` event id;
  - `modules/user-admin/api/resend-invite.yaml:55` with the `resend-user-invite` event id.
- **Fields the module surfaces read** from notification docs:
  - `contact_id`, `read`, `created.app_name` — bell count (`unread-count-request.yaml`) and inbox `$match` (`get-notifications.yaml`);
  - `created.timestamp` — sort + "Received … ago";
  - `title`, `description` — inbox card; `body` — view panel HTML (`view-notification.yaml:43-47`);
  - `event_type` — type chip lookup + the link page's invite branch (`pages/link.yaml:13-31`), which matches `invite-user`/`resend-user-invite` **without** `contact_id` and forwards to `links.button` before any auth check (`get-notification-for-link.yaml:19-23`);
  - `links.button.{pageId, urlQuery, input}` — the deep-link target;
  - `_id` — matched against the `_id` **URL-query string** by the link page, so `_id` must be a string, not an ObjectId.
- **The demo app has no `global:` section.** The inbox card chip (`list-notifications.yaml:70-78`) and view-panel header look up `_global: enums.event_types.{event_type}` and hide when it's missing, and the inbox type-filter options are built from `lowdefyGlobal('enums.event_types')` (`actions/set-types.yaml`) — so the filter dropdown is empty today.

## Reference schema — production `consumeNotifications`

> Anonymous reference: "the production notification pipeline" is the existing Lambda consumer whose `processNotificationTemplate` inserts notification docs read by apps sharing this notifications UI.

The production pipeline inserts:

| Field | Production value | Demo routine | Notes |
| --- | --- | --- | --- |
| `_id` | `uuid()` string | `$function` UUID per doc | See decision below. |
| `key` | `recordId:contactId:timestamp` dedup key | same, via `$concat` | Field written; no dedup lookup (see decision). |
| `popup` | template `popup` ?? `false` | `false` | Demo has no popup surface. |
| `contact_id` | `contact._id` from template pipeline | derived per branch | |
| `title`, `description` | nunjucks-rendered template strings | built in-pipeline (`$concat`/`$cond`) | |
| `body` | rendered email HTML | small static HTML string | Rendered by the inbox view panel. |
| `content` | rendered in-app JSX content | **dropped** | No consumer in the module. |
| `links` | object; non-string entries rewritten to link-page URLs | `{ button: { pageId, urlQuery } }` | The module's link page consumes the structured form directly. |
| `type` | template name | `quote-approved` / `user-invite` | |
| `event_type` | template event_type | the event doc's `type` | |
| `event_id` | source event `_id` | same | |
| `created` | `{ timestamp, app_name, service_name }` | events-module `change_stamp` | Deviation: carries `user` + `version` instead of `service_name` — strictly more audit info, and satisfies the repo's change-stamp-on-writes rule. `timestamp` + `app_name` (what the surfaces `$match` on) present in both shapes. |
| `read` | `false` | `false` | |
| `priority` | `?? 50` | `50` | |
| email fields | `lowercase_email`, `original_email`, `is_valid_email`, `error_email`, `text`, `send_email`, `email_result`, `cc_emails`, `files`, `send_email_timestamp`, `test_skip_email_send` | **dropped** | No email in the demo. |

## Routine shape

Two `MongoDBAggregation` steps on the events module's collection (`_module.connectionId: { id: events-collection, module: events }` — resolves at app level since the routine is entry-vars config), each ending in a `$merge` into the `notifications` collection (raw name; the notifications connection already has `write: true`):

```yaml
$merge:
  into: notifications
  on: _id
  whenMatched: keepExisting   # uuids never collide; defensive
  whenNotMatched: insert
```

No `:if` plumbing — an empty `$match` merges nothing, so non-matching dispatches (every other workflow event type, unknown ids) are silent no-ops by construction.

### Branch 1 — quote approved

```
$match  { _id: { $in: <event_ids> }, type: 'action-approve', 'metadata.action_type': 'send-quote' }
$lookup actions (raw collection name) on references.action_ids → the send-quote action
recipient = the action's status history entry whose stage == 'in-review',
            field created.user.id   (the submit transition = the quote submitter)
$project the notification doc:
  title: 'Quote approved'
  description: $concat of the event's created.user.name + ' approved your quote.'
  body: '<p>Your quote was approved.</p>'
  links.button: { pageId: 'lead-view', urlQuery: { _id: references.lead_ids.0 } }
  type: 'quote-approved', event_type: 'action-approve', event_id: event _id
$merge
```

Recipient policy carries over from Part 45 task 06 unchanged: the quote submitter is the minimal realistic reading (the approver would be notifying themselves); recipient/fan-out policy stays app-owned, the roles model remains deferred to Part 41.

### Branch 2 — invite mock

```
$match  { _id: { $in: <event_ids> }, type: { $in: ['invite-user', 'resend-user-invite'] } }
recipient = references.contact_ids.0   (the invited contact, set by both invite APIs)
$project the notification doc:
  title: $cond on type — 'You've been invited to the demo app' / 'Your demo app invite was resent'
  description: 'Sign in with your email address to get started.'
  body: a short HTML paragraph standing in for the production invite email
  links.button: { pageId: <user-account login page> }   # _module.pageId: { id: login, module: user-account }
  type: 'user-invite', event_type: the event's type, event_id: event _id
$merge
```

The notification **is** the mock email: in production the pipeline renders an invite email whose call-to-action is `/notifications/link?_id=…`; in the demo the same link works against the inserted doc — the link page's existing invite branch matches without `contact_id` and forwards to the login page.

### Shared mechanics

- `_id`: per-doc uuid string minted in-pipeline with the established production idiom:

  ```yaml
  $function:
    body: |
      function(){
        return UUID().toString().split('"')[1]
      }
    args: []
    lang: js
  ```

  Caveat: `$function` requires server-side JavaScript (available on the deployments these apps target; already used in production requests).

- `key`: `$concat` of `eventId:contactId:` + `$dateToString` of the event's `created.timestamp` — written for schema fidelity only.
- `created`: `_ref: { module: events, component: change_stamp }` — resolves config-side per request (the session user is the approver / inviter), injected into the `$project` as a literal object.

## Key decisions

- **`_id` is a uuid string minted via `$function`, exactly like production.** ObjectIds would break the link page's string match on the `_id` URL-query param. (An earlier draft derived `_id` from the dedup key; the `$function` idiom is already production-proven, so the schema stays faithful.) Consequence: `$merge on: _id` always inserts — re-dispatching the same event would duplicate. Accepted: the engine dispatches once per committed event, and the dedup lookup was explicitly descoped.
- **`key` field without dedup behavior.** Production `$lookup`s existing notifications by `key` and skips duplicates (one notification per event per contact). The demo writes the field but not the lookup — duplicates can't occur in the demo's dispatch pattern, and the lookup is speculative surface here.
- **`created` is the module change stamp, not the production `{timestamp, app_name, service_name}` stamp.** No technical blocker either way; the change stamp carries the two fields the surfaces match on plus `user`/`version`, and the repo rule mandates change stamps on writes. The single schema deviation is documented in the table above.
- **Two explicit branch steps, no handler registry.** Three handled event types don't justify a generic event-type→handler abstraction (Part 45 task 06's policy, kept).
- **`$merge` over a separate insert step.** One step per branch, no conditional plumbing, empty-match no-ops for free. Trade-off: `$merge` bypasses the connection's `changeLog` plugin behavior — notification inserts aren't change-logged. Production inserts via the Lambda bypass it identically; accepted.
- **Enums global is in scope.** Without `global.enums.event_types` the inbox filter is broken (empty options) and chips never render; the events module already exports the composed component, so the fix is a 5-line `global:` block plus one enum entry. The composed component already carries the invite entries: `modules/events/module.lowdefy.yaml:66` assigns `modules/shared/enums/event_types.yaml`, which `_ref`s `modules/user-admin/enums/event_types.yaml` (`invite-user`, `resend-user-invite`). Only `action-approve` exists nowhere and must be added app-side.

## Enums wiring

```yaml
# apps/demo/lowdefy.yaml
global:
  enums:
    event_types:
      _ref:
        module: events
        component: event_types
```

`apps/demo/modules/events/event_types.yaml` gains an `action-approve` entry (color/title/icon), joining the existing `create-lead`/`start-onboarding` entries. `invite-user` and `resend-user-invite` already render via the composed component's user-admin entries (`modules/shared/enums/event_types.yaml`). These also render anywhere else the global is consumed (events timeline already composes its own map; no conflict).

## Files changed

| File | Change |
| --- | --- |
| `apps/demo/modules/notifications/send-routine.yaml` | Rewrite: two `$merge`-terminated aggregation branches; delete the `AxiosHttp` remnant. |
| `apps/demo/modules/notifications/vars.yaml` | Uncomment the `send_routine` ref. |
| `apps/demo/lowdefy.yaml` | Add the `global.enums.event_types` block. |
| `apps/demo/modules/events/event_types.yaml` | Add the `action-approve` entry (invite entries already composed in). |
| `designs/workflows-module/parts/45-demo-rebuild/tasks/06-notifications-send-routine.md` | Reduce to a stub pointing here. |
| `designs/workflows-module/parts/45-demo-rebuild/design.md` | Annotate item 9: superseded by this design. |

## Acceptance criteria

- Approving the demo `send-quote` action produces exactly one unread inbox notification for the quote submitter; the bell increments; the inbox renders the card with a type chip; clicking through deep-links to the lead view.
- Inviting a user (and resending an invite) produces one notification doc for the invited contact; `/notifications/link?_id=<that doc>` forwards an unauthenticated browser to the login page.
- Inserted docs carry every field in the schema table's "Demo routine" column; no email fields.
- Approving any other action type, and every other workflow/event type, inserts nothing and raises nothing.
- `send-notification` invoked with unknown `event_ids` is a no-op.
- The inbox type-filter dropdown offers the types present in the user's notifications.
- No `consume-notifications` / `AxiosHttp` remnant remains; demo app builds.

## Non-goals

- Email delivery, templates, or any email-related doc fields.
- The notification roles/fan-out model (deferred to workflows Part 41).
- Key-based dedup behavior, popup notifications, socket counts, file attachments.
- A generic event-type→handler registry.
- Restructuring how `modules/shared/enums/event_types.yaml` composes per-module enum files.

## Related

- Supersedes: [workflows-module Part 45, task 06](../workflows-module/parts/_completed/45-demo-rebuild/tasks/06-notifications-send-routine.md); extends Part 45 design item 9.
- E2E ownership: the happy-path assertion (approve → submitter notification) stays with Part 45 task 08; in the e2e flow submitter and approver are the same mock session user.
