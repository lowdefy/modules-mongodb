# Task 3: Drop `interactions:` bake-in from `makeWorkflowApis`

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

Part 32 drops the `interactions:` literal only. The `event_overrides:` literal stays — the `event:` channel survives (see the design's § Scope note and [Part 33](../../../33-comment-rendering/design.md)). So `emitEventOverrides`, the `EVENT_OVERRIDE_FIELDS` constant, and the `event_overrides:` property spread all remain untouched.

Snapshot of the relevant code (current `makeWorkflowApis.js`):

```js
function emitEventOverrides(action) { /* lines 40-53 — KEEP */ }
function emitInteractions(action)   { /* lines 55-64 — DELETE */ }
function emitActionEndpoint(workflow, action, hooksMap, eventMap, interactionsMap) { /* line 66 */ }
function emitForWorkflow(workflow) {
  // ...
  const { apis: hookApis, map: hooksMap } = emitHooks(action);
  apis.push(...hookApis);
  const eventMap = emitEventOverrides(action);        // KEEP
  const interactionsMap = emitInteractions(action);   // DELETE
  apis.push(emitActionEndpoint(workflow, action, hooksMap, eventMap, interactionsMap));
}
```

Tests live in `modules/workflows/resolvers/makeWorkflowApis.test.js` and cover both the `event_overrides:` and `interactions:` emission paths. Only the `interactions:` tests go away.

## Task

1. **Delete `emitInteractions`** from `modules/workflows/resolvers/makeWorkflowApis.js`. Leave `emitEventOverrides` and the `EVENT_OVERRIDE_FIELDS` constant untouched.
2. **Change `emitActionEndpoint`'s signature** to `(workflow, action, hooksMap, eventMap)`. Remove the trailing `interactionsMap` parameter and the spread expression that injected `interactions:` into the `properties:` object. The remaining `properties` shape should be:
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
     ...(eventMap ? { event_overrides: eventMap } : {}),
   };
   ```
3. **Update `emitForWorkflow`** to drop the `interactionsMap` local and pass only `(workflow, action, hooksMap, eventMap)` to `emitActionEndpoint`. The `eventMap` local stays.
4. **Update `makeWorkflowApis.test.js`**:
   - Delete any test case asserting `interactions:` appears in the emitted endpoint payload.
   - If any test fixture still carries an `action.interactions:` declaration to exercise emission, either remove that fixture block (preferred) or convert the assertion to verify the bake-in does *not* happen (a single safety-net test that an action with `interactions:` declared in YAML produces an endpoint payload without that key is fine).
   - **Keep** tests covering `event_overrides:` emission and `action.event:` fixtures — that channel is unchanged.
   - Other tests (hooks emission, group on_complete emission, basic endpoint shape) stay.

## Acceptance Criteria

- `grep -n "emitInteractions\|interactionsMap" modules/workflows/resolvers/makeWorkflowApis.js` returns no matches.
- `grep -n "emitEventOverrides\|EVENT_OVERRIDE_FIELDS\|eventMap" modules/workflows/resolvers/makeWorkflowApis.js` **still** returns matches — those symbols are unchanged.
- `pnpm --filter=@lowdefy/modules-mongodb-plugins test makeWorkflowApis` passes.
- A run of `makeWorkflowApis` against the demo workflow_config emits per-action endpoints whose `properties:` contain no `interactions:` key. The `event_overrides:` key appears whenever the action YAML declares `event:`. (Spot-check by snapshot or by inlining a `console.log` during the test run if needed.)

## Files

- `modules/workflows/resolvers/makeWorkflowApis.js` — modify — drop `emitInteractions`, the `emitActionEndpoint` `interactionsMap` param, and the `interactions:` property spread. Keep everything `event_overrides:`-related.
- `modules/workflows/resolvers/makeWorkflowApis.test.js` — modify — drop `interactions:`-emission tests; keep `event_overrides:`-emission tests and base endpoint shape coverage.

## Notes

- The handler-side read of `params.interactions` keeps working for now — it'll just always be `undefined` after this task lands. Task 5 removes the read.
- A workflow author who leaves `interactions:` on an action YAML after this lands gets silent acceptance: `makeWorkflowsConfig` doesn't reject unknown keys and `makeWorkflowApis` ignores them. The design accepts this — no real-world users to migrate.
