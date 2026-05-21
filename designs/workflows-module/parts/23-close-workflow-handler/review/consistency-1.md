# Consistency Review 1

## Summary

Part-scoped consistency sweep of Part 23 following the [review-1 action-review pass](review-1.md) (10 findings annotated). Surveyed the part's own `design.md`, the top-level `designs/workflows-module/design.md` narrative, all sibling parts that cross-reference Part 23 (parts 19, 20, 22, and shipped parts 5–8 in `_completed/`), and the workflows-module-concept specs. Found 11 inconsistencies — 10 auto-resolved, 1 flagged as a Part 6 follow-on per user choice.

## Files Reviewed

**Design (Part 23):**

- `parts/23-close-workflow-handler/design.md`
- `parts/23-close-workflow-handler/review/review-1.md`

**Top-level + sibling designs:**

- `designs/workflows-module/design.md`
- `parts/19-operational-apis/design.md`, `review/review-1.md`
- `parts/20-module-manifest/design.md`
- `parts/22-workflows-e2e-suite/design.md`
- `parts/10-tracker-subscription/design.md`

**Shipped parts cross-referenced:**

- `parts/_completed/05-start-cancel-handlers/tasks/06-cancel-workflow.md`
- `parts/_completed/06-submit-action-writes/design.md`, `tasks/tasks.md`, `tasks/05-extend-update-action.md`, `tasks/08-step-1-validate-and-translate.md`, `tasks/11-step-5-recompute-summary.md`, `tasks/13-mid-write-error-transition.md`, `review/review-1.md`, `review/consistency-1.md`
- `parts/_completed/07-group-state-machine/design.md`, `tasks/04-push-workflow-status.md`
- `parts/_completed/08-side-effect-dispatch/design.md`

**Concept specs:**

- `workflows-module-concept/engine/spec.md`
- `workflows-module-concept/action-authoring/spec.md`
- `workflows-module-concept/module-surface/spec.md`

**Shipped engine code (verified against):**

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js`
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js`
- `plugins/modules-mongodb-plugins/src/connections/shared/pushWorkflowStatus.js`, `updateAction.js`

## Decision Register

Extracted from [review-1](review-1.md):

1. **D1** (#1, #5, #7) — No new `shared/closeWorkflow.js`. `CloseWorkflow.js` reuses shipped `pushWorkflowStatus.js` + `recomputeGroups.js` inline, mirroring `CancelWorkflow.js`'s two-write shape. Part 7's bundle is left untouched.
2. **D2** (#2) — Groups with `required_after_close: true` survivors land at `in-progress`/`blocked`, not `done`. Asymmetry with cancel is intentional and load-bearing for honest "open work" surfacing.
3. **D3** (#3) — `CloseWorkflow.js` calls `fireTrackerSubscription` directly (same posture as `CancelWorkflow.js`). Part 10 is sync-in-process, not a listener; each terminating handler invokes the subscription itself.
4. **D4** (#4) — Close event/notifications deferred to a follow-on, not to shipped Part 8.
5. **D5** (#8) — Sweep mechanism is bulk two-step (fetch + in-memory filter + `MongoDBUpdateMany`), not `updateAction(...force: true)` calls. Bulk dispatcher bypasses priority rule by structure, not by flag.
6. **D6** (#9) — `references` writes use `RESERVED_WORKFLOW_KEYS` defensive delete (matching shipped `CancelWorkflow.js:4–18`), not "merge order" alone. Merge-order doesn't protect against `references.status` injection when `$set` is combined with `$push: status`.
7. **D7** (#10) — `required_after_close` applies to close path only. Cancel keeps its blanket sweep. The action-authoring spec was amended to scope the flag to `completed` only.
8. **D8** (#6) — Stale paths to `_completed/` parts accepted; user will sweep separately across all unshipped parts.

## Inconsistencies Found

### 1. Part 23 self-link in Write sequence references review-finding meta

**Type:** Stale Reference (Part 23 internal)
**Source of truth:** Part 23 `design.md` Writes block describes the sweep mechanism directly; review file is a meta artefact, not a content destination.
**Files affected:** `parts/23-close-workflow-handler/design.md:50` — "see finding-#8 mechanism in [design.md:30](../design.md)". The path `../design.md` resolves up to the parts directory (broken), and `finding-#8` is a review-meta reference that doesn't help readers.
**Resolution:** Replaced with an inline description of the three-step bulk pattern, referencing the Action sweep bullet above. Also fixed line 49's "see Writes block below" to "per the payload bullet above" (the Writes block is above the Write sequence subsection, not below).

### 2. Shipped Part 6 design lists Cancel + Close sweeps as `updateAction(...force: true)` callers

**Type:** Review-vs-Design / Internal Contradiction (engine spec ↔ Part 6 design)
**Source of truth:** [engine spec § Priority rule](../../../../workflows-module-concept/engine/spec.md#priority-rule) — splits engine-internal force-pushes into per-doc force (via `updateAction`) and bulk bypass (via `MongoDBUpdateMany`), naming `CancelWorkflow`'s and `CloseWorkflow`'s sweeps under bulk bypass. Plus Part 23 review-1 D5.
**Files affected:** `parts/_completed/06-submit-action-writes/design.md:87` — listed both sweeps among engine-internal force-pushes that "call `updateAction(...force: true)` directly". Sweeps don't go through `updateAction`.
**Resolution:** Rewrote the bullet to split per-doc force (error transition, tracker subscription, parent-link push) from bulk bypass (Cancel + Close sweeps), cross-referencing the engine spec section. Same posture across both mechanisms (neither reconstructs a handler payload).

### 3. Shipped Part 6 design lists Cancel + Close sweeps among `updateAction.js` callers

**Type:** Review-vs-Design / Internal Contradiction (engine spec ↔ Part 6 design)
**Source of truth:** Same as #2.
**Files affected:** `parts/_completed/06-submit-action-writes/design.md:102` — Sub-modules bullet listed `CancelWorkflow`'s `not-required` loop and `CloseWorkflow`'s sweep among existing `force: true` callers of `updateAction.js`.
**Resolution:** Trimmed the per-doc force-caller list to just the helpers that actually go through `updateAction.js` (StartWorkflow's parent push, tracker subscription, pre-hook entries) and added a sentence pointing the bulk sweeps at `MongoDBUpdateMany` directly per the engine spec.

### 4. Shipped Part 6 Out-of-scope bullet retired by D1 and "Author-initiated" wording

**Type:** Review-vs-Design (Part 23 D1 ↔ Part 6 out-of-scope)
**Source of truth:** Part 23 [`design.md` § Write shape — reuse shipped helpers, no new shared helper](../design.md) and Part 23 wording "user-initiated".
**Files affected:** `parts/_completed/06-submit-action-writes/design.md:112` — "**Author-initiated** `CloseWorkflow` handler … part 23 introduces a **shared workflow-close write helper** (status push + summary recompute) that part 7's auto-complete and part 23's `CloseWorkflow` both consume."
**Resolution:** Updated wording to "User-initiated" and rewrote the helper claim to describe the shipped reality: Part 7 inlines its `completed` `$push` into the bundled `$set`; Part 23 reuses shipped `shared/pushWorkflowStatus.js` and `recomputeGroups.js` inline, mirroring `CancelWorkflow.js`'s two-write shape. Removed the shared-helper assertion.

### 5. "Author-initiated" in Part 6 tasks list

**Type:** Stale terminology (cascade from #4)
**Source of truth:** Part 23 standardized on "user-initiated" during action review.
**Files affected:** `parts/_completed/06-submit-action-writes/tasks/tasks.md:63`.
**Resolution:** Replaced "Author-initiated" with "User-initiated" in the part-23 deferral bullet.

### 6. Part 6 task 05 lists Cancel/Close sweeps as `force: true` callers in caller list

**Type:** Review-vs-Task (engine spec + Part 23 D5 ↔ shipped task file)
**Source of truth:** Engine spec § Priority rule + Part 23 D5.
**Files affected:** `parts/_completed/06-submit-action-writes/tasks/05-extend-update-action.md:34, 36` — caller list bullets named `CancelWorkflow`'s sweep and `CloseWorkflow`'s sweep as `updateAction.js` callers passing `force: true`.
**Resolution:** Removed both sweeps from the caller list. Added a trailing paragraph stating sweeps go through `MongoDBUpdateMany` directly and do not touch this helper. Linked the engine spec section as the canonical reference.

### 7. Part 6 task 05 JSDoc template still names Cancel + Close sweeps as per-doc force callers

**Type:** Stale Reference (template code comment)
**Source of truth:** Engine spec § Priority rule + Part 23 D5.
**Files affected:** `parts/_completed/06-submit-action-writes/tasks/05-extend-update-action.md:60–61` — the JSDoc template for `updateAction.js` listed `CancelWorkflow`'s sweep and `CloseWorkflow`'s sweep as per-entry force callers.
**Resolution:** Rewrote the JSDoc lines to name only the per-doc force callers (StartWorkflow's parent push, tracker subscription, pre-hook returns) and added a sentence calling out that bulk sweeps bypass the helper entirely.

### 8. Part 6 task 11 still references the retired shared close helper

**Type:** Review-vs-Task (Part 23 D1 ↔ shipped Part 6 task)
**Source of truth:** Part 23 [`design.md` § Write shape — reuse shipped helpers, no new shared helper](../design.md).
**Files affected:** `parts/_completed/06-submit-action-writes/tasks/11-step-5-recompute-summary.md:77` — "pushing the workflow status to `completed` is part 7's extension, sharing the workflow-close write helper that lands with part 23."
**Resolution:** Rewrote the bullet to describe the shipped reality: Part 7 bundles inline; Part 23 reuses `shared/pushWorkflowStatus.js` and `recomputeGroups.js` inline. No shared close helper.

### 9. Part 22 row 06 conflated `completed` and `cancelled` gate behaviour

**Type:** Review-vs-Design (Part 23 D7 ↔ Part 22 test matrix)
**Source of truth:** Updated [action-authoring/spec.md § Terminal-behaviour field](../../../../workflows-module-concept/action-authoring/spec.md) — `required_after_close: true` now applies to `completed` only.
**Files affected:** `parts/22-workflows-e2e-suite/design.md:60` — assertion was "terminal-workflow gate (`completed`/`cancelled` workflow rejects submit unless `required_after_close: true`)" which conflates the two termination stages.
**Resolution:** Split the assertion into two cases: `completed` rejects unless `required_after_close: true`; `cancelled` rejects ALL submits regardless. Added a pointer to the action-authoring spec section.

### 10. Engine spec already correct — surveyed only

**Type:** Already consistent (no change needed)
**Source of truth:** N/A — verification only.
**Files affected:** None. [engine spec § Priority rule (lines 307–312)](../../../../workflows-module-concept/engine/spec.md#priority-rule) already carries the per-doc force vs bulk bypass split that Part 23 D5 references. Engine spec line 310 names `CloseWorkflow`'s sweep under bulk bypass. No drift here — flagged for coverage.

## Flagged for follow-on (not auto-resolved)

### 11. Shipped Part 6 terminal-workflow gate lets `required_after_close: true` through on `cancelled`

**Type:** Review-vs-Implementation (Part 23 D7 ↔ shipped Part 6 code + design + tasks)
**Source of truth:** Updated [action-authoring/spec.md § Terminal-behaviour field](../../../../workflows-module-concept/action-authoring/spec.md) — `required_after_close: true` applies to `completed` (close path only); does NOT apply to `cancelled`.
**Files affected:**

- Implementation: `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js:128–129` — current gate is `(workflowStage === "completed" || workflowStage === "cancelled") && actionConfig.required_after_close !== true`. Per D7, the cancelled branch should reject unconditionally.
- Design: `parts/_completed/06-submit-action-writes/design.md:51` and line 127 — describes the gate as `{completed, cancelled} AND !required_after_close`.
- Tasks: `parts/_completed/06-submit-action-writes/tasks/08-step-1-validate-and-translate.md:9, 113–124, 210–211` — task instructions and unit-test bullets reflect the pre-D7 gate, including an explicit test (line 211) that asserts "workflow in `cancelled` stage + action with `required_after_close: true` → does not throw on step 1" — which is now wrong per D7.
- Task: `parts/_completed/06-submit-action-writes/tasks/13-mid-write-error-transition.md:7` — mentions the gate.

**Resolution:** Per user choice, **not auto-fixed.** Filed as a follow-on task: tighten the shipped Part 6 terminal-workflow gate to reject ALL submits on `cancelled` workflows (`required_after_close` no longer applies), update Part 6 design + tasks + unit tests accordingly. The Part 22 test matrix (finding #9 above) already asserts the new behaviour; the Part 6 follow-on lands before Part 22's row-06 spec passes.

## No Issues

Areas checked where everything was already consistent:

- **Engine spec § Priority rule** — already splits per-doc force vs bulk bypass; already names `CloseWorkflow`'s sweep under bulk bypass.
- **Module-surface spec § APIs table** — `close-workflow` row already present, owned by parts 19 + 23, "user-initiated" wording.
- **Action-authoring spec § Terminal-behaviour field** — D7 amendment applied during action review; v0 evidence captured inline.
- **Top-level `designs/workflows-module/design.md`** — Part 23 dependency narrative + helper claim updated during action review to match Part 23 D1.
- **Part 19 design + review-1** — `references` pass-through note and `RESERVED_WORKFLOW_KEYS` deferral both reference Part 23's defensive-delete pattern correctly. "User-initiated" wording in Part 19 `close-workflow.yaml` section.
- **Part 20 manifest exports list** — `close-workflow` present in the static-API list, parenthetically attributing it to Part 23.
- **Part 22 matrix row 23** — Already lists the load-bearing assertions (sweep filter, blocked exception, idempotent re-close, cancel rejection, tracker fan-up). Only row 06 needed an edit (#9 above).
- **Part 7 shipped design** — auto-complete bundle and `CancelWorkflow integration` section are exactly the shipped behaviour Part 23 D1 documents reusing; no drift.
- **Part 10 design** — trigger-sites list and synchronous-in-process posture are correct sources of truth for Part 23 D3.
- **Shipped `pushWorkflowStatus.js` docstring** — already names Part 23 as a future caller; no drift after D1.
- **Shipped `CancelWorkflow.js`** — `RESERVED_WORKFLOW_KEYS` list and bulk-`MongoDBUpdateMany` sweep are the shape Part 23 D5 and D6 reference; no drift.
- **`_completed/05-start-cancel-handlers/tasks/06-cancel-workflow.md`** — already calls out the v0 filter as deferred behaviour and explicitly says "Don't carry that filter into v1; flip every non-terminal action." Aligns with D7 (which closed that deferral by scoping `required_after_close` to close only).

## Files Modified

- `parts/23-close-workflow-handler/design.md` — Write-sequence self-link cleanup (#1).
- `parts/_completed/06-submit-action-writes/design.md` — three edits: per-doc vs bulk-bypass split in priority-rule bullet (#2), `updateAction.js` caller list trimmed (#3), Out-of-scope Part 23 bullet rewritten (#4).
- `parts/_completed/06-submit-action-writes/tasks/tasks.md` — "Author-initiated" → "User-initiated" (#5).
- `parts/_completed/06-submit-action-writes/tasks/05-extend-update-action.md` — two edits: caller list (#6) + JSDoc template (#7).
- `parts/_completed/06-submit-action-writes/tasks/11-step-5-recompute-summary.md` — auto-complete attribution / shared-helper retraction (#8).
- `parts/22-workflows-e2e-suite/design.md` — row 06 terminal-workflow gate split for `completed` vs `cancelled` (#9).

## Open follow-ons

- **Tighten shipped Part 6 terminal-workflow gate** (finding #11) — code change in `handleSubmit.js`, design/task updates in `parts/_completed/06-submit-action-writes/`. Lands before Part 22's row-06 spec passes.
