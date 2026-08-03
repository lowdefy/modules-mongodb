# Review 1

### 1. Proposed change 6 is unnecessary — `capture_activity` already supports `prefill.attributes`

> **Resolved (auto).** Confirmed against `capture_activity.yaml:165-177` — `prefill.attributes` and `prefill.references` are both merged over the module defaults, consumer wins. Dropped the proposed change (old #6; the form-data merge is now #6), corrected the Current State row, replaced the decision section with the corrected fact plus the modal-only constraint, reduced Files Changed to a docblock fix, and narrowed the release ordering to `deals` alone. Also corrected the sibling `deal-lifecycle-split` design in the host app's repo, which asserted the same false dependency in four places.

The design's proposed change 6 adds an `attributes.*` passthrough to `capture_activity.prefill`, and the Current State table asserts that `prefill` "accepts only `{ type, title, description, contacts, company_ids }`". **That is false.** It is what the component's *docblock* says (`modules/activities/components/capture_activity.yaml:13`), but the implementation already does it:

```yaml
# capture_activity.yaml:165-177, inside onOpen → seed_prefill
attributes:
  _object.assign:
    - date: { _date: now }
      duration: 45 min
      direction: Sent
    - _if_none:
        - _var: prefill.attributes
        - {}
references:
  _if_none:
    - _var: prefill.references
    - {}
```

`prefill.attributes` is merged over the module's defaults with the consumer's values winning — the comment on line 164 says so explicitly ("let any consumer-prefilled attributes win"). `prefill.references` is supported the same way, which the retention button also needs for `deal_ids`.

The stale docblock is what misled this design. Consequences:

- **Drop proposed change 6** and the `modules/activities` entry from Files Changed. Replace with a one-line docblock fix listing `attributes` and `references`.
- **Open question 1 ("one release or two") mostly dissolves.** The sibling `deal-lifecycle-split` design declares itself "blocked on a module release carrying the two accommodations"; only one accommodation is real (the `deals` form-data merge, finding 4). That design's Module Accommodation section and Dependencies both need correcting.
- **One residual limitation is real and should be recorded instead:** attributes are seeded in `onOpen` for **modal** mode only. Page mode carries just `type`/`title`/`contacts`/`company_ids` in `urlQuery` (`:86-96`). The retention button uses modal mode, so it works — but the constraint belongs in the design rather than being rediscovered if it ever switches to `mode: page`.

### 2. Renaming `info_grid_slots` → `info_grid` is a breaking change, and the design never says so

> **Resolved — by removing the rename.** Worked through three rounds. First the rename was kept and documented as breaking (Lowdefy throws on unknown connection-remap and secret keys, `buildModules.js:70-79`, but does **not** validate var names, `buildModuleDefs.js:101-132`, so a stale `info_grid_slots` produces no error and the host's tiles silently stop rendering). Then the export round-trip that the ordered grid required was judged not worth it, and the design was reduced to **moving the existing `info_grid_slots` injection point above the People/Files group** — one line in `section_info_grid.yaml`, no new var, no rename, nothing breaking, host config untouched. The finding is therefore resolved by making it inapplicable; the silent-var-failure evidence is retained in the design as the reason the rename was rejected. Cost recorded honestly: the resulting 2×2 pairing is Company | Product over People | Files, not the pre-module Company | People over Product | Files, so exact fidelity to issue item 4 is *not* delivered — raised as open question 6 for the issue author rather than presented as a restoration. Also corrected the rationale's mis-citation of the original deals-module design's "more named positions" line (it permits adding positions; the design had cited it as a warning against them) and the false claim that `apps/demo` needed migrating.

Proposed change 2 replaces the var, and the rationale explicitly rejects keeping both ("two mechanisms for one job is worse than one migration"). That's defensible, but the design never states the consequence: **this is a breaking release for a published module with an external consumer.** The host app is on the `v0.17.0` tag and its `modules/deals/vars.yaml` sets `info_grid_slots` with two tiles; the moment it bumps, its grid silently loses both tiles unless it migrates in the same commit. Silently — an unknown var is not a build error.

The design needs to say which it is: a breaking release with a stated host migration step, or one release accepting both vars with `info_grid_slots` deprecated. Nothing in the document currently tells a releaser which.

Related versioning confusion worth fixing while here: the Current State table says references are "at the v0.17.0 shape", and that is true of the *content* (`git diff v0.17.0 HEAD -- modules/deals` is version and changelog lines only). But `v0.17.0` is the **repo tag**, while `modules/deals/module.lowdefy.yaml` is at module version **0.22.0**. An implementer reading "v0.17.0" and looking for that module version will not find it.

### 3. "2 decimals with thousands separators" has no mechanism, and the obvious one does neither

> **Resolved.** Confirmed: Lowdefy's Nunjucks env registers only `date`, `unique`, `urlQuery` (`packages/utils/nunjucks/src/index.js:26-28`), so stock `round(precision)` is all there is — it neither pads nor separates. Validating it also split the problem usefully: because the card keeps its `R1.2m` abbreviation, separators are needed at exactly **one** site (the host's meta-strip Value), not everywhere. Recorded a three-row mechanism table — `.toFixed(2)` for the module card volume and the host product tile (precedented at `the host app's .../companies/tiles/company_orders.yaml:95`), `.toLocaleString` with 2 min/max fraction digits for the single currency site. Added an explicit instruction to verify the locale's separator characters at implementation, since some South African conventions pair a space thousands separator with a comma decimal and would contradict the design's own `R1 234 567.89` example; pin the format by hand if so. That also closes open question 2, now struck through. Noted a `number` filter in Lowdefy core as the real cleanup, explicitly not blocking this rework.

Proposed change 5 and the formatting decision promise 2dp with thousands separators on currency. The design points at the card template's `| round` filter as the site but never names what replaces it, and Nunjucks `round` cannot deliver either half of the promise:

- `round(2)` does not pad trailing zeros — `12.6 | round(2)` renders `12.6`, not the `12.60` the design's own worked example shows.
- Nunjucks has no number-formatting filter at all, so separators are not reachable through it.

Nor is there anything in the module to reach for: **no `toFixed`, no `toLocaleString`, no `Intl.NumberFormat`, and no custom Nunjucks filter anywhere in `modules-mongodb/modules`.** The only precedent in either repo is host-side — the host app's `modules/companies/tiles/company_orders.yaml:95` uses `{{ (quantity or 0).toFixed(2) }}`, i.e. a JS method call on the value inside the template.

So the module needs a formatting facility it does not currently have, and that is unscoped work the design presents as a one-line filter change. Decide between: a method call in the template (`toFixed` for padding, `toLocaleString` for separators — untested in this codebase, and locale behaviour differs between SSR and client), formatting in the `_js` that already computes the card `data` in `pages/view.yaml:209-235`, or a shared helper component. Note also that padding, rounding, and separating are three requirements, not one.

### 4. The form-data merge rests on an invariant nothing enforces

> **Resolved.** Confirmed stronger than the finding stated: `makeWorkflowsConfig.js:930` hard-errors on a duplicate action type *within* a workflow, and the engine namespaces by workflow type everywhere across them (endpoint ids `{workflow_type}-{action_type}-{signal}-{phase}`, render config keyed workflow-type-then-action-type). So cross-workflow reuse is legal by design and the "unique across a lifecycle" premise was never a property of the system. The build-time guard the finding proposed was also rejected on validation: deals is pure YAML with no resolver to host it, and putting a deals-specific rule in the workflows engine would forbid something the engine deliberately supports. Changed the fix to key form data by workflow type (`workflows.{workflow_type}.{action}.{field}`), which makes collision structurally impossible and matches the engine's convention. Recorded the resulting breaking read shape and enumerated the three host sites; two of the three are being rewritten for the pipeline split regardless. `deal_card_fields.yaml` is unaffected — it builds its own `workflows` field. Mirrored into `deal-lifecycle-split`, which quoted the old shape twice.

Proposed change 7's fix is a flat merge of `form_data` keyed by action type, justified as: "action types are unique across a lifecycle, so a flat merge keyed by action type stays unambiguous."

That holds for the host app's split today — prospecting takes eight action types, onboarding takes `order-confirmation` and `monthly-order-tracking`, no overlap. But it is stated as a general property of lifecycles, and nothing validates it. A lifecycle that reuses a type across two workflows (a `review` or `approval` step in both halves is an entirely ordinary thing to want) silently collides, and the loser's form data becomes invisible with no error.

That is precisely the failure mode this same proposed change exists to fix — the design's own rationale calls the current single-workflow scoping "a **silent** break, not a loud one" — so shipping a fix with the same shape of silent failure at one remove deserves an explicit decision. Options: key the merge by `workflow_type` and keep a flat alias for back-compat; or keep the flat merge and add a build-time guard that fails when two of a lifecycle's workflows declare the same action type. The second is cheaper and preserves every existing `workflows.{action}.{field}` read.

Separately, `$mergeObjects`/merge precedence is undefined in the design — when two workflows *do* collide, which wins is currently whatever `$lookup` ordering happens to produce.

### 5. Extracting the built-in tiles converts four internal components into public API

> **Resolved — premise removed.** The design no longer exports any tiles: see #2. Nothing becomes public API, so the concern is fully answered rather than mitigated. Validating it did surface a real, separate bug now recorded in the design as an adjacent defect: module component refs resolve against a top-level `components:` list in the manifest (`getModuleRefContent.js:82` looks up `manifest.components` by id), and the deals manifest has no such list — so the `deal-status-chip` it declares under `exports.components` cannot be resolved by any host. The sibling workflows module has the list (`module.lowdefy.yaml:217-229`); deals does not. Whether to fix it in this release is open question 5.

Proposed change 2 has the module export its built-in tiles as `_ref`-able components. Verified as viable — hosts do use `_ref: { module: X, component: Y }` in their own vars (`host-app/apps/host-app/modules/contacts/vars.yaml:37`, `modules-mongodb/apps/demo/modules/companies/vars.yaml:63-69`) — but the design understates what it costs.

Module components are not implicitly public. `module.lowdefy.yaml` carries both a `components:` registration list and an `exports.components:` list with per-component descriptions (`modules/workflows/module.lowdefy.yaml:182-229` is the pattern). Each tile added there becomes a supported surface a host can depend on, so renaming or restructuring `section_people` later stops being an internal refactor.

Two concrete trims worth considering: export the minimum the ordering actually requires rather than all four, and note that `info-tile-details` is pointless for the only host that needs the reordering — the host app sets `show_details: false`, so the design's own worked example lists a component that renders nothing.

### 6. The collapse mechanism has no precedent in the codebase, so the stated fallback is probably the primary

> **Resolved (auto).** The precedent observation is correct but the inference is wrong. `packages/engine/src/Block.js:350` parses `layout` inside `evaluate()` alongside `propertiesEval`/`visibleEval`/`styleEval`, so `layout.span` is operator-evaluated on every render and reacts to state. Kept span-toggling as the approach, deleted the spike-and-flex-fallback hedge, and cited the engine line. Retained the "first reactive layout in this repo" note as a review flag.

The collapse decision proposes toggling `layout.span` from state (5 → rail, workspace 19 → 23), with flex widths as a fallback "if span turns out to be build-time only".

There is **no state-driven `layout.span` anywhere in `modules-mongodb/modules`** — every `span:` found is a literal. Operators appear inside `properties`, `visible`, and `loading` throughout, but not inside `layout`. That is not proof it fails, but the evidence points the other way from the design's ordering, and "spike it later" leaves the module's most structural change in this rework resting on the unverified branch.

Either lead with the flex approach (the module already uses flex layout — `topbar_company` at `pages/view.yaml:390`, `deal_list_item_compact` at `flex: 0 1 auto`), or make the spike an explicit blocking prerequisite rather than a parenthetical, since the answer changes how `deals_layout` and both child columns are written.

### 7. The related-deals cap doesn't choose an axis, and the two options fail differently

> **Resolved.** Confirmed both failure modes, then removed their shared cause rather than choosing between them. The cards were content-width with a two-line name clamp, so neither a pixel height nor a count could bound the strip; making them **fixed-width with a single-line ellipsised name** makes height and width constant, at which point a count limit works. Lookup `$limit` drops 20 → 10. `nowrap` with horizontal overflow sits on top, since the detail column is a share of the workspace and a count that fits one row when wide would wrap when narrow. Horizontal is also the correct axis independently: the containing detail card is itself an `overflow-y: auto` region, so a vertical sub-scroller would nest two vertical scrollers and steal wheel gestures. Accepted trade-off recorded (less of the deal name visible; `deal_list_item_compact` has no other consumer). Also noted, explicitly out of scope, that this strip and the Active Deals panel render the same concept through two different card templates.

Proposed change 3 says "cap the related-deals strip to a one-row scroll container sized by a var" without deciding whether that scrolls horizontally or vertically. It is not a detail — the two have different failure modes:

- **`nowrap` + horizontal scroll** genuinely is "one row", but hides how many related deals exist (up to 20, per the `$limit: 20` in `get_selected_deal.yaml`) behind a scroll gesture that is awkward on desktop.
- **wrap + `max-height` + vertical scroll** needs a row-height constant, and the cards are not a fixed height: `deal_list_item_compact.yaml` clamps the deal name with `-webkit-line-clamp: 2`, so a card is one or two lines tall depending on its name. A fixed `max-height` will clip a row mid-card.

If vertical, cap by **count** — slice `related_deals` in state or lower the `$limit` — rather than by CSS height, which sidesteps the variable-height problem entirely and makes the "sized by a var" contract meaningful (a number of rows, not a pixel value).
