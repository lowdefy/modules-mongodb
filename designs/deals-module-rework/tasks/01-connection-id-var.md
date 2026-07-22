# Task 1: Promote the literal `deals` connection_id to a var

## Context

The deals module matches a workflow document's `entity.connection_id` against the string literal `deals` in several requests, rather than a configurable var. `GetEntityWorkflows` joins on this string, so it also has to equal the workflow config's `entity.connection_id`. Hardcoding it prevents a host from mapping its deals collection under any other connection id. This is Workstream A1 of the design.

## Task

Introduce a module var `entity_connection_id` (type string, default `deals`) in `modules/deals/module.lowdefy.yaml`, and replace the literal `deals` connection_id string with `_module.var: entity_connection_id` at every site that matches the workflow doc's `entity.connection_id`:

- `modules/deals/requests/get_selected_deal.yaml:104`
- `modules/deals/requests/get_active_deals.yaml:95`
- `modules/deals/requests/get_deals_list.yaml:200`
- `modules/deals/requests/get_selected_deal_open_actions.yaml:26`
- `modules/deals/components/detail/deal_outcome_modal.yaml` (×2, in the `get-entity-workflows` payloads)

Document on the var that it must equal the workflow config's `entity.connection_id` (the two sites are joined by `GetEntityWorkflows` and must not drift). Do **not** touch `workflow_type` / `outcome_action_type` — they are already vars.

## Acceptance Criteria

- `entity_connection_id` var exists with default `deals` and a description noting the coupling.
- No literal `deals` connection_id string remains at the five sites above (grep confirms).
- `CI=true pnpm ldf:b` (from `apps/demo`) green — the demo's `deals` app connection still matches the default.
- Changeset added for `@lowdefy/modules-mongodb-deals` (minor); `docs/deals/reference/vars.md` regenerated via `pnpm docs:gen`; `pnpm docs:check` green.

## Files

- `modules/deals/module.lowdefy.yaml` — modify — add `entity_connection_id` var.
- `modules/deals/requests/get_selected_deal.yaml` — modify — literal → var.
- `modules/deals/requests/get_active_deals.yaml` — modify — literal → var.
- `modules/deals/requests/get_deals_list.yaml` — modify — literal → var.
- `modules/deals/requests/get_selected_deal_open_actions.yaml` — modify — literal → var.
- `modules/deals/components/detail/deal_outcome_modal.yaml` — modify — literal → var (×2).
- `.changeset/*.md` — create — deals minor.

## Notes

The demo's app-level connection is literally `deals` (`apps/demo/lowdefy.yaml`), so the default keeps the demo working with no demo change.
