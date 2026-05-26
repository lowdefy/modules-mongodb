# Task 7: Author `track-installation` tracker action

## Context

`track-installation` is the tracker action in the new `onboarding` worked example — `kind: tracker`, in group `g3` alongside `proof-of-installation`. It subscribes to the existing `installation` child workflow (already on disk at `apps/demo/modules/workflows/workflow_config/installation/installation.yaml`, unchanged) and fans the child's lifecycle up to the parent action via the tracker subscription path ([part 10](modules-mongodb/designs/workflows-module/parts/_completed/10-tracker-subscription/design.md)).

Tracker actions emit nothing from `makeWorkflowApis` (skipped per [makeWorkflowApis.js:128](makeWorkflowApis.js): `if (action.kind === 'tracker') continue;`) and nothing from `makeActionPages` (only `form` kind emits — [makeActionPages.js:41](modules-mongodb/modules/workflows/resolvers/makeActionPages.js)). The tracker action exists purely as a row in `actions-on-entity` that reflects the child workflow's current status.

Its `link:` targets the child workflow's `workflow-overview` page. Since `installation` ships with a single `install-step` action, the workflow-overview is the de-facto install-step view — users click through and reach `task-edit` from the action card. The link uses `urlQuery.workflow_id: $child_workflow_id` to point at the child workflow (engine-written at `start-workflow` time per [action-authoring spec line 455](modules-mongodb/designs/workflows-module-concept/action-authoring/spec.md)). This depends on engine-side runtime-field projection that's still landing on a sibling branch — until that lands, the link is authored but doesn't resolve at runtime.

## Task

Create `apps/demo/modules/workflows/workflow_config/onboarding/track-installation.yaml`:

- `type: track-installation`
- `kind: tracker`
- `action_group: g3`
- `sort_order: 20` (sorts after `proof-of-installation` in group `g3`).
- `blocked_by: [send-quote]` (the child `installation` workflow gets started only after the quote stage completes).
- `description: Tracks the installation child workflow.`
- `access.demo: [view]` (no edit page — tracker is display-only).
- `access.roles: [admin]`.
- `tracker.workflow_type: installation` (references the existing child workflow already on disk).
- `status_map` for `blocked`, `in-progress`, `done`, `not-required`:
  - `blocked.demo.message:` Awaiting quote approval. (no `link:`).
  - `in-progress.demo.link.pageId: { _module.pageId: { id: workflow-overview, module: workflows } }`, `urlQuery: { workflow_id: $child_workflow_id }`. (The `$child_workflow_id` reference resolves to the field on the tracker action doc — engine-side runtime-field projection required.)
  - `done.demo.link` — same `workflow-overview` target so users can still click through to the completed child workflow.
  - `not-required.demo.message:` Installation skipped. (no `link:`).

See [action-authoring spec § Tracker action lines 423–440](modules-mongodb/designs/workflows-module-concept/action-authoring/spec.md) for the canonical tracker shape.

## Acceptance Criteria

- File exists and is valid YAML.
- `kind: tracker` declared; no `key:`, no `form:`, no `hooks:`, no `interactions:` (engine doesn't write to tracker actions directly).
- `tracker.workflow_type: installation` set.
- `status_map` covers `blocked`, `in-progress`, `done`, `not-required` at minimum.
- `apps/demo` builds without errors.
- The build does *not* emit `onboarding-track-installation-edit` / `-view` / etc. pages, nor an `update-action-track-installation` endpoint (resolvers skip tracker actions).

## Files

- `apps/demo/modules/workflows/workflow_config/onboarding/track-installation.yaml` — create.

## Notes

- The `installation` child workflow at `apps/demo/modules/workflows/workflow_config/installation/installation.yaml` is unchanged by this task. The tracker just references it by `workflow_type`.
- The `$child_workflow_id` `urlQuery` value is a forward-looking author convention — the engine-side projection that resolves it onto each tracker action's doc is in flight on a sibling branch. The author writes the convention; the runtime light-up depends on that work landing.
- Once the engine-side projection ships, clicking the tracker row navigates to `workflows/workflow-overview?workflow_id=<child-id>`, where the user sees the `install-step` action card and can click into `task-edit` to drive the child's lifecycle.
