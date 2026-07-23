---
title: Events
module: events
type: index
concepts: [timeline, enrichment]
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

- **`events-timeline`** — The single entity timeline panel. It renders the event log and **self-enriches** with workflow action cards wherever an app's events reference actions — the cards are verb-filtered and link-collapsed server-side. Enrichment is data-driven, not a gate: an entity whose events reference no actions renders as a plain events-only timeline through the same code path. There is no second component to swap in; an action-enriched timeline is the default behaviour of this one panel.
- **`note-capture`** — An `@mention` rich-text note-capture modal that writes through this module's own `new-event` api. It is parameterised by four seams so no consumer's app/entity details leak into `events`: a `mentionable_users` options source (the host's own request or literal list — `events` never queries app users itself), an `entity_id` + `reference_field` pair naming the emitted event's primary reference array (e.g. `deal_ids`), an optional `company_id` for a secondary `company_ids` reference, and a `type` + `title_template` pair controlling the emitted event's type and display copy. See the component file header for the full vars list.

## Timeline enrichment

The timeline joins each event's referenced actions and renders their cards inline, gated only by the session user's roles against access data already denormalised onto each action. This is **app-wide and data-driven** — not a per-entity choice and not an on/off switch. Wherever an app's events carry `action_ids`, every entity timeline shows those cards; an entity (or a whole pure-CRM app) whose events reference no actions renders exactly as before, because the join matches nothing and returns no cards. The events-only path is the same query, so the two cannot drift.

Two vars point the engine at the app's collections. Both default to `null` on the module entry, and the engine falls back to its built-in collection names — so enrichment works out of the box and you override these only when your collections are named differently:

- **`actions_collection`** (default `null` → engine falls back to `actions`) — the actions collection the timeline joins to enrich events with action cards. Enrichment shows up wherever events carry `action_ids`; the join is inert when they don't.
- **`contacts_collection`** (default `null` → engine falls back to `user-contacts`) — the contacts collection joined to resolve each event author's avatar (`created.user.id` → `_id`). It falls back to author initials when an author has no matching contact, so it only ever adds an avatar and never breaks rendering.

### Worked example — turn on enrichment for the whole app

```yaml
# lowdefy.yaml  (the events module entry)
- id: events
  source: "github:lowdefy/modules-mongodb/modules/events@v1"
  vars:
    display_key: demo
    actions_collection: actions       # collection-name override; matches the engine default
    contacts_collection: user-contacts
```

Every entity timeline in the app now renders action cards for actions referenced by its events; entities whose events reference no actions render exactly as before. No entity-module change, no per-entity vars, no second component.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [Change stamps](../shared/change-stamps.md) — audit metadata stamped on every engine write
- [Event display](../shared/event-display.md) — per-app pre-rendered display titles
- [App name scoping](../shared/app-name.md) — how `display_key` selects the right title
- [Secrets](../shared/secrets.md) — `MONGODB_URI` and other connection secrets
