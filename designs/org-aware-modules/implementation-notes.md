# Org-Aware Modules — Implementation Notes

Decisions made at implementation time (2026-07-17), within the design's rules. The design itself is unchanged; these notes record how its open mechanics were resolved.

## Framework delivery

The tenant wall shipped tenant-only (no `scope:`) on the lowdefy branch `feat/mongodb-tenant-wall` (PR lowdefy/lowdefy#2280, base `auth-upgrade`), including the `$search`/`$searchMeta` clause from [upstream ask 1](upstream-asks.md) — consumed here via the pinned experimental release. `tenant:` is a **connection top-level key** (sibling of `type:`/`properties:`), per the wall design's Decision 1 YAML.

## The merge-on-signup mint (Decision 7 / upstream ask 4)

The design records that the mint cannot know its organization at its current binding points; relocation is upstream ask 4. Mechanically, the shared `create-or-link-contact` fragment is spliced by BOTH the caller-ful invite path (wall handles the org) and the system-context hook (wall fails closed), and the `tenant: none` sentinel is a per-step key that cannot vary per `_ref` caller. Rather than fork the canonical fragment, user-account gained a second, **deliberately unwalled** connection to the same collection — `user-contacts-system` — used only by `link-contact-on-signup` (precedent: Decision 2's walled+unwalled same-collection rule). Consequences, documented in `docs/shared/org-scoping.md` and `docs/user-account/reference/indexes.md`:

- Signup-minted contacts carry no `organizationId` and are invisible to walled reads until ask 4 relocates the mint; under `pinned`, re-run the backfill after that lands.
- The compound unique index still closes the mint-vs-mint race (org-less rows collide among themselves), but not the mint-vs-invite race (different key tuples) — restored by ask 4.

## System-context sends (Decision 7)

The demo's `send-routine.yaml` is the worked example: its `$merge` aggregations (rejected on walled connections) carry `tenant: none` plus an explicit `organizationId` projected from the source event's wall-stamped field (provenance: the triggering record).

## Plugin connections (inventory rows outside `connection-mongodb`)

`events-timeline` (EventsTimeline) and `workflow-api` (WorkflowAPI) are plugin connection types; the framework wall passes them the tenant verdict but they enforce it themselves. `@lowdefy/modules-mongodb-plugins` declares the contract (`connectionMetas` in types.js + `meta.tenant` on the type exports) and applies it in the timeline aggregation's match + lookups and the workflow engine's five mongo helpers.

## Collection inventory deltas found at implementation

- The BetterAuth rebuilds' auth-collection connections (`users`, `user-members`, `user-organizations`, `user-invitations`, `user-sessions`, `user-accounts`, `user-passkeys`) stay unwalled per Decision 2, as the design states. Their `_organization: id` scoping remains upstream ask 3.
- `@lowdefy/community-plugin-mongodb` was already dropped by the rebuild work, so `MongoDBCollection` resolves from core `@lowdefy/connection-mongodb` — the wall-implementing type — without further changes here.

## Two-org runtime proof

Per-resolver isolation is proven by integration tests in the lowdefy repo (connection-mongodb suite, real MongoDB). This repo adds `apps/demo/e2e/org-scoping/tenant-isolation.spec.js` — two orgs seeded, isolation asserted through the activities view page (a plain walled aggregation; the `$search`-led list pipelines can't run on the in-memory MongoDB). The demo build itself stays `pinned`-policy.
