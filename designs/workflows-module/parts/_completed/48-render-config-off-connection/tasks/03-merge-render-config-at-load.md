# Task 3: Merge `params.render_config` onto action configs in `loadWorkflowState`

## Context

Part 48 moves render config (`status_map`, `event_overrides`) off the connection blob onto per-workflow write endpoints, which deliver it as `params.render_config` keyed `workflow_type → action_type → { status_map?, event_overrides? }` (own workflow + ancestors; emitted by task 8). The engine needs **one seam** where that slice rejoins the action configs the planners read.

That seam is `loadWorkflowState` (`plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.js`). It already has `context` (hence `context.params`) and resolves `workflowConfig` from `context.workflowsConfig` (`:110`). The planners are pure (no `params`/`context` access — Part 38) and must stay that way; downstream they read `actionConfig.status_map?.[stage]` (`planActionTransition.js:195`) and — after tasks 4/5 — `actionConfig.event_overrides?.[signal]`.

The splice must hit **every action** in the workflow config, not just the resolved `targetAction`: `planAutoUnblock` renders unblocked **siblings'** `status_map` (it resolves each candidate's config from `actionsConfig`), so each sibling needs its render slice too. And it must run in **both modes** — submit (`{ actionId, signal }`) and `{ workflowId }` — because the tracker cascade re-loads each ancestor level through the same function (`runTrackerCascade.js:95–97`) and `params` is the originating write's params throughout the invocation, so every ancestor's render config is in scope at the level that loads it.

## Task

In `loadWorkflowState.js`, after resolving `workflowConfig` (post the `:110` lookup and its not-found throw) and **before** any return:

```js
// Part 48 merge-at-load seam: splice the endpoint-delivered render slice
// (status_map + event_overrides) onto every action config. A missing
// render_config / workflow / action key is legal — engine-default rendering.
const renderSlice = context.params?.render_config?.[workflow.workflow_type];
if (renderSlice) {
  for (const actionCfg of workflowConfig.actions ?? []) {
    const slice = renderSlice[actionCfg.type];
    if (!slice) continue;
    if ('status_map' in slice) actionCfg.status_map = slice.status_map;
    if ('event_overrides' in slice) actionCfg.event_overrides = slice.event_overrides;
  }
}
```

Contract points to implement and document in the function's JSDoc:

- **Missing-key contract:** an absent `render_config`, absent `[workflow_type]`, or absent `[action_type]` is **legal and never throws** — downstream reads are optional-chained and fall through to sticky-`status_map`/default-event-display behavior. This is load-bearing: a runtime parent chain can outlive a config edge (a retargeted/removed `child_workflow_type` leaves an existing child cascading to a parent type absent from `params.render_config`).
- **Idempotent in-place merge:** `loadWorkflowState` returns the `workflowConfig` instance it `.find`s in `context.workflowsConfig` (no clone), so the merge mutates that object. Safe because `context.workflowsConfig` is freshly operator-evaluated per connection call (never shared across requests); idempotent because CAS retries re-load the **same** object while `params.render_config` is constant for the invocation — re-splicing writes identical values. Do not clone.
- Runs in both modes (submit and `{ workflowId }`), so every cascade level merges its own workflow's slice.

Tests (`loadWorkflowState.test.js`):

- Submit mode with `context.params.render_config` carrying `status_map` + `event_overrides` for the target's type → returned `workflowConfig.actions[*]` and `actionConfig` carry the spliced values; sibling actions with slices get theirs too.
- `{ workflowId }` mode splices as well.
- No `params.render_config` / no workflow key / no action key → configs unchanged, no throw.
- Calling twice on the same context (CAS retry simulation) yields identical configs.
- Blob `status_map` is **overwritten** (not deep-merged) when the slice carries one — the endpoint value is authoritative.

## Acceptance Criteria

- All four contract points above hold under test.
- Existing `loadWorkflowState` tests (access gate, stage check, error codes) pass unchanged.
- `pnpm test` passes in `plugins/modules-mongodb-plugins`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.js` — modify — the splice + JSDoc.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.test.js` — modify — seam tests.

## Notes

- Until task 8 lands, no endpoint emits `render_config`, so this seam is dormant in the running app — the blob still carries `status_map` (dropped in task 10) and rendering is unchanged. That's the intended compatibility bridge.
- Do **not** plumb `params` into any planner — the seam exists precisely so planners stay pure.
