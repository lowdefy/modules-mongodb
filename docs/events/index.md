---
title: Events
module: events
type: index
---

# Events

Audit event log shared by every other module — a `new-event` API for logging, a timeline panel for rendering, and the `change_stamp` and `event_types` components consumed across the repo.

`events` has no module dependencies, so it sits at the bottom of the dependency graph. Every module that writes data either logs events or stamps audit metadata onto its writes through this module.

## Dependencies

None.

## When to use

Add `events` whenever another module that depends on it is present — it is a foundational dependency, not a user-facing feature module. Add it directly when you need a standalone audit timeline or the `change_stamp` component in a custom module.

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: events
    source: "github:lowdefy/modules-mongodb/modules/events@v0.8.1"
    vars:
      display_key: my-app
      change_stamp:
        timestamp:
          _date: now
        user:
          name:
            _user: profile.name
          id:
            _user: id
        app_name: my-app
      event_types:
        sync-job:
          title: Sync job
          color: blue
          icon: AiOutlineSync
```

`display_key` is required — it selects which per-app title to render from each event's `display.{display_key}` field.

## Components

- **`change_stamp`** — Audit metadata template. Consumers reference it as `_ref: { module: events, component: change_stamp }`. See [Change stamps](../shared/change-stamps.md).
- **`event_types`** — Map of `event_type → { title, color, icon }`. Merged with the `event_types` var. Pull a single field via `key`:

  ```yaml
  icon:
    _ref:
      module: events
      component: event_types
      key: login.icon
  ```

- **`events-timeline`** — Events-only timeline panel. Does not join the `actions` collection and renders no workflow action cards. Apps using workflows that want an action-enriched timeline use the workflows module's `workflows-events-timeline` component instead.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [Change stamps](../shared/change-stamps.md) — audit metadata stamped on every engine write
- [Event display](../shared/event-display.md) — per-app pre-rendered display titles
- [App name scoping](../shared/app-name.md) — how `display_key` selects the right title
- [Secrets](../shared/secrets.md) — `MONGODB_URI` and other connection secrets
