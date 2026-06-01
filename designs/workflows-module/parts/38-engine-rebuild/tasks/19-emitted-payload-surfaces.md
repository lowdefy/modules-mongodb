# Task 19: Emitted API payload surfaces

## Context

The emitted per-workflow API payloads must carry the new signal model instead of the old `force` flag, so the rebuilt Submit handler receives `signal`. This builds on task 6's id-naming edits to `makeWorkflowApis.js` (same file, different concern — payload mapping). It gates the demo migration (task 20) and the Submit handler's input contract.

## Task

**`modules/workflows/resolvers/makeWorkflowApis.js`:**

- The emitted-Api payload mapping passes: `signal`, `metadata`, `form`, `form_review`, `event_overrides`, hooks.
- **Drops `force`** (the priority-rule/force model is gone — D4).
- (Emitted Api ids already unprefixed from task 6 — don't re-touch the id naming.)

**`modules/workflows/api/start-workflow.yaml`:**

- Add `metadata` to the payload (Part 30 carry-over).
- Document `signal` as the replacement for the implicit "what status do we start in" path.

**Pre-hook payload (`buildHookPayload.js`):** unchanged — confirm it still builds the same payload (the pre-hook *return* shape changed in task 14, not the payload).

## Acceptance Criteria

- Emitted Api payloads pass `signal`/`metadata`/`form`/`form_review`/`event_overrides`/hooks and no longer pass `force`.
- `start-workflow.yaml` payload includes `metadata`; `signal` is documented.
- `buildHookPayload.js` is unchanged.
- `makeWorkflowApis.test.js` asserts the payload mapping (signal present, force absent) in addition to the id-naming assertions from task 6.

## Files

- `modules/workflows/resolvers/makeWorkflowApis.js` — modify (payload mapping; drop `force`)
- `modules/workflows/api/start-workflow.yaml` — modify (add `metadata`; document `signal`)
- `modules/workflows/resolvers/makeWorkflowApis.test.js` — modify (payload assertions)

## Notes

- Sequential dependency on task 6 (same file). If both haven't landed, do the id-naming first (task 6) then layer the payload mapping here.
- The demo migration (task 20) strips `force` from `workflow_config` and converts to signals — this task is the resolver-side counterpart that makes the emitted endpoints accept the new shape.
