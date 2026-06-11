# Task 4: `planSubmit` reads `event_overrides` off `actionConfig`

## Context

Today `planSubmit` (`plugins/modules-mongodb-plugins/src/connections/shared/phases/planSubmit.js:200`) sources the YAML event override directly from endpoint params:

```js
yamlEventOverrides: params.event_overrides?.[params.signal],
```

Task 3 established the merge-at-load seam: `loadWorkflowState` splices the endpoint-delivered render slice — including `event_overrides` — onto every action config, so `loadedState.actionConfig.event_overrides` now carries the target action's override map whenever the endpoint delivers one. Part 48 moves `event_overrides` to that seam so it has **exactly one delivery path** (the same path the tracker-mirror channel uses in task 5), not two.

## Task

In `planSubmit.js`, change the `planEventDispatch` call's override source:

```js
yamlEventOverrides: loadedState.actionConfig.event_overrides?.[params.signal],
```

(`actionConfig` is already destructured/available in `planSubmit` — it is the loaded target action's config.) `preHookEventOverrides: preHookResult.event_overrides` is untouched.

Remove/adjust any comment that says the YAML override comes from `params.event_overrides` (the "baked by Part 13" lineage comment in `mergeEventOverrides.js`'s JSDoc can mention the new source if touched, but don't refactor it).

Tests (`planSubmit.test.js`):

- A loaded state whose `actionConfig.event_overrides[signal]` carries an override → the planned event reflects the merged display.
- `params.event_overrides` set but `actionConfig.event_overrides` absent → **no** YAML override applies (the old path is dead).
- No override anywhere → engine default (existing tests).

## Acceptance Criteria

- `grep -n "params.event_overrides" plugins/modules-mongodb-plugins/src` returns no hits in `planSubmit.js` (the read moved to `actionConfig`).
- `pnpm test` passes in `plugins/modules-mongodb-plugins`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planSubmit.js` — modify — override source.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planSubmit.test.js` — modify — source-switch tests.

## Notes

- **Transient app-level window:** until task 8 re-emits the endpoint (which replaces the flat `event_overrides` property with `render_config`), the running demo's per-action submit endpoints still emit `params.event_overrides`, which nothing reads after this task — YAML event overrides are inert at runtime between tasks 4 and 8. Unit tests stay green; the window closes at task 8. Do not "fix" this by keeping a fallback read of `params.event_overrides` — the design explicitly wants one path, not two.
