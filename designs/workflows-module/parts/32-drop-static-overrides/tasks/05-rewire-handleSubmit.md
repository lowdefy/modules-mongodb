# Task 5: Rewire `handleSubmit` to stop passing the status Layer-2 input

## Context

After Task 4, `resolveTargetStatus` no longer accepts `yamlInteractions`. `handleSubmit` still passes it, reading it from `params.interactions` — but that payload key is gone after Task 3, so it's always `undefined` at this point. This task removes the dead reads.

The event-override path is **unchanged**. `handleSubmit` keeps passing `yamlOverride: params.event_overrides?.[params.interaction]` into `mergeEventOverrides`, which still accepts the four-layer signature. Do not touch any event-override call site.

Current call sites in `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js`:

```js
// Line ~125 — first resolve before pre-hook
const initialTargetStatus = resolveTargetStatus({
  interaction: params.interaction,
  actionConfig,
  params,
  yamlInteractions: params.interactions,   // ← DROP
});

// Line ~162 — re-resolve after pre-hook
const resolvedTargetStatus = resolveTargetStatus({
  interaction: params.interaction,
  actionConfig,
  params,
  yamlInteractions: params.interactions,   // ← DROP
  preHookStatus: preHookResponse?.status,
});

// Line ~329 — event payload merge — LEAVE UNTOUCHED
const mergedEventPayload = mergeEventOverrides({
  defaultPayload: defaultEventPayload,
  yamlOverride: params.event_overrides?.[params.interaction],
  preHookOverride: preHookResponse?.event_overrides,
});
```

Tests live in `handleSubmit.test.js` (~1600 lines). Search for `params.interactions`, `yamlInteractions`, `interactions:` in test fixtures and assertions — any test that exercised the status Layer-2 path needs to either be removed (if status Layer-2 was the only thing being tested) or rewritten to use the pre-hook return channel (if the test was checking end-to-end status-override behaviour and the Layer-2 input was incidental). **Do not** touch tests that exercise `params.event_overrides` / `yamlOverride` for the event-override channel.

## Task

1. **Drop `yamlInteractions: params.interactions`** from both `resolveTargetStatus` call sites in `handleSubmit.js`.
2. **Do not** touch the `mergeEventOverrides` call site. The `yamlOverride: params.event_overrides?.[params.interaction]` argument stays.
3. **Audit `handleSubmit.test.js`** for tests that reference `params.interactions` in fixtures or assertions:
   - **Delete** tests whose only purpose was to verify status Layer-2 behaviour (YAML status override wins over engine default, YAML status wins / loses against pre-hook, etc.).
   - **Rewrite** tests where Layer-2 status inputs were incidental scaffolding (the test exercises something else end-to-end) — drop the `params.interactions` input from the fixture and adjust the expected outcome to the post-pre-hook (or engine-default) status.
   - **Do not** delete or rewrite tests covering the event-override channel (`params.event_overrides`, `yamlOverride`, `event:` fixtures).
4. **Add a new test** covering the design's § Verification bullet: a pre-hook that returns `status: 'not-a-real-stage'` causes `handleSubmit` to throw before any writes land. Assertions:
   - The throw bubbles out of `handleSubmit`.
   - The throw is a `UserError` with `isReject === false` (per Task 4's implementation).
   - The action's `status[0]` (read from the in-memory `context.workflowActions`, or a Mongo find against the test harness's collection) is unchanged from pre-submit.
   - No log event was dispatched and no notifications were sent (assert against the relevant mock spies — see existing `dispatchLogEvent` / `dispatchNotifications` test patterns).
5. **Add a smoke test (or extend an existing one)** asserting that when an action's pre-hook returns a valid `status`, it flows through (engine-default-overridden) without any reliance on `params.interactions` being set. If the existing happy-path test already covers this, no addition needed.

## Acceptance Criteria

- `grep -n "params.interactions\|yamlInteractions" plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` returns no matches.
- `grep -n "params.event_overrides\|yamlOverride" plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` **still** returns matches — the event channel is unchanged.
- `pnpm --filter=@lowdefy/modules-mongodb-plugins test handleSubmit` passes.
- The pre-hook-bad-status test asserts: (a) throw is a `UserError(isReject: false)`, (b) no writes (in-memory or DB), (c) no log event / notification dispatched.
- `pnpm --filter=@lowdefy/modules-mongodb-plugins test` passes end-to-end (run the full plugin test suite — `worked-example.test.js` exercises the full lifecycle).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify — drop two `yamlInteractions` args. Leave the `yamlOverride` arg in place.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify — drop status Layer-2 tests, add bad-status-throws-pre-write test. Leave event-override tests intact.

## Notes

- After Task 3 lands, `params.interactions` is never populated, so dropping the read is purely a cleanup. Tests that fed that value directly via a synthetic `params` bag were testing a code path that no longer has a real ingress.
- The bad-status test is the design's main new behavioural assertion. Make sure the assertion explicitly checks the throw is a `UserError` with `isReject === false` (per Task 4's implementation).
- `worked-example.test.js` may need a small update if its fixture uses `interactions:` on any action YAML — fix any test breakage there before declaring this task done. Fixtures using `event:` are fine and stay.
