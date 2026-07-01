# Task 3: `commitPlan` accepts plans with no workflow write

## Context

Part 38's commit phase (`plugins/modules-mongodb-plugins/src/connections/shared/phases/commitPlan.js`) writes a `Plan` in five steps: (1) workflow claim — CAS-gated `findOneAndUpdate` or insert, (2) action bulk-write, (3) event dispatch via `callApi(endpoints.new_event)`, (4) notifications, (5) change-log insert. Step 1 currently destructures `plan.workflow` unconditionally, and `buildCommitResult` reads `plan.workflow.doc._id`.

The `UpdateActionFields` operation writes **no workflow doc** — summary/groups/form_data are unaffected by action metadata, so the design pins: "Because no workflow doc is written there is no CAS gate; concurrent fields-updates are last-write-wins on the action doc (acceptable for metadata, consistent with Part 38 D15's deferral of per-action CAS)." Its plan (task 4) will carry `workflow: null`.

`planChangeLog.js` already tolerates a null workflow entry (`[...planActions, planWorkflow].filter(Boolean)`), so only `commitPlan` and the `Plan` typedef need amending.

## Task

1. **`commitPlan.js`** — in `commitWorkflowAndActions`, when `plan.workflow == null`:
   - Skip step 1 entirely (no CAS read, no `ConcurrentSubmitError` possibility).
   - Step 2 (action bulk-write) runs as today.
   - The transaction/standalone branching is unchanged (a single bulkWrite inside a transaction is harmless; don't special-case it).
2. **`buildCommitResult`** — when `plan.workflow == null`, take `workflow_id` from `context.loadedState.workflow._id` (the load phase always has the workflow). Keep the existing path when `plan.workflow` is present.
3. **`types.js` (`shared/phases/types.js`)** — amend the `Plan` typedef: `workflow` becomes `{...} | null`, documented as "null for plans that touch no workflow doc (`UpdateActionFields` — no CAS gate; per-action concurrency is last-write-wins, Part 38 D15 deferral)". Note that `trackerFires` / `completedGroups` are Submit-plan members; a fields plan simply doesn't carry them (the fields handler doesn't run the cascade or group logic).
4. Steps 3–5 (event, notifications, change-log) run unchanged for a workflow-less plan. Step 4 (`dispatchNotifications`) stays in place — it is keyed on the committed event and is a no-op unless an app's notification config matches the `action-fields-updated` event type.

Extend `commitPlan.test.js`:

- A plan with `workflow: null` + one action update: no workflow collection write occurs, the action bulk-write + event + change-log all run, `CommitResult.workflow_id` equals the loaded workflow's `_id`.
- No CAS evaluation happens for a workflow-less plan (a stale `loadedState.workflow.updated.timestamp` must NOT throw `ConcurrentSubmitError`).
- Existing plans (workflow present, insert + update variants) behave exactly as before.

## Acceptance Criteria

- `pnpm --filter modules-mongodb-plugins test commitPlan` passes, existing cases untouched.
- Workflow-less plan: zero writes to the workflows collection, normal steps 2–5.
- `Plan` typedef documents the nullable workflow contract.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/commitPlan.js` — modify — skip step 1 / null-safe `buildCommitResult`.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/commitPlan.test.js` — modify — workflow-less plan cases.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/types.js` — modify — `Plan.workflow` nullable.

## Notes

- Do NOT add an action-level CAS filter to the bulkWrite — the design explicitly defers it ("add an action-level CAS filter to the bulkWrite if contention proves real", Open questions). Last-write-wins is the v1 contract.
