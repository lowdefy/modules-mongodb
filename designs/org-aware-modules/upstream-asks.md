# Org-Aware Modules — Upstream Asks

Platform-side gaps this design depends on or flags, addressed to the auth-upgrade designs in `lowdefy-design` and to the sibling module designs in this repo. Numbering matches the summary in [design.md](design.md).

## 1. Tenant wall × Atlas `$search` (blocking)

> **Resolved, then superseded (2026-07-22).** The in-stage rewrite this ask proposed shipped with the wall — and was then replaced by the wall design's [amendment-1](../../../lowdefy-design/designs/auth-upgrade/features/mongodb-data-scoping/amendment-1-authored-scoping.md): the wall never rewrites the inside of a stage. `$search`-led pipelines (and `$graphLookup`) now declare `tenant: authored` and author the organization `equals` clause themselves — value `_user: organizationId` — which the wall **audits** against the caller's resolved org on every run, refusing to run on any miss. This repo's six `$search` requests and two `$graphLookup` sites carry the authored clauses. The `token`-mapping and `storedSource` consumer requirements below stand unchanged; the "rejected by the wall itself" rule (line below) is inverted at exactly the audited positions, where the clause is now _required_.

**To**: [mongodb-data-scoping](../../../lowdefy-design/designs/auth-upgrade/features/mongodb-data-scoping/design.md).

The wall's aggregation injection (its Decision 3) prepends the merged `$match` at stage 0. Atlas Search's `$search` stage **must be the first stage of a pipeline** — injecting a `$match` before it makes the pipeline invalid, and letting `$search` run before the injected `$match` would be correct but unindexed-by-the-wall only by accident of ordering rules. The wall design does not mention `$search`.

This is not an edge case for this repo: the primary list pipelines lead with `$search` (`modules/contacts/requests/get_all_contacts.yaml`, `modules/companies/requests/get_all_companies.yaml`, `modules/activities/requests/get_activities.yaml`), and the `request_stages.filter_match` extension seam appends clauses _inside_ the `$search` compound.

The natural module-side workaround — authoring `equals: { path: organizationId, value: ... }` into the `$search` compound filter — is **rejected by the wall itself**: the tenant field may never be authored in a filter position, and there is no per-stage exemption. `tenant: none` on the request would disable the whole wall for exactly the requests that scan whole collections — the worst place to opt out.

**Ask**: give the wall a `$search` clause. The shape we'd propose: when a tenant connection's pipeline begins with `$search`, the injector rewrites the stage to add the tenant equality as a `compound.filter` `equals` clause (mechanically, same trust model as the stage-0 `$match`), and additionally injects the standard `$match` immediately after `$search` as belt-and-braces. This requires the tenant field to be mapped in the Atlas Search index — a documented consumer requirement alongside the wall's existing compound-index guidance (its Decision 8). If the wall instead declares `$search` unsupported on tenant connections, this repo needs a sanctioned alternative for org-scoped full-text search before modules can adopt the wall.

**Feasibility — verified against the Atlas Search docs:**

- The rewrite is total and semantics-preserving. A `$search` already using `compound` gains the equals clause appended to its `filter` array (created if absent); a `$search` using a bare top-level operator (`text`, `autocomplete`, `phrase`, …) is wrapped as `compound: { must: [<original operator>], filter: [<equals>] }` — the docs state any top-level operator may be nested in a compound clause, and `filter` clauses "do not contribute to a returned document's score," so wrapping preserves matching **and** relevance ordering ([compound](https://www.mongodb.com/docs/atlas/atlas-search/compound/)). Stage-level options (`index`, `count`, `highlight`, `returnStoredSource`, `sort`) sit beside the operator and are untouched.
- Because the filter runs _inside_ the search, `$search`-computed counts (`count`, `$$SEARCH_META`) are tenant-correct — a post-`$search` `$match` alone could not deliver that, which is an additional reason the in-stage injection is the right mechanism (the trailing `$match` stays as defense in depth only).
- The `equals` operator supports string, objectId, uuid, number, date, boolean, and null. **A string tenant field must be statically mapped as the `token` type — dynamic mapping does not create token fields** ([equals](https://www.mongodb.com/docs/atlas/atlas-search/equals/)). The stamped value _is_ a string — but by serialization, not storage: the auth collections store the org id as ObjectId (or UUID under `generateId: 'uuid'`; `createSerializeId.js` in the vendored adapter), and the adapter serializes ids to strings on read (`mongodbAdapter.js`, `toString`/`toHexString`), so `context.user.organizationId` — the value the wall stamps and filters with on app data — is the id's string form. The concrete consumer requirement is therefore: every Atlas Search index on a walled collection maps the tenant field as `token`. (The type divergence from the auth collections is harmless to the wall — app data is never joined to auth rows on this field by these modules.) Fail-closed note for the wall design: a missing/wrong mapping makes the injected `equals` match nothing — safe (no leak), loud in dev.
- **`returnStoredSource` adds a second index requirement.** `get_all_contacts.yaml` / `get_all_companies.yaml` set `returnStoredSource: true` on their `$search`, so post-`$search` stages see only fields stored in the search index — the belt-and-braces `$match` on the tenant field matches _nothing_ unless the field is also listed in the index's `storedSource`. Consumer requirement: on walled collections the tenant field must be both `token`-mapped and `storedSource`-included wherever `returnStoredSource` is used. Forgetting it is fail-closed (no leak) but silently blanks every list page — the guidance must carry both halves together.
- **The rejection scan should extend into the rewritten `$search`.** The `request_stages.filter_match` seam appends consumer clauses _inside_ the `$search` compound, so the wall's authored-tenant-field rejection (its Decision 2) should also scan `$search` stage internals once the wall handles the stage. Authoring the field there cannot bypass the wall (the injected filter still ANDs in) — this is the same loud-error-over-silent-no-match DX rationale the wall already applies to `$match` positions.

_(`$searchMeta` has the same first-stage constraint and should get the same treatment.)_

## 2. Per-membership contact linkage

> **Withdrawn (2026-07-31) — resolved module-side by moving the link, not by adding platform surface.** No platform change is needed. The premise was right that a per-org contact needs a per-org link; what was wrong was which side holds it. `user.profile.contactId` is gone. The **contact** now carries `userId`: a contact row is already per-organization, so the link belongs there, and — decisively — the contact is the row these modules own and can write at any moment, whereas the `user` and `member` rows can only be written at points the engine controls.
>
> **Why not the `member` row, which this ask proposed** — verified against the engine source, not inferred:
>
> - **Nothing runs when someone joins an organization.** `packages/build/src/build/buildAuth/authHookPoints.js` is the exhaustive bindable set (user / session / account / verification / phone); there is no member or invitation point, and the engine's own `afterAcceptInvitation` binding (`packages/api/src/routes/auth/organizations/buildOrganizationPlugin.js`) is engine-tier, not offered to modules. So a membership-side pointer could never be written at accept — the earliest a module hears is the person's next login.
> - **Only system context could write it.** `UpdateUserProfile` is the only step carrying `meta.selfTargetExempt`, so `UpdateMemberAttributes` from a caller-ful routine demands `auth.userAdminRole` — forbidden under `tenant`. That leaves `system: true`, i.e. the login hook, i.e. never at accept.
> - **It would share a bag with authorization inputs.** `UpdateMemberAttributes` replaces `attributes` wholesale, so stamping a contact id there is a read-modify-write over admin-set authorization state.
> - The client `InviteMember` also cannot carry `profile`/`attributes` (`packages/client/src/auth/createAuthMethods.js:435` forwards only `{ email, role }`), so the invitation could not carry the link either.
>
> The contact-side link has none of those constraints: the module writes its own walled collection at the moment it is asked, so there is no lifecycle point to depend on. The address remains the **claim key** for the one case a contact predates its person's auth user (an invite) — matched once, then never again for identity, so an email change cannot break the link. The runtime failure that forced all this (a walled profile write missing because the pointer named another org's row) is recorded in [test-flows](../auth-tenancy-verification/test-flows.md).
>
> One consequence is load-bearing and documented in [org-scoping](../../docs/shared/org-scoping.md): a contact is claimable by address, so the mint and the claim both require a **verified** email, and what carries the account-takeover guarantee is the deployment's `requireEmailVerification` (an unverified signup holds no session, so it can reach no walled read or claim).
>
> **Adjacent platform gap, worth its own ask if wanted:** a bindable hook point for a membership write would let any module act at the moment a person joins an organization (per-org defaults, a welcome record, a "joined" audit event) rather than at their next login. `authHookPoints.js` states that adding a point is additive and non-breaking. Not needed for contacts — the claim-on-first-resolution shape is pull, not push.

**To**: [user-model](../../../lowdefy-design/designs/auth-upgrade/concepts/user-model/design.md) / [user-profile](../../../lowdefy-design/designs/auth-upgrade/_completed/user-profile/design.md).

`user.profile.contactId` links a user to exactly **one** contact. With org-scoped contacts (this design's Decision 4), a user who is a member of several orgs — the multi-org consultant the `tenant` policy exists for — has a distinct CRM identity _per org_: each org's contact record for them is a fact about that org's relationship. A single `contactId` cannot express this, and whichever org's contact wins the link, the others' modules (profile display, merge-on-signup, invite check) read the wrong org's contact or none.

**Ask**: move (or overlay) the contact link onto the membership — e.g. the `member` row carries the `contactId` for its org, with `user.profile.contactId` retained as the `pinned`-shape fast path or derived from the active membership. The accept-time `profile` merge and the merge-on-signup hook would link per-org.

**v1 fallback if declined/deferred**: document the limitation — under `tenant`, the user-linked contact is the one from the org that first linked it; other orgs' contacts for the same person are unlinked CRM records. `pinned` deployments (one org) never observe the difference. This fallback is livable but leaks wrong-org profile data into self-service pages for multi-org users, so it should not outlive the multi-tenant admin design.

## 3. `_organization` → `_user: organizationId` in the sibling module designs

> **Resolved (2026-07-20).** All four `_organization: id` sites (user-admin's `check-invite-email`, `invite`, `delete-user`) swapped to `_user: organizationId` — value-identical for a caller-ful endpoint under `pinned`, and resolving under both policies. user-account had no operator usage. The modules' cross-org features remain `pinned`-shape per Decision 6; only the scoping value changed.

**To**: [user-admin-better-auth](../users/_completed/user-admin-better-auth/design.md), [user-account-better-auth](../users/_completed/user-account-better-auth/design.md).

Both designs scope native reads with the server-side `_organization: id` operator, which **throws under the `tenant` policy** by design (there is no pinned org to resolve). `_user: organizationId` — the caller's active org — resolves under both policies and, under `pinned`, always equals the pinned org (`set-active-organization` is disabled there, [role-catalog](../../../lowdefy-design/designs/auth-upgrade/features/role-catalog/design.md) Decision 4), so the substitution is behavior-preserving for the designs' current scope.

**Ask**: switch the native-read `$match` scoping to `_user: organizationId`, so the reads survive a future `tenant`-policy deployment without rework. This does **not** extend those modules' scope: their deliberately cross-org features (suite-wide ban enumeration, cross-app badges) remain `pinned`-shape features per this design's Decision 6, and their multi-tenant successor is a separate design. The ask is only that the _scoping value_ be the policy-portable one.

## 4. Merge-on-signup's contact mint needs an org-knowing binding point

> **Resolved (2026-07-20).** Both halves landed: the platform ships `session.create.after` with `session.activeOrganizationId` stamped pre-write under both policies (verified in the pinned experimental release), and the mint is rebound there — org read from the hook payload, stamped explicitly through the unwalled connection per Decision 7. The invariant relaxed to "contact by first _verified_ session with an active org". See [implementation-notes](implementation-notes.md).

**To**: [user-account-better-auth](../users/_completed/user-account-better-auth/design.md), touching [hooks](../../../lowdefy-design/designs/auth-upgrade/concepts/hooks/design.md) / [user-model](../../../lowdefy-design/designs/auth-upgrade/concepts/user-model/design.md) as needed.

That design's Decision 7 binds the create-or-link contact endpoint at `email.verified` and `user.create.before`. Both bindings run in **system context** (no caller, so the tenant wall fails closed on a walled `user-contacts` connection), and both fire **before a `tenant`-policy signup's organization exists** — the org is minted lazily at `session.create` (user-model). So the create half fails twice over: the wall rejects the caller-less write, and even with `tenant: none` there is no org id to stamp yet.

**Ask**: relocate the create half to a binding point where the org is resolved — most plausibly `session.create.after`, after the engine's active-org policy hook has resolved or minted the org — reading the org id from the hook payload and writing under `tenant: none` per this design's Decision 7 (explicit org, documented provenance). The link-only half (setting `profile.contactId` against an existing contact) and the invited path are unaffected — the inviting admin's session already created and stamped the contact. Whether that design's invariant "every user has a contact by first session" relaxes to "by first request" is its call; the constraint from this side is only that the mint must not precede the org.

## 5. The wall gates on the organizations policy

> **Resolved (2026-08-03).** Landed on `feat/mongodb-tenant-wall`, consumed from
> experimental release `20260803084426`. See
> [policy-conditional-wall](../policy-conditional-wall/design.md).

**To**: the tenant wall (lowdefy PR #2280).

The wall as first shipped engaged under both organization policies, which billed
every single-org consumer for a backfill, index rebuilds, and Atlas Search mapping
work that bought nothing (the injected filter is provably a no-op under `pinned`).

**Ask (as landed)**: `resolveTenant` returns no verdict unless the deployment
resolves `auth.organizations.policy: tenant` — placed after the connection-type
contract check, which stays on under both policies so an unenforceable `tenant:`
declaration fails on the current deployment rather than at flip time. With the
verdict fall away, deliberately: the authored-clause audit, the fail-closed error
for org-less callers, and the authored-tenant-field rejection. Three passengers
rode the same release: `organizations.policy` joined the `_build.authConfig`
allowlist; the build's best-effort entry-stage check now arms only under `tenant`;
and `_build.authConfig` folds **defer** on build walks that run before the auth
projection exists (module entry vars and components consumed through them),
resolving where the value is consumed — previously a hard boundary error whose
trigger depended on which consumer pulled a component in. The flip preflight
(design open question 2) also landed upstream: under `tenant` the server refuses
to serve while walled collections hold unstamped rows, naming them in one error.

## 6. Rename `tenant:` to a scoping-key declaration

> **Superseded by ask 8.** Noted here per
> [policy-conditional-wall](../policy-conditional-wall/design.md)'s non-goals, to be
> raised when the wall's config surface was next revised. Ask 8 is that revision, and
> it deletes `tenant: true` rather than renaming it — so the misreading below has
> nothing left to attach to. No rename is needed.

**To**: the tenant wall (lowdefy PR #2280).

Under the policy-conditional wall, `tenant: true` on a connection declares a
property of the data — _these rows are organization-scoped when the deployment is
multi-org_ — and does nothing under `pinned`. A name like `scopeField:` (or
similar) would read as the declaration it now is, rather than as an imperative
that suggests the wall is always on. Config-breaking for every declaration, so it
should ride a release that touches the wall's config surface anyway.

## 7. Reject unwalling remaps of tenant module connections

> **Resolved (2026-08-03).** Landed on `feat/mongodb-tenant-wall` (rides the next
> experimental release after `20260803084426`).

**To**: the tenant wall (lowdefy PR #2280).

A module entry's `connections:` remap swaps the module's whole connection
definition for the app's — including the module's `tenant:` declaration. The
author doing the remap is making a plumbing decision (a different database or
collection name) and nothing tells them the wall rode along: under
`policy: tenant` the module's plain reads run unfiltered and its writes
unstamped, while the module's `tenant: authored` requests keep their compiled
clause — so the list pages look correctly scoped while the reads and writes
underneath leak across organizations. That is a per-connection opt-out by
accident, the exact thing the policy-conditional design refuses to make
expressible (its open question 1).

**Ask (as landed)**: under `policy: tenant`, remapping a module connection that
declares `tenant:` to a target connection that does not is a build error naming
both connections and the fix (declare `tenant:` on the target, or drop the
remap). Under `pinned` remaps stay unrestricted — the flip to `tenant` is a
rebuild, so the guard fires there, before any traffic.

## 8. Invert the default: declare what is shared, not what is scoped

> **Raised as a framework amendment** —
> `auth-upgrade/mongodb-data-scoping/amendment-3-declare-shared`. Modules-side plan:
> [declare-shared-connections](../declare-shared-connections/design.md).
> **Subsumes ask 6**: with `tenant: true` deleted rather than renamed, the
> misreading that ask describes has nothing left to attach to.

**To**: the tenant wall (lowdefy PR #2280), before the release.

`tenant: true` on a connection does nothing under `pinned`, and `pinned` is what
every deployment that exists runs. Requiring it taxes every module author —
consuming apps author their own modules, so that means every app team — so the
framework can catch a mistake in the one deployment that may want multiple
organizations. Worse, a missing declaration is unauditable: this repo has 16
deliberate omissions, so absence carries no signal, and every mechanism that
could complain (the preflight, the entry-stage check, the remap guard) is
downstream of the declaration. The `deals` gap (T11/T12) went unnoticed through
three layers for exactly that reason.

**Ask**: make `auth.organizations.policy` set the scoping default for every
connection in the app. Under `tenant`, a connection whose type implements the
scoping contract is scoped; under `pinned`, none is, as today. A connection then
declares only its exception to that default — `tenant: shared`, for data
deliberately shared across organizations. Remove `tenant: true`. Stated this way
a connection carries no default of its own but inherits the app it is built into,
which is what lets one module file serve both policies with nothing in it about
tenancy.
Apply the rule uniformly to module-owned and app-owned connections; a split
would leave silence meaning "unscoped" for every connection an app defines
itself. This reverses mongodb-data-scoping Decision 6's refusal of a
connection-level opt-out, whose _intent_ — you cannot end up outside the wall
without saying so — the inversion serves and the opt-in rule never did.

**Also needed**, or the inversion opens a hole one layer down: a connection
**type** must declare whether it implements the scoping contract or is
non-scopable, and a type declaring neither is a build error under `tenant`.
Otherwise a data-bearing connection whose custom type implements no contract is
silently unscoped — a shape that already exists in a consuming app's own module.

**Settle in the amendment**: whether the framework recognises the auth adapter's
own collections. Ten of this repo's sixteen exceptions are module connections
onto engine-owned collections; if the platform knows that set, those need no
declaration and the exception list shrinks to the four interesting cases.
