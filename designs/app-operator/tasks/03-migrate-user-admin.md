# Task 3: Migrate the `user-admin` module; default `app_title` to `{ _build.app: name }`

## Context

`user-admin` is the largest consumer of `app_name` (~50 sites across requests, APIs, and the all-users page). It uses the slug to build dot-paths like `apps.{slug}.roles` and to key event-display maps.

It also owns the unrelated `app_title` var — a human-readable label prefix (default `''` today). The design flips that default to `{ _build.app: name }` so consumers get sensible prefixed labels ("Modules Demo User Admin", "Invite Modules Demo User") automatically from `lowdefy.yaml`'s `name:`.

**Why `_build.app: name` for the default, not `_app: name`:** `app_title` is consumed at **both** build-time sites (`_build.string.concat` / `_build.string.trim` / `_build.ne` in `pages/{new,edit,view,all}.yaml` breadcrumbs, `menu.yaml`, `components/excel_download.yaml`) and a runtime site (the `_nunjucks` page title in `pages/new.yaml`, which receives `app_title` as a template var). A single default of `{ _app: name }` arrives as an unevaluated object inside the `_build.string.concat` sites and breaks the build. `{ _build.app: name }` resolves to a literal at build, which is then safe at the runtime Nunjucks site too. See [design.md §Build-time and runtime usage](../design.md#build-time-and-runtime-usage).

**Build-time vs runtime for `app_name` sites here:**
- **`_build.app: slug`** — the `_build.object.fromEntries` event-display keys in `api/update-user.yaml`, `api/invite-user.yaml`, `api/resend-invite.yaml` (one each).
- **`_app: slug`** — everything else, including the field-path construction `_string.concat: ["apps.", { _app: slug }, ".roles"]` (this is **runtime** `_string.concat`, not `_build.string.concat`), the request `$match` filters, and the stamp/payload `app_name` fields.

## Task

1. **Manifest** — edit `modules/user-admin/module.lowdefy.yaml`:
   - Delete the `app_name:` entry from `vars:`.
   - Change the `app_title` default from `''` to `{ _build.app: name }`. Update its description to explain the new default and the `app_title: ''` override for unprefixed labels.

2. **Module YAML** — replace `_module.var: app_name`:
   - at the `_build.object.fromEntries` keys (3 sites in the APIs above) → `_build.app: slug`;
   - everywhere else → `_app: slug`.
   Files: `requests/{check_invite_email,get_all_users,get_user,get_user_excel_data}.yaml`, `api/{update-user,invite-user,resend-invite}.yaml`, `pages/all.yaml`. Re-grep: `grep -rn "_module.var: app_name" modules/user-admin/`.

3. **Demo vars** — edit `apps/demo/modules/user-admin/vars.yaml`: delete the top-level `app_name:` block. Leave `app_title` unset so the demo exercises the new default ("Modules Demo …" labels).

## Acceptance Criteria

- `grep -rn "_module.var: app_name" modules/user-admin/` returns no results.
- `modules/user-admin/module.lowdefy.yaml` no longer declares `app_name`; `vars.app_title.default` is `{ _build.app: name }`.
- The 3 `_build.object.fromEntries` keys use `_build.app: slug`; field paths and filters use `_app: slug`.
- `apps/demo/modules/user-admin/vars.yaml` declares no top-level `app_name:`.
- `pnpm ldf:b` succeeds; demo user-admin breadcrumbs/menu/titles render "Modules Demo User Admin" (proves `app_title: { _build.app: name }` baked at build).
- Setting `app_title: ''` explicitly still produces unprefixed labels.

## Files

- `modules/user-admin/module.lowdefy.yaml` — modify — drop `app_name`; `app_title` default → `{ _build.app: name }`.
- `modules/user-admin/requests/{check_invite_email,get_all_users,get_user,get_user_excel_data}.yaml` — swap (`_app: slug`).
- `modules/user-admin/api/{update-user,invite-user,resend-invite}.yaml` — swap (`_build.app: slug` at fromEntries key, `_app: slug` elsewhere).
- `modules/user-admin/pages/all.yaml` — swap (`_app: slug`).
- `apps/demo/modules/user-admin/vars.yaml` — delete `app_name:` block; leave `app_title` unset.

## Notes

- After swapping, run `grep -rn "app_name" modules/user-admin/` and check every remaining hit is the stored field name `created.app_name`, the stored dot-path segment, or `app_attributes.{slug}` — not a missed `_module.var`.
- `app_title` flows into `_nunjucks` via `_object.assign` in `pages/{new,edit,view}.yaml` — confirm the baked string renders correctly there after the default change.
