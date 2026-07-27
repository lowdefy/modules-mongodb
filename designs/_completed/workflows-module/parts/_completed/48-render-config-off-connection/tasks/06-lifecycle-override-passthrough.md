# Task 6: Lifecycle override pass-through in Start/Cancel/Close handlers

## Context

The lifecycle events (`workflow-started`/`-cancelled`/`-closed`) render engine defaults with no override channel. Part 48 D8 adds one: a **workflow-level** `event` map (a lifecycle event belongs to no single action, so the per-action seam can't carry it), delivered to each `{type}-start/cancel/close` endpoint as a sibling `lifecycle_event_override` property holding that workflow's `event[<the one signal the endpoint fires>]` slice (own workflow only — lifecycle events never cascade; emitted in task 9).

Each handler fires exactly one lifecycle signal and today calls `planEventDispatch` with no override arg:

- `StartWorkflow.js:205` — `signal: 'started'`
- `CancelWorkflow.js:117` — `signal: 'cancelled'`
- `CloseWorkflow.js:133` — `signal: 'closed'`

Task 2's generalized gate applies whatever override slice arrives. No pre-hook layer exists for lifecycle, so `preHookEventOverrides` stays undefined — the merge is default → YAML override only.

**Override shape (design ambiguity, resolved):** D8 says the workflow-level map is "the per-action `action.event` shape, one scope up" and that the handler passes `params.lifecycle_event_override` **directly** as `yamlEventOverrides` into the existing merge. `mergeEventOverrides` consumes `{ type?, display?, references?, metadata? }` with `display` keyed by app. So the slice shape is `{ display: { {app}: { title, description? } }, … }` — i.e. workflow-level authoring is `event: { started: { display: { demo: { title: "…" } } } }`. (The design's YAML examples show `signal → app → { display }` nesting; that contradicts the "per-action shape one scope up" clause and would not merge without a transform the design never specifies — the per-action shape wins. Tasks 7 and 9 use the same resolution.)

## Task

In each of the three handlers, add the pass-through to the `planEventDispatch` call:

```js
yamlEventOverrides: params.lifecycle_event_override,
```

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` (~`:205`)
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js` (~`:117`)
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.js` (~`:133`)

No other handler change. The authoring contract — override templates render against `{ user, workflow, signal }` only (no `action`/`status_after`/`submitted_form`; lifecycle ctx is built at `planEventDispatch.js:168–175`) — should be noted in a short comment at one of the pass-through sites and in the handler JSDoc where the lifecycle event is described.

Tests (each handler's `.test.js`):

- `params.lifecycle_event_override = { display: { demo: { title: 'Onboarding kicked off for {{ workflow.entity_id }}' } } }` → committed event doc carries the rendered override title for that app; non-overridden apps/keys fall through to default.
- No `lifecycle_event_override` param → engine default title (existing tests unchanged).

## Acceptance Criteria

- Each of the three handlers honors `params.lifecycle_event_override`; absent → today's defaults. All six cases under test.
- `pnpm test` passes in `plugins/modules-mongodb-plugins`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` — modify — pass-through.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js` — modify — pass-through.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.js` — modify — pass-through.
- Their three `.test.js` files — modify — override tests.

## Notes

- The endpoint property doesn't exist until task 9 — until then `params.lifecycle_event_override` is always undefined at runtime and behavior is unchanged. That's fine; this task is unit-verified.
- Depends on task 2 (the generalized gate). Without it the override would be silently ignored on these paths.
