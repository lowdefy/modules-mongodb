# Part 50 — Replaceable entity events tile (`components.events_tile` slot)

Entity modules (companies, contacts, activities) hardcode an events-timeline "History" card on their view pages. An app that adds workflows on an entity has no way to swap that card for the action-enriched timeline [Part 46](../46-debundle-workflow-config/design.md) introduced (`workflows-events-timeline`) — the `components.sidebar_slots` slot can only *append* tiles, so the app would end up with two timelines. This part makes the built-in tile a **replaceable slot**: a `components.events_tile` var on each entity module, defaulting to the existing tile, that an app overrides with a card wrapping the workflows timeline. It also removes the events module's now-dead action-card display config, which was retained only for compatibility no longer needed.

**Layer:** entity-module manifests + view pages + docs + events-module cleanup + demo adoption. **Size:** S. **Repo:** `modules/{companies,contacts,activities,events,workflows}/`, `docs/idioms.md`, `apps/demo/`.

## Proposed change

1. **A `components.events_tile` slot on companies, contacts, and activities.** Each manifest's existing `components` object var gains an `events_tile` property whose **default is the built-in tile** (`default: [{ _ref: components/tile_events.yaml }]`); each view page reads `_module.var: components.events_tile` where it hardcodes the tile today. Zero-config behavior is unchanged.
2. **Activities' inline History card is extracted to `components/tile_events.yaml`** so its slot default is a component file like the other two (today the card is authored inline in `pages/view.yaml:315–326`, main column).
3. **The workflows README gains an "adding workflows to an entity" recipe**: inject the `actions-on-entity` card via `components.sidebar_slots` (the demo already does this) *and* override `components.events_tile` with a card wrapping `workflows-events-timeline` — one documented vars block on the module entry.
4. **`docs/idioms.md` documents the replaceable-region slot flavor**: a `components.*` region with a non-empty default, where the consumer value *replaces* the built-in rather than appending (today's regions are all append-only with `default: []`).
5. **The events module's dead action-card config is deleted**: the `actionStatusConfig` block prop wiring in `components/events-timeline.yaml:88–91`, the `action_statuses_display` manifest var, and its README section. Unreachable since Part 46 removed the timeline action-lookup splice; workflows hasn't shipped to consumers, so the compatibility retention is unnecessary.
6. **The demo adopts the slot on companies** (`apps/demo/modules/companies/vars.yaml`): the demo's `company-setup` workflow targets `companies-collection`, so the swapped tile shows live action cards on the company view — exercising the slot end-to-end, the same way `lead-view` exercises the workflows timeline directly.

## Key decisions

### D1 — Replaceable slot var, not an optional dependency and not hide-flag + append

Three mechanisms were considered for letting an app swap the tile:

- **Optional dependency on workflows + a boolean var** (`workflows_timeline: true` branching the tile via `_build.if`). **Not possible today and undesirable anyway**: the framework has no optional-dependency concept — every declared dependency must resolve to an existing module entry or the build throws (`resolveModuleDependencies.js`, wiring validation step 1) — so companies would *hard*-depend on workflows, forcing the workflows module on every consumer including apps that don't use it. Even with framework support, it couples every entity module to workflows conceptually; the dependency should run app → workflows, not entity-module → workflows.
- **Hide flag + existing `sidebar_slots`** (`tile_events: false` to suppress the built-in, app appends the workflows tile). Works today with a one-line var, but it is two knobs for one intent, and slot blocks append *after* the built-ins — the timeline drops to the bottom of the sidebar, losing its position.
- **Replaceable slot with a built-in default.** **Chosen**: one var, replace = set it, default keeps current behavior and sidebar position. Every mechanical piece is verified: manifest var defaults resolve **through the build walker rooted at the module manifest**, so a `_ref` default resolves relative to the module root (`walker.js` → `resolveVarDefault`, fresh `WalkContext` with `currentFile = module.lowdefy.yaml`); consumer values take per-leaf precedence over defaults (`resolveEffectiveVar` via `resolveNamespaceVar`); and cross-module `_ref`s pass through module-entry vars — the demo already injects `{ module: workflows, component: actions-on-entity }` into companies via `components.sidebar_slots` (`apps/demo/modules/companies/vars.yaml`).

### D2 — The override is the whole card, not an inner-component parameter

A narrower slot ("swap just the timeline block inside the tile, keep the card + reference wiring") would save the app from restating `reference_field`/`reference_value`. Rejected: a consumer-supplied `_ref` arrives fully formed — the tile has no way to inject its entity-specific vars into it — and parameterizing the `_ref`'s `module:`/`component:` from a var is undocumented walker territory. Full-block replacement is the existing slots grammar (block arrays in named regions, `docs/idioms.md#slots`); the cost is ~10 lines of restated card config per entity, captured once in the README recipe. One mechanism, no new composition rules.

### D3 — Uniform slot across the three modules; the swap is lossless

The slot has the same name and shape (`components.events_tile`, an array of blocks) on all three modules, including activities — whose History card sits in the **main column**, not the sidebar; the slot replaces the card wherever the module renders it, and the region name describes the content, not the position. Replacing the events-only tile with the workflows timeline is safe on entities with no workflows yet: `GetEventsTimeline` is a strict superset of the events module's `get-events` — non-action events pass through on the same display fields (Part 46 D6), so the swapped tile renders identically until action cards exist.

### D4 — No build-time auto-swap

The build could detect a workflows module entry and switch the tile automatically. Rejected: it makes entity modules workflows-aware at build time (the coupling D1 avoids), hides the app's intent, and breaks the moment an app wants the generic timeline on one entity and the enriched one on another. The swap stays an explicit per-entry vars override — the same explicitness as every other slot.

## Current state (verified)

| Surface                                       | Tile                                                                        | Embed point                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `modules/companies/pages/view.yaml:138`       | `components/tile_events.yaml` (card "History" + events timeline, `company_ids`) | hardcoded `_ref` in the sidebar `_build.array.concat`, before `components.sidebar_slots` |
| `modules/contacts/pages/view.yaml:120`        | `components/tile_events.yaml` (`contact_ids`)                                | hardcoded `_ref` in the sidebar concat, after `tile_companies` |
| `modules/activities/pages/view.yaml:315–326`  | inline card "History" (`activity_ids`)                                       | authored inline in the **main column**, before `components.main_slots` |
| `apps/demo/modules/companies/vars.yaml`       | — (precedent)                                                                | already passes `{ module: workflows, component: actions-on-entity }` through `components.sidebar_slots` |

Dead events-module config (unreachable since Part 46's splice removal): `actionStatusConfig` prop wiring (`modules/events/components/events-timeline.yaml:88–91`), the `action_statuses_display` var (`module.lowdefy.yaml:58–66`), and its README section (documented "currently unused" by Part 46 task 12). The `EventsTimeline` *block* keeps its `actionStatusConfig` prop — the workflows timeline uses it.

## Worked example — app swaps the companies tile

```yaml
- id: companies
  source: "github:lowdefy/modules-mongodb/modules/companies@v1"
  vars:
    components:
      events_tile:
        - _ref:
            module: layout
            component: card
            vars:
              title: History
              blocks:
                - _ref:
                    module: workflows
                    component: workflows-events-timeline
                    vars:
                      reference_field: company_ids
                      reference_value:
                        _url_query: _id
```

The app depends on both modules (the legal direction); companies never learns about workflows. Omitting the var renders the built-in events-only tile exactly as today.

## Files changed

- `modules/companies/module.lowdefy.yaml`, `modules/contacts/module.lowdefy.yaml`, `modules/activities/module.lowdefy.yaml` — add the `components.events_tile` property (`description`, `type: array`, `_ref` default).
- `modules/companies/pages/view.yaml`, `modules/contacts/pages/view.yaml`, `modules/activities/pages/view.yaml` — read the var where the tile is hardcoded.
- `modules/activities/components/tile_events.yaml` — create (extracted from the inline card).
- `modules/events/components/events-timeline.yaml`, `modules/events/module.lowdefy.yaml`, `modules/events/README.md` — delete the dead action-card config.
- `modules/workflows/README.md` — "adding workflows to an entity" recipe.
- `modules/{companies,contacts,activities}/README.md` — document the new region per the module doc template.
- `docs/idioms.md` — replaceable-region flavor in the slots section.
- `apps/demo/modules/companies/vars.yaml` — adopt the override on the demo company view.

## Non-goals

- **Framework optional-dependency support** — would be a Lowdefy build feature, not a module change; D1 works without it and stays correct if it ever lands.
- **Build-time auto-detection of workflows** (D4).
- **Moving the entity tiles into the workflows module** — the tiles are entity-module furniture; workflows ships the timeline component, not the entities' page layouts.
- **The demo `lead-view` surface** — already consumes `workflows-events-timeline` directly (Part 46 task 11); leads is a demo-app page, not an entity module, so no slot applies.

## Related

- [Part 46 — Debundle workflow config](../46-debundle-workflow-config/design.md) — D6 created the two-timeline split (events-only generic component + workflows-provided enriched component) this part makes swappable; its task 12 documented the events dead-config this part deletes.
