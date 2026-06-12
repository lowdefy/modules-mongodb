# Task 2: Migrate the four simple modules (`contacts`, `companies`, `notifications`, `user-account`)

## Context

These four modules each declare an `app_name` manifest var and read it at a handful of sites. They share one shape, so they migrate together as one mechanical pass. Each is dropped as a manifest var, every read swaps to `_app: slug` (or `_build.app: slug` at the one build-time site type), and the demo vars entry is removed.

`user-admin` and `workflows` are migrated separately (Tasks 3, 4) because they carry extra complexity (the `app_title` default; the resolver).

**Build-time vs runtime for these four** (apply [the rule in tasks.md](tasks.md#the-one-rule-that-governs-every-swap)):

- **`_build.app: slug`** — the single `- - _module.var: app_name` key nested under `_build.object.fromEntries` (event-display map) in each create/update API:
  `companies/api/{create,update}-company.yaml`, `contacts/api/{create,update}-contact.yaml`, `user-account/api/{create,update}-profile.yaml`.
- **`_app: slug`** — everything else: runtime change-stamp `app_name` fields, payload defaults, page/component vars, request `$match` filters.

For `notifications`, all sites are runtime: each request declares `payload: { app_name: { _module.var: app_name } }` and filters `created.app_name: { _payload: app_name }`. Swap the payload default value to `{ _app: slug }`.

## Task

For **each** of `contacts`, `companies`, `notifications`, `user-account`:

1. **Manifest** — delete the `app_name:` entry from `vars:` in `modules/{module}/module.lowdefy.yaml`. (Leave `event_display` and other vars; only `app_name` goes.)

2. **Module YAML** — replace `_module.var: app_name`:
   - at the `_build.object.fromEntries` key → `_build.app: slug`;
   - everywhere else → `_app: slug`.
   Re-grep to find the sites: `grep -rn "_module.var: app_name" modules/{module}/`. Confirm zero remain afterward.

3. **Demo vars** — delete the top-level `app_name:` block from `apps/demo/modules/{module}/vars.yaml`.

Known site inventory (re-confirm by grep — counts drift):
- `contacts` — `api/{create,update}-contact.yaml` (incl. 1 `_build.object.fromEntries` key each), `pages/{view,edit}.yaml`.
- `companies` — `api/{create,update}-company.yaml` (incl. 1 `_build.object.fromEntries` key each).
- `notifications` — 6 `requests/*.yaml` + `components/unread-count-request.yaml` (all runtime payload defaults).
- `user-account` — `api/{create,update}-profile.yaml` (incl. 1 `_build.object.fromEntries` key each), `components/view_profile.yaml`, `requests/get_users_for_selector.yaml`.

## Acceptance Criteria

- `grep -rn "_module.var: app_name" modules/{contacts,companies,notifications,user-account}/` returns no results.
- None of the four manifests declare `app_name` under `vars:`.
- None of the four demo vars files declare a top-level `app_name:`.
- The `_build.object.fromEntries` event-display keys use `_build.app: slug`; all other migrated sites use `_app: slug`.
- `pnpm ldf:b` succeeds.

## Files

- `modules/contacts/module.lowdefy.yaml`, `modules/companies/module.lowdefy.yaml`, `modules/notifications/module.lowdefy.yaml`, `modules/user-account/module.lowdefy.yaml` — drop `app_name` var.
- `modules/contacts/api/{create,update}-contact.yaml`, `modules/contacts/pages/{view,edit}.yaml` — swap.
- `modules/companies/api/{create,update}-company.yaml` — swap.
- `modules/notifications/requests/*.yaml`, `modules/notifications/components/unread-count-request.yaml` — swap payload defaults.
- `modules/user-account/api/{create,update}-profile.yaml`, `modules/user-account/components/view_profile.yaml`, `modules/user-account/requests/get_users_for_selector.yaml` — swap.
- `apps/demo/modules/{contacts,companies,notifications,user-account}/vars.yaml` — delete `app_name:` block.

## Notes

- Do not touch the inline `app_name` field name on `created.{}` stamps or the `_payload: app_name` filter keys — those are stored field / payload names and stay literal. Only the *value* expression migrates.
- The `_build.object.fromEntries` key is the only build-time site in these four modules. If you find yourself writing `_build.app` anywhere else here, re-check — it's probably runtime.
