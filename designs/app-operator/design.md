# `_app` operator migration

Lowdefy ships an `_app` operator that reads app metadata (`slug`, `name`, `version`, `description`, ...) declared on the root of `lowdefy.yaml`. Today the modules in this repo ask consumers to pass an `app_name` var on each module entry — the same value duplicated across every scoping module, with no mechanical guarantee they stay in sync. This design replaces that pattern with the built-in operator: consumers declare `slug:` once on the app, and modules read it directly via `_app: slug`.

> **Scope.**
>
> - **`user-account` and `user-admin` are out of scope** — they don't use `app_name`. On the BetterAuth auth engine one module instance serves one pinned organization (org = app), so there is no per-app scoping to migrate.
> - **`activities` is in scope** — it declares `app_name` like the other scoping modules.
>
> Treat every file list, count, and path in this doc as indicative. **Re-grep at implementation time** (`git grep '_module.var: app_name'`, `git grep 'app_name'`) — the codebase moves and frozen inventories drift.

## Proposed change

1. Ensure the app root declares `slug:` (the demo already has `slug: demo`), and remove the `app_config.yaml` single-source-of-truth file once nothing reads it. Its only remaining consumer is the demo's `events` vars (`display_key` and `change_stamp.app_name`, both via `_ref`), which migrate to the operator.
2. Drop the `app_name` manifest var from every module that declares it. As of this writing that is **`activities`, `companies`, `contacts`, `notifications`, `workflows`** — re-grep the manifests rather than trusting this list.
3. Replace every `_module.var: app_name` read with `_app: slug` — or `_build.app: slug` at the handful of sites inside `_build.*` operators (see [§Build-time and runtime usage](#build-time-and-runtime-usage)).
4. Keep the `events` module's `display_key` var but make it optional with default `{ _app: slug }`; drop `display_key:` from demo/consumer vars files where it just mirrors the slug.
5. Update the shared docs that describe the pattern (`docs/shared/app-name.md`, `docs/shared/change-stamps.md`, `docs/shared/event-display.md`) and the `README.md` "using modules" example to use the single-`slug` shape and `_app: slug`.
6. Use `_app: name` for page chrome that hardcodes the app's display name (home-page title, layout footer), and document `_app: name` / `_app: description` as the canonical way to reference app display metadata from chrome.
7. **Rename the `app_name` identifier to `slug` in the workflows subsystem code** — not just the YAML var, but the `WorkflowAPI` connection property, the workflows resolver vars, and every internal variable / parameter / JSDoc / test that names the slug value `app_name`/`appName` in `modules/workflows/resolvers/` and `plugins/modules-mongodb-plugins/`. The single exception is the **stored** field `created.app_name` (and any literal stored key), which stays — see [Non-goals](#non-goals) and [the rename decision](#rename-the-app_name-identifier-to-slug-in-code).

## Why now

Two forces line up:

- **Lowdefy shipped the operator.** `_app: slug` reads from the root `slug` field on `lowdefy.yaml`, with a format check (kebab-case, `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`) that's stricter and more useful than the loose "no dots" rule we informally enforced for `app_name`. The operator runs on **client, server, and at build time**, covering every site that currently reads `_module.var: app_name`. A companion `_build.app` form is used inside `_build.*` operator arguments (see [§Build-time and runtime usage](#build-time-and-runtime-usage)). `slug` is **required when referenced in string form** — `_app: slug` fails the build if `slug` is not declared, which restores the fail-fast guarantee the per-module `required: true` gave us.
- **The current pattern is drift-prone.** A multi-app deployment passes the same `app_name` value to several module entries today. Set most and forget one, and event/notification writes silently key under the wrong app for the lifetime of the doc. Nothing in the build catches it — module vars are independent strings. One declaration on the app root eliminates the class of bug.

## Current state

### Modules declaring `app_name`

The scoping modules require `app_name` as a manifest var. Confirm the live set with `git grep -l 'app_name:' modules/*/module.lowdefy.yaml`; at this writing:

| Module          | Role of the value                                                          |
| --------------- | -------------------------------------------------------------------------- |
| `activities`    | Keys `event_display` titles when no override is supplied                   |
| `companies`     | Keys `event_display` titles when no override is supplied                   |
| `contacts`      | Keys `event_display` titles; scopes contact reads                          |
| `notifications` | Scopes notifications; matches `created.app_name`                           |
| `workflows`     | Filters action access via `access.{app_name}`; keys per-app action display |

`user-account` and `user-admin` are **not** in this list (BetterAuth rebuild — see the status note). `events` is not either: it scopes display via `display_key`, not `app_name`.

### Where the value is read

A few dozen `_module.var: app_name` sites across the scoping modules (re-grep for the current count). The shapes are:

- **MongoDB filter scoping** — `created.app_name: { _module.var: app_name }` on event/notification reads.
- **Stamp/payload fields** — `created.app_name` on writes, and an `app_name` payload key on the workflows connection.
- **Build-time display-key construction** — `_build.object.fromEntries` map keys in the `create`/`update` (and similar) APIs of the scoping modules.
- **Page/component vars** — passed into Nunjucks templates as the `app_name` template variable.

### How the value keys stored data

The slug value participates in several stored field paths. These **keep their stored names** (no data migration — see [Non-goals](#non-goals)); only the code/config that _references_ the position changes:

- `created.app_name` on event and notification documents (the stored field name itself stays `app_name`).
- `user.app_attributes.{slug}` on user documents (per-app profile fields / access flags).
- `{slug}.title` at the **top level** of event documents (per-app pre-rendered titles; see `docs/shared/event-display.md`).
- `access.{slug}`, `action.{slug}.message`, `action.{slug}.links` on workflow action documents.

### Adjacent vars that are the same value

- `events.display_key` — required today, read where the events timeline projects the per-app title off event docs. Consumers set it to the same value as `app_name`. There is a real use case for divergence (an ops app rendering another app's events), so the var stays — but with `{ _app: slug }` as the default, the common case stops requiring an explicit setting.
- `events.change_stamp` (documented override) — when consumers add app-attribution to the audit stamp, the idiom in `docs/shared/change-stamps.md` bakes a literal `app_name: my-app` into the change-stamp template. That literal is the same value as the slug; switching it to `_app: slug` removes the duplication.

### Adjacent vars that are NOT the same value

- `user-admin.app_title` — optional human-readable display _prefix_ for menu labels and page titles (default `""`). This is the app's **display name**, not its slug, so it's out of the core `app_name → slug` migration. It's a candidate to default from `_app: name` instead — see [the key decision](#optional-default-user-adminapp_title-from-_app-name).
- `events.display_key` overrides — kept (see above), since multi-app deployments may legitimately read another app's event display.

## Build-time and runtime usage

Lowdefy ships **two forms** of the operator, and which one to write depends on the position:

- **`_app: slug`** — use in every ordinary position: runtime sites (MongoDB filters, change-stamp templates, payload fields, Nunjucks vars) _and_ plain build positions. `_app` evaluates at runtime and is also baked into the build artifact, so it is correct "at any level".
- **`_build.app: slug`** — use **only when the operator sits directly inside a `_build.*` operator's arguments**. There, `_app` would still be an unevaluated object when the surrounding `_build.*` operator runs; `_build.app` resolves to a literal string in time to be consumed.

**The rule:** runtime and ordinary build positions → `_app: slug`. An argument to a `_build.*` operator → `_build.app: slug`.

Three classes of `_module.var: app_name` site exist; only the build-time ones need `_build.app`:

1. **Runtime consumers (`_app: slug`)** — MongoDB filters, change-stamp templates, payload fields, Nunjucks template vars, server-evaluated connection props. The large majority of sites.
2. **`_build.object.fromEntries` map keys (`_build.app: slug`)** — event-display key construction in the scoping modules' write APIs. The `- - { _build.app: slug }` pair is fed straight into `_build.object.fromEntries`, which needs a literal string key at build time.
3. **Resolver vars (`_build.app: slug`)** — `modules/workflows/module.lowdefy.yaml` passes the slug into the `makeActionPages.js` resolver, which consumes it at build time to enumerate `action.access?.[slug]` and emit per-action pages. An unevaluated `{ _app: slug }` object would pass the resolver's `if (!appName)` guard (a truthy object) and then `access?.[{…}]` is `undefined` → every per-action page silently drops. `_build.app: slug` is required here. As cheap insurance, harden the resolver guard to reject _non-strings_ (`typeof slug !== "string" || !slug`), not just falsy — so if the form ever delivers an unevaluated object, the build fails loudly rather than silently emitting zero action pages. (Confirm the resolver-var form with `ldf:b` — the resolver is a `_ref` build construct, not a literal `_build.*` operator.)

**Manifest var defaults: prefer `_build.app` when the var is consumed at any build-time site.** A var default is a _single_ value substituted into every consumption site, so it cannot be `_app` at some sites and `_build.app` at others. If any consumer is inside a `_build.*` operator, the default must be `{ _build.app: … }` — it bakes a literal at build, which is then safe at runtime sites too (it is already a plain string by then). A default of `{ _app: … }` left as a runtime object breaks any `_build.*` consumer. This is why `events.display_key` (runtime-only consumers) can default to `{ _app: slug }`. It also confirms why we _remove_ `app_name` rather than redirect it to a default: per-occurrence replacement lets each site pick `_app` vs `_build.app`, which one default cannot.

## Migration of the `change_stamp` override

The `docs/shared/change-stamps.md` idiom shows extending the stamp with an app-attribution field baked in as a literal:

```yaml
- id: events
  vars:
    display_key: my-app
    change_stamp:
      timestamp: { _date: now }
      user:
        name: { _user: profile.name }
        id: { _user: id }
      app_name: my-app # ← literal
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
        id: { _user: id }
      app_name: { _app: slug } # ← reads the app slug at request time
```

`_app: slug` is valid inside the stamp because the stamp is a runtime template — every operator inside it resolves per request. Note the stamp _field_ stays named `app_name` (it's a stored field); only the _value_ moves from a literal to the operator.

## Use of `_app: name` and `_app: description`

These don't drive any of the data model (no MongoDB filter, no scoping). They're display-only metadata. Concrete uses in this repo:

1. **Demo home-page title** — where a page hardcodes the app's display name in its `title`, change to `title: { _app: name }`.
2. **Demo layout footer** — where the footer HTML hardcodes the app name, render it from `_app: name` (via Nunjucks).

Beyond these, document the operator in `docs/shared/app-name.md` so consumers building their own pages and email templates know it exists. No module-side migrations — the modules deliberately don't compose human-readable app-name strings (that's the consumer's chrome).

`_app: description` has no obvious site to migrate today. Document it as available; don't manufacture a use case.

## Scope of changes

Organized by category rather than a frozen file inventory — **re-grep each category at implementation time.**

**Module manifests** — remove `app_name:` from `vars:` in each scoping module (`activities`, `companies`, `contacts`, `notifications`, `workflows`). Relax `events.display_key` from `required: true` to `default: { _app: slug }`.

**Module YAML** — `_module.var: app_name` → `_app: slug` (runtime) or `_build.app: slug` (build-time). The build-time sites are exactly:

- The `- - _module.var: app_name` key nested under `_build.object.fromEntries` in the scoping modules' write APIs (`activities`, `companies`, `contacts` `create`/`update`-style endpoints; re-grep `git grep -l _build.object.fromEntries modules/`).
- The `workflows` manifest resolver vars (`makeActionPages.js`).

Everything else is `_app: slug`: MongoDB `$match`/filter scoping in the notifications requests and contacts requests, runtime stamp/payload fields, the notifications `payload:` defaults (each request declares `payload: { app_name: { _module.var: app_name } }` and filters `created.app_name: { _payload: app_name }` — swap the payload default to `{ _app: slug }`), Nunjucks template vars, and the workflows connection's server-evaluated props.

**Identifier rename `app_name`/`appName` → `slug`** (code/config, not stored data — see [the decision](#rename-the-app_name-identifier-to-slug-in-code)):

- `modules/workflows/connections/workflow-api.yaml` — connection property key `app_name:` → `slug:` (lockstep with the plugin schema; the value also migrates to `{ _app: slug }`).
- `modules/workflows/module.lowdefy.yaml` — resolver vars key `app_name:` → `slug:` (value → `{ _build.app: slug }`).
- `modules/workflows/resolvers/` — `makeActionPages.js`, `makeWorkflowsConfig.js`, related resolvers, their `*.test.js`, and `README.md`: `vars.app_name`/`appName` locals and `{app_name}` error-message placeholders → `slug`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — connection property `app_name` → `slug`, and update the consumer-facing `description` strings that still narrate the old wiring.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/**` handlers + `connections/shared/**` — `connection.app_name`, internal `app_name`/`appName` vars, params, JSDoc → `slug`, plus the `*.test.js` fixtures that pass `app_name:`.
- `plugins/modules-mongodb-plugins/package.json` — bump the version `0.14.1 → 0.15.0` (breaking schema change → minor bump per the 0.x policy; the package is `@lowdefy/modules-mongodb-plugins`), and rebuild `dist/` (a build artifact, not git-tracked) via the `build` script. Update the `plugins:` version constraint in `modules/workflows/module.lowdefy.yaml` from `^0.14.1` to `^0.15.0`. No app `package.json` pins the plugin directly (the demo uses `workspace:*`; `apps/workflows-test/package.json` does not list it), so no app-level pin needs bumping.

**Consumer/demo vars** — delete `app_name:` from each scoping module's demo vars file. For the demo `events` vars, rewrite `change_stamp.app_name` to `{ _app: slug }` (runtime template) and drop `display_key` entirely (it equals the slug, now covered by the new default). Leave `change_stamp.version` (a `_ref` into `package.json`) untouched — out of scope.

**Demo app root** — `slug:` is already declared. Delete `app_config.yaml` once its last reader (the demo `events` vars above) is migrated. Migrate the home-page title and layout footer to `_app: name` (see above).

**Second app (`apps/workflows-test/`)** — this app also mounts in-scope modules (`events`, `notifications`, `workflows`, and companies/contacts) and feeds them `app_name` via its own `app_config.yaml` (`app_name: test`). It runs in CI e2e (the `workflows-test-e2e` job), so it must migrate in the same PR or its build breaks (`_app: slug` is required-when-referenced; the hardened `makeActionPages` guard fails loudly on an absent slug). Concretely:

- Add `slug: test` to `apps/workflows-test/lowdefy.yaml` (it declares only `name:` today).
- Drop the three inline `app_name:` entry vars in `apps/workflows-test/modules.yaml` (companies/contacts/notifications entries reading `app_config.yaml` → `app_name`) — the modules no longer declare the var.
- Drop `app_name:` from `modules/notifications/vars.yaml` and `modules/workflows/vars.yaml`, and drop `display_key:` from `modules/events/vars.yaml` (it now defaults to `{ _app: slug }`).
- Delete `apps/workflows-test/app_config.yaml` once nothing reads it.
- Treat it as a **build-verification target alongside the demo** — `ldf:b` must pass for both apps.

**Docs:**

- `README.md` — replace the per-module `app_name:`/`display_key:` examples in the "using modules" section with the single-`slug` shape (one `slug:` on `lowdefy.yaml`, no per-module `app_name`).
- `docs/shared/app-name.md` — explain `_app: slug` as the canonical source, document the kebab-case format constraint (now enforced by Lowdefy's slug regex), replace the multi-app "pass the same value to every entry" example with the single-declaration shape, keep the "MongoDB field paths can't contain dots" rationale, and document `_app: name` / `_app: description` for chrome. Retitle if "App name scoping" reads better as "App slug scoping".
- `docs/shared/change-stamps.md` — update the override example to use `_app: slug`.
- `docs/shared/event-display.md` — reconcile any `_module.var: app_name` reference with the operator.
- `CLAUDE.md` — no change needed for the removed `docs/idioms.md` (already migrated to `docs/shared/`); verify no stray `app_name` idiom pointer remains.

**Design docs** (in-flight workflow parts + concept docs) — standardise prose to `slug` so future readers don't reconcile two names. Within `designs/workflows-module-concept/**` and `designs/workflows-module/**` (excluding `_completed/` and `_rejected/`, which are read-only history):

- Rename code-snippet sites (`_module.var: app_name` → `_app: slug`; drop `app_name:` manifest declarations).
- Rename data-model _placeholders_ that name the slug position: `access.{app_name}` → `access.{slug}`, `display.{app_name}` → `display.{slug}`, `user.app_attributes.{app_name}` → `user.app_attributes.{slug}`, etc. **`created.app_name` stays** (stored field name, not a placeholder).
- Rename narrative references to _the value_: "the host app's `app_name`" → "the host app's slug".

## Key decisions

### Remove the `app_name` manifest var rather than redirect it

Two cheaper alternatives considered:

- **Default `app_name: { _app: slug }` in each manifest.** Keeps the var declared, just gives it a default. Rejected: leaves a stale, redundant var on every module forever; consumers reading the manifest see two ways to spell the same thing; nothing pulls the second declaration out later. (It also can't be a single default — some sites need `_build.app`; see [§Build-time and runtime usage](#build-time-and-runtime-usage).)
- **Mark deprecated, accept for one release.** Rejected: this repo is 0.x prerelease (breaking changes can land in any minor release). A clean cut now is cheaper than a deprecation window for an audience that's already pinning to exact versions.

### Keep `display_key` as a manifest var

The override case is real — an ops app that renders events written by a different app's writers needs `display_key: that-other-app`. Making it optional with default `{ _app: slug }` covers the common case while preserving the escape hatch. Removing the var entirely would force a fork of the events module for that scenario.

### Optional: default `user-admin.app_title` from `_app: name`

`app_title` is the display-name _prefix_ for user-admin labels (default `""`), not the slug — so it's independent of the core migration. There's a "one correct way" case for defaulting it from the app's display name (`_app: name`) so labels read "Modules Demo User Admin" out of the box, with `app_title: ''` as the explicit opt-out.

**Before adopting this, verify the current consumption sites** (`git grep app_title modules/user-admin/`) and pick the default form per [§Build-time and runtime usage](#build-time-and-runtime-usage): if any consumer sits inside a `_build.*` operator, the default must be `{ _build.app: name }` (a `{ _app: name }` default would arrive as an unevaluated object and break the build); if all consumers are runtime, `{ _app: name }` is fine. This is a nice-to-have, not a blocker for the `app_name → slug` migration — it can ship separately.

### Slug format constraint is stricter than the old `app_name` constraint

Lowdefy enforces `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` on `slug`. The only repo-internal constraint on `app_name` was "no dots" (so it wouldn't leak into MongoDB field paths as nested navigation). Existing slugs in use are kebab-case already (`demo`, `ops-app`, and the `my-team-app`-style examples in the workflows designs), so no existing value collides with the new format. The build now catches malformed slugs at build time instead of letting underscores/dots leak into stored field paths.

### Standardise to "slug" in prose across in-flight and concept design docs

Half-migrating terminology (snippets only, prose left as `app_name`) leaves the next reader to reconcile two names for the same thing — a tax that recurs on every future read. One sweep now is small relative to the lifetime confusion it removes. `_completed/` and `_rejected/` stay as historical record per the project rule.

The stored field name `created.app_name` does **not** rename — it's a field on real data, and renaming would force a data migration to no benefit. The rename is purely about how design docs and module YAML reference the slug value.

### Rename the `app_name` identifier to `slug` in code

The same "one canonical term" argument that applies to prose applies to code identifiers. Leaving the workflows subsystem calling the slug `app_name` while the rest of the repo says `slug` is exactly the two-names-for-one-thing tax, and it's worse in code because the reader can't tell from the name whether `app_name` means _the slug value_ or _the stored `created.app_name` field_. So rename the identifier wherever it denotes the slug value:

- **The `WorkflowAPI` connection property.** The plugin schema declares an `app_name` property; the engine reads `connection.app_name` to index `action[slug]`, `access[slug]`, `user.app_attributes[slug]`, and the per-app event-display block. Rename the property to `slug` and update every consumer. This interface change must land **lockstep** with the `workflow-api.yaml` rename, so both live in the same task.
- **The workflows resolver vars and internals** — `makeActionPages.js`, `makeWorkflowsConfig.js`, related resolvers, their tests + READMEs.
- **The plugin engine internals** — the source files that use `app_name`/`appName` as a local variable, parameter, or JSDoc name (handlers, shared phases, access resolution). All cosmetic — they hold the slug value.

Cost: on the order of a hundred occurrences across the workflows resolvers and the plugin package, plus a plugin **version bump** (the connection-schema property rename is breaking; bump per the 0.x policy and update the `plugins:` constraint in the workflows manifest). `dist/` is a build artifact — rebuild with the plugin's `build` script; don't hand-edit it. The rename does **not** touch the stored `created.app_name` field or any literal stored key (see [Non-goals](#non-goals)).

### Delete `app_config.yaml` rather than keep it for future shared config

The file existed solely to enforce single-source-of-truth for `app_name` across the demo's per-module vars files. `_app: slug` now does that job via the framework. Keeping an empty or repurposed file invites the same drift it originally prevented — consumers stuff things in, modules start reading it, implicit cross-module coupling reappears. If genuinely shared non-slug config surfaces later, add it back then.

### Migration is breaking; do it as one PR

The change is a mostly-mechanical find-replace (only the dozen-ish `_build.app` sites and the workflows rename need care) plus a plugin bump — one reviewable change. Splitting per-module would force the demo app to mix old and new wiring across half-migrated builds, doubling the QA surface. The 0.x prerelease guarantee covers the consumer impact.

## Non-goals

- **No data migration.** Existing event/notification documents already store `created.app_name` as a literal string. Nothing about those documents changes — the slug value the operator produces is the same string the old `_module.var: app_name` produced.
- **No rename of MongoDB field paths or stored keys.** `created.app_name` keeps its name; `user.app_attributes.{slug}`, `{slug}.title`, `action.{slug}.message`, `access.{slug}` keep their existing _stored_ keys (the slug value, not the literal `app_name`). The [identifier rename](#rename-the-app_name-identifier-to-slug-in-code) is strictly a code/config-naming change — it renames variables, properties, and YAML keys that _hold_ or _name the position of_ the slug, never the bytes on disk.
- **No `user-account` / `user-admin` migration.** They dropped `app_name` in the BetterAuth rebuild (see the status note) — there is nothing to migrate there.
- **No new operator features.** This is a consumer of `_app`, not a contribution to it. If we need additional metadata on the app (e.g., a multi-tenant org id), that's a separate design.

## Upstream status — resolved

Both Lowdefy capabilities this design originally depended on have shipped in the pinned experimental `lowdefy` version. The requirements drafted in [lowdefy-requirements.md](./lowdefy-requirements.md) are kept as a record of what was asked; below is how each was answered:

1. **`_app` evaluates at build time** as well as on client and server (`env: Client, Server and Build`), resolving against the root `slug`/`name`/`description`/`version`/`license`/`lowdefyVersion`. The Lowdefy team chose the **`_app` + `_build.app`** naming: `_app: slug` everywhere, `_build.app: slug` inside `_build.*` operator arguments. This design adopts that split (see [§Build-time and runtime usage](#build-time-and-runtime-usage)).
2. **The build fails fast when `slug:` is missing.** `slug` is "required when referenced in string form" — `_app: slug` (or `_build.app: slug`) fails the build if `slug` is not declared. This restores the fail-fast guarantee the per-module `required: true` gave us, from a single declaration. The object form `_app: { key: slug, default: … }` is the deliberate escape hatch for sites that tolerate an unset slug; this repo doesn't need it.

There are no remaining upstream blockers. One site to confirm at implementation time (with `ldf:b`, not a design blocker): whether the `makeActionPages.js` resolver vars resolve correctly as `_build.app: slug` — the resolver is a `_ref` build construct rather than a literal `_build.*` operator.

## Related

- Operator reference: [`lowdefy/packages/docs/operators/_app.yaml`](../../../lowdefy/packages/docs/operators/_app.yaml).
- Shared idioms: [`docs/shared/app-name.md`](../../docs/shared/app-name.md), [`docs/shared/change-stamps.md`](../../docs/shared/change-stamps.md), [`docs/shared/event-display.md`](../../docs/shared/event-display.md).
  </content>
  </invoke>
