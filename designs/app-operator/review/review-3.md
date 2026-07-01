# Review 3 — Missed `app_config.yaml` consumer (auth adapter); resolver fail-fast; version/doc drift

Context: this design has been twice-reviewed and updated to the shipped `_app` + `_build.app` split. Review 3 verifies the _current_ design + task set against the tree at `lowdefy@0.0.0-experimental-20260611102401`. The two-form operator description (§Build-time and runtime usage) checks out against `lowdefy/packages/docs/operators/_app.yaml`, and the ~72-site count, per-module breakdown, and ~27 plugin-source rename files all match a fresh grep. The findings below are new.

## Blocking

### 1. The demo's auth adapter reads `app_config.yaml` — the design's deletion plan misses it, and it's the one slug site that scopes auth

> **Resolved.** Added the `MultiAppMongoDBAdapter` `appName` site to the design (step 1 + §Files changed) and to Task 01, rewritten to `{ _build.app: slug }` per the finding's rationale (build-time literal reproducing the `_ref`-with-`key`; auth-adapter init context is not a verified runtime-`_app` site). The property key `appName:` stays (external plugin schema). Placed in Task 01 — same file as the new `slug:` — so the adapter is migrated before Task 05's deletion; Task 05's zero-results grep note updated to confirm all `app_config.yaml` readers (adapter, six module vars, two events reads) are accounted for. Confirmed via grep this is the only surviving `app_config.yaml`/`appName` read (the six module-var `_ref`s are deleted with their `app_name:` blocks, not redirected to slug).

The design's step 1 (line 7) and §Files changed (line 171) both assert `app_config.yaml`'s "only consumer was the old `app_name:` indirection," and enumerate exactly: the six demo module `vars.yaml` files, plus the two `_ref`s in `apps/demo/modules/events/vars.yaml`. That enumeration is incomplete. `apps/demo/lowdefy.yaml:46-49` also reads it:

```yaml
auth:
  adapter:
    id: mdb_adapter
    type: MultiAppMongoDBAdapter
    properties:
      ...
      appName:
        _ref:
          path: app_config.yaml
          key: app_name        # ← resolves to "demo"
```

This is the `MultiAppMongoDBAdapter`'s app-scoping key — the value that partitions `user-accounts` / `user-contacts` / `user-sessions` by app. Two consequences:

- **Build break.** Task 05 deletes `app_config.yaml`. No task migrates this `_ref`, so the deletion leaves a dangling `_ref` and `ldf:b` fails. Task 05's safety-net grep (`grep -rln "app_config.yaml" …` → "Expect zero results") will _not_ be zero — but the task then only says "migrate it first," with no guidance on the form for a non-trivial, semantically loaded site.
- **Wrong-value risk.** This isn't display chrome; it's the auth partition key. Wiring it to the wrong metadata field (e.g. `name` instead of `slug`) silently re-scopes every auth record. It must reproduce today's value (`demo`) exactly.

**Proposed fix.** Add this site to §Files changed and to Task 05 (or Task 01, since the adapter lives in `lowdefy.yaml` next to the new `slug:`). Rewrite to **`{ _build.app: slug }`**, not `{ _app: slug }`:

```yaml
appName:
  _build.app: slug
```

Rationale for `_build.app`: the current `_ref` with `key:` is a **build-time inline** — the literal `"demo"` is baked into the adapter config at build. `_build.app: slug` reproduces that exactly. `_app: slug` would instead leave a runtime operator object in `auth.adapter.properties`, and whether the auth-adapter init path evaluates `_app` there is unverified (auth config is not a normal page/request context — note the sibling `databaseUri` uses `_secret`, not a general operator). `_build.app` sidesteps that question by resolving at build like the `_ref` it replaces.

Also note: the property **key** `appName:` belongs to the external `MultiAppMongoDBAdapter` plugin schema (`@lowdefy/community-plugin-mongodb`), so it is **not** part of the in-repo `app_name → slug` identifier rename (§Rename decision scopes that to `modules/workflows/` + `plugins/modules-mongodb-plugins/`). Only the _value expression_ changes.

## Correctness / robustness

### 2. Harden the `makeActionPages` resolver guard against a non-string slug

> **Resolved.** Added the `typeof slug !== "string" || !slug` guard to Task 04's `makeActionPages.js` rename step (folded into the same edit that does the `app_name` → `slug` rename), and noted it in design §Build-time and runtime usage point 3. Converts the silent zero-pages drop into a loud build failure, making the unverified `_build.app: slug` resolver form safe either way.

The design (line 71) and Task 04 (line 10) both correctly identify the migration's single silent-failure mode: an unevaluated `{ _app: slug }` object passes the resolver's truthy guard, `action.access?.[{…}]` is `undefined`, and **every per-action page silently drops**. The mitigation chosen is "use `_build.app: slug` for the resolver var" — but the design then flags that this exact form is _unverified_ ("Verify with `ldf:b` — the resolver is a `_ref` build construct, not a literal `_build.*` operator; confirm the form that resolves to a string," line 71). So the design ships a fail-mode-by-silence at the highest-risk site, gated on an unverified operator form.

The guard itself (`modules/workflows/resolvers/makeActionPages.js:83-87`) only rejects _falsy_:

```js
function makeActionPages(_, vars) {
  const { workflows, app_name: appName } = vars;
  if (!appName) {
    fail(`vars.app_name is required and must be non-empty (got: ${JSON.stringify(appName)}).`);
  }
```

Task 04 already rewrites this exact function (`vars.app_name` → `vars.slug`, `appName` → `slug` local). Make the guard reject non-strings while you're there:

```js
const { workflows, slug } = vars;
if (typeof slug !== "string" || !slug) {
  fail(
    `vars.slug is required and must be a non-empty string (got: ${JSON.stringify(slug)}).`,
  );
}
```

This converts the silent-drop into a build error, so if `_build.app: slug` ever fails to resolve to a string (now or after a future Lowdefy change), the build fails loudly instead of shipping a workflows app with zero action pages. Near-zero cost, and it makes the unverified form safe either way. Recommend adding this to Task 04 and noting it in §Build-time and runtime usage point 3 / §Rename decision. (This is a hardening of review-1 #1c / review-2 #3b, not a re-raise — both prior findings stopped at "use `_build.app`"; neither closed the silent-failure surface.)

## Drift / minor

### 3. The plugin version constraint is already out of sync; "bump the minor" is ambiguous

> **Resolved.** Replaced the relative "bump the minor" wording with concrete end-state numbers in both design mentions and Task 04: package `0.7.0` → `0.8.0`, constraint `^0.6.0` → `^0.8.0`, with an explicit note that `^0.6.0` is already stale (excludes the current `0.7.0`) so this is a correction, not a clean increment.

Design lines 156 and 230 say to "bump the minor (per the 0.x policy) and update the `version:` constraint in `modules/workflows/module.lowdefy.yaml`'s `plugins:` list," framed as a clean increment from the current pin. But the current state is already inconsistent:

- `plugins/modules-mongodb-plugins/package.json` → `"version": "0.7.0"`.
- `modules/workflows/module.lowdefy.yaml` `plugins:` → `version: '^0.6.0'`.

With npm 0.x caret semantics, `^0.6.0` means `>=0.6.0 <0.7.0` — it **excludes** the `0.7.0` the package already declares. So the constraint is stale _before_ this migration touches it. (The demo's own `plugins:` entry uses `workspace:*`, which is why this hasn't surfaced.) Telling the implementer to "bump the minor" from an unspecified base invites bumping `^0.6.0 → ^0.7.0` while the package goes `0.7.0 → 0.8.0`, leaving the same off-by-one.

**Proposed fix.** State the concrete end-state in the design: package `0.7.0 → 0.8.0` (breaking schema change), and constraint `^0.6.0 → ^0.8.0` so it actually admits the new package. Or have Task 04 read the current `package.json` version and bump from _that_, not from the constraint.

### 4. `schema.js` embedded doc text still describes the old wiring

> **Resolved (auto).** Extended Task 4's schema.js step (and design.md §Files changed) to update the consumer-facing `description` strings, not just the property name/JSDoc: the renamed `slug` property's "wire this from `_module.var: app_name`" → `{ _app: slug }`, and the `user` property's `[app_name]` / `user.apps.{app_name}.roles` placeholders → `{slug}`, matching the design's existing prose-rename rule. Doc text only; no stored key touched.

The rename scope (design line 153, Task 04 line 33) covers the `WorkflowAPI` `schema.js` _property name_ and JSDoc, but the property's user-facing `description` strings still narrate the pre-migration model:

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js:117` — "Apps wire this from `_module.var: app_name`". After migration the connection property is `slug`, wired from `{ _app: slug }`.
- Lines 150-151 — `{ apps: { [app_name]: { roles: [...] } } }` and `user.apps.{app_name}.roles` as placeholders for the slug-keyed path. The design's own design-doc rule (line 186) renames exactly these placeholders (`apps.{app_name}.roles` → `apps.{slug}.roles`) for prose consistency; the same should apply to this schema doc string, which is consumer-facing.

These are schema _documentation_, not the stored key — renaming them is in-spirit with §Rename decision and doesn't touch data. Add "update the `description` text" to Task 04's schema.js step so it's not left half-migrated.

---

**Net:** Finding 1 is a real build break + auth-scoping correctness gap and should be fixed before implementation. Finding 2 is cheap insurance that closes the only silent-failure path. Findings 3-4 are drift to tidy in the tasks they already touch. Everything else in the design and task set verified clean against the current tree.
