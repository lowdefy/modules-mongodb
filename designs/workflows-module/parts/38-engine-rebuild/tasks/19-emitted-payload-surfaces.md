# Task 19: Emitted API payload surfaces

## Context

The emitted per-workflow API payloads must carry the new signal model instead of the old `force` flag, so the rebuilt Submit handler receives `signal`. This builds on task 6's id-naming edits to `makeWorkflowApis.js` (same file, different concern — payload mapping). It gates the demo rebuild (task 20 → [Part 45](../../45-demo-rebuild/design.md)) and the Submit handler's input contract.

## Task

**`modules/workflows/resolvers/makeWorkflowApis.js`:**

- The emitted-Api payload mapping passes: `signal`, `comment`, `metadata`, `form`, `form_review`, `event_overrides`, hooks. (`comment` stays on the wire for [Part 33](../../33-comment-rendering/design.md)'s `foldCommentIntoEvent` — its D5 wire contract; the rebuilt engine itself writes no `metadata.comment`, see task 12.)
- **Drops `force`** (the priority-rule/force model is gone — D4). Also drops `interaction` and `current_status` (superseded by `signal`; state-machine.md removes the simple-selector path).
- **Re-key the hook/event emission loops by signal name.** `HOOK_INTERACTIONS` (`[submit_edit, not_required, resolve_error, approve, request_changes]`) becomes the signal list `[submit, progress, not_required, resolve_error, approve, request_changes]` (rename the constant, e.g. `HOOK_SIGNALS`). The constant feeds both `emitHooks` and `emitEventOverrides`, so authored `hooks:` **and** `event:` blocks become signal-keyed — without this, the signal-keyed demo config (Part 45) is silently skipped by the emitter loop and no hook Api is emitted. Emitted hook Api ids follow the key (`{workflow_type}-{action_type}-{signal}-{pre|post}`, e.g. `…-submit-pre` not `…-submit_edit-pre`). Preserve task 22's `_module.endpointId` wrapping on the emitted `hooks` map values (`slot[phase] = { '_module.endpointId': api.id }`) — the engine receives pre-scoped opaque endpoint ids and passes them to `callApi` verbatim (design § "The shipped `callApi` contract").
- (Emitted Api ids already unprefixed from task 6 — don't re-touch the id naming.)

**`modules/workflows/api/start-workflow.yaml`:**

- Add `metadata` to the payload (Part 30 carry-over).
- The `actions:` override keeps the `{ type, status }` grammar — Start seeds drafts directly at the declared status (Part 45 review 1 #2; task 17). No signal grammar at start.
- Extend the `:return` mapping with **`event_id`** — Start now mints a real `workflow-started` event (task 17), and every handler surfaces its invocation's `event_id` uniformly (review-13 #6).

**Hook payload (`buildHookPayload.js`):** owned by task 14 — the envelope is unchanged except `interaction` → `signal` and `current_status` removed. This task's concern is the wire side: the emitted-Api payload no longer carries `interaction`/`current_status`, so confirm the task-14 envelope and this task's payload mapping agree.

## Acceptance Criteria

- Emitted Api payloads pass `signal`/`comment`/`metadata`/`form`/`form_review`/`event_overrides`/hooks and no longer pass `force`, `interaction`, or `current_status`.
- The `hooks:` and `event:` emission loops are signal-keyed (`submit`/`progress` included; no `submit_edit`); emitted hook Api ids carry the signal name.
- `start-workflow.yaml` payload includes `metadata`; `signal` is documented; `:return` carries `event_id`.
- `makeWorkflowApis.test.js` asserts the payload mapping (signal present; force/interaction/current_status absent) and the signal-keyed hook emission (a `hooks.submit` block emits `…-submit-pre`; a legacy-keyed `hooks.submit_edit` block is not emitted), in addition to the id-naming assertions from task 6.

## Files

- `modules/workflows/resolvers/makeWorkflowApis.js` — modify (payload mapping; drop `force`)
- `modules/workflows/api/start-workflow.yaml` — modify (add `metadata`; document `signal`)
- `modules/workflows/resolvers/makeWorkflowApis.test.js` — modify (payload assertions)

## Notes

- Sequential dependency on task 6 (same file). If both haven't landed, do the id-naming first (task 6) then layer the payload mapping here.
- The demo rebuild (task 20 → Part 45) authors `workflow_config` directly in the signal grammar — this task is the resolver-side counterpart that makes the emitted endpoints accept the new shape.
