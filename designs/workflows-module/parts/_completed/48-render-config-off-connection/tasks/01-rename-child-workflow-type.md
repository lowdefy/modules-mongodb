# Task 1: Rename `tracker.workflow_type` → `tracker.child_workflow_type` + build validation

## Context

A `kind: tracker` action declares which child workflow type it tracks via `tracker.workflow_type` (e.g. the demo's `track-company-setup.yaml` declares `tracker: { workflow_type: company-setup }`). This field is live: `planActionTransition.js` denormalizes it onto the persisted tracker doc, `StartWorkflow.js:143` reads it back to gate a child start (`parent.tracker?.workflow_type !== params.workflow_type`), and `types.js` documents the shape.

The name collides in meaning: a tracker action doc carries a **top-level** `workflow_type` (its own workflow, set at `planActionTransition.js:182`) **and** `tracker.workflow_type` (the tracked child's type). Part 48 renames the nested field to `child_workflow_type`, joining the existing tracked-child vocabulary on the doc (`child_workflow_id`, `child_entity_id`, `child_entity_collection`).

This field is also the **build-time trace edge** for Part 48's ancestor closure (task 8 walks `parent_type → child_workflow_type` edges to bundle ancestor render config onto per-workflow endpoints). Today `makeWorkflowsConfig.js` picks the whole `tracker` block via `ACTION_FIELDS` but `validateTrackerStartLink` (`:229–289`) validates only `start_link` — `workflow_type` is never validated. An unresolved edge would make the task-8 closure silently drop an ancestor, so validation must land with the rename.

The module is pre-release with no production consumers outside this repo — the rename is mechanical, no migration. Persisted-doc note: `planActionTransition` rewrites `doc.tracker` on every plan, so existing docs self-heal on their next transition.

## Task

**1. Rename across the codebase** — every read, write, declaration, and fixture of the nested `tracker.workflow_type` becomes `tracker.child_workflow_type`:

- **Demo config:** `apps/demo/modules/workflows/workflow_config/onboarding/track-company-setup.yaml` — `tracker.workflow_type: company-setup` → `child_workflow_type: company-setup`.
- **Engine write:** `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` (~`:181–191`) — the `doc.tracker` denormalization becomes `{ child_workflow_type: actionConfig.tracker.child_workflow_type, ...(start_link…) }`. The top-level `doc.workflow_type = loadedWorkflow.workflow_type` is unrelated and stays.
- **Engine read:** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js:143` — the child-start gate reads `parent.tracker?.child_workflow_type`.
- **Type contract:** `plugins/modules-mongodb-plugins/src/connections/shared/types.js:59` — tracker shape becomes `{ child_workflow_type: string, start_link?: { pageId, urlQuery? } } | null`.
- **Test fixtures:** every test that sets `tracker: { workflow_type: … }` — at minimum `StartWorkflow.test.js` (`:76`, `:433`), `CloseWorkflow.test.js`, `CancelWorkflow.test.js`, `computeEngineLinks.test.js`, `runTrackerCascade.test.js`, `planActionTransition.test.js`, `planTrackerLevel.test.js`. Grep for `tracker:` and `workflow_type` in test files rather than trusting this list.
- **Templates/pages audit:** `makeActionPages.js` lifts the raw `tracker` block onto each action page's template var — grep `modules/workflows/templates/` and `modules/workflows/pages/` (and demo YAML) for any `tracker.workflow_type` reference and rename it.

**2. Add build-time validation in `modules/workflows/resolvers/makeWorkflowsConfig.js`:**

- Every `kind: tracker` action must declare a non-empty string `tracker.child_workflow_type` that resolves to a declared workflow type in `vars.workflows`. Hard-error otherwise (use the existing `fail(workflow.type, message)` helper and message style).
- **Legacy-key guard:** a `tracker.workflow_type` key hard-errors with a rename hint — match the builder's existing legacy-shape errors (e.g. the `hooks.{signal}.{phase}` string-form error at `:87–91`, the `on_complete` string form at `:124–128`). Example: `tracker.workflow_type is renamed — use tracker.child_workflow_type (Part 48 D6).`
- **Acyclicity check:** collect all `parent_type → child_workflow_type` edges across the workflow set, walk them once, and hard-error on any cycle, **naming the cycle path** (e.g. `tracker cycle: a → b → a`). This turns D2's "cycles disallowed" into an enforced invariant so the task-8 ancestor closure needs no runtime guard. Note edge resolution and cycle detection are cross-workflow checks — they run after the per-workflow loop, against the full edge set.

**3. Extract the edge collection into a small shared helper** (e.g. `modules/workflows/resolvers/trackerEdges.js`) exporting `collectTrackerEdges(workflows)` → `[{ parentType, childType }]` (or an equivalent map). `makeWorkflowsConfig` uses it for the acyclicity check now; task 8's `makeWorkflowApis` ancestor closure reuses it.

## Acceptance Criteria

- `grep -rn "tracker.workflow_type\|tracker?.workflow_type" modules/ plugins/ apps/` returns no live-code hits (the nested field; top-level `workflow_type` untouched).
- `makeWorkflowsConfig` hard-errors on: a tracker action with missing/empty/non-string `child_workflow_type`; a `child_workflow_type` not matching any declared workflow type; a legacy `tracker.workflow_type` key (with rename hint); a tracker cycle (error names the path). New unit tests in `makeWorkflowsConfig.test.js` cover all four.
- `StartWorkflow` child-start gating still works against the renamed field — `StartWorkflow.test.js` mismatch tests pass with renamed fixtures.
- `pnpm test` passes in both `plugins/modules-mongodb-plugins` and `modules/workflows`.

## Files

- `apps/demo/modules/workflows/workflow_config/onboarding/track-company-setup.yaml` — modify — rename key.
- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — tracker `child_workflow_type` validation, legacy-key guard, acyclicity check.
- `modules/workflows/resolvers/trackerEdges.js` — create — shared edge collection helper.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — new validation tests.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` — modify — denormalization rename.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` — modify — gate read rename.
- `plugins/modules-mongodb-plugins/src/connections/shared/types.js` — modify — tracker typedef.
- Test files listed above — modify — fixture renames.

## Notes

- Do **not** add `child_workflow_type` tracing/closure logic to `makeWorkflowApis` here — that is task 8. This task only renames, validates, and enforces acyclicity.
- The legacy-key guard means a stale demo/app config fails loudly at build instead of silently dropping the trace edge.
