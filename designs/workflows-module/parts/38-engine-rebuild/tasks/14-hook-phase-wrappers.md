# Task 14: Pre/post hook phase wrappers

## Context

Pre-hooks and post-hooks already exist (`SubmitWorkflowAction/invokePreHook.js`, `invokePostHook.js`). The rebuild moves them under `shared/phases/` (they're reused across handlers conceptually) and adapts the pre-hook **return** shape to the signal model. The hook payload envelope (`buildHookPayload.js`, relocated per Files) is **unchanged except two field fixes forced by the payload rename**: `interaction` → `signal` (populated from `params.signal` — the same one-concept-one-name rename as the render context and event metadata, D12; greenfield, no compat shim), and `current_status` **dropped** (its source payload field is removed — state-machine.md supersedes the simple-selector path). Hook routines read `_payload: signal`; no other envelope field changes.

Pre-hooks are read-only relative to the engine's atomicity boundary (D5): a hook may do its own callApi/Mongo work for external coordination, but the engine treats the return purely as plan input; hook writes commit independently. Post-hooks fire against committed state and see fresh data through the Plan (D6).

## Task

**Move + adapt `shared/phases/invokePreHook.js`** (from `SubmitWorkflowAction/invokePreHook.js`):

- Input: `LoadedState` + caller payload. Single `callApi` to the hook routine.
- **Hook resolution is signal-keyed:** the hook id resolves via `params.hooks?.[params.signal]?.pre` (post-hook: `?.post`). The old `params.hooks?.[params.interaction]` lookup is dead — the rebuilt payload carries `signal`, not `interaction` (task 19), and an unadapted lookup would resolve `hooks[undefined]` and silently never fire any hook. The emitted `hooks:` map is signal-keyed by task 19's resolver re-key.
- Output: `PreHookResult { actions: [{ target, signal, upsert? }], event_overrides, form_overrides }` (the task-9 type). An entry may carry `upsert: true` to spawn a missing keyed target (D4 / D13 (2)) — the response validator must accept and pass it through, not strip or reject it; the spawn itself is planned in task 10.
- **Pre-hook return shape changes `{ type, status }` → `{ type, signal }`** (per state-machine.md). Auxiliary signals target *other* actions; they resolve through the FSM in the plan phase.
- Validate the response shape: **no current-action signal redirect** — a pre-hook cannot re-signal the current action (the current action lands per the signal the user fired; state-machine.md "How signals get emitted"). Reject a return that attempts to redirect the root/current action. **Resolves-to-current rule:** an entry redirects the current action iff its `action_id` equals the target action's `_id`, **or** its `(type, key)` — key-normalised, absent key → `null` (today's `normalisePreHook` rule) — equals the target action's `(type, current_key-normalised)`. A `{ type: <currentType>, key: <other> }` entry is a **sibling keyed instance**: a legal auxiliary target that must NOT be rejected (the case a naive `type === currentType` check gets wrong).
- If no pre-hook declared → `PreHookResult = { actions: [], event_overrides: {}, form_overrides: {} }`.

**Move `shared/phases/invokePostHook.js`** (from `SubmitWorkflowAction/invokePostHook.js`):

- Input: `LoadedState` (pre-commit) + committed `Plan` + `CommitResult` + the tracker cascade's fire list. Single `callApi`.
- **Author-facing payload — same `buildHookPayload` envelope as the pre-hook** (incl. this task's `interaction`→`signal` / `current_status` fixes), with two post-hook specifics:
  - `context` is populated from the **planned** docs — `context: { workflow: plan.workflow.doc, action: <planned target-action doc from plan.actions> }` — not the loaded (pre-commit) docs. This is the concrete mechanism behind D6's "fresh state through the Plan": a moved-verbatim `buildHookPayload` would hand post-hook authors stale pre-commit state. (The pre-hook keeps loaded docs in `context` — no Plan exists yet.)
  - `result` is pinned to today's bag: `{ action_ids, completed_groups, event_id, tracker_fired }` — `action_ids` from the committed plan, `completed_groups` from the planned group recompute (groups whose planned status became `done`), `event_id` the committed per-invocation event id, `tracker_fired` the cascade's per-level fire list (today's shape: `[{ parent_action_id, parent_workflow_id, new_status }]`). `CommitResult.dispatchErrors` is **not** exposed — partial dispatch failure surfaces via the handler's `post_commit_dispatch_failed` throw (D13), not as a post-hook branch input.
- Output: post-hook return value, surfaced in the handler's return payload.

**Error propagation — both wrappers (D13 / D5 / D6):**

- The wrappers contain **no try/catch** (preserving today's `invokePreHook.js` / `invokePostHook.js` posture): both generic crashes and a hook `:reject` (`UserError` with `isReject: true`) propagate transparently; classification happens at the wrapping per-action endpoint's `runRoutine` (discriminated on `name === "UserError"`). Do **not** re-wrap hook throws in `WorkflowEngineError` — `UserError` stays reserved for the hook's own `:reject` (D13), and a defensive wrap would break reject classification for every authored hook.
- A pre-hook `:reject` propagates **pre-plan** — no writes have happened.
- A post-hook throw propagates **after writes have landed** (the submit's commit stays); authors keep the idempotency obligation (D6 / module README docs pass).

Update import sites in the Submit handler (task 15 wires these in).

## Acceptance Criteria

- `invokePreHook` returns `PreHookResult` with `{ type, signal }` auxiliary entries (optional `upsert: true` preserved through validation); rejects a current-action signal redirect (per the resolves-to-current rule) with a clear error; a sibling keyed-instance target (`{ type: <currentType>, key: <other> }`) passes validation.
- A `UserError` with `isReject: true` thrown by the callApi'd hook routine surfaces unwrapped — no try/catch in either wrapper.
- No-pre-hook case returns the empty result.
- `invokePostHook` receives `LoadedState` + `Plan` + `CommitResult` + the cascade fire list and surfaces its return; its payload `context` carries the **planned** workflow + target-action docs (a test asserts a field changed by the plan — e.g. the new `status[0].stage` — is visible to the hook), and `result` is exactly `{ action_ids, completed_groups, event_id, tracker_fired }` (no `dispatchErrors`).
- The `buildHookPayload.js` envelope is unchanged **except**: `interaction` → `signal` (from `params.signal`) and `current_status` removed; a test asserts the envelope shape (no `interaction` key, no `current_status` key, `signal` present).
- Hook resolution reads `params.hooks?.[params.signal]`; a test covers a signal-keyed `hooks:` map resolving and firing.
- Tests cover: signal-shaped auxiliary returns, redirect rejection (by `action_id` and by `(type, key)`), sibling keyed-instance passes, `:reject` propagation (unwrapped `UserError`), no-hook default, post-hook fresh-state access.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/invokePreHook.js` — create (moved + adapted from `SubmitWorkflowAction/invokePreHook.js`)
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/invokePostHook.js` — create (moved from `SubmitWorkflowAction/invokePostHook.js`)
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/buildHookPayload.js` — relocate (from `SubmitWorkflowAction/utils/buildHookPayload.js`, with its test) — both wrappers import it; left under `utils/` the moved wrappers would reach back into one handler's directory, the layering D2's file layout exists to prevent
- `SubmitWorkflowAction/invokePreHook.js`, `SubmitWorkflowAction/invokePostHook.js`, `SubmitWorkflowAction/utils/buildHookPayload.js` — delete (after task 15 rewires)
- hook wrapper tests — create

## Notes

- The "writes are out-of-band" contract is new framing, not new behaviour — document it in the module README (docs pass).
- Conditional landing ("this submission should be marked not-required") is modelled as a separate thin action with its own button, **not** a current-action redirect (D5).
