# Task 7: Wire the fragment + self-card filter + `actionStatusConfig` into `events-timeline`

## Context

The events module's `events-timeline.yaml` component runs a plain
`$match` → `$sort` → title/description/info projection. It does no `$lookup`, so
`event.actions` is always empty and no live action card renders, and it passes no
`actionStatusConfig` to the `EventsTimeline` block. This task wires it up so the
timeline renders live action cards **always** (D2), with no new author-facing
config.

By the time this task runs:
- Task 1 moved the status enum to `modules/shared/enums/action_statuses.yaml`.
- Task 5 created `modules/shared/workflow/timeline_action_lookup.yaml` (a
  multi-stage fragment, parameterized by `_var: app_name`).
- Task 6 reconciled the block's `EventAction` to the enum's colour keys.

The component (`modules/events/components/events-timeline.yaml`) already carries:
- `display_key` (the app name — the idioms doc confirms `display_key` *is* the
  app name), used in the existing `$match`/`$addFields` via
  `_var: { key: display_key, default: { _module.var: display_key } }`.
- `reference_value` as a request payload (`payload.reference_value`) — the id the
  whole timeline is keyed on.

Two design decisions land here:
- **D2 — always-on.** Splice the fragment on every fetch; the only parameter is
  `app_name`, passed from `display_key`. Safe with no actions: `$lookup` against a
  missing/empty `actions` collection yields empty arrays.
- **D6 — drop the timeline's own action card.** When the timeline is keyed on an
  action (e.g. the action view page, where Part 33 mounts this component with
  `reference_field: action_ids`, `reference_value: get_action._id`), the fragment
  would attach a self-referential card for the very action whose page you're on.
  A `$filter` **after** the fragment strips the action whose `_id` equals the
  timeline's own `reference_value`. On an entity-page timeline `reference_value`
  is an entity id, so no `action._id` matches and the stage is a no-op.

## Task

### 1. Splice the fragment + D6 filter into the `get-events` pipeline

The fragment is a **multi-stage list**; a bare `- _ref:` mid-pipeline would
**nest, not flatten** (Lowdefy `_ref` substitutes a node in place). Restructure
the `pipeline` to use `_build.array.concat` so the fragment's stages flatten in.
Target shape:

```yaml
properties:
  pipeline:
    _build.array.concat:
      - - $match:                       # unchanged (reference key + display_key $ne null)
            _object.fromEntries: [ ... ]
      - _ref:                            # NEW — always spliced (D2)
          path: ../shared/workflow/timeline_action_lookup.yaml
          vars:
            app_name:
              _var:
                key: display_key
                default:
                  _module.var: display_key
      - - $addFields:                    # NEW — drop the timeline's own action card (D6)
            actions:
              $filter:
                input: $actions
                as: a
                cond:
                  $ne:
                    - $$a._id
                    - _payload: reference_value
        - $sort:                         # unchanged
            date: -1
        - $addFields:                    # unchanged — title / description / info
            title: { ... }
            description: { ... }
            info: { ... }
```

Preserve the existing `$match`, `$sort`, and title/description/info `$addFields`
content exactly — only the pipeline *structure* (wrap in `_build.array.concat`)
and the two new stages change.

### 2. Pass `actionStatusConfig` to the block

On the `events-timeline` `EventsTimeline` block, add the prop as base enum ⊕
per-app override (mirroring the sibling `eventTypeConfig`):

```yaml
actionStatusConfig:
  _build.object.assign:
    - _ref: ../shared/enums/action_statuses.yaml
    - _module.var: action_statuses_display
```

### 3. Add the `action_statuses_display` var to the events manifest

In `modules/events/module.lowdefy.yaml`, add the var (mirroring `event_types`):

```yaml
action_statuses_display:
  type: object
  default: {}
  description: >
    Per-status display overrides for the shared action_statuses enum, merged onto
    the shared base for the timeline's live action cards. Keep in sync with the
    workflows module's `action_statuses_display` by pointing both module entries
    at one app-local file, e.g.
    `action_statuses_display: { _ref: <app>/action_statuses_display.yaml }`.
```

events **must not** depend on workflows (it's the foundational logging module,
usable in workflow-free apps), so it carries its **own** override var — do not add
a workflows dependency.

## Acceptance Criteria

- `get-events` pipeline uses `_build.array.concat`; the fragment ref is spliced
  with `app_name` from `display_key`; the D6 `$filter` runs after the fragment and
  before `$sort: { date: -1 }`.
- The `EventsTimeline` block receives `actionStatusConfig` = shared enum ⊕
  `action_statuses_display`.
- `modules/events/module.lowdefy.yaml` declares the `action_statuses_display` var
  (object, default `{}`) with the "point both entries at one file" guidance.
- The Lowdefy build succeeds. With the demo's workflows configured, an entity
  timeline renders a live action card on the latest referencing event; an
  action-keyed timeline renders **no** self-referential card; an action-free
  timeline renders no cards and no errors.

## Files

- `modules/events/components/events-timeline.yaml` — modify — `_build.array.concat` pipeline, fragment splice, D6 filter, `actionStatusConfig` prop.
- `modules/events/module.lowdefy.yaml` — modify — add `action_statuses_display` var.

## Notes

- The D6 filter lives **in this component**, not in the shared fragment — the
  fragment is re-exported for custom pipelines that may carry no `reference_value`
  payload; the "don't card-link to the page you're on" rule belongs to the
  component that owns `reference_value`.
- This relies on action and entity id spaces being disjoint (they are): the rule
  reads as "a timeline keyed on X hides X's own action card."
- Verify the moved enum path (`../shared/enums/action_statuses.yaml`) resolves
  from `modules/events/components/` — it's the same `../shared/` mechanism the
  component already uses for `event_types.yaml`.
