# Task 9: Update consumer docs and regenerate generated files

## Context

The consumer-facing docs still describe the old per-module `app_name`/`display_key` pattern.
This task rewrites them to the single-`slug` shape and the `_app`/`_build.app` operators, and
regenerates the two committed generated files (`vars.md` per module, and `llms.txt`) so they
reflect the manifest edits from tasks 2–6. Per CLAUDE.md, `docs/` is the source of truth for
consumer-observable behavior — update it to describe how the modules work now.

## Task

**`README.md`** ("using modules" example, lines ~18, ~26, ~31):

- Replace the per-module `app_name:` / `display_key: my-app` examples with the single-`slug`
  shape: one `slug:` on `lowdefy.yaml`, no per-module `app_name`. Show the `change_stamp`
  override using `app_name: { _app: slug }` (stamp field stays named `app_name`).

**`docs/shared/app-name.md`:**

- Explain `_app: slug` as the canonical source of the app slug, and `_build.app: slug` for
  arguments to `_build.*` operators.
- Document the kebab-case format constraint now enforced by Lowdefy's slug regex
  (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`).
- Replace the multi-app "pass the same value to every entry" example with the single
  root-`slug` declaration.
- Keep the "MongoDB field paths can't contain dots" rationale.
- Document `_app: name` and `_app: description` for page chrome / email templates.
- Retitle to "App slug scoping" if that reads better than "App name scoping".

**`docs/shared/change-stamps.md`:**

- Update the app-attribution override example to use `app_name: { _app: slug }` (literal →
  operator; field name unchanged).

**`docs/shared/event-display.md`:**

- Reconcile any `_module.var: app_name` reference with `_app: slug` / the `display_key` var.

**`CLAUDE.md`:**

- Verify no stray `app_name` idiom pointer remains (the removed `docs/idioms.md` is already
  migrated to `docs/shared/`). No change expected — just confirm.

**Regenerate generated files:**

- Run `pnpm docs:gen` to regenerate `docs/{activities,companies,contacts,notifications,events}/reference/vars.md`
  (reflecting removed `app_name` vars, corrected `event_display` descriptions, and the new
  `events.display_key` default) and `docs/llms.txt`. Do **not** hand-edit these.

## Acceptance Criteria

- `README.md` shows the single-`slug` shape with no per-module `app_name`.
- `docs/shared/app-name.md`, `change-stamps.md`, `event-display.md` describe `_app: slug` /
  `_build.app: slug` and no longer instruct passing `app_name` per entry.
- `pnpm docs:gen` has been run; `pnpm docs:check` passes (no drift, front-matter valid).
- No stray `app_name` idiom pointer in `CLAUDE.md`.

## Files

- `README.md` — modify — "using modules" example → single-`slug` shape
- `docs/shared/app-name.md` — modify — `_app` canonical, format constraint, `_app: name`/`description`, retitle
- `docs/shared/change-stamps.md` — modify — override example → `{ _app: slug }`
- `docs/shared/event-display.md` — modify — reconcile `app_name` reference
- `CLAUDE.md` — verify — no stray `app_name` idiom pointer
- `docs/**/reference/vars.md` — regenerate — via `pnpm docs:gen`
- `docs/llms.txt` — regenerate — via `pnpm docs:gen`

## Notes

- Depends on tasks 2–6: `vars.md` is generated from the manifests, so run `docs:gen` after
  those manifest edits land.
- The manifest is the source of truth for var schema — the `event_display` description fixes
  in tasks 5 and 6 flow into `vars.md` through `docs:gen`; do not re-edit `vars.md` by hand.
