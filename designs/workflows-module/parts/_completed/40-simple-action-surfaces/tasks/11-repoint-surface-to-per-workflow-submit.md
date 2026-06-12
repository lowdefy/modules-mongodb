# Task 11: Re-point the check-action surface to the per-workflow `{workflow_type}-submit` endpoint

## Context

This task resolves the UI half of **Blocker 1** in
[`IMPLEMENTATION-NOTES.md`](../IMPLEMENTATION-NOTES.md) — the check-action signal
buttons call a non-existent endpoint.

Every signal button in `components/check-action-surface.yaml` builds its
`CallAPI` endpoint id as `{_module.id}/update-action-{current_action.type}`
(six refs: `submit`, `progress`, `not_required`, `approve`, `resolve_error`,
`request_changes`). **Nothing emits `update-action-{type}`** — it is a stale
pre-Part-38 name. The build throws `CallAPI references non-existent endpoint`
for every check action.

The correct target is the **post-Part-48 per-workflow** form: one submit
endpoint per workflow, `{workflow_type}-submit`, with the action identified by
`action_id` in the payload (Part 48 D7 / task 8).

**This is a post-Part-48 cleanup task — run it after Part 48 has merged into
`workflows-module`.** Part 48 is in flight in a sibling worktree
(`.claude/worktrees/part-48-render-config`) and cannot be stopped or
coordinated with, so this task does not edit any Part 48 file. It reconciles
whatever Part 48 leaves behind. Two gaps are expected to survive Part 48
because they fall outside its task surface:

1. **Part 48 task 11's file list misses the Part 40 surfaces.** It was written
   against the pre-Part-40 page topology — it re-points the Part 39 `.njk`
   templates and cites inline-button line numbers in
   `pages/workflow-action-edit.yaml` / `-review.yaml` that **no longer exist**.
   Post-Part-40 those pages (and `-view`, and the modal) are thin containers
   that `_ref` the shared surface; all six endpoint refs live in
   `check-action-surface.yaml`, which Part 48 task 11 never lists. So after
   Part 48 lands, the surface is still on the stale `update-action-{type}` id.
   *(Caveat: Part 48 task 11 step 3 runs a `grep` sweep for `update-action`
   across `modules/`; the implementer may re-point the surface opportunistically.
   This task therefore audits the actual end state first — step 0 — and only
   changes what Part 48 left wrong or untouched.)*
2. **`GetWorkflowAction` does not ship `workflow_type`.** The surface only has
   `current_action.type`, so it *cannot* build `{workflow_type}-submit`
   (`GetWorkflowAction.js:31` — "Raw engine internals are NOT shipped:
   ... workflow_type ..."). No Part 48 task adds it; Part 48 task 11 silently
   assumes it is available at runtime. Exposing it belongs with the surface that
   consumes it.

**Build-state expectation:** once Part 48 has merged, the resolver emits
`{workflow_type}-submit` and Part 48 has re-pointed the `.njk` templates and the
demo start callers. The remaining red is the surface (still on
`update-action-{type}`) and the missing `workflow_type` envelope field — exactly
what this task closes. After this task the demo build should be green for the
check-action surfaces (assuming Part 48 landed its resolver collapse, task 8).

## Task

> **Line numbers below are as-of-today references on `workflows-module`. Part 48
> will have rewritten `makeWorkflowApis.js`, `handleSubmit.js`, the `.njk`
> templates, and possibly touched the surface before this task runs — re-grep
> each anchor (`update-action-`, `workflow_type`, the button ids) against the
> post-48 tree rather than trusting the line numbers.**

**0. Audit Part 48's end state first.** Part 48's task 11 ran a `grep` sweep for
`update-action` across `modules/`, so it may have already re-pointed some or all
of the surface. Before editing, establish the actual state:

- `grep -n "update-action-\|{workflow_type}-submit\|current_action.workflow_type" modules/workflows/components/check-action-surface.yaml`
  — how many of the six refs are still stale vs. already on the per-workflow id.
- `grep -n "workflow_type" plugins/.../GetWorkflowAction/GetWorkflowAction.js`
  — whether Part 48 added the envelope field (it has no task for this, so
  expect not, but confirm).
- Run the demo build (`apps/demo`, `lowdefy build`) and capture which endpoint
  names the errors now cite.

Then apply only steps 1–3 below for whatever Part 48 left wrong or untouched. If
Part 48 re-pointed the surface but to a different shape (e.g. it kept
`current_action.type`, which wouldn't resolve), fix it to the form in step 2.

**1. Ship `workflow_type` from `GetWorkflowAction`**
(`plugins/.../WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js`):

- Add `workflow_type: action.workflow_type` to the returned envelope's "Engine
  fields" block (the value is already on the action doc — it is read at
  `:142` to find `wfConfig`).
- Update the header comment (`:31`) — remove `workflow_type` from the "NOT
  shipped" list and note it is shipped so the detail surfaces can build the
  per-workflow submit endpoint id. This is a deliberate, scoped reversal of the
  Part 46 read-contract decision for this one field; `access`, `metadata`,
  `[slug].links`, `tracker`, `child_*` stay excluded.
- Invert the existing test in `GetWorkflowAction.test.js:398`
  (`'workflow_type is NOT in the envelope'`) to assert it **is** present and
  equals the action's `workflow_type`. Rename the test accordingly.

**2. Re-point the six endpoint refs in
`modules/workflows/components/check-action-surface.yaml`:**

Change each `endpointId` from

```yaml
endpointId:
  _string.concat:
    - _module.id: true
    - /update-action-
    - _state: current_action.type
```

to the per-workflow form

```yaml
endpointId:
  _string.concat:
    - _module.id: true
    - /
    - _state: current_action.workflow_type
    - -submit
```

The six refs (button → CallAPI id → line of the `_string.concat`):

| Button | CallAPI id | `endpointId` at |
| --- | --- | --- |
| `button_submit` | `submit` | `:277` |
| `button_progress` | `progress` | `:318` |
| `button_not_required` | `not_required` | `:359` |
| `button_approve` | `approve` | `:426` |
| `button_resolve_error` | `resolve_error` | `:465` |
| `button_request_changes` | `submit_request_changes` | `:506` |

**Payloads are unchanged.** Each already sends `action_id`
(`_state: current_action._id`) and the per-button `signal` — exactly what the
per-workflow endpoint needs to identify the action and the transition. Do not
add `workflow_type` to any payload (the endpoint sets its own type statically;
`action_id` carries the action identity).

**3. `current_action.workflow_type` flows automatically.** All three pages seed
state via `current_action: { _request: get_workflow_action }`
(`workflow-action-edit.yaml:61-62` and the same in `-view` / `-review`), so once
step 1 adds `workflow_type` to the response it lands at
`current_action.workflow_type` with no page change. Confirm by grep that no page
overwrites `current_action` after the spread in a way that would drop the new
key.

**4. Close out Blocker 1 in the notes.** Do **not** edit any Part 48 task file
— Part 48 is in flight and is not coordinated with from here. Only update
[`IMPLEMENTATION-NOTES.md`](../IMPLEMENTATION-NOTES.md) Blocker 1: record that
the surface and `GetWorkflowAction.workflow_type` were reconciled post-48 by
this task, that the UI targets `{workflow_type}-submit`, and mark the blocker
resolved (or note any residue the demo build still shows).

## Acceptance Criteria

- `GetWorkflowAction` returns `workflow_type`; its test asserts presence (not
  absence). `pnpm test` green in `plugins/modules-mongodb-plugins`.
- All six endpoint refs in `check-action-surface.yaml` resolve to
  `{_module.id}/{workflow_type}-submit`; **zero** `update-action-` occurrences
  remain in the file (`grep -c "update-action-"` → 0).
- No payload references `workflow_type`; every CallAPI still sends `action_id`
  and `signal`.
- With Part 48 merged (resolver emits `{workflow_type}-submit`), the demo build
  is **green** for the check-action surfaces after this task — no remaining
  `update-action-` or other dangling submit refs.
- `IMPLEMENTATION-NOTES.md` Blocker 1 is updated per step 4. **No Part 48 file
  is edited.**

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js` — modify — add `workflow_type` to envelope; update header comment.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.test.js` — modify — invert the `workflow_type` absence test.
- `modules/workflows/components/check-action-surface.yaml` — modify — re-point the six endpoint refs (whatever Part 48 left stale).
- `designs/workflows-module/parts/40-simple-action-surfaces/IMPLEMENTATION-NOTES.md` — modify — update Blocker 1 status.

## Notes

- **Runs after Part 48 merges into `workflows-module`.** Part 48 is in flight in
  `.claude/worktrees/part-48-render-config` and cannot be stopped — this task
  does not coordinate with it, it cleans up after it. Sequence it once Part 48 is
  merged and the demo build's submit errors point at `{workflow_type}-submit`.
- **Why per-workflow, not `{workflow_type}-{action_type}-submit`.** Part 48 (the
  accepted design that supersedes the rejected Part 47) collapses submit emission
  to one `{workflow_type}-submit` per workflow for the ~500-endpoint scaling
  reason. The surface targets the same id the post-48 resolver emits — anything
  else wouldn't resolve.
- **Coordination risk to check in step 0:** Part 48 task 11's `grep` sweep for
  `update-action` may have already re-pointed the surface. If so this task
  shrinks to "add `workflow_type` to the envelope + verify the surface id" — or
  to nothing on the surface if Part 48 also (somehow) shipped `workflow_type`.
  Audit, don't assume.
- The modal (`check-action-modal.yaml`) and all three pages need no change —
  they delegate to the surface, and `current_action.workflow_type` arrives via
  the existing `get_workflow_action` spread.
