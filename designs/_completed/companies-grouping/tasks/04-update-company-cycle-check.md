# Task 4: Cycle check + `parent_ids` write in `update-company`

## Context

`update-company` (`modules/companies/api/update-company.yaml`) is a Lowdefy API routine — currently four steps: `update` (`MongoDBUpdateOne`), `unlink-old-contacts`, `link-new-contacts`, `new-event` (`CallApi`), then `:return: { success: true }`.

When `hierarchy.enabled: true`, this task adds two things:

1. **`parent_ids` write** — extend the `update` step's `$set` stage to write `parent_ids` from the payload (using `_payload: parent_ids` directly, since the payload is the authoritative new value — no `$mergeObjects` needed for an array; full replacement is the intended semantic).
2. **Cycle check** — a new `MongoDBAggregation` step `cycle_check` that runs `$graphLookup` upward from the candidate parent set, detects whether self appears in the ancestor closure, and projects a single boolean `has_cycle`. A `:if:` / `:then:` / `:reject:` block immediately after aborts the routine with an error message when `has_cycle` is true.

Lowdefy has a `:reject:` routine control that aborts the routine and surfaces an error to the calling action's `onError` handler. Existing precedent: `modules/user-account/api/update-profile.yaml:4-13` and `modules/user-account/api/create-profile.yaml:13` both use `:if: ... :then: { :reject: <message> }` for input validation. The cycle check follows that pattern. No need for `:return: { error: ... }` + defensive `skip:` decoration on every later step — `:reject:` halts the routine entirely.

The cycle-check `$graphLookup` walks **upward** (`connectFromField: parent_ids`, `connectToField: _id`) — starting from each candidate parent, finding their parents, etc. If self appears at any level — including as one of the candidate parents themselves — a cycle exists.

When `hierarchy.enabled: false`, the `parent_ids` write, the `cycle_check` step, and the `:if:`/`:reject:` block are all build-time-omitted via `_build.if`. The existing four steps run unchanged.

## Task

Modify `modules/companies/api/update-company.yaml`:

### A. Add `parent_ids` to the `update` step's first `$set` stage

The current `update` step has `update: _build.array.concat: [...]` containing two `$set` stages and the optional `request_stages.write` stages. The first `$set` stage (currently lines ~17–51) overwrites scalars and merges sub-objects.

Add a build-gated `parent_ids` field to that first `$set`. Use `_build.object.assign` so the field is added only when `hierarchy.enabled: true`:

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

### B. Build-inject the cycle check before the existing `update` step

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
          from:
            _ref:
              path: connections/companies-collection.yaml
              key: properties.collection
          startWith: "$_id"
          connectFromField: parent_ids
          connectToField: _id
          maxDepth:
            _module.var: hierarchy.max_depth
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

- :if:
    _eq:
      - _step: cycle_check.0.has_cycle
      - true
  :then:
    :reject: Selected parents would create a cycle in the company hierarchy.
```

When `has_cycle` is `true`, `:reject:` aborts the routine and the calling form's `CallApi` `onError` handler fires with the error message. No subsequent steps run.

When `has_cycle` is `false` (or the cycle-check returns no rows because `parent_ids` was empty), the `:if:` test is false, the `:reject:` doesn't fire, and the routine continues to the existing `update` step.

### C. Build-gating

Both new steps (`cycle_check` and the `:if:`/`:reject:` block) are wrapped in a `_build.if` test on `_module.var: hierarchy.enabled`. The existing `update`, `unlink-old-contacts`, `link-new-contacts`, `new-event`, and `:return: success` steps stay unchanged — they don't need any `skip:` decoration because `:reject:` halts the routine.

```yaml
routine:
  _build.array.concat:
    - _build.if:
        test:
          _module.var: hierarchy.enabled
        then:
          - id: cycle_check
            ...
          - :if:
              ...
            :then:
              :reject: ...
        else: []
    - - id: update
        ...
      - id: unlink-old-contacts
        ...
      - id: link-new-contacts
        ...
      - id: new-event
        ...
      - :return:
          success: true
```

When `hierarchy.enabled: false`: the first `_build.array.concat` arg resolves to `[]`, the routine is identical to today.

When `hierarchy.enabled: true`: the cycle-check infrastructure is prepended; the `parent_ids` write is added to the first `$set` (per A); the existing steps run only when `:reject:` doesn't fire.

## Acceptance Criteria

- When `hierarchy.enabled: false`, the built `update-company` API has the same step list and `$set` shape as today.
- When `hierarchy.enabled: true`:
  - The routine has six steps in order: `cycle_check`, the `:if:`/`:then:`/`:reject:` block, `update`, `unlink-old-contacts`, `link-new-contacts`, `new-event`, and the final `:return: { success: true }`.
  - The first `$set` stage of the `update` step writes `parent_ids: { _payload: parent_ids }`.
  - No `skip:` decoration is needed on the existing steps — `:reject:` aborts the routine cleanly.
- Manual verification (after the demo enables hierarchy):
  - Updating a company with valid new parents succeeds; the doc's `parent_ids` reflects the payload.
  - Attempting to set `parent_ids` to a value that would create a cycle calls the form's `onError` handler with the reject message; no changes are written.
  - Attempting to set `parent_ids: [<self._id>]` triggers the cycle error (a company is its own candidate parent).

## Files

- `modules/companies/api/update-company.yaml` — modify — add `parent_ids` to first `$set`; prepend `cycle_check` + `:if:`/`:reject:` block via `_build.if`. All build-gated on `hierarchy.enabled`.

## Notes

- **`:reject:` over `:return: { error: ... }`.** The earlier draft of this task used a `:return:` early-exit + defensive `skip:` on every existing step. Lowdefy provides a dedicated `:reject:` routine control (see `apps/demo/.claude/guides/api-routines.md:36`: "abort the routine with an error message — for input validation"; existing usage at `modules/user-account/api/update-profile.yaml:4-13`). Using `:reject:` removes the need to decorate existing steps with `skip:` — it halts the routine cleanly.
- **`$graphLookup.from` via `_ref` to the connection file.** Same as task 2 — read the collection name via `_ref: { path: connections/companies-collection.yaml, key: properties.collection }` rather than hardcoding `from: companies`. Verified at build.
- **Direction reminder.** This `$graphLookup` walks **upward** (from candidates → their parents → grandparents). Task 2's request walks **downward**. The `connectFromField` / `connectToField` are swapped between the two.
- **`$concatArrays` rationale.** Folding `["$_id"]` (the candidate parent itself) with `"$__ancestors._id"` (its ancestor closure) handles the case where self is _one of the directly-set parents_ — which would also be a cycle. Without the concat, the projection would only catch transitively-reachable cycles.
- **No effect on `request_stages.write`.** The optional `request_stages.write` consumer stages (currently injected at the end of the `update` step's pipeline) keep working unchanged. They don't see `parent_ids` directly because they run after the first `$set` — but they can read `$$ROOT.parent_ids` if needed.
