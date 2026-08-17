# Declare Shared Connections

[org-aware-modules](../org-aware-modules/design.md) Decision 2 requires every
module-owned connection to declare `tenant: true`.
[policy-conditional-wall](../policy-conditional-wall/design.md) kept that rule and made
the declaration inert under `policy: pinned`. This design removes the declaration
instead: **the app's `auth.organizations.policy` sets the scoping default for every
connection**, and a module connection declares only its exception to that default —
`tenant: shared`, for data deliberately shared across organizations.

**Supersedes**: org-aware-modules Decision 2's declaration rule and
policy-conditional-wall's proposed change 2 ("module connection declarations do not
change"). **Amends**: the collection inventory in both.

**Status**: implemented, alongside the framework amendment
`auth-upgrade/mongodb-data-scoping/amendment-3-declare-shared` on
`feat/mongodb-tenant-wall` (unreleased — the repo's demo builds pick it up with the
next experimental release). No deployment carries `policy: tenant`, so nothing in this
repo is live under either rule.

## Proposed change

1. **Delete all 16 `tenant: true` declarations.** Under the inverted default they restate
   the default. `tenant: { field: … }` is unaffected; no module uses it.
2. **Declare `tenant: shared` on the 16 connections that must not be scoped**, each with a
   reason. All but one read the auth engine's own collections.
3. **The two plugin connection types that implement the scoping contract declare their
   capability** (`EventsTimeline`, `WorkflowAPI`), so the framework's new
   capability check passes.
4. **Module-authoring guidance loses a step.** A new module's connections carry no
   tenancy key. `docs/shared/org-scoping.md` inverts its instruction accordingly.

## Problem

Decision 2's rule — every module-owned connection declares `tenant: true` — held for every
module the collection inventory listed. The `deals` module was not one of them, and the
gap ran through three layers at once: the inventory omitted the module,
`docs/shared/org-scoping.md`'s backfill list omitted the collection, and both connection
files omitted the key. Under `tenant` that is a symmetric leak — writes unstamped, reads
unfiltered — found in the two-organization QA pass as T11/T12, not by config review.

Config review could not have found it. A connection with no `tenant:` key is
byte-identical whether the omission is deliberate or an oversight, and this repo has 16
deliberate omissions, so the absence carries no signal. Every mechanism that could
complain is downstream of the declaration: the flip preflight enumerates declaring
connections, the entry-stage build check reads a list populated from declarations, the
remap guard compares declarations. A missing declaration is invisible to all of them
simultaneously.

The rule also imposes its cost in the wrong place. Consuming apps author their own
modules — one carries seven connections, five of them `MongoDBCollection` — and those
authors are app teams building `pinned` deployments. Requiring a declaration taxes every
future module in every app so the framework can catch a mistake in the one deployment
that may want multiple organizations. Under `pinned` the declaration does nothing at all,
which makes it, accurately, ceremony.

## Key decisions

### 1. The app's policy sets the default; a connection declares only its exception

| App declares     | Connection declares nothing | Connection declares `tenant: shared` |
| ---------------- | --------------------------- | ------------------------------------ |
| `policy: pinned` | Not scoped                  | Not scoped — the key is inert        |
| `policy: tenant` | **Scoped**                  | Not scoped                           |

Under `tenant`, scoped is a genuine default that `shared` overrides. Under `pinned`
scoping does not exist, so there is nothing to override and no way to ask for a scoped
connection — with one organization it separates nothing. Full rule, rationale, the
reversal of mongodb-data-scoping Decision 6's refusal of a connection-level opt-out, and
the connection-type capability requirement: see the framework amendment.

**A module connection has no default of its own — it inherits whichever app it is built
into.** The same file is scoped in a `tenant` app and unscoped in a `pinned` one, with no
variant, no branch, and nothing in the file about tenancy. That is what
[org-aware-modules](../org-aware-modules/design.md) Decision 1 set out to achieve —
"tenancy becomes a deployment configuration choice, not a module architecture choice."
Its declaration rule got most of the way there while still making all 16 connections
restate the decision; removing them reaches the same place without the restatement.

For this repo the consequence is a straight swap — 16 declarations out, 16 exceptions in —
and one change of habit: a new module writes nothing.

### 2. The exception set, with reasons

Fifteen of the sixteen are connections onto the auth engine's own collections, where the
engine writes the organization itself and the module already filters explicitly with
`_user: organizationId` where it wants one organization. Marking them `shared` preserves
today's behaviour exactly.

| Connection             | Modules                                 | Why shared                                                                                                                                        |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                | user-account, user-admin                | A user is one person platform-wide; the row carries no organization under either policy                                                           |
| `user-sessions`        | user-account, user-admin                | Session rows are per user, not per organization                                                                                                   |
| `user-accounts`        | user-account, user-admin                | Provider links belong to the global user                                                                                                          |
| `user-passkeys`        | user-account, user-admin                | Credentials belong to the global user                                                                                                             |
| `user-members`         | organizations, user-admin               | The switcher must read a caller's memberships **across** organizations; per-organization reads filter explicitly                                  |
| `user-organizations`   | organizations, user-admin               | The switcher lists every organization a caller belongs to; scoping it to the active one collapses the switcher to one entry                       |
| `user-invitations`     | user-account, organizations, user-admin | An invitation is read before the invitee holds a membership, so no caller organization resolves                                                   |
| `user-contacts-system` | user-account                            | The signup contact mint runs from an auth hook with no caller; it stamps an explicit organization from the session (org-aware-modules Decision 7) |

**`user-members` and `user-organizations` are the load-bearing entries.** Both are read
by `get_switcher_memberships`, which filters by `userId: { _user: id }` deliberately —
the caller's own member rows, which is what makes the read safe unscoped. Scope it and
the organization switcher shows only the organization the caller is already in, which
makes switching impossible. This is the one behaviour that breaks if the exception set is
wrong, so it is worth a test rather than a comment.

**Settled upstream, in the framework amendment's Migration section: the framework does
not recognise the adapter's collections, and the exceptions stay explicit.** There is no
sound build-time key to exempt on — connection properties are operator-composed
(`_secret: MONGODB_URI`), so a match degrades to collection _names_, which would silently
exempt any app collection sharing one — and a carve-out would reintroduce an invisible
path out of the wall beside `tenant: shared`, the one visible path the inversion leaves.
The table above is the final form: all sixteen exceptions are declared in the connection
files.

### 3. Plugin connection types declare their capability

`EventsTimeline` and `WorkflowAPI` implement `meta.tenant` and enforce the verdict in
their own resolvers. Under the framework's new capability check they declare themselves
scoping-capable, and their connections then need no key — the same as any
`MongoDBCollection`.

This closes a hole the inversion would otherwise open in consuming apps rather than here.
A data-bearing connection whose type implements no contract is silently unscoped under an
inverted default, and an app-authored module in the consuming repos has exactly that
shape: a custom type taking a `databaseUri` that writes job and registry records. The
capability check turns that into a build error naming the type. Nothing in this repo has
the problem; the check is what makes the inversion safe for the repos that do.

### 4. `tenant: authored` and `tenant: none` do not change

The 8 `tenant: authored` requests, the shared policy fragment
`modules/shared/org/tenant-clause.yaml`, and the `tenant: none` sentinels keep their
current form and meaning. They sit at the request position, which this design does not
touch — the connection position declares tenancy, the operation position declares
exceptions, and the two still hold disjoint value sets.

One consequence worth stating: with more connections scoped by default, a consuming app is
more likely to meet a pipeline the wall cannot scope and need `tenant: authored` of its
own. `docs/shared/org-scoping.md` already documents that path for consumers; the
inversion widens who reaches for it.

## Collection inventory

Unchanged from org-aware-modules as amended by the `deals` fix — ten collections carry
`organizationId` under `policy: tenant`: `user-contacts`, `companies`, `activities`,
`actions`, `workflows`, `log-events`, `log-changes`, `files`, `notifications`, `deals`.
What changes is how that set is expressed in config: it is now every module connection
**except** the sixteen in Decision 2's table, rather than the sixteen that declared
`tenant: true`.

The two expressions must agree, and keeping them in agreement by hand is what failed for
`deals`. The `deals` gap ran through three hand-maintained copies of one fact — this
inventory, `docs/shared/org-scoping.md`'s backfill list, and the connection files. Under
this design the connection files stop being a list at all, which removes one copy;
generating the other two from the build's connection artifact removes the drift entirely
and is worth doing in the same change. The repo already runs this pattern for module vars
(`scripts/gen-var-docs.mjs`, enforced by `pnpm docs:check`).

## Migration

For this repo, mechanical and verifiable by build:

1. Delete the 16 `tenant: true` lines.
2. Add `tenant: shared` with its reason to the 16 connections in Decision 2's table.
3. Add capability declarations to the two plugin connection types.
4. Invert the instruction in `docs/shared/org-scoping.md` and regenerate
   (`pnpm docs:gen`). The docs currently tell consumers that every module connection
   declares `tenant: true`; they must instead say a connection is scoped unless it
   declares `tenant: shared`.
5. Build both demo apps. `apps/demo` proves the `pinned` path is untouched;
   `apps/tenant-demo` is the only build where the policy-gated checks run at all.
6. Re-run the two-organization QA pass in `designs/auth-tenancy-verification/` —
   specifically the switcher cases, which are what the exception set protects.

**No data migration, under either policy.** The set of collections carrying
`organizationId` under `tenant` is identical before and after; only its expression in
config changes. A `pinned` deployment is unaffected in every respect.

## What does not change

- Which collections are organization-scoped under `policy: tenant`.
- The request-position sentinels, the shared policy fragment, and the 8 authored requests.
- Index and Atlas Search requirements (org-aware-modules Decision 8, as amended by
  policy-conditional-wall) — still policy-dependent, still app-owned.
- `pinned` behaviour, in any respect.

## Non-goals

- **Changing `docs/` ahead of implementation.** `docs/` is the source of truth for
  consumer-observable behaviour, and today's behaviour is the opt-in rule. The doc
  inversion lands with the code, in step 4 above, not with this design.
- **A lint or build check for missing declarations.** There is no declaration to miss.
  This design removes the failure mode rather than detecting it, which is why the
  `tenant:`-declaration lint discussed while diagnosing the `deals` gap is not proposed.
- **Per-module tenancy stances or a manifest-level declaration.** Both add a position to
  a config surface whose main defect is that authors already cannot tell what governs a
  given connection.

## Open questions

1. **Should `tenant: shared` require a machine-readable reason** (`tenant: { shared: true,
reason: … }`) rather than a YAML comment? A reason mattered more under the opt-in rule,
   where absence was ambiguous; once absence means scoped, `shared` is already an explicit
   and greppable assertion. Recommend the terse form with a comment convention, and
   revisit if the exception set grows beyond the table above.

## Related

- Framework: `auth-upgrade/mongodb-data-scoping/amendment-3-declare-shared` — the rule,
  the reversal of Decision 6, and the connection-type capability check.
- [policy-conditional-wall](../policy-conditional-wall/design.md) — the policy gate this
  builds on; unchanged except for its declaration rule.
- [org-aware-modules](../org-aware-modules/design.md) — Decisions 3–8 stand.
- [auth-tenancy-verification](../auth-tenancy-verification/findings.md) — T11/T12 are the
  `deals` gap this design removes the possibility of.
