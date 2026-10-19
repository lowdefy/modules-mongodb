# Task 5: Add demo leads pages and inline leads connection

## Context

The demo needs a `leads` entity to host the onboarding workflow. The demo's pattern (confirmed in the design's finding #7 resolution) is **inline, not module-encapsulated** — `apps/demo/pages/` holds top-level pages (`404.yaml`, `avatar.yaml`, `home.yaml`, `router.yaml`); domain pages go in subdirectories under it. Connections are declared inline in `apps/demo/lowdefy.yaml`'s `connections:` block (currently containing one entry, `demo-contacts`, at line 99).

This task adds:

- A new `leads` MongoDB collection connection inline in `apps/demo/lowdefy.yaml`.
- Four lead pages under a new `apps/demo/pages/leads/` subdirectory: `lead-view.yaml`, `lead-edit.yaml`, `lead-new.yaml`, `lead-list.yaml`.
- Page registrations in `apps/demo/lowdefy.yaml`'s `pages:` block.

The lead pages stay minimal — they're demo fixtures. `lead-view.yaml` becomes the workflow-overview entry point in task 7 (where the "Start onboarding" + child-workflow admin buttons get added).

Reference patterns for minimal demo pages: `apps/demo/pages/home.yaml`, `apps/demo/pages/avatar.yaml`. For a richer view page using `layout.page`: `modules/contacts/pages/view.yaml`. The lead pages will eventually render `actions-on-entity` (a workflows module component) — that wiring happens in task 7.

## Task

### `apps/demo/lowdefy.yaml`

Two edits:

1. Extend the existing `connections:` block (currently containing only the `demo-contacts` entry at line 99) with a `leads-collection` `MongoDBCollection`. The connection ID must be `leads-collection` (not `leads`) because the workflows-module concept spec defines `entity_collection` as the MongoDB collection connection ID itself ([module-surface/spec.md:159](../../../workflows-module-concept/module-surface/spec.md): `entity_collection: string # required; MongoDB collection connection id (e.g. "leads-collection")`). The action YAML in task 4 declares `entity_collection: leads-collection` and the `vars.entities` map in task 6 keys on the same string — keep the three aligned by using the same ID at the connection layer.

```yaml
- id: leads-collection
  type: MongoDBCollection
  properties:
    databaseUri:
      _secret: MONGODB_URI
    collection: leads
    write: true
    changeLog:
      collection: log-changes
      meta:
        user:
          _user: true
```

2. Extend the existing `pages:` block (line 107 onward) with `_ref`s to the four new pages:

```yaml
pages:
  - _ref: pages/router.yaml
  - _ref: pages/avatar.yaml
  - _ref: pages/404.yaml
  - _ref: pages/home.yaml
  - _ref: pages/leads/lead-list.yaml
  - _ref: pages/leads/lead-new.yaml
  - _ref: pages/leads/lead-view.yaml
  - _ref: pages/leads/lead-edit.yaml
```

### `apps/demo/pages/leads/lead-list.yaml`

A minimal list page wrapped in `layout.page` with a Lowdefy `Request` block + `AgGridBalham` table backed by the `leads-collection` connection. ID: `lead-list`. Shows lead `name` and `email` columns plus a "New lead" button linking to `lead-new`. Sort the request by `_id` descending or `change_stamp.updated.timestamp` if leads carry a change stamp.

### `apps/demo/pages/leads/lead-new.yaml`

Form page wrapped in `layout.page` with two input blocks (`name`, `email`), a Save button that fires a `MongoDBCollection.insertOne` against the `leads-collection` connection writing `{ _id, name, email }` (let MongoDB generate the `_id`, or write a `_nanoid`-generated id), and a redirect on success to `lead-view?_id=<inserted-id>`. ID: `lead-new`.

### `apps/demo/pages/leads/lead-view.yaml`

Read-only detail page wrapped in `layout.page`. Fires a `MongoDBCollection.findOne` against the `leads-collection` connection matched by `_id: { _url_query: _id }`. Renders `name` and `email`. Includes an "Edit" button linking to `lead-edit?_id=<id>`. ID: `lead-view`. Leave a placeholder card or empty container where task 7 will drop `actions-on-entity` + the workflow buttons — do not wire those here.

### `apps/demo/pages/leads/lead-edit.yaml`

Form page wrapped in `layout.page`. Loads the lead by `_id`, two input blocks (`name`, `email`), Save button that fires `MongoDBCollection.updateOne` against the `leads-collection` connection setting `name` and `email`, redirect on success to `lead-view?_id=<id>`. ID: `lead-edit`.

## Acceptance Criteria

- `apps/demo/pages/leads/` directory exists with the four files above.
- `apps/demo/lowdefy.yaml`'s `connections:` block carries a new `leads` entry alongside the existing `demo-contacts`.
- `apps/demo/lowdefy.yaml`'s `pages:` block carries `_ref`s to all four new pages.
- Every page is wrapped in `layout.page` (cross-module `_ref: { module: layout, component: page, vars: {...} }`).
- `lead-list` renders with at least an empty state when the `leads` collection is empty.
- `lead-new` writes a new lead to MongoDB and redirects to `lead-view`.
- `lead-view` and `lead-edit` resolve `_url_query._id` and load the matching lead.
- `apps/demo` builds (`pnpm --filter=demo ldf:b`) without errors; nothing in `apps/demo` references the workflows module yet (task 6).
- Page IDs are kebab-case (`lead-view`, `lead-edit`, `lead-new`, `lead-list`) per CLAUDE.md "Kebab-case page IDs".

## Files

- `apps/demo/lowdefy.yaml` — **modify** (extend `connections:` and `pages:`)
- `apps/demo/pages/leads/lead-list.yaml` — **create**
- `apps/demo/pages/leads/lead-new.yaml` — **create**
- `apps/demo/pages/leads/lead-view.yaml` — **create**
- `apps/demo/pages/leads/lead-edit.yaml` — **create**

## Notes

- The `_id` query key convention here is `_id` (matches the `entities` map in task 6's wiring: `leads-collection` → `id_query_key: _id`).
- Do not depend on any workflows-module surface in these pages — task 7 adds that. The lead pages must build standalone.
- Use `MongoDBCollection` for the connection type, not the legacy `MongoDB`.
- For a sanity check, mirror the patterns in `modules/contacts/pages/all.yaml` (list), `pages/new.yaml`, `pages/view.yaml`, `pages/edit.yaml` — they show layout.page wiring, request shape, and the standard event/redirect dance.
