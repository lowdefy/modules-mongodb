# Task 5: Create the `timeline_action_lookup.yaml` fragment + re-export it

## Context

The events timeline used to draw a live "action status card" inline on the
most-recent event referencing each workflow action. Part 42 restores this via one
shared aggregation fragment that joins events to the `actions` collection,
projects an access-aware action display (`status`, `message`, single resolved
`link`), and de-duplicates so each action's card attaches only to its latest
referencing event (D1, D4, D5).

The fragment is spliced into a pipeline that has **already `$match`ed events down
to the target reference** (Task 7 does the splicing for the events module). It is
parameterized by one build-time `_var: app_name`. It composes the two shared
stages from Tasks 2 and 3:
- `../shared/workflow/visible_verbs.yaml` (compute `visible_verbs`)
- `../shared/workflow/resolve_action_link.yaml` (collapse the per-verb `links` map
  to one access-aware `link`)

**Join field (confirmed):** `action_ids` is a top-level array on every
action-referencing event doc — the engine's event dispatch writes
`references: { workflow_ids, action_ids, <refKey> }` and `new-event.yaml` spreads
`_payload: references` onto the doc. So the `$lookup` joins
`localField: action_ids` → `foreignField: _id`.

**De-dup semantics (carried verbatim from v0 `get_ticket_history`):**
`$unwind` actions → `$setWindowFields` (partition by `actions._id`, sort
`created.timestamp` asc, capture `last_event_id`) → `$group` by event `_id`,
pushing each action only when `last_event_id == _id` (else null) → filter nulls →
sort by `(sort_order, updated.timestamp)` → `$replaceRoot` back to the event.
This attaches the card to the visually-last event because `new-event.yaml` sets
both `date` and `created.timestamp` to `_date: now` at insert (D4 assumption).

Blocked actions are filtered out (matching v0 and the block, which also hides
`status === "blocked"`).

## Task

### 1. Create `modules/shared/workflow/timeline_action_lookup.yaml`

A YAML **sequence** of stages (consumers splice it via `_build.array.concat` —
see Notes). Sketch:

```yaml
# Shared timeline action-lookup fragment (Part 42 D1/D4/D5).
#
# Spliced (via _build.array.concat) into a pipeline that has ALREADY $match'd
# events to the target reference. Joins events → actions, projects an
# access-aware action card (status, message, single resolved link), and attaches
# each action only to its LATEST referencing event.
#
# Parameter: `_var: app_name`. Composes the shared `visible_verbs` and
# `resolve_action_link` stages (each parameterized by the same app_name).
- $lookup:
    from: actions
    localField: action_ids
    foreignField: _id
    as: actions
    pipeline:
      - $addFields:
          status:
            $arrayElemAt:
              - $status.stage
              - 0
      - $match:
          $expr:
            $ne:
              - $status
              - blocked
      - _ref:
          path: ../shared/workflow/visible_verbs.yaml
          vars:
            app_name:
              _var: app_name
      - _ref:
          path: ../shared/workflow/resolve_action_link.yaml
          vars:
            app_name:
              _var: app_name
      - $project:
          _id: 1
          sort_order: 1
          updated: 1
          status: 1
          link: 1
          message:
            _string.concat:
              - '$'
              - _var: app_name
              - '.message'
- $unwind:
    path: $actions
    preserveNullAndEmptyArrays: true
- $setWindowFields:
    partitionBy: $actions._id
    sortBy:
      created.timestamp: 1
    output:
      last_event_id:
        $last: $_id
        window:
          documents:
            - current
            - unbounded
- $group:
    _id: $_id
    event:
      $first: $$ROOT
    actions:
      $push:
        $cond:
          - $eq:
              - $last_event_id
              - $_id
          - $actions
          - null
- $addFields:
    event.actions:
      $filter:
        input: $actions
        cond:
          $ne:
            - $$this
            - null
- $addFields:
    event.actions:
      $sortArray:
        input: $event.actions
        sortBy:
          sort_order: 1
          updated.timestamp: 1
- $replaceRoot:
    newRoot: $event
- $project:
    last_event_id: 0
```

The inner `$lookup.pipeline` uses bare single-stage `_ref`s for `visible_verbs`
and `resolve_action_link` — each is a single `$addFields`, so it substitutes in
place without nesting. Order is required: `resolve_action_link` reads
`$visible_verbs`.

### 2. Re-export from the workflows manifest

In `modules/workflows/module.lowdefy.yaml`, add the component export so app
developers building custom timelines get a clean handle (they can't easily `_ref`
a relative `../shared/...` path from outside the monorepo):

```yaml
exports:
  components:
    # ...existing...
    - id: timeline-action-lookup
      description: >
        Aggregation fragment that enriches events with live action cards
        (status, message, access-resolved link); _ref into custom timeline
        pipelines via _build.array.concat.
components:
  # ...existing...
  - id: timeline-action-lookup
    component:
      _ref: ../shared/workflow/timeline_action_lookup.yaml
```

(The workflows manifest currently has no `exports:` block — confirm and add one,
or extend it if Part 38 added it. Match the placement/style of the existing
`components:` list.)

## Acceptance Criteria

- `modules/shared/workflow/timeline_action_lookup.yaml` exists as a multi-stage
  YAML sequence: `$lookup` (with inner `visible_verbs` + `resolve_action_link`
  refs and `{ _id, sort_order, updated, status, link, message }` projection) →
  `$unwind` → `$setWindowFields` → `$group` (keep-on-last-event) → null filter →
  `$sortArray` → `$replaceRoot` → `$project { last_event_id: 0 }`.
- The `$lookup` joins `localField: action_ids` / `foreignField: _id`.
- Blocked actions are filtered (`$match $status != blocked`).
- The workflows manifest exports a `timeline-action-lookup` component pointing at
  the shared fragment, with a `components:` entry and an `exports.components`
  entry.
- The Lowdefy build succeeds.

## Files

- `modules/shared/workflow/timeline_action_lookup.yaml` — **create**.
- `modules/workflows/module.lowdefy.yaml` — modify — add `timeline-action-lookup` to `exports.components` and `components`.

## Notes

- **Splicing a multi-stage fragment requires `_build.array.concat`** — Lowdefy
  `_ref` substitutes a node in place and nests (does not flatten) a list spliced
  as a single array item. The design's proposed-shape sketch shows a bare
  `- _ref:` mid-pipeline; that nests. Task 7 (and any app developer) must wrap the
  pipeline in `_build.array.concat` with the fragment ref as one element. Document
  this in the re-export description and in Task 9's docs.
- The fragment runs *after* the consumer's reference `$match`, so the
  "latest event" partition is scoped to the entity/action whose timeline is shown
  (D4).
