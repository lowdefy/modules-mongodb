# Consistency Review 1 (Part 8)

## Summary

Cross-checked Part 8's `design.md` against the task files just produced by `/r:design-task`. Found 2 inconsistencies — both touched open questions or unspecified gaps the tasks resolved on their own. Resolved interactively with the user.

## Files Reviewed

**Design:**

- `designs/workflows-module/parts/08-side-effect-dispatch/design.md`

**Reviews:**

- `designs/workflows-module/parts/08-side-effect-dispatch/review/review-1.md` (all 13 findings annotated as resolved/deferred in the prior `/r:design-action-review` pass)

**Tasks (just produced):**

- `tasks/tasks.md`
- `tasks/01-new-event-id-passthrough.md`
- `tasks/02-workflow-api-schema-app-name.md`
- `tasks/03-derive-entity-ref-key.md`
- `tasks/04-build-default-log-event-payload.md`
- `tasks/05-dispatch-log-event.md`
- `tasks/06-dispatch-notifications.md`
- `tasks/07-handler-lifecycle-step-7-8.md`
- `tasks/08-event-id-round-trip-regression.md`
- `tasks/09-worked-example-fixture-smoke.md`

**Live code cross-referenced:**

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` (try/catch boundaries — lines 172-358 wrap steps 4-6; step 7 outside the catch)
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.js` (context-build entry point)

## Decision Register

All 13 findings from [review-1.md](./review-1.md) were resolved in the earlier action-review pass and are baked into design.md:

1. `event_id = context.eventId`; dispatcher passes `_id` into `new-event`; `new-event.yaml` extended with `_if_none` fallback.
2. `display` keyed by `app_name` (= events module's `display_key`); workflows module's `app_name` manifest var (Part 20) plumbed through `WorkflowAPI.connection.app_name`.
3. `status_before` = pre-step-4 `action.status[0].stage`; `status_after` = engine-resolved `targetStatus`.
4. Error-path log events deferred.
5. `references` includes `<entity-ref-key>: [workflow.entity_id]`; spec amended.
6. Cancel-workflow event dropped from scope.
7. `event_ids` is the only field on `send-notification` payload.
8. Input bag captured at step 1, before step 4 mutates `context.workflowActions`.
9. `dispatchLogEvent.js` split: pure `buildDefaultLogEventPayload` (named) + dispatcher `dispatchLogEvent` (default).
10. Verification line decomposed.
11. Round-trip regression test added.
12. `buildDefaultLogEventPayload` returns unkeyed shape.
13. Smoke test uses fixture app pre-Part-20.

## Inconsistencies Found

### 1. Task 7's step-7 failure behavior conflicted with design open Q1

**Type:** Design-vs-Task drift (open-question resolution)
**Source of truth:** Resolved interactively in favor of task 7's stance.
**Files affected:** `design.md` § Open questions (closed Q1, promoted to a new § Step 7 / step 8 failure mode section).
**Resolution:** Task 7 says *"a step 7 failure throws to the request layer"*. The design's open Q1 leaned *"throws an engine error transition"* — these are different behaviors (200 OK with `error_transition` populated vs. exception bubbles up to `@lowdefy/api`). User picked the throw-to-request-layer stance. Closed the open question, added § Step 7 / step 8 failure mode with the rationale: (a) Part 6's catch defends inconsistent write state, but steps 7-8 run after writes are durable — no inconsistent state to defend against; (b) writing an `error` entry on top of a just-written success transition would corrupt action history; (c) loud failure is more useful to the developer than a silent error_transition; (d) matches dispatcher contract in tasks 5 + 6 (both throw with `step` markers). Also added a note that apps can re-call `update-action-{action_type}` with the same `interaction` for a second-chance backfill via Part 6's same-stage self-exception. Task 7's instructions are unchanged.

### 2. Tasks 2 & 4 introduced an `appName = 'default'` fallback not specified in the design

**Type:** Design-vs-Task addition (gap-filling).
**Source of truth:** Resolved interactively in favor of "schema-optional, runtime-required" (option c).
**Files affected:**
- `design.md` § `app_name` plumbing — added a "Required-ness" paragraph pinning the contract.
- `tasks/02-workflow-api-schema-app-name.md` — rewrote the "Required?" paragraph to drop the silent-default reasoning.
- `tasks/04-build-default-log-event-payload.md` — replaced the `appName = 'default'` default-arg with an explicit `throw` when `appName` is missing or empty; updated JSDoc, test expectations, and the Notes section.
**Resolution:** Schema field stays optional (no entry on `schema.js`'s `required` array) so fixture-app tests can spin up a `WorkflowAPI` connection without manifest plumbing. But the pure function throws if `appName` is missing — silent `'default'` would produce events that render blank on any app whose `display_key !== 'default'`, surfacing only when someone notices an entity timeline missing entries. Task 5's `appName: context.connection?.app_name` continues to propagate undefined correctly; task 9's fixture already sets `app_name: 'test-app'` explicitly. Task 8's fixture also already sets it.

## No Issues

Areas checked where everything was consistent:

- **`_id` passthrough chain** (review-1 #1) — task 1 ships the YAML extension; task 5 passes `_id: context.eventId`; task 8 asserts the round-trip equality. All three line up.
- **Display keying convention** (review-1 #2) — task 4 builds `display: { [appName]: { title } }`; task 5 reads from `context.connection?.app_name`; task 9 sets `app_name: 'test-app'` in the fixture and asserts the doc's `display.test-app.title`. Consistent.
- **Entity-ref derivation** (review-1 #5) — task 3 ships `deriveEntityRefKey`; task 4 imports + uses it; task 9 asserts `leads_ids: ['L1']` on the inserted event. The derivation rule is identical across all three files (strip trailing `-collection`, kebab→snake, append `_ids`).
- **Status before/after capture** (review-1 #3 + #8) — task 7's input-bag construction reads `context.action.status?.[0]?.stage` before step 4 and `targetStatus` from step 1, matching design's pinned semantics.
- **Notifications payload shape** (review-1 #7) — task 6 asserts `Object.keys(payload).length === 1` to enforce the "only `event_ids`" contract; task 9 asserts `notificationCalls[0] === { event_ids: [result.event_id] }`.
- **`buildDefaultLogEventPayload` import seam** (review-1 #9 + #12) — task 4 commits to named export; task 5 commits to default export for the dispatcher; tasks.md commentary names both correctly. Part 9 (sibling design) already references `buildDefaultLogEventPayload` by name following the prior consistency-4 sweep.
- **Cancel-workflow event drop** (review-1 #6) — no task touches CancelWorkflow; § Out of scope on the design carries the deferral rationale.
- **`_completed/` link state** — Part 8 design still references `../06-submit-action-writes/design.md` (broken — Part 6 lives under `_completed/` per commit `82cabf1`). Same broken-link pattern across other Part 8 files and Part 9's design. This is the deferred sweep called out in [consistency-4.md § Out of scope here](../../../review/consistency-4.md) — out of scope for this consistency pass.

## Files Modified

1. `designs/workflows-module/parts/08-side-effect-dispatch/design.md` — closed open Q1; promoted resolution to § Step 7 / step 8 failure mode; added "Required-ness" paragraph to § `app_name` plumbing; consolidated duplicate § Out of scope headers.
2. `designs/workflows-module/parts/08-side-effect-dispatch/tasks/02-workflow-api-schema-app-name.md` — rewrote the "Required?" paragraph to commit to schema-optional + runtime-required.
3. `designs/workflows-module/parts/08-side-effect-dispatch/tasks/04-build-default-log-event-payload.md` — replaced default-arg fallback with explicit throw; updated JSDoc, test expectations, Notes.
