# Task 12: Update repo docs — README, idioms, CLAUDE.md

## Context

The migration changes the canonical pattern from "pass `app_name:` to every module entry" to "declare `slug:` once on `lowdefy.yaml`, read with `_app: slug` everywhere". The repo's three documentation surfaces all reference the old pattern and need to be rewritten:

- `README.md` — has a "Using modules in an app" worked example that shows `app_name: my-app` on every module entry and references the `docs/idioms.md#app-name` anchor.
- `docs/idioms.md` — has an `## App name` section with the same per-module wiring example, a "no dots" constraint paragraph, and a `change_stamp` override example using `app_name: my-app`. The `## Event display` section also mentions `app_name` in narrative form.
- `CLAUDE.md` line 41 — lists `app_name` as one of the idioms and references the `#app-name` anchor.

## Task

### `README.md`

Locate the "Using modules in an app" section (around line 79–94) showing the per-module `app_name:` wiring. Rewrite the example to show:

- A single `slug: my-app` declaration on the app's `lowdefy.yaml`.
- Module entries without per-entry `app_name:` (since the manifest var no longer exists on any module).
- Update the pointer line on line 99 referencing `docs/idioms.md` — change `app_name` to `app slug` in the listed shared patterns.

### `docs/idioms.md`

1. **Rename the section.** `## App name` → `## App slug`. Update the anchor accordingly: `#app-name` → `#app-slug`.

2. **Rewrite the section body.** Replace the per-module wiring example (lines ~211–229) with:
    - A short explanation that the app slug is declared once on the root of `lowdefy.yaml` (`slug: my-app`).
    - That modules read it via `_app: slug` — no per-module wiring needed.
    - Document the kebab-case format constraint (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`) Lowdefy enforces at build time. This subsumes the old "no dots" rule (underscores are also rejected by the new regex).
    - Keep the "MongoDB field paths can't contain dots" rationale paragraph but reframe it as the reason Lowdefy's regex exists, not as a separate convention.
    - Mention `_app: name` and `_app: description` as the canonical way to reference the app's display metadata from pages, layouts, and email templates. Use the demo's home page title and layout footer (task 10) as worked examples.

3. **Update the `## Change stamps` override example** (lines ~49–64). Replace the literal `app_name: my-app` value in the change-stamp YAML with `app_name: { _app: slug }`. Drop the `display_key: my-app` line from the example (now defaults to `{ _app: slug }`).

4. **Update `## Event display`** prose references to `app_name` (lines 81, 99, 120). Where the text refers to the slug value, switch to "slug" or "`_app: slug`". Where it refers to the stored field name `display.{app_name}` on event documents, switch the placeholder to `display.{slug}` since the placeholder denotes the value of the slug, not a field name (per the design's distinction: `created.app_name` stays as a field-name reference, `display.{slug}` is a placeholder for the slug value).

5. **Update `## App name`** prose references at lines 194–207. Same rule: switch placeholder forms to `{slug}` (`apps.{slug}.roles`, `display.{slug}`, `user.app_attributes.{slug}`); leave actual stored field names alone (`created.app_name` stays).

### `CLAUDE.md`

Line 41: change `app_name` to `slug` (or `app slug`) in the inventory of idioms covered by `docs/idioms.md`, and change the anchor reference `#app-name` to `#app-slug`. Confirm no other lines in `CLAUDE.md` reference `app_name` as a module var.

## Acceptance Criteria

- `README.md` worked example uses `slug:` on `lowdefy.yaml` and shows no per-module `app_name:`.
- `docs/idioms.md` section is titled `## App slug` (anchor `#app-slug`).
- `docs/idioms.md` `## Change stamps` example uses `app_name: { _app: slug }`.
- `docs/idioms.md` documents `_app: name` and `_app: description` for chrome.
- `CLAUDE.md` line 41 references `slug` / `#app-slug` (not `app_name` / `#app-name`).
- `grep -n "app_name" README.md docs/idioms.md CLAUDE.md` only returns hits where the reference is to a stored MongoDB field name (e.g. `created.app_name`), not to a config-time concept.
- Any internal anchor links pointing to `#app-name` are updated to `#app-slug`.

## Files

- `README.md` — modify — rewrite "Using modules in an app" example; update idioms pointer.
- `docs/idioms.md` — modify — rename section + anchor; rewrite body; update change-stamp example; reframe `## Event display` and `## App name` prose with `{slug}` placeholders.
- `CLAUDE.md` — modify — update line 41 to `slug` / `#app-slug`.

## Notes

- The stored MongoDB field name on event/notification documents is and stays `created.app_name`. The rename affects placeholders and prose only, not field names — same rule as in the workflows design sweep (task 13).
- Cross-check any other markdown files in `docs/` for stale `#app-name` anchor references.
