---
title: User Account
module: user-account
type: index
---

# User Account

Self-service account pages — passwordless login, email-verification confirmation, profile view/edit, first-time profile creation, and logout. The end-user side of the user/contact schema; the operator side lives in [`user-admin`](../user-admin/index.md).

## Dependencies

| Module                       | Why                                               |
| ---------------------------- | ------------------------------------------------- |
| [layout](../layout/index.md) | Page wrapper, auth-page wrapper, profile dropdown |
| [events](../events/index.md) | Audit logging and `change_stamp`                  |

## When to use

Add `user-account` to any app that needs passwordless email-based login and self-service profile management. Provides the `profile-avatar`, `user-selector`, `user-multi-selector`, and `user-avatar` components consumed by `layout`, `activities`, and `workflows`.

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: user-account
    source: "github:lowdefy/modules-mongodb/modules/user-account@v0.8.1"
    vars:
      app_name: my-app
      fields:
        show_honorific: true
        profile:
          _ref: modules/shared/profile/fields.yaml
```

`app_name` is required. Drop the `profile-default` menu into your app's `id: profile` menu for a zero-config dropdown:

```yaml
# apps/{app}/menus.yaml
- id: profile
  links:
    _ref:
      module: user-account
      menu: profile-default
```

See `apps/demo/modules/user-account/vars.yaml` for a worked example. The login and verify-email-request pages render through the layout module's `auth-page` component — configure its appearance on the `layout` module entry.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [App name scoping](../shared/app-name.md) — how `app_name` keys event metadata
- [Event display](../shared/event-display.md) — per-app Nunjucks title templates
- [Slots](../shared/slots.md) — `fields`, `components`, `request_stages` extension points
- [Change stamps](../shared/change-stamps.md) — audit metadata stamped on writes
- [Avatar colors](../shared/avatar-colors.md) — gradient pairs for avatar backgrounds
- [Secrets](../shared/secrets.md) — `MONGODB_URI` and other connection secrets
