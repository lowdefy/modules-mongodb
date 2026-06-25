---
title: Activities
module: activities
type: index
---

# Activities

CRM activities — calls, meetings, emails. Past-tense external-interaction logs linked to contacts and companies. Activities have a lifecycle (`open → done | cancelled`, with `reopen`); built-in types (`call`, `meeting`, `email`) are created `done` since they are logged after the fact. Consumer-defined types extend the built-in enum via the `activity_types` var.

Forward-looking work items and ad-hoc text notes are out of scope — use a tasks module for the former and the events module's comment pattern for the latter.

## Dependencies

| Module | Why |
|---|---|
| [layout](../layout/index.md) | Page wrapper |
| [events](../events/index.md) | Audit logging and `change_stamp` |
| [contacts](../contacts/index.md) | Contact selector and linking |
| [companies](../companies/index.md) | Company selector and linking |
| [files](../files/index.md) | Optional file attachments |

Companies and contacts do **not** depend on activities. Apps that want activity tiles on companies/contacts wire `tile_activities` into the parent module's sidebar slots from app config.

## When to use

Add `activities` when an app needs a CRM-style log of past external interactions — calls, meetings, emails — linked to contacts and companies. Not for tasks, action items, or free-text notes.

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: activities
    source: "github:lowdefy/modules-mongodb/modules/activities@v0.8.1"
    vars:
      app_name: my-app
      label: Activity
      label_plural: Activities
      activity_types:
        quote:
          title: Quote
          color: "#fa8c16"
          icon: AiOutlineFileText
          default_stage: open
          type: complex
```

Defaults work out of the box. To point the module at a different MongoDB collection, remap `activities-collection` via the entry's `connections` mapping.

## Agenda topics (meeting activities)

Meeting activities carry a built-in Agenda Topics section in the form. Topics are stored as task documents in the `actions` collection (`kind: task`), linked back via `activity_ids`. See the `lookup_collections.actions` var if your app maps `actions-collection` to a non-default collection name. Any host-app per-workflow uniqueness index on `actions` must be **partial** (`partialFilterExpression: { type: { $exists: true } }`) to exclude untyped task docs.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [App name scoping](../shared/app-name.md) — how `app_name` keys event display data
- [Event display](../shared/event-display.md) — per-app Nunjucks title templates
- [Slots](../shared/slots.md) — `fields`, `components`, `request_stages` extension points
- [Change stamps](../shared/change-stamps.md) — audit metadata stamped on writes
- [Secrets](../shared/secrets.md) — `MONGODB_URI` and other connection secrets
