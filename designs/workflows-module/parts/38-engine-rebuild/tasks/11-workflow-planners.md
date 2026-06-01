# Task 11: Workflow planners — `planWorkflowRecompute` + `planFormDataMerge`

## Context

These pure planners compose the planned post-commit **workflow** doc from the loaded workflow + the planned action states. They replace the deleted `recomputeWorkflowAfterActionWrite.js`. Per Q1, the planner composes the **whole** post-commit workflow doc (commit `$set`s it whole); this is the design's lean.

⚠️ **`planFormDataMerge` carries an unresolved open question (Q6).** The merge rule must be settled before implementing — see Notes. Do not guess; confirm with the design author / resolve per the embedded analysis.

## Task

**Create `shared/phases/planners/planWorkflowRecompute.js`:**

- Compose the planned post-commit workflow doc (whole doc, per Q1) from `loadedState.workflow` + planned action states:
  - Recompute `groups` against planned action states.
  - Recompute `summary` (`{ done, not_required, total }`) against planned action states.
  - Check auto-complete: push `completed` onto workflow status iff `total === done + not_required`. `completed` and `cancelled` are mutually exclusive.
- Pure: derives everything from `loadedState` + planned actions; no reads.

**Create `shared/phases/planners/planFormDataMerge.js`:**

- Merge submitted form data into the planned workflow's `form_data`, keyed by action.
- Merge order: `params.form` → `params.form_review` → `preHookResult.form_overrides`.
- Expose `submitted_form` (the pre-merged result) for the event render context (task 12).
- **The merge rule is the Q6 decision** — see Notes.

## Acceptance Criteria

- `planWorkflowRecompute` produces a correct whole post-commit workflow doc: summary/groups recompute correctly; `shouldPushCompleted` triggers only when `total === done + not_required`; `completed`/`cancelled` mutually exclusive.
- `planFormDataMerge` merges in the documented order and deep-merges onto the **loaded** `form_data.{action}` sub-object (so sibling sub-keys set by earlier submits survive) — per the resolved Q6 rule.
- `submitted_form` is exposed for the event context.
- Tests: `planWorkflowRecompute.test.js` (summary/groups, completed trigger, mutual exclusion), `planFormDataMerge.test.js` (keyed vs unkeyed, merge order, shape preservation, the Q6 edge cases once decided).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planWorkflowRecompute.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planFormDataMerge.js` — create
- `…/planners/planWorkflowRecompute.test.js` — create
- `…/planners/planFormDataMerge.test.js` — create

## Notes

**Q6 — `form_data` merge rule (MUST resolve before implementing `planFormDataMerge`).** The design commits the workflow as a whole-doc `$set` (Q1), so the form_data behaviour is determined entirely by how `planFormDataMerge` composes the planned `form_data` from the loaded base. The real (sequential, not concurrency) requirement, evidenced in the reference project: one action's form_data accumulates across multiple submits of different shapes (submit → approve, draft → submit, changes-required → resubmit) and a later write must not wipe a sibling sub-key an earlier write set.

Whole-doc `$set` satisfies this **iff** `planFormDataMerge` deep-merges submitted fields onto the loaded `form_data.{action}` sub-object (rather than replacing it). Open sub-decisions to settle:

1. **Merge vs replace granularity.** Candidate: deep-merge nested objects, **replace arrays + scalars whole** (arrays *must* replace — element-wise merge of differing-length arrays is garbage). But prod's submitter intentionally *replaces* its namespace while the reviewer *merges* one sub-key — a blanket deep-merge changes the submitter's semantics.
2. **Removal-by-omission.** Whole-namespace overwrite drops a field when the payload omits it; deep-merge keeps stale values until overwritten. Diverges in `changes-required → resubmit → re-review`. Decide: v1 supports clearing, or documents "set-only, persists until overwritten."
3. **Per-channel shapes.** Whether `form` (submitter) and `form_review` (reviewer) follow *different* write semantics (replace vs scoped-merge), or one uniform rule is acceptable for v1.

The concurrency case (two writers, different fields, same workflow) is now CAS-serialized (one wins, one retries — D15) — **accepted**. Verified evidence is in the design's review-2 #2 / Q6 discussion; this is a design-judgement call, not code archaeology. **Bake the chosen rule into the design's Q6 section (or the relevant planner doc) and reframe engine D5's "Write semantics" justification from concurrency to "multi-stage/multi-shape accumulation within an action namespace."**
