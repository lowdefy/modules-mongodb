# `_app` operator migration

Lowdefy now ships an `_app` operator that reads app metadata (`slug`, `name`, `version`, `description`, ...) declared on the root of `lowdefy.yaml`. Today every module in this repo asks consumers to pass an `app_name` var on its own entry — the same value duplicated across six module entries, with no mechanical guarantee they stay in sync. This design replaces that pattern with the built-in operator: consumers declare `slug:` once on the app, and modules read it directly via `_app: slug`.

## Proposed change

1. Add `slug:` to `apps/demo/lowdefy.yaml` and delete `apps/demo/app_config.yaml` (its only consumer was the old `app_name:` indirection).
2. Drop the `app_name` manifest var from every module that declares it (`contacts`, `companies`, `notifications`, `user-account`, `user-admin`, `workflows`).
3. Replace all 80 occurrences of `_module.var: app_name` (across 32 files) with `_app: slug`.
4. Keep the `events` module's `display_key` var but make it optional with default `{ _app: slug }`; remove `display_key:` from demo vars files where it just mirrors the slug.
5. Update the documented `change_stamp` override pattern in `docs/idioms.md` to use `_app: slug` instead of a literal `app_name: my-app`.
6. Use `_app: name` for the demo's home page title and layout footer where the app's display name is currently hardcoded; document `_app: name` / `_app: description` as the canonical way to reference app display metadata from page chrome.
7. Update `README.md`, `docs/idioms.md`, and the workflow design docs that mention `_module.var: app_name`.

## Why now

Three forces line up:

- **Lowdefy added the operator.** `_app: slug` reads from the root `slug` field on `lowdefy.yaml`, with a build-time format check (kebab-case, `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`) that's stricter and more useful than the loose "no dots" rule we informally enforced for `app_name`. The operator runs on both client and server, which covers every site that currently reads `_module.var: app_name`. See [`lowdefy/packages/docs/operators/_app.yaml`](../../../lowdefy/packages/docs/operators/_app.yaml) for the full surface.
- **The current pattern is drift-prone.** A multi-app deployment passes `app_name: ops-app` to six module entries today (docs/idioms.md §App name). Set five and forget the sixth, and event writes silently key under the wrong app for the lifetime of the doc. Nothing in the build catches it — module vars are independent strings. One declaration on the app root eliminates the class of bug.
- **Forward reference already in the codebase.** `designs/workflows-module/parts/30-status-map-rendering/design.md` line 144 explicitly notes "Lowdefy is adding an `_app: slug` operator that will replace `_module.var: app_name` repo-wide. […] migration to `_app: slug` is tracked separately." This design is that separate track.

## Current state

### Module manifests declaring `app_name`

Six modules require `app_name` as a manifest var:

| Module | Description on the var |
|---|---|
| `contacts` | "App identifier for is_user guard and per-app access flags" |
| `companies` | "App identifier used to key event_display titles when no override is supplied" |
| `notifications` | "App identifier used to scope notifications. Matches `created.app_name`" |
| `user-account` | "App name for event metadata" |
| `user-admin` | "App name for MongoDB field paths (e.g., example-app)" |
| `workflows` | "The host app's deployment name. Filters action access via `access.{app_name}` per action" |

### Where the value is read

80 occurrences of `_module.var: app_name` across 32 files. The shapes are:

- **MongoDB filter scoping** — `created.app_name: { _module.var: app_name }` on event/notification reads (notifications/* requests, contacts/companies APIs, user-admin requests).
- **MongoDB field-path construction** — `_string.concat: ["apps.", { _module.var: app_name }, ".roles"]` in user-admin to build dot paths for per-app role writes.
- **Stamp/payload fields** — `created.app_name` on writes (contacts/companies APIs, user-account, user-admin), and an `app_name` payload key on the workflows connection.
- **Page/component vars** — passed into Nunjucks templates as the `app_name` template variable.

### Adjacent vars that are the same value

- `events.display_key` — required: true today, read in `modules/events/components/events-timeline.yaml` at four sites to project `display.{display_key}.title` off event docs. Every demo entry sets it to the same value as `app_name`. There is a real use case for divergence (an ops app rendering another app's events), so the var stays — but with `{ _app: slug }` as the default, the common case stops requiring an explicit setting.
- `events.change_stamp` (documented override) — when consumers add app-attribution to the audit stamp, the idiom currently shows a literal `app_name: my-app` baked into the change-stamp template. That literal is the same value as the slug; switching it to `_app: slug` removes the duplication.

### Adjacent vars that are NOT the same value

- `user-admin.app_title` — optional human-readable prefix for menu labels and page titles ("Modules Demo" → "Modules Demo User Admin"). Distinct from the slug; today's default is `''` (no prefix). The default changes to `{ _app: name }` so consumers get sensible prefixed labels automatically from their `lowdefy.yaml` `name:`. Apps that want unprefixed labels override with `app_title: ''`.
- `events.display_key` overrides — kept (see above), since multi-app deployments may legitimately read another app's event display.

## Build-time and runtime usage

This design assumes `_app` is evaluable at **both build time and runtime** — i.e. the operator runs during the build (resolving against the root `slug`/`name`/`description` declared in `lowdefy.yaml`) as well as on the client/server at request time. That is **not** the operator's current behaviour (the docs declare it runtime-only); making it work at build time requires a small upstream change in Lowdefy. See [open questions](#open-questions).

With that assumption, three classes of `_module.var: app_name` site all migrate cleanly to `_app: slug`:

1. **Runtime consumers** — MongoDB filters, change-stamp templates, payload fields, Nunjucks template vars. `_app` evaluates per request.
2. **Build-time consumers — `_build.*` operator arguments.** Sites like `_build.object.fromEntries` event-display key construction (companies/contacts/user-account `create`/`update` APIs) and `_build.string.concat` page-chrome titles (user-admin pages) need the slug as a literal string at build time. With `_app` evaluating at build, `_build.object.fromEntries: [[{ _app: slug }, …]]` resolves the key to `"demo"` before fromEntries runs.
3. **Build-time consumers — resolver vars.** `modules/workflows/module.lowdefy.yaml` passes `app_name: { _module.var: app_name }` into the `makeActionPages.js` resolver to enumerate `action.access?.[appName]` and emit per-action pages. Page generation is fundamentally build-time and cannot move to runtime; `_app: slug` evaluating at build is what makes this path work.

**Manifest var defaults still pass through as operator objects.** Setting `default: { _app: slug }` on `events.display_key` passes the unevaluated object into consumer YAML, where it is then resolved at the consumption site — same pattern `change_stamp` uses today with `_user: id` and `_date: now`. With `_app` available at both phases, the default resolves correctly whether the consumption site is build-time or runtime.

## Migration of `change_stamp` override

Current idiom (docs/idioms.md §Change stamps, line 49):

```yaml
- id: events
  vars:
    display_key: my-app
    change_stamp:
      timestamp: { _date: now }
      user:
        name: { _user: profile.name }
        id:   { _user: id }
      app_name: my-app   # ← literal
```

New idiom:

```yaml
- id: events
  vars:
    # display_key omitted — defaults to { _app: slug }
    change_stamp:
      timestamp: { _date: now }
      user:
        name: { _user: profile.name }
        id:   { _user: id }
      app_name: { _app: slug }   # ← reads the app slug at request time
```

`_app: slug` is valid inside the stamp because the stamp is a runtime template — every operator inside it resolves per request.

## Use of `_app: name` and `_app: description`

These don't drive any of the data model (no MongoDB filter, no scoping). They're display-only metadata. Two concrete uses in this repo:

1. **Demo home page title** — `apps/demo/pages/home.yaml` hardcodes `title: Module Demo App`. Change to `title: { _app: name }`.
2. **Demo layout footer** — `apps/demo/modules/layout/vars.yaml` hardcodes `<p>Modules Demo</p>` in the footer HTML. Change to a Nunjucks-rendered footer that pulls `_app: name`.

Beyond these, document the operator in `docs/idioms.md` (§App name) so consumers building their own pages and email templates know it exists. No module-side migrations — the modules deliberately don't compose human-readable app-name strings (that's the consumer's chrome).

`_app: description` has no obvious site to migrate today. Document it as available; don't manufacture a use case.

## Files changed

Module manifests (remove `app_name:` from `vars:`):

- `modules/contacts/module.lowdefy.yaml`
- `modules/companies/module.lowdefy.yaml`
- `modules/notifications/module.lowdefy.yaml`
- `modules/user-account/module.lowdefy.yaml`
- `modules/user-admin/module.lowdefy.yaml`
- `modules/workflows/module.lowdefy.yaml`

Events manifest (relax `display_key`):

- `modules/events/module.lowdefy.yaml` — `display_key` changes from `required: true` to `default: { _app: slug }`.

Module YAML — `_module.var: app_name` → `_app: slug` (32 files, 80 sites):

- `modules/contacts/` — 5 sites across api/update-contact, api/create-contact, pages/edit, pages/view.
- `modules/companies/` — 2 sites (api/create-company, api/update-company).
- `modules/notifications/` — 7 sites across the 6 request files and unread-count-request component.
- `modules/user-account/` — 6 sites across api/create-profile, api/update-profile, components/view_profile.
- `modules/user-admin/` — 50 sites across the 7 requests + 4 api files + pages/all.
- `modules/workflows/` — 10 sites across connections/workflow-api, api/get-*, pages/group-overview, api/stages/access_filter (and the manifest's own self-reference that disappears with the var).

Demo vars (delete `app_name:` from each):

- `apps/demo/modules/contacts/vars.yaml`
- `apps/demo/modules/companies/vars.yaml`
- `apps/demo/modules/notifications/vars.yaml`
- `apps/demo/modules/user-account/vars.yaml`
- `apps/demo/modules/user-admin/vars.yaml`
- `apps/demo/modules/workflows/vars.yaml`
- `apps/demo/modules/events/vars.yaml` — also drop `display_key` if it equals the slug.

Demo app root:

- `apps/demo/lowdefy.yaml` — add `slug: demo` and rename `name: Module Demo App` to `name: Modules Demo` so the new `app_title: { _app: name }` default reads cleanly in user-admin labels.
- `apps/demo/app_config.yaml` — delete (only key was `app_name: demo`).
- `apps/demo/pages/home.yaml` — `title: { _app: name }`.
- `apps/demo/modules/layout/vars.yaml` — footer pulls `_app: name` via Nunjucks.

Docs:

- `README.md` — replace the `app_name: my-app` examples in the "Using modules in an app" section with the new shape (single `slug:` on `lowdefy.yaml`, no per-module `app_name`). Update the `docs/idioms.md` pointer line.
- `docs/idioms.md` — rename `## App name` to `## App slug`, anchor `#app-name` to `#app-slug`. Rewrite the section: explain `_app: slug` as the canonical source, document the kebab-case format constraint, drop the per-module wiring example, keep the "MongoDB field paths can't contain dots" rationale (now enforced by Lowdefy's slug regex), and document `_app: name` / `_app: description` for chrome. Update the "Change stamps" §Overriding example to use `_app: slug`.
- `CLAUDE.md` — line 41 idiom list: `app_name` reference → `slug` / `_app: slug`, and anchor `#app-name` → `#app-slug`.

Design docs (in-flight workflow parts + concept docs) — standardise to `slug`:

The goal is one canonical term in the prose so future readers don't waste cycles reconciling `app_name` against `slug`. Within `designs/workflows-module-concept/**` and `designs/workflows-module/**` (excluding `_completed/`):

- Rename code-snippet sites: `_module.var: app_name` → `_app: slug`; manifest var declarations: drop `app_name:`.
- Rename data-model placeholders that name the slug position: `access.{app_name}` → `access.{slug}`, `status_map.{stage}.{app_name}` → `status_map.{stage}.{slug}`, `display.{app_name}` → `display.{slug}`, `apps.{app_name}.roles` → `apps.{slug}.roles`, `created.app_name` stays (that's a stored field name on event/notification docs, not a placeholder).
- Rename narrative references that are about *the value*: "the host app's `app_name`" → "the host app's slug"; "match `vars.app_name`" → "match the app slug".
- Remove the forward-looking note in `designs/workflows-module/parts/30-status-map-rendering/design.md:144`; replace with a back-reference to this design's eventual `_completed/` entry.
- `_completed/` is **not touched** (project rule: read-only history). Those designs continue to reference `app_name` and `_module.var: app_name`; that's accurate to the state at the time they shipped.

Audit list of affected files lives in the task breakdown (run during `/r:design-task`).

## Key decisions

### Remove the `app_name` manifest var rather than redirect it

Two cheaper alternatives considered:

- **Default `app_name: { _app: slug }` in each manifest.** Keeps the var declared, just gives it a default. Consumers can keep their existing vars files or remove them at leisure. Rejected: leaves a stale, redundant var on every module forever; consumers reading the manifest see two ways to spell the same thing; nothing pulls the second declaration out later.
- **Mark deprecated, accept for one release.** Var stays accepted, warning logged if set, removed in next major. Rejected: this repo is 0.x prerelease (per README §Versioning, "Breaking changes can land in any minor release"). A clean cut now is cheaper than a deprecation window for an audience that's already pinning to exact versions.

### Keep `display_key` as a manifest var

The override case is real — an ops app that renders events written by a different app's writers needs `display_key: that-other-app`. Making it optional with default `{ _app: slug }` covers the common case while preserving the escape hatch. Removing the var entirely would force a CRUD-style fork of the events module for that scenario.

### Default `user-admin.app_title` to `_app: name`

Manifest default flips from `''` to `{ _app: name }`. With a sensible `name:` on `lowdefy.yaml` (the demo's `Module Demo App` is renamed to `Modules Demo` as part of this change), labels become "Modules Demo User Admin" / "Invite Modules Demo User" out of the box — useful by default, no per-consumer wiring needed. Apps that want unprefixed labels set `app_title: ''` explicitly. Lines up with the "one correct way" principle: the recommended pattern enforced mechanically, not via docs.

### Slug format constraint is stricter than the old `app_name` constraint

Lowdefy enforces `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` on `slug`. Today the only repo-internal constraint on `app_name` is "no dots" (docs/idioms.md §Constraint: no dots). Existing slugs in use across module-using apps are kebab-case already (`demo`, `ops-app`, `my-team-app` in the workflows design examples), so no existing value collides with the new format. The build now catches malformed slugs at build time instead of letting `apps.my_app.roles`-style underscores leak into Mongo field paths.

### Standardise to "slug" in prose across in-flight and concept design docs

Half-migrating terminology (snippets only, prose left as `app_name`) leaves the next reader to reconcile two names for the same thing — a tax that recurs on every future read. The cost of one sweep now (rename `access.{app_name}` → `access.{slug}` and similar placeholders in `designs/workflows-module-concept/**` and `designs/workflows-module/parts/**` outside `_completed/`) is small relative to the lifetime confusion it removes. `_completed/` stays as historical record per the project rule.

The stored field name `created.app_name` on event/notification documents does **not** rename — it's a column on real data, and renaming would force a data migration to no benefit. The rename is purely about how design docs and module YAML reference the slug value.

### Delete `apps/demo/app_config.yaml` rather than keep it for future shared config

The file existed solely to enforce single-source-of-truth for `app_name` across the demo's per-module vars files. `_app: slug` now does that job via the framework. Keeping an empty or repurposed file invites the same drift it originally prevented — consumers stuff things in, modules start reading it, implicit cross-module coupling reappears. If genuinely shared non-slug config surfaces later, add it back then.

### Migration is breaking; do it as one PR

Touching 32 files with a mechanical find-replace is one reviewable change. Splitting per-module would force the demo app to mix old and new wiring across half-migrated builds, doubling the QA surface. The 0.x prerelease guarantee covers the consumer impact.

## Non-goals

- **No data migration.** Existing event/notification documents already store `created.app_name: "demo"` as a literal string. Nothing about those documents changes — the slug value the operator produces is the same string the old `_module.var: app_name` produced.
- **No rename of MongoDB field paths.** `created.app_name`, `apps.{slug}.roles`, `display.{slug}.title` keep their existing field names. The operator changes the *source* of the slug, not the *schema* it writes into.
- **No new operator features.** This is a consumer of `_app`, not a contribution to it. If we need additional metadata on the app (e.g., a multi-tenant org id), that's a separate design and possibly a separate operator.

## Open questions

### Lowdefy `_app` capabilities needed before this design can ship

This design depends on two upstream Lowdefy changes:

1. **`_app` must evaluate at build time** as well as runtime. Three classes of consumer in this repo (event-display key construction inside `_build.object.fromEntries`, `_build.string.concat` page-chrome titles in user-admin, and the `makeActionPages.js` resolver vars in workflows) need the slug as a string at build time.
2. **The build must fail fast when `slug:` is missing.** Today each consuming module declares `app_name: required: true`, so a missing slug fails the build. After migration, the only build-time check on `slug` is a kebab-case format check that only runs *if* set — a missing slug silently resolves to `null`, every MongoDB filter scopes to `created.app_name: null`, and writes stamp `null` into new documents. We cannot regress that guarantee.

Requirements for the Lowdefy team are drafted in [lowdefy-requirements.md](./lowdefy-requirements.md). Final operator naming (`_app` at both phases, or `_app` + `_build.app`) is for the Lowdefy team to decide. Until those changes land, this design cannot ship without falling back to half-measures (keeping a build-time `app_slug` manifest var on modules with `_build.*` consumers, which reintroduces the drift the design exists to eliminate).

## Related

- Operator reference: [`lowdefy/packages/docs/operators/_app.yaml`](../../../lowdefy/packages/docs/operators/_app.yaml).
- Existing idiom: [docs/idioms.md §App name](../../docs/idioms.md#app-name).
- Forward note that motivated this design: [designs/workflows-module/parts/30-status-map-rendering/design.md line 144](../workflows-module/parts/_rejected/30-status-map-rendering/design.md).
