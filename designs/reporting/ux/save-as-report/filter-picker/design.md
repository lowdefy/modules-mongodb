# The save-report filter picker: authoring a filter from a catalog field

A sub-design of [`save-as-report`](../design.md), which owns the confirm sheet this picker lives in. It feeds that sheet: the sheet ships **without** a picker first (reports save filterless, which is valid), and this picker slots into the reserved filters region when it lands.

The split exists because the picker is a design's worth of _authoring_ decisions that nothing else in the sheet depends on. [`report-filters`](../../../report-filters/design.md) already shipped the other half — the `optionsQuery` wire format, the `any`/`all` semantics, the resolution path at report-open, and the **derivation rule** (three catalog inputs → an `optionsQuery`). This design does not restate any of that. It decides only the UI that gathers those inputs, and the questions report-filters deliberately left to "once the save sheet exists."

## What report-filters already settled (do not re-decide here)

- A filter is a section: `{ type: filter, control, field, match?, options | optionsQuery? }`. Controls are `select`, `multiselect`, `daterange` — there is **no numeric-range control**.
- Options precedence: declared `options` → `optionsQuery` rows → catalog enum `values`. Declaring both `options` and `optionsQuery` is rejected; either on a `daterange` is rejected.
- A `relationships` entry `{ field, collection, foreignField }` makes a looked-up filter derivable: `valueKey` is `foreignField`; the sheet supplies `labelKey` from a label field the user picks; the emitted `optionsQuery` projects the two columns and sorts by label.
- Query-sourced options are capped at `MAX_QUERY_FILTER_OPTIONS = 500`, and the control's title says so when truncated (`Companies — first 500`).
- A failed options query degrades **that filter** to an Alert at report open, never the report. `MultipleSelector` renders `{ label, value }` and tags natively; its `onSearch` exists but server-side option search is a separate design.

## Proposed picker (starting point — carried over from save-as-report)

The sheet is where a user reads the assistant's proposed filters, edits them, and adds one from a catalog field. The agent writes `optionsQuery` pipelines freely; the sheet writes only the **derivable subset**, and the picker is shaped by exactly that limit:

- **Field.** A `Selector` over the catalog fields eligible for the bound sections' collections. A field a report can't filter on isn't offered.
- **Control follows catalog type, not user choice.** A date field yields a `daterange`; anything else a `select` / `multiselect`, with multiselect the default so several values fit one filter.
- **Options source is decided by the field's catalog shape.** An enum field draws options from the catalog's declared `values` — no query. A field with a `relationships` entry is the looked-up case: the sheet asks the one thing the catalog can't supply — a label — with a second `Selector` over the target collection's `type: string` fields, then emits `optionsQuery { collection, pipeline, valueKey: foreignField, labelKey }`. A field with neither enum values nor a relationship is not a pickable filter here.
- **`match: all` is offered only where it's sensible** — the `any`/`all` toggle (a `SegmentedSelector`) appears only on a field the catalog declares `type: array`, using catalog type as the UI hint report-filters describes.
- **Selected values render as tags** via `MultipleSelector`.

## Open questions (this design's job)

1. **Field eligibility.** Which catalog fields does the field `Selector` offer — every field on the bound sections' collections, or only fields that can actually back a filter (enum values, a relationship, or a date)? A field with none of those can't produce options, so offering it is a dead end. Leaning: offer only fields the picker can complete.
2. **Numeric fields.** report-filters has no numeric-range control. So a "revenue over X" filter is not expressible today. Does the picker simply not offer numeric fields, or does this design owe report-filters a `numberrange` control? Decide, and if it's out of scope, say so where a user would look.
3. **Proposed vs user-added filters.** The assistant proposes candidate filters; the user adds and edits. How do the two coexist in one list — same `ControlledList` as the sections, edit/remove per row? Is an assistant proposal pre-derived (options already resolved) or does the user still pick its label?
4. **Preview.** Does the sheet resolve and show the options (the actual companies) before saving, or emit the query blind and let them appear only at report open? A blind emit is simpler but a user can't tell a mis-picked label field from an empty collection until the report renders.
5. **Authoring-time failure.** report-filters degrades a failed options query at _report open_. What does the picker show when the derived query returns nothing, errors, or exceeds the 500 cap **at authoring time**? Related: filter _placement_ in the rendered report is recorded as an open UX problem in report-filters ([`cdf17a10`](../../../report-filters/design.md)); confirm this design doesn't need to resolve that too.
6. **The label question, inline or stepped.** Is the target-collection label `Selector` a field inside the filter row, or a follow-up step after the field is chosen? It only appears for relationship fields, so the row shape is conditional either way.

## Files changed (anticipated)

- `modules/reporting/pages/components/save_report_sheet.yaml` — the filters region and the per-filter picker controls, filling the placeholder save-as-report reserved.
- Possibly a `report-filters` follow-up if question 2 adds a control (out of this design's scope unless decided in).
- `docs/reporting/` — extend the save-as-report how-to with the filter step.

## Demo consumer

- Author a looked-up filter (a company, via the `demo_companies` relationship report-filters already seeds) through the sheet, so the derive → emit → resolve-on-open path is build-verified from the UI, not just from a hand-written spec.

## Non-goals

- **The `optionsQuery` wire format, contract, and resolution** — [`report-filters`](../../../report-filters/design.md).
- **Server-side option search / autocomplete** — report-filters' non-goal; a set too large for a 500-option dropdown is a separate design.
- **Editing an existing report's filters** — the sheet creates; re-deriving is the assistant's job.
