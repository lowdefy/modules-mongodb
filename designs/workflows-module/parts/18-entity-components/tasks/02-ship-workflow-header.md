# Task 2: Ship `components/workflow-header.yaml`

## Context

`workflow-header` is the per-workflow strip plus a slot for collapsible content. Two consumers in v1:

- `actions-on-entity` (task 3) — one header per workflow in the entity-page iteration; the `blocks:` slot receives one `ActionSteps` block.
- Part 17's `workflow-overview` page (already shipped at [modules/workflows/pages/workflow-overview.yaml:58](../../../../modules/workflows/pages/workflow-overview.yaml)) — one header at the top of the page; the `blocks:` slot receives the action card list. This existing call site currently passes only `workflow: { _state: overview.workflow }` — once this task ships, Part 17's call site needs updating to pass `is_overview_page: true` and the action-cards list in `blocks:` (that's a Part 17 follow-up, not part of this task).

The component is the same shape for both call sites — no per-caller modes. The collapse toggle hides whatever the caller passes in `blocks:`.

## Task

Create `modules/workflows/components/workflow-header.yaml` as a `_ref`-able component (block tree, not an action sequence).

**Vars contract** (these are the externally-stable inputs):

| Var | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `workflow` | object | yes | — | The workflow doc carrying `_id`, `workflow_type`, `status[0].stage`, `summary.{done, not_required, total}`, and `groups[]` with `{ id, status, summary }`. Source: an element of `get-entity-workflows.workflows[]` (entity-page) or the top-level `workflow` from `get-workflow-overview` (overview-page). |
| `blocks` | array | yes | — | Collapsible content. Single `ActionSteps` block from `actions-on-entity`; action card list from `workflow-overview`. |
| `collapsed_default` | boolean | no | `false` | Initial collapse state. `actions-on-entity` passes `true` for completed workflows. |
| `is_overview_page` | boolean | no | `false` | Suppresses the workflow-overview link button when the host page is itself `workflow-overview`. |

**What the component renders (the strip)**:

1. **Title** — `_global.workflows_config[workflow.workflow_type].title`. Use a `_get` chain off `_global: workflows_config` keyed by the workflow doc's `workflow_type`. The workflow doc carries `workflow_type` (per [StartWorkflow.js:77](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js)); titles live in build-time config.
2. **Workflow-overview link button** — Tooltip-wrapped icon button (`LuWorkflow` icon, matching v0's `apps/prp-team/pages/tickets/ticket-view/components/action_groups.yaml`). On click, `Link` to `workflow-overview?workflow_id=<workflow._id>` using `_module.pageId: workflow-overview` for the page id. Wrap the button (and its tooltip) in `visible: { _ne: [{ _var: is_overview_page }, true] }` so the page can suppress itself.
3. **Lifecycle stage badge** — render `_var: workflow.status.0.stage` with display attributes from `_global: workflow_lifecycle_stages` (a `_get` chain by stage key).
4. **Summary counts** — render `"{done + not_required} of {total} done"` from `workflow.summary.{done, not_required, total}`. Implementation: a small `_nunjucks` block or operator chain to compose the string.
5. **Current-phase milestone** — title of the lowest-ordered group whose `status !== done`. Implementation: iterate `workflow.groups[]` (already in declaration order), find the first whose `status !== done`, look up its title from `_global.workflows_config[workflow.workflow_type].action_groups[]` by joining on `id`. If every group is `done`, fall back to the workflow title (same `_global.workflows_config[workflow.workflow_type].title` from step 1). The join is non-trivial; consider extracting it to a small `_js` block (kept simple) per CLAUDE.md's "Operators before `_js`" rule with the exception for complex chains.
6. **Collapse / expand toggle** — a button that toggles a `_state.workflow_header_collapsed_<workflow._id>` boolean (scoped by workflow id to avoid collisions when multiple headers render on one page). Initial state from `_var: collapsed_default`. The component primes state via a `SetState` on mount (the `onMount` of the outer `Box`); the toggle button flips it.
7. **Collapsible content** — wrap `_var: blocks` in a `Box` whose `visible` reads the collapsed state. When collapsed, the box hides; when expanded, the box shows `_var: blocks`.

**Layout** — use a `Box` outer container with the strip at the top and the collapsible block underneath. The strip itself can be a `Box` with `layout: { type: flex }` to lay out title + link button + badge + summary + milestone + toggle. Match Lowdefy's layout conventions (CLAUDE.md `lowdefy-layout.md` guide is the reference).

**`_global: workflows_config` join for group titles** — the component needs the static `action_groups[]` array for the workflow type. The cleanest path is to read `_global.workflows_config[workflow.workflow_type].action_groups` once at the top of the render and reuse it for both the milestone-label lookup and any future group-title rendering. The shipped `module.lowdefy.yaml` already exposes `workflows_config` as a module var (see [modules/workflows/module.lowdefy.yaml:43-48](../../../../modules/workflows/module.lowdefy.yaml)); ensure Part 4 also publishes it under `_global` (verify against Part 4 if the global isn't visible at render time).

## Acceptance Criteria

- File exists at `modules/workflows/components/workflow-header.yaml`.
- `pnpm ldf:b` on `apps/demo` builds cleanly with no missing-`_ref` errors related to `workflow-header.yaml`.
- Smoke-render on `workflow-overview?workflow_id=<id>` (Part 17's shipped page) shows:
  - Workflow title resolved from `workflows_config`.
  - Workflow-overview link button visibility is controlled by `is_overview_page`. Verify the expression: passing `true` suppresses the button, passing `false` (or omitting → default `false`) renders it. Part 17's current call site doesn't pass `is_overview_page` yet, so the button will render until Part 17's follow-up amends the call site to pass `true` — that's tracked as a cross-design follow-up, not a task-2 blocker.
  - Lifecycle badge with correct stage color from `workflow_lifecycle_stages`.
  - Summary counts ("X of Y done").
  - Milestone label = lowest-ordered non-done group's title (or workflow title when all groups done).
  - Collapse toggle hides / shows the `blocks:` content.
- Per-workflow collapse state uses an id-scoped state key (e.g. `_state.workflow_header_collapsed_<workflow._id>`) so multiple headers on one page don't share state.

## Files

- `modules/workflows/components/workflow-header.yaml` — **create** — the component per the spec above.

## Notes

- **Block IDs are not module-scoped.** The collapse-toggle state key must be id-scoped at the workflow level (use `workflow._id`) since multiple `workflow-header` instances will render on the entity page in task 3. Per CLAUDE.md: "Block IDs and request IDs are NOT scoped."
- **Antd icon name** — `LuWorkflow` per v0. Confirm it resolves in the demo app's icon set; if not, fall back to a sensible Antd icon (e.g. `AiOutlinePartition`) and document.
- **Forward-compatible**: the design defers a `vars.entities[entity_collection].title` chrome label to v1.x. Don't render an entity-kind label in v1; just leave the slot for a future addition.
- **Title fallback** — if `_global.workflows_config[workflow.workflow_type]` is missing (shouldn't happen with valid config), render the raw `workflow_type` as the title rather than rendering nothing.
- **Part 17's call site** currently passes only `workflow: { _state: overview.workflow }` (verified at [workflow-overview.yaml:58-61](../../../../modules/workflows/pages/workflow-overview.yaml)). The component must remain functional during this transitional state — once Part 17's follow-up lands, the call site will also pass `is_overview_page: true` and the action cards in `blocks:`. Transitional rules:
  - When `is_overview_page` is undefined → default `false` → the link button renders. Acceptable until Part 17's follow-up fixes the call site.
  - When `blocks` is undefined → render an empty slot (the collapse toggle still works against an empty box). Per design.md the var is required semantically; the YAML treats a missing value as `[]` for transitional safety. Once Part 17's follow-up passes the action cards in `blocks:`, the transitional accommodation is no longer exercised.
- **No unit tests** for the YAML itself per CLAUDE.md conventions; e2e in Part 22.
