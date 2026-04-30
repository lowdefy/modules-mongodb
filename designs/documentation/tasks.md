# Documentation Tasks

Implementation checklist for `designs/documentation/design.md`. Tick each item as it's completed.

Conventions:
- "Audit" = read existing content, find gaps, fix.
- "New" = file does not exist yet.
- "Rewrite" = file exists but needs to be replaced or restructured.

---

## Phase 1 — Manifest audit

Goal: every var (top-level and nested) in every `module.lowdefy.yaml` has a `description:`. Manifest is the source of truth before READMEs are written.

- [x] `modules/companies/module.lowdefy.yaml` — add nested descriptions for `fields.attributes`, `components.{table_columns, filters, main_slots, sidebar_slots, download_columns, contact_card_extra_fields}`, `request_stages.{filter_match, get_all_companies, selector, write}`. Remove the `# TODO` comment block.
- [x] `modules/contacts/module.lowdefy.yaml` — add nested descriptions for `fields.{show_honorific, profile, global_attributes}`, `components.*`, `request_stages.*`. Remove the `# TODO` comment block.
- [x] `modules/data-upload/module.lowdefy.yaml` — verify `tool.*` is complete; expand `tool.columns` description to spell out optional column properties.
- [x] `modules/events/module.lowdefy.yaml` — verify (likely no change; top-level only).
- [x] `modules/files/module.lowdefy.yaml` — describe `components.file_list` and mark it deprecated.
- [x] `modules/layout/module.lowdefy.yaml` — reconcile `logo.{primary, primary_light, primary_dark, icon, style}` keys and defaults with `modules/layout/README.md`. Fill nested descriptions for `header_extra.{requests, blocks}` and `auth_page.{max_width, card_style, cover_background, logo_max_width, brand_panel_background}`.
- [x] `modules/notifications/module.lowdefy.yaml` — verify (likely no change).
- [x] `modules/release-notes/module.lowdefy.yaml` — verify.
- [x] `modules/user-account/module.lowdefy.yaml` — add nested descriptions for `fields.{show_honorific, profile}`, `components.main_slots`, `request_stages.write`.
- [x] `modules/user-admin/module.lowdefy.yaml` — add nested descriptions for `fields.{show_honorific, profile, global_attributes, app_attributes}`, `components.{download_columns, table_columns, filters, main_slots, sidebar_slots, view_access_tile}`, `request_stages.{filter_match, get_all_users, write}`.

---

## Phase 2 — Root README + idioms

Goal: produce the central doc and the cross-cutting idioms reference. Both are linked from per-module READMEs in Phase 3, so they go first.

- [x] **Rewrite `README.md`** — central doc covering: what this repo is, module list with one-line descriptions and links, Mermaid dependency graph, "what to use when" section, "Using modules in an app" basics snippet linking to <https://docs.lowdefy.com/modules>, link to `docs/idioms.md`, link to `plugins/modules-mongodb-plugins/README.md`, link to demo app, versioning/release info linking to CHANGELOG.
- [x] **New `docs/idioms.md`** — single page with anchored sections:
  - [x] `#change-stamps` — `change_stamp` audit metadata template, default schema, how to consume via `_ref: { module: events, component: change_stamp }`, override pattern, why it's a runtime template.
  - [x] `#event-display` — per-app Nunjucks templates, default file shape (`{module}/defaults/event_display.yaml`), template variables, why per-app, how to extend with custom event types.
  - [x] `#slots` — `fields` / `components` / `request_stages` slot pattern, rationale, conventions per module, worked example (companies).
  - [x] `#app-name` — why apps need a name, MongoDB field path constraints (no `.`), where it appears (`user.app_attributes.{app_name}`, `created.app_name`, `display.{app_name}`), modules that require it.
  - [x] `#avatar-colors` — shared default at `modules/shared/profile/avatar_colors.yaml`, `{ from, to }` shape, deterministic color picking, how to override.
  - [x] `#secrets` — master list grouped by category (Mongo, S3 file storage, S3 sync bucket, email), which modules need each.

---

## Phase 3 — Per-module READMEs

Goal: every module has a `README.md` matching the template in `design.md` (Description / Dependencies / How to Use / Exports / Vars / Secrets / Plugins / Notes).

- [x] **New `modules/companies/README.md`**
- [x] **New `modules/contacts/README.md`**
- [x] **New `modules/data-upload/README.md`**
- [x] **New `modules/events/README.md`** (folds in existing `VARS.md`)
- [x] Delete `modules/events/VARS.md`
- [x] **New `modules/files/README.md`** (folds in existing `VARS.md`)
- [x] Delete `modules/files/VARS.md`
- [x] **Rewrite `modules/layout/README.md`** — restructure to match the new template; auth-page section either stays as a Notes section or moves into `docs/idioms.md` if it generalizes.
- [x] **New `modules/notifications/README.md`** (folds in existing `VARS.md`)
- [x] Delete `modules/notifications/VARS.md`
- [x] **New `modules/release-notes/README.md`**
- [x] **New `modules/user-account/README.md`**
- [x] **New `modules/user-admin/README.md`**

---

## Phase 4 — Plugin docs

Goal: `@lowdefy/modules-mongodb-plugins` package and each custom block have their own README.

- [x] **Define per-block README template** — likely a refinement of the existing `ContactSelector/README.md` shape (props / events / slots / examples / theme tokens). Capture in `design.md` or as a stub at the top of this section before writing the new files.
- [x] **New `plugins/modules-mongodb-plugins/README.md`** — package overview: what's in the plugin (5 blocks + 1 action), peer dependencies, install instructions, links to per-block READMEs, `FetchRequest` action documented inline.
- [x] **Rewrite (verify) `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/README.md`** — update to match the new per-block template if it diverges.
- [x] **New `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/README.md`**
- [x] **New `plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/README.md`**
- [x] **New `plugins/modules-mongodb-plugins/src/blocks/FileManager/README.md`**
- [x] **New `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/README.md`**

---

## Phase 5 — Cleanup

- [ ] Delete `temp.md` (TODO scratchpad — no longer needed).
- [ ] Update `CLAUDE.md` — add a section pointing agents at the new doc structure (`README.md`, `docs/idioms.md`, per-module READMEs, plugin README, per-block READMEs) and the rule that manifest is source of truth for var schema.
- [ ] Final pass: confirm every link across the new docs resolves (no broken `_ref:` to `docs/idioms.md` anchors, no broken module README cross-links).
