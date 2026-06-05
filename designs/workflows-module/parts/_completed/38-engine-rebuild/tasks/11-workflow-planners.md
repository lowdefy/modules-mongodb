# Task 11: Workflow planners — `planWorkflowRecompute` + `planFormDataMerge`

## Context

These pure planners compose the planned post-commit **workflow** doc from the loaded workflow + the planned action states. They replace the deleted `recomputeWorkflowAfterActionWrite.js`. The planner composes the **whole** post-commit workflow doc; the commit phase `$set`s it whole.

## Task

**Create `shared/phases/planners/planWorkflowRecompute.js`:**

- Compose the planned post-commit workflow doc (whole doc) from `loadedState.workflow` + planned action states:
  - Recompute `groups` against planned action states, by importing the **relocated shared helpers** `recomputeGroups.js` / `deriveGroupStatus.js` (moved to `shared/phases/planners/` by task 9) — do **not** reimplement the derivation (one correct way). **This recompute participates in the interleaved auto-unblock fixpoint (task 10):** `planAutoUnblock` reads the recomputed group status to resolve group-id `blocked_by` deps, so group recompute runs *before each* unblock pass and a **final** time after the last pass (an `unblock` flips a group label `blocked → in-progress`). The fixpoint imports the same shared helper rather than a `planWorkflowRecompute` export (tasks 10/11 stay parallel-safe); the whole-workflow-doc composition here is the final step.
  - Recompute `summary` (`{ done, not_required, total }`) against planned action states.
  - Check auto-complete: push `completed` onto workflow status iff `total > 0 && total === done + not_required` **and** the current workflow stage is not already `completed` or `cancelled`. The `total > 0` guard stops a zero-action workflow from auto-completing (`0 === 0`); the current-stage guard makes the push idempotent (no second `completed` entry on a `required_after_close` re-submit) and keeps `completed`/`cancelled` mutually exclusive. Both guards preserve `recomputeWorkflowAfterActionWrite.js:82–89` and its pinned tests. **Optional `lifecyclePush: { stage, reason }` input (added by task 23; consumed by task 17's Cancel/Close):** when present, skip the auto-complete check entirely and push the declared lifecycle entry instead (`{ stage, event_id, created: now, ...(reason ? { reason } : {}) }`) — Cancel/Close declare their `cancelled`/`completed` push here so their sweep-induced all-terminal state can't add a phantom/duplicate `completed`; Submit and tracker levels omit it.
  - **Stamp `updated: now` on the planned doc** — `now` is the per-invocation change stamp (`{ timestamp, user }`, minted at handler entry by task 15 and injected here exactly like the action planners' `now`, task 10). This replaces `recomputeWorkflowAfterActionWrite.js:102`'s `updated: context.changeStamp` and is what keeps the D15 CAS sound: **every commit must advance the stored `updated.timestamp`**, or a concurrent submit that loaded the same state still CAS-matches after the first commit and both win silently. Never carry the loaded `updated` through to the planned doc.
- Pure: derives everything from `loadedState` + planned actions + the injected `now`; no reads, no input mutation — build **new** `status`/`groups`/`summary` values rather than mutating the loaded doc (no `unshift` onto the loaded `status` array).

**Create `shared/phases/planners/planFormDataMerge.js`:**

- Build `submitted_form` by merging the three channels in order: `params.form` → `params.form_review` → `preHookResult.form_overrides`. This inter-channel pre-merge uses the **same deep-merge rule** as the merge onto the loaded base below (objects deep-merge; arrays/scalars/`null` replace whole — one merge rule everywhere): a later channel overrides an earlier one per-key, but nested sibling keys survive (e.g. `form` sets `a.b`, `form_overrides` sets `a.c` → `submitted_form.a` carries both). Not the old `mergeFormOverrides.js` top-level spread.
- Deep-merge `submitted_form` onto the loaded `form_data` sub-object for the current action. The target path depends on whether the action is keyed:
  - **Unkeyed action:** target is `form_data[type]`.
  - **Keyed action:** target is `form_data[type][key]`, where `key` is `params.current_key` (equivalently the loaded target action's `key` — `current_key` is a submit param, not an action-doc field).
- **Merge rule** (uniform across both `form` and `form_review` channels — the engine does not disambiguate submitter vs reviewer write shapes): deep-merge plain objects; **replace arrays, scalars, and `null` whole** (lodash `mergeWith` with an `(objValue, srcValue) => (Array.isArray(srcValue) ? srcValue : undefined)` customizer, or equivalent). `mergeWith` mutates its target, so merge onto a **deep clone** of the loaded base — `mergeWith(cloneDeep(base), submitted_form, customizer)` — never onto `loadedState.workflow.form_data` itself. Sibling sub-keys set by earlier submits survive because they're already in the loaded base.
- **Set-only / persists-until-overwritten:** clearing is explicit (`field: null` overwrites via scalar replace); omitting a field leaves the prior value. No removal-by-omission.
- Expose `submitted_form` (the pre-merged result, before merge onto the loaded base) for the event render context (task 12).
- Pure: derives everything from `params` + `preHookResult` + `loadedState`; no reads, no input mutation.

## Acceptance Criteria

- `planWorkflowRecompute` produces a correct whole post-commit workflow doc: summary/groups recompute correctly; `shouldPushCompleted` triggers only when `total > 0 && total === done + not_required` **and** the current workflow stage is neither `completed` nor `cancelled` (empty workflow never auto-completes; no duplicate push on an already-`completed` or `cancelled` workflow).
- The planned workflow doc carries `updated: now` (the injected per-invocation stamp), never the loaded `updated` — a test asserts the planned doc's `updated.timestamp` differs from `loadedState.workflow.updated.timestamp` (CAS soundness, D15 / task 13).
- `planFormDataMerge` merges the channels in the documented order and deep-merges onto the **loaded** `form_data` sub-object for the current action (correct keyed vs unkeyed target path), so sibling sub-keys set by earlier submits survive. Arrays/scalars/`null` replace whole; objects deep-merge.
- `submitted_form` is exposed for the event context.
- Tests:
  - `planWorkflowRecompute.test.js` — summary/groups recompute; completed trigger boundary; **empty workflow (`total: 0`) does not auto-complete**; **already-`completed` and already-`cancelled` workflows get no push** (carry over the old `recomputeWorkflowAfterActionWrite` test cases); `completed`/`cancelled` mutual exclusion; **does not mutate `loadedState`**.
  - `planFormDataMerge.test.js` — unkeyed target (`form_data[type]`) vs keyed target (`form_data[type][key]`); channel merge order; **inter-channel merge is deep** (`form` sets `a.b`, `form_review` sets `a.c` → both survive in `submitted_form`); object deep-merge preserves sibling sub-keys; **array replaces whole, not element-wise**; explicit `null` clears a scalar; omitted field persists its prior value; **does not mutate `loadedState`**.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planWorkflowRecompute.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planFormDataMerge.js` — create
- `…/planners/planWorkflowRecompute.test.js` — create
- `…/planners/planFormDataMerge.test.js` — create

## Notes

- Concurrency (two writers, same workflow) is out of scope for these planners — it is handled by CAS on `workflow.updated` at commit (task 13). The planners only compose the planned doc; they do not guard against concurrent writers.
