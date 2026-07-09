---
title: Reporting over complex data
module: reporting
type: how-to
concepts: [data-dictionary, mongodb-views, dotted-paths, date-buckets, grain]
---

# Reporting over complex data

The analytics engine queries **one collection of scalar fields** and compiles to a fixed, read-only pipeline (`$match / $group / $project / $sort / $limit`). That narrow surface is the security boundary: the AI only ever names dictionary ids, and no AI-supplied string becomes a field path, collection, or operator.

Real schemas are not flat — they have embedded sub-documents, arrays, object-arrays, and links between collections. This guide shows how to report over them **correctly**, using two mechanisms:

1. **Dotted field paths + date buckets** — in the dictionary, for embedded scalar fields and time-series. No view needed.
2. **Read-only MongoDB views** — for arrays, object-arrays, and cross-collection joins. The view bakes the `$lookup`/`$unwind` in at a fixed grain; the engine queries it flat.

The rule of thumb: **if the data would fan out (a one-to-many array or join), it belongs in a view**, so the grain is fixed once and every count/sum is exact — never left to whatever the AI composes.

## 1. Dotted paths (embedded sub-documents)

A dimension or measure may declare an author-controlled `field` — a dotted path into the document. It defaults to the `id`, so flat fields need nothing. The `id` stays the AI-facing name and the output column; `field` is where the value comes from.

```yaml
dimensions:
  - id: channel
    type: string
    field: source.channel # embedded sub-document
  - id: region
    type: string
    field: entity.region
```

Dotted paths are safe because they come from the trusted dictionary at build time, never from the AI. They are validated against a strict pattern (no `$`, no leading digit, no empty segments). Reach array elements with a **view** (below), not a dotted path.

## 2. Date buckets (time series)

A `date` dimension may declare a `bucket` (`year`, `month`, `week`, or `day`). The engine groups on a truncated date — no pre-computed month string, and no extra pipeline stage.

```yaml
dimensions:
  - id: created
    type: date
    field: created.timestamp
    bucket: month
```

Grouping by `created` now yields one row per month. `bucket` is only valid on a `date` dimension.

## 3. Views for arrays, object-arrays, and joins

Point a dataset's `source.collection` at a read-only MongoDB view. The view is a saved aggregation over a source collection — **no stored data, no sync** — that presents complex data as a flat collection at a chosen grain.

There are two recurring formulas.

### Formula A — the "report" view (one row per entity)

Flatten current status and denormalize **many-to-one** joins. Grain stays one row per entity, so parent counts/sums are exact.

```js
// view: activities_report  (viewOn: activities)
[{ $addFields: { current_stage: { $arrayElemAt: ["$status.stage", 0] } } }]

// view: actions_report  (viewOn: actions) — join the parent workflow (M:1)
[
  { $lookup: { from: "workflows", localField: "workflow_id", foreignField: "_id", as: "workflow" } },
  { $unwind: { path: "$workflow", preserveNullAndEmptyArrays: true } },
  { $addFields: { current_stage: { $arrayElemAt: ["$status.stage", 0] } } },
]
```

The dataset then uses dotted `field` for the joined/nested columns:

```yaml
- id: actions
  source: { collection: actions_report }
  dimensions:
    - { id: kind, type: string }
    - { id: stage, type: string, field: current_stage }
    - { id: workflow_type, type: string, field: workflow.workflow_type }
  measures:
    - { id: count, type: count }
```

### Formula B — the "relational" view (unwind to child grain)

Unwind **one** array (object-array or scalar-FK array) to reach child grain. Add these only for insights you want at that grain, and be explicit about what a count means.

```js
// view: action_assignees  (viewOn: actions) — one row per (action, assignee)
[{ $unwind: { path: "$assignees", preserveNullAndEmptyArrays: false } }]

// view: contact_companies  (viewOn: contacts) — one row per (contact, company)
[
  { $unwind: { path: "$global_attributes.company_ids", preserveNullAndEmptyArrays: false } },
  { $lookup: { from: "companies", localField: "global_attributes.company_ids", foreignField: "_id", as: "company" } },
  { $unwind: { path: "$company", preserveNullAndEmptyArrays: true } },
]
```

```yaml
- id: action_assignees
  # Grain: one row per (action, assignee). `count` is assignments, not actions.
  source: { collection: action_assignees }
  dimensions:
    - { id: assignee, type: string, field: assignees.name }
  measures:
    - { id: count, type: count }
```

## The grain rule (why this is correct)

Unwinding a child array multiplies parent rows. If you unwound `assignees` and then summed a parent field, you'd double-count. The view fixes this by **committing to one grain**: `actions_report` is per-action (sum parent fields freely); `action_assignees` is per-assignment (count assignments, don't sum parent money). State the grain in the dataset `description` so the agent — and you — never conflate them. Never combine a parent measure with an unwound-child dimension in the same dataset.

## Creating views

Views are database DDL, so they're created outside the app (the MongoDB connection only does CRUD):

- **Production:** define them in a migration, or once with `db.createCollection(name, { viewOn, pipeline })`.
- **Demo:** `apps/demo/scripts/seed-reporting-domain.mjs` seeds a linked domain and creates the four views used by the `activities`, `actions`, `action_assignees`, and `contact_companies` datasets. Run `pnpm --filter @lowdefy/modules-demo reporting:seed`.

## Catalog sketch

For a full schema, expect roughly:

- **One "report" view per entity** you want current-status or time-series on (activities, actions, workflows, contacts, companies, events, files, notifications).
- **A relational view per child-grain insight** (assignees, activity contacts, status history, contact↔company, event references).

Storage is zero (plain views compute on read). If a heavy view is ever too slow, switch that one to an on-demand materialized view (`$merge` on a schedule) — not the default.
