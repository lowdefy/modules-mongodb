# Consistency Review 4

## Summary

Scanned design.md against all task files for review-5's three "resolved" findings. Found 5 inconsistencies — all task-side drift from design decisions that landed in review-5. All auto-resolved by updating task files; no design.md edits needed (the design already reflects every resolution).

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md`, `review/review-2.md`, `review/review-3.md`, `review/review-4.md`, `review/review-5.md`, `review/consistency-2.md`, `review/consistency-3.md`
- **Tasks:** `tasks/tasks.md`, `tasks/01-…` through `tasks/15-…`
- **Plans:** none exist
- **Supporting files:** none alongside `design.md`

## Inconsistencies Found

### 1. Task 3 missing the `entryId` parameter and module-scoped pageId mechanic

**Type:** Design-vs-Task Drift
**Source of truth:** review-5 finding #2 (resolved option a) → design.md D4 § Mechanic (lines 93-99) + `computeEngineLinks.js` "New files" entry (line 582) + `computeEngineLinks.test.js` plan (line 585)
**Files affected:** `tasks/03-add-computeEngineLinks.md`

Design.md commits to threading the workflows module entry id into `computeEngineLinks` so engine-written `link.pageId` values are prefixed with `${entryId}/` (matching Lowdefy's build-time `_module.pageId` scoping). The helper signature is `({ actionConfig, stage, actionDoc, entryId })`. Test plan asserts the prefix across multi-mount entry ids and that a missing `entryId` throws on built-in-kind paths.

Task 3 still showed the old positional signature `computeEngineLinks(actionConfig, stage, actionDoc)`, named per-kind page IDs as bare strings (`task-edit`, `workflow-overview`), and instructed the helper to "emit the bare ID — e.g. `'task-edit'` — and let the surrounding wiring resolve it" — which contradicts the mechanic Lowdefy actually provides at runtime.

**Resolution:** Rewrote Task 3's signature to keyed args, added `entryId` to the inputs list with its description and "throw if missing on a built-in-kind path" requirement, updated the per-kind URL table to show `${entryId}/` prefixes, replaced the misleading "emit the bare ID" paragraph with the correct mechanic (engine composes the scoped id by hand because `_module.pageId` is build-time only), updated the tracker test expectation to include the prefix, and added two new test cases — multi-mount prefix assertion (`'workflows'` vs `'wf-2'`) and a "missing `entryId` throws" case.

### 2. No task wired the new `entry_id` connection field

**Type:** Design-vs-Task Drift (missing-coverage gap)
**Source of truth:** review-5 finding #2 (resolved option a) → design.md `WorkflowAPI/schema.js` Modified bullet (line 634) + `modules/workflows/connections/workflow-api.yaml` Modified bullet (line 635)
**Files affected:** `tasks/06-extend-api-contract-metadata-action-display.md`, `tasks/tasks.md`

Design.md has two Modified bullets that no task touched: add `entry_id` (string, required) to the WorkflowAPI connection schema, and wire `entry_id: { _module.id: true }` in `connections/workflow-api.yaml`. Without this wiring, `context.entry_id` is undefined at runtime and the engine cannot compose module-scoped page IDs even after Task 3 lands.

**Resolution:** Extended Task 6 (the closest fit — it already covers other contract-level wiring: manifest, API contract, payload pass-through). Added context paragraph explaining the entry_id mechanic, added two new task steps (4 and 5) covering `WorkflowAPI/schema.js` and `connections/workflow-api.yaml`, added matching acceptance criteria and file list entries. Updated `tasks/tasks.md` row for Task 6 and its ordering rationale paragraph to call out the wiring and its downstream consumers (Tasks 7, 8, 9).

### 3. Task 7 missing the `tracker.child_workflow_type` rename in `createAction` and `StartWorkflow`

**Type:** Design-vs-Task Drift
**Source of truth:** review-5 finding #3 (resolved by rename) → design.md Schema additions § Action doc row for `tracker.child_workflow_type` (line 434) + `createAction.js` Modified bullet (line 593) + `StartWorkflow.js` Modified bullet item 3 (line 629)
**Files affected:** `tasks/07-wire-createAction-and-StartWorkflow.md`

Design.md renames the action-doc field `tracker.workflow_type` → `tracker.child_workflow_type` (paralleling `child_workflow_id` / `child_entity_id` siblings) to disambiguate from the new top-level `workflow_type` (parent workflow's type). Two concrete edits:

- `createAction.js` line 51 — write `tracker: { child_workflow_type: actionConfig.tracker.workflow_type }`.
- `StartWorkflow.js` lines 67-71 — read `parent.tracker?.child_workflow_type`; update the error string accordingly.

Task 7's createAction step list mentioned `workflow_type` denormalisation but did **not** mention the tracker rename. Its StartWorkflow step list only mentioned passing `payload.metadata` / `payload.action_display` through to `createAction` — the parent-tracker validation rename at lines 67-71 and the parent-tracker `updateAction` push at lines 117-128 were absent. Without these, tracker action docs would carry the old `tracker.workflow_type` (collides with the new top-level field), and parent-tracker validation would silently fail.

**Resolution:** Added the tracker subtree rename as a bullet under the `createAction.js` step list. Restructured the StartWorkflow.js step into three sub-changes matching the design's Modified bullet (forward metadata/action_display; document the parent-tracker `updateAction` push at lines 117-128 as the canonical test case for D11's engine-link merge rule; update the parent-tracker validation rename at lines 67-71). Added matching test cases (`tracker.child_workflow_type` assertion on tracker action docs; parent-tracker validation reads the renamed field). Added matching acceptance criteria.

### 4. No task included the `recomputeWorkflowAfterActionWrite` return-shape change

**Type:** Design-vs-Task Drift (missing-coverage gap)
**Source of truth:** review-5 finding #1 (resolved by fixing the helper) → design.md `recomputeWorkflowAfterActionWrite.js` Modified bullet (lines 597-619)
**Files affected:** `tasks/08-wire-updateAction.md`

Design.md changes `recomputeWorkflowAfterActionWrite.js` to compose and return a post-write `workflow` object — so `handleSubmit`'s third edit (`context.workflow = recomputeResult.workflow`) actually resolves to fresh values. Without this helper change, the handler-side edit doesn't fix the staleness bug it was added to fix.

Task 8 documented the `handleSubmit.js` reassignment but **did not** modify the helper that produces the post-write workflow. The implementer would land the handler edit, write the test, see it still read stale `summary`, and have to discover the helper change by re-reading the design.

**Resolution:** Added a "Recompute helper return shape" paragraph to Task 8's Context section explaining the rationale. Added a new step 2 modifying `recomputeWorkflowAfterActionWrite.js` with the explicit code snippet from the design (`const updatedWorkflow = { ...workflow, summary, groups: groupsAfter, updated, ...statusPrepend }`), plus the forward-looking note about future engine paths that dispatch log events after the recompute. Renumbered subsequent steps. Added a test case asserting `recomputeResult.workflow` carries post-write summary / groups / updated / status. Added the file to the Files list. Added matching acceptance criteria.

### 5. Tasks 7, 8, and 9 not threading `context.entry_id` into `computeEngineLinks`

**Type:** Design-vs-Task Drift
**Source of truth:** review-5 finding #2 (resolved option a) → design.md `computeEngineLinks.js` "New files" entry (line 582 — "Callers (`updateAction`, `createAction`, Cancel/Close sweep) thread `context.entry_id` through")
**Files affected:** `tasks/07-wire-createAction-and-StartWorkflow.md`, `tasks/08-wire-updateAction.md`, `tasks/09-refactor-cancel-close-cascade.md`

With Task 3 / Task 6 corrected (findings 1 and 2 above), the three engine writers must pass `entryId: context.entry_id` into `computeEngineLinks` on every call. Tasks 7, 8, and 9 all called `computeEngineLinks` with the positional / no-entryId form.

**Resolution:**
- Task 7: updated the `createAction` call snippet to `computeEngineLinks({ actionConfig, stage: initialStage, actionDoc: draft, entryId: context.entry_id })`. Added a test asserting every emitted built-in-kind `link.pageId` is prefixed with `${context.entry_id}/`.
- Task 8: updated the `updateAction` call snippet to `computeEngineLinks({ actionConfig, stage: newStage, actionDoc: mergedActionDoc, entryId: context.entry_id })`. Added a test asserting the entry-id threading. Added an acceptance-criteria line.
- Task 9: added "Pass `entryId: context.entry_id` into `computeEngineLinks`" to step 3 of the per-action loop with a forward reference to Tasks 6 and 3.

## No Issues

The following were checked and are consistent with design.md (and review-5's resolutions):

- **Decision-letter numbering (D1–D14)** — unchanged from consistency-2's renumbering; no new duplicates or out-of-order entries.
- **D11 § Engine-link merge rule** — Task 8 explicitly merges `actionDocBeforeWrite` with caller `fields` before passing to `renderStatusMap` and `computeEngineLinks`; Task 7 documents the parent-tracker StartWorkflow case as the canonical test.
- **D14 event-display render context** — Tasks 13 and 14 list the six bindings (`user`, `action`, `workflow`, `interaction`, `status_before`, `status_after`) and match D14's "no top-level metadata" / "no entity" / "post-write action doc" / "plain Nunjucks strings" rules.
- **Default event template** — Task 14 commits to `"{{ user.profile.name }} marked {{ action.type }} as {{ status_after }}"` matching design.md.
- **D9 cell-shape validation rules** — Task 11 mirrors design wording (built-in kind rejects `link:`; custom accepts `{ message, link }`; `status_title` is string-or-null; no coverage requirement; resolver drops `status_map_app_slugs`).
- **D8 action_display vs event_overrides naming** — Task 6 documents the disambiguation; Task 15 covers the README.
- **D13 render-tree walker** — Task 1 mirrors the recursive-walk snippet.
- **Demo-config cleanup + `access.demo` migration** — Task 10 includes both the `link:` strip and the array-of-verbs migration; Task 11 dependency ordering preserved.
- **`workflow-overview.yaml` / `actions-on-entity.yaml`** — neither is in the Modified list (correctly; only `group-overview.yaml` needs a page-side edit, per review-2 #1).
- **Cross-design references** — Part 28 and Part 32 references in design.md / tasks unchanged; consistency-3 already covered.
- **No client-name leakage** in any task or in design.md.
