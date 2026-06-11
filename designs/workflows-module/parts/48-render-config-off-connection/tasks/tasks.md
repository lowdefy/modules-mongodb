# Implementation Tasks — Part 48: Render config off the connection

## Overview

These tasks move `status_map` off the connection blob onto per-workflow write endpoints (`{type}-submit/start/cancel/close`), open override channels for tracker-mirror and lifecycle events, and rename the trace edge `tracker.workflow_type` → `tracker.child_workflow_type`. Source: `designs/workflows-module/parts/48-render-config-off-connection/design.md`.

## Tasks

| #   | File                                            | Summary                                                                                              | Depends On |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-rename-child-workflow-type.md`              | Rename `tracker.workflow_type` → `child_workflow_type` repo-wide + build validation + acyclicity     | —          |
| 2   | `02-generalize-event-override-gate.md`          | `planEventDispatch`: replace the `if (isSubmit)` merge gate with override-presence gating            | —          |
| 3   | `03-merge-render-config-at-load.md`             | `loadWorkflowState`: splice `params.render_config` onto every action config (the merge-at-load seam) | —          |
| 4   | `04-plansubmit-overrides-via-seam.md`           | `planSubmit`: read `event_overrides` off `actionConfig` instead of `params`                          | 3          |
| 5   | `05-tracker-mirror-override-channel.md`         | `planTrackerLevel`: thread the parent tracker's mirror override into `planEventDispatch`             | 2, 3       |
| 6   | `06-lifecycle-override-passthrough.md`          | Start/Cancel/Close handlers pass `params.lifecycle_event_override` into `planEventDispatch`          | 2          |
| 7   | `07-builder-event-map-validation.md`            | `makeWorkflowsConfig`: validate workflow-level `event` map + mirror signals on tracker `event:`      | —          |
| 8   | `08-per-workflow-submit-endpoint.md`            | `makeWorkflowApis`: collapse submit to `{type}-submit` with `render_config` + re-keyed `hooks`; `handleSubmit` re-slice | 1, 3, 4, 7 |
| 9   | `09-per-workflow-lifecycle-endpoints.md`        | `makeWorkflowApis`: emit `{type}-start/cancel/close`, retire the generic Part 19 endpoints           | 1, 6, 7, 8 |
| 10  | `10-drop-status-map-from-blob.md`               | `makeWorkflowsConfig`: drop `status_map` from `ACTION_FIELDS` (the de-bloat payoff)                  | 3, 8, 9    |
| 11  | `11-repoint-client-call-sites.md`               | Re-point templates, legacy pages, and demo start callers to the new endpoint ids                     | 8, 9       |

## Ordering Rationale

**Engine first, build second, payoff last.** Tasks 2–6 are pure engine changes in `plugins/modules-mongodb-plugins` that are individually backward-compatible at the unit level: the generalized merge gate falls through to engine defaults when no override is present (2), the merge-at-load seam no-ops when `params.render_config` is absent (3), and the lifecycle pass-through forwards `undefined` until endpoints carry the property (6). Task 1 (the rename) is foundational for the build-side trace (task 8 walks `child_workflow_type` edges) and is independent of tasks 2–6.

**Two cross-boundary couplings dictate strict ordering inside the build phase:**

- Task 4 (planSubmit reads overrides off the seam) must land **before** task 8 (the endpoint stops emitting flat `params.event_overrides` and starts emitting `render_config`) — otherwise the new endpoint shape would be emitted while the engine still reads the old `params` path. Between tasks 4 and 8 there is a transient window where the demo app's YAML event overrides don't apply at runtime (the per-action endpoint still emits `params.event_overrides`, which nothing reads); unit tests stay green throughout, and the window closes when task 8 lands. The same applies to the `hooks` re-key: the emit (re-keyed by action type) and the consume (`handleSubmit` re-slice) are paired **inside task 8** so hooks are never broken at any task boundary.
- Task 10 (dropping `status_map` from the blob) must land **after** tasks 3, 8, and 9 — only once every write endpoint delivers `render_config` and the engine merges it at load can the blob stop carrying `status_map` without breaking rendering.

Tasks 2, 3, and 7 have no mutual dependencies and could be done in parallel; so could 4, 5, and 6 once their prerequisites land. Task 11 (call-site re-points) only needs the new endpoint ids to exist (8, 9).

**Why this decomposition:** each engine seam change (gate, load-merge, planSubmit read, mirror threading, lifecycle pass-through) is a small, independently unit-testable change to one file; the two `makeWorkflowApis` tasks split along the submit vs lifecycle endpoint families because submit carries `hooks` (with its paired engine re-slice) while start/cancel/close carry `lifecycle_event_override` and retire the Part 19 generics (manifest + file deletions); the de-bloat (10) is isolated so the payoff step is a trivially reviewable diff with everything it depends on already verified.

## Scope

**Source:** `designs/workflows-module/parts/48-render-config-off-connection/design.md`
**Context files considered:** none — the design folder contains only `design.md` (code grounding came from the live codebase: `makeWorkflowApis.js`, `makeWorkflowsConfig.js`, `loadWorkflowState.js`, `planEventDispatch.js`, `planTrackerLevel.js`, `planSubmit.js`, `handleSubmit.js`, `StartWorkflow.js`, `CancelWorkflow.js`, `CloseWorkflow.js`, `runTrackerCascade.js`, `mergeEventOverrides.js`, the generic api YAMLs, `module.lowdefy.yaml`, and the demo workflow config).
**Review files skipped:** `review/` folder.

**Design note (flagged, resolved in task 6/9):** the design's D8 YAML examples nest the lifecycle override as `signal → app → { display }`, but D8 also says the map is "the per-action `action.event` shape, one scope up", and the normative mechanism (pass `params.lifecycle_event_override` directly as `yamlEventOverrides` into the existing `mergeEventOverrides`) requires the per-action shape `signal → { display: { app: { … } } }`. The tasks adopt the per-action shape — the only one that works without a transform layer the design never specifies.
