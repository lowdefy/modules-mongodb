# Task 8: Wire step 11 (post-hook) into `handleSubmit.js`

## Context

`handleSubmit.js` has a stub at step 11 ([handleSubmit.js:364](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)):

```js
// Step 11 — Post-hook. → part 9.
```

After Task 7 lands, the success return looks like:

```js
return {
  action_ids: actionIds,
  completed_groups: completedGroups,
  event_id: eventId,
  tracker_fired: trackerFired,
  pre_hook_response: preHookResponse,
  post_hook_response: null,
};
```

This task fills in `post_hook_response` by invoking the post-hook after step 10 and capturing the raw return. The invoker (`invokePostHook.js` from Task 6) handles the no-post-hook fallback by returning `null`.

## Task

1. **Import the invoker** in `handleSubmit.js`:

   ```js
   import invokePostHook from "./invokePostHook.js";
   ```

2. **Replace the step 11 stub** ([handleSubmit.js:364](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)):

   ```js
   // Step 11 — Post-hook. Throws propagate; success return still includes raw
   // pre/post hook responses even though side-effects 4-10 have landed.
   const postHookResponse = await invokePostHook(context, {
     action_ids: actionIds,
     completed_groups: completedGroups,
     event_id: eventId,
     tracker_fired: trackerFired,
   });
   ```

3. **Update the success return** to surface `post_hook_response: postHookResponse`. Replace the placeholder `post_hook_response: null`.

4. **Tests** in `handleSubmit.test.js`:
   - No post-hook declared → `post_hook_response: null` on the return.
   - Post-hook returns `{ foo: 'bar' }` → `post_hook_response: { foo: 'bar' }` surfaces verbatim.
   - Post-hook receives `result` containing the final post-write state:
     - `action_ids` matches the handler's computed list.
     - `completed_groups` matches what the handler computed.
     - `event_id` equals `context.eventId`.
     - `tracker_fired` reflects the final value (post-tracker-subscription).
   - Post-hook throws → handler re-throws; writes from steps 4–10 stay (assert via reading the workflow + action docs from in-memory Mongo); no `post_hook_error` field on any response shape (the field does not exist).
   - Post-hook fires **after** tracker subscription: when the submitted transition completes the workflow, the post-hook's payload `result.tracker_fired` array reflects the post-subscription state (use a callApi mock that captures call order; assert tracker-subscription call precedes the post-hook call).

5. **Confirm no try/catch is added.** Per design, post-hook throws propagate. The success-return path is non-atomic on purpose — writes stay, response fails. Authors who want best-effort behaviour wrap their routine in `:try`. There is no `post_hook_error` field on the response.

## Acceptance Criteria

- Step 11 stub replaced with an `invokePostHook` call.
- `post_hook_response` populated on the success return.
- All test cases above pass.
- No `try/catch` around the post-hook call.
- All existing handler tests still pass.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify: wire step 11; populate `post_hook_response`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify: add post-hook cases.

## Notes

- **No `post_hook_error` field.** The design is explicit: success means everything completed cleanly. The trade-off (writes have landed but the client sees an error) is deliberate — see [Part 29 § D6](../../29-error-model-cleanup/design.md#d6-propagate-everywhere--no-engine-side-catching-of-sub-step-throws). Don't add the field "just in case".
- **Idempotency contract.** Authors must make post-hooks idempotent because a thrown post-hook surfaces as a retryable failure to the client; the same submission may re-run from the top. Document this in any hook-authoring guide that lands alongside (not in scope for this task).
- The post-hook is dispatched **after** step 10 (tracker subscription) per design — make sure the call site is genuinely after `fireTrackerSubscription(...)` and not interleaved with steps 7/8/9.
