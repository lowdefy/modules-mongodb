# Task 6: `invokePostHook.js` — post-hook resolver + dispatcher (no try/catch)

## Context

Part 9 lights up step 11 of the lifecycle: after step 6 writes complete and side effects (parts 8, 10, 11) fire, invoke the action's post-hook if declared. The post-hook is an Api emitted under the workflows module entry with id template `update-action-{action_type}-{interaction}-post`. The id is baked into the endpoint payload at `params.hooks?.[interaction]?.post`.

Contract (per design § `invokePostHook.js`):

- Fires **after** step 10 (tracker subscription) so a post-hook reading `result.tracker_fired` sees the final post-subscription state.
- Payload = pre-hook payload (same shape as Task 5) **plus** `result: { action_ids, completed_groups, event_id, tracker_fired? }` — the post-write state collected by the handler.
- Dispatch shape: `context.callApi({ id, module: 'workflows' }, payload, { user: context.user })` — same form as Task 5.
- **Throws propagate. No try/catch wrap.** A thrown post-hook surfaces to `CallApi` as a failed submit even though writes (steps 4–10) have landed. Authors must make post-hooks idempotent. Authors who want a best-effort branch wrap it in `:try` inside their own routine. There is no `post_hook_error` field on the response.
- **No-hook fallback — skip on missing at every level.** Same three independent undefined cases as the pre-hook (see Task 5): `params.hooks`, `params.hooks[interaction]`, and `params.hooks[interaction].post` are each independently optional. Use optional chaining on every level — `params.hooks?.[interaction]?.post` — and return `null` without calling `callApi` if any is undefined.
- Timeout: omit; [Part 1's 10s default](../../01-call-api-primitive/design.md) applies.

This is a deliberate departure from [submit-pipeline/spec.md § Post-hook return](../../../workflows-module-concept/submit-pipeline/spec.md#post-hook-return)'s "logged but not propagated" posture — see [Part 29 § D6](../../29-error-model-cleanup/design.md#d6-propagate-everywhere--no-engine-side-catching-of-sub-step-throws) for rationale.

## Task

1. Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/invokePostHook.js`. Export default function with the signature:

   ```js
   async function invokePostHook(context, result) → any | null
   ```

   - `context` carries the same bag Task 5 reads from.
   - `result = { action_ids, completed_groups, event_id, tracker_fired? }` is the post-write state assembled in `handleSubmit.js` just before the post-hook fires.

2. Resolve `hookId = context.params.hooks?.[context.params.interaction]?.post`. If falsy, return `null`.

3. Build the payload: identical to Task 5's pre-hook payload **plus** `result`. Factor the shared payload-construction code into a small local helper or a separate util — if extracted, place it at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/buildHookPayload.js` and import from both invokers.

4. Invoke:
   ```js
   const response = await context.callApi(
     { id: hookId, module: 'workflows' },
     payload,
     { user: context.user },
   );
   return response;
   ```

   No try/catch.

5. Colocated `invokePostHook.test.js`:
   - **Skip cases — each level of undefined returns `null` without calling `callApi`:**
     - `params.hooks` undefined.
     - `params.hooks` present but `params.hooks[interaction]` undefined.
     - `params.hooks[interaction]` present but `.post` undefined (e.g. only `.pre` declared).
   - Post-hook declared → `context.callApi` called once with `{ id: 'update-action-X-approve-post', module: 'workflows' }`, payload shape (pre-hook payload + `result` bag), `{ user: <context.user> }`.
   - `result.tracker_fired` present when the handler captured it; absent / `[]` when no tracker fired.
   - Mock callApi to throw → `invokePostHook` re-throws unchanged.
   - Successful response → returned verbatim.

## Acceptance Criteria

- `invokePostHook.js` exists; thin dispatcher.
- `invokePostHook.test.js` exists; cases above pass.
- If a shared `buildHookPayload` helper is extracted, both invokers reference it and a small dedicated test colocates with the helper.
- The function is **not** referenced from `handleSubmit.js` yet — Task 8 wires the call site.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/invokePostHook.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/invokePostHook.test.js` — create.
- (Optional) `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/buildHookPayload.js` + colocated test — create if extracted; if not extracted, duplicate the payload-builder inline in each invoker.

## Notes

- Post-hooks run **after** all side effects, including step 10's tracker subscription. The handler's return shape is the source of truth for `result`'s contents — pass exactly what the handler is about to return, minus `pre_hook_response` and `post_hook_response` themselves (which would be circular).
- Authors wanting best-effort post-hook behaviour are explicitly told to wrap with `:try` inside their routine — the engine does not provide a "log and swallow" mode.
