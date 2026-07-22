---
title: User Admin
module: user-admin
type: index
---

# User Admin

User administration — list, search, invite, edit, and manage user access for an app. Operates on the shared `user-contacts` collection with per-app data namespaced under `apps.{app_name}`, so a single collection serves multiple apps.

The end-user counterpart is [`user-account`](../user-account/index.md).

## Dependencies

| Module                                     | Why                              |
| ------------------------------------------ | -------------------------------- |
| [layout](../layout/index.md)               | Page wrapper                     |
| [events](../events/index.md)               | Audit logging and `change_stamp` |
| [notifications](../notifications/index.md) | Invite + resend dispatch         |

## When to use

Add `user-admin` when an app needs operator-facing user management — inviting users, managing roles, editing access, and viewing the user list. Pairs with `user-account` which covers the end-user self-service side.

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: user-admin
    source: "github:lowdefy/modules-mongodb/modules/user-admin@v0.8.1"
    vars:
      app_name: my-app
      app_title: Team
      roles:
        _ref: modules/user-admin/roles.yaml
      fields:
        show_honorific: true
        profile:
          _ref: modules/shared/profile/fields.yaml
        global_attributes:
          _ref: modules/user-admin/global_attributes_fields.yaml
        app_attributes:
          _ref: modules/user-admin/app_attributes_fields.yaml
```

`app_name` and `roles` are required. See `apps/demo/modules/user-admin/vars.yaml` for a worked example. User documents share the `user-contacts` collection with plain contacts — users are distinguished by `apps.{app_name}.is_user === true`. The `contacts` module excludes user records from its list; this module is the only writer for users.

## Invite emails

The module ships its own invite templates (`notifications:` in the manifest, Lowdefy ≥ the module-notifications release) and dispatches them **directly** to the notifications module's `dispatch-notifications` pipeline — apps do not define invite templates or shape invite events in `send_routine`. Template ids scope to the entry id: records carry `type: user-admin/invite-user` / `user-admin/resend-user-invite`, and the notifications module's `public_link_types` default already includes these conventional scoped types (override the var when installing under a different entry id, and add them to the app's `event_types` enum for inbox badges).

The sign-in button targets the `login_page_id` var (default `user-account/login` — the user-account module's login page under its conventional entry id) with the invitee's email in the `hint` query param. Invite events are still logged via the events module; they just no longer flow through `send-notification`.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [App name scoping](../shared/app-name.md) — how `app_name` keys per-app data paths
- [Event display](../shared/event-display.md) — per-app Nunjucks title templates
- [Slots](../shared/slots.md) — `fields`, `components`, `request_stages` extension points
- [Change stamps](../shared/change-stamps.md) — audit metadata stamped on writes
- [Avatar colors](../shared/avatar-colors.md) — gradient pairs for avatar backgrounds
- [Secrets](../shared/secrets.md) — `MONGODB_URI` and other connection secrets
