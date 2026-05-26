# Task 5: Drop Layer 2 in `mergeEventOverrides`

## Context

`mergeEventOverrides` composes the four-layer event-payload merge. Layer 1 is the engine default (`buildDefaultLogEventPayload`, which has already folded in the runtime `comment` as layer 3 of the original spec). Layer 2 is the YAML `event.{interaction}` block baked in by part 13. Layer 4 is the pre-hook return `event_overrides`.

```js
// plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/mergeEventOverrides.js
function mergeEventOverrides({ defaultPayload, yamlOverride, preHookOverride }) {
  // ...
  return overlay(overlay(defaultPayload, yamlOverride), preHookOverride);
}
```

Part 32 drops Layer 2. Result: the merge becomes `overlay(defaultPayload, preHookOverride)`.

The `overlay` helper does shallow merge per top-level key (`display`, `references`, `metadata`) plus a scalar last-non-empty-wins on `type`. Keep that logic — only the layering count changes.

Tests live alongside in `mergeEventOverrides.test.js` and cover Layer 2 scenarios (search for `yamlOverride:` — current matches at lines ~30, 39, 52, 101).

## Task

1. **Remove the `yamlOverride` parameter** from `mergeEventOverrides`. Signature becomes `{ defaultPayload, preHookOverride }`.
2. **Simplify the return** to `return overlay(defaultPayload, preHookOverride);`. The `overlay` helper itself stays — it's still used for the single remaining layering step.
3. **Update the file's JSDoc header** to describe a three-layer merge (engine default with `comment` already folded → pre-hook override), not four. Drop the Layer 2 numbering note.
4. **Update `mergeEventOverrides.test.js`**:
   - Drop or rewrite every test that passes a `yamlOverride:`.
   - Keep coverage for:
     - default-payload-only (no pre-hook return).
     - pre-hook override winning over default on each top-level key (`display`, `references`, `metadata`, `type`).
     - pre-hook override deep-merge at one level: non-overridden keys inside `display`/`references`/`metadata` survive.
     - `type` scalar: empty/missing override falls through to base; non-empty wins.
   - If any test relied on a three-way precedence assertion (YAML vs pre-hook), it goes away entirely — pre-hook is now the only override channel.

## Acceptance Criteria

- `mergeEventOverrides` accepts `{ defaultPayload, preHookOverride }` only.
- `grep -n "yamlOverride" plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/mergeEventOverrides.js mergeEventOverrides.test.js` returns no matches.
- `pnpm --filter=@lowdefy/modules-mongodb-plugins test mergeEventOverrides` passes.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/mergeEventOverrides.js` — modify — drop `yamlOverride` param, update JSDoc.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/mergeEventOverrides.test.js` — modify — drop Layer-2 tests, keep 3-layer coverage.

## Notes

- The runtime `comment` is folded into the engine default by `buildDefaultLogEventPayload` — not by this function. Don't move that logic.
- This task doesn't touch the call site; Task 6 updates `handleSubmit` to stop passing `yamlOverride: params.event_overrides?.[params.interaction]`.
