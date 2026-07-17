# Org-Aware Modules

Every module in this repo assumes one organization per MongoDB database: no collection carries an organization field, every list and selector reads the whole collection, and email uniqueness is global. This design makes the module data layer organization-aware — unconditionally — so the same modules work unchanged under both deployment shapes of the BetterAuth engine: `auth.organizations.policy: pinned` (one org per deployment/database) and `policy: tenant` (one shared deployment, many orgs). Tenancy becomes a deployment configuration choice, not a module architecture choice.

## Proposed change

1. Every module-owned collection gains an **`organizationId`** field — `user-contacts`, `companies`, `activities`, `actions`, `workflows`, `log-events`, `files`, `notifications` — stamped server-side by the platform's tenant wall, never authored in module config (one carve-out: system-context writes name the org explicitly, Decision 7).
2. Every module-owned connection declares **`tenant: true`** ([mongodb-data-scoping](../../../lowdefy-design/designs/auth-upgrade/features/mongodb-data-scoping/design.md)). List pipelines, selectors, exports, `$graphLookup` traversals, and timeline reads need **no per-pipeline changes** — the wall injects the org filter mechanically, including into `$lookup`/`$unionWith`/`$facet` sub-pipelines.
3. Uniqueness rules become **per-org**: the unique index on the contact's `lowercase_email` becomes compound `{ organizationId, lowercase_email }`. The `create-or-link-contact` upsert needs no hand change on caller-ful paths — the wall merges the org equality into the upsert selector, and MongoDB carries filter equalities into upserted documents (its system-context caller names the org per Decision 7).
4. Where module config needs the org id explicitly (rare), it reads **`_user: organizationId`** — which resolves under both policies — never the `pinned`-only `_organization` operator.
5. The **org backfill folds into the user-contacts split migration** already planned by [user-admin-better-auth](../user-admin-better-auth/design.md) / [user-account-better-auth](../user-account-better-auth/design.md), so consuming apps migrate once, not twice.
6. Four platform gaps are recorded as **[upstream asks](upstream-asks.md)**: the tenant wall's missing Atlas `$search` interaction, per-membership contact linkage, the sibling designs' `_organization` usage, and merge-on-signup's org-less binding point.

**Scope**: the domain modules and shared fragments in this repo. The tenant-_shape_ user surface — org switcher, tenant self-serve, multi-tenant administration — is not here (Non-goals); this design makes the data layer safe for it.

**Dependency**: the tenant wall ([mongodb-data-scoping](../../../lowdefy-design/designs/auth-upgrade/features/mongodb-data-scoping/design.md)) — design-stage upstream, not yet implemented. Implementation of this design is blocked on it; the design itself is not. See [Framework prerequisites](#framework-prerequisites) for exactly what must ship, and how it reaches this repo.

---

## Problem

The current single-org assumptions are structural, not incidental. Concretely, if two organizations shared one database today:

- **Identity collides.** `modules/contacts/api/create-contact.yaml` (duplicate check) and `modules/user-admin/api/invite-user.yaml` (upsert filter) key on `lowercase_email` alone — two orgs adding the same email converge on one physical document, and each org's edits overwrite what the other sees.
- **Every read leaks.** `get_all_contacts`, `get_all_companies`, `get_activities`, every `*_for_selector` request, and every Excel export scan the full collection, filtered at most by soft-delete or `app_name`. Every dropdown would list every org's records.
- **Traversals and logs leak.** `get_descendant_company_ids.yaml`'s `$graphLookup` walks the whole `companies` collection; `log-events` timelines match on entity id alone with no org check as defense in depth.
- **The seams can't carry a fix.** `request_stages.filter_match` / `selector` vars could bolt an org filter onto _some_ list pipelines, but selectors without hooks, write paths, and exports would each need bespoke handling — per-app, per-request, opt-in scoping of exactly the kind the platform's data-scoping design rejects ("a filter you write is a filter you can write wrongly").

The platform's answer is the tenant wall: declared once on the connection, enforced on reads _and_ writes, fail-closed. What's missing is the module side: no collection carries the field the wall filters on, no connection declares it, and the in-flight BetterAuth module redesigns scope themselves to `pinned` only.

The existing `app_name` scoping is a different axis — it partitions _apps_ sharing a database (a team portal vs a customer portal), not _customer organizations_ within one app. It stays untouched; the two axes compose.

---

## Framework prerequisites

Every change this design prescribes lands in this repo, but none of it can start until the framework ships the machinery it builds on. The concrete framework surface required, all in the lowdefy repo:

1. **The tenant wall itself** — the [mongodb-data-scoping](../../../lowdefy-design/designs/auth-upgrade/features/mongodb-data-scoping/design.md) implementation: connection-level `tenant:`, write stamping, recursive pipeline injection, change-stream matching, and the request-level `tenant: none` sentinel (`connection-mongodb` + the request layer).
2. **`context.user.organizationId` exposure** — resolved on every caller and readable as `_user: organizationId` (part of the wall design's runtime section; Decisions 3 and 7 here depend on it).
3. **The `$search` clause** — [upstream ask 1](upstream-asks.md); without it the wall breaks every `$search`-led list pipeline in this repo, so it must ship *with* the wall, not after it.
4. **`session.create.after` hook payload carrying the resolved org** — the binding point [upstream ask 4](upstream-asks.md) relocates the merge-on-signup mint to; the hook point exists, the payload contents need confirming when that ask is actioned.

**Delivery path**: these ship as an **experimental lowdefy release**, the same channel this repo already consumes (the demo app pins `experimental-*` versions). The expected loop: the wall (with the `$search` clause) lands in an experimental release → this repo bumps its pinned version → the module tasks proceed against it, build-verified through the demo app. Module implementation tasks should not be scheduled before that experimental release exists.

Upstream asks 2 and 3 are *not* prerequisites — ask 2 has a documented v1 fallback, and ask 3 targets the sibling designs' own config.

---

## Key decisions

### 1. Org-aware unconditionally — no policy branches in module config

Modules stamp and scope by organization _always_, under both policies. Under `pinned` every document in the database carries the same `organizationId` (the deployment's auto-seeded org) and the wall's injected filter matches everything — harmless, near-invisible. Under `tenant` the same field and filter are load-bearing. There is no `multi_tenant` var, no `when:` branch, no second module variant.

**Rationale**: the engine made organizations always-on precisely so there is no "non-org" code path; the module layer should spend that guarantee rather than re-litigate it. One correct way: a module that branches on tenancy is two modules that share a folder — twice the surface to test and document, and the untaken branch rots. The cost under `pinned` is one indexed field whose value never varies; the payoff is that `pinned` vs `tenant` becomes a deployment decision made in `lowdefy.yaml`, after the modules are written.

### 2. The wall is the one scoping mechanism — no org vars, no authored filters

Every module-owned connection (see the inventory below) declares `tenant: true`. No module pipeline references `organizationId` in a `$match`, filter, or write — the wall _rejects_ authored tenant-field usage in those positions, and that rejection is the point: scoping happens in exactly one place, mechanically. The one carve-out is system-context writes, which run outside the wall by necessity and must name the org explicitly under Decision 7's rule.

Consequences worth naming:

- **The audited leak points close without touching the pipelines.** List requests, selectors, exports, and `$graphLookup` (via `restrictSearchWithMatch` injection) are corrected by the connection declaration alone.
- **Cross-module `$lookup`s stay inside the wall** because every joined collection also carries the field: `activities` joins `user-contacts` / `companies` / `actions`; `events` joins `actions` / `user-contacts` — all in the inventory. This satisfies the wall's contract that every collection reachable from a tenant connection carries the tenant field.
- **Collection-substitution vars inherit that contract.** `activities`' `lookup_collections` and `events`' `actions_collection` / `contacts_collection` let a consumer substitute a joined collection by name; the injector filters those sub-pipelines regardless of the name, so any substituted collection must itself carry the tenant field or the join fails closed (empty). Each affected var's manifest `description:` states this, surfacing in the generated `vars.md`.
- **Change stamps don't change.** "Which org did this happen in" is answered by the document's wall-stamped `organizationId`, not by extending `modules/events/defaults/change_stamp.yaml`.
- **The same collection may legitimately be reached walled and unwalled.** The wall is per-connection, not per-collection: the `contacts` module's `user-contacts` connection is walled, while `user-admin`'s native reads join `user-contacts` from unwalled auth-collection connections with explicit root scoping (that design's Decision 1 rationale — its joined collections don't all carry the field, and some of its reads are deliberately cross-org). Both are correct; neither should be "fixed" to match the other.

### 3. Explicit org references use `_user: organizationId`, never `_organization`

The `_organization` operator throws under the `tenant` policy by design. `context.user.organizationId` — the caller's active org, exposed as `_user: organizationId` — resolves under both policies, and under `pinned` equals the pinned org (drift is impossible there: `set-active-organization` is disabled under `pinned`, [role-catalog](../../../lowdefy-design/designs/auth-upgrade/features/role-catalog/design.md) Decision 4). Domain modules should almost never need this — the wall covers data access — but where an explicit value is unavoidable, this is the one to use. The sibling designs' `_organization: id` usage is flagged to them as [upstream ask 3](upstream-asks.md), not changed here.

### 4. Per-org uniqueness; the upsert mechanics come free

The contact identity invariant becomes "one contact per email **per organization**": a compound unique index `{ organizationId, lowercase_email }` replaces the global one. The shared `create-or-link-contact` fragment (user-admin Decision 7 / user-account Decision 7) keeps its `lowercase_email` upsert key unchanged in config — on a walled connection the org equality is merged into the upsert selector, MongoDB carries the filter's equality clauses into any inserted document, and the stamp rule covers the rest. Duplicate-key reconciliation now reconciles within the org, which is the correct semantics: two orgs holding a contact for the same email are two facts about two relationships, not a collision.

Under `pinned` (one org value database-wide) the compound index enforces exactly what the global index enforces today — nothing is lost.

The free mechanics hold for caller-ful paths (the admin invite flow). The fragment's system-context caller — the merge-on-signup create half — runs under `tenant: none` and supplies `organizationId` explicitly per Decision 7 / [upstream ask 4](upstream-asks.md); the compound unique index guards both paths identically.

### 5. One migration event, not two

The BetterAuth module redesigns already commit consuming apps to a data migration (splitting the fused `user_contacts` record into `contact` / `user` / `member`). The org-awareness steps ride the same migration: backfill `organizationId` onto every module collection with the deployment's org id (an input to the migration — under `pinned` there is exactly one), rebuild the email index compound, and add `tenant: true` to the module connections. A fresh `tenant`-policy deployment has nothing to backfill. This lands in the same consumer migration guide the sibling designs already promise.

### 6. Cross-org reads are a `pinned`-shape privilege

user-admin's suite-wide ban enumeration and cross-app badges rest on an explicit premise — "the pinned suite is administered by one trusted operator group" — that is true within a pinned suite and false across tenants. Nothing breaks now (that module declares itself `pinned`-scoped), but the rule this design fixes for successors: **a deliberate cross-org read is a `pinned`-shape feature and must be policy-conditional**; under `tenant`, disclosure across the org boundary is a leak, whoever the caller is. The future multi-tenant admin module designs against this rule from day one.

### 7. System-context writes name their org explicitly

The wall fails closed for system-context callers — hook routines and scheduled jobs have no caller, so no active org resolves ([mongodb-data-scoping](../../../lowdefy-design/designs/auth-upgrade/features/mongodb-data-scoping/design.md) Decision 6). The rule for module write paths that run there: the request carries `tenant: none` **plus** an explicit `organizationId` whose provenance is documented — read from data the system already holds (the hook's payload, the triggering record, the notification recipient's contact) — never defaulted or invented. A bare `tenant: none` with no explicit org is forbidden in module config: opting out of the wall without supplying the org would turn every system path into an unaudited hole in it.

Known surfaces today: notification sends from scheduled or hook-driven routines (provenance: the recipient contact's `organizationId`), and the merge-on-signup contact mint — which additionally cannot know its org at its current binding point under `tenant` (the org is minted lazily at first session, after `email.verified` / `user.create.before` fire). Relocating that mint to an org-knowing binding point is [upstream ask 4](upstream-asks.md).

---

## Collection inventory

| Module                               | Connection                                   | Collection             | Change                                                                                                    |
| ------------------------------------ | -------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| contacts / user-account / user-admin | `contacts-collection` (and siblings)         | `user-contacts`        | `organizationId` + `tenant: true`; compound unique email index (Decision 4)                               |
| companies                            | `companies-collection`                       | `companies`            | `organizationId` + `tenant: true` (covers `$graphLookup` hierarchy)                                       |
| activities                           | `activities-collection`                      | `activities`           | `organizationId` + `tenant: true`                                                                         |
| workflows (+ activities lookups)     | `actions-collection`, `workflows-collection` | `actions`, `workflows` | `organizationId` + `tenant: true`; `access.{app_name}` stays (app axis, orthogonal)                       |
| events                               | `events-collection`, `events-timeline`       | `log-events`           | `organizationId` + `tenant: true` (timeline gains org defense in depth)                                   |
| files                                | `files-collection`                           | `files`                | `organizationId` + `tenant: true`; S3 object keys unchanged — access is gated by the walled metadata read |
| notifications                        | `notifications-collection`                   | `notifications`        | `organizationId` + `tenant: true`, composing with the existing `contact_id` + `created.app_name` filters  |

`layout` and `release-notes` touch no collections; user-admin/user-account's read-only auth-collection connections (`users`, `user-members`, …) stay unwalled per Decision 2. Index guidance follows the wall design's Decision 8: each collection's primary compound indexes gain the `organizationId` prefix; index definitions are consumer/app-owned, documented in the migration guide.

---

## Upstream asks

Specified in **[upstream-asks.md](upstream-asks.md)**; summarized:

1. **Tenant wall × Atlas `$search`** (blocking) — `$search` must be a pipeline's first stage, so the wall's stage-0 `$match` injection breaks every `$search`-led list pipeline in this repo (`get_all_contacts`, `get_all_companies`, `get_activities`), and authoring the org equality inside the `$search` compound is rejected by the wall's authored-field rule. The wall needs a `$search` clause: rewrite stage-0 `$search` to inject a `compound.filter` equals on the tenant field (requiring the field in the Atlas index), or document `$search` as unsupported on tenant connections with a sanctioned alternative.
2. **Per-membership contact linkage** — `user.profile.contactId` links a user to exactly one contact, but with org-scoped contacts a multi-org user needs one linked contact _per org_. Proposal: the link moves to (or is overlaid by) the `member` row. `pinned` deployments never hit this; recorded with the v1 limitation stated.
3. **`_organization` → `_user: organizationId` in the sibling designs** — a flag to user-admin/user-account (and any future module): scope on the both-policy operator so their native-read scoping survives the `tenant` policy unchanged (their cross-org _features_ remain `pinned`-scoped per Decision 6).
4. **Merge-on-signup's contact mint needs an org-knowing binding point** — its current bindings (`email.verified` / `user.create.before`) run in system context _and_ fire before a `tenant`-policy signup's org exists; the create half should relocate (most plausibly to `session.create.after`) and write per Decision 7.

---

## Migration

For existing consumers, one data step folded into the BetterAuth module migration (Decision 5). **The order is forced** — the wall fails closed over unstamped rows, so the consumer migration guide must present these as ordered steps, not a checklist:

1. Upgrade the deployment to the BetterAuth engine; startup auto-seeds the pinned organization.
2. Read the seeded org id and backfill `organizationId` onto every module collection using its **string form** — the id's serialized string, matching what the wall stamps (`context.user.organizationId` resolves as a string even though the auth collections store the typed ObjectId/UUID).
3. Rebuild the `lowercase_email` unique index compound (Decision 4).
4. Only then adopt the module versions whose connections declare `tenant: true`. Deployed any earlier, the walled connections render every pre-backfill document invisible — fail-closed, app-wide, silent.

No config-level breaking change beyond the module version itself — no vars are added or removed by this design.

---

## Non-goals

- **Multi-tenant administration module** (org switching UI, tenant creation/self-serve, seat management, cross-tenant operator console) — separate future design; this design supplies the data layer it requires and the rule it must follow (Decision 6).
- **Redesigning user-admin / user-account** — deltas are upstream asks to those designs, not changes here.
- **Per-tenant collection or database namespacing** — the per-tenant-database shape is served by the `pinned` policy (one deployment per tenant), not by dynamic collection routing.
- **Attribute scopes (`scope:`)** — row filtering within an org is app/consumer territory; this design only takes the wall.
- **Verb-level RBAC** — separate, still-planned platform design.

---

## Open questions

- **Demo consumer for the `tenant` shape.** The demo app builds under `pinned`. Every capability needs a build-verified consumer — for a policy whose behavior is runtime scoping, what does that consumer look like? Candidates: a second demo build target with `policy: tenant`, or e2e fixtures seeding two orgs and asserting isolation. Decide at task breakdown.
- **Wall milestone timing.** The wall design's own open question — whether `tenant:` ships with the platform major — decides whether this design's implementation can piggyback the sibling designs' migration (Decision 5) or trails it. If the wall slips, the migration should still backfill `organizationId` so the wall's later adoption is config-only.

## Related

- [mongodb-data-scoping](../../../lowdefy-design/designs/auth-upgrade/features/mongodb-data-scoping/design.md) — the tenant wall this design consumes.
- [user-admin-better-auth](../user-admin-better-auth/design.md) / [user-account-better-auth](../user-account-better-auth/design.md) — the sibling redesigns whose migration this design rides and whose scoping choices asks 2–4 address.
- [user-model](../../../lowdefy-design/designs/auth-upgrade/concepts/user-model/design.md) — the `pinned` / `tenant` policy axis and the contact / user / member split.
