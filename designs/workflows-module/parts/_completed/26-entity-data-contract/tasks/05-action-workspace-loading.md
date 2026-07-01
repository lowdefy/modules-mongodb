# Task 5: Action-workspace shell — drop whole-shell gate, add skeletons, narrow the id gate

## Context

`modules/workflows/components/action-workspace.yaml` is the three-tier shell every action page
`_ref`s. Today it gates its **entire** render on `visible: _ne: [_state.entity_id, null]`
(`:57-60`). `entity_id` is a value the page sets itself in an onMount `SetState` (`set_entity_id`),
so the gate is a self-set-flag mount barrier that renders **nothing** until the action resolves —
a blank page while `get_workflow_action` is in flight.

With entity data now arriving on the single `get_workflow_action` response (Tasks 3–4), the shell
should render immediately and show content-shaped skeletons in flight instead of a blank page.

Per the loading-skeletons idiom, `loading:` must be gated on the **request** being the source of
truth (`_not: _request: get_workflow_action`), never on the self-set `entity_id`. But the
id-dependent panels — `actions-on-entity` (its `call_entity_workflows` onMount `CallAPI`) and the
History timeline (`reference_value: _state.entity_id`) — must still mount only once the id resolves,
so they keep an entity-id gate, now narrowed to just those panels.

## Task

In `modules/workflows/components/action-workspace.yaml`:

1. **Drop the whole-shell `visible` gate** (`:57-60` — the `visible: _ne: [_state.entity_id, null]`
   on the root `action_workspace` Box). The shell renders immediately.

2. **Add `loading:` + `skeleton:` to the middle and right content**, gated on
   `_not: _request: get_workflow_action`, so the middle action surface (`workspace_middle`) and the
   right-hand Details/History card (`workspace_right`) show content-shaped skeletons while the
   request is in flight. Use the project's loading-skeletons idiom (see
   `.claude/guides/` loading-skeletons / `r:lowdefy-loading-skeletons`) for the `loading`/`skeleton`
   shape — content-shaped placeholders, not a spinner.

3. **Keep the id-dependent panels gated until the id resolves.** Narrow the entity-id gate
   (`_ne: [_state.entity_id, null]`) to **only**:
   - the left `actions-on-entity` panel (`workspace_left`, whose `call_entity_workflows` onMount
     `CallAPI` reads `entity_id`), and
   - the History timeline section (`workspace_rhs_history`, `reference_value: _state.entity_id`).

   Their onMount reads must fire with a real id, never null.

4. Update the component's header comment (`:48-55`) to describe the new model: shell renders
   immediately; middle/right swap to skeletons on `_not: _request: get_workflow_action`; only the
   left panel and History retain the entity-id mount gate.

## Acceptance Criteria

- The root `action_workspace` Box has no `visible` gate; the shell renders on first paint.
- Middle and right content show skeletons while `get_workflow_action` is in flight (gated on
  `_not: _request: get_workflow_action`, not on `entity_id`).
- `actions-on-entity` and the History timeline still mount only once `_state.entity_id` is non-null,
  so their onMount reads never fire with a null id.
- `cd apps/demo && pnpm ldf:b` succeeds.

## Files

- `modules/workflows/components/action-workspace.yaml` — modify — remove whole-shell `visible` gate;
  add `loading:`/`skeleton:` to middle + right; narrow the entity-id gate to `actions-on-entity`
  and History; update the header comment.

## Notes

- This task only touches `action-workspace.yaml`, so it is independent of the template edits in
  Task 4 and can be implemented in parallel.
- Do not gate `loading` on `_state.entity_id` — that is the self-set flag the idiom warns against;
  the request (`get_workflow_action`) is the source of truth.
