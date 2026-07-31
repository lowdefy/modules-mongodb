# Policy-Conditional Tenant Wall

[org-aware-modules](../org-aware-modules/design.md) Decision 1 made organization
scoping unconditional: modules stamp and filter by organization under both
`auth.organizations.policy: pinned` and `policy: tenant`. This design reverses that
for `pinned`. The wall engages **only** when an app declares `policy: tenant`; under
`pinned` a connection's `tenant:` declaration is inert and no `organizationId` is
written or filtered.

Modules keep declaring `tenant:` unconditionally. What moves is _where_ the policy
branch lives: from "nowhere" to the platform's single decision point.

**Supersedes**: org-aware-modules Decision 1. **Amends**: its Decisions 2, 4 and 5,
and its Migration section.

**Status**: not implemented. The wall as it stands today engages under both policies.

## Proposed change

1. **The platform gates on policy.** `resolveTenant` returns no verdict when the
   policy is `pinned`, so the connection applies nothing — no read filter, no write
   stamp, no selector merge, no change-stream scoping.
2. **Module connection declarations do not change.** All 14 `tenant: true` lines stay
   exactly as they are.
3. **The 13 module files that author the org clause themselves become
   policy-conditional at build time** — the 8 `tenant: authored` requests plus 5
   join/write sites that state their own organization.
4. **Index and Atlas Search requirements become policy-dependent.** A `pinned`
   deployment keeps single-field uniqueness and needs no search-index mapping changes.
5. **The flip from `pinned` to `tenant` becomes the migration event**, rather than the
   version upgrade.

## Problem

Decision 1's rationale was sound in isolation — one code path, no rotting branch, no
`multi_tenant` var. What it did not weigh is that the entire cost falls on consumers
that get no capability in return, and that the cost is not the field.

`organizationId` is **new**. It appears in 0 files under `modules/` on `main`, and in
none of the auth-upgrade work either — that branch touches the field only on the
engine's own `member` / `invitation` rows. So no consuming app's database carries it
anywhere today. For a single-org deployment adopting these module versions, that means:

- a **backfill across 9 collections of live data** — `user-contacts`, `companies`,
  `activities`, `actions`, `workflows`, `files`, `notifications`, `log-events`,
  `log-changes` — for which this repo ships no tooling
- **index rebuilds**: org-prefixed compound indexes, two new partial-unique indexes on
  `user-contacts`, and Atlas Search mapping `organizationId` as the `token` type
  statically plus listing it in `storedSource` wherever `returnStoredSource` is used
- a **forced deploy order whose every failure mode is silent**. The wall filters on a
  field that is absent, so adopting the module versions before the backfill completes
  makes every walled read return nothing — app-wide, with no error
- **requirements that reach into the consumer's own config**: the wall refuses to scope
  a pipeline-leading `$search`, so any app-authored search request on a walled
  connection must itself declare `tenant: authored` and hand-author the clause, with the
  matching search-index mapping

Against that: under `pinned` there is exactly one organization by construction, every
caller resolves to it, and no path can create data belonging to another. The injected
filter is **provably** a no-op. The whole cost buys nothing.

This matters in proportion to the estate. Consuming apps are version-pinned, so nothing
is forced — but the bill is bundled: the first time a single-org app needs any unrelated
fix from a newer module version, it inherits the backfill, the index work and the search
rework along with it.

## Key decisions

### 1. The policy gate lives at the platform tier, in one place

`resolveTenant` already computes the verdict that the connection enforces; it returns
`null` today when a connection declares no `tenant:`. Returning `null` under `pinned`
reuses that path, so reads, write stamping, update and delete selector merging, and
change streams all fall away together. Nothing about this is a module concern.

Two behaviours switch off with the verdict, deliberately:

- **the authored-field rejection.** Refusing a consumer's own `organizationId` guards
  nothing when no wall is scoping, and keeping it would restrict a `pinned` app for no
  reason.
- **the fail-closed error for an org-less caller.** Moot under `pinned`, where every
  session carries the seeded organization.

One check stays on regardless of policy: the **connection-type contract check**. A
`tenant:` declaration on a connection type that cannot enforce it should still be a
config error under `pinned`, so it surfaces on the current deployment rather than the
day someone flips to `tenant`.

### 2. Modules still declare `tenant:` unconditionally

The 14 connection declarations are unchanged. `tenant:` states a property of the
collection — _these rows are organization-scoped when the deployment is multi-org_ — and
delegates the decision. Decision 1 was right that a module must not branch on tenancy.
What it got wrong was concluding that therefore nothing may. The platform is the correct
place for the branch precisely because it is **one** place, which is the same "one
correct way" argument Decision 1 made.

### 3. The sites that do not delegate become policy-conditional at build time

Thirteen files author the organization clause themselves rather than relying on the
wall, and would filter on an absent field under a `pinned` no-op — returning nothing,
silently.

**The 8 `tenant: authored` requests** (the wall cannot scope a leading `$search`, or
`$graphLookup` anywhere, so these carry an audited clause of their own):

| Module       | File                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| `contacts`   | `get_all_contacts.yaml`, `get_contact_excel_data.yaml`, `search_contacts.yaml`                                        |
| `companies`  | `get_all_companies.yaml`, `get_company_excel_data.yaml`, `get_descendant_company_ids.yaml`, `api/update-company.yaml` |
| `activities` | `get_activities.yaml`                                                                                                 |

**5 join and write sites** stating their own organization (a `$lookup` is never scoped
by the wall, so joins name their own; the contact mint runs in system context):

| Module         | File                          | Position                         |
| -------------- | ----------------------------- | -------------------------------- |
| `user-account` | `get_account.yaml`            | `user-contacts` join             |
| `user-account` | `get_users_for_selector.yaml` | `user-contacts` join             |
| `user-admin`   | `api/check-invite-email.yaml` | contact lookup                   |
| `shared`       | `contact/ensure-contact.yaml` | mint / claim, org stamped        |
| `shared`       | `org/members_base.yaml`       | member-to-contact org comparison |

The branch reads the policy from `_build.authConfig`, which projects
`organizations: { policy, signup }` (`computeAuthConfigProjection.js`), so it resolves
at build time. It belongs in **one shared fragment** the 13 sites reference, not 13
separate branches.

Everything reading `organizationId` on the **engine's** collections — `user-members`,
`user-invitations`, `user-organizations` — needs no change. Those rows carry the field
under both policies because the engine writes them.

### 4. The conditional is fail-closed in the direction that matters

A build-time branch around a security clause deserves scrutiny. The dangerous direction
is omitting the clause under `tenant`, which would be a leak. It cannot silently happen:
the wall **audits** an authored clause on every run — present, right field, equal to the
caller's organization — and refuses the request on any miss. A mis-branched clause under
`tenant` therefore fails loudly rather than leaking.

In the other direction, an omitted clause under `pinned` is harmless by construction —
there is one organization and nothing else to disclose.

### 5. Index and Atlas Search requirements become policy-dependent

Under `pinned` a consumer keeps what it has today: a single-field unique-partial index on
`lowercase_email`, the new unique-partial on `userId`, no `organizationId` prefix on
compound indexes, and **no Atlas Search mapping changes** — no `token` type, no
`storedSource` entry. Under `tenant`, org-aware-modules' requirements apply as written.

`docs/shared/org-scoping.md` currently opens by asserting the scoping is unconditional.
That page is the consumer-facing source of truth and needs rewriting around the two
shapes, including its index and migration sections.

### 6. The flip is the migration event, not the upgrade

A `pinned` deployment that later declares `policy: tenant` starts enforcing on the same
code, over rows that carry no field — so every walled read goes blank until the backfill
runs. That is the intended trade: the cost lands when the capability is actually wanted,
where it is motivated and someone will do it deliberately, rather than arriving as
unexplained upgrade toil.

It also makes the backfill migration a prerequisite of **the flip** rather than of the
upgrade, which is the right coupling — and it is needed by multi-tenant consumers either
way.

## Scope

**Upstream (lowdefy)**: the policy gate in `resolveTenant`, and threading the resolved
policy into the request context it reads.

**This repo**: the shared build-time fragment, the 13 sites that reference it, the three
`module.lowdefy.yaml` var descriptions that state the substituted-collection
requirement, and the `docs/shared/org-scoping.md` rewrite.

## What does not change

- **Tenant behaviour, in any respect.** Every guarantee org-aware-modules makes under
  `policy: tenant` holds unchanged.
- **The 14 connection declarations.**
- **The contact-link flip** to `user-contacts.userId` — independent of this, and it
  needs no backfill of its own.
- **The engine collections** and everything reading them.
- **The config migrations** that ride the same release: `slug:` / the `_app` operator
  replacing `app_name`, and replacing `_user: profile.contactId` reads. Those are
  unrelated to the wall and still apply to every consumer.

## Non-goals

- **Renaming `tenant:`.** Under this design the property is a scoping-key declaration
  that does nothing under `pinned`, which sharpens the case that `scopeField:` or similar
  would read more honestly. Tracked separately as an upstream ask.
- **The backfill migration tooling.** Needed by tenant consumers regardless of this
  design; its absence is a separate gap.
- **The `deals` module's missing scoping.** A separate finding — that module declares no
  `tenant:` at all and carries no `organizationId`, so it is unscoped under `tenant`.

## Open questions

1. **Does "the app explicitly sets it" mean the policy key alone?** Assumed yes: the
   wall engages when and only when `auth.organizations.policy: tenant` is declared, and
   an app with no `organizations:` block (which defaults to `pinned`) is never walled. A
   further per-connection or per-app opt-in would let a tenant app disable scoping on
   part of its data, which is the leak the wall exists to prevent — so it should not be
   offered.
2. **Should the flip be preflight-checked?** The worst failure mode in this design is
   declaring `policy: tenant` before backfilling: reads silently blank. A startup check
   that refuses to boot under `tenant` while any walled collection holds unstamped rows
   would convert that into a loud, immediate failure. Worth costing — it removes the one
   sharp edge the design introduces.

## Related

- [org-aware-modules](../org-aware-modules/design.md) — superseded Decision 1; amended
  Decisions 2, 4, 5 and Migration.
- [org-aware-modules upstream asks](../org-aware-modules/upstream-asks.md) — the policy
  gate is a fifth ask.
- `docs/shared/org-scoping.md` — consumer-facing behaviour, needs rewriting to match.
