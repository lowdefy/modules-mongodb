---
title: Contacts
module: contacts
type: index
---

# Contacts

Contact management — list, detail, edit, and create pages over the shared `user-contacts` collection, plus a rich contact selector with inline add/edit/verify, a basic dropdown selector, and a role-scoped selector (`role-contact-selector`, single or multiple) that stores a view-renderable denormalized contact value.

User records (`apps.{slug}.is_user === true`, managed by `user-admin` and `user-account`) are excluded from the contact list and are not editable through this module.

## Dependencies

| Module                             | Why                                        |
| ---------------------------------- | ------------------------------------------ |
| [layout](../layout/index.md)       | Page wrapper                               |
| [events](../events/index.md)       | Audit logging and `change_stamp`           |
| [companies](../companies/index.md) | Company selector and bidirectional linking |
| [files](../files/index.md)         | Optional file-attachments sidebar tile     |

Cross-module cycle: `companies ↔ contacts`. Both must be added as separate entries in `lowdefy.yaml`.

## When to use

Add `contacts` when an app needs to manage individual people — CRM contacts, leads, or any person linked to companies. Provides the `contact-selector` consumed by `companies`, `activities`, and other modules.

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: contacts
    source: "github:lowdefy/modules-mongodb/modules/contacts@v0.8.1"
    vars:
      fields:
        show_honorific: true
        profile:
          _ref: modules/shared/profile/fields.yaml
        global_attributes:
          - id: global_attributes.notes
            type: TextArea
            properties:
              title: Internal Notes
```

The is_user guard and per-app access flags read the app's own `slug` — nothing to pass. To extend forms, lists, or pipelines, see [Slots](../shared/slots.md). See `apps/demo/modules/contacts/vars.yaml` for a worked example.

## Write behaviour

Both write APIs derive part of the contact themselves, so a payload does not get to set these:

- **`create-contact` mints the contact `_id` server-side.** A payload's `_id` is ignored. Read the created id off the response's `contactId` — as both in-module callers already do. The API still de-duplicates on `lowercase_email`, so a retried create converges on one contact rather than duplicating.
- **`profile.name`, `profile.avatar_color` and `profile.picture` are computed by the write**, from `given_name`, `family_name` and the `avatar_colors` palette. A payload's `picture` is ignored — the avatar can no longer go stale when a contact is renamed. See [Avatar colors](../shared/avatar-colors.md).

`request_stages.write` still runs **after** these, so a consumer stage that overrides a derived field wins.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [App slug scoping](../shared/app-name.md) — how the app's `slug` guards user-record edits
- [Event display](../shared/event-display.md) — per-app Nunjucks title templates
- [Slots](../shared/slots.md) — `fields`, `components`, `request_stages` extension points
- [Change stamps](../shared/change-stamps.md) — audit metadata stamped on writes
- [Avatar colors](../shared/avatar-colors.md) — gradient pairs for avatar backgrounds
- [Secrets](../shared/secrets.md) — `MONGODB_URI` and other connection secrets
