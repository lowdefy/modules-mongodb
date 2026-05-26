# Task 3: Drop `event_overrides:` / `interactions:` bake-in from `makeWorkflowApis`

## Context

`makeWorkflowApis` (the part-13 resolver) emits one `update-action-{action_type}` Lowdefy Api per form/task action. Today its `emitActionEndpoint(workflow, action, hooksMap, eventMap, interactionsMap)` bakes the action YAML's `event:` and `interactions:` blocks into the endpoint payload's `properties:`:

```js
// modules/workflows/resolvers/makeWorkflowApis.js
const properties = {
  /* ... action_id, action_type, etc ... */
  ...(hooksMap ? { hooks: hooksMap } : {}),
  ...(eventMap ? { event_overrides: eventMap } : {}),
  ...(interactionsMap ? { interactions: interactionsMap } : {}),
};
```

The two map helpers (`emitEventOverrides`, `emitInteractions`) read `action.event` and `action.interactions` and project them into per-interaction maps. Part 32 drops these literals — the handler will no longer consume them.

Snapshot of the relevant code (current `makeWorkflowApis.js`):

```js
function emitEventOverrides(action) { /* lines 40-53 */ }
function emitInteractions(action)   { /* lines 55-64 */ }
function emitActionEndpoint(workflow, action, hooksMap, eventMap, interactionsMap) { /* line 66 */ }
function emitForWorkflow(workflow) {
  // ...
  const { apis: hookApis, map: hooksMap } = emitHooks(action);
  apis.push(...hookApis);
  const eventMap = emitEventOverrides(action);
  const interactionsMap = emitInteractions(action);
  apis.push(emitActionEndpoint(workflow, action, hooksMap, eventMap, interactionsMap));
}
```

Tests live in `modules/workflows/resolvers/makeWorkflowApis.test.js` and cover both the `event_overrides:` and `interactions:` emission paths.

## Task

1. **Delete `emitEventOverrides` and `emitInteractions`** from `modules/workflows/resolvers/makeWorkflowApis.js`. Delete the top-of-file `EVENT_OVERRIDE_FIELDS` constant (only `emitEventOverrides` uses it).
2. **Change `emitActionEndpoint`'s signature** to `(workflow, action, hooksMap)`. Remove the two trailing parameters and the two spread expressions that injected `event_overrides:` and `interactions:` into the `properties:` object. The remaining `properties` shape should be:
   ```js
   const properties = {
     action_id: { _payload: 'action_id' },
     action_type: action.type,
     workflow_type: workflow.type,
     interaction: { _payload: 'interaction' },
     current_key: { _payload: 'current_key' },
     form: { _payload: 'form' },
     form_review: { _payload: 'form_review' },
     fields: { _payload: 'fields' },
     comment: { _payload: 'comment' },
     ...(isTask ? { current_status: { _payload: 'current_status' } } : {}),
     ...(hooksMap ? { hooks: hooksMap } : {}),
   };
   ```
3. **Update `emitForWorkflow`** to drop the `eventMap` and `interactionsMap` locals and pass only `(workflow, action, hooksMap)` to `emitActionEndpoint`.
4. **Update `makeWorkflowApis.test.js`**:
   - Delete any test case asserting `event_overrides:` or `interactions:` appears in the emitted endpoint payload.
   - If any test fixture still carries an `action.event:` or `action.interactions:` declaration to exercise emission, either remove that fixture block (preferred) or convert the assertion to verify the bake-in does *not* happen (a single safety-net test that an action with `event:` and `interactions:` declared in YAML produces an endpoint payload without those keys is fine).
   - Other tests (hooks emission, group on_complete emission, basic endpoint shape) stay.

## Acceptance Criteria

- `grep -n "event_overrides\|emitEventOverrides\|emitInteractions\|EVENT_OVERRIDE_FIELDS\|interactionsMap\|eventMap" modules/workflows/resolvers/makeWorkflowApis.js` returns no matches.
- `pnpm --filter=@lowdefy/modules-mongodb-plugins test makeWorkflowApis` passes.
- A run of `makeWorkflowApis` against the demo workflow_config emits per-action endpoints whose `properties:` contain no `event_overrides:` or `interactions:` keys. (Spot-check by snapshot or by inlining a `console.log` during the test run if needed.)

## Files

- `modules/workflows/resolvers/makeWorkflowApis.js` — modify — drop two emit helpers, the `EVENT_OVERRIDE_FIELDS` constant, the two `emitActionEndpoint` params, and the two property spreads.
- `modules/workflows/resolvers/makeWorkflowApis.test.js` — modify — drop tests for the dropped literals; keep coverage for hook Api emission and base endpoint shape.

## Notes

- The handler-side reads (`params.interactions`, `params.event_overrides`) keep working for now — they'll just always be `undefined` after this task lands. Tasks 4–6 remove the reads.
- A workflow author who leaves `interactions:` or `event:` on an action YAML after this lands gets silent acceptance: `makeWorkflowsConfig` doesn't reject unknown keys and `makeWorkflowApis` ignores them. The design accepts this — no real-world users to migrate.
