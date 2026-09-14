# The save-report filter picker: authoring a filter from a catalog field

A sub-design of [`save-as-report`](../design.md), which owns the confirm sheet this picker lives in. It feeds that sheet: the sheet ships **without** a picker first (reports save filterless, which is valid), and this picker slots into the reserved filters region when it lands.

The split exists because the picker is a design's worth of _authoring_ decisions that nothing else in the sheet depends on. [`report-filters`](../../../report-filters/design.md) already shipped the other half — the `optionsQuery` wire format, the `any`/`all` semantics, and the resolution path at report-open. It also _described_ a **derivation rule** (three catalog inputs → an `optionsQuery`) in its prose, but shipped no code for it: there is no derivation helper, and `validateReportSpec` only validates an `optionsQuery` handed to it. So building that derivation is this design's job, not inherited work — see the decision below. Otherwise this design restates none of report-filters, deciding only the UI that gathers the inputs, where the derivation runs, and the questions report-filters deliberately left to "once the save sheet exists."

## What report-filters already settled (do not re-decide here)

- A filter is a section: `{ type: filter, control, field, match?, options | optionsQuery? }`. Controls are `select`, `multiselect`, `daterange` — there is **no numeric-range control**.
- Options precedence: declared `options` → `optionsQuery` rows → catalog enum `values`. Declaring both `options` and `optionsQuery` is rejected; either on a `daterange` is rejected.
- A `relationships` entry `{ field, collection, foreignField }` makes a looked-up filter derivable: `valueKey` is `foreignField`; `labelKey` is a label field the user picks; the derived `optionsQuery` projects the two columns and sorts by label. (Where that derivation runs is this design's call — see below.)
- Query-sourced options are capped at `MAX_QUERY_FILTER_OPTIONS = 500`, and the control's title says so when truncated (`Companies — first 500`).
- A failed options query degrades **that filter** to an Alert at report open, never the report. `MultipleSelector` renders `{ label, value }` and tags natively; its `onSearch` exists but server-side option search is a separate design.

## Proposed picker (starting point — carried over from save-as-report)

The sheet is where a user adds a filter from a catalog field, then edits or removes it. It is **add-only** — nothing proposes filters into this sheet (see question 3). The agent writes `optionsQuery` pipelines freely on its own route; the sheet writes only the **derivable subset**, and the picker is shaped by exactly that limit:

- **Field.** A `Selector` over the catalog fields eligible for the bound sections' collections. A field a report can't filter on isn't offered.
- **Control follows catalog type, not user choice.** A date field yields a `daterange`; anything else a `select` / `multiselect`, with multiselect the default so several values fit one filter.
- **Options source is decided by the field's catalog shape.** An enum field draws options from the catalog's declared `values` — no query. A field with a `relationships` entry is the looked-up case: the sheet asks the one thing the catalog can't supply — a label — with a second `Selector` over the target collection's `type: string` fields. A field with neither enum values nor a relationship is not a pickable filter here.
- **`match: all` is offered only where it's sensible** — the `any`/`all` toggle (a `SegmentedSelector`) appears only on a field the catalog declares `type: array`, using catalog type as the UI hint report-filters describes.
- **Selected values render as tags** via `MultipleSelector`.

### The derivation runs server-side, not in the sheet

The relationship case needs an `optionsQuery { collection, pipeline, valueKey, labelKey }`, and its `pipeline` is a real aggregation — `[{$project: {[labelKey]: 1, [foreignField]: 1}}, {$sort: {[labelKey]: 1}}]`. **The sheet does not build it.** Constructing those stages in config means Mongo stage _keys_ named from runtime selections — the runtime dynamic-key construction `CLAUDE.md` warns against — and a hand-built pipeline can drift from the shape `querySections`/`compileReport` expect.

Instead the sheet posts the two things it knows — the chosen `field` and the picked `labelKey` — and `create-report` derives the `optionsQuery` from the catalog before it validates. That endpoint already holds the catalog (`_module.var: catalog`) and already runs `validateReportSpec`, so the relationship lookup (`{collection, foreignField}`), the pipeline build, and the existing validation all sit in one place. The agent route is unaffected: `generate-report` still writes full `optionsQuery` pipelines itself; derivation is a pre-validation step that fires only for a filter section carrying a `field` + `labelKey` and no `optionsQuery`. So the wire format keeps one shape and the derivation gets exactly one home.

The same server pass also **binds** each sheet-authored filter. `validateReportSpec` rejects any filter that no section scopes (a filter must appear in some data section's `filterBy`), so the derive step adds the filter's `field` to the `filterBy` of **every data section whose collection declares that field in the catalog** — for every sheet filter, looked-up or enum. This is catalog-driven, not a UI choice: the author never picks scope. In the common single-collection report it binds every section; in a mixed-collection report a filter binds only the sections whose collection actually has the field (binding one whose collection lacks it would make its report-open `$match` match nothing). Scope is not user-selectable here, and _conveying_ scope in the rendered report stays the parent [`reporting/ux`](../../design.md) design's problem (decision 5) — this pass only establishes the binding.

## Design decisions (this design's job)

1. **Field eligibility — Decided: only completable fields.** The field `Selector` offers only fields the picker can finish, never a dead end: a field the catalog gives an **options source** — declared enum `values`, or a `relationships` entry the optionsQuery derives from — plus **date** fields, which need no options source (a `daterange` needs no list). Every other field on the bound sections' collections — free-text strings, ids without a relationship, objects — is not offered.
2. **Numeric fields — Decided: excluded for now.** report-filters has no numeric-range control, so a "revenue over X" filter is not expressible. The picker **does not offer numeric (`type: number`) fields**; a `numberrange` control is out of scope here and would be a report-filters follow-up (engine work), not picker work. Recorded as a known gap in the how-to so a user isn't left hunting for a numeric filter that can't exist yet.
3. **Proposed vs user-added filters — Decided: add-only.** On the tick-and-save route nothing produces proposed filters: the sheet is fed by `get-conversation-results`, which returns chart/table/download parts only, and the agent authors filters on the `generate_report` route, straight into the report. So the picker adds a filter from a catalog field into its **own reserved region** (not the sections `ControlledList`, whose row is `{label, type}` + reorder — a filter row is a richer, different shape), edit/remove per row, no proposal to coexist with. Surfacing agent-proposed filters into this sheet would need a new filter part + emit path — a separate scope decision on the very route report-filters split this off from, deliberately not built here.
4. **Preview — Decided: blind emit, no authoring-time preview.** The sheet emits the filter and its options resolve at report open, exactly as an agent-authored filter does. Previewing real options in the sheet would need a new authoring-time endpoint that derives and runs the query against the DB (its own auth gate, 500-cap, failure handling); deferred until a mis-picked label field proves painful enough in real use to justify it. A user who picks the wrong label field sees it when the report renders.
5. **Authoring-time failure — Decided: nothing to resolve here.** Question 4 dissolves the authoring-time half — with blind emit there is no authoring-time query run, so no authoring-time failure to render; a bad query surfaces at report open, which report-filters already degrades to an Alert. On placement: `compileReport` already renders every filter control in one full-width row at the **top** of the report, so "filters at top" is existing engine behaviour the picker adds nothing to. The residual UX problem — a control not conveying which sections it scopes ([`cdf17a10`](../../../report-filters/design.md)) — was explicitly assigned to the **parent [`reporting/ux`](../../design.md) design**, not this picker. So this design carries none of it.
6. **The label question — Decided: inline.** The target-collection label `Selector` is a field **inside the filter row**, shown only for a relationship field — so the row is conditionally shaped, not a stepped follow-up. A user picks the field and, when it's a looked-up field, the label field on the same row.

## Files changed (anticipated)

- `modules/ai-reporting/pages/chat/components/save_report_sheet.yaml` — the filters region and the per-filter picker controls (add-only, inline label field for relationship fields), filling the placeholder save-as-report reserved.
- `modules/ai-reporting/api/create-report.yaml` — derive the `optionsQuery` server-side from the posted `{ field, labelKey }` before validation (see "The derivation runs server-side"). The payload schema gains the picker's leaf inputs.
- `docs/ai-reporting/` — extend the save-as-report how-to with the filter step, and note the excluded numeric-field gap (question 2) where a user would look.

A `numberrange` control is **not** in scope (question 2); if ever wanted it is a report-filters (engine) follow-up, not picker work.

## Demo consumer

- Author a looked-up filter (a company, via the `demo_companies` relationship report-filters already seeds) through the sheet, so the derive → emit → resolve-on-open path is build-verified from the UI, not just from a hand-written spec.

## Non-goals

- **The `optionsQuery` wire format, contract, and resolution** — [`report-filters`](../../../report-filters/design.md).
- **Server-side option search / autocomplete** — report-filters' non-goal; a set too large for a 500-option dropdown is a separate design.
- **Editing an existing report's filters** — the sheet creates; re-deriving is the assistant's job.
