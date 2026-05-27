# Task 5: Migrate the `notifications` module to `_app: slug`

## Context

`modules/notifications` declares `app_name` as a manifest var ("App identifier used to scope notifications. Matches `created.app_name`") and reads it at 7 sites across 6 request files and 1 component. All sites are MongoDB filters that scope notification reads/writes to the current app — they evaluate at runtime per request.

The demo wires `app_name` from `app_config.yaml`.

## Task

1. **Module manifest** — edit `modules/notifications/module.lowdefy.yaml`: delete the `app_name:` entry from `vars:`.

2. **Module YAML** — replace every `_module.var: app_name` with `_app: slug` in:
    - `modules/notifications/requests/get-notification-for-link.yaml`
    - `modules/notifications/requests/get-notification-types.yaml`
    - `modules/notifications/requests/get-notifications.yaml`
    - `modules/notifications/requests/get-selected-notification.yaml`
    - `modules/notifications/requests/update-notifications.yaml`
    - `modules/notifications/requests/update-selected-notification.yaml`
    - `modules/notifications/components/unread-count-request.yaml`

    Total: 7 occurrences (run `grep -c "_module.var: app_name" modules/notifications/**/*.yaml` to confirm).

3. **Demo vars** — edit `apps/demo/modules/notifications/vars.yaml`: delete the top-level `app_name:` block.

## Acceptance Criteria

- `grep -r "_module.var: app_name" modules/notifications/` returns no results.
- `modules/notifications/module.lowdefy.yaml` no longer declares `app_name` under `vars:`.
- `apps/demo/modules/notifications/vars.yaml` no longer declares a top-level `app_name:` key.
- `pnpm ldf:b` succeeds.
- The demo's notifications inbox renders existing demo-scoped notifications (proves the filter still resolves to `"demo"`); the unread-count badge still updates.

## Files

- `modules/notifications/module.lowdefy.yaml` — modify — drop `app_name` from `vars`.
- `modules/notifications/requests/get-notification-for-link.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/notifications/requests/get-notification-types.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/notifications/requests/get-notifications.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/notifications/requests/get-selected-notification.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/notifications/requests/update-notifications.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/notifications/requests/update-selected-notification.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/notifications/components/unread-count-request.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `apps/demo/modules/notifications/vars.yaml` — modify — delete top-level `app_name:` block.

## Notes

- All seven sites are runtime MongoDB filters. `_app: slug` evaluating at runtime is sufficient.
- Existing notification documents already store `created.app_name: "demo"`, so filters continue to match.
