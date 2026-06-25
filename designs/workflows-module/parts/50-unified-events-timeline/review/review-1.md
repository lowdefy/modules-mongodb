# Review 1

Scope: Part 50 "Collapse to one config-free entity events timeline." Verified against
`plugins/modules-mongodb-plugins/src/connections/**` and `modules/{events,workflows}/`.

The core thesis holds up against the code: `workflowsConfig` is read exactly once in
`GetEventsTimeline.js` (`:31`, `:253`, `:263`) and only for sort; the access policy
(`computeAllowed`/`collapseLink`/`gateAllows`) is pure data + roles; the events module
already depends on the plugin package (`module.lowdefy.yaml:87–89`); and `display_key`
is the same value the engine calls `app_name`. D1's "no cycle" argument is sound. The
findings below are about blast radius and feasibility detail the design under-specifies,
not about the thesis.

## Correctness & blast radius

### 1. The order comparator is shared by four engines, not just the timeline — change 1 and D5 understate the blast radius

> **Resolved.** Made the global blast radius explicit. Change 1 now states the comparator is shared by all four read engines and the de-config is global (with the fork-per-timeline alternative rejected for breaking the Part 54 single-source-of-truth). D5 now states the staleness trade governs the overview/entity/action-group pages too, not just the timeline. The three overview engines are added to Files-changed (drop the now-unused `workflowsConfig` argument).

Change 1 and D5 are written as if `makeWorkflowOrderComparator` were timeline-local. It
is not. `compareActionOrder.js` is explicitly "the single source of truth for action
display order across **every** read engine (Part 54)," and it is consumed by four:

- `GetEventsTimeline/GetEventsTimeline.js:253`
- `GetEntityWorkflows/GetEntityWorkflows.js`
- `GetWorkflowOverview/GetWorkflowOverview.js`
- `GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.js`

If the comparator switches from resolving `cfg.action_groups`/`cfg.actions`
(`compareActionOrder.js:37–42`) to reading denormalised indices off the doc, the
ordering semantics of the **three overview engines change too** — and those engines run
on the `WorkflowAPI` connection where live `workflowsConfig` is available today. That
means D5's staleness trade ("a config reorder doesn't reorder already-written actions")
silently extends to **overview/group/entity pages**, not just the timeline. The design
presents D5 as a cosmetic timeline-only concession; in reality it governs every
config-ordered surface in the module.

This is defensible (it preserves the "one ordering implementation" that the comparator's
own header touts, and workflows is unshipped so there's no live data), but the design
must say so explicitly. The alternative — keep config-based ordering for the three
config-holding engines and fork a doc-based path for the timeline — produces two ordering
implementations and breaks the Part 54 single-source-of-truth, so it should be rejected
in favour of the global change.

**Fix:** State in change 1 / D5 that the comparator change is global and that all four
engines move to doc-stamped ordering; broaden D5 to name overview pages. Add the three
overview engines to the Files-changed list (even if the edit is only dropping the
now-unused `workflowsConfig` argument at each `makeWorkflowOrderComparator(...)` call).

### 2. `planActionTransition` cannot compute the declaration indices from what it receives

> **Resolved.** Adopted the finding's preferred fix, realised at build time. The two indices are computed **once** in the `makeWorkflowsConfig` build-time resolver (`modules/workflows/resolvers/makeWorkflowsConfig.js` — a real production resolver, not just the same-named test helper) during its existing group/action normalisation pass, and attached to each action's config entry. `planActionTransition:209` then copies `actionConfig.group_index` / `actionConfig.decl_index` onto the doc beside `doc.access` — no signature change, no per-transition computation, and the single write path covers all six mutation call sites. Change 1 rewritten accordingly; `makeWorkflowsConfig.js` added to Files-changed.

Change 1 says the two indices are "computed from the config the plan already holds … the
declaration indices join [`doc.access`] there." That is true of the **caller**, not of
`planActionTransition` itself. Its signature (`planActionTransition.js:100–114`) receives
only the single `actionConfig` entry plus `loadedWorkflow` — neither carries the
`action_groups[]` array, so the *group's position* (the first sort key,
`compareActionOrder.js:41`) is not derivable inside the function. `loadedWorkflow` holds
only `_id`/`workflow_type`/`entity_id`/`entity_collection`.

This matters because the denormalisation block at `:209` is the shared write path for
**every** action mutation — `StartWorkflow` seed (`StartWorkflow.js:198`), `CloseWorkflow`
(`:94`), `CancelWorkflow` (`:76`), `planSubmit` (`:98`), `planAutoUnblock` (`:102`),
`planTrackerLevel` (`:95`). Putting the index-copy at `:209` correctly covers all of them
**only if** the indices are already on `actionConfig` when each calls in.

**Fix (preferred, and it makes change 1's wording literally true):** precompute
`group_index` (position in `action_groups[]`) and `decl_index` (position in `actions[]`)
in the `makeWorkflowsConfig` resolver and stamp them onto each normalised `actionConfig`
entry. Then `planActionTransition:209` just copies `actionConfig.group_index` /
`actionConfig.decl_index` onto the doc beside `doc.access` — no signature change, and the
same precomputed values flow through every call site. Document this in the design (it is
currently invisible) and add the resolver to Files-changed.

### 3. "Relocate the method" is actually "introduce a new connection type" — the events sibling connection is under-specified

> **Resolved.** Change 2 rewritten to name the new connection type and its schema. The timeline moves onto a new read-only plugin connection type `EventsTimeline` (registered in `connections.js` beside `WorkflowAPI`), with schema fields `databaseUri`, `app_name` (= `display_key`), `eventsCollection`, `actionsCollection`, `contactsCollection`, and `user` via `_user: true`; `meta.checkRead`/`checkWrite: false`. The events module adds it as a second connection (`connections/events-timeline.yaml`); `events-collection` stays for the event writes/change-log. Files-changed updated with the new connection type, the `connections.js` export, and the new events-module connection YAML.

`GetEventsTimeline` is registered as a request of the `WorkflowAPI` connection
(`WorkflowAPI.js:requests`, surfaced via `types.js`). Lowdefy binds a request type to the
connection type that lists it, and `WorkflowAPI/schema.js` **requires**
`databaseUri`, `entry_id`, `endpoints` (`required: ['databaseUri','entry_id','endpoints']`)
— all workflows-module artefacts. Meanwhile the events module's only connection is
`events-collection.yaml` of `type: MongoDBCollection` (a community-plugin connection),
which cannot host a plugin-defined request type.

So change 2 / the Files-changed bullet "events-collection.yaml (or a sibling connection)
— expose the timeline engine method" is doing more than it says: it requires a **new
plugin connection type** with its own `schema.js`, registered in
`plugins/.../src/connections.js` (today that file exports only `WorkflowAPI`), exposing
`GetEventsTimeline` and configured with `app_name` (=`display_key`), `eventsCollection`,
`actionsCollection`, `contactsCollection`, and `user` via `_user: true`. The events
module then adds this as a **second** connection — `events-collection` must remain for the
event writes/`changeLog` (`events-collection.yaml`).

The pieces line up (`createEngineContext` reads only `connection.*` + `getMongoDb`, and
`GetEventsTimeline` is read-only — `meta.checkRead/checkWrite: false`, so no
`changeStamp`/`write` needed), but the design should name the new connection type, list
its schema fields, and state that `events-collection` stays put. As written, a reader
could think this is an in-place edit to an existing `MongoDBCollection`, which is not
possible.

## Precision of claims

### 4. "Byte-for-byte / identical" with enrichment off is overstated, and a stage-skip is missing

> **Resolved.** Softened "byte-for-byte / identical output" to "renders identically" in the intro, change 3, and D4. D4 now records the two non-visible differences (the always-present `actions: []` key, and the `contacts_collection`-gated author-avatar join) and confirms the block tolerates an empty `actions` array (verified — `Array.isArray` guard at `EventsTimeline.js:527`). Change 3 and D4 now state the engine skips the actions `$lookup` **and its dependent dedup stages** (`$unwind`/`$setWindowFields`/`$group`/`$replaceRoot`) when `actions_collection` is null, not just the `$lookup`.

D4 and the worked example claim that with `actions_collection: null` the timeline is
"byte-for-byte the events-only timeline of today." Two gaps:

- **An `actions: []` key appears that the current request never emits.** The engine's JS
  tail unconditionally returns `{ ...event, actions: enrichedActions }`
  (`GetEventsTimeline.js:303–306`); with no actions that is `actions: []`. The current
  `get-events` request (`events-timeline.yaml`, `$match`/`$sort`/`$addFields` only) emits
  no `actions` field at all.
- **Author-avatar resolution is new behaviour, gated by a *different* var.** The engine
  always runs the contacts `$lookup` and writes `created.user.picture`
  (`GetEventsTimeline.js:223–238`); today's events-only timeline does no contacts join.
  So even with `actions_collection` null, setting `contacts_collection` changes output.

Neither breaks rendering (the `EventsTimeline` block already reads `actions` and falls
back to initials when `picture` is absent), so the *user-visible* claim survives. But
soften "byte-for-byte/identical output" to "renders identically," and confirm the block
tolerates an empty `actions` array.

Separately, the engine today runs `$unwind`/`$setWindowFields`/`$group`/`$replaceRoot`
(`:134–187`) **unconditionally** as part of the actions join. Change 3 says it "skips the
actions `$lookup`" when `actions_collection` is null — but those four dependent dedup
stages must skip with it, or they operate on a non-existent `actions` field. The design
should say "skip the actions lookup **and its dedup stages**," not just the `$lookup`.

## Completeness

### 5. The engine's test will break and isn't in Files-changed

> **Resolved (auto).** Added `GetEventsTimeline.test.js` (drop `workflowsConfig` from the context fixture, stamp the two declaration indices onto each action doc) and `compareActionOrder.test.js` to the Files-changed list.

`GetEventsTimeline.test.js` builds its context with `connection.workflowsConfig` and
asserts config-driven ordering. After the refactor the engine is config-free and orders
by doc-stamped `group_index`/`decl_index`, so the fixtures must (a) drop `workflowsConfig`
and (b) stamp the two indices onto each action doc. Add `GetEventsTimeline.test.js` (and
any `compareActionOrder` test) to the Files-changed list so the test migration isn't
forgotten at implementation time.

## Minor / confirm

### 6. `not-required` sink and `key`/`_id` tiebreakers must survive the comparator's de-config

> **Resolved.** Verified and noted in the design. Only the two declaration indices were ever config-derived; `notRequired` (from `status`), `key`, and `_id` read straight off the action doc and are unaffected by the de-config. In the timeline they survive to the in-memory sort — the actions `$lookup` sub-pipeline rewrites `status` to a scalar and applies no narrowing `$project`, so those fields and the new `group_index` / `decl_index` all pass through. Change 1 now states the full sort key `[group_index, notRequired, decl_index, key, _id]` and this survival.

The comparator's full sort key is `[groupIndex, notRequired, declIndex, key, _id]`
(`compareActionOrder.js:45–51`). Change 1 mentions only the two declaration indices and
the `not-required` sink. Confirm the de-configured comparator still derives `notRequired`
from `status` (it reads `action.status` tolerantly today, `:43`) and still falls back to
`action.key ?? ''` then `String(action._id)` — and that the engine keeps those fields on
the raw action docs until after `rawActions.sort()` (it does today: the trim happens in
the enrichment loop *after* the sort, `:263` then `:266`). No change needed if the
denormalised indices are projected through the `$lookup` (the sub-pipeline does no
narrowing `$project`, so they survive) — just verify this in the design.
