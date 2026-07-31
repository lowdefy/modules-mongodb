# Review 2

Scope: `designs/user-admin-better-auth/design.md` and `upstream-asks.md`, re-verified against the current auth-upgrade designs (`lowdefy-design/designs/auth-upgrade/{admin,engine,user-model,mongodb,hooks,permissions}/design.md`), the sibling `designs/user-account-better-auth/design.md`, the installed `better-auth@1.6.23` source, and the current `modules/user-admin` implementation.

Review 1's load-bearing findings (#1 co-location, #2 impersonation, #3–#5 stale asks, #6 ban fields, #8 search downgrade, #13 role-filter split) all carry resolution annotations and are not revisited. This pass re-verified those resolutions hold and then looked for what changed under them — chiefly the new cross-module coupling introduced by Decision 7, a security omission relative to the sibling design, and drift between this design and its upstream dependencies since Review 1 was written. The design remains sound; findings are concrete and mostly about coupling, safety, and freshness of dependency claims.

## Cross-module coupling

### 1. Decision 7 introduces a hard `user-account` dependency that Decision 8 does not declare

> **Resolved (no dependency — shared-folder `_ref`).** The finding's premise (a cross-module `_ref` needs a declared dependency) holds only for the `module:`-keyed **export** form. The repo also shares files via plain relative-path `_ref` into `modules/shared/` (confirmed: both `user-admin` and `user-account` already `_ref: ../shared/profile/avatar_colors.yaml` today) — no `module:` key, no dependency, module operators resolve in whichever module inlines the file. `create-or-link-contact` (and its sibling `write-profile`) are generic, var-free contact operations, so they belong in `modules/shared/`, not as `user-account` exports. Reworded Decision 7 to describe the shared-folder `_ref`, added a not-a-dependency note to Decision 8, and kept the dependency list `layout`/`events` unchanged — so the install-surface cost the finding worried about doesn't arise. Export + dependency is reserved for fragments that encapsulate one module's vars (e.g. companies' company-selector), which these are not. **Cross-design flag:** `user-account-better-auth` frames both fragments as _exported by_ that module; that should move to the shared folder too (to action in its own review). **Related correctness fix surfaced here (not in the review):** this design described the admin profile save as "a plain contact request", but per the sibling that leaves the _target's_ denormalized `user.profile` (+ `name`/`image` display copies feeding `_user.*`) stale across the suite. Updated the reframe table, Decision 3 (new "Why profile save is `write-profile`" paragraph), and the Decision 8 fragment note so the profile save `_ref`s the shared `write-profile` fragment (contact write + `UpdateUserProfile` re-denorm) — closing the staleness gap the sibling flagged as "tracked in that design".

Decision 7 (design.md:112) states the invite flow runs "the **shared `create-or-link-contact` fragment exported by the [user-account module]** … `_ref`'d here." The sibling design confirms the other side: `user-account` Decision 7 and its module surface export `create-or-link-contact` as a component "`_ref`'d by user-admin's invite" (`user-account-better-auth/design.md:104,132`).

A cross-module `_ref` requires the referenced module to be a declared dependency (per `CLAUDE.md` → _Cross-Module Dependencies_ and _Consuming Module Resources_: `_ref: { module: …, component: … }` resolves only through a `dependencies:` entry). But Decision 8's dependency list (design.md:126) is **`layout`, `events`** with "`notifications` is dropped" — it does not mention `user-account`. The current module (`modules/user-admin/module.lowdefy.yaml`) depends on `layout`, `events`, `notifications` and has no `user-account` dependency, so this is a genuinely new coupling, not an existing one.

Consequences to resolve:

- The dependency graph gains a new edge `user-admin → user-account`. That means an app installing `user-admin` to invite/manage users must now also install `user-account` (a page-heavy module owning login/signup/reset) purely to satisfy the fragment `_ref`. That is a real install-surface cost the design should state and justify, or avoid.
- Decision 8 and the module-surface sketch (design.md:130–137, which lists Connections/Pages/APIs/Menus but no Dependencies row) should name `user-account` as a dependency, or the design should relocate the shared fragment to a lower module both depend on (e.g. `contacts`/`events`) so the two person-writing modules share it without `user-admin` depending on the self-service module.

**Fix:** either add `user-account` to Decision 8's dependency list (and the module manifest sketch) and accept the coupling explicitly, or move `create-or-link-contact` to a module that is already a shared dependency of both. Whichever way, the "one upsert, keyed on `lowercase_email`, so the two flows can't drift" goal (design.md:112) is preserved — the finding is only that the wiring that makes it possible is currently undeclared.

## Security

### 2. The Security-tile sessions read must project out the session `token`; Decision 5 doesn't say so

> **Resolved.** Confirmed `token: z.string()` (bearer credential) on the session table in `@better-auth/core@1.6.23` (`db/schema/session.mjs`), alongside `expiresAt`/`ipAddress`/`userAgent`. Added to Decision 5's Sessions bullet that the native read `$project`s out `token` (and any other bearer/secret fields), with the rationale (admin views another user's sessions; returning `token` = replayable cookie) and a pointer to the sibling's matching treatment.

Decision 5's Sessions bullet (design.md:95) describes the native read over `user-sessions` as "created, expiry, IP/user-agent" and does not mention excluding `token`. The `session` row carries a `token` field that is the bearer credential for the session (engine `Database collections`: "session … token …"; `user-sessions` per mongodb Decision 2). A `$project` that returns the whole row — or any implementation that forgets to drop `token` — ships live session tokens to an **admin** viewing **another user's** sessions, i.e. hands one user a credential to impersonate another by replaying the cookie. This is strictly more dangerous than the self-service case, where the sibling design already treats it as load-bearing: `user-account` Decision 5 explicitly projects "`token` projected out, it's a bearer credential" (`user-account-better-auth/design.md:86`).

**Fix:** state in Decision 5 that the sessions native read projects `token` (and any other bearer/secret fields) out, matching the sibling module. Cheap to write now, easy to miss at implementation time, high blast radius if missed.

## Cross-design drift (upstream not yet reconciled with this design)

### 3. The upstream hooks design still names user-admin's `invitation.send` binding that Decision 7 dropped

> **Rejected.** Confirmed real (stale user-admin exemplar at `concepts/hooks/design.md:98,116`), but not worth actioning. It's an illustrative example of a mechanism that is itself correct and unchanged, the same line already carries a valid twin example (merge-on-signup's `email.verified`), and the worst case is a moment's confusion for a hooks-build implementer who then checks the user-admin design (source of truth for what this module ships). No harm to this module; not worth a cross-project edit into `lowdefy-design` nor a Decision 7 note. Left for the hooks design's own review to catch if it matters there.

Decision 7 (design.md:112, and upstream ask 6 "Dropped", design.md:154 / `upstream-asks.md:77`) removes the `send-invitation-email` endpoint and its `invitation.send` binding — the invite email now rides `auth.email`. Verified the fallback path is real: at unbound `invitation.send`, "the engine falls back to `auth.email` with a stock template" (hooks payload catalog, `hooks/design.md:116`). So the module's choice works.

But the upstream **hooks** design still cites user-admin as the _exemplar_ of a module-contributed `invitation.send` binding, in three places:

- Decision 7: "user-admin's `send-invitation-email` binds `invitation.send`" (`hooks/design.md:98`).
- Payload catalog: `invitation.send` … "Wired since phase 3" (`hooks/design.md:116`).
- The two-tiers preamble references module-contributed bindings composing before app entries (`hooks/design.md:24,26`).

This is now inconsistent: the module design says it ships no such binding; the upstream design still presents it as the canonical example that one. It is not a blocker for _this_ module (the `auth.email` fallback stands on its own), but it is exactly the kind of stale cross-reference that misleads an implementer of the hooks build — they will look for a `send-invitation-email` endpoint that no module ships. Per `CLAUDE.md` ("when they disagree … flag the mismatch"), flag it so the hooks design's example is updated (e.g. to merge-on-signup's `email.verified`, which `user-account` genuinely ships) or annotated.

**Fix:** raise an upstream note against `hooks/design.md` to drop/replace the user-admin `invitation.send` exemplar, and add a one-line pointer in this design's Decision 7 that the upstream hooks example is stale pending that edit.

### 4. The attributes-as-BSON mechanism cited here is the abandoned pnpm-patch, not the shipped vendored adapter

> **Resolved (auto).** Verified against mongodb Decision 5 (revised phase 8): the pnpm-patch was abandoned (`patchedDependencies` don't reach consumer installs of the published `@lowdefy/server`) and the adapter is now **vendored** into `@lowdefy/connection-mongodb` with `supportsJSON: true` + string-parse-on-read. Updated design.md:7, design.md:153 (ask 5), and upstream-asks.md:71 to cite the vendored-adapter mechanism and drop "PR pending" as a live dependency. The conclusion (attributes readable as native sub-documents; filters/columns/joins safe) is unchanged.

design.md:7 and design.md:153 (upstream ask 5) describe the native-BSON resolution as "native sub-documents (adapter patch pushed; PR pending)" / "a `supportsJSON` adapter patch on the fork; PR not yet opened." `upstream-asks.md:71` says the same: "A pnpm patch adds a `supportsJSON` passthrough … committed and pushed to the fork branch … only the upstream PR filing remains."

That mechanism was **superseded** upstream. mongodb Decision 5 (revised in phase 8) abandons the pnpm patch — "`patchedDependencies` … does not ship in the published `@lowdefy/server` tarball, so consumer installs … would get the unpatched adapter and silently fall back to string storage" — and instead **vendors the adapter** into `@lowdefy/connection-mongodb` with `supportsJSON: true` plus a legacy string-parse on read (`mongodb/design.md:65–68,101`). The upstream PR is now "optional goodwill, not a release dependency."

The _conclusion_ this design relies on (attributes stored/readable as native sub-documents, so attribute filters/columns/joins are safe) is unchanged and still holds. Only the mechanism citation is stale. It matters because a reader chasing the dependency (or the migration codemod author) will look for a pnpm patch / fork PR as the thing that must land, when the actual dependency is the vendored adapter already in `@lowdefy/connection-mongodb`.

**Fix:** update design.md:7, design.md:153, and `upstream-asks.md:71` to cite the vendored-adapter mechanism (`supportsJSON: true` in the vendored `@lowdefy/connection-mongodb` adapter, string-parse-on-read for legacy rows), and drop the "PR pending" as a live dependency.

## Factual / precision

### 5. Decision 3's engine-floor step list is wrong for this module — includes a step it never calls, omits several it does

> **Resolved.** Verified against the implemented platform code (`lowdefy/packages/api/src/routes/endpoints/handleAuthStep.js`): the floor is applied **uniformly to every auth step**, not to a hand-listed set — the only bypasses are `system: true` calls and a `selfTargetExempt` flag that only `UpdateUserProfile` sets (self-service profile save; this module writes profile as a `contact` request and never calls it). The code is correct as-is; the defect was purely in this design's prose. Rewrote Decision 3 to describe the uniform mechanism and point at the reframe table's step columns rather than enumerate — dropping `UpdateUserProfile` and no longer implying the floor picks out named steps. (Real catalog also carries `ListUsers`/`CreateOrganization`, further evidence hand-listing drifts.)

Decision 3 (design.md:77) says the platform "enforces `auth.userAdminRole` as a step-level floor — every auth admin step (`InviteMember`, `UpdateMemberRoles`, `UpdateMemberAttributes`, `RemoveMember`, `CancelInvitation`, `ListMembers`, `UpdateUserProfile`) mechanically checks the caller holds the configured role."

That parenthetical is inaccurate as the module's step set:

- It **includes `UpdateUserProfile`**, which this module does not use — profile is written as a plain change-stamped `contact` request (Decision 1 reframe table, design.md:22; admin Decision 1 "a profile edit updates `contact` only"). `UpdateUserProfile` is `user-account`'s step (`user-profile` Decision 4 / engine `hooks/design.md:115,140`), not user-admin's.
- It **omits** the auth-owned steps this module actually issues and which are equally floored: `UpdateUserAttributes` (Global attributes tile, design.md:22,73), `BanUser`/`UnbanUser` (Suspend/reinstate, Decision 4), `RevokeUserSessions` (Sessions, Decision 5), and `DeleteUser` (Delete login identity, Decision 4).

The engine floor itself is broader than this list — "every step in the admin catalog … plus `UpdateUserProfile`" (engine `design.md:206`), so the floor does cover the omitted steps; the defect is only in this design's enumeration, which reads as if ban/delete/attributes/session-revocation weren't floored while a step the module never calls is.

**Fix:** replace the parenthetical with the steps this module actually drives (`InviteMember`, `CancelInvitation`, `UpdateMemberRoles`, `UpdateMemberAttributes`, `RemoveMember`, `UpdateUserAttributes`, `BanUser`/`UnbanUser`, `RevokeUserSessions`, `DeleteUser`, and read steps if used), or simply cite "every admin-catalog step (admin Decision 1)" without a hand-copied list that can drift.

### 6. "Invited/Expired" is derived from `expiresAt`, not a persisted status value — verified, and worth stating precisely

> **Resolved.** Re-confirmed against installed `better-auth@1.6.23` (`plugins/organization/schema.mjs` — `invitationStatus` enum is `pending`/`accepted`/`rejected`/`canceled`, no `expired`; `adapter.mjs` `findPendingInvitation(s)` filter status pending then JS-filter `expiresAt > now`, `listInvitations` filters neither). Reworded Decision 2's status derivation: dropped "filters on `invitation.status`", stated Expired is derived (`status: "pending" AND expiresAt < now`) with no `expired` status in 1.6.23, and noted the native pipelines bypass the plugin helpers so must `$match status: "pending"` and split Invited/Expired on `expiresAt` themselves. Wording only.

Decision 2 (design.md:67) says status derivation "filters on BetterAuth's `invitation.status`" and lists "`status: pending` invitation → **Invited**; `status: pending` and past `expiresAt` → **Expired**." Verified against `better-auth@1.6.23`: `invitationStatus` is `z.enum(["pending","accepted","rejected","canceled"])` — **there is no `expired` status** (`plugins/organization/schema.mjs:5`). Expiry is computed: the org plugin's own `findPendingInvitation(s)` do `status: "pending"` **then** `.filter(invite => new Date(invite.expiresAt) > new Date())` in JS (`plugins/organization/adapter.mjs:648,660`), and the plain `listInvitations` filters **neither** status nor expiry — it returns every row for the org (`adapter.mjs:662–670`).

Two concrete consequences for the design's native reads (which don't go through the plugin's filtering helpers):

- The Invitations-tab / export pipeline must itself `$match status: "pending"` (to exclude accepted/rejected/canceled) and split Invited vs Expired on `expiresAt` vs "now" — it cannot lean on BetterAuth pre-filtering, because a native aggregation over `user-invitations` sees the raw rows.
- The phrasing "filters on BetterAuth's `invitation.status`" is misleading for the Expired case: Expired is not a status, it's `status: pending AND expiresAt < now`. This is the same depth the design already applied to the ban fields (Decision 2, Review 1 #6) — bake the verified fact in.

**Fix:** reword Decision 2 to say the native pipeline matches `status: "pending"` and derives Invited/Expired from `expiresAt` (no `expired` status exists in 1.6.23), and note the pipeline must filter status/expiry itself.

## Still open from Review 1 (no resolution annotation yet)

These Review 1 findings carry no `> **Resolved.**`/`Rejected`/`Deferred` annotation and are unchanged in the current design; they remain live for `/r:design-action-review`. Not re-argued here:

- **#9** — `suspension` defaults `true`: a suite-wide (`BanUser` reaches every app) destructive capability on by default (design.md:88). Least-privilege vs "trusted operator group" is a call the design still defaults toward the latter without extra justification.
- **#10** — the required `roles` display var can drift from the compiled catalog: it's a separate source from the catalog the steps validate against, so an author can list a catalog-absent role (UI offers it, step rejects at write) or omit a catalog role (silently unassignable) (design.md:121). No build-time reconciliation is specified.
- **#11** — cross-app disclosure (badges + ban-dialog membership enumeration, Decisions 4/6) bakes in "one trusted operator group across the suite" with no opt-out; that's a deployment property, not a given (design.md:83,101).
- **#12** — partial-failure semantics of the multi-step routines (access save = `UpdateMemberRoles` + `UpdateMemberAttributes`; invite = create-or-link contact → `InviteMember`) are still undefined, despite crisp audit events being a stated benefit of the per-section decomposition (Decision 3).
- **#14** — `mockups/screens/all.html` renders Members and Invitations stacked, which reads against the tabs decision that remains the open question (design.md:168).
