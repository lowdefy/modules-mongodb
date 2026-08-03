# Deals workspace rework

The deals workspace shipped in the module at v0.17.0 and works, but it drifted from the layout its host app had before the cutover, and it spends screen space badly — the pipeline column is narrower than the detail column beside it, the "what's open" row splits two short lists across two half-width columns, and the related-deals strip grows without bound. This design closes those gaps. It deliberately stays cheap on the module's config surface — no new vars and no new exported components — after weighing richer seams and finding they bought little.

Source: the host app tracker, issue #1781 ("Deals Rework"), items 2–8. Item 1 of that issue is app-owned pipeline restructuring and lives in the host's own `deal-lifecycle-split` design; only its module dependencies land here.

## Proposed change

1. **Open actions and tasks merge into one list** — `open_items_row`'s two span-12 columns become a single ordered list, interleaved overdue tasks → open actions → upcoming tasks, under one `ACTIONS` heading, 2×2 and paginated at four per page. Deals renders it from state both modules already seed; ownership of neither moves.
2. **Host tiles move to the front of the info grid** — `components.info_grid_slots` injects *before* the People and Files tiles instead of after them. One moved line, no new var, nothing breaking; the resulting 2×2 pairing differs from the pre-module layout and that deviation is flagged, not hidden.
3. **Bounded related deals** — drop the lookup from 20 to 10 and page the strip 2×2 at four per page with a single-line ellipsised name, instead of letting wrapping cards push the timeline off screen.
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

### Combining actions and tasks is a real data merge, rendered by deals

Item 2 means what it says. Before the previous rework, `section_actions.yaml` rendered a *single paginated list* whose request comment reads "the final ordered card list (overdue tasks → open workflow actions → upcoming tasks)" — genuinely merged and interleaved by urgency. Commit `8923ca15` split it into `workflows/open-actions` plus `activities/open-tasks`, two lists with a heading each. Since issue item 4 likewise asks for a pre-cutover layout back, item 2's "combine" means that merged list, and **this design restores it**.

An earlier draft argued a merge "needs a component that owns data from both modules". **That objection was wrong.** Both halves are already in page state on this view — `entity_workflows` is seeded by the page itself (`pages/view.yaml`, at mount, on deal switch, on related-deal click and after a check action), independent of `open-actions`; `open_tasks` is likewise requested and seeded by deals in four places. A merge needed no new data ownership at all.

**Ownership does not move; only rendering does.** Workflows still resolves actions and activities still owns the task query. What ships:

- `actions/open_items_merge.yaml` flattens `entity_workflows` (skipping the engine's two terminal statuses) and maps `open_tasks` into one array, sorting overdue tasks → open actions → upcoming tasks. Row presentation is computed here so the card template is one shape for both kinds.
- `actions/compute_open_items.yaml` sets that array and its first page, referenced from all five sites that seed either source.
- `open_items_row.yaml` renders it as a `List` of `Card`s under the single `ACTIONS` heading.

**Why deals renders it rather than either module.** An action is a plain anchor built from the engine's resolved `link`, which is why `open-actions` can be one `_nunjucks` Html block. A task must fire Lowdefy events — set `selected_task`, open the host's modal — which a Nunjucks string cannot do. A merged row therefore needs a `List` of real blocks with per-row branching, and only the host sees both the resolved actions and the task modal. This is also why the old `action_card.yaml.njk` ran to 252 lines.

**The one new module var: `render` on `activities/open-tasks`.** Deals needs the task rows without activities' cards. The component couples fetch to render, so it gains `render` (default true) alongside `on_loaded`. It is gated at build time with `_build.if`, not `visible`, because that card `List` *is* `open_tasks` — hiding it would delete the state it seeds. `on_loaded` exists because the component's own mount is the one seeding deals cannot hook.

A **server-side merge** like the old request was rejected: it would re-query raw action docs and bypass the engine's resolution of links, messages and statuses, which did not exist pre-cutover.

**Presentation.** No container chrome — `open_items_row.yaml` stays a plain `Box`, matching the unchrome'd sections around it. One heading, which is accurate rather than a compromise: tasks and workflow actions are both docs in the same `actions` collection, tasks being `kind: task`. One empty state, judged on the full list so paging never shows it, replacing the two per-type placeholders. Rows stay visually distinct — actions solid-bordered with a status-keyed colour-mix tint, tasks dashed with a 4px overdue-coloured left bar and a tick — which now signals row kind where two headings used to.

**Layout: 2×2, four per page.** A CSS grid (`gridTemplateColumns: 1fr 1fr`), not a flex row, because `List` wraps every item in its own `Area` and those Areas are content-sized — so a span on the card cannot halve one. `gridAutoRows: 1fr` plus `height: 100%` on the card equalises heights; measured, cells alone give `[33,48,33,48]` and the pair gives `[48,48,48,48]`. Accepted trade: the tallest card sets the height for all four.

Rejected alternatives: **tabs** (a "what's open" summary you must click to finish reading is not a summary), and a **bordered `OPEN ITEMS` container** as the discovery mockup drew it (unnecessary weight, and it would nest a bordered card inside a bordered card).

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

### Related deals: bound the strip by paging it

Today the strip is a `List direction: row` of `deal_list_item_compact` cards at `flex: 0 1 auto`, fed by a `$limit: 20` lookup on the selected deal's company. Two things make it grow unpredictably: the cards are content-width, and their name clamps to two lines (`-webkit-line-clamp: 2`), so a card is one or two lines tall depending on the deal name. Up to twenty of those wrap into five-plus ragged rows and push the timeline tabs off screen.

Capping by pixel height would clip a row mid-card, and capping by count alone doesn't bound anything while widths vary. **Pagination bounds it directly:** a 2×2 grid of four per page, with the lookup dropped from 20 to 10 so at most three pages exist. Same mechanism as the merged open-items list above, for the same reason — the two sections sit one above the other, so they should page alike.

**This replaced an earlier fixed-width scrolling strip, and it is worth recording what that cost.** That approach pinned each card to 200px and kept the row to `nowrap` with `overflow-x: auto`. It needed *two* mechanisms to hold the width, because `deriveLayout` puts `layout.flex` on the `BlockLayout` wrapper, whose `min-width: auto` floors it at min-content — and `List` renders one `Area` per item, so under `nowrap` those per-item wrappers shrank below the cards inside them and adjacent cards overlapped. It also forced `overflow-y: hidden` (a `visible` y-axis computes to `auto` beside `overflow-x: auto`, adding an unwanted scrollbar), which clipped the hoverable card's shadow. Pagination removes all of it: the cards need no width at all, `deal_list_item_compact` carries no `layout`, and with no overflow the shadow renders intact.

**A grid, not a flex row.** Because `List` gives every item its own content-sized `Area`, a span on the card sizes the card *within* its Area rather than halving the Area — the same mechanism that made the fixed pixel width necessary before. `gridTemplateColumns: 1fr 1fr` makes each Area a cell, and `gap` is the gutter in both axes.

**Retained:** the single-line ellipsis on the deal name. It shows less than the old two-line clamp, but keeps rows uniform, and `deal_list_item_compact` is used nowhere else so nothing else changes shape.

Worth noting but explicitly *not* in scope: this strip and the left-hand Active Deals panel render the same concept through two different card templates — the panel builds its card inline in `pages/view.yaml`'s Nunjucks, this one uses `deal_list_item_compact.yaml`. Real duplication, no issue item asks for it.

### Items 2, 3, 4 and 8 are one layout change, not four

Item 8 narrows the detail column from 14/24 to 12/24 of the workspace, and the 2×2 tile grid item 4 reorders sits inside it. Those look opposed but are complementary: one merged full-width open-items list (2) and a paginated related-deals grid (3) give back exactly the horizontal and vertical room the narrower column costs — paging both is what makes a narrower column viable, since neither section grows with its content any more. Reviewed separately, item 8 looks like it makes items 4 and 3 worse. They should be judged, and shipped, together.

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

**Mechanism, confirmed:** `layout` is operator-evaluated on every render, exactly like `properties` and `visible` — `packages/engine/src/Block.js:350` parses it inside `evaluate()` alongside `propertiesEval`/`visibleEval`/`styleEval`. So driving layout from state is a supported pattern, not a gamble. No other module does this today — every `span:` in `modules-mongodb/modules` is a literal — so this is the first reactive-layout use here.

**The rail is a fixed 36px set through `flex`, not a `span`.** An earlier draft narrowed the top-level `span` from 5 to 1 (with `workspace_col` 19 → 23). Measured, that does not work at either value: `grid.css` computes a column as `span/24 * (100% + gap) - gap`, so the row's whole 16px gap comes off a 1/24 share and a span-1 rail is ~13px at 768px and ~35px at 1280px — narrower than the 24px chevron it exists to hold, which then overhangs the card border. Span 2 fixes the low end but grows past 110px on a wide screen, which is a lot of dead space for one icon.

A grid share tracks the viewport; a rail should track its contents. So the collapsed state sets `layout.flex: 0 0 36px` — the icon plus trimmed header padding and borders — and `workspace_col` takes `flex: 1 1 0` to absorb the rest. Two details that matter:

- **`deriveFlex` returns `false` for a null flex**, so the expanded state falls through to the existing `span: 5` / `sm.span: 24` path untouched. One conditional, no duplicated layout.
- **The basis must be `0`, not `auto`.** Grid rows default to `flex-wrap: wrap`, and an `auto` basis makes `workspace_col`'s hypothetical size its full content width, which overflows what the rail leaves and wraps it onto its own line instead of shrinking it to fit.

**Consequence at the breakpoint, and it is a change of behaviour.** `deriveLayout` returns early when `flex` is set, skipping all span and breakpoint handling — so 36px applies at *every* width. The earlier span-based draft was inert below 768px (`sm: { span: 24 }` kept the panel full width there, so collapsing only hid the body and left a full-width header strip above the workspace). Now the collapsed rail is a 36px strip beside the workspace on a phone too.

| Width | Collapsed renders as |
|---|---|
| ≥768px | A 36px rail beside the workspace — body hidden, chevron remains |
| <768px | The same 36px rail, now beside a much narrower workspace |

**Settled: keep the rail at every width.** What the two states give on a phone is coherent rather than accidental, and measuring it settled the question:

- **Expanded is unchanged.** `flex` is null, so the `span: 5` / `sm.span: 24` path runs exactly as before — the panel is full width below 768px and the workspace sits under it. Stacking, which is what a phone wants.
- **Collapsed puts one piece of content beside the rail** — but only with `min-width: 0` on `workspace_col`. A `0` flex basis is **not** enough. `min-width: auto` floors a flex item at its min-content width, and flex line-breaking uses that floor rather than the basis, so any descendant wider than the space the rail leaves both blows the column out to its own min-content *and* pushes it onto a new line below the rail. Measured at a 948px available width: a 1129px descendant wraps, 1580px wraps, 2934px wraps; with `min-width: 0` the column holds 948px and stays beside the rail in every case.

  The override goes on the block's non-dot `style` key, which the build maps to `style.block` — the object `BlockLayout` puts on the wrapper div, which is the actual flex item (`Container.js:48`). The inner Box div is not the flex item, so `.element` would not work. Same mechanism as `deal_list_item_compact`'s `style.width`.

  It is conditional on the collapsed state so the expanded path stays byte-identical. Scroll containers are already immune — `overflow` other than `visible` zeroes the automatic minimum — which is why the related-deals strip and both card bodies never caused this, and why the culprit is whatever sits *outside* a scroll container.

So collapsing on a phone trades 36px for reaching the workspace without scrolling past a full-width bar. That is worth it, and the expanded state still stacks for anyone who wants the panel.

**One narrow-screen defect this surfaces, and it is fixed here.** `components/detail/action_bar.yaml` was `flex: 0 0 auto` — shrink 0 — so the three-button bar could not give up width. Collapsed at 375px the workspace leaves it about 299px of content box against roughly 316–334px of buttons, so the topbar spilled and the page gained a horizontal scrollbar. Expanded there is ~349px and it fits, which is why the collapse is what exposed it.

`flex: 0 1 auto` lets the bar shrink, and because it is itself a wrapping row its buttons drop to a second line rather than squashing. Measured at 375px: spill 0px at every button width from 90px to 140px, where shrink 0 spilled 0/6/24/66/126px. Nothing changes above about 430px, where the bar has never needed to shrink — shrink only engages once the line would overflow. The bar's *children* keep `flex: 0 0 auto`, so individual buttons never compress; only the container yields.

Either way it avoids breakpoint-aware *visibility*, which Lowdefy makes awkward — `visible` evaluates from state, not media queries, so hiding the toggle below a breakpoint would mean a media-query style override or tracking viewport width in state.

**Height: two constants that must stay in step.** The rail card is `calc(100vh - 98px)` and the `ListSelector` inside it `calc(100vh - 220px)`, the 122px difference being the card header, search box and pagination. The 98 exists because this column has no topbar: to end level with the workspace column it must cover that column's whole stack — the topbar (62px), the 12px gutter below it, and the pipeline/detail cards at `100vh - 172px`. An earlier value of 110 covered the topbar but not the gutter, leaving the rail 12px short. `height: 100%` is not a substitute: the Box renders a plain auto-height div, so a percentage has nothing definite to resolve against and the card drops to content height. The arithmetic is fragile — change any chrome height and the numbers drift — and the structural fix is to lift the topbar out of `workspace_col` so both columns start level and share one constant. Not done here.

### The workflow card's header collapsed when the workflows expanded

Not an issue item — it surfaced from looking at the rendered page.

The card is a fixed-height flex column. `.ant-card-head` is a flex item with the default `flex-shrink: 1`, and the body below is `flex: 1 1 auto`, so its basis is its *content* height. Expanding the workflows pushes header-basis + body-basis past the card's height, and flex then shrinks both: the body absorbs it happily (`min-height: 0`, it scrolls), but the header is squeezed toward its `min-height`, losing the room its two-line title and description need. Measured at 50.2px collapsed and 39.0px expanded. `flex-shrink: 0` on the header holds it at its natural height; the body was always able to absorb the difference alone.

`detail_card` cannot have the same fault — it declares no header. `deal_list_card`'s header is single-line, so it has almost nothing to lose and is left alone rather than guarded speculatively.

**Worth recording, because it cost three attempts:** "the header shrinks" was read as a *width* problem, and two horizontal fixes were built and then removed — a `minWidth` pinning the expand/collapse toggle (whose label is genuinely 7px wider when expanded, 73.8px vs 80.9px, and antd does take that off the `flex: 1` title), and `scrollbar-gutter: stable` on the card bodies (which genuinely prevents a ~15px reflow where scrollbars take layout space, verified in Chromium at 504px → 489px). Both describe real mechanisms. Neither was the reported fault, neither had anyone asking for it, and the scrollbar one is a no-op under macOS overlay scrollbars — so both were dropped as unrequested scope rather than kept as incidental polish. The diagnostic lesson is cheaper than the code: establish the axis before fixing anything.

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
- `components/detail/open_items_row.yaml` — rewritten: one paginated 2×2 `List` of merged rows under a single `ACTIONS` heading, replacing the two span-12 column Boxes. Stays a `Box`; no Card, no border. Mounts `activities/open-tasks` with `render: false` inside a `display: none` wrapper, for its request and state seeding only.
- `actions/open_items_merge.yaml` — new. The merge and row presentation as an operator fragment, so `compute_open_items` can take the full list and the first page from one definition.
- `actions/compute_open_items.yaml` — new. Sets the merged list, its first page, and resets the pagination block's own state. Referenced from all five sites that seed `entity_workflows` or `open_tasks`.
- `actions/compute_related_deals.yaml` — new. The same shape for related deals, replacing the two inline `set_related_deals` / `refresh_related_deals` SetStates.
- `components/detail/section_info_grid.yaml` — move the `info_grid_slots` concat entry above the People/Files group. One line.
- `components/detail/section_related_deals.yaml` — paginated 2×2 grid; `nowrap`, the horizontal overflow and the vertical-padding compensation all removed.
- `components/deal_list_item_compact.yaml` — `layout` removed entirely (it fills its grid cell); name from two-line clamp to single-line ellipsis.
- `components/detail_panel.yaml`, `components/deal_list_item_compact.yaml` — recompute refs added wherever they reseed `open_tasks` or `related_deals`. The related-deal click site was missed on the first pass: it reseeds both sources, so without it clicking a related deal left the previous deal's merged list on screen and the pagination stale.
- `requests/get_selected_deal.yaml` — related-deals `$limit` 20 → 10 (alongside the form-data re-key below).
- `pages/view.yaml` — new-deal button in `deal_list_card` `extra`; collapse toggle + 36px flex rail with its paired height constants; `pipeline_col`/`detail_col` to 12/12; card template 2dp formatting; `flex-shrink: 0` on the pipeline card's header.
- `components/button_new_deal.yaml` — gains `size` and `visible` vars, both defaulted to preserve the list page's rendering (`size` defaults to `null` rather than `default`, so it inherits an ancestor size context instead of overriding it).
- `components/detail/action_bar.yaml` — `flex: 0 0 auto` → `0 1 auto`, so the button bar wraps instead of spilling the topbar when the panel is collapsed on a phone.
- `components/deal_list_card.yaml` — **the same 2dp formatting.** This is the deals *list* page's browse card (`_ref`'d from `components/results_list.yaml`), and it reads the same `card_fields` var with the same `round` flag as the workspace panel card. Missed in an earlier draft of this inventory; leaving it would render one host setting two ways (`13` on the list page, `12.60` in the workspace).
- `requests/get_selected_deal.yaml` — form-data merge across workflows.
- `module.lowdefy.yaml` — `info_grid_slots`' description updated to say it injects before the built-in tiles; `workflow_type`'s description corrected, since it no longer drives the form-data alias. Both feed the generated `docs/deals/reference/vars.md`, so `pnpm docs:gen` must run in the same change. No var added or renamed.

**Formatting expression, both card templates:** `{{ (v | float(0)).toFixed(2) }}`. `float` is a stock Nunjucks filter that never throws and gives identical output for real numbers; a bare `.toFixed()` throws on a non-numeric field, and the blast radius of a thrown template error is not establishable from this repo (the `ListSelector` block's source lives elsewhere). The trade recorded knowingly: a host that flags a non-numeric path `round: true` now sees a plausible `0.00` rather than a visibly broken `NaN`.

**`modules/activities`**
- `components/capture_activity.yaml` — docblock fix only: `prefill` documents `attributes` and `references`, and notes both are modal-mode only. No behaviour change.
- `components/open-tasks.yaml` — gains two vars. `render` (default true) fetches and seeds `open_tasks` without drawing cards, gated with `_build.if` rather than `visible` because the card `List` *is* `open_tasks` and hiding it would delete the state it seeds. `on_loaded` (default `[]`) runs after that seeding, which is the one moment a host cannot hook itself. Also a comment fix: it described itself as composing with `open-actions` into one row, which stopped being true.

**`apps/demo`** — a reference consumer, added after this design was first written. An earlier draft said "no change needed", which was true of *correctness* — nothing in the demo breaks — but wrong about demonstrability: with no `info_grid_slots` set and no read of the workflow form-data alias, neither the tile reordering nor the re-keyed read shape was exercised anywhere in this repo, and this repo expects a build-verified consumer for consumer-facing capability.

- `modules/deals/tiles/qualification.yaml` — a span-12 host tile reading `workflows.sales-pipeline.{qualify,upload-po}.*` through the new shape. Its *position* is what demonstrates the reorder; the built page artifact confirms `Details → Qualification → People → Files`.
- `modules/deals/vars.yaml` — wires that tile into `info_grid_slots`, plus a `request_stages.get_selected_deal` stage deriving a field from the same alias (exercising it server-side, which is how a host actually consumes it) surfaced through `meta_fields`.

The demo cannot demonstrate reading across two workflow *types*: its second workflow (`onboarding`) has only `kind: check` actions, which carry no form data. Giving it a form action purely to exercise this would be inventing demo content, so the limitation is recorded in the tile instead.

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

1. ~~**One release or two?**~~ Resolved: one. A single changeset covers the whole rework, on the reasoning that a changelog assembled from intermediate states would document decisions that were reversed mid-flight and never shipped.
2. ~~**Thousands separator character.**~~ Resolved: `en-GB`, giving `R1,234,567.89`. `en-ZA` was checked and rejected — it yields a comma decimal (`R1 234 567,89`), clashing with the period decimal the `.toFixed(2)` sites produce.
3. ~~**Rail width.**~~ Resolved: a fixed 36px through `flex`, sized to the chevron rather than to a grid share — see the collapse decision above for why neither span 1 nor span 2 works. ~~**Whether the collapsed state persists**~~ Resolved: page state, as shipped — the panel returns expanded on a fresh load. `localStorage` was declined; it is a persistence mechanism this module has nowhere else, for one boolean, and a panel reappearing is the safer default when a collapsed one is easy to forget.
4. **Does `card_fields.round` stay a boolean?** With 2dp as the default it may want to become a precision number, which is a host-facing var change rather than a formatting fix.
5. **Fix the unresolvable `deal-status-chip` export here, or separately?** The deals manifest needs a top-level `components:` list for its one declared export to work at all (see the adjacent-defect note). Nothing in this design depends on it, so it is a free-standing bug — but it is a small fix and this release already touches the manifest.
6. ~~**Let the topbar action bar shrink?**~~ Resolved: yes, `flex: 0 1 auto`. The collapse is what makes the bar overflow on a phone, so the fix belongs with it rather than in a follow-up — see the collapse decision above for the measurements.
