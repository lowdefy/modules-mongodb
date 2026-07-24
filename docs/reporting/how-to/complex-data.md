---
title: Reporting over complex data
module: reporting
type: how-to
concepts: [catalog, relationships, mongodb-views, grain, fan-out, field-hiding]
---

# Reporting over complex data

Real schemas are not flat — they have embedded sub-documents, arrays, object-arrays, and links between collections. On the [open query engine](../concepts/open-query-engine.md) the agent handles all of these **directly**: it authors `$lookup`, `$unwind`, and array-expression pipelines over the base collections you declare in the [catalog](../reference/catalog.md). Views are no longer required for joins or arrays.

This guide covers two things:

1. **Joining and unwinding directly** — the default path. Declare `relationships` in the catalog and the agent `$lookup`s for you.
2. **Views as an optional convenience** — when you want a fixed grain (so counts are exact) or want to hide fields.

## 1. Direct joins and unwinds (the default)

Declare each cross-collection link as a `relationship` on the catalog entry, and expose the join-target collection too. The agent reads the relationships and authors correct `$lookup`s.

```yaml
demo_contacts:
  description: People, each belonging to one or more companies.
  fields:
    profile.name: { type: string, description: Contact full name }
    global_attributes.company_ids:
      type: array
      description: Scalar array of demo_companies `_id`s the contact belongs to
  relationships:
    - field: global_attributes.company_ids
      collection: demo_companies
      foreignField: _id

demo_companies: # must also be cataloged — it is a $lookup.from target
  description: Company records; `_id` is the join key.
  fields:
    _id: { type: string, description: Company id }
    name: { type: string, description: Company name }
```

With both collections cataloged and the relationship declared, the agent can unwind `company_ids`, `$lookup` into `demo_companies`, and group — no view needed. Both collections must be in the catalog; the engine enforces the union of their `roles` on any pipeline that touches both.

Embedded scalars and time-series need nothing special: the agent reads dotted paths (`source.channel`, `created.timestamp`) and groups on a truncated date (`$dateTrunc`) directly.

## 2. The grain / fan-out risk

Direct joins are powerful but not automatically correct. **Unwinding a one-to-many array multiplies parent rows**, so summing a parent field after an `$unwind` double-counts. The engine does **not** guarantee aggregates are fan-out-free — this is a [known, documented risk](../concepts/open-query-engine.md#grain-and-fan-out-a-known-documented-risk). Two things mitigate it:

- **Prompting.** The agent is told about grain and steered toward distinct-counting (`$addToSet` + `$size`) when it unwinds.
- **Clear `description`s.** State a collection's grain and what a "count" means in its catalog `description`, so the agent reasons correctly.

## 3. Views — an optional convenience

A read-only MongoDB **view** is a saved aggregation over a source collection — no stored data, no sync — that presents complex data as a flat collection at a chosen grain. Catalog a view exactly like a base collection (it is a first-class catalog citizen). Use one when you want either of:

### Fixed grain, exact counts

Bake the `$lookup`/`$unwind` and current-status extraction into the view so the grain is fixed once and every count is exact — the agent can't fan it out because the fan-out already happened at a controlled grain.

```js
// view: demo_activities_report  (viewOn: demo_activities) — one row per activity
[{ $addFields: { current_stage: { $arrayElemAt: ["$status.stage", 0] } } }][
  // view: demo_action_assignees  (viewOn: demo_actions) — one row per (action, assignee)
  { $unwind: { path: "$assignees", preserveNullAndEmptyArrays: false } }
];
```

Catalog the view and state its grain plainly:

```yaml
demo_action_assignees:
  description: >
    Actions exploded to one row per assignee (workload view). A count is the
    number of assignments, not distinct actions. A read-only view over demo_actions.
  fields:
    assignees.name: { type: string, description: Assigned person }
    current_stage: { type: string, description: Current status stage }
```

### Field hiding

There is [no field-level scoping in the catalog](../reference/catalog.md#roles-semantics) — declaring a collection exposes all its fields. To expose a collection while hiding some fields, define a view that `$project`s the sensitive fields away and catalog **the view** instead of the base collection.

## Creating views

Views are database DDL, so they are created outside the app (the MongoDB connection only does CRUD):

- **Production:** define them in a migration, or once with `db.createCollection(name, { viewOn, pipeline })`.
- **Demo:** `apps/demo/scripts/seed-reporting-domain.mjs` seeds a linked domain and creates the demo views (`demo_activities_report`, `demo_actions_report`, `demo_action_assignees`, `demo_contact_companies`). Run `pnpm --filter @lowdefy/modules-demo reporting:seed`.

## When to reach for a view

| Situation                                               | Approach                                                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Join two collections, parent grain, exact counts matter | Direct `$lookup` (catalog the relationship) — or a report view if you want the grain guaranteed |
| Unwind a child array and count children                 | Direct `$unwind` — or a relational view for a stable per-child grain                            |
| Aggregates must be provably free of double-counting     | View at a fixed grain                                                                           |
| Expose a collection but hide some fields                | View with a `$project`                                                                          |
| A heavy view is too slow                                | Switch that one to an on-demand materialized view (`$merge` on a schedule)                      |

Plain views compute on read (zero storage). A view is the surest way to hand the agent a shape where fan-out can't happen — but it is a convenience now, not a requirement.
