# Task 4: Cycle check + `parent_ids` write in `update-company`

## Context

`update-company` (`modules/companies/api/update-company.yaml`) is a Lowdefy API routine — currently four steps: `update` (`MongoDBUpdateOne`), `unlink-old-contacts`, `link-new-contacts`, `new-event` (`CallApi`), then `:return: { success: true }`.

When `hierarchy.enabled: true`, this task adds two things:

1. **`parent_ids` write** — extend the `update` step's `$set` stage to write `parent_ids` from the payload (using `_payload: parent_ids` directly, since the payload is the authoritative new value — no `$mergeObjects` needed for an array; full replacement is the intended semantic).
2. **Cycle check** — a new `MongoDBAggregation` step `cycle_check` that runs `$graphLookup` upward from the candidate parent set, detects whether self appears in the ancestor closure, and projects a single boolean `has_cycle`. An early `:return: { error: would_create_cycle }` step short-circuits when a cycle is detected, and every existing step gains a defensive `skip:` so it doesn't run if the cycle was caught.

Lowdefy API routines have no `throw` step. The established primitives are `:return:` (sets the API response and ends the routine) and `skip:` (conditionally bypasses a step). The cycle check uses both.

The cycle-check `$graphLookup` walks **upward** (`connectFromField: parent_ids`, `connectToField: _id`) — starting from each candidate parent, finding their parents, etc. If self appears at any level — including as one of the candidate parents themselves — a cycle exists.

When `hierarchy.enabled: false`, the `parent_ids` write, the `cycle_check` step, and the early `:return:` are all build-time-omitted via `_build.if`, and the existing steps run unchanged with no `skip:` decoration.

## Task

Modify `modules/companies/api/update-company.yaml`:

### A. Add `parent_ids` to the `update` step's first `$set` stage

The current `update` step has `update: _build.array.concat: [...]` containing two `$set` stages and the optional `request_stages.write` stages. The first `$set` stage (currently lines ~17–51) overwrites scalars and merges sub-objects.

Add a build-gated `parent_ids` field to that first `$set`. Use `_build.object.assign` (or whichever idiomatic merge pattern fits the existing structure) so the field is added only when `hierarchy.enabled: true`:

```yaml
# Inside the existing first $set stage:
$set:
  _build.object.assign:
    - name:
        _payload: name
      description:
        _payload: description
      contact:
        $mergeObjects: [...]
      address:
        $mergeObjects: [...]
      registration:
        $mergeObjects: [...]
      attributes:
        $mergeObjects: [...]
      updated:
        _ref:
          module: events
          component: change_stamp
    - _build.if:
        test:
          _module.var: hierarchy.enabled
        then:
          parent_ids:
            _payload: parent_ids
        else: {}
```

`parent_ids` is a full replacement (not `$mergeObjects`) — the form sends the new authoritative array.

### B. Build-inject the cycle-check infrastructure

When `hierarchy.enabled: true`, prepend two new steps before the existing `update` step:

```yaml
- id: cycle_check
  type: MongoDBAggregation
  connectionId:
    _module.connectionId: companies-collection
  properties:
    pipeline:
      - $match:
          _id:
            $in:
              _payload: parent_ids
      - $graphLookup:
          from: companies
          startWith: "$_id"
          connectFromField: parent_ids
          connectToField: _id
          as: __ancestors
      - $project:
          has_cycle:
            $in:
              - _payload: _id
              - $concatArrays:
                  - ["$_id"]
                  - "$__ancestors._id"
      # Critical: OR-reduce across all matched candidate parents into a
      # single output doc. Without this, the projection produces one doc
      # per candidate, and downstream `_step.cycle_check.0.has_cycle` only
      # inspects the first — missing cycles via candidate parent #2 or later.
      - $group:
          _id: null
          has_cycle:
            $max: "$has_cycle"

- :return:
    error: would_create_cycle
  skip:
    _ne:
      - _step: cycle_check.0.has_cycle
      - true
```

The second step (`:return:`) fires only when `has_cycle` is `true`. When fired, it short-circuits the routine — but as a belt-and-braces guard against any difference in `:return:` semantics, also add a defensive `skip:` block to **every** existing step so they don't run when a cycle is detected:

```yaml
skip:
  _eq:
    - _step: cycle_check.0.has_cycle
    - true
```

This `skip:` block is added to: `update`, `unlink-old-contacts`, `link-new-contacts`, `new-event`, and the final `:return: { success: true }`.

### C. Build-gating

The entire cycle-check infrastructure (the two new steps + the `skip:` decoration on every existing step) is gated on `_module.var: hierarchy.enabled`. The cleanest expression is to wrap the routine's step list with `_build.if` and `_build.array.concat` so the cycle steps and skip decorations only emit when enabled.

When `hierarchy.enabled: false`: the routine is identical to today (no cycle steps, no skip decoration on existing steps).

When `hierarchy.enabled: true`: cycle_check + early :return: prepended; every existing step gains `skip: { _eq: [_step.cycle_check.0.has_cycle, true] }`; the parent_ids write is added to the first `$set`.

## Acceptance Criteria

- When `hierarchy.enabled: false`, the built `update-company` API has the same step list as today (verify by diffing the build output before and after the task lands, with the demo app still set to `hierarchy.enabled: false`).
- When `hierarchy.enabled: true`:
  - The routine has six steps in order: `cycle_check`, the early `:return:`, `update`, `unlink-old-contacts`, `link-new-contacts`, `new-event`, and the final `:return: { success: true }`.
  - Every step except `cycle_check` and the early `:return:` carries `skip: { _eq: [_step.cycle_check.0.has_cycle, true] }`.
  - The first `$set` stage of the `update` step writes `parent_ids: { _payload: parent_ids }`.
- Manual verification (after the demo enables hierarchy):
  - Updating a company with valid new parents succeeds; the doc's `parent_ids` reflects the payload.
  - Attempting to set `parent_ids` to a value that would create a cycle returns `{ error: "would_create_cycle" }` and does not write any changes.
  - Attempting to set `parent_ids: [<self._id>]` returns the cycle error (a company is its own candidate parent).

## Files

- `modules/companies/api/update-company.yaml` — modify — add `parent_ids` to first `$set`; prepend `cycle_check` + early `:return:`; decorate existing steps with defensive `skip:`. All build-gated on `hierarchy.enabled`.

## Notes

- **`$graphLookup.from: companies` (literal).** Same as task 2 — hardcode the literal collection name. No `_module.collection` resolver exists in Lowdefy, and the in-repo connection always points at the `companies` collection.
- **Direction reminder.** This `$graphLookup` walks **upward** (from candidates → their parents → grandparents). Task 2's request walks **downward**. The `connectFromField` / `connectToField` are swapped between the two.
- **`$concatArrays` rationale.** Folding `["$_id"]` (the candidate parent itself) with `"$__ancestors._id"` (its ancestor closure) handles the case where self is *one of the directly-set parents* — which would also be a cycle. Without the concat, the projection would only catch transitively-reachable cycles.
- **Lowdefy `:return:` semantics.** If you can verify that `:return:` short-circuits the routine (subsequent steps don't run when it fires), the defensive `skip:` decorations on later steps could be dropped. The design errs on the side of belt-and-braces. Keep the defensive skips for v1.
- **No effect on `request_stages.write`.** The optional `request_stages.write` consumer stages (currently injected at the end of the `update` step's pipeline) keep working unchanged. They don't see `parent_ids` directly because they run after the first `$set` — but they can read `$$ROOT.parent_ids` if needed.
