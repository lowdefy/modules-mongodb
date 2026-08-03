---
title: Organization Scoping
module: shared
type: shared
concepts:
  [organizations, tenant-wall, multi-tenant, organizationId, indexes, migration, preflight]
---

# Organization Scoping

Every module in this repo is **organization-aware, policy-conditionally**. Every module-owned MongoDB connection declares `tenant: true`, which states a property of the data — *these rows are organization-scoped when the deployment is multi-org* — and delegates the decision to the platform. The platform's tenant wall engages **only** when the app declares `auth.organizations.policy: tenant`; there is no per-tenancy module variant, no `multi_tenant` var, and no organization filter to author in app config.

- Under **`pinned`** (the default — one organization per deployment, including apps with no `organizations:` block) the wall is **inert**: no `organizationId` is stamped on writes, no filter is merged into reads, and documents carry no `organizationId` field at all. Adopting these modules requires no backfill, no index changes, and no Atlas Search mapping work.
- Under **`tenant`** (one shared deployment, many organizations) the wall stamps the caller's active organization onto every write and merges an organization filter into every read, mechanically: a caller can never read or write another organization's records.

Both shapes have a worked example in this repo: `apps/demo` deploys the modules under `pinned`, `apps/tenant-demo` deploys the same set under `tenant` plus the [`organizations`](../organizations/) module. They are separate apps because the two policies are mutually exclusive in config — `auth.userAdminRole` is rejected under `tenant`, and the organization switcher's `SetActiveOrganization` action is rejected under `pinned` — not because the modules differ.

## What the wall covers (under `policy: tenant`)

Declared once per connection, enforced by the platform on reads **and** writes: find/aggregation filters (including `$lookup`, `$unionWith`, and `$facet` sub-pipelines), insert/upsert/replace stamping, update/delete selector merging, and change streams. Authoring `organizationId` in a filter or write position of module or app config is **rejected loudly** — scoping happens in exactly one place. Reading the field (projections, group keys) is fine.

**What the wall refuses instead of scoping**: stages it can not scope with its one mechanical move (prepending a `$match`) — a pipeline-leading Atlas `$search`/`$searchMeta`/`$vectorSearch`/`$geoNear`, and `$graphLookup` anywhere. Such a request must declare **`tenant: authored`** and author the organization clause itself (an `equals` on `organizationId` in the `$search` compound filter; an `organizationId` equality in `$graphLookup`'s `restrictSearchWithMatch`), with `_user: organizationId` as the value. The wall then **audits** the clause on every run — present, on the right field, equal to the caller's organization — and refuses to run the request on any miss.

This module repo's `$search` list pipelines, Excel exports, the contact selector, and the company hierarchy traversals all carry these authored clauses; a consuming app never adds its own. The clauses are **compiled in at build time only under `policy: tenant`** — every authored site references one shared policy fragment (`modules/shared/org/tenant-clause.yaml`), so a `pinned` build contains no organization clause anywhere. Mis-compilation is fail-closed in the direction that matters: under `tenant` the runtime audit refuses a request whose clause is missing, so a wrongly dropped clause fails loudly rather than leaking; under `pinned` a dropped clause is harmless by construction — one organization exists.

Three rules follow for app authors:

1. **Never write your own organization filter** on a walled connection — under `tenant` the wall injects it (or, in the authored requests above, the module already carries the audited clause), and under `pinned` there is nothing to filter. Where config genuinely needs the organization id as a value (rare), read `_user: organizationId`, which resolves under both policies. Never use the `_organization` operator in module-consuming config — it throws under the `tenant` policy.
2. **Substituted collections inherit the contract under `tenant`.** Vars that let an app substitute a joined collection by name (`activities.lookup_collections`, `events.actions_collection` / `contacts_collection`, `workflows.contacts_collection`) are joined inside walled pipelines, so under `policy: tenant` the substituted collection must itself carry `organizationId` — otherwise the join fails closed (empty). Under `pinned` no field is required.
3. **A connection remap must keep the wall.** A module entry's `connections:` remap swaps in the app's whole connection definition — including its `tenant:` declaration. Under `policy: tenant`, remapping a walled module connection to a target that does not declare `tenant:` is a **build error**; declare `tenant: true` (or the `{ field: ... }` form) on the target connection. Under `pinned` remaps are unrestricted, and the guard fires at the flip's rebuild.

## System-context writes (`tenant: none`)

Hook routines and scheduled jobs have no caller, so under `policy: tenant` the wall **fails closed** for them. The only opt-out is the request-level `tenant: none` sentinel, and the repo rule is: **`tenant: none` must be paired with an explicit `organizationId`** whose provenance is documented — read from data the system already holds (the triggering record, the recipient contact) — never defaulted or invented. Under `pinned` the sentinel is inert, so authoring it (and its explicit organization value) costs nothing and keeps the config tenant-portable. See `apps/demo/modules/notifications/send-routine.yaml` for the worked example: its aggregation steps opt out (they `$merge`, which walled connections reject) and stamp each merged notification with the source event's wall-stamped `organizationId`.

**The merge-on-signup contact mint follows the same rule.** `user-account`'s `ensure-contact-on-signup` runs from the `session.create.after` auth hook — the point where the caller's organization is resolved (`session.activeOrganizationId`, under both policies). It writes through the deliberately-unwalled `user-contacts-system` connection (a caller-less hook cannot pass the wall). Under `tenant` it stamps that explicit organization onto every minted contact (provenance: the session's resolved active org), so contacts minted at signup are org-stamped and visible to walled reads; under `pinned` the mint runs identically but stamps no organization — the stamp is compiled out with the rest of the policy fragment.

## A contact belongs to an organization; the auth user does not

A `user-contacts` row is per-organization, while the auth `user` is global. The link between them lives on the **contact** (`userId`), never on the user: a person who is a member of several organizations holds one contact in each, so the link belongs on the side that is already per-organization. A single contact id on the global user row could only ever be right for one organization, and every walled read or write made from the others would miss. (Under `pinned` there is exactly one contact per person and the same link works unchanged.)

Putting it on the contact also makes it maintainable. Membership is created by the auth engine — an org mint, an invitation accept, an admin add — and **no module code runs at those moments** (there is no bindable hook point for a membership write), so a pointer that had to be written when someone joins could not be kept true. The contact is app-owned, so the module writes the link the first time it is asked for that person's contact: the caller's contact is matched by `userId` (and, under `tenant`, within the caller's organization), and on a miss the unlinked row for their address is claimed. The address is the claim key, used once; afterwards the link is by id, so an email change cannot break it.

This puts one weight on email verification worth stating plainly: a contact is claimable by address, so both the mint and the claim require a **verified** email. What carries the account-takeover guarantee is the deployment's `requireEmailVerification` — with it set, an unverified signup holds no session and so cannot reach a read or claim at all. A deployment that allows sessions before verification must gate at the point of resolution instead.

## Index requirements (app-owned)

The modules create no indexes; these are the host app's job, and they differ by policy.

**Under `pinned`** (the default), a deployment keeps the single-organization shape:

1. A single-field unique-partial index on `user-contacts.lowercase_email` (unique, partial on `lowercase_email: { $exists: true }`) — one contact per address.
2. A single-field unique-partial index on `user-contacts.userId` (unique, partial on `userId: { $exists: true }`) — one contact per linked user; this carries contact resolution on the request path, so it is a correctness requirement rather than a tuning choice.
3. Whatever compound indexes the app's own read patterns need — no `organizationId` prefix, and **no Atlas Search mapping changes** (no `token` mapping, no `storedSource` entry for `organizationId`).

**Under `tenant`**:

1. **Organization-prefixed compound indexes.** Each walled collection's primary compound indexes gain the `organizationId` prefix (`{ organizationId: 1, ... }`) — one index serves all organizations and is the shard-key path at scale.
2. **Per-organization contact identity.** Two compound partial-unique indexes on `user-contacts` — see [user-account indexes](../user-account/reference/indexes.md):
   `{ organizationId: 1, lowercase_email: 1 }` (unique, partial on `lowercase_email: { $exists: true }`) and
   `{ organizationId: 1, userId: 1 }` (unique, partial on `userId: { $exists: true }`). These **replace** the pinned single-field indexes — a compound partial-unique index enforces nothing on rows missing `organizationId`, which is also why the backfill below must precede the index rebuild.
3. **Atlas Search indexes** on walled collections (`user-contacts`, `companies`, `activities`): the modules' `$search` requests author the organization equality _inside_ the stage (the audited `tenant: authored` clause above), which requires `organizationId` to be **statically mapped as the `token` type** in the search index (dynamic mapping does not create token fields). Where a pipeline uses `returnStoredSource` (contacts and companies list pipelines do), `organizationId` must **also be listed in the index's `storedSource`**. Both are fail-closed when forgotten — no leak, but silently blank list pages. Complete copy-pasteable definitions for all three indexes: [Atlas Search indexes](atlas-search-indexes.md).

## The flip is the migration event

Adopting these module versions on a `pinned` deployment is **not** a migration — nothing is stamped, nothing is filtered, no data changes. The migration happens when (and only when) a deployment flips to `policy: tenant`, because from that moment every walled read filters on `organizationId` and every document without it is invisible.

The platform makes a premature flip loud rather than blank: under `policy: tenant` the server runs a **tenant preflight** and refuses to serve while any walled collection holds documents missing `organizationId` (or carrying it as `null`), naming the collections to backfill in one aggregated error. The order for the flip:

1. **Backfill `organizationId`** onto every module collection (`user-contacts`, `companies`, `activities`, `actions`, `workflows`, `log-events`, `log-changes`, `files`, `notifications`, `deals`) using the organization id's **string form** — the id's serialized string, matching what the wall stamps (`context.user.organizationId` resolves as a string even though the auth collections store the typed id).
2. **Rebuild the contact identity indexes** compound (tenant requirement 2 above), add the organization prefix to the collections' compound indexes (requirement 1), and add the Atlas Search mappings (requirement 3).
3. **Declare `auth.organizations.policy: tenant`** and restart. The preflight verifies step 1; blank walled reads after a verified flip are an index or search-mapping gap (requirements 2–3), not a data gap.

A fresh `tenant` deployment has nothing to backfill — the preflight passes over empty collections.
