# Consistency Review 2

## Summary

Re-scanned part 13's tree after the task files landed. Cross-checked the four new task files against the current design, against each other, and against the shipped state of `modules/workflows/module.lowdefy.yaml`. Found two stale references in task 3 (both auto-resolved); the rest of the tree is consistent.

## Files Reviewed

- **Design:** [design.md](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md)
- **Reviews:** [review-1.md](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/review/review-1.md) (all 13 findings annotated), [consistency-1.md](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/review/consistency-1.md) (prior consistency pass — 1 in-tree fix + 3 cross-part drifts surfaced)
- **Tasks:** [tasks/tasks.md](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/tasks/tasks.md), [tasks/01-inline-hook-schema.md](01-inline-hook-schema.md), [tasks/02-make-workflow-apis.md](02-make-workflow-apis.md), [tasks/03-manifest-wiring.md](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/tasks/03-manifest-wiring.md)
- **External cross-checks:** [modules/workflows/module.lowdefy.yaml](modules-mongodb/modules/workflows/module.lowdefy.yaml), [part 12 tasks/tasks.md](modules-mongodb/designs/workflows-module/parts/_completed/12-resolver-pages/tasks/tasks.md), [part 2 design.md](modules-mongodb/designs/workflows-module/parts/02-dynamic-module-pages/design.md)

## Inconsistencies Found

### 1. Task 3 attributed the `workflows_config` manifest var to part 12's task 3

**Type:** Stale Reference
**Source of truth:** shipped state of [modules/workflows/module.lowdefy.yaml:23–32](modules-mongodb/modules/workflows/module.lowdefy.yaml) — `workflows_config` is already declared in the manifest today (landed during the part-4 / part-15 consolidation).
**Files affected:** [tasks/03-manifest-wiring.md:15](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/tasks/03-manifest-wiring.md)
**Resolution:** Rewrote the context paragraph: `workflows_config` is already in the manifest; what part 12's task 3 will add is `app_name` and the `makeActionPages.js` registration. Also rewrote the related notes lower in the file (the "Do not redeclare" bullet and the "No `app_name` var here" note) so they match the corrected state.

### 2. Task 3's suggested-edit template baked in assumptions about part 12's task 3 having shipped first

**Type:** Stale Reference / fragile sequencing assumption
**Source of truth:** [part 12 tasks/tasks.md](modules-mongodb/designs/workflows-module/parts/_completed/12-resolver-pages/tasks/tasks.md) — part 12's task 3 is `⏸ blocked on part 2`, the same upstream that blocks this task. Either could ship first.
**Files affected:** [tasks/03-manifest-wiring.md:46–94](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/tasks/03-manifest-wiring.md) (template manifest), version-bump bullet (line 42)
**Resolution:** Replaced the version-bump line `version: 0.8.0 # bump minor for the api exports` with `<bump minor from current>` and a note that the current version depends on whether part 12's task 3 shipped first. Trimmed the template to show only the additions this task makes — `pages:` exports and the `app_name` var are now annotated as "added by part 12's task 3" or "leave as-is if already present." Stops the template from instructing the agent to redeclare things that are already there.

## Cross-part drift (re-surfaced from consistency-1, still out of edit scope)

These were already noted in [consistency-1.md](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/review/consistency-1.md) and remain unchanged — included here only to confirm coverage:

- **A.** Part 9 design.md still says part 13 "validates" hook auth (pre-action-review wording). Folds in when part 9 enters its review cycle.
- **B.** Part 11 design.md still carries the resolved-but-not-closed `on_complete` auth open question. Folds in when part 11 enters its review cycle.
- **C.** Action-authoring spec still treats `hooks.{interaction}.{pre|post}` as a string Api id. Now scheduled to be fixed by **task 1** of part 13 (`01-inline-hook-schema.md`) — moved from "external precondition" to "in-scope task." No longer cross-part drift; it's part of the task list.

## No Issues

- **Tasks ↔ design verification mapping.** Design.md verification bullets (lines 60–67) are covered: task 1 owns the legacy-string-fails test (design.md:65), task 2 owns the worked-example / sparse-maps / hook-emission / `on_complete`-emission tests (design.md:60–64). Task 2 has 11 test cases vs design.md's 6 verification bullets — the extras (deduplication, empty roles, four-tuple, no `force`, tracker-skip) are additive coverage, not drift.
- **Form vs task scoping consistent.** Task 2's `isTask = action.kind === "task"` branch matches design.md:20 ("identical endpoint shapes ... handler routes task-specific behaviour via `current_status`; resolver does not branch on `kind`. Only `kind: tracker` is skipped"). The single conditional on `current_status` is the only branching, matching the design's "identical except for that one slot" claim.
- **Input contract consistent.** Design.md:13 says "reads the raw `vars.workflows_config` YAML"; task 2 says the resolver function receives `vars.workflows` (because the manifest maps `workflows: { _module.var: workflows_config }`). These describe the same thing at different levels — module-var name vs resolver-function input — matching the existing convention in part 12.
- **`vars.app_name` consistently absent.** Design.md:15 ("not an input to this resolver"), task 2 line 19 ("not an input"), task 3 (no `app_name` declaration). Three sites agree.
- **Sparse map convention consistent.** Design.md:21 ("sparse — only declared interactions/fields"), task 2 lines 78–86 (assertions `'hooks' in properties === false` when no hooks), skeleton's spread-only-if-present pattern. Three sites agree.
- **Endpoint shape consistent with submit-pipeline spec.** Task 2's emitted routine matches [submit-pipeline/spec.md:39–72](modules-mongodb/designs/workflows-module-concept/submit-pipeline/spec.md) — `_module.connectionId: workflow-api`, `SubmitWorkflowAction` step type, `:return:` block with the six handler-return fields.
- **Schema fold-in consistent across tasks.** Task 1 owns the action-authoring spec fold-in + `makeWorkflowsConfig` validator extension; task 2 explicitly says "Task 1 already taught `makeWorkflowsConfig` to validate ... This resolver assumes that validation has run." The dependency is explicit on both ends.
- **Task ordering rationale consistent with status flags.** `tasks.md`'s status column matches the body: tasks 1–2 are gated only by each other, task 3 is `⏸ blocked on part 2`. The rationale paragraphs say the same thing in prose.
