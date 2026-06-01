# Task 14: Pre/post hook phase wrappers

## Context

Pre-hooks and post-hooks already exist (`SubmitWorkflowAction/invokePreHook.js`, `invokePostHook.js`). The rebuild moves them under `shared/phases/` (they're reused across handlers conceptually) and adapts the pre-hook **return** shape to the signal model. The pre-hook payload shape (`buildHookPayload.js`) is **unchanged**.

Pre-hooks are read-only relative to the engine's atomicity boundary (D5): a hook may do its own callApi/Mongo work for external coordination, but the engine treats the return purely as plan input; hook writes commit independently. Post-hooks fire against committed state and see fresh data through the Plan (D6).

## Task

**Move + adapt `shared/phases/invokePreHook.js`** (from `SubmitWorkflowAction/invokePreHook.js`):

- Input: `LoadedState` + caller payload. Single `callApi` to the hook routine.
- Output: `PreHookResult { actions: [{ target, signal }], event_overrides, form_overrides }`.
- **Pre-hook return shape changes `{ type, status }` → `{ type, signal }`** (per state-machine.md). Auxiliary signals target *other* actions; they resolve through the FSM in the plan phase.
- Validate the response shape: **no current-action signal redirect** — a pre-hook cannot re-signal the current action (the current action lands per the signal the user fired; state-machine.md "How signals get emitted"). Reject a return that attempts to redirect the root/current action.
- If no pre-hook declared → `PreHookResult = { actions: [], event_overrides: {}, form_overrides: {} }`.

**Move `shared/phases/invokePostHook.js`** (from `SubmitWorkflowAction/invokePostHook.js`):

- Input: `LoadedState` (pre-commit) + committed `Plan` + `CommitResult`. Single `callApi`.
- Output: post-hook return value, surfaced in the handler's return payload. Authors see fresh state via the Plan — no re-read.

Update import sites in the Submit handler (task 15 wires these in).

## Acceptance Criteria

- `invokePreHook` returns `PreHookResult` with `{ type, signal }` auxiliary entries; rejects a current-action signal redirect with a clear error.
- No-pre-hook case returns the empty result.
- `invokePostHook` receives `LoadedState` + `Plan` + `CommitResult` and surfaces its return.
- `buildHookPayload.js` (pre-hook *payload*) is unchanged.
- Tests cover: signal-shaped auxiliary returns, redirect rejection, no-hook default, post-hook fresh-state access.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/invokePreHook.js` — create (moved + adapted from `SubmitWorkflowAction/invokePreHook.js`)
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/invokePostHook.js` — create (moved from `SubmitWorkflowAction/invokePostHook.js`)
- `SubmitWorkflowAction/invokePreHook.js`, `SubmitWorkflowAction/invokePostHook.js` — delete (after task 15 rewires)
- hook wrapper tests — create

## Notes

- The "writes are out-of-band" contract is new framing, not new behaviour — document it in the module README (docs pass).
- Conditional landing ("this submission should be marked not-required") is modelled as a separate thin action with its own button, **not** a current-action redirect (D5).
