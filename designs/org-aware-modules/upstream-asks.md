# Org-Aware Modules — Upstream Asks

Platform-side gaps this design depends on or flags, addressed to the auth-upgrade designs in `lowdefy-design` and to the sibling module designs in this repo. Numbering matches the summary in [design.md](design.md).

## 1. Tenant wall × Atlas `$search` (blocking)

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

**To**: [user-model](../../../lowdefy-design/designs/auth-upgrade/concepts/user-model/design.md) / [user-profile](../../../lowdefy-design/designs/auth-upgrade/_completed/user-profile/design.md).

`user.profile.contactId` links a user to exactly **one** contact. With org-scoped contacts (this design's Decision 4), a user who is a member of several orgs — the multi-org consultant the `tenant` policy exists for — has a distinct CRM identity _per org_: each org's contact record for them is a fact about that org's relationship. A single `contactId` cannot express this, and whichever org's contact wins the link, the others' modules (profile display, merge-on-signup, invite check) read the wrong org's contact or none.

**Ask**: move (or overlay) the contact link onto the membership — e.g. the `member` row carries the `contactId` for its org, with `user.profile.contactId` retained as the `pinned`-shape fast path or derived from the active membership. The accept-time `profile` merge and the merge-on-signup hook would link per-org.

**v1 fallback if declined/deferred**: document the limitation — under `tenant`, the user-linked contact is the one from the org that first linked it; other orgs' contacts for the same person are unlinked CRM records. `pinned` deployments (one org) never observe the difference. This fallback is livable but leaks wrong-org profile data into self-service pages for multi-org users, so it should not outlive the multi-tenant admin design.

## 3. `_organization` → `_user: organizationId` in the sibling module designs

> **Resolved (2026-07-20).** All four `_organization: id` sites (user-admin's `check-invite-email`, `invite`, `delete-user`) swapped to `_user: organizationId` — value-identical for a caller-ful endpoint under `pinned`, and resolving under both policies. user-account had no operator usage. The modules' cross-org features remain `pinned`-shape per Decision 6; only the scoping value changed.

**To**: [user-admin-better-auth](../user-admin-better-auth/design.md), [user-account-better-auth](../user-account-better-auth/design.md).

Both designs scope native reads with the server-side `_organization: id` operator, which **throws under the `tenant` policy** by design (there is no pinned org to resolve). `_user: organizationId` — the caller's active org — resolves under both policies and, under `pinned`, always equals the pinned org (`set-active-organization` is disabled there, [role-catalog](../../../lowdefy-design/designs/auth-upgrade/features/role-catalog/design.md) Decision 4), so the substitution is behavior-preserving for the designs' current scope.

**Ask**: switch the native-read `$match` scoping to `_user: organizationId`, so the reads survive a future `tenant`-policy deployment without rework. This does **not** extend those modules' scope: their deliberately cross-org features (suite-wide ban enumeration, cross-app badges) remain `pinned`-shape features per this design's Decision 6, and their multi-tenant successor is a separate design. The ask is only that the _scoping value_ be the policy-portable one.

## 4. Merge-on-signup's contact mint needs an org-knowing binding point

> **Resolved (2026-07-20).** Both halves landed: the platform ships `session.create.after` with `session.activeOrganizationId` stamped pre-write under both policies (verified in the pinned experimental release), and the mint is rebound there — org read from the hook payload, stamped explicitly through the unwalled connection per Decision 7. The invariant relaxed to "contact by first *verified* session with an active org". See [implementation-notes](implementation-notes.md).

**To**: [user-account-better-auth](../user-account-better-auth/design.md), touching [hooks](../../../lowdefy-design/designs/auth-upgrade/concepts/hooks/design.md) / [user-model](../../../lowdefy-design/designs/auth-upgrade/concepts/user-model/design.md) as needed.

That design's Decision 7 binds the create-or-link contact endpoint at `email.verified` and `user.create.before`. Both bindings run in **system context** (no caller, so the tenant wall fails closed on a walled `user-contacts` connection), and both fire **before a `tenant`-policy signup's organization exists** — the org is minted lazily at `session.create` (user-model). So the create half fails twice over: the wall rejects the caller-less write, and even with `tenant: none` there is no org id to stamp yet.

**Ask**: relocate the create half to a binding point where the org is resolved — most plausibly `session.create.after`, after the engine's active-org policy hook has resolved or minted the org — reading the org id from the hook payload and writing under `tenant: none` per this design's Decision 7 (explicit org, documented provenance). The link-only half (setting `profile.contactId` against an existing contact) and the invited path are unaffected — the inviting admin's session already created and stamped the contact. Whether that design's invariant "every user has a contact by first session" relaxes to "by first request" is its call; the constraint from this side is only that the mint must not precede the org.
