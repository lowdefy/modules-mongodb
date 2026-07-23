# Task 5: Migrate the contacts module

## Context

The contacts module declares an `app_name` manifest var and reads it at **both** runtime and
build-time sites, so this task must apply the two-form rule (design §Build-time and runtime
usage):

- `_app: slug` — runtime positions: MongoDB `$expr` field-path composition via runtime
  `_string.concat`, page component vars, and the update-contact `$ne` guard.
- `_build.app: slug` — the `- - _module.var: app_name` key nested under
  `_build.object.fromEntries` in the write APIs.

It also carries a stale comment to fix and an `event_display` var description to correct.

## Task

**`modules/contacts/module.lowdefy.yaml`:**

- Remove the `app_name:` manifest var block (line ~22).
- Fix the `event_display` var `description` (line ~26): "When unset, the module's defaults
  render under **`app_name`**" → "…render under the app slug".

**Runtime sites → `_app: slug`:**

- `modules/contacts/requests/get_role_contacts_for_selector.yaml:25` — inside the runtime
  `_string.concat` building `$apps.{slug}.roles`.
- `modules/contacts/requests/get_role_contacts_for_selector.yaml:16` (comment) — the comment
  "app_name is build-time, so the field path resolves to a literal before Mongo sees it" is now
  false (`_app: slug` is a runtime operator; net behaviour is unchanged because the
  `_string.concat` still resolves to a literal before Mongo, but the stated reason is wrong).
  Rewrite it to state the runtime-concat invariant without the "build-time" premise, or drop it.
- `modules/contacts/pages/edit.yaml:38` — page component var → `_app: slug`.
- `modules/contacts/pages/view.yaml:37` — page component var → `_app: slug`.
- `modules/contacts/api/update-contact.yaml:18` — inside the runtime `_string.concat` building
  `apps.{slug}.is_user` → `_app: slug`.

**Build-time sites → `_build.app: slug`** (the `- - _module.var: app_name` key under
`_build.object.fromEntries`):

- `modules/contacts/api/create-contact.yaml:103`
- `modules/contacts/api/update-contact.yaml:75`

Re-grep to confirm: `git grep -n '_module.var: app_name' modules/contacts/`.

## Acceptance Criteria

- `modules/contacts/module.lowdefy.yaml` no longer declares `app_name`; the `event_display`
  description says "app slug".
- No `_module.var: app_name` remains under `modules/contacts/`.
- Runtime sites use `_app: slug`; the two `_build.object.fromEntries` map keys use
  `_build.app: slug`.
- The `get_role_contacts_for_selector.yaml` comment no longer claims `app_name` is build-time.

## Files

- `modules/contacts/module.lowdefy.yaml` — modify — remove `app_name` var; fix `event_display` description
- `modules/contacts/requests/get_role_contacts_for_selector.yaml` — modify — `_app: slug` (line 25); rewrite/remove comment (line 16)
- `modules/contacts/pages/edit.yaml` — modify — `_app: slug`
- `modules/contacts/pages/view.yaml` — modify — `_app: slug`
- `modules/contacts/api/update-contact.yaml` — modify — line 18 runtime `_app: slug`; line 75 build-time `_build.app: slug`
- `modules/contacts/api/create-contact.yaml` — modify — line 103 build-time `_build.app: slug`

## Notes

- `update-contact.yaml` has both a runtime site (line 18) and a build-time site (line 75) — do
  not use the same form for both. Line 18 is a runtime `_string.concat` (→ `_app: slug`);
  line 75 is a `_build.object.fromEntries` key (→ `_build.app: slug`).
- The generated `docs/contacts/reference/vars.md` is regenerated in task 9.
