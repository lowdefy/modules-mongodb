# `_app` operator migration

Lowdefy now ships an `_app` operator that reads app metadata (`slug`, `name`, `version`, `description`, ...) declared on the root of `lowdefy.yaml`. Today every module in this repo asks consumers to pass an `app_name` var on its own entry — the same value duplicated across six module entries, with no mechanical guarantee they stay in sync. This design replaces that pattern with the built-in operator: consumers declare `slug:` once on the app, and modules read it directly via `_app: slug`.

## Proposed change

1. Add `slug:` to `apps/demo/lowdefy.yaml` and delete `apps/demo/app_config.yaml` (its only consumer was the old `app_name:` indirection).
2. Drop the `app_name` manifest var from every module that declares it (`contacts`, `companies`, `notifications`, `user-account`, `user-admin`, `workflows`).
3. Replace every `_module.var: app_name` occurrence (~72 across ~30 files) with `_app: slug` — or `_build.app: slug` at the handful of sites inside `_build.*` operators (see [§Build-time and runtime usage](#build-time-and-runtime-usage)).
4. Keep the `events` module's `display_key` var but make it optional with default `{ _app: slug }`; remove `display_key:` from demo vars files where it just mirrors the slug.
5. Update the documented `change_stamp` override pattern in `docs/idioms.md` to use `_app: slug` instead of a literal `app_name: my-app`.
6. Use `_app: name` for the demo's home page title and layout footer where the app's display name is currently hardcoded; document `_app: name` / `_app: description` as the canonical way to reference app display metadata from page chrome.
7. Update `README.md`, `docs/idioms.md`, and the workflow design docs that mention `_module.var: app_name`.
8. **Rename the `app_name` identifier to `slug` repo-wide** — not just the YAML var, but the `WorkflowAPI` connection property, the workflows resolver vars, and every internal variable / parameter / JSDoc / test that names the slug value `app_name`/`appName` in `modules/workflows/resolvers/` and `plugins/modules-mongodb-plugins/`. The single exception is the **stored** field `created.app_name` (and any literal stored key), which stays — see [Non-goals](#non-goals) and [the rename decision](#rename-the-app_name-identifier-to-slug-in-code).

## Why now

Three forces line up:

- **Lowdefy shipped the operator** (as of `lowdefy@0.0.0-experimental-20260611`, the version this repo pins). `_app: slug` reads from the root `slug` field on `lowdefy.yaml`, with a format check (kebab-case, `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`) that's stricter and more useful than the loose "no dots" rule we informally enforced for `app_name`. The operator runs on **client, server, and at build time**, covering every site that currently reads `_module.var: app_name`. A companion `_build.app` form is used inside `_build.*` operator arguments (see [§Build-time and runtime usage](#build-time-and-runtime-usage)). `slug` is **required when referenced in string form** — `_app: slug` fails the build if `slug` is not declared, which restores the fail-fast guarantee the per-module `required: true` gave us. See [`lowdefy/packages/docs/operators/_app.yaml`](../../../lowdefy/packages/docs/operators/_app.yaml) for the full surface.
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

~72 occurrences of `_module.var: app_name` across ~30 files (counts drift as the codebase moves — re-grep at implementation time). The shapes are:

- **MongoDB filter scoping** — `created.app_name: { _module.var: app_name }` on event/notification reads (notifications/* requests, contacts/companies APIs, user-admin requests).
- **MongoDB field-path construction** — `_string.concat: ["apps.", { _module.var: app_name }, ".roles"]` in user-admin to build dot paths for per-app role writes.
- **Stamp/payload fields** — `created.app_name` on writes (contacts/companies APIs, user-account, user-admin), and an `app_name` payload key on the workflows connection.
- **Page/component vars** — passed into Nunjucks templates as the `app_name` template variable.

### Adjacent vars that are the same value

- `events.display_key` — required: true today, read in `modules/events/components/events-timeline.yaml` at four sites to project `display.{display_key}.title` off event docs. Every demo entry sets it to the same value as `app_name`. There is a real use case for divergence (an ops app rendering another app's events), so the var stays — but with `{ _app: slug }` as the default, the common case stops requiring an explicit setting.
- `events.change_stamp` (documented override) — when consumers add app-attribution to the audit stamp, the idiom currently shows a literal `app_name: my-app` baked into the change-stamp template. That literal is the same value as the slug; switching it to `_app: slug` removes the duplication.

### Adjacent vars that are NOT the same value

- `user-admin.app_title` — optional human-readable prefix for menu labels and page titles ("Modules Demo" → "Modules Demo User Admin"). Distinct from the slug; today's default is `''` (no prefix). The default changes to `{ _build.app: name }` (build-time form — `app_title` is consumed inside `_build.string.concat`; see [the key decision](#default-user-adminapp_title-to-_buildapp-name)) so consumers get sensible prefixed labels automatically from their `lowdefy.yaml` `name:`. Apps that want unprefixed labels override with `app_title: ''`.
- `events.display_key` overrides — kept (see above), since multi-app deployments may legitimately read another app's event display.

## Build-time and runtime usage

Lowdefy ships **two forms** of the operator, and which one to write depends on the position:

- **`_app: slug`** — use in every ordinary position: runtime sites (MongoDB filters, change-stamp templates, payload fields, Nunjucks vars) *and* plain build positions. `_app` evaluates at runtime and is also baked into the build artifact, so it is correct "at any level".
- **`_build.app: slug`** — use **only when the operator sits directly inside a `_build.*` operator's arguments**. There, `_app` would still be an unevaluated object when the surrounding `_build.*` operator runs; `_build.app` resolves to a literal string in time to be consumed.

**The rule:** runtime and ordinary build positions → `_app: slug`. An argument to a `_build.*` operator → `_build.app: slug`.

Three classes of `_module.var: app_name` site exist; only the third and part of the second need `_build.app`:

1. **Runtime consumers (`_app: slug`)** — MongoDB filters, change-stamp templates, payload fields, Nunjucks template vars, server-evaluated connection props. The large majority of sites (~60 of ~72).
2. **`_build.object.fromEntries` map keys (`_build.app: slug`)** — event-display key construction in `companies`/`contacts`/`user-account` `create`/`update` APIs and `user-admin` `update-user`/`invite-user`/`resend-invite`. The `- - { _build.app: slug }` pair is fed straight into `_build.object.fromEntries`, which needs a literal string key at build time. (Note: the user-admin per-app field paths — `_string.concat: ["apps.", …, ".roles"]` — are **runtime** `_string.concat`, so they take `_app: slug`, not `_build.app`.)
3. **Resolver vars (`_build.app: slug`)** — `modules/workflows/module.lowdefy.yaml` passes `app_name` into the `makeActionPages.js` resolver, which consumes it at build time to enumerate `action.access?.[slug]` and emit per-action pages. An unevaluated `{ _app: slug }` object passes the resolver's `if (!appName)` guard (a truthy object) and then `access?.[ {…} ]` is `undefined` → every per-action page silently drops. `_build.app: slug` is required here. (Verify with `ldf:b` — the resolver is a `_ref` build construct, not a literal `_build.*` operator; confirm the form that resolves to a string.)

**Manifest var defaults: prefer `_build.app` when the var is consumed at build-time sites.** A var default is a *single* value substituted into every consumption site, so it cannot be `_app` at some sites and `_build.app` at others. If any consumer is inside a `_build.*` operator, the default must be `{ _build.app: … }` — it bakes a literal at build, which is then safe at runtime sites too (it is already a plain string by then). A default of `{ _app: … }` left as a runtime object breaks any `_build.*` consumer. This is why `events.display_key` (runtime-only consumers) can default to `{ _app: slug }`, but `user-admin.app_title` (consumed inside `_build.string.concat`) must default to `{ _build.app: name }` — see [Key decisions](#default-user-adminapp_title-to-_buildapp-name). It also confirms why we *remove* `app_name` rather than redirect it to a default: per-occurrence replacement lets each site pick `_app` vs `_build.app`, which one default cannot.

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

Module YAML — `_module.var: app_name` → `_app: slug` (runtime) or `_build.app: slug` (build-time). Counts below are indicative as of this writing (~72 sites); the implementation task re-greps each module rather than relying on a frozen count, since the codebase moves. **The build-time sites that take `_build.app: slug` are exactly:**

- The `- - _module.var: app_name` key nested under `_build.object.fromEntries` in `companies/api/{create,update}-company.yaml`, `contacts/api/{create,update}-contact.yaml`, `user-account/api/{create,update}-profile.yaml`, and `user-admin/api/{update-user,invite-user,resend-invite}.yaml` (9 sites).
- `workflows/module.lowdefy.yaml` resolver vars (`makeActionPages.js`).

**Everything else is `_app: slug`:**

- `modules/contacts/` — api/{create,update}-contact (the runtime stamp/payload sites), pages/edit, pages/view.
- `modules/companies/` — api/{create,update}-company (runtime stamp sites).
- `modules/notifications/` — the 6 request files + unread-count-request component. Each declares `payload: { app_name: { _module.var: app_name } }` and filters `created.app_name: { _payload: app_name }`; swap the payload default to `{ _app: slug }`.
- `modules/user-account/` — api/{create,update}-profile (runtime stamp/payload), components/view_profile, requests/get_users_for_selector.
- `modules/user-admin/` — requests (`get_user`, `get_all_users`, `get_user_excel_data`, `check_invite_email`) `$match` filters; api `{update-user,invite-user,resend-invite}` runtime `_string.concat` field paths and stamp/payload fields; pages/all.
- `modules/workflows/` — connections/workflow-api (server-evaluated connection prop) and any runtime request filters. (The manifest's own `app_name:` var declaration disappears with the var.)

Identifier rename `app_name`/`appName` → `slug` (code, not stored data — see [the decision](#rename-the-app_name-identifier-to-slug-in-code)):

- `modules/workflows/connections/workflow-api.yaml` — connection property key `app_name:` → `slug:` (lockstep with the plugin schema below; the value also migrates to `{ _app: slug }`).
- `modules/workflows/module.lowdefy.yaml` — resolver vars key `app_name:` → `slug:` (value → `{ _build.app: slug }`).
- `modules/workflows/resolvers/makeActionPages.js` + `makeActionPages.test.js` + `resolvers/README.md` — `vars.app_name`/`appName` → `slug`.
- `modules/workflows/resolvers/makeWorkflowsConfig.js` — `appName` loop var and `{app_name}` error-message placeholders → `slug`. `modules/workflows/README.md`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — connection property `app_name` → `slug`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/**` handlers + `connections/shared/**` (phases, `render/resolveActionAccess.js`) — `connection.app_name`, internal `app_name`/`appName` vars, params, JSDoc → `slug` (~27 source files).
- All affected `*.test.js` under the plugin — `app_name:` fixtures → `slug:`.
- `plugins/modules-mongodb-plugins/package.json` — version bump (breaking schema change); rebuild `dist/` (not git-tracked) via the `build` script. Update the `plugins:` version constraint in `modules/workflows/module.lowdefy.yaml`.

Demo vars (delete `app_name:` from each):

- `apps/demo/modules/contacts/vars.yaml`
- `apps/demo/modules/companies/vars.yaml`
- `apps/demo/modules/notifications/vars.yaml`
- `apps/demo/modules/user-account/vars.yaml`
- `apps/demo/modules/user-admin/vars.yaml`
- `apps/demo/modules/workflows/vars.yaml`
- `apps/demo/modules/events/vars.yaml` — this file reads the slug via `_ref: { path: app_config.yaml, key: app_name }` in **two** places, not `_module.var: app_name`: rewrite `change_stamp.app_name` to `{ _app: slug }` (runtime template), and drop `display_key` entirely (it equals the slug, now covered by the new default). Leave `change_stamp.version` (a `_ref` into `package.json`) untouched — out of scope.

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

### Default `user-admin.app_title` to `_build.app: name`

Manifest default flips from `''` to `{ _build.app: name }`. With a sensible `name:` on `lowdefy.yaml` (the demo's `Module Demo App` is renamed to `Modules Demo` as part of this change), labels become "Modules Demo User Admin" / "Invite Modules Demo User" out of the box — useful by default, no per-consumer wiring needed. Apps that want unprefixed labels set `app_title: ''` explicitly. Lines up with the "one correct way" principle: the recommended pattern enforced mechanically, not via docs.

**Why `_build.app: name`, not `_app: name`.** `app_title` is consumed at **both** build-time sites (`_build.string.concat`/`_build.string.trim`/`_build.ne` in `pages/{new,edit,view,all}.yaml` breadcrumbs, `menu.yaml`, `components/excel_download.yaml`) and runtime sites (the `_nunjucks` page title in `pages/new.yaml`, which receives `app_title` as a template var). A single var default of `{ _app: name }` would arrive as an unevaluated operator object at the `_build.string.concat` sites and break the build (or stringify to `[object Object] User Admin`). `{ _build.app: name }` resolves to a literal at build, which is then safe at the runtime Nunjucks site too. See [§Build-time and runtime usage](#build-time-and-runtime-usage) for the general rule on mixed-consumption var defaults.

### Slug format constraint is stricter than the old `app_name` constraint

Lowdefy enforces `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` on `slug`. Today the only repo-internal constraint on `app_name` is "no dots" (docs/idioms.md §Constraint: no dots). Existing slugs in use across module-using apps are kebab-case already (`demo`, `ops-app`, `my-team-app` in the workflows design examples), so no existing value collides with the new format. The build now catches malformed slugs at build time instead of letting `apps.my_app.roles`-style underscores leak into Mongo field paths.

### Standardise to "slug" in prose across in-flight and concept design docs

Half-migrating terminology (snippets only, prose left as `app_name`) leaves the next reader to reconcile two names for the same thing — a tax that recurs on every future read. The cost of one sweep now (rename `access.{app_name}` → `access.{slug}` and similar placeholders in `designs/workflows-module-concept/**` and `designs/workflows-module/parts/**` outside `_completed/`) is small relative to the lifetime confusion it removes. `_completed/` stays as historical record per the project rule.

The stored field name `created.app_name` on event/notification documents does **not** rename — it's a column on real data, and renaming would force a data migration to no benefit. The rename is purely about how design docs and module YAML reference the slug value.

### Rename the `app_name` identifier to `slug` in code

The same "one canonical term" argument that applies to prose (above) applies to code identifiers. Leaving the workflows subsystem calling the slug `app_name` while the rest of the repo says `slug` is exactly the two-names-for-one-thing tax, and it's worse in code because the reader can't tell from the name whether `app_name` means *the slug value* or *the stored `created.app_name` field*. So we rename the identifier wherever it denotes the slug value:

- **The `WorkflowAPI` connection property.** `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` declares an `app_name` property; the engine reads `connection.app_name` to index `action[slug]`, `access[slug]`, `user.apps[slug].roles`, and the per-app event-display block. Rename the property to `slug` and update every consumer. This is the one interface change — it must land **lockstep** with the `workflow-api.yaml` rename (key `app_name:` → `slug:`), so both live in the same task.
- **The workflows resolver vars and internals.** `makeActionPages.js` (`vars.app_name`, the `appName` local), `makeWorkflowsConfig.js` (the `appName` loop variable over the access map, and error-message `{app_name}` placeholders), and their tests + READMEs.
- **The plugin engine internals.** ~27 source files use `app_name`/`appName` as a local variable, function parameter, or JSDoc name (handlers, shared phases, `resolveActionAccess`). All cosmetic — they hold the slug value. Rename to `slug`, plus the `.test.js` fixtures that pass `app_name:`.

Scope and cost: ~110 occurrences across the workflows resolvers and the plugin package, plus a plugin **version bump** (the connection-schema property rename is breaking; bump the minor per the 0.x policy and update the `version:` constraint in `modules/workflows/module.lowdefy.yaml`'s `plugins:` list). `dist/` is a build artifact (not git-tracked) — rebuild with the plugin's `build` script; don't hand-edit it. The rename does **not** touch the stored `created.app_name` field or any literal stored key (see [Non-goals](#non-goals)).

### Delete `apps/demo/app_config.yaml` rather than keep it for future shared config

The file existed solely to enforce single-source-of-truth for `app_name` across the demo's per-module vars files. `_app: slug` now does that job via the framework. Keeping an empty or repurposed file invites the same drift it originally prevented — consumers stuff things in, modules start reading it, implicit cross-module coupling reappears. If genuinely shared non-slug config surfaces later, add it back then.

### Migration is breaking; do it as one PR

Touching ~30 files with a mostly-mechanical find-replace (only the dozen `_build.app` sites need care) is one reviewable change. Splitting per-module would force the demo app to mix old and new wiring across half-migrated builds, doubling the QA surface. The 0.x prerelease guarantee covers the consumer impact.

## Non-goals

- **No data migration.** Existing event/notification documents already store `created.app_name: "demo"` as a literal string. Nothing about those documents changes — the slug value the operator produces is the same string the old `_module.var: app_name` produced.
- **No rename of MongoDB field paths or stored keys.** `created.app_name` keeps its name; `apps.{slug}.roles`, `display.{slug}.title`, `action.{slug}.message`, `access.{slug}` keep their existing *stored* keys (the slug value, not the literal `app_name`). The [`app_name` → `slug` identifier rename](#rename-the-app_name-identifier-to-slug-in-code) is strictly a code/config-naming change — it renames variables, properties, and YAML keys that *hold* or *name the position of* the slug, never the bytes on disk. Concretely: `const app_name = connection.app_name` → `const slug = connection.slug` is in scope; the document field `created.app_name` is not.
- **No new operator features.** This is a consumer of `_app`, not a contribution to it. If we need additional metadata on the app (e.g., a multi-tenant org id), that's a separate design and possibly a separate operator.

## Upstream status — resolved

Both Lowdefy capabilities this design originally depended on have shipped in the pinned version (`lowdefy@0.0.0-experimental-20260611`). The requirements drafted in [lowdefy-requirements.md](./lowdefy-requirements.md) are kept as a record of what was asked; below is how each was answered (per [`_app.yaml`](../../../lowdefy/packages/docs/operators/_app.yaml)):

1. **`_app` evaluates at build time** as well as on client and server (`env: Client, Server and Build`), resolving against the root `slug`/`name`/`description`/`version`/`license`/`lowdefyVersion`. The Lowdefy team chose the **`_app` + `_build.app`** naming: `_app: slug` everywhere, `_build.app: slug` inside `_build.*` operator arguments. This design adopts that split (see [§Build-time and runtime usage](#build-time-and-runtime-usage)).
2. **The build fails fast when `slug:` is missing.** `slug` is "required when referenced in string form" — `_app: slug` (or `_build.app: slug`) fails the build if `slug` is not declared in `lowdefy.yaml`. This restores the fail-fast guarantee the per-module `app_name: required: true` gave us, now from a single declaration. The object form `_app: { key: slug, default: … }` is the deliberate escape hatch for sites that tolerate an unset slug; this repo doesn't need it.

There are no remaining upstream blockers. The migration is implementable against the pinned version today.

One site to confirm at implementation time (with `ldf:b`, not a design blocker): whether the `makeActionPages.js` resolver vars resolve correctly as `_build.app: slug` — the resolver is a `_ref` build construct rather than a literal `_build.*` operator, so confirm the form that delivers a string. See [§Build-time and runtime usage](#build-time-and-runtime-usage) point 3.

## Related

- Operator reference: [`lowdefy/packages/docs/operators/_app.yaml`](../../../lowdefy/packages/docs/operators/_app.yaml).
- Existing idiom: [docs/idioms.md §App name](../../docs/idioms.md#app-name).
- Forward note that motivated this design: [designs/workflows-module/parts/30-status-map-rendering/design.md line 144](../workflows-module/parts/_rejected/30-status-map-rendering/design.md).
