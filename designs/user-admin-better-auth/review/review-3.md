# Review 3

Scope: the **task files** in `designs/user-admin-better-auth/tasks/` (01–19 + `tasks.md`) — the implementation breakdown, not `design.md` itself. Reviews 1, 2, and consistency-1 covered the design and are not revisited; the design is treated as settled here. Every factual claim below was verified against the current codebase (`modules/user-admin/`, `modules/shared/`, `apps/demo/`, `.claude/skills/`, `apps/demo/.claude/guides/`) and the referenced mockups. The task set is well-structured — the scaffold-first / wire-last ordering and the per-screen frame→layout→content→wire chains are sound. Findings are concrete gaps and one contradiction that would each cost an implementer real time or produce wrong output.

## Blocking / correctness

### 1. Every write- and wire-task points at skill/guide paths that don't exist

> **Resolved.** The review's proposed target (`apps/demo/.claude/guides/`) is itself now stale — those guides have been deleted, and the `/r:lowdefy-*` skills are deprecated too. The current source of truth is the `lowdefy-docs` MCP for core Lowdefy topics, plus `docs/` for repo-specific idioms. Verified MCP coverage: **modules** (`concepts/modules`, `concepts/module-authoring`), **api-routines** (APIs concept + request/action schemas), **aggregations** (`connections/mongodb`, `MongoDBAggregation`) — all covered; **change-stamps** and **events** are NOT in the MCP (repo idioms) → `docs/shared/change-stamps.md` and `docs/events/`. Applied across tasks 1, 2, 3, 4, 5, 9, 13: skill refs → `lowdefy-docs` MCP; `.claude/guides/change-stamps.md` → `docs/shared/change-stamps.md`; `.claude/guides/events.md` → `docs/events/`. Left the correct `mock-to-lowdefy` phase paths and `/lowdefy-config` references untouched.

Tasks 2, 3, 4, 5, 9, 13, 17 instruct the implementer to read paths that are wrong in this repo:

- **`.claude/skills/lowdefy-modules`** (task 1:16), **`.claude/skills/lowdefy-api-routines`** (tasks 2:14, 3:18, 4:13, 5:12), **`.claude/skills/lowdefy-aggregations`** (tasks 9:8, 13:7) — none of these exist. `.claude/skills/` contains only `design-tasks-ui`, `lowdefy-config`, `lowdefy-mock`, `mock-to-lowdefy`. The Lowdefy content skills are **plugin** skills: `r:lowdefy-modules`, `r:lowdefy-api-routines`, `r:lowdefy-aggregations` (invoked `/r:lowdefy-modules` etc.). Task 1's "or invoke `/lowdefy-modules`" is also wrong — the valid invocation is `/r:lowdefy-modules`.
- **`.claude/guides/events.md`**, **`.claude/guides/change-stamps.md`** (tasks 3:18, 4:13, 5:12, 2:15) — `.claude/guides/` does not exist at the repo root. The guides live under **`apps/demo/.claude/guides/`** (confirmed: `apps/demo/.claude/guides/{events,change-stamps,aggregations,api-routines,…}.md`).

The `mock-to-lowdefy` phase paths in tasks 6–8, 10–12, 14–16 (`.claude/skills/mock-to-lowdefy/phases/0N-*.md`) **are** correct — only the write/wire tasks carry the bad references.

**Fix:** replace `.claude/skills/lowdefy-{modules,api-routines,aggregations}` with the `/r:lowdefy-*` skill invocations, and `.claude/guides/*.md` with `apps/demo/.claude/guides/*.md` (or reference them via the CLAUDE.md guide table, noting the actual location).

### 2. `view` frame/layout tasks say "six modals" but enumerate seven

> **Resolved (auto).** The mock (`mockups/screens/view.html`) has exactly seven modals (`modal_{profile,access,global,suspend,remove,revoke,delete}`). Changed "six" → "seven" in task 10 (body) and task 11 (body + acceptance criterion).

Task 10 (`10-view-frame.md:22-24`) says to capture "the **six** modal overlays" then lists **seven**: "profile edit, attributes edit, global attrs edit, suspend confirm, remove confirm, revoke confirm, delete confirm" (3 edit + 4 confirm). Task 11 (`11-view-layout.md`) repeats "the **six** modal containers" / "**six** modal containers present" in both the task body and the acceptance criteria. Task 12 content (`12-view-content.md:29-33`) independently lists the four Security confirms (Suspend / Remove / Sign out / Delete) plus the three edit modals — i.e. seven.

An implementer copying the "six" count (especially into task 11's acceptance criterion) will drop one modal — most likely the revoke ("sign out everywhere") confirm, which is the odd one out.

**Fix:** change "six" to "seven" in tasks 10 and 11 (body + acceptance), or drop the count and say "one overlay per edit tile plus one per Security confirm."

### 3. Task 2's fragment acceptance contradicts the seam it must preserve, and the parameter contract is undefined

> **Resolved.** Adopted the caller-injected `_var` mechanism (option A) — it's what design.md:122 already mandates ("carries no module vars; each caller wraps it with its own ids") and it's the robust choice, since option B would silently require every consumer to define identically-named vars/connections that `user-account` lacks. Task 2 now enumerates both fragments' `_var` interfaces: `create-or-link-contact` takes `connection_id` / `email` / optional `profile` → returns `contactId`; `write-profile` takes `connection_id` / `user_id` (target) / `contact_id` / `profile` / `write_stages` (default `[]`, = the `request_stages.write` seam). The "no `_module.*`" acceptance criterion is kept and clarified — all module-scoped values arrive via `_var`, and `_module.*` resolution lives only in the caller's routine. Tasks 3 and 5 now pass those vars explicitly (`connection_id: {_module.connectionId: user-contacts-collection}`, `write_stages: {_module.var: request_stages.write}`).

`02-shared-contact-fragments.md` requires `write-profile` to (a) write the change-stamped `contact` over the app connection (`user-contacts-collection`), (b) "preserve the `request_stages.write` extension seam" (task 2:41,51), while its acceptance criteria demand the file carry **"no module (`_module.var`) references"** (task 2:45-46). These are in direct tension: `request_stages.write` is a **module var** (`modules/user-admin/module.lowdefy.yaml:82-102`), and the contact connection id is a **module-scoped** id normally reached via `_module.connectionId` — both are `_module.*` accesses. The same applies to `create-or-link-contact` (needs the contact connection).

The design's own wording ("each caller wraps them with its own ids") implies the seam/connection/target-user ids arrive as caller-injected `_var`s — but task 2 never enumerates the fragments' input parameters, so tasks 3 and 5 have no contract to satisfy. Either the fragment uses `_module.*` (which _does_ resolve against the consuming module when inlined via relative `_ref` — in which case the "no `_module.var`" acceptance is simply wrong), or the caller passes everything via `_var` (in which case the `_var` interface must be listed).

**Fix:** in task 2, decide and state the mechanism — enumerate the `_var` inputs each fragment expects (target `userId`, `contactId`, profile fields, `request_stages.write` stages, connection id), or explicitly allow `_module.*` resolution-in-consumer and correct the acceptance criterion. Tasks 3 (`update-profile`) and 5 (`invite`) should then reference that contract. This is exactly the "resolve the open question, don't defer it" case — the fragment interface is load-bearing for three downstream tasks.

## Gaps

### 4. Pagination is placed but never wired

> **Resolved.** Confirmed the design requires it (Decision 2: sort "orders the whole result set across pages"; resolved open question at design.md:180: each tab owns "its own filter/sort/table/pagination blocks with independent state") and tasks 6/8 place the footers, but task 9 never wired it. Added a **Pagination** section + acceptance criterion to task 9: per-tab independent state → `$skip`/`$limit` after the `$sort`, with a `$facet` splitting `rows` (skip+limit) / `total` (`$count`) in one aggregation feeding the Pagination block and the result/pending counts (not `rows.length`); `pageSize`/page via request `_payload`; export stays unpaginated. References the MCP `input-blocks/pagination` doc.

The `all` frame and content tasks lay down a "pagination footer" per tab (tasks 6:27, 8 Members/Invitations "Pagination footer"), and the design mandates server-side sort that "orders the whole result set across pages, not just the visible page" (Decision 2) — which only makes sense with server-side pagination. But task 9 (`09-all-wire.md`), the sole wire task for `all`, never mentions binding pagination state to the aggregation: no `$skip`/`$limit`, no total-count `$facet`/`$count` for the page controls and the pending-count/result counts. Its acceptance criteria (task 9:54-67) cover reads, filters, sort, invitations, row actions, and export — but not pagination.

**Fix:** add pagination wiring to task 9 (state → `$skip`/`$limit`, plus a count stage feeding the pagination block and result counts, per tab with independent state) and reference `r:lowdefy-pagination` / `r:lowdefy-list-pages`.

### 5. "Re-invite for Expired" is underspecified and collides with the lingering `pending` row

> **Resolved.** Verified against BetterAuth 1.6.23 source (`plugins/organization/routes/crud-invites.mjs` + `adapter.mjs`): `createInvitation`'s re-invite guard uses `adapter.findPendingInvitation`, which **filters out expired rows** (`expiresAt > now`) — so an expired `pending` invite is invisible to the guard and a fresh `InviteMember` writes a **duplicate** `pending` row (and `resend:true` only refreshes a non-expired row). `cancelInvitation` has no expiry/status guard, so it _can_ cancel an expired row. Adopted **cancel-then-invite**, placed in the `invite` submit routine (task 5) rather than only the Re-invite button, so every path (the Expired-row action or a manually re-typed email) self-reconciles: before `InviteMember`, natively find `pending` rows for `(lowercase email, org)` with `expiresAt < now` and `CancelInvitation` each by id, then invite (idempotent — no-op when none stale). Noted in tasks 9 and 17.

Tasks 8 and 9 give Expired invitation rows a distinct **"Re-invite"** action routed to "the invite flow" (task 8 Invitations tab; task 9:47 "Re-invite (expired) → the invite flow"). But Expired is _derived_ as `status:"pending" AND expiresAt < now` (Decision 2; task 5:73) — the underlying row is still `status: "pending"`. Task 5's `check-invite-email` resolves the "pending invitation" state only on **future** `expiresAt` (task 5:24), so an expired invite's email resolves instead as "existing contact, no membership" → submit runs a **fresh** `InviteMember` while the expired-but-still-`pending` row for that email persists. Whether `InviteMember` upserts that row, errors on it, or creates a duplicate is never stated across tasks 5/8/9/17.

**Fix:** specify the reconciliation for re-inviting an expired invitation — either cancel-then-invite (`CancelInvitation` on the stale row, then `InviteMember`) or verify BetterAuth's `InviteMember` replaces an existing `pending` row for the same (email, org) and document that. Bake the verified behaviour into task 5 (and note it in the task 9/17 actions).

### 6. Task 1 renames/removes vars but leaves the demo's backing `_ref` files orphaned

> **Resolved.** Verified the three files are `_ref`'d only by `apps/demo/modules/user-admin/vars.yaml` (the contacts module has its own separate `global_attributes_fields.yaml`). Task 1's demo-consumer step and Files list now call out deleting `roles.yaml` and renaming `global_attributes_fields.yaml`→`user_attributes_fields.yaml` / `app_attributes_fields.yaml`→`member_attributes_fields.yaml` with the `_ref` paths repointed to match the renamed keys.

Task 1 removes the `roles` var and renames `fields.global_attributes`→`user_attributes` and `fields.app_attributes`→`member_attributes` (task 1:29-40), and its Files list touches only `apps/demo/modules/user-admin/vars.yaml`. But that `vars.yaml` `_ref`s three sibling files that the rename/removal orphans (verified `apps/demo/modules/user-admin/vars.yaml:5-13`):

- `roles.yaml` — backs the retired `roles` var; becomes dead.
- `global_attributes_fields.yaml` — `_ref`'d by `fields.global_attributes`; the key is renamed to `user_attributes`.
- `app_attributes_fields.yaml` — `_ref`'d by `fields.app_attributes`; the key is renamed to `member_attributes`.

(`fields.profile` already `_ref`s the shared `modules/shared/profile/fields.yaml`, so it's fine.)

**Fix:** in task 1, call out deleting `roles.yaml` and renaming the two attribute-field files (or their `_ref` keys) so the demo consumer is internally consistent, and add them to the Files list.

### 7. The MongoDB connection-plugin swap is app-wide, but task 1 only rewrites the module manifest

> **Resolved (reframed).** Investigation showed the review's premise was inverted: task 1 shouldn't pin `@lowdefy/connection-mongodb` for the module's Lowdefy connections — that package's `MongoDBCollection`/`MongoDB*` request types plus `MongoDBAuthAdapter` (the vendored `supportsJSON` adapter, Decision 5) are **built-in** (`custom: false`, auto-included). `list_plugins` attributed those types to `@lowdefy/community-plugin-mongodb` only because the pinned community plugin **overrides** the built-in. Community's auth adapter is a differently-named `MultiAppMongoDBAdapter`, so it does not override the vendored `MongoDBAuthAdapter`. The correct move (per user direction) is a **full app-wide drop** of `@lowdefy/community-plugin-mongodb`: the built-in serves everything, including the consecutive-id requests `modules/companies` uses (ported upstream into `@lowdefy/connection-mongodb` v5.4.0, merged `789099a1f` on 2026-07-17) — with no consumer code changes (same `type:` names). Task 1 now drops the community pin from both the module manifest and `apps/demo/lowdefy.yaml`, corrects the wording that conflated the connection plugin with the auth adapter, and adds an acceptance criterion. (The `@lowdefy/*` experimental dep bump that makes the consecutive-id port available is handled by the maintainer, not gated in the task.)

Task 1 states the module's MongoDB plugin "is the vendored `@lowdefy/connection-mongodb`" (task 1:70-72), grounded in design.md:7. But the demo app still pins **`@lowdefy/community-plugin-mongodb`** for its own connections (`apps/demo/lowdefy.yaml`, two occurrences), and task 1's demo-consumer step (task 1:81-88) never mentions migrating the app's plugin pin. If the module manifest pins `@lowdefy/connection-mongodb` while the app pins `@lowdefy/community-plugin-mongodb`, the connection-type resolution is inconsistent — and the seven module connections all depend on it.

**Fix:** make the plugin migration explicit and app-wide in task 1 — update `apps/demo/lowdefy.yaml`'s MongoDB plugin pin alongside the module manifest — or, if the two packages are meant to coexist, say so. The task's "Confirm against apps/demo what the app currently pins" hedge isn't enough given the app currently pins the _other_ package.

## Minor

### 8. The role picker's catalog source operator is never named in the content/wire tasks

> **Resolved.** Named `_build.authConfig.roles` (Decision 8) in all three content tasks that render catalog-driven controls — task 8 (role filter), task 12 (access-modal role picker), task 16 (invite-form role picker) — rather than once, since those content tasks run in parallel across the three screens and each implementer independently consumes the catalog.

Task 1 correctly grounds the retired `roles` var on the `_build.authConfig.roles` projection (task 1:30-31). But the tasks that actually consume the catalog — task 12 (`role MultipleSelector whose options/labels/descriptions come from the auth.roles catalog`), task 16, task 8, and the role-id validation in tasks 3/5/17 — only ever say "from the `auth.roles` catalog" and never name `_build.authConfig.roles` as the operator/projection the module reads. It's a build-time projection, easy to miss.

**Fix:** cite `_build.authConfig.roles` (design Decision 8) once in the content task that first renders the picker (task 12 or 8) so the implementer doesn't rediscover the access path.

## Verified — no issue

- The `mock-to-lowdefy` phase file references (tasks 6–8, 10–12, 14–16) resolve (`.claude/skills/mock-to-lowdefy/phases/{01-frame,02-layout,03-content}.md` all exist).
- The shared components the layout tasks reuse all exist: `modules/shared/layout/{title-block,pagination,sort-filters,card}.yaml`.
- Commit `0b8123de` (task 1:87) is real and is the better-auth demo migration.
- The `app_domain` and `roles` vars task 1 removes both exist in the current manifest; the seven-connection count (1 app + 6 auth) is correct.
- Task dependency graph in `tasks.md` is internally consistent (per-screen chains, wire tasks gated on their content + write-side routines).
- Task 1 correctly identifies that the demo's `auth.roles` catalog and pinned org are not yet configured (verified: `auth.roles` is commented out in `apps/demo/lowdefy.yaml:72,77`) and scopes adding them.

## Next Step

Run `/r:design-action-review user-admin-better-auth` to resolve, reject, or defer each finding.
