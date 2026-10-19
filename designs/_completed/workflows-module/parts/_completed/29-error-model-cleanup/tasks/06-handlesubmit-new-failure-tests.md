# Task 6: Add new unit tests covering the propagate-everywhere failure model

## Context

Task 5 removed the catch-converter from `handleSubmit.js` and rewrote the two existing failing-step tests. This task adds net-new coverage for the new contract: every lifecycle step throw propagates to the caller, no `error` transition is layered on the action, and the `:reject` pre-hook path is exercised at the unit layer.

Reference design: [Part 29 § Verification → Unit tests](../design.md#unit-tests) (lines 234-242).

## Task

Add tests to `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js`. Use the existing `seedWorkflow` / `seedAction` / `mongoDBConnection` / `inMemoryMongo` harness — match the style of the rewritten tests from Task 5.

For each test below, the assertion shape is the same: `await expect(handleSubmit({ ... })).rejects.toThrow(...)`, then verify the persisted state with a `findOne` follow-up.

### Tests to add

1. **Throwing step-4 sub-step.** Mock `updateAction` (or the collection write underneath it) to throw on the step-4 transition write. Assert:
   - Handler rethrows.
   - No `error` transition is written.
   - The action's `status[0].stage` is unchanged from pre-submit (`action-required`).

2. **Throwing pre-hook.** Mock `context.callApi` to throw a plain `UserError('hook crashed')` (no `isReject` — default `false`). Assert:
   - Handler rethrows.
   - No writes performed (action status unchanged; workflow doc unchanged; no event written).

3. **`:reject`-ing pre-hook.** Mock `context.callApi` to throw a `UserError('Company name already exists in CRM', { isReject: true })`. Assert:
   - Handler **rethrows** (no internal catch).
   - No writes performed.
   - End-to-end propagation (the `UserError` reaching the wrapping endpoint's `runRoutine` and classifying as `'reject'`) is **not** tested here — exercised at the integration layer once the Task 1 upstream PR lands.

4. **Throwing step-7 (event log via callApi).** Mock `dispatchLogEvent` (or the `context.callApi` for log-event) to throw. Assert:
   - Handler rethrows.
   - Steps 4–6 writes have landed and stay (action transition durable; workflow summary updated; form_data applied if a form was submitted).
   - No `error` transition layered on the action.
   - No `post_hook_error`-style soft surface on the response (handler doesn't return at all — it throws).

5. **Throwing step-8 (notifications callApi).** Mock `dispatchNotifications` (or its underlying call) to throw. Assert:
   - Handler rethrows.
   - All steps 4–7 writes have landed and stay (transitions, summary, form_data, event written).
   - Notification module's own retry/queue is independent of this throw (no assertion needed beyond the throw — leave a comment noting this is the notifications module's responsibility).

6. **Throwing post-hook (step 11).** Mock `context.callApi` for the post-hook invocation to throw. Assert:
   - Handler rethrows.
   - All writes from steps 4–10 have landed and stay.
   - No `post_hook_error` field on any response (no response is returned — handler throws).

7. **Retry of a partial step-4 write converges.** Two-phase test: first call throws after partial step-4 writes (some `actions[]` entries pushed, others not). Second call (a fresh `handleSubmit` invocation with the same params) completes successfully. Assert:
   - Final action state matches a single-shot success — priority rule no-ops the landed entries and writes the missing ones.

8. **Pre-hook returning `actions: [{ ..., status: 'error' }]`.** Mock `context.callApi` for the pre-hook to return a `status: 'return'` result whose body includes `actions: [{ action_id: '<id>', status: 'error' }]`. Assert:
   - The error transition is written cleanly via the **normal** priority path (no `force` needed — `error.priority = 1` is below every non-terminal stage).
   - No `hook_error` branch is invoked anywhere in the handler.
   - Log event + notifications fire normally for the `error` push (it's a regular status transition).

9. **`resolve_error` recovery still uses internal `force: true`.** Seed an action with `status[0].stage === 'error'`. Invoke `handleSubmit` with `interaction: 'resolve_error'`. Assert:
   - The recovery transition lands via the handler-internal `updateAction(..., force: true)` for the `resolve_error` interaction — unchanged from shipped behaviour.
   - Final action status reflects the recovery target (e.g. `in-review` or `done` per the interaction → target-status mapping).

### Notes on mocking

- For `context.callApi` mocking, follow the pattern used by Part 9's hook tests if they've landed on this branch; otherwise pass an explicit `callApi` stub through context construction (mirror what `SubmitWorkflowAction.js` does when wiring `context.callApi`).
- For tests 2 and 3, since Part 9's pre-hook invocation may not be fully wired on the branch when this task lands, gate the tests behind whatever Part 9 entry point exists, or use a doubled `invokePreHook` stub. Coordinate with whoever is implementing Part 9 to ensure the mocking surface is consistent.

## Acceptance Criteria

- Nine new tests land in `handleSubmit.test.js`, each named and shaped per the list above.
- All tests pass under the repo's test command.
- No test asserts on `error_transition`, `hook_error`, or `post_hook_error` (these surfaces no longer exist).
- The `:reject` pre-hook test (#3) explicitly comments that integration-layer reject classification is out of scope at this layer.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify (add nine tests).

## Notes

- These tests are net-new — Task 5 already handled the rewrite of the two pre-existing failing-step tests. Do not duplicate them here.
- If any of tests 2/3/6/8 depend on Part 9 surfaces (pre-hook / post-hook invocation) that haven't shipped on this branch yet, mark them `test.skip` with an inline comment referencing Part 9 — don't block this task on Part 9. They flip on when Part 9 lands.
