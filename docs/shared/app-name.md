---
type: shared
module: shared
title: App name scoping
concepts:
  - app_name
  - multi-app
  - scoping
---

# App name scoping

Multi-app deployments share user, contact, and event collections across apps. Documents are scoped by **`app_name`** so each app sees only the data it owns.

Modules that require it: `notifications`, `user-account`, `user-admin`, `contacts`. (`user-admin` also writes per-app fields under `app_attributes.{app_name}`.)

## Where it appears

- `created.app_name` on event and notification documents — set by the writing pipeline so reads can filter by app.
- `user.app_attributes.{app_name}` on user documents — per-app profile fields and access flags.
- `{app_name}.title` on event documents — per-app pre-rendered titles, stored at the **top level** of the event document keyed by app name (not nested under a `display` key) — see [Event display](event-display.md).
- `events.display_key` — the `display_key` var on the `events` module is the same string; events read the title back at `{display_key}.title`.

## Constraint: no dots

`app_name` becomes part of MongoDB field paths (`user.app_attributes.my.app` would be parsed as nested fields `user.app_attributes.my.app`, not as a single key `my.app`). Use letters, numbers, hyphens, and underscores — never `.`.

## Multi-app deployments

Pick a unique `app_name` per app and pass the same value to every module entry that needs it:

```yaml
modules:
  - id: events
    vars:
      display_key: ops-app
  - id: notifications
    vars:
      app_name: ops-app
  - id: user-account
    vars:
      app_name: ops-app
  - id: user-admin
    vars:
      app_name: ops-app
  - id: contacts
    vars:
      app_name: ops-app
```

Each app keeps its own scope of users-as-contacts, per-app access flags, notifications, and event display strings, while sharing the underlying `users`, `user_contacts`, `notifications`, and `log-events` collections.
