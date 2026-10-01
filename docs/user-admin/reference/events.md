---
title: Audit events
module: user-admin
type: reference
concepts: [audit-events, event-metadata, before-after, roles, member-attributes]
---

# User Admin — Audit events

Each write routine ends with an event written through the
[`events`](../../events/index.md) module's `new-event` endpoint, into `log-events`.
The event is the routine's last step, so it is written only when every write before
it succeeded. Its display title comes from the module's
[`event_display`](../../shared/event-display.md) var, and its `references` tie it to
the target's timeline.

The events below also record what the write changed, under `metadata.before` and
`metadata.after`. Each value is read in the same routine: `before` from the stored
row before the first write step, `after` from the stored row after the last one. The
exceptions are `member-invited`, whose `after` is the access the invitation was sent
with, and `profile-updated`, whose values come from the contact reads the shared
`write-profile` fragment already makes.

## Shapes

An **access** value is the member row in the instance's organization (`org_slug`):

```yaml
roles: [manager] # the row's app_roles; [] when unset
attributes: { team: beta } # the row's member attributes; {} when unset
```

| Event type                | Endpoint                 | `metadata.before`            | `metadata.after`             |
| ------------------------- | ------------------------ | ---------------------------- | ---------------------------- |
| `access-updated`          | `update-access`          | access                       | access                       |
| `member-invited`          | `invite`                 | (none)                       | access, as invited           |
| `member-removed`          | `remove-member`          | access                       | (none)                       |
| `user-deleted`            | `delete-user`            | access                       | (none)                       |
| `org-role-updated`        | `update-org-role`        | `owner`, `admin` or `member` | `owner`, `admin` or `member` |
| `user-attributes-updated` | `update-user-attributes` | the user row's `attributes`  | the user row's `attributes`  |
| `profile-updated`         | `update-profile`         | the written profile fields   | the written profile fields   |

Both access values are recorded in full on every `access-updated` event, so a save
that changes only member attributes shows the attribute difference with `roles`
equal on both sides.

- **`member-removed` and `user-deleted`** record the access the person held in this
  organization before the delete. `remove-member` finds the row by the member id it
  was called with; called with an email instead, it records `before: null`.
  `delete-user` reads the row after its other-memberships guard.
- **`org-role-updated`** records the organization-authority tier (`member.role`); an
  unset tier reads as `member`.
- **`profile-updated`** records the fields the form submitted (the keys of the
  payload's `profile`), each as stored on the contact before and after the write. A
  field the contact did not hold is `null` in `before`. `photo` is left out, because
  it holds the uploaded image as a data URI.

An access value is `null` when no member row matches the read.

## Example

An `access-updated` event for a save that changed a member attribute only:

```yaml
type: access-updated
references:
  user_ids: [u_123]
metadata:
  before:
    roles: [manager]
    attributes: { team: alpha }
  after:
    roles: [manager]
    attributes: { team: beta }
```

## Related

- [Event display](../../shared/event-display.md) — the per-type title templates
- [Members row contract](row-contract.md) — where `roles` and `member_attributes` come from on a read
