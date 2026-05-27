# Review 1 — Build-time vs runtime, slug presence, file counts

## Blocking issues

### 1. `_app` is runtime-only, but several `_module.var: app_name` sites resolve at build time

> **Resolved (with open question).** Finding validated against the code — event-display `_build.object.fromEntries` keys, user-admin `_build.string.concat` titles, and the `makeActionPages.js` resolver all need a build-time slug. Chose path 3: make `_app` evaluable at build time in Lowdefy. Design §"Build-time vs runtime — important constraint" rewritten to §"Build-time and runtime usage" assuming that capability; the dependency on the Lowdefy change is tracked in §Open questions. Final naming (`_app` vs `_build.app`) deferred.

The design (§"Build-time vs runtime — important constraint") states:

> No current usage of `_module.var: app_name` is in a build-time context, so this is just a constraint to remember.

This is verifiably wrong. `_module.var` is a build-time substitution (`packages/build/src/build/buildRefs/walker.js:269-271`). The literal value flows through to whatever surrounding operator consumes it. Today, that literal can sit inside `_build.*` operators and resolve fine. Replace it with `_app: slug` and the build sees an unresolved operator object (`{ "_app": "slug" }`) where it expected a string. Concrete sites:

**a. Event-display map construction (companies, contacts, user-account, user-admin).**
`modules/companies/api/create-company.yaml:121-131`, mirrored in `update-company.yaml:194-204`, `modules/contacts/api/create-contact.yaml:96-104` + `update-contact.yaml:68-77`, `modules/user-account/api/create-profile.yaml:70-78` + `update-profile.yaml:69-77`:

```yaml
display:
  _build.object.fromEntries:
    _build.array.map:
      on:
        _build.array.filter:
          on:
            _build.object.entries:
              _build.if_none:
                - _module.var: event_display
                - _build.object.fromEntries:
                    - - _module.var: app_name      # <-- build-time key
                      - _ref: defaults/event_display.yaml
```

The inner pair `[_module.var: app_name, _ref: defaults/...]` is fed straight into `_build.object.fromEntries`, which requires the first element to be a literal string at build time. Substituting `_app: slug` produces `{ _app: 'slug' }` as the entry key — `_build.object.fromEntries` will either error or coerce the object to a useless key like `[object Object]`.

**b. `user-admin` page chrome (5 pages + excel_download).**
`modules/user-admin/pages/all.yaml`, `new.yaml`, `view.yaml`, `edit.yaml`, `check.yaml` and `components/excel_download.yaml` build their titles, breadcrumbs and download filenames with `_build.string.trim`, `_build.string.concat`, `_build.string.replace`, `_build.ne` — all wrapping `_module.var: app_title`. Example, `pages/new.yaml:19-23`:

```yaml
label:
  _build.string.trim:
    _build.string.concat:
      - _module.var: app_title
      - " User Admin"
```

The design proposes defaulting `app_title` to `{ _app: name }` (§"Default `user-admin.app_title` to `_app: name`"). That puts a runtime operator into a build-time string concat — same break as above.

**c. `workflows.makeActionPages` resolver (most structural).**
`modules/workflows/module.lowdefy.yaml:135-141` passes `app_name: { _module.var: app_name }` as a build-time `vars` arg to `resolvers/makeActionPages.js`. The resolver uses it at build time to decide which action pages to emit (`makeActionPages.js:43` — `action.access?.[appName]`) and to compose page IDs. If `appName` arrives as `{ _app: 'slug' }`, the resolver's `if (!appName)` guard passes (truthy object), `action.access?.[appName]` returns `undefined`, and no action pages get emitted at all. Silent loss of every per-action page.

**Proposed fix.** Pick one:

1. **Keep a build-time slug var on modules that need it.** Modules with `_build.*` consumers (companies, contacts, user-account, user-admin, workflows) keep an `app_slug` (or `app_name`) manifest var as `required: true`. Consumers set it to a literal (typically the same as `lowdefy.yaml`'s `slug:`). Only the *runtime*-only modules (notifications) drop the var. This is half a migration and reintroduces the drift the design is trying to eliminate, but it's mechanically possible today.

2. **Refactor build-time sites to runtime.** Replace the `_build.object.fromEntries` event-display wrapping with `_object.fromEntries` evaluated at request time; replace `_build.string.concat` titles with `_nunjucks` templates that read `_app: name` at render time. The `makeActionPages` resolver is harder — page generation is fundamentally build-time, and dropping per-action pages can't be moved to runtime. The resolver would need a parallel Lowdefy primitive that exposes app metadata at build time (out of scope here, but a candidate for a follow-up `_build.app` operator or a new resolver-context arg).

3. **Push slug into build time on the Lowdefy side.** Land `_build.app: slug` (or equivalent) upstream first, then migrate. This is the cleanest end-state but blocks this design on an external change.

Whichever path is chosen, the design needs to call out the build-time sites explicitly and say which ones get migrated, which ones stay on a manifest var, and what the end-state is.

### 2. Missing root `slug:` becomes a silent `null`, weaker than today's guarantee

> **Deferred to Lowdefy requirements doc.** Validated against `buildApp.js:49` and the kebab-case format check (only runs if set). Resolution path chosen: address upstream in Lowdefy rather than per-module assertion resolvers in this repo. Requirement written up in [lowdefy-requirements.md](../lowdefy-requirements.md) §"Requirement 2 — Build must fail when `slug:` is missing and required" and referenced from design §Open questions. Design cannot ship until the Lowdefy change lands.

Today each consuming module declares `app_name: { required: true }` — six places, but the build fails fast if any are missing. After migration, the only build-time check on slug is the kebab-case pattern (`lowdefySchema.js:1547-1554`), which only runs if `slug` is **set**. `buildApp.js:49` does `slug: components.slug ?? null`. So an app that forgets to add `slug:` to `lowdefy.yaml` builds cleanly, every `_app: slug` returns `null`, and every module read silently filters by `created.app_name: null` — matching only legacy docs with a null stamp, which is undetectable from logs.

The design's "Why now" argues this migration *removes* a drift class. It does — but it introduces a new and worse one (silent null instead of explicit unset).

**Proposed fix.** Add a build-time check in this repo, since Lowdefy doesn't enforce `slug` presence. Options:

- A small build-time `_build.*` assertion in one of the module manifests that fails if `_app: slug` returns nullish at build time. (Won't work — `_app` is runtime.)
- A `_ref` resolver or a `_build`-time JS check baked into `events/module.lowdefy.yaml` that reads `appMeta.slug` from the build's app config and throws. Needs to look at whether the resolver context exposes that today.
- Document loudly in `docs/idioms.md §App slug` and `README.md` that `slug:` is required when any of these modules is mounted, and add it to the consumer onboarding checklist.

At minimum, the design should acknowledge the gap and pick an option, not silently make the existing guarantee weaker.

## Inaccuracies

### 3. Per-module occurrence counts are off

> **Resolved.** Updated notifications 9→7 and workflows 8→10 in §Files changed; re-verified by grep against modules/.

Design §"Files changed" cites:

- `notifications` — 9 sites. Actual: 7 (`grep -rn "_module.var: app_name" modules/notifications/ | wc -l` → 7).
- `workflows` — 8 sites. Actual: 10.
- `user-admin` — 50 sites. Actual: 50. ✓
- `companies` — 2 sites. Actual: 2. ✓
- `contacts` — 5 sites. Actual: 5. ✓
- `user-account` — 6 sites. Actual: 6. ✓
- Total — 80 sites across 32 files. ✓ in aggregate, but the per-module rollup doesn't reconcile.

Not a correctness issue, but the task breakdown will derive from these numbers — fix them now so `/r:design-task` doesn't carry the error forward.

## Smaller findings

### 4. Operator-object defaults need an explicit invariant statement

> **Rejected.** The reviewer asks us to pin the invariant "Lowdefy passes operator-object manifest-var defaults through unevaluated" with a test in this repo, in case a future Lowdefy refactor changes that behaviour. That's defending against a speculative upstream change — not our contract to enforce. The current behaviour is already proven by `change_stamp`, which uses `_user: id` and `_date: now` inside its default. If Lowdefy ever changes default-resolution semantics, every module using `change_stamp` breaks, not just this design — that's a Lowdefy compatibility concern, not a per-design one. No design change.

The design relies on `default: { _app: slug }` being passed through the build as an operator object and evaluated per request at the consumption site. This works today because `_module.var` substitution is a literal copy and the consumption sites (`_string.concat`, MongoDB filters, change-stamp templates) are runtime. But the invariant — *"a manifest var default that is a runtime operator object is evaluated at the consumption site, not at the default-resolution site"* — is load-bearing for this design and isn't tested in the Lowdefy build test suite directly (test `67-module-var-defaults` covers literal defaults, not operator-object defaults). The design references `change_stamp` as precedent (it uses `_user`/`_date` inside its default), which is good evidence — but worth calling out as a hard requirement and adding a test in this repo's build pipeline (or upstream) so a future Lowdefy refactor of default resolution doesn't silently break every consuming module.

### 5. `display_key` consumption site is fine but worth checking once

> **Rejected.** Reviewer already confirmed the chain is safe by walking the operator types. The build verifies every migrated site uniformly when `ldf:b` runs — flagging one specific site as "remember to verify this one" adds no information beyond what the build already does for all 32 files. No design change.

`modules/events/components/events-timeline.yaml:24-58` uses `_object.fromEntries` (runtime) and `_string.concat` (runtime) with `_var.default: { _module.var: display_key }`. With the new default, that nests `_var.default: { _app: slug }` — `_var` resolves at build time and inlines the operator object; then `_string.concat`/`_object.fromEntries` evaluate `_app: slug` at request time. Confirmed safe by walking the operator types. No action needed, but flag it in the task as a verify-on-build site since the chain is non-obvious.

### 6. Anchor rename `#app-name` → `#app-slug` will break external links

> **Rejected.** Repo is 0.x prerelease; the design accepts clean cuts as the versioning policy. A "previously known as" redirect note in the renamed section adds carry-forward cruft for a speculative external-link audience.

`docs/idioms.md` is linked from each per-module README and from `CLAUDE.md`. The design covers updates to README/CLAUDE.md, but external consumers who have linked to `docs/idioms.md#app-name` (from their own apps or docs) will get a missing anchor. Since this repo is 0.x and the design argues a clean cut is fine, this is probably acceptable — but it's worth adding a short redirect note inside the new `#app-slug` section ("Previously `#app-name` — anchor renamed") so a stale link's reader lands somewhere useful when they search.

### 7. `notifications` module has the cleanest migration — call it out

> **Rejected.** Framing was tied to path 1 of finding #1 (partial migration: notifications drops the var, other modules keep it). Resolution chose path 3 (build-time `_app` upstream), so all six modules migrate uniformly. Not load-bearing.

Every `notifications/requests/*.yaml` and `components/unread-count-request.yaml` site is a top-level runtime request filter (`created.app_name: { _module.var: app_name }`). No `_build.*`, no resolver. If the design chose path (1) in finding 1 (keep build-time var on modules that need it, drop on the rest), `notifications` is the only module that fully migrates to `_app: slug`. That's a useful framing for the task breakdown: notifications drives the docs change, the other modules either fully migrate (after their build-time sites are refactored) or partially migrate (runtime-only sites switch, build-time sites keep the var).
