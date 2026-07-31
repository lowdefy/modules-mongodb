# Org-Aware Modules — Implementation Notes

Decisions made at implementation time (2026-07-17), within the design's rules. The design itself is unchanged; these notes record how its open mechanics were resolved.

## Framework delivery

The tenant wall shipped tenant-only (no `scope:`) on the lowdefy branch `feat/mongodb-tenant-wall` (PR lowdefy/lowdefy#2280, base `auth-upgrade`), including the `$search`/`$searchMeta` clause from [upstream ask 1](upstream-asks.md) — consumed here via the pinned experimental release. `tenant:` is a **connection top-level key** (sibling of `type:`/`properties:`), per the wall design's Decision 1 YAML.

**Amendment-1 adopted (2026-07-22, release `20260722143027`).** The wall's in-stage rewriting was removed upstream (its amendment-1): stages the prepended `$match` can not scope — pipeline-leading `$search`/`$searchMeta`/`$vectorSearch`/`$geoNear`, and `$graphLookup` anywhere — are refused unless the request declares `tenant: authored` and authors the organization clause itself, which the wall audits against the caller's resolved org on every run. This repo adopted it in the same change: six `$search` requests (`get_all_contacts`, `get_all_companies`, `get_activities`, both Excel exports, `search_contacts`) carry the `equals` clause in their compound filter, and both `$graphLookup` sites (`get_descendant_company_ids`, update-company's `cycle_check` step) author `restrictSearchWithMatch` — all with `_user: organizationId` as the value. The Excel exports' pipelines are operator-composed (`_build.array.concat`), so the build's best-effort check can not see them; the runtime audit is their gate, as designed.

## The merge-on-signup mint (Decision 7 / upstream ask 4)

The design records that the mint cannot know its organization at its current binding points; relocation is upstream ask 4. Mechanically, the shared `ensure-contact` fragment is spliced by BOTH the caller-ful invite path (wall handles the org) and the system-context hook (wall fails closed), and the `tenant: none` sentinel is a per-step key that cannot vary per `_ref` caller. Rather than fork the canonical fragment, user-account gained a second, **deliberately unwalled** connection to the same collection — `user-contacts-system` — used only by `ensure-contact-on-signup` (precedent: Decision 2's walled+unwalled same-collection rule).

**Ask 4 relocation landed (2026-07-20).** The platform half shipped in the pinned release (`session.create.after` fires with `session.activeOrganizationId` stamped pre-write by the active-org policy hook under both policies, plus the injected `point` field), and the module half followed:

- The mint is rebound to `session.create.after` only (`user.create.before` / `email.verified` bindings removed; the fragment's inline-`:return` branch went with them). The hook fires on every login and dispatch blocks the login, so the endpoint runs only when the email is verified AND the session carries an active org (the pending-invitation carve-out creates an org-less session — the invite flow owns that contact). It needs no run-once guard: `ensure-contact` is a matched upsert with `$setOnInsert` only, so a login whose contact already exists writes nothing and leaves the change stamp alone.
- The fragment gained an optional `organization_id` var, merged into the upsert filter and read query at build time (`_build.if` on var presence — the invite splice passes none, and an authored org filter on its walled connection would be rejected). The upsert key becomes the compound-unique `{organizationId, lowercase_email}` tuple, restoring the mint-vs-invite race guard; MongoDB carries the filter equality into inserted docs, so minted contacts are org-stamped.
- `user-contacts-system` stays (the wall still fails closed for caller-less context) but its writes are now explicitly org-stamped per Decision 7 — the "org-less signup contacts" limitation is retired. Deployments that ran the interim version re-run the backfill once (noted in `docs/shared/org-scoping.md`).
- Invariant shift, deliberate: "contact by first session" → "contact by first **verified** session with an active org".

## The contact carries the link to its auth user (ask 2 withdrawn)

`user.profile.contactId` is removed; `user-contacts.userId` replaces it. A contact is per-organization while the auth user is global, so a single id on the user row is only ever right for one organization — under `tenant` that made a walled profile write miss outright once a member's active org was not the one that wrote the pointer, and it made the members table and user selector read another organization's row for the same person.

The link sits on the contact for a reason beyond symmetry: **no module code runs when a membership is created.** The bindable hook points are user / session / account / verification / phone only, and the engine's `afterAcceptInvitation` is engine-tier — so a pointer on the `user` or `member` row could never be written at accept, which is exactly the moment an invitee needs it. The contact is app-owned and walled, so the module writes the link whenever it is next asked for that person's contact. Pull, not push.

- `resolve-own-contact.yaml` matches `{organizationId (wall), userId: _user.id}`. On a miss it **claims**: one `MongoDBUpdateOne` filtered on the address plus `userId: null` (a MongoDB null equality matches missing _and_ null, so a caller that stamped an absent id as null is still claimable), stamping `userId` and a change stamp. `disableNoMatchError: true` — "nothing to claim" is the caller's routine to report, not the step's. The claim is skipped when the row is already linked, so a resolution never writes, and never adds a change-log record to a read.
- `ensure-contact.yaml` takes an optional `user_id`, merged into `$setOnInsert` at build time, so a hook-minted contact is born linked. `user-admin`'s invite passes its `find_user` result (moved ahead of the splice), so an address that is already a user gets a linked contact immediately.
- The read joins (`get_account`, `members_base`, `get_users_for_selector`) match `userId` **or** the address, through one shared expression fragment — `contact-match-expr.yaml`, parameterised on all four operands so the same definition serves a join in either direction. The address half is read-side tolerance for the claim window (an invite-minted contact before its person's first resolution): that window is the invitee's first visit, so without it their invite-captured profile appears to vanish from the onboarding prefill and the members list. `check-invite-email` is unchanged and stays address-keyed — its input _is_ an address, not a user.
- Path `_ref`s inside `modules/shared/` resolve against the **consuming module's** root (`rebaseModuleRefPaths`, inherited through the ref chain), which is why `members_base.yaml` writes the same `../shared/contact/…` path a module file would.

What this deletes rather than moves: the invitation carries no contact id (it could not under `tenant` anyway — the client `InviteMember` forwards only `{ email, role }`), `ensure-contact` no longer writes back to the user (its `binding_point` var is gone), and no index on `users` is required. `user-contacts` gains a partial-unique `{organizationId, userId}` index — a correctness requirement, since resolution reads it per request, and the guard that makes the claim idempotent.

## System-context sends (Decision 7)

The demo's `send-routine.yaml` is the worked example: its `$merge` aggregations (rejected on walled connections) carry `tenant: none` plus an explicit `organizationId` projected from the source event's wall-stamped field (provenance: the triggering record).

## Plugin connections (inventory rows outside `connection-mongodb`)

`events-timeline` (EventsTimeline) and `workflow-api` (WorkflowAPI) are plugin connection types; the framework wall passes them the tenant verdict but they enforce it themselves. `@lowdefy/modules-mongodb-plugins` declares the contract (`connectionMetas` in types.js + `meta.tenant` on the type exports) and applies it in the timeline aggregation's match + lookups and the workflow engine's five mongo helpers.

Verdict _delivery_ to plugin types is guaranteed by the framework, not assumed — verified in the pinned release: `callRequest` runs `resolveTenant` for every connection type and `callRequestResolver` passes `tenant` into every request resolver uniformly. There is no silent fail-open path: a `tenant:` declaration on a type without `connectionMetas[type].tenant === true` is a **build error** (`buildConnections` `validateTenant`), a runtime connection export missing `meta.tenant` **throws** (`ConfigError` in `resolveTenant`, belt-and-braces against build/server drift), and an unresolved caller organization **throws** (`AuthenticationError`, fail-closed). So the plugin suites' remaining job is exactly what they test: given a verdict, enforce it.

## Collection inventory deltas found at implementation

- The BetterAuth rebuilds' auth-collection connections (`users`, `user-members`, `user-organizations`, `user-invitations`, `user-sessions`, `user-accounts`, `user-passkeys`) stay unwalled per Decision 2, as the design states. Their `_organization: id` scoping remains upstream ask 3.
- `@lowdefy/community-plugin-mongodb` was already dropped by the rebuild work, so `MongoDBCollection` resolves from core `@lowdefy/connection-mongodb` — the wall-implementing type — without further changes here.

## Two-org runtime proof

Per-resolver isolation is proven by integration tests in the lowdefy repo (connection-mongodb suite, real MongoDB). This repo adds `apps/tenant-demo/e2e/org-scoping/tenant-isolation.spec.js` — two orgs seeded, isolation asserted through the activities view page (a plain walled aggregation; the `$search`-led list pipelines can't run on the in-memory MongoDB). The specs drive the e2e harness's mock caller, so they prove the wall under either policy; they live with the tenant app because that is the deployment shape they describe.

## Two apps, one module set (the design's demo-consumer question)

The design left open what a build-verified consumer for the `tenant` shape looks like. Answer: a second app. `apps/demo` stays `pinned` and remains the canonical demo; `apps/tenant-demo` declares `policy: tenant` and adds the `organizations` module entry, the org menu group and the `header_extra` switcher. The two cannot be one app — `userAdminRole` is rejected under `tenant`, and a wired `SetActiveOrganization` fails the build under `pinned` (org-workspace Decision 6) — so the policy axis is an app boundary, not a var.

Both apps carry the same walled module set, which is Decision 1 working as intended: nothing in `modules/` branches on policy, and the only per-app differences are the auth block, the organizations wiring, and the app-slug-keyed maps (`event_display`, workflow `access` / `status_map`) that follow each app's own `slug`.
