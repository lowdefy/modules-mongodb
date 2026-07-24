---
title: Organization Scoping
module: shared
type: shared
concepts:
  [organizations, tenant-wall, multi-tenant, organizationId, indexes, migration]
---

# Organization Scoping

Every module in this repo is **organization-aware, unconditionally**. Every module-owned collection carries an `organizationId` field, and every module-owned MongoDB connection declares `tenant: true` — the platform's tenant wall stamps the caller's active organization onto every write and merges an organization filter into every read, mechanically. There is no per-tenancy variant, no `multi_tenant` var, and no organization filter to author in app config: tenancy is a deployment decision (`auth.organizations.policy: pinned` or `tenant`), made after the modules are written.

- Under **`pinned`** (one organization per deployment) every document carries the deployment's auto-seeded organization id and the wall's filter matches everything — near-invisible, nothing to configure.
- Under **`tenant`** (one shared deployment, many organizations) the same field and filter are load-bearing: a caller can never read or write another organization's records.

## What the wall covers

Declared once per connection, enforced by the platform on reads **and** writes: find/aggregation filters (including `$lookup`, `$unionWith`, and `$facet` sub-pipelines), insert/upsert/replace stamping, update/delete selector merging, and change streams. Authoring `organizationId` in a filter or write position of module or app config is **rejected loudly** — scoping happens in exactly one place. Reading the field (projections, group keys) is fine.

**What the wall refuses instead of scoping**: stages it can not scope with its one mechanical move (prepending a `$match`) — a pipeline-leading Atlas `$search`/`$searchMeta`/`$vectorSearch`/`$geoNear`, and `$graphLookup` anywhere. Such a request must declare **`tenant: authored`** and author the organization clause itself (an `equals` on `organizationId` in the `$search` compound filter; an `organizationId` equality in `$graphLookup`'s `restrictSearchWithMatch`), with `_user: organizationId` as the value. The wall then **audits** the clause on every run — present, on the right field, equal to the caller's organization — and refuses to run the request on any miss. This module repo's `$search` list pipelines, Excel exports, the contact selector, and the company hierarchy traversals all carry these authored clauses; a consuming app never adds its own.

Two rules follow for app authors:

1. **Never write your own organization filter** on a walled connection — the wall injects it (or, in the authored requests above, the module already carries the audited clause). Where config genuinely needs the organization id as a value (rare), read `_user: organizationId`, which resolves under both policies. Never use the `_organization` operator in module-consuming config — it throws under the `tenant` policy.
2. **Substituted collections inherit the contract.** Vars that let an app substitute a joined collection by name (`activities.lookup_collections`, `events.actions_collection` / `contacts_collection`, `workflows.contacts_collection`) are joined inside walled pipelines, so the substituted collection must itself carry `organizationId` — otherwise the join fails closed (empty).

## System-context writes (`tenant: none`)

Hook routines and scheduled jobs have no caller, so the wall **fails closed** for them. The only opt-out is the request-level `tenant: none` sentinel, and the repo rule is: **`tenant: none` must be paired with an explicit `organizationId`** whose provenance is documented — read from data the system already holds (the triggering record, the recipient contact) — never defaulted or invented. See `apps/demo/modules/notifications/send-routine.yaml` for the worked example: its aggregation steps opt out (they `$merge`, which walled connections reject) and stamp each merged notification with the source event's wall-stamped `organizationId`.

**The merge-on-signup contact mint follows the same rule.** `user-account`'s `link-contact-on-signup` runs from the `session.create.after` auth hook — the point where the caller's organization is resolved (`session.activeOrganizationId`, under both policies). It writes through the deliberately-unwalled `user-contacts-system` connection (a caller-less hook cannot pass the wall), stamping that explicit organization onto every minted contact (provenance: the session's resolved active org). Contacts minted at signup are therefore org-stamped and visible to walled reads.

> **Migration note for deployments that ran the interim version** (mint bound at `user.create.before` / `email.verified`): contacts minted in that window carry no `organizationId`. Re-run the backfill step below once to stamp them.

## Index requirements (app-owned)

The modules create no indexes; these are the host app's job:

1. **Organization-prefixed compound indexes.** Each walled collection's primary compound indexes gain the `organizationId` prefix (`{ organizationId: 1, ... }`) — one index serves all organizations and is the shard-key path at scale.
2. **Per-organization email uniqueness.** The contact email index becomes compound partial-unique — see [user-account indexes](../user-account/reference/indexes.md):
   `{ organizationId: 1, lowercase_email: 1 }`, unique, partial on `lowercase_email: { $exists: true }`.
3. **Atlas Search indexes** on walled collections (`user-contacts`, `companies`, `activities`): the modules' `$search` requests author the organization equality _inside_ the stage (the audited `tenant: authored` clause above), which requires `organizationId` to be **statically mapped as the `token` type** in the search index (dynamic mapping does not create token fields). Where a pipeline uses `returnStoredSource` (contacts and companies list pipelines do), `organizationId` must **also be listed in the index's `storedSource`**. Both are fail-closed when forgotten — no leak, but silently blank list pages. Complete copy-pasteable definitions for all three indexes: [Atlas Search indexes](atlas-search-indexes.md).

## Migrating an existing deployment

The order is forced — the wall fails closed over unstamped rows, so deployed out of order the walled connections render every pre-backfill document invisible, app-wide, silently:

1. **Upgrade the deployment to the BetterAuth engine.** Startup auto-seeds the pinned organization.
2. **Backfill `organizationId`** onto every module collection (`user-contacts`, `companies`, `activities`, `actions`, `workflows`, `log-events`, `files`, `notifications`) using the seeded organization id's **string form** — the id's serialized string, matching what the wall stamps (`context.user.organizationId` resolves as a string even though the auth collections store the typed id).
3. **Rebuild the email unique index** compound per requirement 2 above, and add the organization prefix to the collections' compound indexes (requirement 1) and Atlas Search mappings (requirement 3).
4. **Only then adopt the module versions whose connections declare `tenant: true`.**

A fresh deployment has nothing to backfill — start at step 4.
