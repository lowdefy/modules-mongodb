# Task 11: Workflow planners — `planWorkflowRecompute` + `planFormDataMerge`

## Context

These pure planners compose the planned post-commit **workflow** doc from the loaded workflow + the planned action states. They replace the deleted `recomputeWorkflowAfterActionWrite.js`. Per Q1, the planner composes the **whole** post-commit workflow doc (commit `$set`s it whole); this is the design's lean.

## Task

**Create `shared/phases/planners/planWorkflowRecompute.js`:**

- Compose the planned post-commit workflow doc (whole doc, per Q1) from `loadedState.workflow` + planned action states:
  - Recompute `groups` against planned action states. **This recompute participates in the interleaved auto-unblock fixpoint (task 10 / D4):** `planAutoUnblock` reads the recomputed group status to resolve group-id `blocked_by` deps, so group recompute runs *before each* unblock pass and a **final** time after the last pass (an `unblock` flips a group label `blocked → in-progress`). Expose the group recompute so the fixpoint can call it between passes; the whole-workflow-doc composition is the final step.
  - Recompute `summary` (`{ done, not_required, total }`) against planned action states.
  - Check auto-complete: push `completed` onto workflow status iff `total === done + not_required`. `completed` and `cancelled` are mutually exclusive.
- Pure: derives everything from `loadedState` + planned actions; no reads.

**Create `shared/phases/planners/planFormDataMerge.js`:**

- Build `submitted_form` by merging the three channels in order: `params.form` → `params.form_review` → `preHookResult.form_overrides`.
- **Deep-merge `submitted_form` onto the loaded `form_data.{action}` sub-object** (Q6, resolved — uniform rule): deep-merge plain objects; **replace arrays, scalars, and `null` whole** (lodash `mergeWith` with an `Array.isArray(src) ? src : undefined` customizer, or equivalent). Sibling sub-keys set by earlier submits survive because they're already in the loaded base.
- **Set-only / persists-until-overwritten:** clearing is explicit (`field: null` overwrites via scalar replace); omitting a field leaves the prior value. No removal-by-omission in v1.
- The same uniform rule applies to both `form` and `form_review` channels — the engine does not disambiguate submitter vs reviewer write shapes.
- Expose `submitted_form` (the pre-merged result, before merge onto the loaded base) for the event render context (task 12).

## Acceptance Criteria

- `planWorkflowRecompute` produces a correct whole post-commit workflow doc: summary/groups recompute correctly; `shouldPushCompleted` triggers only when `total === done + not_required`; `completed`/`cancelled` mutually exclusive.
- `planFormDataMerge` merges the channels in the documented order and deep-merges onto the **loaded** `form_data.{action}` sub-object (so sibling sub-keys set by earlier submits survive) — per the resolved Q6 rule. Arrays/scalars/`null` replace whole; objects deep-merge.
- `submitted_form` is exposed for the event context.
- Tests: `planWorkflowRecompute.test.js` (summary/groups, completed trigger, mutual exclusion), `planFormDataMerge.test.js` (keyed vs unkeyed; channel merge order; object deep-merge preserves siblings; **array replaces whole, not element-wise**; explicit `null` clears a scalar; omitted field persists prior value — the resolved Q6 edge cases).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planWorkflowRecompute.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planFormDataMerge.js` — create
- `…/planners/planWorkflowRecompute.test.js` — create
- `…/planners/planFormDataMerge.test.js` — create

## Notes

**Q6 — `form_data` merge rule (RESOLVED — uniform deep-merge).** The design commits the workflow as a whole-doc `$set` (Q1), so the form_data behaviour is determined entirely by how `planFormDataMerge` composes the planned `form_data` from the loaded base. The load-bearing requirement is *sequential* accumulation: one action's form_data accumulates across multiple submits of different shapes (submit → approve, draft → submit, changes-required → resubmit), and a later write must not wipe a sibling sub-key an earlier write set. Concurrency (two writers, same workflow) is handled separately by CAS on `workflow.updated` (D15) — **accepted**.

**The rule (uniform across `form` and `form_review`):** merge the three channels into `submitted_form` (`params.form` → `params.form_review` → `preHookResult.form_overrides`), then **deep-merge `submitted_form` onto the loaded `form_data.{action}` sub-object** — deep-merge plain objects, **replace arrays + scalars + `null` whole**. Sibling sub-keys survive (they're in the loaded base). Clearing is **explicit** (`field: null`), never by omission — "set-only / persists-until-overwritten."

The chosen uniform rule (Option A) was taken over per-channel replace/merge (Option B) for *one-correct-way* — a single mechanical rule beats a write-shape contract each author must remember. The trade-off: the submitter no longer wipes its namespace, so on `changes-required → resubmit → re-review` a prior `validation` block persists until the reviewer overwrites it. Acceptable — greenfield module, demo config adapts (Proposed change #13), explicit `null` clears when needed. Full rationale and rejected alternatives in the design's Q6 section; engine D5's "Write semantics" has been reframed accordingly.
