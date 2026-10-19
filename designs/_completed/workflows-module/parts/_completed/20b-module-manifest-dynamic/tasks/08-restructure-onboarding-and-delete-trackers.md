# Task 8: Restructure `onboarding.yaml`, delete tracker steps, author `g1` on_complete routine

## Context

After tasks 3–7, five new action files exist under `apps/demo/modules/workflows/workflow_config/onboarding/` (`qualify.yaml`, `send-quote.yaml`, `schedule-followup.yaml`, `proof-of-installation.yaml`, `track-installation.yaml`) but `onboarding.yaml`'s `actions[]` array still references the three old tracker-step files (`track-step-1.yaml`, `track-step-2.yaml`, `track-step-3.yaml`). The trackers are still live in the demo until this task runs.

This is the wiring step that:

- Swaps the action list in `onboarding.yaml`.
- Restructures `action_groups`, `starting_actions`, and the `blocked_by` chain around the new five-action shape.
- Adds the `g1.on_complete` callback that demonstrates the group-fan-out path (dormant until [part 11](modules-mongodb/designs/workflows-module/parts/11-group-on-complete-fanout/design.md) ships).
- Deletes the three tracker-step files now that nothing references them.

## Task

1. **Restructure `apps/demo/modules/workflows/workflow_config/onboarding/onboarding.yaml`:**

   - **`starting_actions:`** replace `[{ type: track-step-1, status: action-required }]` with `[{ type: qualify, status: action-required }]`.
   - **`action_groups:`** keep three groups (`g1`, `g2`, `g3`) but adjust:
     - `g1` — title `Qualify`, icon as appropriate (e.g. `AiOutlineUserAdd`). Add `on_complete.routine: { _ref: modules/workflows/workflow_config/onboarding/hooks/g1-on-complete.yaml }` (see step 3 below). App `_ref` paths are relative to `apps/demo/lowdefy.yaml` (the app root), matching the existing convention used by the `actions:` list.
     - `g2` — title `Quote`, icon e.g. `GrDocumentText`. `blocked_by: [g1]`.
     - `g3` — title `Installation`, icon e.g. `AiOutlineTool`. `blocked_by: [g2]`.
   - **`actions:`** replace the three tracker `_ref`s with five entries:
     ```yaml
     actions:
       - _ref: modules/workflows/workflow_config/onboarding/qualify.yaml
       - _ref: modules/workflows/workflow_config/onboarding/send-quote.yaml
       - _ref: modules/workflows/workflow_config/onboarding/schedule-followup.yaml
       - _ref: modules/workflows/workflow_config/onboarding/proof-of-installation.yaml
       - _ref: modules/workflows/workflow_config/onboarding/track-installation.yaml
     ```
   - Keep `type: onboarding`, `title: Onboarding`, `entity_collection: leads-collection`, `display_order: 1` unchanged.

2. **Delete the three tracker-step files:**

   - `apps/demo/modules/workflows/workflow_config/onboarding/track-step-1.yaml`
   - `apps/demo/modules/workflows/workflow_config/onboarding/track-step-2.yaml`
   - `apps/demo/modules/workflows/workflow_config/onboarding/track-step-3.yaml`

3. **Create `apps/demo/modules/workflows/workflow_config/onboarding/hooks/g1-on-complete.yaml`** — the `on_complete` routine for group `g1`. Authored as a demo-visible step (e.g. a log entry) so the callback fires observably once part 11 lands. Minimal shape:

   ```yaml
   - id: log_g1_complete
     type: Set
     params:
       message: Onboarding group g1 (Qualify) complete.
   - :return:
       message:
         _step: log_g1_complete.message
   ```

   `makeWorkflowApis` emits this as `workflow-onboarding-group-g1-on-complete` Api per [makeWorkflowApis.js:108–122](makeWorkflowApis.js).

## Acceptance Criteria

- `onboarding.yaml`'s `starting_actions[0].type` is `qualify`.
- `onboarding.yaml`'s `actions[]` has exactly five entries, one `_ref` per new action file from tasks 3–7.
- The three `track-step-*.yaml` files no longer exist.
- `modules/workflows/workflow_config/onboarding/hooks/g1-on-complete.yaml` exists and is referenced via `_ref` from `action_groups[g1].on_complete.routine` (path from app root, per the existing `_ref` convention in this file).
- `apps/demo` builds without errors.
- `makeActionPages` emits the expected page ids: `onboarding-qualify-edit`, `onboarding-qualify-view`, `onboarding-send-quote-edit`, `onboarding-send-quote-view`, `onboarding-send-quote-review`, `onboarding-proof-of-installation-edit`, `onboarding-proof-of-installation-view`. (`schedule-followup` and `track-installation` emit none.)
- `makeWorkflowApis` emits the expected endpoints: `update-action-qualify`, `update-action-send-quote`, `update-action-schedule-followup`, `update-action-proof-of-installation`, plus `workflow-onboarding-group-g1-on-complete`. (`track-installation` emits none — tracker.)
- Hook APIs emit per the resolver: `update-action-qualify-submit_edit-pre`, `update-action-send-quote-submit_edit-pre`, `update-action-send-quote-approve-post`.

## Files

- `apps/demo/modules/workflows/workflow_config/onboarding/onboarding.yaml` — modify — `starting_actions`, `action_groups`, `actions[]`.
- `apps/demo/modules/workflows/workflow_config/onboarding/hooks/g1-on-complete.yaml` — create.
- `apps/demo/modules/workflows/workflow_config/onboarding/track-step-1.yaml` — delete.
- `apps/demo/modules/workflows/workflow_config/onboarding/track-step-2.yaml` — delete.
- `apps/demo/modules/workflows/workflow_config/onboarding/track-step-3.yaml` — delete.

## Notes

- This task is the atomic flip — once it lands the demo's `onboarding` workflow exercises the full four-kind worked example. Before this task, the action files exist but aren't reachable; after, the resolvers emit the per-action pages + endpoints.
- The `g1.on_complete` callback only fires once [part 11](modules-mongodb/designs/workflows-module/parts/11-group-on-complete-fanout/design.md) ships. Until then the Api is emitted but never invoked.
- Group titles / icons are demo polish — pick reasonable defaults from the icon set already in use in the demo (`apps/demo/modules/workflows/workflow_config/onboarding/` group icons from 20a: `GrDocumentText`, `AiOutlineBank`, `AiOutlineUserAdd`).
- The `installation` child workflow is unchanged. `track-installation`'s `tracker.workflow_type: installation` reaches it by type name.
