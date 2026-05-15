# Part 17 — Shared pages (task-\* + workflow-overview)

**Source rationale:** [workflows-module-concept/ui/spec.md](../../../workflows-module-concept/ui/spec.md). **Layer:** UI delivery. **Size:** M. **Repo:** `modules/workflows/pages/`.

## Goal

Ship the four shared, static pages that aren't generated per-action: three task-action pages (one experience across all task actions) and the workflow detail page. All four are addressed by URL query params (`?action_id=<id>` or `?workflow_id=<id>`).

## In scope

### Task pages

- **`pages/task-edit.yaml`**
  - Status selector populated from `global.action_statuses` and filtered by the priority rule at render time (lower-priority transitions only, plus same-stage idempotent option).
  - Universal-field inputs (`assignees` multi-select, `due_date` picker, `description` input).
  - Comment field (rich text).
  - Save button: template-shipped `submit_edit` block; calls `update-action-{action_type}` with `interaction: submit_edit`, `current_status: <user-selected>` (task is the one interaction where the caller supplies status), `fields:` block, `event.metadata.comment`.

- **`pages/task-view.yaml`**
  - Action header (title from YAML, current status badge).
  - Universal-fields display.
  - Status timeline (from action's `status` history).
  - Comment timeline (events with `metadata.comment` populated for this `action_id`).

- **`pages/task-review.yaml`**
  - Action header + universal-fields display (same as `task-view`).
  - Template-shipped `approve` / `request_changes` buttons.
  - Optional comment field flowing through `event.metadata.comment`.
  - Calls `update-action-{action_type}` with `interaction: approve` / `request_changes`.

### Workflow overview page

- **`pages/workflow-overview.yaml`**
  - URL query: `?workflow_id=<id>`.
  - Calls `get-workflow-overview` ([part 19](../19-operational-apis/design.md)) on mount.
  - Renders workflow header (title, lifecycle stage badge, summary counts).
  - List of action cards wrapped in `layout.card`:
    - Status badge + `status_map.{current_stage}.{app_name}.message` (Nunjucks-templated).
    - Optional link button to action's own page.
    - Card body: empty-state or DataView over `form_data` using `global.action_form_configs.{action_type}.form` / `.form_review` from [part 15](../15-resolver-form-builder/design.md).
  - Keyed actions render as N cards within their group slot.
  - Tracker actions link to the child workflow's `workflow-overview` page when configured.

### Shared module-shipped requests

- `requests/get_workflow_overview_data.yaml` — server-side fetch of one workflow + its actions.
- `requests/get_workflow_entity.yaml` — fetch the entity doc referenced by a workflow.

### Page event wiring

Same `onMount` / `onSubmit` / `onApprove` / `onRequestChanges` vocabulary as [part 16](../16-page-templates/design.md). Apps customize via `pages.{verb}.events.{handler}` on the task action YAML (declared in [part 4](../04-workflow-config-schema/design.md)).

### Layout-module composition

Same as part 16: `layout.page` → `layout.card` → `layout.floating-actions` for buttons.

## Out of scope / deferred

- **Comment-timeline shape refinement.** Concept marks as "refinement based on real-app patterns." Ship the v1 shape (events filtered by `action_ids` and `metadata.comment`).
- **Restricted-action tile on `workflow-overview`** — concept marks as open question; ship sensible default (hide), iterate.
- **Completed-workflow tile UX detail** — same; ship sensible default.

## Depends on

[Part 13](../13-resolver-apis/design.md) (task pages call `update-action-{action_type}`), [part 15](../15-resolver-form-builder/design.md) (`global.action_form_configs`), [part 19](../19-operational-apis/design.md) (`get-workflow-overview` Api).

## Verification

- Worked-example demo:
  - Lead with onboarding workflow: clicking `schedule-followup` (task action) navigates to `workflows/task-edit?action_id=...` with the right action loaded.
  - Submitting `task-edit` transitions the action; lead page reflects the new state.
  - `workflows/workflow-overview?workflow_id=...` renders all four actions in order with current status + form_data display.
- a11y + responsive: pages reflow on narrow viewports, keyboard nav works.

## Open questions

- **Task pages addressing scheme.** Concept says `?action_id=` only; confirm during implementation.
- **Tracker action linking on overview.** Inline-only in v1 vs. linkable into child workflow. Lean inline; revisit if a real app needs.

## Contract to neighbours

- **Part 19** ships `get-workflow-overview`; this part consumes it.
- **Part 13** emits the `update-action-{action_type}` endpoints task-\* pages call.
