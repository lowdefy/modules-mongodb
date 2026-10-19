# Task 7: Wire step 2 (pre-hook) into `handleSubmit.js`

## Context

`handleSubmit.js` currently has a stub at step 2 ([handleSubmit.js:165](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)):

```js
// Step 2 — Pre-hook. → part 9.
```

Three downstream PART 9 EXTENSION markers also need to be replaced with real merges:

- [handleSubmit.js:176–179](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) — auto-unblock merge site.
- [handleSubmit.js:197–202](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) — pre-hook `upsert: true` create branch (Part 6's per-entry write loop still owns the create; this task just makes the existing loop see `upsert: true` entries by passing them through unchanged via Task 2's merge).
- [handleSubmit.js:278–280](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) — form-overrides merge site.

The mid-write error path's PART 9 comment at [handleSubmit.js:312](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) is **obsolete** — per [Part 29 § D2](../../29-error-model-cleanup/design.md#d2-why-pre-hooks-no-longer-get-a-hook_error-field) there is no `hook_error` channel. Delete the stale comment as part of this task.

Tasks 1–5 ship the building blocks; this task wires them into the lifecycle.

## Task

1. **Import the new utils + invoker** in `handleSubmit.js`:

   ```js
   import resolveTargetStatus from "./resolveTargetStatus.js";
   import mergePreHookActions from "./mergePreHookActions.js";
   import mergeEventOverrides from "./mergeEventOverrides.js";
   import mergeFormOverrides from "./mergeFormOverrides.js";
   import invokePreHook from "./invokePreHook.js";
   ```

2. **Step 1 status call site** — change the existing `resolveTargetStatus({ interaction, actionConfig, params })` call ([handleSubmit.js:136](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) to pass `yamlInteractions: params.interactions, preHookStatus: undefined` initially — this produces the engine-default + YAML resolution before the pre-hook returns. Use this value as the initial `targetStatus` for the step-1 `currentActionEntry` build.

3. **Step 2 — pre-hook invocation:** insert after `internal` is constructed and before step 3:

   ```js
   // Step 2 — Pre-hook. Throws propagate transparently (incl. :reject as UserError(isReject: true)).
   const preHookResponse = await invokePreHook(context);
   ```

   Note: `await invokePreHook(...)` outside the try/catch wrapper that protects steps 4–6. A pre-hook throw must propagate up the handler — must **not** be caught by the mid-write `try` (which would push an `error` transition the design forbids on the pre-hook path).

4. **Re-resolve target status** using the pre-hook return:

   ```js
   const resolvedTargetStatus = resolveTargetStatus({
     interaction: params.interaction,
     actionConfig,
     params,
     yamlInteractions: params.interactions,
     preHookStatus: preHookResponse?.status,
   });
   ```

   Update `logEventInputBag.status_after = resolvedTargetStatus;`. Update the step-1 `currentActionEntry`'s `status` field to `resolvedTargetStatus` (the entry was initialized with the pre-hook-unaware target; refresh it now). Keep the existing `currentActionEntry` reference; just mutate its `status` (or rebuild the entry — either is fine, but make sure the entry that flows into `mergePreHookActions` carries the resolved value).

5. **Step 3 — replace the append-only auto-unblock merge with `mergePreHookActions`:**

   ```js
   internal.actions = mergePreHookActions({
     currentActionEntry: internal.actions[0],
     autoUnblockEntries: autoUnblockEntries,
     preHookActions: preHookResponse?.actions,
     resolvedStatus: resolvedTargetStatus,
   });
   ```

   Drop the existing `internal.actions.push(...autoUnblockEntries)`. Remove the PART 9 EXTENSION comment block at lines 176–179.

6. **Step 4 — upsert handling:** Task 2's merge passes `upsert: true` through; Part 6's per-entry write loop already has a TODO branch at [handleSubmit.js:196–202](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js). Replace the TODO with the create branch:

   ```js
   if (matchingDocs.length === 0) {
     if (entry.upsert === true) {
       const newDoc = await createAction(context, { type: entry.type, key, status: entry.status, fields: entry.fields });
       actionIds.push(newDoc._id);
       context.workflowActions.push(newDoc);
     }
     continue;
   }
   ```

   Import `createAction` from `../../shared/createAction.js` (Part 5's helper). If the helper's exact signature differs, mirror its caller pattern from Part 5's `StartWorkflow` for consistency. Surface the new doc in the in-memory cache so step 5's recompute sees it.

7. **Step 6 — form-overrides merge:**

   ```js
   const formMerged = mergeFormOverrides({
     form: context.params.form,
     formReview: context.params.form_review,
     preHookOverrides: preHookResponse?.form_overrides,
   });
   ```

   Replace the inline `{ ...form, ...form_review }` spread at [handleSubmit.js:274–277](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js). Remove the PART 9 EXTENSION comment block at lines 278–280.

8. **Step 7 — event-overrides merge:** before calling `dispatchLogEvent(context, logEventInputBag)`, compose the merged event payload. The simplest seam is to extend `dispatchLogEvent` to accept an `overrides` argument that gets merged on top of the default — but per Part 9's design the merge function should compose the layers visibly here in the handler. Inline:

   ```js
   const defaultEventPayload = buildDefaultLogEventPayload({
     workflow: context.workflow,
     action: context.action,
     actionConfig: context.actionConfig,
     interaction: logEventInputBag.interaction,
     current_key: logEventInputBag.current_key,
     status_before: logEventInputBag.status_before,
     status_after: logEventInputBag.status_after,
     comment: params.comment,
     appName: context.connection?.app_name,
   });
   const mergedEventPayload = mergeEventOverrides({
     defaultPayload: defaultEventPayload,
     yamlOverride: params.event_overrides?.[params.interaction],
     preHookOverride: preHookResponse?.event_overrides,
   });
   ```

   Then dispatch via `context.callApi({ id: 'new-event', module: 'events' }, { _id: context.eventId, ...mergedEventPayload }, { user: context.user })` — copying the shape from [dispatchLogEvent.js:105–110](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js). Either refactor `dispatchLogEvent` to take a pre-built payload, or have the handler bypass the wrapper and call `callApi` directly here. **Preferred:** keep `dispatchLogEvent` as the seam for the actual `callApi`+error-wrap, but add a `payload` argument so it accepts the merged result. Internally `dispatchLogEvent` then just dispatches and surfaces errors; the build + merge moves into the handler.

   Refactor target signature:

   ```js
   async function dispatchLogEvent(context, payload) { ... }
   ```

   Update the one existing call site, the colocated tests, and the [`dispatchLogEvent.test.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.test.js) test bag accordingly.

9. **Success return** — set `pre_hook_response: preHookResponse` on the success return at [handleSubmit.js:366–373](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js). Task 8 will fill `post_hook_response`. Defaults to `null` when no pre-hook declared — `invokePreHook` already returns `null` in that case.

10. **Delete stale PART 9 marker** at [handleSubmit.js:312](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) (`// PART 9: hook_error path takes the same shape but with reason: 'pre-hook'.`) — no longer applicable per Part 29 § D2.

11. **Tests** in `handleSubmit.test.js`:
    - Three-layer status resolution end-to-end: workflow config with `interactions.submit_edit.status: 'in-review'`; pre-hook returns `status: 'done'`; assert the submitted action lands at `'done'`.
    - YAML override only (no pre-hook): assert YAML status wins over engine default.
    - Pre-hook `actions: [{ type: 'X', status: 'in-review' }]` collides with auto-unblock entry for type `X` (which would have been `'action-required'`): pre-hook value wins.
    - Pre-hook `actions: [{ type: <currentActionType>, key: <currentKey> }]` (no `status`): replacement entry gets `resolvedStatus` grafted in; submitted action lands at the resolved stage.
    - Pre-hook `actions: [{ type: 'X', status: 'done', force: true }]`: priority rule bypassed; transition lands.
    - Pre-hook `actions: [{ type: 'Y', status: 'done' }]` from `'done'` non-self entry: silently no-op per priority rule.
    - Pre-hook `form_overrides: { a: 1 }` plus user `form: { b: 2 }`: both `a` and `b` written.
    - Pre-hook `event_overrides.metadata.scrubbed: true`: appears on the dispatched event; default `metadata.action_type` still present.
    - Pre-hook `event_overrides.metadata.comment: 'SCRUBBED'` overrides user-supplied `params.comment: 'hello'`.
    - YAML `event_overrides.{interaction}.metadata.foo: 'bar'` survives alongside a user-supplied `params.comment: 'hello'` (`metadata.comment` from layer 1 not clobbered by YAML's `metadata.foo` change).
    - Pre-hook `:reject` (mock `callApi` to throw a `UserError`-shaped object with `isReject: true` when called with the hook id): handler **rethrows** the error; the action's `status[0].stage` is unchanged from pre-submit; no log event or notifications fired (mocks not called for those ids).
    - Pre-hook generic throw: same posture — handler rethrows; action status unchanged; no writes.
    - Pre-hook `actions: [{ ..., status: 'error' }]`: the error transition lands via the priority path (`error.priority = 1` < every non-terminal); log event + notifications fire normally.
    - `pre_hook_response` raw return surfaces on the API response; `null` when no pre-hook declared.

## Acceptance Criteria

- All PART 9 EXTENSION comments in `handleSubmit.js` replaced with working code or deleted.
- Step 2 stub replaced with a real `invokePreHook` call outside the mid-write try/catch.
- `pre_hook_response` populated on the success return (raw return, pre-merge).
- All existing handler tests still pass; new tests above all pass.
- `dispatchLogEvent` refactored (if chosen) and its colocated tests updated.
- Stale PART 9 marker in the mid-write catch deleted.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify: wire step 2, re-resolve status, replace merges, refactor dispatchLogEvent call, populate `pre_hook_response`, delete stale marker.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify: add the test cases enumerated above.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js` — modify: signature change to accept a pre-built `payload` argument, if that refactor path is chosen.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.test.js` — modify: update tests for the new signature.

## Notes

- **Order of operations matters.** The pre-hook call must complete (and its return be captured) before the per-entry write loop runs — every write decision (status, actions[], form-overrides) reads from the pre-hook return. The pre-hook also fires **before** step 3's `computeAutoUnblocks` call only if the auto-unblocks depend on workflow state the hook might mutate; per design they don't (hooks return overrides, not Mongo writes that change `blocked_by` graphs), so the existing ordering (step 3 after step 2) is fine. Keep step 3 in its current position.
- **Step 1's `targetStatus` is used twice** — once at the bottom of step 1 to seed the `currentActionEntry`, and again as the `logEventInputBag.status_after` value. After the pre-hook return, refresh both. Don't forget the log-event bag — the test asserting "pre-hook `status` propagates to log event" depends on it.
- **Do not catch the pre-hook throw.** Per [Part 29 § D5 + D6](../../29-error-model-cleanup/design.md), `:reject` and generic throws both propagate transparently. The wrapping endpoint's `runRoutine` classifies based on `error.isReject`. The handler must not intervene.
- **No writes happen on either abort mode** — the throw fires before step 4 ever runs because step 2 is outside the mid-write try/catch.
- **The existing mid-write `try`/catch stays.** This task leaves the wrapping `try { … } catch (err) { … }` block around steps 4–6 ([handleSubmit.js:185–333](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) in place. Removing it is owned by [Part 29 Task 5](../../29-error-model-cleanup/tasks/05-handlesubmit-remove-catch-converter.md). Position the step-2 pre-hook call **above** the `try` so a pre-hook throw is never caught, and leave the catch block untouched. The `error_transition` field on the success-return JSDoc stays until Part 29 Task 5 ships. See [design.md § Mid-write catch — known inconsistency window](../design.md#pre-hook-abort-modes--throw-vs-reject).
- The `createAction` import for the upsert branch may not yet exist with the exact shape this task needs. Inspect `plugins/modules-mongodb-plugins/src/connections/shared/createAction.js` and mirror its signature from Part 5's caller. If the helper needs minor signature tweaks for this call site, prefer adding optional parameters over changing existing callers.
