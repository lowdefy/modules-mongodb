# Task 6: Migrate the companies and activities modules

## Context

The companies and activities modules declare an `app_name` manifest var and read it only at
**build-time** sites — the `- - _module.var: app_name` key nested under
`_build.object.fromEntries` in their write APIs (event-display key construction). Every read
here becomes `_build.app: slug` (design §Build-time and runtime usage).

Activities carries one additional edge case: a **deeper** variant where the key is built by a
`_build.string.concat` that is then fed into `_build.object.fromEntries` — so `app_name` is an
argument to a `_build.*` operator one level down, not the direct map key. It still needs
`_build.app: slug`, but a grep keyed only on the `- - _module.var: app_name` shape misses it.

Both modules also have an `event_display` var description asserting the wrong term.

## Task

**Companies:**

- `modules/companies/module.lowdefy.yaml` — remove the `app_name:` var block (line ~16); fix
  the `event_display` description (line ~50): "render under **`app_name`**" → "render under the
  app slug".
- `modules/companies/api/create-company.yaml:130` — `- - _module.var: app_name` →
  `- - _build.app: slug` (under `_build.object.fromEntries`).
- `modules/companies/api/update-company.yaml:203` — same.

**Activities:**

- `modules/activities/module.lowdefy.yaml` — remove the `app_name:` var block (line ~18); fix
  the `event_display` description (line ~42): "render under **`app_name`**" → "render under the
  app slug".
- The `_build.object.fromEntries` map-key sites → `_build.app: slug`:
  - `modules/activities/api/change-activity-status.yaml:111, 166, 215`
  - `modules/activities/api/create-activity.yaml:79, 198`
  - `modules/activities/api/delete-activity.yaml:103`
  - `modules/activities/api/update-activity.yaml:85, 214`
- The deeper `_build.string.concat` variant:
  - `modules/activities/api/update-activity.yaml:317` — `- _module.var: app_name` (argument to
    `_build.string.concat`, which is then fed into `_build.object.fromEntries`) →
    `- _build.app: slug`.

Re-grep to confirm both the direct map-key sites and the concat variant:

```
git grep -n '_module.var: app_name' modules/companies/ modules/activities/
git grep -n -B2 '_module.var: app_name' modules/activities/ | grep _build.string.concat
```

## Acceptance Criteria

- Neither manifest declares `app_name`; both `event_display` descriptions say "app slug".
- No `_module.var: app_name` remains under `modules/companies/` or `modules/activities/`.
- Every migrated site (including `update-activity.yaml:317`) uses `_build.app: slug`.

## Files

- `modules/companies/module.lowdefy.yaml` — modify — remove `app_name` var; fix `event_display` description
- `modules/companies/api/create-company.yaml` — modify — `_build.app: slug`
- `modules/companies/api/update-company.yaml` — modify — `_build.app: slug`
- `modules/activities/module.lowdefy.yaml` — modify — remove `app_name` var; fix `event_display` description
- `modules/activities/api/change-activity-status.yaml` — modify — 3 map-key sites → `_build.app: slug`
- `modules/activities/api/create-activity.yaml` — modify — 2 map-key sites → `_build.app: slug`
- `modules/activities/api/delete-activity.yaml` — modify — 1 map-key site → `_build.app: slug`
- `modules/activities/api/update-activity.yaml` — modify — 2 map-key sites + the `_build.string.concat` variant (line 317) → `_build.app: slug`

## Notes

- All sites in these two modules are build-time — none use `_app: slug`.
- Do not miss `update-activity.yaml:317`; the direct map-key grep does not surface it.
- Generated `vars.md` for both modules is regenerated in task 9.
