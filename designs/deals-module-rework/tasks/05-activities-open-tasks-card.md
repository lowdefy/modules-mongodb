# Task 5: Add an `open-tasks` card to activities; compose both; retire deals' actions surface

## Context

Workstream B1 (activities half), completing the widget split. Task 4 gave workflows an `open-actions` card; this task gives activities the matching **`open-tasks`** card (reading its own `actions` collection, where task 3 put task CRUD). Deals then composes both cards where its single `section_actions` card was, and its now-redundant local open-items surface is removed.

## Task

Add an exported **`open-tasks`** component to the **activities** module — a compact card listing an entity's open tasks from activities' `actions` collection, parameterised by `entity_type` + `entity_id`. It queries tasks by `kind: task` + `entity_type`/`entity_id` — **the shape task 3 now writes** (task 3 replaced the old `deal_ids` linkage with the generic `entity_type`/`entity_id`), so this card supersedes deals' old `get_selected_deal_open_actions` reader (which still queries `deal_ids`). Style it to match the workflows `open-actions` card so the two read as one "what's open" row.

Then in **deals**:
- compose the workflows `open-actions` card + the activities `open-tasks` card side by side where `section_actions` rendered;
- delete `components/detail/section_actions.yaml` and `components/detail/action_card.yaml.njk`;
- **verify** `get_selected_deal_open_actions` is now unused; if so, delete it and drop deals' `actions-collection` connection (its remaining reader) + its manifest export. If anything still reads it, leave a note and keep it.

## Acceptance Criteria

- activities exports `open-tasks` (manifest + docs updated).
- The deal view shows open actions + open tasks as two composed cards; `section_actions.yaml` + `action_card.yaml.njk` are deleted.
- `get_selected_deal_open_actions` + deals' `actions-collection` connection removed if confirmed unused (grep before deleting).
- `CI=true pnpm ldf:b` green; changesets for activities (minor) + deals; `docs:check` green.

## Files

- `modules/activities/components/open-tasks.yaml` — create.
- `modules/activities/module.lowdefy.yaml` — modify — export `open-tasks`.
- `modules/deals/pages/view.yaml` — modify — compose both cards.
- `modules/deals/components/detail/section_actions.yaml`, `components/detail/action_card.yaml.njk` — delete.
- `modules/deals/requests/get_selected_deal_open_actions.yaml`, `connections/actions-collection.yaml` — delete (if unused); update `module.lowdefy.yaml` exports.
- `.changeset/*.md` — create.

## Notes

Depends on task 3 (activities owns task storage/CRUD) and task 4 (the paired actions card). Confirm the `actions-collection` connection is not read elsewhere in deals before deleting — the workflows engine has its own actions collection; don't conflate.

**Host migration (Phase D, record only):** because task 3 changed task→deal linkage from `deal_ids` to `entity_type`/`entity_id`, this card's `entity_type`/`entity_id` query will not surface a host's pre-existing `deal_ids`-shaped tasks. The host needs a one-time backfill migration stamping `entity_type: deal` / `entity_id` onto legacy tasks — same class as the value/close backfill in design A4, run host-side at cutover. The demo has fresh data, so no demo migration is needed. Not implemented here; noted so Phase D plans for it.
