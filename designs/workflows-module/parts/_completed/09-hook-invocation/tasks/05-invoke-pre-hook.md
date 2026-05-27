# Task 5: `invokePreHook.js` — pre-hook resolver + dispatcher (no try/catch)

## Context

Part 9 adds step 2 of the lifecycle: invoke the action's pre-hook (if declared) before any writes. Hooks are emitted as Lowdefy Apis under the workflows module entry by [makeWorkflowApis.js](../../../../modules/workflows/resolvers/makeWorkflowApis.js) — id template `update-action-{action_type}-{interaction}-pre`. The id is baked into the endpoint payload at `params.hooks?.[interaction]?.pre`.

The contract:

- **Dispatch shape:** `context.callApi({ id, module: 'workflows' }, payload, { user: context.user })`. The `{ id, module }` form is required (a bare string would dispatch into the consuming app's own-Api namespace, since hook Apis are emitted under the workflows module entry). Pattern matches [dispatchNotifications.js:17–21](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchNotifications.js).
- **Payload shape** (per design § Pre-hook payload):
  - `workflow_id`, `workflow_type`, `action_id`, `action_type`, `current_key`, `interaction`.
  - `form`, `form_review`, `fields`.
  - `current_status` — pass-through `params.current_status` for task `submit_edit`; `null` otherwise.
  - `comment` — pass-through `params.comment ?? null`.
  - `user: { id, profile, roles }` — from `context.user`.
  - `context: { workflow: context.workflow, action: context.action }`.
- **No try/catch.** The function does **not** wrap `context.callApi`. Throws — both generic crashes and `:reject` (`UserError(isReject: true)`) — propagate transparently. Discrimination happens upstream at the wrapping endpoint's `runRoutine` once the [Part 29 upstream tweak](../../29-error-model-cleanup/design.md#upstream-dependency) lands; the invoker itself is opinion-free.
- **Timeout.** Omit `options.timeout` — [Part 1's `callApi` default (10s)](../../01-call-api-primitive/design.md) applies.
- **No-hook fallback — skip on missing at every level.** Three independent undefined cases must all collapse to "return `null` without calling `callApi`":
  1. `params.hooks` is undefined (action declares no `hooks:` at all — the resolver omits the slot entirely; see [`makeWorkflowApis.js` `emitHooks`](../../../../modules/workflows/resolvers/makeWorkflowApis.js)).
  2. `params.hooks[interaction]` is undefined (action declares hooks for some interactions but not this one).
  3. `params.hooks[interaction].pre` is undefined (this interaction has only a `.post`, no `.pre`).

  Use optional chaining (`?.`) on every level — `params.hooks?.[interaction]?.pre` — so the read never throws on a missing parent.

## Task

1. Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/invokePreHook.js`. Export default function with the signature:

   ```js
   async function invokePreHook(context) → any | null
   ```

   `context` carries everything the handler already passes around: `params`, `user`, `workflow`, `action`, `callApi`, etc.

2. Resolve `hookId = context.params.hooks?.[context.params.interaction]?.pre`. If falsy, return `null` immediately.

3. Build the payload exactly as specified above. Read fields from `context.params` for runtime values and `context.workflow` / `context.action` for the read-only context bag.

4. Invoke:
   ```js
   const response = await context.callApi(
     { id: hookId, module: 'workflows' },
     payload,
     { user: context.user },
   );
   return response;
   ```

   Do **not** wrap in try/catch. Do **not** inspect the response for an error shape. The function's job is purely "dispatch and return raw response."

5. Colocated `invokePreHook.test.js`:
   - **Skip cases — each level of undefined returns `null` without calling `callApi`:**
     - `params.hooks` undefined.
     - `params.hooks` present but `params.hooks[interaction]` undefined.
     - `params.hooks[interaction]` present but `.pre` undefined (e.g. only `.post` declared).
   - Pre-hook declared → `context.callApi` called once with `{ id: 'update-action-X-submit_edit-pre', module: 'workflows' }`, the full payload shape (assert every field), and `{ user: <context.user> }`.
   - Payload includes `current_status: null` when not a task submit_edit; the value from `params.current_status` when it is.
   - Payload `comment` falls through `params.comment ?? null`.
   - Payload `context: { workflow, action }` — exact doc references (not copies).
   - Mock callApi to throw a generic `Error('boom')` → `invokePreHook` re-throws unchanged (no catch).
   - Mock callApi to throw a `UserError` with `isReject: true` (use a test double — a class with `name: 'UserError'` and `isReject: true`) → `invokePreHook` re-throws unchanged.
   - Successful response (arbitrary object) → returned verbatim.

## Acceptance Criteria

- `invokePreHook.js` exists; thin dispatcher with no business logic beyond payload construction.
- `invokePreHook.test.js` exists; cases above all pass.
- The function is **not** referenced from `handleSubmit.js` yet — Task 7 wires the call site.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/invokePreHook.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/invokePreHook.test.js` — create.

## Notes

- Payload's `user: { id, profile, roles }` is the **per-payload representation** the hook receives — distinct from the `options.user` carried separately on the `context.callApi` call (which is what propagates the user through auth on the hook Api). Both come from `context.user`; the duplication is intentional per spec so hooks can read `user` from their payload (`_payload: 'user.id'`) without depending on the auth layer's threading model.
- Do not coerce / sanitise the response — `pre_hook_response` is surfaced raw on the handler return, exactly as the hook author returned it (design rationale: keeps hook-author debugging direct).
- The function relies on the upstream `@lowdefy/errors` `UserError.isReject` flag for the reject path to round-trip correctly; without the upstream tweak the integration-layer test will see `'error'` instead of `'reject'`. The unit tests here cover only the local "function does not catch" contract — that's testable today without the upstream change.
