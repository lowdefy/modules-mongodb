# Task 9: Refactor Cancel/Close cascades to per-action `MongoDBUpdateOne` loop

## Context

`CancelWorkflow.js:84-96` and `CloseWorkflow.js:84-130` today push `{ stage: 'not-required' }` onto every affected action in one `MongoDBUpdateMany`. With render-on-write, each action's update payload is different (each has its own render context — different `_id`, `assignees`, `metadata`, etc.), so one `MongoDBUpdateMany` no longer fits.

Per design D11, the wire shape becomes a loop of `MongoDBUpdateOne` — one community-plugin call per affected action. The community plugin (`@lowdefy/community-plugin-mongodb`) deliberately omits `MongoDBBulkWrite` because its change-log feature relies on per-op before/after reads that don't compose with a single bulk round-trip. Every other engine write goes through the change-logged single-doc paths; the cascade staying on that pattern keeps the engine's write surface uniform. Cancel/Close are infrequent user-triggered operations — sub-second sweep latency on typical 20-100 affected actions, and per-action change-log entries improve audit granularity over today's single `MongoDBUpdateMany` log entry.

Per-action loop steps:
1. Fetch the non-terminal action.
2. Build merged doc — cascade does not pass caller fields, so `mergedActionDoc = actionDocBeforeWrite`.
3. Run `renderStatusMap` + `computeEngineLinks` against the merged doc. Pass `entryId: context.entry_id` into `computeEngineLinks` (per Task 6 + Task 3 — engine-written `link.pageId` must be prefixed with the workflows module entry id).
4. Run `buildActionStageUpdate` with `newStage: 'not-required'`.
5. `await context.mongoDBConnection('actions').MongoDBUpdateOne({ filter: { _id }, update: <pipeline> })` for that action.

Per-action `status[]` entries stay `{ stage: 'not-required', created, event_id }` — workflow-level `cancelled` carries `reason`, per-action sweep entries do **not** (preserve today's behaviour).

Cancel/Close cascade ordering preserved: the post-sweep summary recompute (the `MongoDBFind` over all actions in `CancelWorkflow.js:98-129` and the equivalent block in `CloseWorkflow.js`) still runs **after** the per-action loop completes — same read-after-write order as today's `MongoDBUpdateMany` + summary read. Only the per-action update mechanic changes.

## Task

1. **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js`** — replace the `MongoDBUpdateMany` at lines 84-96 with the per-action loop described above. Each iteration issues one `MongoDBUpdateOne` call. The summary-recompute `MongoDBFind` after the sweep is unchanged.

2. **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.js`** — same shape for the sweep at lines 84-130.

3. **Tests** — extend the existing `CancelWorkflow.test.js` and `CloseWorkflow.test.js`:
   - Each affected action gets a `not-required` `status[]` entry prepended.
   - For built-in kinds, each affected action's `link` for every access slug is `null` after the sweep (per the link table — `not-required` → `null` everywhere).
   - `message` for each slug persists from the previous stage (sticky) — assert by setting up actions with prior renders and confirming `message` is unchanged.
   - `status_title` persists.
   - `metadata` is unchanged (sweep does not supply new metadata).
   - The post-sweep `MongoDBFind` still runs and the workflow-level summary recompute lands on post-sweep state.
   - Per-action loop issues N `MongoDBUpdateOne` calls (one per affected action), not a single bulk write.

## Acceptance Criteria

- Both cascades loop `MongoDBUpdateOne` per affected action. The action update mechanic is identical between Cancel and Close — only the surrounding workflow-level operation differs.
- All new test cases pass.
- Existing Cancel/Close tests continue to pass.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js` — modify.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.js` — modify.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.test.js` — modify or extend.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.test.js` — modify or extend.

## Notes

The change is mechanic-only. Don't restructure the workflow-level `MongoDBUpdateOne` / `MongoDBFind` calls around the per-action sweep — the existing two-write structure (sweep, then summary read) is what preserves the read-after-write order.

`MongoDBBulkWrite` is not exposed by `@lowdefy/community-plugin-mongodb`; don't try to reach for it. If a real-world deployment hits sweep-latency problems later, adding `MongoDBBulkWrite` (with a change-log compatibility story) becomes separate, scoped work — out of scope here.
