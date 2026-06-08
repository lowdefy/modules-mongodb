# Consistency Review 1

## Summary

Checked design.md, both reviews, and all five task files (plus tasks.md) against the review decision register and the working tree. Found 6 inconsistencies — all auto-resolved; none required user input. The substantive findings were two pieces of review-2 fallout that never reached the task files (task 4's stale "deviation" framing, task 5's pre-review-2 sentinel rule); the rest were stale line refs and a landed deletion.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md` (5 findings, all resolved), `review/review-2.md` (3 findings, all resolved)
- **Tasks:** `tasks/tasks.md`, `tasks/01-start-link-config-validation.md`, `tasks/02-compute-engine-links-start-arm.md`, `tasks/03-planner-tracker-refresh.md`, `tasks/04-resolve-action-link-tracker-test.md`, `tasks/05-docs-start-link.md`
- **Supporting / plans:** none exist
- **Working-tree verification:** `computeEngineLinks.js`, `planActionTransition.js`, `types.js`, `makeWorkflowsConfig.js`, `resolve_action_link.yaml`, `visible_verbs_filter.yaml`/`.test.js`, `substituteActionIdSentinel.js`, the three read APIs, and the absence of `createAction.js` / `resolve_action_link.test.js`

## Inconsistencies Found

### 1. Task 4 still framed creating the read-side test file as a deviation from the design

**Type:** Design-vs-Task
**Source of truth:** review-2 finding #2 resolution ("the design now says Part 44 **creates** `resolve_action_link.test.js`"), reflected in design.md's read-side paragraph and Files-changed table
**Files affected:** `tasks/04-resolve-action-link-tracker-test.md`
**Resolution:** Removed the "Deviation from the design's assumption, flagged" note (it quoted design wording — "adds a tracker-row case to its tests" — that no longer exists) and reworded the Context paragraph to state the contribution as the design now does: creating `modules/shared/workflow/resolve_action_link.test.js` with the tracker-row cases. Kept the scope guard (no exhaustive verb-priority matrices).

### 2. Task 5's spec.md instruction transcribed the pre-review-2 `urlQuery` validation rule

**Type:** Design-vs-Task
**Source of truth:** review-2 finding #1 resolution (reserved keys `action_id`/`entity_id` are sentinel-only — value must be exactly `true`; statics live on other keys), reflected in design.md proposed change 5 and task 1 rule 4
**Files affected:** `tasks/05-docs-start-link.md` (Task item 3, spec.md validation-rules bullet)
**Resolution:** Replaced "`urlQuery` values are strings or `true` on exactly `action_id`/`entity_id`" (which reads as permitting a static string on a reserved key — exactly the gap review-2 #1 closed) with the sentinel-only formulation. Review-2's resolution note updated design change 5 and task 1 but missed this transcription.

### 3. Design D1 said "both insert paths" — `createAction.js` is deleted

**Type:** Stale Status/Blocker
**Source of truth:** working tree (`createAction.js` absent; Part 38 task 15 landed)
**Files affected:** `design.md` (D1)
**Resolution:** Rewrote to "the insert path narrows … (`planActionTransition.js:156-159`; the legacy `createAction.js` path is gone — deleted by Part 38 task 15)". The old text cited `createAction.js:49-52` as a live second path.

### 4. Task 1 line refs drifted

**Type:** Stale Reference
**Source of truth:** working tree (`validateAction` at `makeWorkflowsConfig.js:274`, `ACTION_FIELDS` at line 7)
**Files affected:** `tasks/01-start-link-config-validation.md`
**Resolution:** Updated "line 269" → 274 and "line 11" → 7. (Review-2 #3 swept design.md only; task-specific refs weren't covered.)

### 5. Task 3 denorm-block line refs off by one

**Type:** Stale Reference
**Source of truth:** working tree (denormalisation comment at `planActionTransition.js:178-181`, assignments at 182-183)
**Files affected:** `tasks/03-planner-tracker-refresh.md`
**Resolution:** "lines 179–183" → 178–183 (Context), "lines 179–181" → 178–181 (comment-extension instruction).

### 6. tasks.md provenance note counted one review file

**Type:** Stale Reference
**Source of truth:** `review/` folder contents (review-1 and review-2)
**Files affected:** `tasks/tasks.md` (Scope section)
**Resolution:** Updated to "(2 files)" with a note that review-2's actioning subsequently updated task 1's sentinel rule directly.

## No Issues

- **Review-1 resolutions fully propagated:** D1 planner-refresh rewrite (design D1 + task 3 agree, including the "not a config-versioning mechanism" caveat); demo edit dropped (Files-changed table and tasks.md "No demo-app task" agree, both pointing at Part 45's `track-company-setup`); change 4/5 string-statics agreement; cancelled-parent paragraph present in Known limitations.
- **Review-2 #1 in design + tasks 1–2:** design change 5, task 1 rule 4 and its rejection test cases (`action_id: 'some-id'`, `entity_id: 'foo'`), and task 2's trust-validated-config note are mutually consistent.
- **Review-2 #3 line-ref sweep:** all eight corrected anchors in design.md re-verified against the working tree (`computeEngineLinks.js:68-79`, `planActionTransition.js:156-159`/`182`/`196-199`, `StartWorkflow.js:137-142`/`119-149`, `fsm/tables.js:130-131`, `makeWorkflowsConfig.js:258-263` region) — still accurate. Task 2's refs (tracker branch 68–79, header lines 21–22) also verified.
- **Read-side facts:** all three read APIs `_ref` `../shared/workflow/resolve_action_link.yaml` (lines 33/38/52 as cited); `visible_verbs_filter.yaml:16` refs `visible_verbs.yaml`; `visible_verbs_filter.test.js` exists as task 4's pattern source; `resolve_action_link.test.js` does not exist (task 4 correctly creates it); `substituteActionIdSentinel.js` exists (tasks correctly steer away from it).
- **Internal design consistency:** proposed changes 1–6, D1–D7, authoring example, worked example, Known limitations, and Non-goals all agree (sentinel spelling, `edit`-verb gating, stage gating, verbatim `pageId`).
- **Task-vs-task:** no two tasks touch the same file incompatibly; dependency table matches each task's stated dependencies; `types.js:59` ref in task 3 verified.
