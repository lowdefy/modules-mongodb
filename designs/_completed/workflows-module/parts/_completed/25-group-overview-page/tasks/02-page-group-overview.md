# Task 2: Ship `pages/group-overview.yaml` + manifest export

## Context

The Workflows module ships shared, static pages under `modules/workflows/pages/`. The closest analogue to the new page is [`pages/workflow-overview.yaml`](../../../../modules/workflows/pages/workflow-overview.yaml) (274 lines) — the workflow-level overview, addressed by `?workflow_id=<id>`. It mounts one `CallApi` to `get-workflow-overview`, redirects back to the host entity page on a `null` workflow, renders `workflow-header` plus an action-card list with `status_map`-driven links and per-card `DataView` over `form_data`.

This task ships the group-level analogue. The Api (Task 1) is in place; this page consumes it.

## Task

### 1. Create `modules/workflows/pages/group-overview.yaml`

Structure modeled on [`pages/workflow-overview.yaml`](../../../../modules/workflows/pages/workflow-overview.yaml). The page is composed via `_ref: { module: layout, component: page }` (matching `workflow-overview.yaml:11-13`).

**URL query:** `?workflow_id=<id>&group_id=<id>`. Page id: `group-overview`.

**`onMount` sequence:**

1. Presence guard on `workflow_id` AND `group_id`. If either is missing, `Link` back: true. Same shape as `workflow-overview.yaml:21-28` but with both fields checked.
2. `CallApi` to `get-action-group-overview` with payload `{ workflow_id: <_url_query>, group_id: <_url_query> }`.
3. `SetState` the response under `_state.overview` (single key, mirrors `workflow-overview.yaml:41-45`).
4. Null-redirect guard: `Link` back: true when `_state.overview.workflow === null`. Same shape as `workflow-overview.yaml:48-55`.

**Rendered blocks:**

1. **Page header.** Workflow title (resolved via `_module.var: workflows_config[workflow.workflow_type].title` — same `_global` join `workflow-header.yaml:36-44` uses) + group title (resolved via `_module.var: workflows_config[workflow.workflow_type].action_groups[]` joined on `group.id`, with `_state.overview.group.id` as fallback when no matching entry exists — matches the milestone-lookup fallback in `workflow-header.yaml:135-137`). Place a back-link breadcrumb to the entity page using the same `_module.var: entities` lookup `workflow-overview.yaml:62-78` uses for its entity back-button.
2. **Progress bar.** Single block, driven by `_state.overview.group.summary: { done, not_required, total }`. Filled proportion is `(done + not_required) / total`. Label reads `{{ done + not_required }} of {{ total }} done`. Empty groups (`total === 0`) render the bar at 100% with a "no actions" label (action-groups spec convention — empty groups are `done` by default). Carry `aria-valuenow` / `aria-valuemax` for a11y.
3. **Group-status badge.** Renders `_state.overview.group.status` (`blocked` / `in-progress` / `done`) using the existing per-stage display attributes (`global.workflow_lifecycle_stages` is for workflow-level stages; for group statuses use a Tag with hardcoded color/title per the three values — or extract an enum if one already exists, check `modules/workflows/enums/`).
4. **List of action cards** wrapped in `layout.card`. Reuse the same card body shape `workflow-overview.yaml` already implements (status badge from `global.action_statuses.{current_stage}`, Nunjucks-templated `status_map.{current_stage}.{app_name}.message`, per-card `DataView` over `form_data` using `global.action_form_configs.{action_type}.form` / `.form_review`, with the keyed-action `_get` + `_if` indexing pattern `workflow-overview.yaml` uses). Click navigation: each card's link target comes from `status_map.{current_stage}.{app_name}.link`. Actions with no link cell render as a non-clickable card.

**Keyed actions** are returned as N entries by the Api (one per `key` value); render them as N cards inside the same group slot. **Tracker actions** flow through the same `status_map`-driven card; if their link cell points at a `group-overview`, that's a normal `status_map` link (no special-casing).

**Page events:** v1 doesn't expose page-level event overrides. Skip step 8 of part 16's 8-step `onMount` sequence (same gap part 17's pages have, tracked in part 27).

### 2. Wire the page into `modules/workflows/module.lowdefy.yaml`

- Append to `exports.pages`:
  ```yaml
  - id: group-overview
    description: Group detail page — header + progress bar + group-status badge + action cards with form_data DataView. Addressed by ?workflow_id=<id>&group_id=<id>.
  ```
- Append to the top-level `pages:` block:
  ```yaml
  - _ref: pages/group-overview.yaml
  ```
- Update the leading comment block to mention Part 25.

## Acceptance Criteria

- `modules/workflows/pages/group-overview.yaml` exists and structurally mirrors `pages/workflow-overview.yaml` with the differences above (extra `group_id` URL param, group-summary progress bar, group-status badge, group-title resolution from `_module.var: workflows_config`).
- `modules/workflows/module.lowdefy.yaml` lists `group-overview` under `exports.pages` and references the YAML under `pages:`.
- `pnpm ldf:b` succeeds. No Lowdefy warnings.
- Page-level smoke (manual or via existing test harness):
  - Loads with `?workflow_id=<id>&group_id=<gid>` on a fixture workflow.
  - Progress bar renders correct `done / total` for the group.
  - Group title renders from `workflowsConfig[workflow_type].action_groups[group_id].title`; falls back to `group_id` when no entry.
  - Action cards render status badges + Nunjucks-templated `status_map` messages.
  - Clicking a card with a `status_map.{stage}.{app_name}.link` navigates; without one is inert.
  - Empty / fully-access-restricted group redirects back to the entity page.
  - a11y: progress bar carries `aria-valuenow` / `aria-valuemax`; cards reflow on narrow viewports.
- End-to-end coverage is **out of scope here** — `group-overview.spec.js` lands in part 22's e2e suite.

## Files

- `modules/workflows/pages/group-overview.yaml` — **create** — new shared page, modeled on `pages/workflow-overview.yaml`.
- `modules/workflows/module.lowdefy.yaml` — **modify** — append `exports.pages` entry + `pages:` `_ref`; update leading comment.

## Notes

- The leading file comment in `workflow-overview.yaml` calls out path-stub dependencies it inherited (`components/workflow-header.yaml`, `vars.entities`, `vars.app_name`). All three are real now; mention only what `group-overview.yaml` actually depends on in its own leading comment (`get-action-group-overview` from Task 1, `_module.var: workflows_config`, `_module.var: entities`, `global.action_form_configs`).
- Don't reuse `workflow-header` on this page — `workflow-header` is for the workflow-level strip with the workflow-overview link button. The group page header is a smaller, group-scoped element (title + breadcrumb + progress bar + status badge).
- If a "group_status" enum doesn't exist in `modules/workflows/enums/`, hardcode the three colors/titles in the page YAML rather than introducing a new enum file. The action-groups spec only commits to three values and this is the first consumer; an enum file would be premature.
- The empty-group rendering question (design.md "Open questions") is "render, don't redirect" — render the progress bar at 100% with "no actions" copy. Don't add a redirect branch for `total === 0`.
