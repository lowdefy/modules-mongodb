// Phase contracts per design D2/D3 — the explicit input/output shapes the
// load → pre-hook → plan → commit → post-hook cycle passes between phases.
// On-disk document shapes live in `../types.js`; these are the in-flight
// contracts only.

/**
 * Output of the load phase (`loadWorkflowState`). All reads happen here; after
 * load returns, no further reads happen until the next load (the tracker
 * cascade's next-level load).
 *
 * @typedef {Object} LoadedState
 * @property {import('../types.js').WorkflowDoc} workflow — the loaded workflow
 *   doc. `workflow.updated.timestamp` is the CAS anchor the commit phase pins
 *   (design D15).
 * @property {import('../types.js').ActionDoc[]} actions — every action doc on
 *   the workflow.
 * @property {Object} workflowConfig — the workflowsConfig entry for
 *   `workflow.workflow_type`.
 * @property {Object} [actionConfig] — Submit only: the workflowConfig.actions
 *   entry for the target action's type.
 * @property {import('../types.js').ActionDoc} [targetAction] — Submit only:
 *   the doc identified by `payload.action_id` (the same object instance as its
 *   `actions[]` entry) — the handler passes it as `planActionTransition`'s
 *   `action` input.
 */

/**
 * Output of the pre-hook phase (`invokePreHook`). Pre-hook returns are the
 * only channel into the Plan (design D5); there is no current-action signal
 * redirect.
 *
 * @typedef {Object} PreHookResult
 * @property {Array<{
 *   target: { type: string, key?: string | null },
 *   signal: string,
 *   upsert?: boolean,
 * }>} actions — auxiliary signals against *other* actions. An entry may carry
 *   `upsert: true` to spawn a missing keyed target (design D4 / D13 (2));
 *   `target` then identifies a not-yet-existing `(type, key)`.
 * @property {Object} event_overrides — merged over the engine-default event
 *   payload during planning.
 * @property {Object} form_overrides — merged into the planned workflow's
 *   `form_data` during planning.
 */

/**
 * A raw before/after pair for one doc, accumulated during planning.
 * `planChangeLog` (task 12) transforms these into finished community-schema
 * log-changes entries. `before` is `null` for inserts.
 *
 * @typedef {Object} ChangeLogDelta
 * @property {Object | null} before
 * @property {Object} after
 */

/**
 * Output of the plan phase — the post-commit shape of every doc the submit
 * touches (design D3). Immutable once handed to commit; the commit phase
 * writes the Plan and nothing else.
 *
 * No `notifications` field: the engine builds no notification doc. After
 * commit it fires `callApi("send-notification", { event_ids: [event_id] })`
 * keyed on the committed event (design D9 step 4).
 *
 * @typedef {Object} Plan
 * @property {{
 *   doc: import('../types.js').WorkflowDoc,
 *   operation: 'insert' | 'update',
 *   changeLog: ChangeLogDelta,
 * }} workflow — whole post-commit workflow doc + its raw before/after delta
 *   (`before` is null for insert). `operation` is `update` (the default) for
 *   Submit/Cancel/Close/tracker, `insert` for Start; commit step 1 dispatches
 *   accordingly — update → CAS findOneAndUpdate (design D15), insert →
 *   insertOneDoc with no CAS filter (a fresh _id can't race).
 * @property {Array<{
 *   doc: import('../types.js').ActionDoc,
 *   operation: 'insert' | 'update',
 *   changeLog: ChangeLogDelta,
 * }>} actions — whole post-commit action docs (rendered cell, engine links,
 *   metadata included); commit dispatches per `operation`.
 * @property {{ doc: Object }} event — the fully rendered event doc, exactly
 *   one per invocation: the doc's _id IS the per-invocation event_id (a second
 *   entry would collide on _id), so the singular type enforces the invariant
 *   (design D3).
 * @property {Object[]} changeLog — finished community-schema log-changes
 *   entries built by `planChangeLog` (task 12) from the per-doc deltas above;
 *   commit step 5 inserts these. Empty when `changeLog` is unconfigured on
 *   the connection.
 * @property {Array<{
 *   parentWorkflowId: string,
 *   parentActionId: string,
 *   signal: string,
 * }>} trackerFires — tracker subscriptions to fire after this workflow's
 *   commit; the cascade loop runs the next-level load-plan-commit per entry.
 *   `signal` is one of `internal_mirror_child_active` / `_completed` /
 *   `_cancelled`.
 */

/**
 * Output of the commit phase (`commitPlan`). Carries the IDs of all docs
 * written and records any post-commit dispatch failures (steps 3–5) without
 * throwing — steps 1–2 are the atomicity gate; by step 3 the workflow and
 * actions are durably committed.
 *
 * @typedef {Object} CommitResult
 * @property {string} workflow_id — the committed workflow's `_id`.
 * @property {string[]} action_ids — the `_id` of every action doc committed
 *   (insert or update) in step 2.
 * @property {string | null} event_id — the `_id` of the dispatched event doc
 *   (step 3), or `null` when step 3 recorded a failure.
 * @property {Array<{ step: number, error: Error }>} dispatchErrors — failures
 *   recorded from steps 3–5. Empty on a clean commit. The handler (task 15)
 *   throws `WorkflowEngineError` with `code: "post_commit_dispatch_failed"`
 *   after the tracker cascade and post-hook complete when this is non-empty.
 */

export {};
