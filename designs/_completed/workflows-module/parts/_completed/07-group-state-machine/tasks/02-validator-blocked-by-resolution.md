# Task 2: Extend `makeWorkflowsConfig.js` with the build-time `blocked_by` resolution check

## Context

Part 4 deferred `blocked_by` resolution validation to part 7: it validates the id-vs-type collision (`makeWorkflowsConfig.js:109–118`) and the `action_group` reference (`:122–127`), but doesn't walk `blocked_by` entries to verify each one resolves to either a declared group or a declared action type.

Without this check, a typo like `blocked_by: [phase-1-typo]` survives the build, falls through both runtime resolution branches in part 7's walk, and produces a permanently-blocked action with no error surfaced — exactly the silent-failure class the build-time validator is supposed to catch.

The two sets (`groupIds`, `actionTypes`) are already constructed by existing validators in the same `validateWorkflow` function. Adding the resolution check is a one-pass extension of the existing action loop — at most O(N × B̄) hash lookups per workflow, negligible cost.

## Task

Extend `modules/workflows/resolvers/makeWorkflowsConfig.js` in place. The current `validateWorkflow` function (around line 86 onwards) already iterates `actions` to validate `action_group` references; add the `blocked_by` walk inside the same loop.

The shape of the extension:

```js
for (const action of actions) {
  validateAction(workflow, action);
  if (action.action_group && !groupIds.has(action.action_group)) {
    fail(
      workflow.type,
      `action "${action.type}" references unknown action_group "${action.action_group}".`,
    );
  }
  // NEW: blocked_by resolution check.
  const blockedBy = action.blocked_by ?? [];
  for (const entry of blockedBy) {
    if (!groupIds.has(entry) && !actionTypes.has(entry)) {
      fail(
        workflow.type,
        `action "${action.type}" blocked_by entry "${entry}" resolves to neither a declared action_groups[].id nor a declared actions[].type.`,
      );
    }
  }
}
```

Use `fail()` (the existing helper used elsewhere in the file) so the error message carries the path prefix consistently with the other validators.

Verify the failure message includes:

1. The action type (so the author can find the action in their YAML).
2. The unresolved entry (so they can see exactly what typo'd).
3. The workflow type (added by `fail()`).

## Acceptance Criteria

- `makeWorkflowsConfig.js` has a new `blocked_by` walk inside the existing `for (const action of actions)` loop in `validateWorkflow`.
- The walk reads `action.blocked_by ?? []` (missing field treated as empty).
- Each entry is checked against both `groupIds` and `actionTypes` (Sets already built earlier in `validateWorkflow`).
- Unresolved entries throw via `fail(workflow.type, ...)` with the action type, the entry, and a clear message.
- Existing tests in `modules/workflows/resolvers/makeWorkflowsConfig.test.js` still pass.
- New test cases in `makeWorkflowsConfig.test.js`:
  - **Passing fixture**: a workflow with `blocked_by: [some-action-type]` where `some-action-type` is declared → no error.
  - **Passing fixture**: a workflow with `blocked_by: [some-group-id]` where `some-group-id` is declared in `action_groups[]` → no error.
  - **Passing fixture**: a workflow with `blocked_by: [some-group-id, some-action-type]` (mixed) → no error.
  - **Passing fixture**: a workflow with no `blocked_by` field on any action → no error.
  - **Failing fixture**: a workflow with `blocked_by: [nonexistent-entry]` → throws with an error message that includes the action type, the unresolved entry, and the workflow type.
  - **Failing fixture**: a workflow with `blocked_by: [valid-type, nonexistent-entry]` → throws on the second entry (asserts the loop doesn't short-circuit on the first valid one).

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — add the `blocked_by` resolution walk inside the existing action loop in `validateWorkflow`.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — add the passing + failing fixtures above.

## Notes

- Per the [project rule § YAML block sequences for operators](../../../../CLAUDE.md): test fixtures use YAML block sequences. Inline JS arrays inside `_js` operators are fine; YAML inputs to `makeWorkflowsConfig` should mirror the production YAML grammar.
- The id-vs-type collision check at lines 109–118 already runs _before_ this loop. By the time the new walk runs, `groupIds` and `actionTypes` are guaranteed disjoint — so a single `entry` can match at most one of them. The order of the two `.has()` checks doesn't matter for correctness; lean on declarative readability (group ids first to mirror the runtime resolution precedence in part 7's design).
- The runtime resolution precedence in part 7 is "groups first, then action types." The build-time validator's failure message doesn't need to encode precedence (only that the entry doesn't resolve to _anything_).
- This task is independent of every engine task — it only touches the resolver and its tests. Can ship in its own PR.
