# Task 3: Add the invite mock-email branch to the send routine

## Context

Task 2 rewrote `apps/demo/modules/notifications/send-routine.yaml` with the `notify_quote_approved` step and wired the `send_routine` var. This task adds the second (and final) branch: the user-admin invite APIs' dispatches insert an inbox notification for the invited contact — the demo's mock of the production invite **email**. No email is sent anywhere.

**Callers:** `modules/user-admin/api/invite-user.yaml` logs an `invite-user` event with `references.contact_ids: [<invited contact _id>]` and dispatches its `eventId` to `send-notification`; `modules/user-admin/api/resend-invite.yaml` does the same with type `resend-user-invite`. Both event docs carry a `created` change stamp (the inviter's session).

**How the mock works:** in production the pipeline renders an invite email whose call-to-action is `/notifications/link?_id=<notification _id>`; in the demo the same link works against the inserted doc. The link page's request (`modules/notifications/requests/get-notification-for-link.yaml:19-23`) matches `event_type: invite-user` / `resend-user-invite` **without** `contact_id` — so an unauthenticated browser resolves the doc. For `invite-user` the page's `link_invite` action forwards straight to `links.button` (the login page); for `resend-user-invite` the unauthenticated fallback (`link_to_login`) forwards to login with a callback. Either way the unauthenticated browser lands on the login page.

## Task

Append a second `MongoDBAggregation` step to `apps/demo/modules/notifications/send-routine.yaml`, after `notify_quote_approved`, reusing the shared mechanics established in task 2 (uuid `_id` `$function`, `key` `$concat`, change-stamp `created`, `$literal` for booleans/numbers, `$merge` terminator):

```yaml
- id: notify_invite
  type: MongoDBAggregation
  connectionId:
    _module.connectionId:
      id: events-collection
      module: events
  properties:
    pipeline:
      - $match:
          _id:
            $in:
              _payload: event_ids
          type:
            $in:
              - invite-user
              - resend-user-invite
      - $set:
          recipient_id:
            $first: $references.contact_ids
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
          title:
            $cond:
              - $eq:
                  - $type
                  - invite-user
              - "You've been invited to the demo app"
              - "Your demo app invite was resent"
          description: Sign in with your email address to get started.
          body: "<p>You've been invited to the demo app. Sign in with your email address to get started.</p>"
          links:
            button:
              pageId:
                _module.pageId:
                  id: login
                  module: user-account
          type: user-invite
          event_type: $type
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
          whenMatched: keepExisting
          whenNotMatched: insert
```

Shape notes:

- **Recipient** is `references.contact_ids.0` — the invited contact, set by both invite APIs. No status-history derivation needed in this branch.
- **`event_type` is the event doc's `type`** (`$type` field path — distinguishes invite from resend), while **`type` is the literal template name `user-invite`** for both. The link page and inbox surfaces branch on `event_type`.
- **`links.button` has `pageId` only, no `urlQuery`** — the deep-link target is the login page, resolved config-side via `_module.pageId: { id: login, module: user-account }` (the user-account module's exported `login` page; resolves at app level since the routine is entry-vars config, design-resolved).
- The `created` change stamp's runtime operators evaluate per request — the stamp's user is the **inviter** (the admin session calling the invite API).
- One `body` string serves both event types (it stands in for the production invite email); `title` is the only `$cond` branch.

## Acceptance Criteria

- Demo app builds.
- Inviting a user produces exactly one notification doc for the invited contact (`contact_id` = invited contact `_id`, `type: 'user-invite'`, `event_type: 'invite-user'`); resending the invite produces one more with `event_type: 'resend-user-invite'`. No email is sent anywhere.
- Each doc carries every field in the design's "Demo routine" schema column (`_id` uuid string, `key`, `popup: false`, `title`, `description`, `body`, `links.button.pageId` = the scoped login page id, `type`, `event_type`, `event_id`, `created` change stamp, `read: false`, `priority: 50`) and no email fields.
- `/notifications/link?_id=<that doc's _id>` in an **unauthenticated** browser forwards to the login page (direct `links.button` forward for `invite-user`; login-with-callback fallback for `resend-user-invite`).
- Other event types still fall through silently; the quote-approved branch from task 2 is unaffected.
- The inbox type-filter dropdown offers the types present in the user's notifications (intersection logic in `set-types.yaml` against task 1's global).

## Files

- `apps/demo/modules/notifications/send-routine.yaml` — modify — append the `notify_invite` step.

## Notes

- The invited contact has no account yet, so they won't see the inbox card until after sign-up — the notification's purpose is the link-page flow (the mock email CTA) plus a populated inbox on first login.
- The `invite-user` / `resend-user-invite` enum chips already render via the composed `event_types` component (user-admin entries) — no app-side enum additions in this task.
