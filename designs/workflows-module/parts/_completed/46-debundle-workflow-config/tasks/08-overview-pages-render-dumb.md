# Task 8: Make the two overview pages render from the response

## Context

`modules/workflows/pages/workflow-overview.yaml` and
`workflow-group-overview.yaml` currently derive display config client-side:

- **Title** — via `_get from: { _ref: components/workflows_config.yaml }` keyed by
  `workflow.workflow_type` (workflow-overview:74–78; group-overview:84–91 and a
  `_js` block at 102–119).
- **Group title** — group-overview's `_js` block at lines 102–119 reads
  `_module.var: workflows_config`.
- **Entity back-link** — `entity_back_button` reads `_module.var: entities`
  (workflow-overview:141–177; group-overview:155–191) to build pageId + urlQuery
  - title.
- **Form metadata** for the inline `DataDescriptions` — via
  `_get from: { _ref: components/action_form_configs.yaml }` keyed by
  `actions_list.$.type` (workflow-overview:294–300; group-overview:330–336).

After task 7, `GetWorkflowOverview` / `GetWorkflowActionGroupOverview` return
`workflow.title`, `workflow.entity_link` (`{ pageId, urlQuery, title }`), group
display fields, and `action.form_meta`. These pages must read those instead.

## Task

In **both** pages:

**1. Workflow title** — replace the `workflows_config` `_ref` lookup with
`_state: workflow.title` (the title now rides the response; it is stashed into
`_state.workflow` by the existing `set_overview_state`/`set_overview` SetState).

**2. Group title** (group-overview only) — replace the `_js` block (lines
102–119) that reads `workflows_config` with `_state: group.title` (the group's
title now rides the response under `group`).

**3. Entity back-link** — rewrite `entity_back_button` to read the resolved
`workflow.entity_link`:

- button `title` → `_state: workflow.entity_link.title`
- `link_to_entity` `pageId` → `_state: workflow.entity_link.pageId`
- `urlQuery` → `_state: workflow.entity_link.urlQuery`

Remove all `_module.var: entities` reads on these pages.

**4. Inline submitted-data form config** — replace the
`action_form_configs.yaml` `_ref` lookup with the per-action `form_meta` now on
each card: `_state: actions_list.$.form_meta` (the `DataDescriptions`
`formConfig`). Keep the default `{ form: [], form_review: [] }` fallback.

**5. Delete** the now-orphaned build-time form-config component + resolver and
the all-workflows titles map (they have no remaining consumers after this task —
`actions-on-entity` (task 9) is the only other `workflows_config.yaml` reader and
it is migrated in parallel; confirm before deleting, otherwise defer the
component deletion to task 12):

- `modules/workflows/components/action_form_configs.yaml`
- `modules/workflows/resolvers/makeActionFormConfigs.js` (+ its `.test.js`)

Remove their `_ref`s from these two pages (done above) and their entries from
`module.lowdefy.yaml` (`components:` list — `action_form_configs`). Keep the
`workflows_config` component deletion + manifest cleanup in task 12 if
`actions-on-entity` (task 9) hasn't landed yet; otherwise remove it here.

## Acceptance Criteria

- Both pages render workflow title, group title (group page), entity back-link,
  and inline submitted-data from the API response only.
- No `_module.var: workflows_config`, `_module.var: entities`, or `_ref:
components/{workflows_config,action_form_configs}.yaml` remain on either page.
- `makeActionFormConfigs.js` and `action_form_configs.yaml` are deleted (or
  deferred to task 12 with a note) and unreferenced.
- `pnpm ldf:b` builds; the overview + group pages render correctly against
  seeded data.

## Files

- `modules/workflows/pages/workflow-overview.yaml` — modify — read `title` / `entity_link` / `form_meta` from response.
- `modules/workflows/pages/workflow-group-overview.yaml` — modify — read `title` / `group.title` / `entity_link` / `form_meta` from response; delete the `_js` group-title block.
- `modules/workflows/components/action_form_configs.yaml` — delete.
- `modules/workflows/resolvers/makeActionFormConfigs.js` — delete.
- `modules/workflows/resolvers/makeActionFormConfigs.test.js` — delete.
- `modules/workflows/module.lowdefy.yaml` — modify — remove the `action_form_configs` component export.

## Notes

- `set_overview_state` already stashes `workflow` / `group` / `actions_list`
  into state — the `form_meta` field rides on each `actions_list.$` card and
  `entity_link` / `title` ride on `workflow`. No new SetState plumbing needed.
- The `actions_list.$.body_empty` / `body_dataview` visibility logic keys off
  `workflow.form_data[type(.key)]` — unchanged; only the `formConfig` source
  moves to `form_meta`.
