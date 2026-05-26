# Task 6: Rewire `handleSubmit` to stop passing Layer-2 inputs

## Context

After Tasks 4 + 5, `resolveTargetStatus` no longer accepts `yamlInteractions` and `mergeEventOverrides` no longer accepts `yamlOverride`. `handleSubmit` still passes both, reading them from `params.interactions` and `params.event_overrides[params.interaction]` — but those payload keys are gone after Task 3, so they're always `undefined` at this point. This task removes the dead reads.

Current call sites in `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js`:

```js
// Line ~125 — first resolve before pre-hook
const initialTargetStatus = resolveTargetStatus({
  interaction: params.interaction,
  actionConfig,
  params,
  yamlInteractions: params.interactions,
});

// Line ~162 — re-resolve after pre-hook
const resolvedTargetStatus = resolveTargetStatus({
  interaction: params.interaction,
  actionConfig,
  params,
  yamlInteractions: params.interactions,
  preHookStatus: preHookResponse?.status,
});

// Line ~329 — event payload merge
const mergedEventPayload = mergeEventOverrides({
  defaultPayload: defaultEventPayload,
  yamlOverride: params.event_overrides?.[params.interaction],
  preHookOverride: preHookResponse?.event_overrides,
});
```

Tests live in `handleSubmit.test.js` (~1600 lines). Search for `params.interactions`, `params.event_overrides`, `interactions:`, `event_overrides:` in test fixtures and assertions — any test that exercised the Layer-2 path needs to either be removed (if Layer-2 was the only thing being tested) or rewritten to use the pre-hook return channel (if the test was checking end-to-end override behaviour and the Layer-2 input was incidental).

## Task

1. **Drop `yamlInteractions: params.interactions`** from both `resolveTargetStatus` call sites in `handleSubmit.js`.
2. **Drop `yamlOverride: params.event_overrides?.[params.interaction]`** from the `mergeEventOverrides` call site.
3. **Audit `handleSubmit.test.js`** for tests that reference `params.interactions` or `params.event_overrides` in fixtures or assertions:
   - **Delete** tests whose only purpose was to verify Layer-2 behaviour (YAML status override wins over engine default, YAML event override merges on top of default, YAML wins / loses against pre-hook, etc.).
   - **Rewrite** tests where Layer-2 inputs were incidental scaffolding (the test exercises something else end-to-end) — drop the Layer-2 inputs from the fixture and adjust the expected outcome to the post-pre-hook (or engine-default) state.
4. **Add a new test** covering the design's § Verification bullet: a pre-hook that returns `status: 'not-a-real-stage'` causes `handleSubmit` to throw before any writes land. Assertions:
   - The throw bubbles out of `handleSubmit`.
   - The action's `status[0]` (read from the in-memory `context.workflowActions`, or a Mongo find against the test harness's collection) is unchanged from pre-submit.
   - No log event was dispatched and no notifications were sent (assert against the relevant mock spies — see existing `dispatchLogEvent` / `dispatchNotifications` test patterns).
5. **Add a smoke test (or extend an existing one)** asserting that when an action's pre-hook returns valid `status` and `event_overrides`, both flow through (engine-default-overridden) without any reliance on `params.interactions` or `params.event_overrides` being set. If the existing happy-path test already covers this, no addition needed.

## Acceptance Criteria

- `grep -n "params.interactions\|params.event_overrides\|yamlInteractions\|yamlOverride" plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` returns no matches.
- `pnpm --filter=@lowdefy/modules-mongodb-plugins test handleSubmit` passes.
- The pre-hook-bad-status test asserts: (a) throw, (b) no writes (in-memory or DB), (c) no log event / notification dispatched.
- `pnpm --filter=@lowdefy/modules-mongodb-plugins test` passes end-to-end (run the full plugin test suite — `worked-example.test.js` exercises the full lifecycle).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify — drop two `yamlInteractions` args and one `yamlOverride` arg.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify — drop Layer-2 tests, add bad-status-throws-pre-write test.

## Notes

- After Task 3 lands, `params.interactions` and `params.event_overrides` are never populated, so dropping these reads is purely a cleanup. Tests that fed those values directly via a synthetic `params` bag were testing a code path that no longer has a real ingress.
- The bad-status test (§ Verification bullet 4) is the design's main new behavioural assertion. Make sure the assertion explicitly checks the throw is a `UserError` with `isReject === false` (per Task 4's implementation).
- `worked-example.test.js` may need a small update if its fixture uses `interactions:`/`event:` on any action YAML — fix any test breakage there before declaring this task done.
