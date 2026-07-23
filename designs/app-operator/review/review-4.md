# Review 4 — Post-rewrite scope drift: `activities` in / `user-account`+`user-admin` out, but the task set and several claims still describe the old scope

Context: since review-3 the design was substantially rewritten on the `auth-upgrade` branch. The scope flipped — **`activities` is now in scope**, and **`user-account` / `user-admin` are now out** (they dropped `app_name` in the BetterAuth rebuild; verified: neither `module.lowdefy.yaml` declares an `app_name` var anymore — the remaining matches are comments). The design body itself is now internally consistent with that new scope. But three artefacts did **not** move with it: the `tasks/` folder, several factual claims in the design, and the plugin-package rename inventory. Reviews 1–3 verified against the _pre-rewrite_ tree (companies/contacts/user-account/user-admin), so none of them exercised `activities` or the second demo app. Everything below is verified against the tree at `HEAD` of `auth-upgrade`.

## Blocking — scope

### 1. The `tasks/` folder describes the old scope and would migrate the wrong modules

> **Resolved.** Deleted the stale `designs/app-operator/tasks/` folder — it predated the post-review-3 rewrite and would migrate `user-account`/`user-admin` (out of scope), skip `activities` (in scope), and edit the removed `docs/idioms.md`. `design.md` was substantially reworked in this review (second app, build-time enumeration, plugin rename, comment sweep), so the task set is regenerated from scratch via `/r:design-task` rather than hand-patched.

`tasks/tasks.md` and its task files predate the rewrite (its "Review files applied" line stops at review-1/review-2, and it never mentions `activities`). Concretely:

- **Task 2** (`02-migrate-simple-modules.md`): "Migrate `contacts`, `companies`, `notifications`, **`user-account`**". `user-account` is now out of scope (design §Scope, §Non-goals line 224) and no longer declares `app_name` — this task would hunt for a var/sites that don't exist.
- **Task 3** (`03-migrate-user-admin.md`): "Migrate `user-admin`; default `app_title` to `{ _build.app: name }`". `user-admin` is out of scope for the `app_name` migration (it has no `app_name`, only `app_title` — design §Scope line 7, §"Adjacent vars that are NOT the same value" line 70). The `app_title` default is now an explicitly _optional, separable_ nice-to-have (design line 186–190), not a core task.
- **No task migrates `activities`** — the one module the rewrite _added_ to scope, with the largest build-time surface (see #4/#5). It is absent from every task file and from the tasks.md "one rule" build-time enumeration (which still lists "`companies`, `contacts`, `user-account`, and `user-admin`'s `update-user`/`invite-user`/`resend-invite`").
- **Task 6** points at `docs/idioms.md`, which no longer exists — it was migrated to `docs/shared/` (design line 165 acknowledges this; the design's own docs scope correctly targets `docs/shared/*`).

Implementing from this task set would migrate two out-of-scope modules, skip the in-scope one, and edit a deleted docs file. **Fix:** regenerate the task set from the current design (`/r:design-task`), keyed on `activities`/`companies`/`contacts`/`notifications`/`workflows`.

### 2. `apps/workflows-test/` is unaccounted for — the migration breaks its build

> **Resolved.** Added a "Second app (`apps/workflows-test/`)" bullet to §Scope-of-changes: add `slug: test` to its `lowdefy.yaml`, drop the three inline `app_name` entry vars in `modules.yaml`, drop `app_name`/`display_key` from its `events`/`notifications`/`workflows` vars files, delete its `app_config.yaml`, and treat it as a build-verification target alongside the demo (both must pass `ldf:b`; it runs the `workflows-test-e2e` CI job).

The design and tasks are written entirely around "the demo" (design line 14: "the demo already has `slug: demo`"). But there is a **second app**, `apps/workflows-test/`, that:

- Mounts the in-scope modules — `events`, `notifications`, `workflows`, `companies`, `contacts` (`apps/workflows-test/modules.yaml:19–54`) — and passes them `app_name` via `_ref` into its own `app_config.yaml` (`apps/workflows-test/app_config.yaml` → `app_name: test`).
- Declares `name: Workflows Test App` but **no `slug:`** in `apps/workflows-test/lowdefy.yaml`.
- Runs in CI e2e (`.github/workflows/e2e.yaml:33–69`, the `workflows-test-e2e` job), including the `workflows` module whose `makeActionPages.js` resolver is the highest-risk build-time site.

Once the modules drop their `app_name` manifest var and their internals read `_app: slug` / `_build.app: slug`, `workflows-test` must **also** declare `slug: test` and migrate its `app_config.yaml` + vars files — otherwise `_app: slug` fails the build (slug is required-when-referenced), and the hardened `makeActionPages` guard (review-3 #2) fails loudly on the unevaluated/absent slug. The design never mentions `workflows-test`. **Fix:** add `slug: test` to `apps/workflows-test/lowdefy.yaml`, migrate its `events`/`notifications`/`workflows` vars (and drop its `app_config.yaml`) in the same PR, and note it as a build-verification target alongside the demo.

### 3. The `app_config.yaml` reader inventory in step 1 is wrong

> **Resolved.** Rewrote step 1 (design line 14): the demo's `app_config.yaml` readers are the six module vars files that `_ref` into it (`activities`/`companies`/`contacts`/`events`/`notifications`/`workflows`, events twice), not just events. Cross-referenced the `workflows-test` bullet for that app's own file, and stated the safety condition explicitly (delete each `app_config.yaml` only once every `_ref` is migrated).

Design line 14 (and the deletion plan): "Its only remaining consumer is the demo's `events` vars (`display_key` and `change_stamp.app_name`)." Actual `app_config.yaml` readers:

- **Six** demo module vars files: `apps/demo/modules/{activities,companies,contacts,events,notifications,workflows}/vars.yaml` (events reads it twice — `display_key` and `change_stamp.app_name`).
- **Plus** `apps/workflows-test/` — its own `app_config.yaml`, `modules.yaml` (3 reads), and `events`/`notifications`/`workflows` vars.

This contradicts the design's own §Scope-of-changes line 155 ("delete `app_name:` from _each_ scoping module's demo vars file"), which implies many readers. The "delete once nothing reads it" safety step (Task 5's zero-results grep, per review-3 #1) must enumerate all of these, not just events. **Fix:** correct line 14 to name every reader (six demo vars + the second app), so the deletion isn't attempted while live `_ref`s remain and `ldf:b` breaks on a dangling ref.

## Correctness — build-time site enumeration

### 4. A build-time `_build.string.concat` shape is not enumerated, and a mechanical swap would break the build

> **Resolved.** Added the `_build.string.concat` variant to §Build-time and runtime usage (class 2) and to the §Scope-of-changes build-time list, calling out the single site (`modules/activities/api/update-activity.yaml:315–317`) and the separate grep `git grep -n -B2 '_module.var: app_name' modules/ | grep _build.string.concat`, so the map-key find doesn't miss it.

`modules/activities/api/update-activity.yaml:315–317` builds a **dotted** app-keyed message key inside a build operator:

```yaml
- _build.object.fromEntries:
    - - _build.string.concat:
          - _module.var: app_name # ← inside _build.string.concat, inside _build.object.fromEntries
          - .message
      - _item: task.title
```

The design's build-time enumeration describes only the **direct map-key** shape — line 85 ("The `- - { _build.app: slug }` pair is fed straight into `_build.object.fromEntries`") and line 141 ("The `- - _module.var: app_name` key nested under `_build.object.fromEntries`"). This site does _not_ match that pattern: `app_name` is one level deeper, as an argument to `_build.string.concat`. An implementer doing the described find (`- - _module.var: app_name`) would either miss it or, worse, fold it into the runtime bulk and write `_app: slug` — which leaves an unevaluated `_app` object inside `_build.string.concat`, producing an `[object Object].message` key or a build error. The general **rule** (line 80: "argument to a `_build.*` operator → `_build.app: slug`") gives the right answer; the _enumeration the task derives from_ is incomplete. **Fix:** add this shape to §Build-time and runtime usage, and have the build-time task grep `git grep -n -B2 '_module.var: app_name' modules/ | grep _build.string.concat` in addition to the `_build.object.fromEntries` keys.

### 5. `activities` build-time surface is under-described ("create/update-style endpoints")

> **Resolved.** Corrected the misleading _rule_ rather than enumerating sites (the design intentionally keeps inventories indicative): the build-time bullet now reads "any endpoint that builds an event-display key, not just create/update — in `activities` this includes status-change and delete endpoints," with the existing `git grep -l _build.object.fromEntries modules/` pointer to find them. The stale review-2 ~60/~12 split is not carried forward; task regeneration (#1) will re-derive counts.

Design line 141 lists the build-time sites as the "`create`/`update`-style endpoints" of `activities`, `companies`, `contacts`. For `activities`, **all nine** `app_name` sites are build-time and they span four files, including two the "create/update-style" phrasing skips:

- `create-activity.yaml:79, 198`
- `update-activity.yaml:85, 214, 317`
- `change-activity-status.yaml:111, 166, 215` (three sites — not "create/update")
- `delete-activity.yaml:103`

Because `activities` was never in scope during reviews 1–3, review-2's task-shaping estimate ("~60 runtime bulk vs ~12 careful build-time", review-2 #9) is now wrong: `activities` alone contributes nine build-time sites, so the "careful build-time" bucket is materially larger and concentrated in one module. **Fix:** re-enumerate build-time sites against the current tree (`git grep -l _build.object.fromEntries modules/activities/`), and don't carry review-2's split into the regenerated tasks.

## Doc / comment drift

### 6. The `EventsTimeline` connection's `app_name` property is left out of the plugin rename — and its description is already stale

> **Resolved.** Added `EventsTimeline` to the plugin rename: property `app_name` → **`display_key`** (not `slug` — it's fed the events module's `display_key`, which diverges from the slug in the ops-app case), rewrite the stale description, rename the shared-engine read, and update the wiring key in `modules/events/connections/events-timeline.yaml`. Bullet added to §Scope-of-changes and a note to the rename decision. No connection-level default needed — the slug default already flows through the `events.display_key` var (step 4).

`plugins/modules-mongodb-plugins/src/connections/EventsTimeline/schema.js` declares a **required** `app_name` property (lines 3, 11) in the _same_ plugin package the design version-bumps and renames:

```js
required: ['databaseUri', 'app_name'],
...
app_name: {
  type: 'string',
  description:
    'Host app deployment name. ... Apps wire this from _module.var: app_name '
    + 'on connections/workflow-api.yaml.',   // ← already wrong file + stale mechanism
},
```

The design's identifier-rename decision (§line 146–153, §202–210) scopes the plugin rename to `WorkflowAPI` only and never mentions `EventsTimeline`. Two problems:

- **Half-done "one canonical term."** Renaming `WorkflowAPI.app_name → slug` while leaving `EventsTimeline.app_name` is exactly the two-names tax the rename decision exists to remove — in the same package, in the same version bump.
- **Stale consumer-facing description.** The description says apps wire it "from `_module.var: app_name` on `connections/workflow-api.yaml`" — wrong file (this is the events connection, wired from the events module's `display_key`: see `modules/events/connections/events-timeline.yaml:6–7`, `app_name: { _module.var: display_key }`) and a mechanism that no longer exists post-migration. This is the identical drift review-3 #4 fixed for `WorkflowAPI`, left unaddressed here.

**Semantic note:** `EventsTimeline.app_name` is fed `display_key`, which legitimately diverges from the slug (the ops-app case the design preserves). So the accurate rename is to **`display_key`**, _not_ `slug`. **Fix:** decide explicitly — rename the property to `display_key` and fix the description, or exclude it with a one-line rationale — but the current silent omission both undercuts the rename's stated goal and leaves a wrong description shipping to consumers.

### 7. In-source comments and manifest var descriptions assert the old build-time mechanism

> **Resolved.** Added an "In-source comments and manifest descriptions" bullet to the docs scope: sweep any comment/description asserting `app_name` or "build-time" resolution, calling out the contacts `get_role_contacts_for_selector.yaml:16` comment (rewrite to drop the false build-time premise) and the `event_display` descriptions in the three manifests ("render under app_name" → "under the app slug"), plus `pnpm docs:gen` since those feed generated `vars.md`. Note: the review's "parallel comment at edit.yaml/view.yaml" was not found — only the one request comment exists; the rule-based phrasing covers any that resurface.

The design's docs scope (lines 159–165) covers `docs/shared/*`, `README.md`, and `CLAUDE.md`, but not in-repo source comments that will become false. Per CLAUDE.md ("comments describe the current code"):

- `modules/contacts/requests/get_role_contacts_for_selector.yaml:16` — "`# app_name is build-time, so the field path resolves to a literal before Mongo sees it`". After migration `app_name` → `_app: slug` is a **runtime** operator; the `_string.concat` (already runtime) evaluates server-side. The "app_name is build-time" premise is false post-migration. (The net behaviour is unchanged and correct — the concat still resolves to a literal before Mongo — but the stated reason is wrong.) A parallel comment exists at `modules/contacts/pages/edit.yaml`/`view.yaml` field-path sites.
- `modules/{activities,companies,contacts}/module.lowdefy.yaml` `event_display` var descriptions — "When unset, the module's defaults render under **`app_name`**." Should read "under the app slug" once the var is gone.

**Fix:** add these source comments and manifest descriptions to the migration scope (they're touched by the same edits anyway).

## Minor

### 8. Plugin version bump has no concrete target; review-3's numbers are obsolete

> **Resolved (auto).** Pinned the end-state in design §Scope-of-changes: `package.json` `0.14.1 → 0.15.0` (breaking schema change → minor bump per 0.x policy), constraint `^0.14.1 → ^0.15.0` in the workflows manifest. Verified no app `package.json` pins the plugin directly (demo uses `workspace:*`; `apps/workflows-test/package.json` doesn't list it), so noted no app-level pin needs bumping.

Design line 153 says the package is "currently `0.14.x`" and to "bump the version" + "update the `plugins:` version constraint … to match." Verified current state: `plugins/modules-mongodb-plugins/package.json` → `0.14.1`; `modules/workflows/module.lowdefy.yaml:250` → `^0.14.1` (in sync, unlike the stale `^0.6.0` review-3 #3 found — that finding's `0.7.0 → 0.8.0` numbers are now obsolete). The bump is still warranted (the `WorkflowAPI` property rename is a breaking schema change). **Fix:** state the concrete end-state (`0.14.1 → 0.15.0`, constraint `^0.14.1 → ^0.15.0`) in the design/task so the implementer doesn't re-derive it, and check whether `apps/workflows-test/package.json` pins the plugin too (the demo uses `workspace:*`).

---

**Net:** Findings 1–3 are scope gaps that would misdirect implementation (wrong modules migrated, a whole app's build broken, an unsafe deletion) and should be fixed — and the `tasks/` folder regenerated — before implementation. Findings 4–5 tighten the build-time enumeration for `activities`, which no prior review saw. Findings 6–7 close doc/comment drift in the same edits the migration already makes. Finding 8 is a number to pin. The core design decisions (remove-don't-redirect, `_app`/`_build.app` split, keep `display_key`, one-PR, no data migration) remain sound and verified against the current tree.
