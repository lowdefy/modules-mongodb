# Part 50 — Collapse to one config-free entity events timeline

> **Supersedes [Part 46](../_completed/46-debundle-workflow-config/design.md) D6.** Part 46 D6 *split* the entity timeline into two components — an events-only generic timeline (events module) and an action-enriched timeline (`workflows-events-timeline`, on the `WorkflowAPI` connection) — to avoid an events ⇄ workflows module cycle. This part **re-merges them into one** timeline that the events module owns and that enriches with action cards when an `actions` collection is configured. Two facts that did not hold when D6 was written make this safe (see D1): the action-card access policy is **data-on-the-action + session roles, no workflow config**, and the events module **already depends on the `@lowdefy/modules-mongodb-plugins` package**, so the one shared policy implementation is reachable without a module cycle. The earlier Part 50 design (a replaceable `components.events_tile` slot that let an app *swap* the events-only tile for the workflows one) is **dropped** — with one timeline there is nothing to swap.

Entity modules (companies, contacts, activities) each render an events-timeline "History" tile. Today that tile is events-only; an app that runs workflows on the entity gets a *second*, action-enriched timeline component and has to swap one for the other per entity. This part makes the single events timeline **enrich itself**: it joins each event's referenced actions and renders their cards inline, gated only by the session user's roles against access data already denormalised onto each action. Enrichment is switched on by **one `actions_collection` var on the events module entry** — set it and *every* entity timeline in the app shows action cards; leave it unset and the timeline renders identically to the events-only timeline of today. No per-entity wiring, no second component, no slot.

**Layer:** plugin engine (config-free + relocatable) + events-module connection/manifest/timeline + action write-path denormalisation + workflows-module cleanup + docs + demo adoption. **Size:** M. **Repo:** `plugins/modules-mongodb-plugins/`, `modules/{events,workflows}/`, `docs/`, `apps/demo/`.

## Proposed change

1. **The action sort key is denormalised onto the action doc at write time.** Today `makeWorkflowOrderComparator` (`compareActionOrder.js`) is the *only* consumer of `workflowsConfig` in the timeline read — it maps each action to its declaration position (group index in `cfg.action_groups`, action index in `cfg.actions`). The two declaration indices are computed **once at build time** by the `makeWorkflowsConfig` resolver (`modules/workflows/resolvers/makeWorkflowsConfig.js`) — it already walks every group and action to normalise them, so in the same pass it attaches each action's **group index** (position in `action_groups[]`) and **action index** (position in `actions[]`) onto that action's config entry. These indices are pure functions of the authored config, so build time is their natural home — nothing about a live action instance affects them. `planActionTransition.js` already writes `doc.access`, `doc.workflow_type`, `doc.title`, `doc.tracker` onto the action on every plan (`:209`); it now copies `actionConfig.group_index` / `actionConfig.decl_index` onto the doc in the same block — a plain copy beside `doc.access`, no signature change and no per-transition computation. The comparator reads the stored indices instead of resolving config; the rest of its sort key — `[group_index, notRequired, decl_index, key, _id]` — is unchanged, because only the two indices were ever config-derived: `notRequired` still reads off `status`, and the `key` / `_id` tiebreakers read straight off the action doc. In the timeline these survive to the in-memory sort: the actions `$lookup` sub-pipeline rewrites `status` to a scalar and applies **no narrowing `$project`**, so `status`, `key`, `_id`, and the new `group_index` / `decl_index` all pass through. **Result: the timeline read needs no `workflowsConfig`.**

   The comparator is *not* timeline-local: `compareActionOrder.js` is the single source of truth for action display order across **all four** read engines (`GetEventsTimeline`, `GetEntityWorkflows`, `GetWorkflowOverview`, `GetWorkflowActionGroupOverview` — its own header, Part 54). So this change is **global** — all four engines move to doc-stamped ordering, and the three overview engines drop the now-unused `workflowsConfig` argument at their `makeWorkflowOrderComparator(...)` call. Keeping config-based ordering for the three config-holding engines while forking a doc-based path for the timeline is rejected: it would produce two ordering implementations and break the Part 54 single-source-of-truth. The staleness consequence of the global change is covered in D5.
2. **The timeline engine becomes config-free and moves to a new events-owned connection type.** `GetEventsTimeline` (`plugins/.../WorkflowAPI/GetEventsTimeline/`) drops its `workflowsConfig` dependency (change 1). "Relocating" it is not an in-place edit: it currently lives on the `WorkflowAPI` connection, whose schema requires workflows-only fields (`entry_id`, `endpoints`), and the events module's only connection is a generic `MongoDBCollection` (`events-collection`) that cannot host a plugin-defined request type. So this part **introduces a new plugin connection type, `EventsTimeline`** (parallel to `WorkflowAPI`; registered in `plugins/.../src/connections.js` alongside it), which exposes the `GetEventsTimeline` request. It is read-only (`meta.checkRead`/`checkWrite: false` — no change-stamp/write fields), and its schema is fully determined by what the engine reads off its connection:
   - `databaseUri` (secret) — Mongo access;
   - `app_name` — the display/access namespace key (the events module wires its existing `display_key` var here — see D3);
   - `eventsCollection` — default `log-events`;
   - `actionsCollection` — wired from the `actions_collection` var; null ⇒ skip the actions join (D4);
   - `contactsCollection` — wired from the `contacts_collection` var; null ⇒ skip the author-avatar join;
   - `user` — via `_user: true` (session user, for role-gating).

   The events module adds `EventsTimeline` as a **second** connection; `events-collection` (`MongoDBCollection`) stays put for the event writes and change-log.
3. **The events module gains `actions_collection` (and `contacts_collection`) vars.** Both default to **null**. When `actions_collection` is null the engine skips the actions `$lookup` **and its dependent dedup stages** (`$unwind`/`$setWindowFields`/`$group`/`$replaceRoot`, which all operate on the `actions` field the lookup produces) and renders identically to the events-only timeline of today (D4); when set, it joins that collection and enriches. `contacts_collection` likewise gates the author-avatar join. The events timeline request routes through the engine method on the events connection rather than the inline `MongoDBAggregation` it uses today.
4. **The action access policy is data-driven and lives in one place.** `computeAllowed` reads `action.access[display_key].{view,edit,review,error}` (gate values written by the engine at transition time) and matches them against the session user's roles via `gateAllows`; `collapseLink` picks the highest-priority accessible link from `action[display_key].links`. Neither touches config. This is the single implementation Part 46 D2 consolidated — preserved, just reached through the events timeline.
5. **The workflows module's timeline duplication is deleted**: `modules/workflows/components/workflows-events-timeline.yaml`, its `requests/get_events_timeline.yaml`, and the `WorkflowAPI`-bound `GetEventsTimeline` request wiring. The demo `lead-view` (the one direct consumer) reads the events timeline instead. The check-action click handler / modal wiring (Part 55) moves to the events timeline component as the `onActionClick` hook, since that is now the only timeline.
6. **The events module's dead action-card *display* config is deleted** (carried over from the original Part 50 scope): the `actionStatusConfig` prop wiring left unreachable by Part 46's splice removal, the `action_statuses_display` manifest var, and its README section. The `EventsTimeline` *block* keeps its `actionStatusConfig` prop — the unified timeline now uses it.
7. **The demo turns enrichment on** (`apps/demo/modules/events/vars.yaml`): set `actions_collection: actions` (and `contacts_collection`) on the events module entry. The demo's `company-setup` and `onboarding` workflows already target `companies-collection` / `leads-collection`, so action cards appear on the company and lead timelines with no per-entity config — exercising the whole path through one var.

## Key decisions

### D1 — Why collapsing is now safe (and was not when Part 46 D6 split them)

Part 46 D6 split the timeline for **one reason — a module-dependency cycle**, in its words:

> The events module is **foundational — it declares no dependencies**. The naive port (have the events timeline call into the workflows plugin) would make **events → workflows** … a **workflows ⇄ events cycle** … The fix is to **invert ownership**: workflows exposes `GetEventsTimeline` … reading events itself.

Two facts dissolve that constraint:

- **The cycle was about a *module* dependency; the policy lives in the *plugin package*.** `@lowdefy/modules-mongodb-plugins` is the shared layer *below* both modules, and the events module **already declares it** (`module.lowdefy.yaml:87–89`). Events reaching the enrichment engine is `events → plugin`, not `events → workflows`. **No cycle.** D6 could not take this path because the engine then needed `workflowsConfig`, a workflows-module artefact riding the `WorkflowAPI` connection.
- **The enrichment no longer needs workflow config.** Access/link/card-worthiness are all functions of data already on the action (`access`, `[display_key].links`, `status`) plus the session user's roles (verified: `computeAllowed`/`collapseLink`/`gateAllows` in `resolveActionAccess.js`; the card-worthiness `$match` reads only `status.stage`). The sole config use — declaration-order sort — is removed by denormalising the sort key (change 1). With config gone, the engine is a pure function of stored data + roles and is free to live anywhere.

D6's *other* principle — **one policy implementation, no stragglers** (D2) — is **preserved**: there is still exactly one JS implementation of verb/link policy in the plugin. This part changes *which surface reaches it*, not how many implementations exist.

### D2 — One enriching timeline, not a slot that swaps two timelines (the original Part 50)

The original Part 50 kept two timeline components and added a `components.events_tile` slot so an app could *replace* the events-only tile with the workflows one per entity. That solved the symptom (two timelines, append-only slots) while keeping the cause (the split). Collapsing removes the cause: one component, enrich-in-place. The consumer cost drops from a per-entity card-swap to a single module-entry var, and the lossless-superset property the original D3 leaned on (`GetEventsTimeline` ⊇ `get-events`) becomes the *literal* behaviour of one query rather than a guarantee about two. The slot, the pre-wired `events-tile` drop-in, and the `docs/idioms.md` "replaceable-region" flavor are all dropped — unbuilt, so nothing to retract.

### D3 — `display_key` is the per-app namespace key the engine calls `app_name`

The engine reads display blocks as `$<app_name>.title` and access as `access[app_name]`. The events module already has this exact value as its required `display_key` var ("App identifier for display objects") and builds `$<display_key>.title` in `events-timeline.yaml` today. They are the same key; the engine is configured with `display_key`. No new app-name plumbing.

### D4 — Enrichment defaults OFF (`actions_collection: null`), preserving events-only-by-default

D6's instinct that the foundational events module should not assume workflows exist is honoured by the **default**, not by a separate component. With `actions_collection` unset:

- the engine skips the actions `$lookup` and its dependent dedup stages entirely — a pure-CRM app pays nothing and **renders identically** to today's events-only timeline;
- the events module names no workflows concept in its default configuration.

"Renders identically," not "byte-for-byte": the engine always tacks an `actions: []` key onto each event (today's request emits no such key), and the author-avatar join is gated *separately* by `contacts_collection` — so setting that var adds a contacts `$lookup` and a `created.user.picture` field even with `actions_collection` null. Neither is user-visible: the `EventsTimeline` block guards card rendering with `Array.isArray(event.actions) && event.actions.length > 0` (verified, `EventsTimeline.js:527`), so an empty `actions` array renders no cards, and a missing avatar falls back to initials.

Setting the var is the explicit, app-level opt-in (the legal `app → workflows-data` direction). This is a *better* default-preservation than two components: the events-only path is the same code, not a parallel one, so the two cannot drift. The trade we *do* accept: when enrichment is on, the events module's connection names the `actions` collection — it becomes workflow-*aware* in that configuration. That awareness is the price of one timeline; D1 establishes it carries no cycle and no config coupling.

### D5 — Denormalised sort key: the staleness trade, already accepted for access

Denormalising declaration indices means a config reorder (move an action/group) does not retroactively reorder already-written actions until their next transition rewrites the doc. Because the comparator is shared (change 1), this trade applies to **every config-ordered surface, not just the timeline** — the overview, entity, and action-group pages served by the three `WorkflowAPI` overview engines also order by the doc-stamped indices, where today they order from live `workflowsConfig`. This is the standard denormalisation trade — and the codebase **already makes it for `access`** (`planActionTransition.js:209` stamps config access onto the doc; a config gate change does not propagate to in-flight actions until the next plan). Extending it to a *cosmetic* ordering field is strictly lower-stakes than the permission field already denormalised this way. Actions written before the field exists sort deterministically last (the comparator already maps a missing index to `+∞`, then `_id`), and **no migration is needed — workflows has not shipped to consumers**, so there is no live action data to backfill.

## Current state (verified)

| Fact | Location | Bearing |
| --- | --- | --- |
| Access denormalised onto the action at write time | `planActionTransition.js:209` (`doc.access = actionConfig.access`, also `workflow_type`/`title`/`tracker`) | Sort key joins the same write (change 1) |
| Auth match is data + roles, no config | `resolveActionAccess.js` `computeAllowed`/`collapseLink`; `gateAllows` (`loadWorkflowState.js:38`) | Enrichment needs no `workflowsConfig` (D1) |
| `workflowsConfig` used once, for sort only | `GetEventsTimeline.js` → `makeWorkflowOrderComparator(workflowsConfig)` | Removing sort-config makes the engine config-free |
| Events depends on the plugin package | `modules/events/module.lowdefy.yaml:87–89` | Engine reachable without a module cycle (D1) |
| `display_key` == engine `app_name` | events `module.lowdefy.yaml:21` var; `events-timeline.yaml` builds `$<display_key>.title` | Engine configured with `display_key` (D3) |
| Events-only timeline does no actions/contacts join today | `modules/events/components/events-timeline.yaml` (`$match`/`$sort`/`$addFields` only) | Both joins are new, both var-gated (changes 2–3) |

Dead display config to delete (change 6): `actionStatusConfig` prop wiring (`modules/events/components/events-timeline.yaml:88–91`), the `action_statuses_display` var (`module.lowdefy.yaml:58–66`), and its README section.

## Worked example — turn on enrichment for the whole app

```yaml
# apps/demo/modules/events/vars.yaml  (the events module entry)
- id: events
  source: "github:lowdefy/modules-mongodb/modules/events@v1"
  vars:
    display_key: demo
    actions_collection: actions      # ← enrichment on; null/omitted = events-only
    contacts_collection: user-contacts
```

Every entity timeline in the app now renders action cards for actions referenced by its events; entities with no workflow actions render exactly as before (empty `$lookup`). No entity-module change, no per-entity vars, no second component. Omit `actions_collection` and the app is back to the events-only timeline with zero other changes.

## Files changed

- `plugins/modules-mongodb-plugins/src/connections/.../GetEventsTimeline/` — drop the `workflowsConfig` dependency; read the denormalised sort key. `GetEventsTimeline.test.js` — drop `workflowsConfig` from the context fixture and stamp the two declaration indices onto each action doc (the engine now orders by doc-stamped indices, not config).
- `plugins/modules-mongodb-plugins/src/connections/EventsTimeline/` (new) — new read-only connection type with its own `schema.js` (`databaseUri`, `app_name`, `eventsCollection`, `actionsCollection`, `contactsCollection`, `user` via `_user: true`) that exposes the `GetEventsTimeline` request; `plugins/.../src/connections.js` — export `EventsTimeline` alongside `WorkflowAPI`.
- `plugins/modules-mongodb-plugins/src/connections/shared/render/compareActionOrder.js` (+ `compareActionOrder.test.js`) — read stored declaration indices off the action instead of resolving them from config.
- `plugins/.../WorkflowAPI/{GetEntityWorkflows,GetWorkflowOverview,GetWorkflowActionGroupOverview}/*.js` — the comparator change is global (change 1); drop the now-unused `workflowsConfig` argument at each `makeWorkflowOrderComparator(...)` call. These engines now order by doc-stamped indices too (D5).
- `modules/workflows/resolvers/makeWorkflowsConfig.js` — in the existing group/action normalisation pass, attach each action's `group_index` (position in `action_groups[]`) and `decl_index` (position in `actions[]`) onto its config entry, so the indices are computed once at build time.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` (`:209`) — copy `actionConfig.group_index` / `actionConfig.decl_index` onto the action doc beside `doc.access` (plain copy; no signature change). This is the single write path, so every action mutation (seed, submit, close, cancel, auto-unblock, tracker-level) carries the indices.
- `modules/events/module.lowdefy.yaml` — add `actions_collection` + `contacts_collection` vars (default null); wire them onto the connection; delete the dead `action_statuses_display` var.
- `modules/events/connections/events-timeline.yaml` (new) — an `EventsTimeline` connection wired with `app_name: {_module.var: display_key}`, the events/actions/contacts collection names, and `_user: true`. `events-collection.yaml` (`MongoDBCollection`) stays for the event writes/change-log.
- `modules/events/components/events-timeline.yaml` — route the timeline request through the engine; var-gate the actions/contacts joins; carry the `onActionClick` check hook; delete the dead `actionStatusConfig` wiring.
- `modules/events/README.md` — document the enrichment vars; remove the dead-config section.
- `modules/workflows/` — delete `components/workflows-events-timeline.yaml`, `requests/get_events_timeline.yaml`, and the `WorkflowAPI` `GetEventsTimeline` request wiring; move the check-action hook onto the events timeline.
- `apps/demo/modules/events/vars.yaml` — set `actions_collection` / `contacts_collection`; `apps/demo/pages/leads/lead-view.yaml` — point at the events timeline.
- `docs/` — events module page documents the enrichment vars and the one-timeline model; remove the two-timeline / swap material.

## Non-goals

- **Framework optional-dependency support** — not needed; the plugin-package seam (D1) and the `actions_collection` var (D4) give the opt-in without it.
- **Per-entity choice of enriched vs events-only** — enrichment is an app-wide switch on the events entry. A mix (enriched on one entity, plain on another) is not supported; if a concrete need appears, it is a follow-up, not speculative surface added now.
- **A data migration for the denormalised sort key** — workflows is unshipped; pre-field actions sort deterministically last (D5).
- **Changing the action access/verb model** — this part relocates and de-configs the existing read engine; the policy (D4) is unchanged.

## Related

- [Part 46 — Debundle workflow config](../_completed/46-debundle-workflow-config/design.md) — D6 created the two-timeline split this part re-merges; D2's "one policy implementation" principle is preserved. This part supersedes D6's split (top note).
- [Part 55 — check-modal page ownership](../_completed/55-check-modal-page-ownership/design.md) — the `onActionClick` hook the unified events timeline now carries.
