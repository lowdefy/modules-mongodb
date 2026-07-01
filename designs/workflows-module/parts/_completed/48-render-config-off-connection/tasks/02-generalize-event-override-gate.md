# Task 2: Generalize `planEventDispatch`'s override merge gate

## Context

`planEventDispatch` (`plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js`) composes the per-invocation event doc for all five handler types. It applies the override merge (`mergeEventOverrides`: engine default → YAML override → pre-hook override) **only under `if (isSubmit)`** (`:197`):

```js
let mergedPayload = defaultPayload;
if (isSubmit) {
  mergedPayload = mergeEventOverrides({
    defaultPayload,
    yamlOverride: yamlEventOverrides,
    preHookOverride: preHookEventOverrides,
  });
}
```

On the tracker-mirror and lifecycle paths `mergedPayload` stays the engine default — the header comment notes "no override channels exist for them". Part 48 opens both channels (D4: tracker-mirror, D8: lifecycle), and both rely on this one gate change: rather than special-casing each path, the gate fires whenever an override slice is actually present.

## Task

In `planEventDispatch.js`:

1. Replace the `if (isSubmit)` gate with presence-based gating:

```js
let mergedPayload = defaultPayload;
if (yamlEventOverrides || preHookEventOverrides) {
  mergedPayload = mergeEventOverrides({
    defaultPayload,
    yamlOverride: yamlEventOverrides,
    preHookOverride: preHookEventOverrides,
  });
}
```

2. Update the JSDoc: `yamlEventOverrides` is no longer "Submit only" — it is the override slice for whichever path supplies one (submit YAML `event_overrides[signal]`, the parent tracker action's `event_overrides[internal_mirror_child_*]` (task 5), or a workflow-level lifecycle override (task 6)). `preHookEventOverrides` remains supplied only by the submit path (no pre-hook layer exists elsewhere). Update the header comment that says overrides apply "only to SubmitWorkflowAction events" / "no override channels exist for them".

3. Behavioral invariant: with **no** override argument passed, every path renders exactly today's engine defaults (`DEFAULT_TITLES`). Callers that pass nothing are unaffected — `planTrackerLevel.js:140–151`, `StartWorkflow.js:205`, `CancelWorkflow.js:117`, `CloseWorkflow.js:133` all currently pass no override args.

4. Tests (`planEventDispatch.test.js`):
   - tracker-mirror with a `yamlEventOverrides` slice → merged display (override title wins, non-overridden keys fall through), default when absent.
   - lifecycle (`StartWorkflow`/`CancelWorkflow`/`CloseWorkflow` handler types) with a `yamlEventOverrides` slice → merged; default when absent.
   - submit path unchanged (existing tests keep passing).
   - note `invokePreHook` returns `event_overrides: {}` (not undefined) on the no-hook path (`invokePreHook.js:85`) and `planSubmit` passes it through — an empty object is truthy, so the gate fires and `mergeEventOverrides` must remain a no-op for `{}` (it is: `overlay` returns base fields for missing keys). Add a test pinning that `{}` overrides change nothing.

## Acceptance Criteria

- The gate fires for any handler type when an override slice is present; absent overrides render today's engine defaults on every path (existing snapshot/expectation tests unchanged).
- An `{}` pre-hook override produces output identical to no override.
- `pnpm test` passes in `plugins/modules-mongodb-plugins`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js` — modify — gate + JSDoc.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.test.js` — modify — new gate tests.

## Notes

- Do not change `mergeEventOverrides.js` — its shape contract (`{ type?, display?, references?, metadata? }`, one-level-deep overlay on `display`/`references`/`metadata`) is what tasks 5 and 6 feed.
- This change is shared infrastructure for D4 and D8 — land it before tasks 5 and 6.
