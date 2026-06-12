# Task 6: Update repo docs — README, idioms, CLAUDE.md

## Context

The migration changes the canonical pattern from "pass `app_name:` to every module entry" to "declare `slug:` once on `lowdefy.yaml`, read with `_app: slug` (or `_build.app: slug` inside `_build.*` operators) everywhere". Three documentation surfaces reference the old pattern:

- `README.md` — "Using modules in an app" worked example shows `app_name: my-app` on every module entry and references the `docs/idioms.md#app-name` anchor.
- `docs/idioms.md` — `## App name` section with per-module wiring, a "no dots" constraint, and a `change_stamp` override example using `app_name: my-app`; `## Event display` mentions `app_name` in prose.
- `CLAUDE.md` line 41 — lists `app_name` as an idiom and references the `#app-name` anchor.

## Task

### `README.md`

Rewrite the "Using modules in an app" example to show a single `slug: my-app` on the app's `lowdefy.yaml` and module entries **without** per-entry `app_name:`. Update the idioms pointer line: `app_name` → `app slug`.

### `docs/idioms.md`

1. **Rename the section** `## App name` → `## App slug`; anchor `#app-name` → `#app-slug`.

2. **Rewrite the body:**
   - App slug is declared once on the root of `lowdefy.yaml` (`slug: my-app`); modules read it via `_app: slug` — no per-module wiring.
   - Document the build-time/runtime split: **`_app: slug` in ordinary positions; `_build.app: slug` when the value is an argument to a `_build.*` operator** (e.g. a `_build.object.fromEntries` map key). This is the single most useful thing for a consumer authoring their own pages to know.
   - Document that `slug` is **required when referenced** — a missing `slug:` fails the build (this is the fail-fast guarantee, now from one declaration).
   - Document the kebab-case format constraint (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`), which subsumes the old "no dots" rule (underscores also rejected). Keep the "MongoDB field paths can't contain dots" rationale, reframed as *why* the regex exists.
   - Mention `_app: name` / `_app: description` for display metadata in pages, layouts, email templates. Use the demo home title and layout footer (Task 5) as worked examples.

3. **Update the `## Change stamps` override example:** literal `app_name: my-app` → `app_name: { _app: slug }`; drop the `display_key: my-app` line (now defaults to `{ _app: slug }`).

4. **Update `## Event display` and `## App name` prose:** switch slug-value placeholders to `{slug}` (`apps.{slug}.roles`, `display.{slug}`, `user.app_attributes.{slug}`); leave stored field names (`created.app_name`) untouched.

### `CLAUDE.md`

Line 41: `app_name` → `slug` (or `app slug`); anchor `#app-name` → `#app-slug`. Confirm no other lines reference `app_name` as a module var.

## Acceptance Criteria

- `README.md` example uses `slug:` on `lowdefy.yaml`, no per-module `app_name:`.
- `docs/idioms.md` section is `## App slug` (anchor `#app-slug`), documents the `_app` vs `_build.app` rule, the required-when-referenced guarantee, the kebab-case constraint, and `_app: name`/`_app: description`.
- `docs/idioms.md` `## Change stamps` example uses `app_name: { _app: slug }`.
- `CLAUDE.md` line 41 references `slug` / `#app-slug`.
- `grep -n "app_name" README.md docs/idioms.md CLAUDE.md` returns only stored-field-name hits (e.g. `created.app_name`).
- Internal `#app-name` anchor links updated to `#app-slug`.

## Files

- `README.md` — modify.
- `docs/idioms.md` — modify — rename section + anchor; rewrite body; update examples; reframe prose placeholders.
- `CLAUDE.md` — modify — line 41 → `slug` / `#app-slug`.

## Notes

- Stored field name `created.app_name` stays — the rename affects placeholders and prose only.
- Cross-check other `docs/` markdown for stale `#app-name` anchors.
