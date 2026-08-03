# Deals workspace rework

The deals workspace shipped in the module at v0.17.0 and works, but it drifted from the layout its host app had before the cutover, and it spends screen space badly — the pipeline column is narrower than the detail column beside it, the "what's open" row splits two short lists across two half-width columns, and the related-deals strip grows without bound. This design closes those gaps. It deliberately stays cheap on the module's config surface — no new vars and no new exported components — after weighing richer seams and finding they bought little.

Source: the host app tracker, issue #1781 ("Deals Rework"), items 2–8. Item 1 of that issue is app-owned pipeline restructuring and lives in the host's own `deal-lifecycle-split` design; only its module dependencies land here.

## Proposed change

1. **Open items stack instead of splitting** — `open_items_row`'s two span-12 columns become full-width sections, Actions above Tasks, keeping their existing headers. No container chrome is added.
2. **Host tiles move to the front of the info grid** — `components.info_grid_slots` injects *before* the People and Files tiles instead of after them. One moved line, no new var, nothing breaking; the resulting 2×2 pairing differs from the pre-module layout and that deviation is flagged, not hidden.
3. **Bounded related deals** — make the compact cards a fixed 180px with a single-line ellipsised name, drop the lookup from 20 to 10, and keep the strip to one non-wrapping row that scrolls horizontally, instead of letting wrapping cards push the timeline off screen.
4. **Left panel gains a new-deal button and collapses** — a compact `button_new_deal` in the deal-list card's `extra` slot, plus a state-driven collapse that hides the card body and narrows the column: a rail above 768px, a header-only strip below it.
5. **50/50 workspace and 2-decimal numbers** — `pipeline_col`/`detail_col` go from span 10/14 to 12/12, and numbers render at 2dp via `toFixed(2)` method calls (Lowdefy ships no number filter), with thousands separators needed at the single currency site (display only; stored values untouched).
6. **`deals`: form data across all of an entity's workflows** — `get_selected_deal`'s workflow alias stops being scoped to a single `workflow_type` and is keyed by it instead (`workflows.{workflow_type}.{action}.{field}`), so a deal carrying several workflows exposes all of their form data with no possibility of collision. Breaking for host reads.

## Current state

All paths under `modules/`, all line references at the v0.17.0 shape.

| Issue item | Where it lives now | What it does today |
|---|---|---|
| 2 — combine tasks and actions | `deals/components/detail/open_items_row.yaml` | Two span-12 columns: workflows' `open-actions` left, activities' `open-tasks` right. Split deliberately in the previous rework ("each module renders only its own domain and fetches only its own data"), but styled to match. |
| 3 — related deals row limit | `deals/components/detail/section_related_deals.yaml` | A `List` with `direction: row` of `deal_list_item_compact` cards at `flex: 0 1 auto`. The lookup in `get_selected_deal.yaml` is `$limit: 20`, so the strip wraps to five-plus rows and pushes the timeline tabs off screen. |
| 4 — company/people/product/files layout | `deals/components/detail/section_info_grid.yaml` | `_build.array.concat` of `section_fields` (full width), then `section_people` + `section_files` (span 12 each), then `components.info_grid_slots` **appended last**. A host's tiles can only land at the end. |
| 5 — new deal button | `deals/components/button_new_deal.yaml` | Exists, but only used on `pages/all.yaml`. `view.yaml`'s `deal_list_card` holds search + `ListSelector` + pagination only. |
| 6 — collapsible left panel | `deals/pages/view.yaml` `deal_list_col` | Fixed `span: 5` (`sm: 24`). No collapse. |
| 7 — 2-decimal rounding | `deals/pages/view.yaml` card template | `{% elif f.round %}{{ v \| round }}` — Nunjucks `round` defaults to 0 dp, so 12.6 renders `13`. |
| 8 — middle section width | `deals/pages/view.yaml` `workspace_row` | `pipeline_col: span 10`, `detail_col: span 14` — the pipeline is the narrower of the two. |
| (item 1 dependency) | `activities/components/capture_activity.yaml` | `prefill` **already** carries `attributes` and `references` (`:165-177`, `_object.assign` over the module defaults, consumer values winning). Only the docblock at `:13` is stale — it lists `{ type, title, description, contacts, company_ids }`. No change needed beyond that comment. |
| (item 1 dependency) | `deals/requests/get_selected_deal.yaml:106-127` | The workflow `$lookup` matches `$eq: [$workflow_type, <module var>]` with `$limit: 1`, then aliases `$first: $workflow.form_data` onto `workflows`. Only ever one workflow's form data. |

## Key decisions and rationale

### Combining actions and tasks is a container change, not a data merge

The two cards come from different modules on purpose: `workflows/open-actions` is reactive off `entity_workflows` page state and links each row to its action page; `activities/open-tasks` runs its own aggregation over the `actions` collection and opens the host's task modal. The truest reading of "combine" would be a single list sorted across both, but that needs a component that owns data from both modules — undoing the extraction the previous rework just did — and the rows would stay heterogeneous anyway, since clicking an action navigates and clicking a task opens a modal.

Stacking the two module components as full-width sections gets the visual result with no boundary cost, and reclaims the horizontal space two half-width columns waste in a detail column that item 8 is about to narrow. Both components stay untouched.

**No container chrome.** `open_items_row.yaml` stays a plain `Box`; the two span-12 column Boxes become full-width, and the existing small-caps `ACTIONS` / `TASKS` `Html` headers are kept as the only labelling. This matches the sections around it — the tile grid, related deals and the timeline tabs are all unchrome'd, separated by thin dividers inside the one `detail_card`.

Two alternatives were weighed and dropped. A **subtle bordered block** reusing the meta strip's treatment (faint fill, 1px border, 6px radius — the one section in the panel that does have chrome) would give the combination a visible boundary and an `OPEN ITEMS` title; rejected as unnecessary weight for two short lists. A **real `Card` block** would nest bordered card inside bordered card and need its padding fought. Adjacency plus the two existing headers is enough to read as one surface.

*Note for anyone comparing against the design mockup:* the mockup drawn during discovery showed a titled, bordered `OPEN ITEMS` container. The chrome was deliberately dropped here; the stacking it illustrated is what is being built.

Rejected alternative: tabs. Compact, but a "what's open" summary you have to click to finish reading is not a summary.

### Move the existing slot injection point; add no new var

The host wants its Company and Product tiles ahead of the module's People and Files tiles. The var it already uses appends after them, so the whole of the fix is moving one entry in `section_info_grid.yaml`'s `_build.array.concat` — the `_module.var: components.info_grid_slots` line goes above the People/Files group instead of below it:

```yaml
blocks:
  _build.array.concat:
    - - _ref: components/detail/section_fields.yaml   # Details, full width, self-hiding
    - _module.var: components.info_grid_slots         # ← moved up from last
    - - _ref: components/detail/section_people.yaml
      - _ref: components/detail/section_files.yaml
```

**No new var, no rename, no exports, nothing breaks.** The host's config is unchanged — it keeps setting `info_grid_slots` with Company then Product, and those tiles simply land in front. The demo sets no slots at all and is unaffected.

**This is not pixel-exact fidelity to the pre-module layout, and that is a deliberate trade.** Tiles are span-12, so they fill two per row in whatever order the grid emits them: injected tiles first, then People, then Files.

The resulting pairing therefore depends on **how many tiles the host injects**, and is not a fixed property of the change:

| Host tiles | Rows |
|---|---|
| 0 (the demo) | `People \| Files` — unchanged from today |
| 1 | `HostTile \| People`, then `Files` alone |
| **2 (the host app today)** | **`Company \| Product`, then `People \| Files`** |
| 3 | `Host \| Host`, then `Host \| People`, then `Files` alone |

So the tidy "host tiles above module tiles" split is a property of the number two, not of the mechanism — worth stating plainly because the pairing is what the issue author is being asked to accept.

For the host app specifically, that means Company | Product over People | Files where pre-module was Company | People over Product | Files. Issue item 4 asks for the layout "the same as it was", so **this deviation must be raised with the issue author rather than presented as a restoration** — see the blocking open question below. The old pairing was where tiles happened to fall, not a grouping that expressed anything, and the new one is defensible on its own terms.

**Three richer alternatives were considered and rejected**, all of which achieve exact fidelity at a cost to the module:

- **An ordered `info_grid` var** replacing the slots var, where the host lists the whole grid and the module exports its built-in tiles as `_ref`-able components. Rejected: it makes the module publish its own internals so a host can hand them straight back, the host must restate the grid so new built-in tiles need opt-in, and replacing the var is a breaking config change that **fails silently** — Lowdefy throws on unknown connection-remap and secret keys (`packages/build/src/build/buildModules.js:70-79`) but does not validate var names at all (`buildModuleDefs.js:101-132`), so a host left on the old name loses its tiles with no error.
- **A position-keyed `info_grid` object** (`before_people`, `before_files`). Avoids the exports and the round-trip, but the module still enumerates the legal positions, so it buys exact ordering at the price of the same breaking rename.
- **Two additional named slot vars.** Non-breaking and works, but three slot vars for one four-tile grid, to move one tile.

The common thread: every route to the exact pairing costs either a breaking change or permanent module surface, and buys only which two tiles share a row. Not worth it.

**If a consumer later needs a tile after Files**, add an end-position slot then — non-breaking, and consistent with the original deals-module design's rule that "more named positions get added only when a consumer needs them."

### Adjacent defect: the module's one declared component export does not resolve

Found while evaluating the rejected export-based option, and worth recording even though nothing here now depends on it. `modules/deals/module.lowdefy.yaml` declares `deal-status-chip` under `exports.components`, but the deals manifest has **no top-level `components:` list** — and that list is what module component refs actually resolve against (`packages/build/src/build/buildRefs/getModuleRefContent.js:82` looks up `manifest.components` by id). The sibling workflows module has one (`module.lowdefy.yaml:217-229`); deals does not. So a host writing `_ref: { module: deals, component: deal-status-chip }` gets nothing — the module advertises an export it cannot serve. The only in-repo use is an internal path ref (`pages/view.yaml:407`), which bypasses module resolution and works.

Whether to fix it here or separately is an open question below.

### Related deals: make the cards uniform, then one row is guaranteed

Today the strip is a `List direction: row` of `deal_list_item_compact` cards at `flex: 0 1 auto`, fed by a `$limit: 20` lookup on the selected deal's company. Two things make it grow unpredictably: the cards are content-width, and their name clamps to two lines (`-webkit-line-clamp: 2`), so a card is one or two lines tall depending on the deal name. Up to twenty of those wrap into five-plus ragged rows and push the timeline tabs off screen.

Capping by pixel height would clip a row mid-card, and capping by count alone doesn't bound anything while widths vary. **Making the cards uniform removes both problems at once:** fixed width, and the name dropped to single-line ellipsis. Height and width become constant, so a count limit genuinely bounds the strip. The lookup drops to 10.

**Width: a 180px module constant.** The floor is the card's top row, which carries the deal code beside a stage chip — `Fulfillment` is the longest stage title today — so below about 150px the chips begin to clip. 180px shows roughly **three** cards before scrolling, with ten reachable behind it: enough to see the neighbourhood without turning a glance-and-click affordance into a browsing surface. *(An earlier draft of this section claimed four. Measured, the detail column is about 575px usable at a 1600px viewport — `detail_col` is span 12 inside span 24 inside span 19, less 8px body padding — so it is ~3.2 cards; four would need ~740px.)*

**Two mechanisms are needed to pin the card, not one.** `layout: { flex: 0 0 180px }` alone does **not** fix the width: `deriveLayout` puts that on the `BlockLayout` wrapper, which as a flex item with `min-width: auto` takes its automatic minimum from its min-content width — and `white-space: nowrap` on the name makes that the full untruncated name. Flex-basis becomes a floor, so widths stay ragged and nothing ellipsises. Worse, `List` renders one `Area` per item, so the row's real flex items are per-item wrappers at `flex: 0 1 auto`; under `nowrap` those shrink below the card inside them and **adjacent cards overlap** — reproducible with three cards. Both measured in a browser. The fix is a block-level `style: { width: 180 }` alongside the `layout.flex`; the non-dot `style` key pins the wrapper. Keep both — without a `flex` value, `deriveLayout` takes the `.lf-col` path (`flex: 0 0 100%`) and the strip breaks a different way.

**Accepted: the hover shadow is clipped at the bottom.** `overflow-y: hidden` is required on the strip — with `overflow-x: auto`, a `visible` y-axis computes to `auto` and yields an unwanted vertical scrollbar — and it clips the hoverable card's shadow. In antd 6.3.1 that shadow is `boxShadowCard`, three layers extending 0px, 6px and 15px below the card and up to 5px above. The strip carries 6px of vertical padding, so both dominant layers (0.16 and 0.12 alpha) render intact and only the faintest 0.09-alpha outer layer is cut. Full fidelity would cost 9 more pixels of vertical space in the one component whose purpose is bounding vertical space.

**Constant, not a var.** A var would earn its place if a host had markedly longer deal codes or stage titles; none does. This design has twice declined to add module surface ahead of a consumer needing it — the same reasoning that settled the info-grid seam — and a width var nobody sets is precisely that. Promote it if a consumer turns up needing it.

`nowrap` with horizontal overflow goes on top of that, because the detail column is a share of the workspace rather than a fixed width — without it, a count that fits one row on a wide screen wraps to two on a narrow one. With it the strip is exactly one row's height everywhere and scrolls only when it truly cannot fit.

Horizontal scroll is also the right axis here for a reason beyond geometry: the detail card *containing* this strip is itself a vertical scroll region (`.body` has `overflow-y: auto`). A vertically-scrolling strip inside it would nest two vertical scrollers and capture wheel gestures from the wrong element. A horizontal scroller cannot fight its parent.

**Accepted trade-off:** single-line ellipsis shows less of the deal name than today's two-line clamp. For a glance-and-click strip sitting beside the deal code and stage chip that reads fine, and `deal_list_item_compact` is used nowhere else, so nothing else changes shape.

Worth noting but explicitly *not* in scope: this strip and the left-hand Active Deals panel render the same concept through two different card templates — the panel builds its card inline in `pages/view.yaml`'s Nunjucks, this one uses `deal_list_item_compact.yaml`. Real duplication, no issue item asks for it.

### Items 2, 3, 4 and 8 are one layout change, not four

Item 8 narrows the detail column from 14/24 to 12/24 of the workspace, and the 2×2 tile grid item 4 reorders sits inside it. Those look opposed but are complementary: full-width stacked open items (2) and a height-capped related-deals strip (3) give back exactly the horizontal and vertical room the narrower column costs. Reviewed separately, item 8 looks like it makes items 4 and 3 worse. They should be judged, and shipped, together.

### Number formatting is display-only

Nothing is recomputed and nothing is migrated. The complaint is float noise and inconsistency, not wrong stored values: annual volume is `monthly × 12`, so `1.05` becomes `12.600000000000001`, and the host prints deal value through a bare `R{{ value }}`. Formatting at render fixes all of it at zero risk.

The narrow list card keeps its abbreviated form (`R1.2m`), because a full 2dp figure competes with salesperson, product, volume and close date on one meta line in a span-5 column. That is a deliberate exception to "2 decimals everywhere", and it belongs in the module (the card template's `round` filter) while the currency abbreviation stays host-derived.

**There is no number filter to reach for.** Lowdefy's Nunjucks environment registers exactly three custom filters — `date`, `unique`, `urlQuery` (`packages/utils/nunjucks/src/index.js:26-28`) — so everything else is stock Nunjucks, whose `round(precision)` rounds without padding trailing zeros and cannot insert separators at all. `{{ 12.6 | round(2) }}` renders `12.6`, not `12.60`. Templates *can* call JS methods on values, which is how the host app's `companies` tiles already format quantities (`tiles/company_orders.yaml:95` uses `.toFixed(2)`).

Because the card keeps its abbreviation, **separators are needed at exactly one site** — the host's meta-strip Value. That splits the mechanism small:

| Site | Needs | Mechanism |
|---|---|---|
| Module card template (volume) | 2dp padding | `.toFixed(2)` method call, replacing `\| round` |
| Host meta-strip Value (currency) | 2dp + separators | `.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })` → `1,234,567.89` |
| Host product tile (volumes) | 2dp padding | `.toFixed(2)` |

**Locale resolved — do not use `en-ZA`.** Checked against Node 26:

| Locale | `1234567.891` | `12.6` |
|---|---|---|
| `en-ZA` | `1 234 567,89` | `12,60` |
| `en-GB` | `1,234,567.89` | `12.60` |
| `en-US` | `1,234,567.89` | `12.60` |

`en-ZA` pairs a space thousands separator with a **comma decimal**, which would render deal value as
`R1 234 567,89` and a volume as `12,60`. So the illustrative `R1 234 567.89` used earlier in this
document — space thousands *with* a period decimal — is not produced by any standard locale; it is a
mixed convention.

**Use `en-GB`**, giving `R1,234,567.89`. Comma thousands with a period decimal is unambiguous and
matches the existing `.toFixed(2)` sites, which also produce a period decimal — mixing `12.60` from
one mechanism with `12,60` from another on the same page would be worse than either. If a space
thousands separator is genuinely wanted later, build it explicitly rather than reaching for a locale.

A `number` filter in Lowdefy core is the real cleanup and would replace all three rows above with one idiom. Out of scope here; worth raising upstream separately rather than blocking this rework on a core change.

### Collapse to a rail, not to nothing

A fully hidden panel leaves nowhere to click to bring it back except a control somewhere else on the page. Collapsing `deal_list_col` to a narrow rail carrying just the expand chevron keeps the affordance where the panel was.

**Mechanism, confirmed:** `layout` is operator-evaluated on every render, exactly like `properties` and `visible` — `packages/engine/src/Block.js:350` parses it inside `evaluate()` alongside `propertiesEval`/`visibleEval`/`styleEval`. So a state-driven `layout.span` (5 → rail, with `workspace_col` 19 → 23) is a supported pattern, not a gamble, and needs no spike.

No other module does this today — every `span:` in `modules-mongodb/modules` is a literal — so this is the first reactive-layout use here. That makes it worth calling out in review, but absence of precedent is not evidence of infeasibility, and the engine settles it.

**The collapsed state is one state that reads correctly at both widths.** Collapsing does two things: hides the card's body (search box, `ListSelector`, pagination) and drops the top-level span from 5 to a rail.

That works at both widths *because of how Lowdefy's breakpoints are keyed*, which is counterintuitive enough to record. The grid is mobile-first, but the config keys don't read that way: the **top-level `span` applies from md (≥768px) upward** — `deriveLayout.js:131` maps it to `--lf-span-md` — while `sm: { span: 24 }` sets the *base* value used below that (`:148`). So `deal_list_col`'s `span: 5, sm: { span: 24 }` means side-by-side on desktop and full-width stacked under 768px.

Consequently:

| Width | Collapsed renders as |
|---|---|
| ≥768px | The narrow rail — span drops, body hidden, chevron remains |
| <768px | A full-width header-only strip — the span change is a no-op (base stays 24), the hidden body is what takes effect |

The sub-768px case is a genuine improvement rather than a degenerate one: the list card is `calc(100vh - 110px)` tall and stacks *above* the workspace there, so today you scroll a full screen past it to reach the deal. Collapsing it to its header is more useful on mobile than on desktop.

This also avoids needing breakpoint-aware visibility, which Lowdefy makes awkward — `visible` evaluates from state, not media queries, so hiding the toggle below a breakpoint would mean either a media-query style override or tracking viewport width in state. Neither is needed.

### Attribute prefill already works — only the docs were wrong

An earlier draft of this design proposed adding an `attributes.*` passthrough to `capture_activity.prefill`, for the host's retention button (see the lifecycle design), which opens activity capture with a technical-support contact already selected. **That change is not needed.** `capture_activity` has carried `prefill.attributes` and `prefill.references` all along (`:165-177`) — `_object.assign` over the module's own defaults, with consumer values winning, as its inline comment states.

What misled the draft was the component's docblock (`:13`), which lists only `{ type, title, description, contacts, company_ids }`. Fixing that comment is the whole of the work, and it is worth doing precisely because the stale version already caused one design error.

**One real constraint to record:** attributes are seeded in the modal's `onOpen`, so this is **modal mode only**. In `mode: page` the button builds a `urlQuery` carrying just type, title, contacts and company_ids (`:86-96`) — no attributes. The retention button uses modal mode, so it is unaffected; a host switching it to page mode would silently lose the prefill.

### The workflow form-data alias must span workflows

This is the sharpest of the module changes and it is a **silent** break, not a loud one. `get_selected_deal` joins exactly one workflow (`workflow_type` match + `$limit: 1`) and aliases its `form_data` onto `workflows`. Today that is fine — one deal, one workflow. Once the host splits its pipeline in two, anything reading the second workflow's form data resolves to null and falls back without erroring.

Concretely, in the host: `close_date` is `$ifNull: [$workflows.order-confirmation.commercialisation_date, $expected_close_date]`, and `order-confirmation` moves into the onboarding workflow. The meta strip's Commercialisation Date would quietly show the expected date forever, with no error anywhere. `value` (pricing-qualification × volumes) survives, because both stay in the first workflow — which is exactly what makes the break easy to miss in testing.

Note the scope: only `get_selected_deal` aliases form data this way. The two list surfaces get theirs from the host's own `deal_card_fields.yaml` stages, which run their own `$lookup` and set `workflows` themselves — unaffected by this change, though they carry a hardcoded `workflow_type` that the host's rename touches independently.

**Fix: drop the `workflow_type` match and the `$limit: 1`, and key the result by workflow type** — `workflows.{workflow_type}.{action}.{field}`.

An earlier draft proposed a *flat* merge keyed by action type alone, on the grounds that action types are unique across a lifecycle. **They are not, and the engine is built to allow reuse.** `makeWorkflowsConfig.js:930` hard-errors on a duplicate action type *within* a workflow; across workflows it namespaces everything by workflow type — endpoint ids are `{workflow_type}-{action_type}-{signal}-{phase}`, and the render-config bundle is keyed workflow-type-then-action-type. A lifecycle with a `review` step in both halves is a legal config that a flat merge would silently truncate, reintroducing the exact failure mode this change exists to remove.

A build-time guard was considered and rejected: the deals module is pure YAML with no resolvers to host such a check, and pushing a deals-specific constraint into the workflows engine would forbid something the engine deliberately supports.

Keying by workflow type therefore matches the engine's own convention and removes the cross-workflow collision entirely, with no invariant to police. The cost is a **breaking read shape** for hosts — `workflows.volumes.x` becomes `workflows.prospecting.volumes.x`. Accepted because the affected host sites are few and mostly being edited anyway (see Host follow-through), and because the alternative of carrying both a flat and a namespaced copy leaves a quietly lossy shape on every deal document.

**One residual collision remains, narrower than the one being fixed.** An earlier draft of this section claimed workflow-type keying makes collisions "structurally impossible". It does not, quite: the workflows engine permits **two workflows of the same type on one entity** — `get-entity-workflows` ships a `display_order` / `created.timestamp` tie-breaker precisely for that case — and `$arrayToObject` on duplicate keys is last-wins with no error. So a deal carrying two workflows of the same type exposes only one of them, silently.

That is the same *shape* of failure this change exists to remove, so it is recorded rather than glossed: the fix narrows the collision from "any two workflows reusing an action type" to "two workflows of the same type on one deal", which no consuming lifecycle does today. Closing it entirely would mean keying by workflow `_id` or instance index, which no host could then write a stable read against — the reason the type is the key at all. Revisit if a lifecycle ever runs two instances of one workflow type on a single deal.

## Host follow-through (the host app)

None of this is complete until the host bumps. Work that lands in the host app's repo, not here:

- `modules/deals/vars.yaml` — **no change.** `info_grid_slots` already lists Company then Product in that order; moving the module's injection point is enough. (For reference, the pre-module order was Company → People → divider → Product → Files, verified at `0992011^`; see the deviation note above.)
- `modules/deals/vars.yaml` `meta_fields` — Value goes from `R{{ value }}` to 2dp with separators.
- `modules/deals/tiles/product_volumes.yaml` — Annual and Monthly Volume format to 2dp instead of raw concat, **and** their reads gain the workflow-type key: `workflows.volumes.*` → `workflows.prospecting.volumes.*`.
- `modules/deals/stages/deal_card_fields.yaml` — `value_label` keeps its `R…k`/`R…m` abbreviation; its own `$lookup` hardcodes `workflow_type: sales-pipeline` and needs the host's new workflow type.

> **Two shapes of `workflows` will coexist in this directory, deliberately.** `vars.yaml`'s `request_stages` reads the module-built, workflow-type-keyed alias (`$workflows.prospecting.volumes.…`), while `stages/deal_card_fields.yaml` reads a **flat, action-keyed** field that it builds itself with its own `$lookup` (`$workflows.volumes.…`) and then `$unset`s at `:89-91` before results leave the pipeline. Same field name, same directory, different shapes, no runtime conflict — the flat one never escapes its own aggregation. Both files are edited for the workflow rename, so whoever does that work will see the mismatch: **do not "align" them.** Re-keying the self-built one would break it, since nothing namespaces that field.

**Reads to re-key for the namespaced form data** (proposed change 6) — three sites, all in the host app's repo:

| Site | Today | After |
|---|---|---|
| `modules/deals/vars.yaml` `request_stages.get_selected_deal` — `value` | `$workflows.pricing-qualification.pricing_r_ton` × `$workflows.volumes.annual_volume_ton` | prefix both with `prospecting` |
| same — `close_date` | `$workflows.order-confirmation.commercialisation_date` | `$workflows.onboarding.order-confirmation.commercialisation_date` |
| `modules/deals/tiles/product_volumes.yaml` | `workflows.volumes.{annual,monthly}_volume_ton` | prefix with `prospecting` |

The first two are being rewritten anyway — `close_date` because `order-confirmation` moves workflows, and both because of the `sales-pipeline` → `prospecting` rename. Only the product tile is touched purely for the re-key.
- `shared/enums/deal/action_groups.yaml` is dead for deals — only the legacy `items` module still reads it. Deals group headings come from the workflow config's own `action_groups`.

**Release ordering:** module release (`deals`) → host bump → the host's lifecycle work. The lifecycle split depends on exactly one thing here — the form-data merge (proposed change 6). Its retention button needs no module change at all, since attribute prefill already works.

## Files changed

**`modules/deals`**
- `components/detail/open_items_row.yaml` — the two span-12 column Boxes become full-width stacked sections. Stays a `Box`; no Card, no border, existing headers kept.
- `components/detail/section_info_grid.yaml` — move the `info_grid_slots` concat entry above the People/Files group. One line.
- `components/detail/section_related_deals.yaml` — `nowrap` single row with horizontal overflow.
- `components/deal_list_item_compact.yaml` — fixed 180px card width (module constant, not a var); name from two-line clamp to single-line ellipsis.
- `requests/get_selected_deal.yaml` — related-deals `$limit` 20 → 10 (alongside the form-data re-key below).
- `pages/view.yaml` — new-deal button in `deal_list_card` `extra`; collapse toggle + rail; `pipeline_col`/`detail_col` to 12/12; card template 2dp formatting.
- `components/deal_list_card.yaml` — **the same 2dp formatting.** This is the deals *list* page's browse card (`_ref`'d from `components/results_list.yaml`), and it reads the same `card_fields` var with the same `round` flag as the workspace panel card. Missed in an earlier draft of this inventory; leaving it would render one host setting two ways (`13` on the list page, `12.60` in the workspace).
- `requests/get_selected_deal.yaml` — form-data merge across workflows.
- `module.lowdefy.yaml` — `info_grid_slots`' description updated to say it injects before the built-in tiles; `workflow_type`'s description corrected, since it no longer drives the form-data alias. Both feed the generated `docs/deals/reference/vars.md`, so `pnpm docs:gen` must run in the same change. No var added or renamed.

**Formatting expression, both card templates:** `{{ (v | float(0)).toFixed(2) }}`. `float` is a stock Nunjucks filter that never throws and gives identical output for real numbers; a bare `.toFixed()` throws on a non-numeric field, and the blast radius of a thrown template error is not establishable from this repo (the `ListSelector` block's source lives elsewhere). The trade recorded knowingly: a host that flags a non-numeric path `round: true` now sees a plausible `0.00` rather than a visibly broken `NaN`.

**`modules/activities`**
- `components/capture_activity.yaml` — docblock fix only: `prefill` documents `attributes` and `references`, and notes both are modal-mode only. No behaviour change.

**`apps/demo`** — no change needed. The demo sets no `info_grid_slots`, so moving the injection point has no effect on it.

## Non-goals

- Merging actions and tasks into one sorted list, or re-coupling the workflows and activities modules in any other way.
- Changing what "Active Deals" means. `get_active_deals` matches on `removed: null` only; no stage or outcome filtering is being introduced.
- Recomputing or migrating any stored numeric value.
- The host's pipeline restructuring itself — see `deal-lifecycle-split` in the host repo.
- Sweeping number formatting outside deals. The `companies` tiles mix `.toFixed(2)`, `.toFixed(1)` and `.toFixed(0)`; real, but not this issue.

## Open questions

### Settled

**The new tile pairing is accepted.** Issue item 4 asked for the pre-module layout; proposed change 2 delivers the same four tiles as **Company | Product over People | Files** rather than Company | People over Product | Files. This was previously blocking, because a rejection would have reverted item 4 to one of the three alternatives rejected above — each costing either a breaking config change or permanent module surface.

Confirmed by the project's developer, not by the issue's original author. If the filer later objects, this is the decision to revisit, and reverting it is materially more work than the change itself.

### Non-blocking

1. **One release or two?** Items 2–8 are independent of each other, and only the form-data merge gates the host's lifecycle work. Shipping that one change first would unblock the host sooner at the cost of two releases.
2. ~~**Thousands separator character.**~~ Resolved: `en-GB`, giving `R1,234,567.89`. `en-ZA` was checked and rejected — it yields a comma decimal (`R1 234 567,89`), clashing with the period decimal the `.toFixed(2)` sites produce.
3. **Rail width and whether the collapsed state persists** across page loads, or resets each visit. Page state is the cheap answer; `localStorage` is the nicer one.
4. **Does `card_fields.round` stay a boolean?** With 2dp as the default it may want to become a precision number, which is a host-facing var change rather than a formatting fix.
5. **Fix the unresolvable `deal-status-chip` export here, or separately?** The deals manifest needs a top-level `components:` list for its one declared export to work at all (see the adjacent-defect note). Nothing in this design depends on it, so it is a free-standing bug — but it is a small fix and this release already touches the manifest.
