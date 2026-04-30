# Documentation Design

## Problem

The `modules-mongodb` repo ships ~10 reusable Lowdefy modules plus a plugin package, but the docs that explain how to consume them are incomplete and scattered:

- The repo `README.md` is a single line (`# modules`).
- Three modules have a `VARS.md` (`events`, `files`, `notifications`); the rest don't.
- `layout` has a `README.md` mixing module overview, var reference, and an auth-page how-to.
- Every other module is documented only inside its `module.lowdefy.yaml` manifest.
- Manifest var descriptions are inconsistent: top-level vars usually have `description:`, but **nested var properties mostly don't** — the `companies` and `contacts` manifests carry literal `# TODO: add a description: to every nested property below` markers, and the same gap exists across most other modules.
- There is no central document explaining the module set as a whole, the dependency graph between modules, or the cross-cutting idioms (`change_stamp`, `app_name`, `fields/components/request_stages` slots, `event_display`).

A consumer trying to wire these modules into a new app today has to read the manifests, read scattered guides under `.claude/guides/`, and read the demo app to figure out which vars are required, which modules depend on which, and what each export does.

The goal is to design a documentation surface that:

1. Gives a consumer a single starting page that explains the module set, the dependency graph, the shared idioms, and where to go next.
2. Gives each module its own complete reference doc (overview, dependencies, exports, vars including nested vars, secrets, examples, gotchas).
3. Treats the manifest as the source of truth for var schema (type, default, required) **and** description, and brings the manifests up to date so they actually carry that information.
4. Stays as plain Markdown in the repo for now, but doesn't paint us into a corner if we later render it as a Lowdefy doc app or publish it to a static site.

## Solution

Three layers of documentation, all Markdown, with the module manifest as the canonical source for var metadata:

```
modules-mongodb/
  README.md                          ← central doc: module set, dep graph,
                                       when-to-use, idioms link, basics
  docs/
    idioms.md                        ← all shared idioms (change_stamp,
                                       event_display, fields/components/
                                       request_stages, app_name,
                                       avatar_colors, secrets) on one page
  modules/
    {name}/
      README.md                      ← per-module deep dive (replaces VARS.md)
      module.lowdefy.yaml            ← canonical var schema + descriptions
  plugins/
    modules-mongodb-plugins/
      README.md                      ← plugin package overview
      src/
        blocks/{Block}/README.md     ← per-block doc (1 already exists for
                                        ContactSelector — same pattern)
        actions/                     ← single FetchRequest action documented
                                        in the package README for now
```

Existing per-module `VARS.md` files are folded into the new `README.md` and deleted. The existing `modules/layout/README.md` is restructured to match the new template; the auth-page how-to inside it moves into `docs/cross-cutting/` or stays as a section under the Layout README, whichever reads better.

## Key Decisions

### 1. Manifest is the source of truth for var schema and descriptions

Var metadata (`type`, `default`, `required`, `enum`, `description`) lives in `module.lowdefy.yaml` because:

- It's already there — adding `description:` to nested properties is just completing what's already started.
- It travels with the code — a module published via `github:lowdefy/...@v1.2.0` carries its var schema at the same git tag as its implementation.
- It's machine-readable — a future renderer (Lowdefy doc app, static site, or simply a generator script) can read manifests and produce var tables. We don't want to maintain two copies and let them drift.
- It's consumer-readable — Lowdefy tooling (build errors, future LSP, etc.) can surface the description when a var is misused.

The per-module `README.md` then has a "Vars" section that **restates** the same descriptions in narrative form. For now we accept some duplication; the rule is "manifest first, README must match." In a follow-up we can add a build-time check or a generator that derives the README var table from the manifest. We're not building that generator in this design — just keeping the door open by keeping the data in the manifest.

This means the audit work in this design is two-pass:

- Pass A — fill in every missing nested var description in every manifest.
- Pass B — write the per-module README using those descriptions.

### 2. The repo `README.md` is the central doc — no separate `Overview.md`

The root `README.md` is the single landing page. GitHub renders it at the repo home, so consumers land on the central doc by default. No extra click, no two files telling overlapping stories.

`README.md` covers:

- What this repo is (a set of reusable Lowdefy + MongoDB modules) and who it's for.
- The list of modules with one-line descriptions and links to per-module READMEs.
- A dependency graph (Mermaid, with ASCII fallback if needed).
- A "what to use when" section — pick the right module for the job.
- A short "Using modules in an app" section — bare-basics snippet (the `modules:` block, a single module entry with `id` / `source` / `vars`) plus a link to the canonical Lowdefy module docs at <https://docs.lowdefy.com/modules>. We do **not** re-document the module system — that lives upstream.
- A pointer to `docs/idioms.md` for the shared patterns.
- A pointer to `plugins/modules-mongodb-plugins/README.md` for the plugin package.
- A pointer to the demo app as a worked example.
- Versioning and release info (link to CHANGELOG).

**Why one file, not two:** for a repo of this size the central doc isn't long enough to warrant splitting. Two files for the same purpose is exactly the kind of duplication that drifts. If `README.md` ever gets unwieldy, splitting later is cheap — move sections into a new `docs/Overview.md` and add a link.

### 3. Per-module READMEs follow a fixed template

Every module's `README.md` has the same sections in the same order, so consumers always know where to look:

```
# {Module Name}

One-paragraph description.

## Dependencies
## How to Use
## Exports
  ### Pages
  ### Components
  ### API Endpoints
  ### Connections
  ### Menus
## Vars
## Secrets
## Plugins
## Examples
## Notes / Gotchas (optional)
```

The "Vars" section uses a consistent format: a top-level bullet list for simple vars, a nested heading or table for vars with nested properties. Vars that take an `_ref` to a default file (e.g. `event_display`, `change_stamp`, `avatar_colors`) reference the cross-cutting doc that explains that idiom rather than repeating the explanation per module.

### 4. All cross-cutting idioms live in a single `docs/idioms.md`

Several patterns repeat across modules:

- `change_stamp` — used by events, files, companies, contacts, user-account, user-admin
- `event_display` — used by every module that logs events
- `app_name` — used by contacts, user-account, user-admin, notifications for app scoping
- `fields` / `components` / `request_stages` slot pattern — used by companies, contacts, user-admin, user-account
- `avatar_colors` — used by contacts, user-admin, user-account
- Secrets envelope (`MONGODB_URI`, S3 keys) — used by everything

Earlier draft split these into 6 files under `docs/cross-cutting/`. Collapsing into a single `docs/idioms.md` keeps the file count down, makes the docs easier to skim end-to-end (one Cmd-F covers everything), and matches how short these explanations actually are — most are a few paragraphs. Per-module READMEs still link to specific anchors (`docs/idioms.md#change-stamp`, etc.) so navigation isn't worse.

If `idioms.md` ever grows past ~500 lines we revisit and split. Until then, one page.

### 5. The plugin package gets its own README plus per-block READMEs

`@lowdefy/modules-mongodb-plugins` is a peer artifact — modules consume it as a regular Lowdefy plugin, and it's published to npm independently. It gets the same treatment as the modules:

- `plugins/modules-mongodb-plugins/README.md` — package overview. Lists what the plugin contains (5 blocks: ContactSelector, DataDescriptions, EventsTimeline, FileManager, SmartDescriptions; 1 action: FetchRequest), peer dependencies, install instructions, and links to per-block READMEs.
- `plugins/modules-mongodb-plugins/src/blocks/{Block}/README.md` — one per block. Covers what the block does, props, events, slots, examples. **One already exists** at `src/blocks/ContactSelector/README.md` — the rest follow the same pattern.
- The single `FetchRequest` action gets a section in the package README rather than its own folder + README. If we add more actions, split out then.

Per-block READMEs live next to the source for the same reason module READMEs do: they travel with the code, and a developer browsing `src/blocks/FileManager/` sees the docs immediately.

**Naming:** the existing `ContactSelector/README.md` sets the convention — README, not `documentation.md`. GitHub auto-renders README at the directory listing, which is the main reason for the choice.

### 6. Format is plain Markdown, with two soft constraints

- **Front-matter is forbidden** for now — we don't have a renderer that uses it, and YAML front-matter inside the repo confuses some Markdown viewers.
- **Diagrams are ASCII or Mermaid** — both render on GitHub. ASCII for small graphs (5–10 nodes), Mermaid for the full dependency graph.

This keeps the docs viewable wherever Markdown renders (GitHub, IDEs, Obsidian — there's already a `.obsidian/` folder in the repo) and easy to migrate into another rendering surface later without a format conversion step.

### 7. Place per-module READMEs next to the code, not under `docs/`

`modules/{name}/README.md` co-locates the module reference with the module itself. Reasons:

- A consumer pulling `github:lowdefy/modules-mongodb/modules/user-admin@v1.2.0` gets the README at the same git ref. If the module is removed from the repo, its docs go with it.
- GitHub renders `README.md` automatically when you browse to `modules/user-admin/`, which makes the directory listing serve as an index.
- It mirrors what `modules/layout/README.md` already does — we're standardizing an existing pattern, not inventing one.

`docs/` then contains only repo-level docs (overview + cross-cutting + plugin), which is cleaner.

## Doc Inventory

The full list of files this design produces. Counts assume the current set of 10 modules.

### Top-level (2 files)

| File | Purpose |
|---|---|
| `README.md` | Central doc — module set, dependency graph, when-to-use, idioms link, bare-basics consumer snippet linking to <https://docs.lowdefy.com/modules>, plugin link, demo link. Replaces the current 1-line README. |
| `docs/idioms.md` | All cross-cutting idioms on one page (anchored sections). |

### Cross-cutting idioms (1 file: `docs/idioms.md`)

A single page with one section per idiom. Per-module READMEs link to specific anchors.

| Section | Covers | Used by |
|---|---|---|
| Change stamps | The `change_stamp` audit metadata template, where it lives (events module), how to opt out, default schema. | events, files, companies, contacts, user-account, user-admin |
| Event display | `event_display` per-app templates, default file shape, how event types map to titles. | every module that logs events |
| Fields / components / request_stages slots | The slot pattern for extending list / detail / edit pages. | companies, contacts, user-admin, user-account |
| App name scoping | `app_name` scoping pattern — why it exists, where it appears in MongoDB field paths, multi-app deployments. | contacts, user-account, user-admin, notifications |
| Avatar colors | Shared `avatar_colors` defaults at `modules/shared/profile/avatar_colors.yaml`, how to override. | contacts, user-admin, user-account |
| Secrets | Master list of secret names by category (Mongo, S3 file storage, S3 sync bucket, email) and which modules need each. | all modules |

### Plugin docs (5 files, plus 1 already exists)

| File | Purpose |
|---|---|
| `plugins/modules-mongodb-plugins/README.md` | Package overview — what's in the plugin, peer deps, install, list of blocks/actions with links. |
| `src/blocks/ContactSelector/README.md` | Already exists — verify it matches the new template, update if needed. |
| `src/blocks/DataDescriptions/README.md` | New — per-block doc. |
| `src/blocks/EventsTimeline/README.md` | New — per-block doc. |
| `src/blocks/FileManager/README.md` | New — per-block doc. |
| `src/blocks/SmartDescriptions/README.md` | New — per-block doc. |

The single `FetchRequest` action is documented in the package README. No per-action README until there are more actions.

### Per-module READMEs (10 files, one per module)

For each module under `modules/{name}/`, create `README.md` following the fixed template. Modules: `companies`, `contacts`, `data-upload`, `events`, `files`, `layout`, `notifications`, `release-notes`, `user-account`, `user-admin`.

The `shared/` directory is **not** a module — it holds resources referenced by other modules (`avatar_colors.yaml`, `event_types.yaml`, layout components, etc.). It does not get a README of its own; what's in it is documented via the cross-cutting docs and via the modules that reference it.

### Manifest updates (10 files)

For each module's `module.lowdefy.yaml`, audit and complete:

- Every top-level var has `description:` (mostly already done — verify and fill gaps).
- Every nested property under an object var has `description:`. This is the bulk of the work and includes:
  - `companies`: `fields.attributes`, `components.*`, `request_stages.*` (≈12 nested props)
  - `contacts`: `fields.show_honorific`, `fields.profile`, `fields.global_attributes`, `components.*`, `request_stages.*` (≈12 nested props)
  - `data-upload`: `tool.*` (already described — verify completeness, mainly `columns` shape)
  - `events`: top-level only, already described
  - `files`: `components.file_list` (deprecated — describe and mark deprecated)
  - `layout`: `logo.*` (description present but inconsistent — `primary` vs `primary_light` mismatch with README), `header_extra.*`, `auth_page.*` (≈8 nested props)
  - `user-account`: `fields.*`, `components.*`, `request_stages.*` (≈6 nested props)
  - `user-admin`: `fields.*`, `components.*`, `request_stages.*` (≈11 nested props)
- Resolve any current README/manifest discrepancies (e.g. layout's `logo.primary` / `logo.primary_light` / defaults).

The `data-upload`'s `tool.columns` is currently described as "[{field, headerName}]" — extend the description to spell out optional column properties if any are supported.

## Per-Module README Template

Used unchanged for every module. Sections marked **(omit if empty)** are left out when the module doesn't have that export type.

````markdown
# {Module Name}

One-paragraph description: what this module does, what problem it solves.

## Dependencies

| Module | Why |
|---|---|
| layout | Page wrapper |
| events | Audit logging and `change_stamp` |

(Pulled from manifest `dependencies:`.)

## How to Use

Minimal `lowdefy.yaml` snippet showing the module entry, required vars, and any non-obvious wiring (e.g. `dependencies:` remap, `connections:` remap). One concrete worked example, not a kitchen-sink config.

## Exports

### Pages **(omit if empty)**

| ID | Description | Path |
|---|---|---|
| companies | Company list | `/{entryId}/companies` |

### Components **(omit if empty)**

Each exported component with a 1–2 sentence description, the vars it takes, and a small `_ref:` example.

### API Endpoints **(omit if empty)**

Each endpoint with what it does and what it expects in the payload.

### Connections **(omit if empty)**

Each connection ID with what collection / bucket it points at.

### Menus **(omit if empty)**

Each menu ID with what links it contains.

## Vars

Narrative reference for every var. Top-level vars are H3, nested properties are bullet lists or H4. Each var includes type, default, required-or-not, and description. Cross-references to `docs/cross-cutting/*` for shared idioms (`change_stamp`, `event_display`, `app_name`, `avatar_colors`, etc.) instead of re-explaining them.

## Secrets

| Name | Used for |
|---|---|
| MONGODB_URI | MongoDB connection |

## Plugins

Lowdefy plugins required by this module (from manifest `plugins:`).

## Notes **(omit if empty)**

Caveats, gotchas, version-specific behavior, deprecated features.
````

## Source-of-Truth Strategy

**Manifest is canonical for var schema.** The README "Vars" section restates the manifest descriptions in narrative form, but the manifest is what consumers and tooling look at. If the two ever drift, the manifest wins.

We accept the duplication for two reasons:

1. The README needs more than the manifest provides — examples, cross-references, idiom explanations — so it can't be a pure auto-generated table.
2. We want READMEs viewable on GitHub today, without a build step.

**Soft enforcement:** add a quick `scripts/check-vars-docs.mjs` (separate task, optional) that walks every manifest, collects var paths, and warns if a var path is missing from the README. This catches drift but isn't a hard gate. Out of scope for this design — listed as an open question.

## `docs/idioms.md` Outline

Single file, six sections. Anchors used by per-module READMEs are listed in parentheses.

### Change stamps (`#change-stamps`)

- What a change stamp is and why we use one.
- The default schema (`{ timestamp, user: { name, id } }`) from `events/defaults/change_stamp.yaml`.
- How to consume: `_ref: { module: events, component: change_stamp }`.
- How to override the var on a per-module-instance basis (e.g. add app context).
- Why it's a runtime template (operators evaluate per request, not at build).

### Event display (`#event-display`)

- What `event_display` is — per-app Nunjucks templates that turn `log-events` documents into human-readable titles.
- The default file shape (e.g. `companies/defaults/event_display.yaml`).
- Variables available to templates (`user`, `target`, etc.).
- Why it's per-app (multi-tenant rendering — same event collection, different titles per app).
- How to extend with custom event types.

### Fields, components, request_stages slots (`#slots`)

- The pattern: `fields` (form blocks), `components` (page slot overrides), `request_stages` (pipeline overrides).
- Rationale: configuration over code-fork — consumers extend pages without copying YAML.
- Conventions: required nested keys per module, what each slot can contain.
- One worked example (probably `companies`).

### App name scoping (`#app-name`)

- Why apps need a name — multi-app deployments share user-contacts and event collections; documents are scoped by `app_name`.
- Where it shows up (`user.app_attributes.{app_name}`, `created.app_name`, `display.{app_name}`).
- Constraint: no `.` allowed (MongoDB field path collision).
- Modules that require it: `notifications`, `user-account`, `user-admin`, `contacts`.

### Avatar colors (`#avatar-colors`)

- Where the shared default lives (`modules/shared/profile/avatar_colors.yaml`).
- Shape: array of `{ from, to }` gradient pairs.
- How modules pick a color deterministically (hash of user id → color index).
- How to override — write your own file and point the var at it.

### Secrets (`#secrets`)

- Master list of every secret name used by every module.
- Grouped by category (Mongo, S3 file storage, S3 sync bucket, email).
- Notes on which modules need which.

## Files Changed

### New files

10 module READMEs + 1 idioms doc + 1 plugin package README + 4 per-block READMEs = 16 new Markdown files. Root `README.md` and `plugins/modules-mongodb-plugins/.../ContactSelector/README.md` are rewritten in place.

| Path | Purpose |
|---|---|
| `docs/idioms.md` | All cross-cutting idioms on one page |
| `modules/companies/README.md` | Per-module |
| `modules/contacts/README.md` | Per-module |
| `modules/data-upload/README.md` | Per-module |
| `modules/events/README.md` | Per-module (replaces VARS.md) |
| `modules/files/README.md` | Per-module (replaces VARS.md) |
| `modules/notifications/README.md` | Per-module (replaces VARS.md) |
| `modules/release-notes/README.md` | Per-module |
| `modules/user-account/README.md` | Per-module |
| `modules/user-admin/README.md` | Per-module |
| `plugins/modules-mongodb-plugins/README.md` | Plugin package overview |
| `plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/README.md` | Per-block |
| `plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/README.md` | Per-block |
| `plugins/modules-mongodb-plugins/src/blocks/FileManager/README.md` | Per-block |
| `plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/README.md` | Per-block |

### Modified files

| Path | Change |
|---|---|
| `README.md` | Rewrite as central doc (module set, dep graph, when-to-use, idioms link, basics) |
| `modules/layout/README.md` | Restructure to match the new template |
| `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/README.md` | Verify it matches the new per-block template, update if needed |
| `modules/companies/module.lowdefy.yaml` | Add nested var descriptions, remove TODO comment |
| `modules/contacts/module.lowdefy.yaml` | Add nested var descriptions, remove TODO comment |
| `modules/data-upload/module.lowdefy.yaml` | Verify and fill any gaps |
| `modules/events/module.lowdefy.yaml` | Verify (likely no change) |
| `modules/files/module.lowdefy.yaml` | Describe `components.file_list`, mark deprecated |
| `modules/layout/module.lowdefy.yaml` | Reconcile `logo.*` keys with README, fill nested descriptions |
| `modules/notifications/module.lowdefy.yaml` | Verify (likely no change) |
| `modules/release-notes/module.lowdefy.yaml` | Verify |
| `modules/user-account/module.lowdefy.yaml` | Add nested var descriptions |
| `modules/user-admin/module.lowdefy.yaml` | Add nested var descriptions |

### Deleted files

| Path | Why |
|---|---|
| `modules/events/VARS.md` | Folded into `modules/events/README.md` |
| `modules/files/VARS.md` | Folded into `modules/files/README.md` |
| `modules/notifications/VARS.md` | Folded into `modules/notifications/README.md` |
| `temp.md` | Already a TODO scratchpad — kill before final |

## Phasing

Suggested implementation order, since the full set is sizeable:

**Phase 1 — Manifest audit.** Fill every missing nested var description across all 10 modules. Reconcile layout's `logo` keys. This is contained, mechanical, and unlocks accurate per-module READMEs in Phase 3.

**Phase 2 — Root README + idioms.** Write the new root `README.md` (central doc) and `docs/idioms.md`. Both are referenced by per-module READMEs, so writing them first lets module READMEs link instead of duplicating.

**Phase 3 — Per-module READMEs.** Write the 10 module READMEs using the template. Delete the 3 old `VARS.md` files. Restructure `modules/layout/README.md`.

**Phase 4 — Plugin docs.** Write `plugins/modules-mongodb-plugins/README.md` (package overview) plus the 4 missing per-block READMEs. Update the existing `ContactSelector/README.md` to match the new per-block template if needed.

**Phase 5 — Cleanup.** Delete `temp.md`. Add the doc structure to `CLAUDE.md` so agents know where docs live.

## Open Questions

1. **Generator script for var tables?** A small `scripts/check-vars-docs.mjs` that walks manifests and warns on missing descriptions or missing README mentions would prevent drift, but it's an extra moving part. Defer until we see drift in practice.
2. **Mermaid vs ASCII for the dependency graph?** Mermaid renders on GitHub but not in every IDE. ASCII renders everywhere but is uglier. Lean Mermaid since GitHub is the primary surface, but accept ASCII fallback.
3. **Do the per-module READMEs link to the demo app?** Each module is exercised in `apps/demo` with a real `vars.yaml`. Linking would help consumers see a working config. Probably yes — add a "See it in action" link in each README's "How to Use" section.
4. **Per-block README template.** The 5 plugin blocks need a fixed template (props / events / slots / examples / theme tokens). Worth defining before Phase 4 starts. Likely close to the existing `ContactSelector/README.md` shape.

## Non-Goals

- Building a static site or Lowdefy doc app. Markdown only for now.
- Auto-generation of READMEs from manifests. Possible later, not now.
- Documenting internal implementation details. The audience is module *consumers*, not module authors. (A separate `CONTRIBUTING.md` could cover module-author concerns later.)
- Versioned docs across multiple module releases. The repo's git history is the version history; docs at `v1.2.0` are whatever's in the tag.
