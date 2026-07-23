# Task 4: Migrate the notifications module

## Context

The notifications module declares an `app_name` manifest var and reads it in its request
files to scope notifications to the current app. Every read site is a **runtime** MongoDB
filter or a request `payload:` default — there are no `_build.*` sites in this module — so
every replacement is `_app: slug`.

The requests declare a `payload:` default `app_name: { _module.var: app_name }` and filter
`created.app_name: { _payload: app_name }`. The **payload key** `app_name` and the **stored
filter path** `created.app_name` stay named `app_name` (stored data is not renamed — design
Non-goals); only the **value** of the payload default changes to `{ _app: slug }`.

## Task

**`modules/notifications/module.lowdefy.yaml`** (line ~10):

- Remove the `app_name:` manifest var block (and its description referencing `created.app_name`).

**Request files** — replace `_module.var: app_name` with `_app: slug` at each site:

- `modules/notifications/components/unread-count-request.yaml:7`
- `modules/notifications/requests/get-notification-for-link.yaml:9`
- `modules/notifications/requests/get-notification-types.yaml:9`
- `modules/notifications/requests/get-notifications.yaml:11`
- `modules/notifications/requests/get-selected-notification.yaml:9`
- `modules/notifications/requests/update-notifications.yaml:7`
- `modules/notifications/requests/update-selected-notification.yaml:9`

In files with the `payload: { ... app_name: { _module.var: app_name } }` shape (e.g.
`get-notifications.yaml`), keep the payload key `app_name:` and the filter
`created.app_name: { _payload: app_name }` unchanged; change only the payload value to
`{ _app: slug }`.

Re-grep to confirm the full set: `git grep -n '_module.var: app_name' modules/notifications/`.

## Acceptance Criteria

- `modules/notifications/module.lowdefy.yaml` no longer declares `app_name`.
- No `_module.var: app_name` remains anywhere under `modules/notifications/`.
- Stored/filter paths `created.app_name` and payload keys `app_name` are unchanged; only their
  values now come from `_app: slug`.

## Files

- `modules/notifications/module.lowdefy.yaml` — modify — remove `app_name` var
- `modules/notifications/components/unread-count-request.yaml` — modify — `_module.var: app_name` → `_app: slug`
- `modules/notifications/requests/get-notification-for-link.yaml` — modify — same
- `modules/notifications/requests/get-notification-types.yaml` — modify — same
- `modules/notifications/requests/get-notifications.yaml` — modify — payload value → `_app: slug`
- `modules/notifications/requests/get-selected-notification.yaml` — modify — same
- `modules/notifications/requests/update-notifications.yaml` — modify — payload value → `_app: slug`
- `modules/notifications/requests/update-selected-notification.yaml` — modify — same

## Notes

- No build-time (`_build.app`) sites in this module — all runtime.
- The demo and workflows-test vars files still pass `app_name` to this module until tasks 7/8;
  the build is only green once those consumers are updated too (same PR).
