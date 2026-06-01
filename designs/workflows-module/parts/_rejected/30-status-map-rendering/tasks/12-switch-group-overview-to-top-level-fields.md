# Task 12: Switch `group-overview.yaml` to read top-level fields

## Context

Three `$lookup` aggregations project `message` / `link` from `$<app_name>.{message|link}` on each action doc:
- `modules/workflows/api/get-entity-workflows.yaml:62-71`
- `modules/workflows/api/get-workflow-overview.yaml:40-49`
- `modules/workflows/api/get-action-group-overview.yaml:48-57`

These were already in the target shape — they resolved to `undefined` because the engine wasn't writing the top-level keys. Now that Tasks 7–9 wire the engine to write `action[app_name].message` / `.link`, the projections light up automatically without code changes. Two of the three pages that consume them (`components/actions-on-entity.yaml`, `pages/workflow-overview.yaml`) are already in the target shape too — they read the projected fields directly.

The exception is `modules/workflows/pages/group-overview.yaml`. Its page-side code at lines 274, 293, 312 reads `a.status_map[stage][appName].message` / `.link` directly off each action doc via `_get` chains that fall through to `default: null`. With the new write shape, the equivalent reads are `actions_list.$.message` / `actions_list.$.link` — matching `workflow-overview`.

## Task

1. **`modules/workflows/pages/group-overview.yaml`** — locate the three `_get from: actions_list.$.status_map` blocks at approximately lines 265-317. Replace each with a direct read of `actions_list.$.message` / `actions_list.$.link` (the shape `workflow-overview` already uses).

2. Verify the surrounding block IDs and bindings still resolve. If the surrounding renderer expects a `null` fallback when `message` is absent, preserve that fallback (the projected field will be `null` for actions where no cell was ever written; sticky display means once a cell writes a `message`, subsequent transitions keep it).

3. No changes needed to:
   - `api/get-entity-workflows.yaml`
   - `api/get-workflow-overview.yaml`
   - `api/get-action-group-overview.yaml`
   - `components/actions-on-entity.yaml`
   - `pages/workflow-overview.yaml`

   These are already in the target shape; they light up once the engine writes the new top-level fields.

## Acceptance Criteria

- `pages/group-overview.yaml` no longer references `actions_list.$.status_map` for the message/link reads.
- The page renders correctly against an action doc that carries top-level `<app_name>.message` / `.link` fields.
- `pnpm ldf:b` succeeds; running the demo group-overview page shows rendered messages and links from the engine-written cells.

## Files

- `modules/workflows/pages/group-overview.yaml` — modify.

## Notes

This is a read-side change. It depends on the engine actually writing the top-level fields (Tasks 7, 8, 9). If you implement it before the engine wires, the page will render `null` for messages/links — same effective state as today (the page reads `status_map` which is undefined and falls through to `null`).
