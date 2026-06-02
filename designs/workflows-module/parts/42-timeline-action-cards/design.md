# Part 42 — Timeline action cards

The events timeline used to render more than a list of titles: for each event that referenced a workflow action, it also drew an alert-style card showing that action's **current** status, message, and a link to the action page — and it attached that card only to the *most recent* event referencing each action, so a card "moved down" the timeline as the action progressed. The module-ized events timeline dropped this: the `EventsTimeline` block still renders the card, but nothing feeds it the data, so the capability is silently gone. This part restores it.

The fix is one shared aggregation fragment that joins events to the live `actions` collection and de-duplicates to the latest referencing event. The events module's timeline runs it **always** (no author input, no dependency on the workflows module — just a build-time `_ref` to shared monorepo config), and the workflows module re-exports the same fragment so app developers can splice it into their own custom history pipelines.

## Proposed change

1. Add a shared aggregation fragment `modules/shared/workflow/timeline_action_lookup.yaml` — the events→`actions` `$lookup`, an **access-aware** action projection (`status`, `message`, and a single resolved `link`), and the "attach to latest referencing event only" de-dup, parameterized by one build-time `app_name` var. The link is *not* read straight off the action cell: post-[Part 38](../38-engine-rebuild/design.md) the cell carries a per-verb `links` map, so the fragment composes two new shared stages — `visible_verbs.yaml` (resolve which verbs this user has) and `resolve_action_link.yaml` (collapse the map to the one link the user can actually use) — see D5.
2. Splice that fragment into the events module's `events-timeline.yaml` `get-events` pipeline **unconditionally**, passing `app_name` from the events module's existing `display_key` var — no new author-facing config.
3. Pass `actionStatusConfig` to the `EventsTimeline` block from a **shared** status-display enum.
4. Move `modules/workflows/enums/action_statuses.yaml` to `modules/shared/enums/action_statuses.yaml` so both the workflows pages and the events timeline read one source; reconcile the `EventsTimeline` block to that enum's key shape.
5. Re-export the shared fragment from the workflows module manifest as a `timeline-action-lookup` component, so app developers building custom timelines (category filters, pagination — the full v0 `get_ticket_history` shape) `_ref` it instead of re-pasting the de-dup pipeline.
6. Adopt the same `resolve_action_link.yaml` stage in the three workflow read APIs that project an action link — `get-entity-workflows` (actions-on-entity), `get-workflow-overview` (the workflow-overview page), and `get-action-group-overview` (the workflow-group-overview page) — so every surface renders the **identical** access-aware link. Each API today projects the singular `link: $<app_name>.link`, which Part 38 deletes; the stage replaces that projection. The pages stay unchanged — they already render `actions_list.$.link` from the API response. Read-side link selection is computed once, server-side, for every surface (D5). The now-superseded "the UI applies the per-verb selection rule" prose is dropped from Part 38; its write contract (the per-verb `links` map) is unchanged.

## Current state

**The block can already render the card; nothing feeds it.** `EventsTimeline.js` ships an `EventAction` component ([EventsTimeline.js:356-423](../../../../plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/EventsTimeline.js)) that, for each entry in an event's `actions[]` array, draws an Antd `Card` styled from `actionStatusConfig[status]`, renders the action `message` as a badge, and renders a `link` → action page via the block's `onActionClick` event ([meta.js:9-16](../../../../plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/meta.js)). It renders nothing when `actions` is empty or `actionStatusConfig` is absent (EventsTimeline.js:357, 475-478).

**Neither input is wired.** The events module's `events-timeline.yaml` component runs a plain `$match` (by reference key) → `$sort` → title/description/info projection ([events-timeline.yaml:13-58](../../../../modules/events/components/events-timeline.yaml)). It performs no `$lookup`, so `event.actions` is always empty, and it passes no `actionStatusConfig` to the block. The workflows module ships no timeline at all (`workflow-history` was deferred out of v1 — [part 18 § Out of scope](../_completed/18-entity-components/design.md)). So the inline live-action card is dropped at the data layer in both modules.

**The reference implementation** (v0, `apps/.../tickets/ticket-view/requests/get_ticket_history.yaml`) did it in one custom request: `$lookup from: actions` on `action_ids`, project `{ status, message, link }` from the app-keyed status-map cell, then a `$setWindowFields`(partition by `action._id`, sort by `created.timestamp`) + `$group` pass that pushed each action only onto the event whose `_id` equalled the partition's last event id. That request also did category filtering (notes/comments/actions/events chips) and pagination — those stay app-specific (see Non-goals).

**Why not `actions-on-entity`.** The shipped `actions-on-entity` widget ([part 18](../_completed/18-entity-components/design.md)) renders the always-on, grouped action tree at the top of an entity page. It is a different surface with a different job: it does not place a current-status card *chronologically inline* on the most recent referencing event. The timeline card and the widget coexist, exactly as in v0.

## Key decisions

### D1 — One shared fragment, two consumers, no module dependency

The join lives once, in `modules/shared/workflow/timeline_action_lookup.yaml`. Rationale:

- **Events must not depend on workflows.** The events module is a generic, dependency-free module (`module.lowdefy.yaml` declares no `dependencies:`). Making its timeline `$lookup` the `actions` collection is workflow-domain knowledge, but routing it through a build-time `_ref` to `modules/shared/` keeps it *shared config*, not a *module dependency* — the same mechanism `events-timeline.yaml` already uses for `../shared/enums/event_types.yaml`.
- **One correct way.** The live-action display read (`status`, `message`, and link selection) is workflow-wide knowledge. Re-pasting the de-dup pipeline per app (as v0 did), or re-implementing the per-verb link pick in each UI surface, is exactly the drift the project's "one correct way" principle warns against. The lookup/de-dup fragment and the `visible_verbs` / `resolve_action_link` stages it composes are the single source of truth (D5).
- **Workflows re-exports it for ergonomics.** App developers consuming the published workflows module can't easily `_ref` a relative `../shared/...` path. The workflows manifest exports the shared file as a `timeline-action-lookup` component, giving them a clean `_ref: { module: workflows, component: timeline-action-lookup }` handle for custom pipelines. Same file, two entry points.

### D2 — Always-on, not author-opt-in

The events timeline runs the lookup on every fetch, with no per-call or per-author flag. Rationale:

- **No new config surface.** The fragment's only parameter is `app_name`, which the events module already has as `display_key` (the idioms doc confirms `display_key` *is* the app name). The timeline passes it through; authors configure nothing.
- **Safe when there are no actions.** `$lookup` against a non-existent `actions` collection returns empty arrays — no error. An app that uses the events module without workflows simply gets empty `event.actions` and renders no cards. The de-dup/window stages operate only on events whose `action_ids` is non-empty, so the marginal cost on action-free timelines is one no-op `$lookup` stage.
- **Trade-off (accepted):** the generic events timeline now structurally embeds the `actions`-collection + app-keyed-status-map convention. This is defensible because that convention is monorepo-wide (it is how `get-entity-workflows` and the v0 timeline both read live action display), and this is *the monorepo's* timeline, not a third-party library. Documented as a shared convention in the events README and idioms.

### D3 — One shared base enum + a per-module display override; reconcile the block to it

`actionStatusConfig` is fed from the shared **base** enum `modules/shared/enums/action_statuses.yaml` (moved from `modules/workflows/enums/`) merged with a per-app override, exactly like the sibling `eventTypeConfig` prop in the same file:

```yaml
actionStatusConfig:
  _build.object.assign:
    - _ref: ../shared/enums/action_statuses.yaml   # shared base
    - _module.var: action_statuses_display          # events module's own override var
```

**Why an override at all, and why on each module.** The status *keys* are engine-fixed (FSM stages), so an app can't add/remove statuses — but colours and titles are legitimately per-app for a reusable module (a second app will rebrand "Done" → "Completed", use its own palette, etc.). The workflows pages already get this via the workflows `action_statuses_display` var; the timeline needs the same so an app's branded statuses look identical on both surfaces. events **must not** depend on workflows (it's the foundational logging module, usable in workflow-free apps — a `{ module: workflows }` ref wouldn't resolve there), so it carries its **own** `action_statuses_display` var. An app keeps the two in sync trivially by pointing both module entries at one app-local file: `action_statuses_display: { _ref: <app>/action_statuses_display.yaml }`. One source, two refs, no value duplication. (Considered and rejected: a single events→workflows dependency to share one var — it would break events in workflow-free apps and invert the module layering; see D1.)

The current `EventsTimeline.EventAction` reads `card_color` / `border_color` / `color` / `title`, but the enum carries `color` (light fill) / `borderColor` / `titleColor` / `title` / `priority`. Rather than maintain a parallel timeline-only colour schema, **reconcile the block to the enum**:

| EventAction usage | Reads today | Reads after |
| ----------------- | ----------- | ----------- |
| Card background   | `card_color` | `color` (the light fill, e.g. `#e6f7ff`) |
| Card border       | `border_color` | `borderColor` |
| Status badge dot / text | `color` | `titleColor` |
| Badge label fallback | `title` | `title` (unchanged) |

This makes one shared base enum the single source of status display across the workflow pages (which already consume the `action_statuses` component) and the timeline, with each surface layering the same per-app override. (`ActionSteps` is unaffected — it uses its own hardcoded theme-token map, [ActionSteps.js:18](../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/ActionSteps.js), and is out of scope here.)

### D4 — De-dup semantics carried verbatim

The "attach the live card to the most recent referencing event only" behaviour is the load-bearing part of the feature, not an optimisation. The fragment carries v0's proven `$setWindowFields`(partition `action._id`, sort `created.timestamp` asc) → `$group` → keep-on-last-event logic. Within `events-timeline` the fragment runs *after* the reference `$match`, so the "latest event" partition is scoped to the entity whose timeline is being viewed.

**Behaviour requirement — cards appear and migrate because the engine references every touched action.** This is a documented requirement on the write side (Part 38, "Engine entry points emit events"): every event's `references.action_ids` lists **all** actions the invocation's plan touched, not just the acted-on one. That contract is what makes the timeline complete: every non-blocked action surfaces as a card from the moment an event first touches it (`workflow-started` references all initially created actions, so opening action-required cards render on the started event), and each card *migrates* to the latest touching event as status changes. Example: Action A completes and unblocks B → that one event references both, so the timeline renders A's done card and B's action-required card on it; when B later completes, B's card moves to B's own done event. If events referenced only the acted-on action, a newly-unblocked action would be referenced by no event and would never appear in the timeline at all.

**Assumption: `created.timestamp` tracks `date`.** Card *attachment* keys off `created.timestamp` (the window sort), but the timeline *displays* events sorted by `date` (`events-timeline.yaml:32`). `new-event.yaml` sets both to `_date: now` at insert (`date: { _date: now }`; `created` via the change stamp), so the card always lands on the visually-last event. If events are ever backfilled or imported with a `date` that diverges from `created.timestamp`, the card could attach to an event that isn't visually last — there is no such path today, but the fragment assumes the two fields agree.

### D5 — The single rendered link is resolved server-side, access-aware, once for every surface

v0 stored one pre-resolved `link` per action and the card rendered it. [Part 38](../38-engine-rebuild/design.md) (implementing [Part 34 D7](../_completed/34-action-access-model/design.md)) replaces that single cell with a per-verb **map** — `action.<app_name>.links: { view, edit, review, error }`, each cell a `{ pageId, urlQuery, title }` link object or `null` where the slug doesn't declare the verb / the stage has no page. So *some* consumer must collapse the map to the one link to show. The card reads a single `link` (`EventsTimeline.js:399-417`); it does not select.

**Decision: collapse the map in the aggregation, not the view layer — and account for both dimensions.**

- **State** is already encoded in the map: at a `done` stage the `edit`/`review`/`error` cells are `null`, so a done action resolves to `view` for everyone — no access logic needed for that. Selection must therefore skip `null` cells.
- **Access** is *not* in the map: per-verb role gates live in `visible_verbs` (verbs the user actually holds, from `access.{app}.{verb}` ∩ `_user.apps.{app}.roles`). The events-timeline pipeline does not otherwise resolve this, so a naive pick could surface an `edit` link to a view-only user.

The fragment resolves a single `link` = the highest-priority verb (`edit > review > error > view`) whose cell is **both** non-`null` (state) **and** true in `visible_verbs` (access), else `null`. Two new shared stages do this and are parameterized by `app_name`:

- `modules/shared/workflow/visible_verbs.yaml` — `$addFields visible_verbs: { view, edit, review, error }` resolving each verb from `$access.<app_name>.<verb>` (`true` or a role array) against `_user.apps.<app_name>.roles`. This is the *compute* half of Part 38's `visible_verbs_filter.yaml`, factored out so the dependency-free events module can reuse it via `../shared/` (same D1 justification as the lookup). Part 38's `visible_verbs_filter.yaml` becomes this stage + its `$match $anyElementTrue` drop.
- `modules/shared/workflow/resolve_action_link.yaml` — `$addFields link:` the priority pick over `$<app_name>.links` ∩ `visible_verbs`.

**Reused by every surface.** The three link-projecting read APIs — `get-entity-workflows` (actions-on-entity), `get-workflow-overview` (workflow-overview page), and `get-action-group-overview` (workflow-group-overview page) — already run `visible_verbs_filter` (Part 38 task 7); each `_ref`s `resolve_action_link.yaml` after it, replacing its singular `link: $<app_name>.link` projection. The consuming pages are untouched — they render `actions_list.$.link` from the API response. So the timeline card, the entity widget, the group overview, and the workflow overview render an identical, access-correct link from one implementation.

**This supersedes Part 38's "UI applies the per-verb selection rule."** Part 38 still *writes* the per-verb `links` map (engine/write concern, unchanged); *which* link renders is a read-side display concern that moves here. Part 38's selection-rule prose is dropped wherever it appeared (its D14 display-surface note, D16, test strategy, Files-changed display row, and tasks 7 + 18), leaving the engine to own the map and the display layer to own resolution.

```yaml
# resolve_action_link.yaml — sketch
$addFields:
  link:
    $let:
      vars:
        v: { $getField: { field: links, input: { $getField: { field: { _var: app_name }, input: $$ROOT } } } }
        vv: $visible_verbs
      in:
        $switch:
          branches:
            - case: { $and: [$$vv.edit, { $ne: [$$v.edit, null] }] }
              then: $$v.edit
            - case: { $and: [$$vv.review, { $ne: [$$v.review, null] }] }
              then: $$v.review
            - case: { $and: [$$vv.error, { $ne: [$$v.error, null] }] }
              then: $$v.error
            - case: { $and: [$$vv.view, { $ne: [$$v.view, null] }] }
              then: $$v.view
          default: null
```

### D6 — A timeline keyed to a reference never renders that reference's own action card

[Part 33](../33-comment-rendering/design.md) adds the standard `events-timeline` component to the action view page (`simple-view.yaml`), filtered to the action (`reference_field: action_ids`, `reference_value: get_action._id`). Because this part splices the lookup fragment into `events-timeline` **unconditionally** (D2), that page's timeline would otherwise attach a live status card for the very action whose page you're on — a card whose resolved `link` points back to the current page, sitting beside the action header and the `status_history_list` Part 33 leaves in place. That self-referential card is noise.

**Decision: the `events-timeline` component drops the action whose `_id` equals the timeline's own `reference_value`.** The component already carries `reference_value` as a request payload (`events-timeline.yaml:18-20`) — the id the whole timeline is keyed on. A single `$filter` stage spliced **after** the fragment removes that action from each event's `actions[]` array. The event row still renders (title + comment-as-description); only its own card is stripped, and an emptied `actions: []` renders no card (`EventsTimeline.js:357`).

- **The filter lives in `events-timeline.yaml`, not the shared fragment.** The fragment is re-exported for custom pipelines (D1) that do their own `$match` and may carry no `reference_value` payload; referencing it inside the fragment would couple the generic fragment to this component's wiring. The "don't card-link to the page you're on" rule belongs in the component that owns `reference_value`.
- **After the de-dup, not before.** The fragment has already attached each action to its latest event; one `$filter` on the output strips the self-action. Simpler than threading an exclusion through the `$lookup`/window stages.
- **Unconditional is safe and needs no new config.** On an entity-page timeline `reference_value` is an entity id, and no `action._id` will ever equal it, so the stage is a no-op there. It only bites when the timeline is keyed on an action id — preserving D2's always-on, zero-author-config stance. (This relies on action and entity id spaces being disjoint, which they are; the rule reads as "a timeline keyed on X hides X's own action card.")

## Proposed shape

### `modules/shared/workflow/timeline_action_lookup.yaml` (new)

A YAML sequence of aggregation stages, `_ref`-able with one var. Spliced into a pipeline that has already `$match`ed events down to the target reference. Stages (adapted from v0 `get_ticket_history` lines 90-167):

1. `$lookup` `from: actions`, `localField: action_ids`, `foreignField: _id`, `as: actions`, inner pipeline that, per action: composes `_ref: ../shared/workflow/visible_verbs.yaml` (compute `visible_verbs`) then `_ref: ../shared/workflow/resolve_action_link.yaml` (compute the single access-aware `link`), and projects `{ _id, status: <status.stage[0]>, message: $<app_name>.message, link, sort_order }` (blocked actions filtered, matching v0). Both shared stages take the same `app_name` var.

   *Join field confirmed:* `action_ids` is a top-level field on every action-referencing event doc — the engine's event dispatch writes `references: { workflow_ids, action_ids, <refKey> }` (`dispatchLogEvent.js:82-86`) and `new-event.yaml` spreads `_payload: references` onto the doc. Already queried by `simple-view.yaml:222`. Part 38 **widens** this composition (its review-9 #3): `action_ids` lists **every action the invocation's plan touches** — uniform across all event types, including the new lifecycle events — not just the single submitted action (the pre-38 `worked-example.test.js` assertion `eventDoc.action_ids` ≡ `["A1"]` changes accordingly). So the `$lookup` joins on a field that exists and is populated for exactly the actions whose cards should surface (D4).
2. `$unwind` actions (preserve empties) → `$setWindowFields` (partition `actions._id`, sort `created.timestamp` asc, capture `last_event_id`) → `$group` by event `_id`, pushing the action only when `last_event_id == _id`, else null → filter nulls → sort by `(sort_order, updated.timestamp)` → `$replaceRoot` back to the event.

Parameter: `app_name` (`_var`), used build-time inside `_string.concat: ['$', _var: app_name, '.message']` exactly as `get-entity-workflows.yaml:62-71` does with `_module.var: app_name`, and passed through to the two composed shared stages.

### `modules/events/components/events-timeline.yaml` (edit)

```yaml
requests:
  - id: get-events
    properties:
      pipeline:
        - $match: { ... }                      # unchanged
        - _ref:                                 # NEW — always spliced
            path: ../shared/workflow/timeline_action_lookup.yaml
            vars:
              app_name:
                _var: { key: display_key, default: { _module.var: display_key } }
        - $addFields:                           # NEW — drop the timeline's own action card (D6)
            actions:
              $filter:
                input: $actions
                as: a
                cond: { $ne: [$$a._id, { _payload: reference_value }] }
        - $sort: { date: -1 }                   # unchanged
        - $addFields: { title, description, info }   # unchanged
blocks:
  - id: events-timeline
    type: EventsTimeline
    properties:
      actionStatusConfig:                       # NEW — base enum ⊕ per-app override
        _build.object.assign:
          - _ref: ../shared/enums/action_statuses.yaml
          - _module.var: action_statuses_display
      # ...existing props
```

### `modules/workflows/module.lowdefy.yaml` (edit) — re-export

```yaml
exports:
  components:
    - id: timeline-action-lookup
      description: Aggregation fragment that enriches events with live action cards (status, message, link); _ref into custom timeline pipelines.
components:
  - id: timeline-action-lookup
    component:
      _ref: ../shared/workflow/timeline_action_lookup.yaml
```

App developer, custom history pipeline:

```yaml
- $match: { ... }            # entity + category-chip filtering, app-authored
- _ref:
    module: workflows
    component: timeline-action-lookup
    vars: { app_name: my-app }
- $facet: { ... }            # pagination, app-authored
```

## Files changed

| File | Change |
| ---- | ------ |
| `modules/shared/workflow/timeline_action_lookup.yaml` | **New** — the shared lookup/de-dup fragment; composes the two stages below (D1, D4, D5). |
| `modules/shared/workflow/visible_verbs.yaml` | **New** — `$addFields visible_verbs` compute stage; reused by the timeline fragment and `visible_verbs_filter.yaml` (D5). |
| `modules/shared/workflow/resolve_action_link.yaml` | **New** — `$addFields link`, the access-aware priority pick over the per-verb `links` map (D5). |
| `modules/workflows/api/get-entity-workflows.yaml`, `modules/workflows/api/get-workflow-overview.yaml`, `modules/workflows/api/get-action-group-overview.yaml` | Adopt `resolve_action_link.yaml` (after `visible_verbs_filter`), replacing each API's singular `link: $<app_name>.link` projection, so actions-on-entity / the workflow overview / the group overview render the identical server-resolved link (D5). Consuming pages render `actions_list.$.link` unchanged. |
| `designs/workflows-module/parts/38-engine-rebuild/design.md` | Drop the read-side "UI applies the per-verb selection rule" prose (D14 display-surface note, D16, test strategy, Files-changed display row); engine keeps writing the per-verb `links` map (D5). **Part 38's generated tasks 7 + 18 also carried the UI-selection prose — repointed to this part's server-side resolution.** |
| `modules/shared/enums/action_statuses.yaml` | **New (moved)** from `modules/workflows/enums/action_statuses.yaml` (D3). |
| `modules/workflows/enums/action_statuses.yaml` | **Removed**; `modules/workflows/components/action_statuses.yaml` ref repointed to `../shared/enums/action_statuses.yaml`. |
| `modules/events/components/events-timeline.yaml` | Splice fragment into `get-events`; add the `$filter` stage that drops the timeline's own `reference_value` action card (D6); pass `actionStatusConfig` as base enum ⊕ `action_statuses_display` override (D2, D3). |
| `modules/events/module.lowdefy.yaml` | Add `action_statuses_display` var (object, default `{}`), mirroring `event_types`; doc the "point both module entries at one app file" wiring (D3). |
| `plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/EventsTimeline.js` | Reconcile `EventAction` colour keys to the enum (D3). |
| `modules/workflows/module.lowdefy.yaml` | Add `timeline-action-lookup` component export (D1). |
| `modules/events/README.md`, `docs/idioms.md` | Document the always-on lookup as a shared convention; document the exported fragment. |

## Non-goals

- **Category-chip filtering** (notes / comments / actions / events) and **pagination** — these were app-specific UI in v0's `get_ticket_history` and stay app-authored. The exported fragment is the reusable piece; the surrounding `$match`/`$facet` is not.
- **Comment-inline rendering** — owned by [part 33](../33-comment-rendering/design.md). This part is about the *action* card; the two timeline-enrichment concerns stay separate.
- **`ActionSteps` colour source** — unchanged (hardcoded theme tokens).

## Open questions

None. (The earlier "is the link render-ready / does it need `action_id` substitution?" question is resolved by D5: the fragment no longer reads a single `<app_name>.link`; it resolves one from the per-verb `links` map, whose cells already carry render-ready `urlQuery` — `action_id` for simple/form, `workflow_id` for tracker, per Part 38 line 359.)

## Depends on

- **[Part 38 — engine rebuild](../38-engine-rebuild/design.md)** for the link contract this part assumes: the per-verb `action.<app_name>.links: { view, edit, review, error }` map (Part 34 D7) and the `access.<app>.<verb>` shape `visible_verbs` resolves against. This part targets the **post-38** contract, not the pre-38 single `<app_name>.link`.
- The `actions` collection + app-keyed status-map cell convention from the workflows engine (`get-entity-workflows.yaml`, `actions-collection.yaml`).
- The shipped `EventsTimeline` block (`plugins/modules-mongodb-plugins`) — already renders the card (single `link`); this part feeds, re-colours, and resolves its link server-side.

## Related

- [Part 33 — Comment rendering on the events timeline](../33-comment-rendering/design.md) — sibling timeline-enrichment concern; it adds the standard timeline to the action view page, where D6 governs the combined surface (this part's card + Part 33's inline comment) by suppressing the action's own self-referential card.
- [Part 18 — Entity-page components](../_completed/18-entity-components/design.md) — `actions-on-entity` (the always-on widget, distinct surface).
