---
"@lowdefy/modules-mongodb-plugins": patch
---

Fix: render action display messages on workflow-start seeded drafts.

Since Part 48, `status_map` (which holds each action's `<app_name>.message`) was dropped from the build blob and now arrives per-request on the write endpoint's `render_config`, spliced back onto action configs at `loadWorkflowState`. `StartWorkflow` has no load phase — it reads configs straight from `workflowsConfig` and seeds drafts via `planActionTransition` — so it never applied the splice. Seeded actions were written with no `<app_name>.message`, leaving the "actions on entity" and timeline surfaces blank until the first submit ran the action through `loadWorkflowState`.

The splice is now extracted to `shared/phases/applyRenderConfig.js` and applied by both `loadWorkflowState` and `StartWorkflow` (one helper, identical merge at every site).
