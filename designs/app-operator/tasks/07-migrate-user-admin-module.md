# Task 7: Migrate the `user-admin` module to `_app: slug` and default `app_title` to `_app: name`

## Context

`modules/user-admin` is the largest consumer of `app_name`: 50 occurrences across 12 files (7 request files, 4 API files, the all-users page). The manifest var description is "App name for MongoDB field paths (e.g., example-app)" — the user-admin module uses the slug to construct dot-paths like `apps.{slug}.roles` and to scope event-display map keys.

Alongside dropping `app_name`, this task changes the default for the unrelated `app_title` var. `app_title` is a human-readable label prefix used in menu labels and page titles. Today its default is `''` (no prefix). The design changes the default to `{ _app: name }`, so consumers with a `name:` declared on `lowdefy.yaml` automatically get prefixed labels ("Modules Demo User Admin", "Invite Modules Demo User") without per-consumer wiring. Apps that want no prefix override with `app_title: ''`.

This is a build-time concern — page IDs, breadcrumbs, and filenames are composed during the build via `_build.string.concat` — so `_app: name` must evaluate at build time, same as `_app: slug`.

## Task

1. **Module manifest** — edit `modules/user-admin/module.lowdefy.yaml`:
    - Delete the `app_name:` entry from `vars:`.
    - Change the `app_title` default from `''` to `{ _app: name }`. Update the description to explain the new default behaviour and the `''` override for unprefixed labels.

2. **Module YAML** — replace every `_module.var: app_name` with `_app: slug` in:
    - `modules/user-admin/requests/check_invite_email.yaml`
    - `modules/user-admin/requests/get_all_users.yaml`
    - `modules/user-admin/requests/get_user.yaml`
    - `modules/user-admin/requests/get_user_excel_data.yaml`
    - `modules/user-admin/requests/get_users_for_selector.yaml`
    - `modules/user-admin/api/invite-user.yaml`
    - `modules/user-admin/api/resend-invite.yaml`
    - `modules/user-admin/api/update-user.yaml`
    - `modules/user-admin/pages/all.yaml`

    Total: 50 occurrences (run `grep -rc "_module.var: app_name" modules/user-admin/` to confirm).

    The sites include:
    - `_string.concat: ["apps.", { _app: slug }, ".roles"]` style field-path construction (runtime in API payloads, build-time in page chrome).
    - `_build.string.concat` page titles and filenames in `pages/all.yaml` and any `components/excel_download.yaml` chrome.
    - `_build.object.fromEntries` event-display map keys.
    - Runtime MongoDB filters.

3. **Demo vars** — edit `apps/demo/modules/user-admin/vars.yaml`:
    - Delete the top-level `app_name:` block.
    - Decide whether to keep or remove `app_title` (if set in the demo). If absent, the new default of `{ _app: name }` resolves to "Modules Demo" automatically. The design's intent is for the demo to demonstrate the new default — so leave `app_title` unset unless the demo previously overrode it.

## Acceptance Criteria

- `grep -r "_module.var: app_name" modules/user-admin/` returns no results.
- `modules/user-admin/module.lowdefy.yaml` no longer declares `app_name` under `vars:`.
- `vars.app_title.default` is `{ _app: name }`.
- `apps/demo/modules/user-admin/vars.yaml` no longer declares a top-level `app_name:` key.
- `pnpm ldf:b` succeeds.
- Demo user-admin page renders with the title "Modules Demo User Admin" (proves `app_title: { _app: name }` resolves at build time).
- Inviting and editing users still writes events under `display.demo.*` and stores `apps.demo.roles` on the user document.

## Files

- `modules/user-admin/module.lowdefy.yaml` — modify — drop `app_name`, change `app_title` default to `{ _app: name }`.
- `modules/user-admin/requests/check_invite_email.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/user-admin/requests/get_all_users.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/user-admin/requests/get_user.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/user-admin/requests/get_user_excel_data.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/user-admin/requests/get_users_for_selector.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/user-admin/api/invite-user.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/user-admin/api/resend-invite.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/user-admin/api/update-user.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `modules/user-admin/pages/all.yaml` — modify — replace `_module.var: app_name` → `_app: slug`.
- `apps/demo/modules/user-admin/vars.yaml` — modify — delete top-level `app_name:`; leave `app_title` unset.

## Notes

- This is the largest single migration in the design. After making the replacements, run `grep -rn "app_name" modules/user-admin/` and scan for any sites that *don't* look like the stored MongoDB field name (`created.app_name`) — those are missed migrations.
- Mixed build-time and runtime sites; `_app: slug` and `_app: name` both need to evaluate at both phases per the upstream Lowdefy requirement.
- The `app_title: ''` escape hatch must still work for consumers that want unprefixed labels — verify that explicitly setting `app_title: ''` in a vars file produces unprefixed labels.
