# Part 18 — Entity-page components

**Source rationale:** [workflows-module-concept/ui/spec.md](../../../workflows-module-concept/ui/spec.md). **Layer:** UI delivery. **Size:** M. **Repo:** `modules/workflows/components/`.

## Goal

Ship the three entity-page components that consuming apps drop onto their own entity pages: `actions-on-entity` (the workflow widget), `workflow-header` (per-workflow strip), and `action_role_check` (verb / role gate primitive).

## In scope

### `components/actions-on-entity.yaml`

- Fetches workflows on `onMount` (not `onInit` — concept ui/review-1 #1) via `CallApi` to `get-entity-workflows` ([part 19](../19-operational-apis/design.md)). `CallApi` is deliberate because the data path goes through the module's Api layer (ui/review-1 #2).
- Iterates returned workflows by `display_order` ASC, with `created.timestamp` DESC as tie-break.
- Per workflow:
  - Renders `workflow-header` (this part) as the strip.
  - Renders per-group sections from the persisted `groups[]` array (positional — workflow's `action_groups[]` declaration order). Group title + status badge.
  - Within each group, renders actions sorted by `sort_order`.
  - Per-action row: status badge + `status_map.{current_stage}.{vars.app_name}.message` (Nunjucks-rendered with action-instance context).
  - If the status-map cell has `link`, the row renders as a clickable card pointing at the linked page (`-edit` / `-view` / `-review` for form actions, `task-edit?action_id=...` for task actions); without `link`, static text.
  - Keyed actions render as N rows within their group slot, one per instance.
- Tracker actions render inline (no link) using their `status_map` message.

### `components/workflow-header.yaml`

- Per-workflow strip:
  - Title (from `workflow.title`).
  - Lifecycle stage badge (from `workflow.status[0].stage`, rendered with `global.workflow_lifecycle_stages` display attributes).
  - Summary counts (`workflow.summary.{done, not_required, total}`).
  - Current-phase milestone — the title of the lowest-ordered group whose `status !== done` (concept's group-based milestone rule).
  - Collapse / expand toggle that hides/shows the group sections below.

### `components/action_role_check.yaml`

- Reusable client-side access-check primitive.
- Reads `_user: roles` (per `user_schema.roles_path` var).
- Evaluates an action's `access.{vars.app_name}` verb membership + `access.roles` intersection with user roles.
- Returns a boolean used by templates to conditionally render buttons.
- Same logic the engine runs server-side at query time (in `get-entity-workflows`) and submit time (in `SubmitWorkflowAction`).

### Module exports

These three components are exposed via `module.lowdefy.yaml`'s `exports.components` (declared in [part 20](../20-module-manifest/design.md)).

## Out of scope / deferred

- **Tracker action linking** — inline-only in v1.
- **Restricted-action display** — concept marks as open question. Hide for v1.
- **`workflow-history` timeline** mentioned in concept ui spec for status-map binding — out of v1 scope per the concept's component list (the exported set is the three above only).

## Depends on

[Part 19](../19-operational-apis/design.md) (`get-entity-workflows`), [part 4](../04-workflow-config-schema/design.md) (`global.action_statuses`, `global.workflow_lifecycle_stages`).

## Verification

- Worked-example demo:
  - Lead page renders `actions-on-entity`: one workflow row, four action rows organized by `action_group`.
  - `qualify` status flips after submit; `actions-on-entity` re-renders.
  - `workflow-header` milestone label updates when group statuses change.
  - `action_role_check` correctly hides buttons for users without the required role.
- Responsive: widget reflows on narrow viewports.
- a11y: keyboard nav reaches every link / button.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Open questions

- **Refresh strategy after a submit.** Page-level refetch on submit response, vs. component-internal refetch. Lean page-level (entity page owns the refresh trigger).
- **`workflow-header` collapse state persistence.** v1: ephemeral. Persistent (per-user) is a follow-up.

## Contract to neighbours

- **Part 19** provides the data path (`get-entity-workflows`).
- **Part 20** exports these components via the module manifest.
