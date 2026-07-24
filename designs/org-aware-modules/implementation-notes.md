# Org-Aware Modules — Implementation Notes

Decisions made at implementation time (2026-07-17), within the design's rules. The design itself is unchanged; these notes record how its open mechanics were resolved.

## Framework delivery

The tenant wall shipped tenant-only (no `scope:`) on the lowdefy branch `feat/mongodb-tenant-wall` (PR lowdefy/lowdefy#2280, base `auth-upgrade`), including the `$search`/`$searchMeta` clause from [upstream ask 1](upstream-asks.md) — consumed here via the pinned experimental release. `tenant:` is a **connection top-level key** (sibling of `type:`/`properties:`), per the wall design's Decision 1 YAML.

**Amendment-1 adopted (2026-07-22, release `20260722143027`).** The wall's in-stage rewriting was removed upstream (its amendment-1): stages the prepended `$match` can not scope — pipeline-leading `$search`/`$searchMeta`/`$vectorSearch`/`$geoNear`, and `$graphLookup` anywhere — are refused unless the request declares `tenant: authored` and authors the organization clause itself, which the wall audits against the caller's resolved org on every run. This repo adopted it in the same change: six `$search` requests (`get_all_contacts`, `get_all_companies`, `get_activities`, both Excel exports, `search_contacts`) carry the `equals` clause in their compound filter, and both `$graphLookup` sites (`get_descendant_company_ids`, update-company's `cycle_check` step) author `restrictSearchWithMatch` — all with `_user: organizationId` as the value. The Excel exports' pipelines are operator-composed (`_build.array.concat`), so the build's best-effort check can not see them; the runtime audit is their gate, as designed.

## The merge-on-signup mint (Decision 7 / upstream ask 4)

The design records that the mint cannot know its organization at its current binding points; relocation is upstream ask 4. Mechanically, the shared `create-or-link-contact` fragment is spliced by BOTH the caller-ful invite path (wall handles the org) and the system-context hook (wall fails closed), and the `tenant: none` sentinel is a per-step key that cannot vary per `_ref` caller. Rather than fork the canonical fragment, user-account gained a second, **deliberately unwalled** connection to the same collection — `user-contacts-system` — used only by `link-contact-on-signup` (precedent: Decision 2's walled+unwalled same-collection rule).

**Ask 4 relocation landed (2026-07-20).** The platform half shipped in the pinned release (`session.create.after` fires with `session.activeOrganizationId` stamped pre-write by the active-org policy hook under both policies, plus the injected `point` field), and the module half followed:

- The mint is rebound to `session.create.after` only (`user.create.before` / `email.verified` bindings removed; the fragment's inline-`:return` branch went with them). The hook fires on every login and dispatch blocks the login, so the endpoint self-guards to a silent skip unless: email verified AND `profile.contactId` unset AND the session carries an active org (the pending-invitation carve-out creates an org-less session — the invite flow owns that contact).
- The fragment gained an optional `organization_id` var, merged into the upsert filter and read query at build time (`_build.if` on var presence — the invite splice passes none, and an authored org filter on its walled connection would be rejected). The upsert key becomes the compound-unique `{organizationId, lowercase_email}` tuple, restoring the mint-vs-invite race guard; MongoDB carries the filter equality into inserted docs, so minted contacts are org-stamped.
- `user-contacts-system` stays (the wall still fails closed for caller-less context) but its writes are now explicitly org-stamped per Decision 7 — the "org-less signup contacts" limitation is retired. Deployments that ran the interim version re-run the backfill once (noted in `docs/shared/org-scoping.md`).
- Invariant shift, deliberate: "contact by first session" → "contact by first **verified** session with an active org". The skip-when-linked guard also implements ask 2's documented v1 fallback (first org to link wins; later orgs' contacts come from invites).

## System-context sends (Decision 7)

The demo's `send-routine.yaml` is the worked example: its `$merge` aggregations (rejected on walled connections) carry `tenant: none` plus an explicit `organizationId` projected from the source event's wall-stamped field (provenance: the triggering record).

## Plugin connections (inventory rows outside `connection-mongodb`)

`events-timeline` (EventsTimeline) and `workflow-api` (WorkflowAPI) are plugin connection types; the framework wall passes them the tenant verdict but they enforce it themselves. `@lowdefy/modules-mongodb-plugins` declares the contract (`connectionMetas` in types.js + `meta.tenant` on the type exports) and applies it in the timeline aggregation's match + lookups and the workflow engine's five mongo helpers.

Verdict _delivery_ to plugin types is guaranteed by the framework, not assumed — verified in the pinned release: `callRequest` runs `resolveTenant` for every connection type and `callRequestResolver` passes `tenant` into every request resolver uniformly. There is no silent fail-open path: a `tenant:` declaration on a type without `connectionMetas[type].tenant === true` is a **build error** (`buildConnections` `validateTenant`), a runtime connection export missing `meta.tenant` **throws** (`ConfigError` in `resolveTenant`, belt-and-braces against build/server drift), and an unresolved caller organization **throws** (`AuthenticationError`, fail-closed). So the plugin suites' remaining job is exactly what they test: given a verdict, enforce it.

## Collection inventory deltas found at implementation

- The BetterAuth rebuilds' auth-collection connections (`users`, `user-members`, `user-organizations`, `user-invitations`, `user-sessions`, `user-accounts`, `user-passkeys`) stay unwalled per Decision 2, as the design states. Their `_organization: id` scoping remains upstream ask 3.
- `@lowdefy/community-plugin-mongodb` was already dropped by the rebuild work, so `MongoDBCollection` resolves from core `@lowdefy/connection-mongodb` — the wall-implementing type — without further changes here.

## Two-org runtime proof

Per-resolver isolation is proven by integration tests in the lowdefy repo (connection-mongodb suite, real MongoDB). This repo adds `apps/demo/e2e/org-scoping/tenant-isolation.spec.js` — two orgs seeded, isolation asserted through the activities view page (a plain walled aggregation; the `$search`-led list pipelines can't run on the in-memory MongoDB). The demo build itself stays `pinned`-policy.
