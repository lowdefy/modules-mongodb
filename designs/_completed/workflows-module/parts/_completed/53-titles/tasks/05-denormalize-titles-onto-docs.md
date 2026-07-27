# Task 5: Denormalize titles onto the action and workflow docs

## Context

Task 2 materialized `title` onto the runtime `workflowsConfig` (on the workflow, each action, each group). Display surfaces read that live from config. But the **event planner** (task 6) renders event messages from the planned **doc**, not from config — so the resolved title must also ride the persisted action and workflow docs. This is the same denormalization stance the module already takes for `type`/`kind`/`workflow_type`.

Both plan sites already have the resolved config in scope:

- **`plugins/.../shared/phases/planners/planActionTransition.js`** — builds the planned action `doc`. There are two branches: the **insert** branch (lines 141–164, first creation) and the **update** branch (lines 165–173, which spreads `...action`). Below them is an **unconditional denormalization block** (lines 182–192) that already stamps `doc.access`, `doc.workflow_type`, and `doc.tracker` on every plan. `actionConfig` is in scope and carries `.title` after task 2.
- **`plugins/.../WorkflowAPI/StartWorkflow/StartWorkflow.js`** — `workflowConfig` (with `.title`) is resolved at line 70; `baseWorkflowDoc` is built at lines 169+ and carries `workflow_type` but no `title`.

A submit on an existing action takes the update branch, and that updated doc is what `planSubmit` hands to `planEventDispatch`. Stamping in the **unconditional** block (not the insert branch) is what guarantees `{{ action.title }}` is present on every transition — insert and update, new and pre-existing actions.

## Task

1. **Action title → action doc** (`planActionTransition.js`). In the unconditional denormalization block (alongside `doc.workflow_type = loadedWorkflow.workflow_type;`, ~line 183), add:

   ```js
   doc.title = actionConfig.title;
   ```

   Place it in the unconditional block, **not** the insert branch — so it covers update transitions on pre-existing actions too.

2. **Workflow title → workflow doc** (`StartWorkflow.js`). In `baseWorkflowDoc` (lines 169+), add `title` from the already-in-scope `workflowConfig`:

   ```js
   const baseWorkflowDoc = {
     ...params.references,
     _id: newId(),
     workflow_type: params.workflow_type,
     title: workflowConfig.title,
     // ... existing fields
   };
   ```

   The lifecycle render context binds `workflow = plannedWorkflowDoc` (planEventDispatch.js:105), so StartWorkflow's event gets the title directly. Cancel/Close load the existing workflow doc, so they inherit the persisted `title` for free — no config re-read.

## Acceptance Criteria

- Every planned action doc produced by `planActionTransition` carries `doc.title` equal to `actionConfig.title`, on **both** the insert and update paths.
- `baseWorkflowDoc` in `StartWorkflow` carries `title: workflowConfig.title`.
- Existing `planActionTransition.test.js` / `StartWorkflow.test.js` are extended to assert the stamped `title` on the planned docs (insert and update transitions for the action; the base doc for the workflow). Tests pass.
- No read-time fallback is introduced anywhere — the title is stamped from config, not re-derived.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` — modify — add `doc.title = actionConfig.title;` to the unconditional denormalization block.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` — modify — add `title: workflowConfig.title` to `baseWorkflowDoc`.
- `plugins/.../planners/planActionTransition.test.js` — modify — assert stamped action title (insert + update).
- `plugins/.../WorkflowAPI/StartWorkflow/StartWorkflow.test.js` — modify — assert workflow base-doc title.

## Notes

- **Migration is a non-issue** (per the design): the doc `title` is written and read in the same plan — `planActionTransition` stamps it and hands the same planned doc to `planEventDispatch`, the only reader. Pre-existing action docs that lack `title` need no backfill: display surfaces source it from config, the next transition stamps it, and historical events keep their already-rendered `display` strings. No re-sync job.
- Depends on task 2: `actionConfig.title` / `workflowConfig.title` only exist once the config materializes them.
