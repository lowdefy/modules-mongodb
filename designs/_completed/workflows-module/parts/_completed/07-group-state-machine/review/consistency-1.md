# Consistency Review 1

## Summary

Walked design.md against the 14 resolutions in review-1.md. All review decisions were already propagated cleanly during the action review pass. Found three internal-consistency issues that survived the per-finding edits because they sat above the section level — fixed all three.

## Files Reviewed

- **Design:** `design.md`.
- **Reviews:** `review/review-1.md` (14 findings, 13 resolved, 1 rejected, 0 deferred / accepted / open).
- **Supporting / tasks / plans:** none.

## Inconsistencies Found

### 1. Goal statement doesn't reflect scope absorbed during action review

**Type:** Review-vs-Design (cumulative scope drift)
**Source of truth:** Resolutions for findings #3 (build-time validator), #4 (auto-complete sub-step), #6 (`StartWorkflow` pre-population).
**Files affected:** `design.md` § Goal.
**Resolution:** Rewrote the Goal as a four-bullet list naming each handler / resolver this part touches: `StartWorkflow` pre-population, `SubmitWorkflowAction` recompute + auto-complete, `CancelWorkflow` sync, `makeWorkflowsConfig` validator.

The original Goal listed only `SubmitWorkflowAction`-side changes plus `CancelWorkflow` sync. During action review the scope absorbed `StartWorkflow.js` (finding #6), the auto-complete check (finding #4 — it had been a sub-bullet, became a sub-step), and the build-time `blocked_by` validator (finding #3 — picks up part 4's deferral). The Goal still read like the pre-action-review version.

### 2. "Repo" header listed only one path; part 7 now touches three

**Type:** Internal Contradiction
**Source of truth:** Findings #3, #6, #8 — design now extends files across `SubmitWorkflowAction/`, `StartWorkflow/`, `CancelWorkflow/`, and `modules/workflows/resolvers/`.
**Files affected:** `design.md` § header line.
**Resolution:** Changed `**Repo:**` to `**Repos:**` and listed all four paths (`SubmitWorkflowAction`, `StartWorkflow`, `CancelWorkflow`, `makeWorkflowsConfig.js`); changed `**Layer:**` from "engine handlers" to "engine handlers + build-time config" since the validator extension lives in the resolver layer.

### 3. Auto-complete prose said "call `pushWorkflowStatus`" but elsewhere said the push was "staged and bundled into step 5's `$set`"

**Type:** Internal Contradiction
**Source of truth:** Finding #4 (Lifecycle ordering table — sub-step 4c "stages" the push; step 5 issues the single `$set`).
**Files affected:** `design.md` § Auto-complete check.
**Resolution:** Reworded the section so the lede says "stage a `pushWorkflowStatus(...)` for step 5's bundled `$set`" — matches the table's framing and removes the implication that 4c writes to Mongo directly. Helper semantics (same-stage no-op guard, no priority rule, terminal-workflow gate) preserved verbatim.

## No Issues

- **Lifecycle ordering** — table at lines 15–22 matches every cross-reference (4a / 4b / 4c) in the sub-section prose.
- **`pushWorkflowStatus` signature** — `(workflowId, 'completed', eventId)` is consistent between the table and the auto-complete section.
- **`blocked_by` walk** — single-pass invariant, priority pass (`6 < 7`), self-exception note, and `shared/updateAction.js` reference all agree.
- **`CancelWorkflow` integration** — projection-fold + one `$set` + no `completed_groups` return shape all consistent with `CancelWorkflow.js:86–108`.
- **Empty-group serialisation** — three mentions (derivation, persistence, cancel) each carry distinct information; not duplication (matches finding #11's rejection).
- **Open questions** — block correctly says `None.` (matches finding #6's close and #12's deletion).
- **Out of scope** — only the `on_complete` deferral remains (matches finding #12's deletion of the display-overrides bullet).
- **Verification** — every checked item in the register has a matching verification entry: `deriveGroupStatus` units, `makeWorkflowsConfig.test.js` units, `handleSubmit` integration, `CancelWorkflow` integration, `StartWorkflow` integration, e2e cross-reference to part 22.
- **Depends on** — correctly names part 6 dependency, part 4 extension, and shipped part 5 extension.
