# Task 5: Remove the catch-converter from `handleSubmit.js` and rewrite the two existing failing-step tests

## Context

Shipped `handleSubmit.js` wraps steps 4–6 in a `try`/`catch` that synthesises an `errorTransition` object, force-pushes a `{ stage: 'error' }` status entry onto the user-submitted action via `updateAction(..., force: true)`, and short-circuits steps 7–11. Part 29 deletes that entire block — sub-step throws propagate to `CallApi`.

The catch-converter lives at [`handleSubmit.js:302-333`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js). The two existing tests at `handleSubmit.test.js:798-819` and `handleSubmit.test.js:821-869` lock in the old contract — they must be rewritten in the same task or the build red-lines.

The four per-step annotate-and-rethrow blocks (`try { ... } catch (err) { err.step = err.step ?? '<step-name>'; throw err; }`) are **deleted along with the catch-converter**. Their only purpose was to set `err.step` for the catch-converter's `reason` field; with the catch-converter removed there is no reader. Bare propagation preserves the original error object identically (including `isLowdefyError` for resolver pass-through), and the lifecycle step that failed is recoverable from the stack frame. Aligns with D6's "engine catches nothing" rule.

## Task

### `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js`

- **Find the outer try that wraps steps 4–11.** The try opens at the boundary around step 4's writes (above `// Step 4 — Action writes.` or equivalent in the shipped code) and the catch starts at line 302. Delete the outer `try {` opener and the entire `} catch (err) { ... }` block on lines 302–333 (everything from the `errorTransition` synthesis through `return { ... error_transition }`).

- **Delete the four per-step annotate-and-rethrow blocks** at [lines 216-218](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js), [297-300](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js), [339-341](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js), and [347-349](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js). Each is an inside-step `try/catch (err) { err.step = err.step ?? '<step-name>'; throw err; }` whose only reader was the catch-converter (now gone). Replace each `try { <step body> } catch (err) { ... }` with the bare `<step body>` so the original error propagates unwrapped.

- **Delete the inline comment** at line 312: `// PART 9: hook_error path takes the same shape but with reason: 'pre-hook'.` — references a path being removed entirely.

- **Update the handler's `@returns` JSDoc** at [lines 60-70](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js): drop the `error_transition?` field, and narrow `pre_hook_response` / `post_hook_response` from `any | null` to the success-only shape — failures throw, so the never-on-failure nullable union isn't accurate.

- **Update the success return shape** at the end of the function (lines 366-373). Drop `pre_hook_response: null` and `post_hook_response: null` from the placeholder return — keep `pre_hook_response` and `post_hook_response` as field names, but they should land here populated from the pre-hook and post-hook invocations once Part 9 wires them. For now, while Part 9 is unshipped on this branch, the literal `null` placeholders may stay (no behavioural change); just ensure there is no `error_transition` field on any return path.

  After the edit, the only return statement in `handleSubmit` should be the success-path return:
  ```js
  return {
    action_ids: actionIds,
    completed_groups: completedGroups,
    event_id: eventId,
    tracker_fired: trackerFired,
    pre_hook_response: null,   // populated by Part 9
    post_hook_response: null,  // populated by Part 9
  };
  ```

- **Remove the import of `updateAction`** if it becomes unused after the catch deletion. (It should still be in use elsewhere — verify by grep before removing.)

### `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js`

Rewrite the two existing failing-step tests in place. Do **not** add new tests in this task — net-new coverage belongs to Task 6.

- **Lines 798-819** (`handleSubmit task 13: step 5 throws → action_ids still set; summary write durable; error layered on action`):
  - Rename — drop "error layered" framing. New name: `handleSubmit task 13: step 5 throws → handler rethrows; action's step-4 transition is durable; no error layered`.
  - Replace the `const result = await handleSubmit(...)` invocation with `await expect(handleSubmit({ ... })).rejects.toThrow(/simulated step 5 failure/);`.
  - Delete the `result.error_transition` assertions (lines 808-810) and the `result.action_ids` assertion (line 811).
  - Replace lines 815-818 with assertions on the action doc:
    ```js
    const doc = await mongo.db.collection("actions").findOne({ _id: "a-quote" });
    expect(doc.status[0].stage).toBe("in-review");      // step 4's transition
    expect(doc.status).toHaveLength(2);                  // in-review + original action-required; no error layered
    ```

- **Lines 821-869** (`handleSubmit task 13: step 6 throws → action_ids still set; summary write durable; error layered on action`):
  - Rename — drop "error layered" framing. New name: `handleSubmit task 13: step 6 throws → handler rethrows; step-5 summary write stays durable; no error layered`.
  - Replace the `const result = await handleSubmit(...)` invocation with `await expect(handleSubmit({ ... })).rejects.toThrow(/simulated step 6 failure/);`.
  - Delete the `result.error_transition` assertions (lines 859-860).
  - Keep the `wf.summary` assertion on line 864 — that's the proof the partial-write story holds.
  - Replace lines 867-869 with:
    ```js
    const doc = await mongo.db.collection("actions").findOne({ _id: "a-quote" });
    expect(doc.status[0].stage).toBe("in-review");
    expect(doc.status).toHaveLength(2);
    ```

## Acceptance Criteria

- `handleSubmit.js` has no remaining `errorTransition` synthesis, no force-push to `error` from a mid-write catch, and no `error_transition` field on its return.
- The two rewritten tests pass. Both assert: handler throws, step-4 transition is durable on the action doc, no `error` stage is layered.
- The full Jest suite (`pnpm test` or the repo's test command) passes.
- `rg -n error_transition plugins/` returns no matches.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify (delete catch-converter and inline comment; drop `error_transition` from return).
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify (rewrite two existing tests; do not add new ones here).

## Notes

- This task depends on Task 4 (types cleanup) — Task 4 removes the JSDoc surface that promises `error_transition`; Task 5 removes the runtime code that produces it. Land them in order.
- Do **not** touch `shared/updateAction.js` — Part 29 keeps the `force: true` per-doc surface (still used by tracker subscription and `StartWorkflow`). Only one *caller* of `updateAction(..., force: true)` goes away (the catch-converter in `handleSubmit.js`).
- Do **not** touch `enums/action_statuses.yaml` — the priority table is unchanged.
- The four per-step annotate-and-rethrow blocks are **deleted**, not preserved (see Task above). Bare propagation preserves the original error object identically — including `isLowdefyError` for resolver pass-through — and the lifecycle step is recoverable from the stack frame. The `err.step` annotation has no consumer once the catch-converter is gone, and aligning with D6's "engine catches nothing" rule keeps the handler's failure posture uniform.
