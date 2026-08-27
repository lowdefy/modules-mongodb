---
title: Contacts
module: contacts
type: index
---

# Contacts

Contact management — list, detail, edit, and create pages over the shared `user-contacts` collection, plus a rich contact selector with inline add/edit/verify, a basic dropdown selector, and a role-scoped selector (`role-contact-selector`, single or multiple) that stores a view-renderable denormalized contact value.

User records (`apps.{app_name}.is_user === true`, managed by `user-admin` and `user-account`) are not editable through this module — the edit page, the view page and `update-contact` all guard on the flag.

They do still appear in listings by default. Set `exclude_users_from_selectors` to drop them from `basic-contact-selector` and `role-contact-selector` — `this-app` drops users of this app (`apps.{app_name}.is_user`), `any-app` drops anyone flagged `is_user` under any key of the `apps` map, which is what you want when sibling apps share the collection. The rich `contact-selector` is not covered by that var — exclude them there per call site with its `filter` var. To drop them from the contacts list page as well, add a `$match` via `request_stages.get_all_contacts`.

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
    source: "github:lowdefy/modules-mongodb/modules/contacts@v0.34.0"
    vars:
      app_name: my-app
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

`app_name` is required. To extend forms, lists, or pipelines, see [Slots](../shared/slots.md). See `apps/demo/modules/contacts/vars.yaml` for a worked example.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [App name scoping](../shared/app-name.md) — how `app_name` guards user-record edits
- [Event display](../shared/event-display.md) — per-app Nunjucks title templates
- [Slots](../shared/slots.md) — `fields`, `components`, `request_stages` extension points
- [Change stamps](../shared/change-stamps.md) — audit metadata stamped on writes
- [Avatar colors](../shared/avatar-colors.md) — gradient pairs for avatar backgrounds
- [Secrets](../shared/secrets.md) — `MONGODB_URI` and other connection secrets
