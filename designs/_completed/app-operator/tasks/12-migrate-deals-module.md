# Task 12: Migrate the `deals` module

## Context

The `deals` module landed after `designs/app-operator/design.md` was first written, so it is
absent from tasks 1–11. It is a scoping module exactly like `companies` / `contacts` /
`activities`: it declares a required `app_name` manifest var and reads it to key per-app event
display and per-app user flags. It migrates on the same terms as the others.

Its sites split across both operator forms, plus one site that turns out to be dead config.

## Task

**Manifest** (`modules/deals/module.lowdefy.yaml`):

- Delete the `app_name:` var declaration from `vars:`.
- Sweep any var `description` that asserts `app_name` exists or that the value is resolved
  "at build time" from a module var — comments and descriptions must describe the current
  code (CLAUDE.md).

**Build-time reads → `_build.app: slug`** (the operator sits inside a `_build.*` operator's
arguments, so `_app` would arrive as an unevaluated object):

- `modules/deals/api/create-deal.yaml` — the `- - _module.var: app_name` map key under
  `_build.object.fromEntries`.
- `modules/deals/api/update-people.yaml` — same shape.
- `modules/deals/requests/get_mentionable_users.yaml` — **two** occurrences, each an argument
  to a `_build.string.concat` that is itself fed into `_build.object.fromEntries` (the deeper
  variant the design calls out for `activities`). Also fix the comment above the `$match`,
  which currently narrates "parameterised by the host `app_name`".

**Runtime reads → `_app: slug`**:

- `modules/deals/api/record-loss.yaml` — the `app_name:` field on the outcome stamp. The
  stamp _field_ keeps its stored name `app_name`; only its value changes from
  `{ _module.var: app_name }` to `{ _app: slug }`.

**Dead config to delete** (`modules/deals/components/detail_panel.yaml`):

- Two `display_key: { _module.var: app_name }` entries passed as `_ref` **vars** into the
  events module's `events-timeline` and `note-capture` components. Neither component declares
  a `display_key` `_var` — both read the events module's own `_module.var: display_key` — so
  these vars are silently ignored today. **Delete both key/value pairs**; do not migrate them.
  Verify before deleting: `grep -n '_var' modules/events/components/{events-timeline,note-capture}.yaml`
  must show no `display_key` var.

## Acceptance Criteria

- `git grep -n 'app_name' modules/deals/` returns only the stored-field name on the
  `record-loss.yaml` outcome stamp (`app_name:` as a key) — no `_module.var: app_name` reads,
  no manifest var, no stale comments.
- `modules/deals/module.lowdefy.yaml` no longer declares `app_name`.
- Build-time sites use `_build.app: slug`; the `record-loss.yaml` stamp value uses `_app: slug`.
- The two dead `display_key:` `_ref` vars in `components/detail_panel.yaml` are gone.

## Files

- `modules/deals/module.lowdefy.yaml` — modify — drop `app_name` var; sweep descriptions
- `modules/deals/api/create-deal.yaml` — modify — `_build.app: slug`
- `modules/deals/api/update-people.yaml` — modify — `_build.app: slug`
- `modules/deals/api/record-loss.yaml` — modify — `_app: slug` (stamp value)
- `modules/deals/requests/get_mentionable_users.yaml` — modify — `_build.app: slug` ×2 + comment
- `modules/deals/components/detail_panel.yaml` — modify — delete two dead `display_key` vars

## Notes

- Do not touch `apps/demo/modules/deals/vars.yaml` — the consumer side is task 7.
- `docs/deals/reference/vars.md` is generated; task 9 regenerates it.
