# Task 2: Add-only filter picker in the save-report sheet

## Context

The save-report confirm sheet is `modules/ai-reporting/pages/chat/components/save_report_sheet.yaml`
— a wide `Modal` that names the report, takes a description, reorders/removes the conversation's
sections (`sheet_sections`, a `ControlledList`), offers a visibility control, and on `onOk`
posts to `create-report`. It carries an explicit **reserved filters region** (a comment block
around lines 219-220, between `sheet_sections` and `visibility_section`) left empty for this
picker.

Task 1 shipped the server side: `create-report` now runs `_analytics.deriveReportSpec` before
`validateReportSpec`, so the sheet can post a `filter` section carrying just
`{ type: filter, control, field, label, labelKey? , match? }` (no `optionsQuery`, no
`filterBy`) and the server derives the `optionsQuery` and binds the filter to the sections it
scopes. **This task must post exactly that shape.**

The picker is **add-only** and lives in its **own region** — it is not the `sheet_sections`
`ControlledList` (whose row is `{label, type}` + reorder; a filter row is a different, richer
shape). Use a second `ControlledList` bound to a new state array, e.g. `sheet_filters`, with the
add button shown and remove per row (filters are unordered — all render at report top — so no
move up/down).

**Field eligibility (design decision 1)** — the field `Selector` offers only fields the picker
can finish, drawn from the catalog for the collections the report's sections query:

- an **enum** field (catalog `values` declared) → options come from `values`, no `labelKey`;
- a **relationship** field (a `relationships` entry) → looked-up, needs a `labelKey`;
- a **date** field (`type: date`) → `daterange`, no options, no `labelKey`.

Every other field — free-text strings, ids without a relationship, objects, and **all
`type: number` fields (excluded, design decision 2)** — is not offered.

**Control follows catalog type, not user choice (design):** a date field → `control: daterange`;
anything else → `control: multiselect` (the default, so several values fit one filter). Do not
add a select-vs-multiselect toggle in this task.

**Label (design decision 6): inline.** For a relationship field only, show a second `Selector`
**in the same filter row** whose options are the target collection's `type: string` fields
(e.g. `demo_companies` → `name`, `_id`). Its value is the `labelKey`. Not shown for enum/date
fields.

**`match` any/all (design):** show a `SegmentedSelector` (`any`/`all`) in the row **only** when
the chosen field is `type: array`; its value is `match`. `any` default. Not shown otherwise.

**No value preview (design decision 4):** the sheet does not resolve or show real option values.
There is no `MultipleSelector` of live values here — the user authors the filter _definition_
(field + label + match), and options resolve at report open.

Block schemas and examples: use the `lowdefy-docs` MCP tools (`lowdefy_get_schema`,
`lowdefy_get_examples`, `lowdefy_search_docs`) for `Selector`, `SegmentedSelector`,
`ControlledList` and the `_module.var` / `_js` operators — do not guess block props.

## Interfaces

- **Consumes (from task 1):** `create-report` accepts `spec.sections[]` filter items of shape
  `{ type: "filter", control, field, label, labelKey?, match? }` and derives `optionsQuery` +
  `filterBy` server-side. The picker must produce exactly this and nothing more on a filter
  section (no `optionsQuery`, no `filterBy`, no `labelKey` on enum/date rows).
- **Produces:** a `sheet_filters` state array of filter sections, merged into the posted
  `spec.sections` on `onOk`.

## Task

### 1. Make the catalog available to the picker

The eligible-field list is computed at runtime from the report's section collections
(`sheet_sections[].query.collection`, present because `sheet_sections` items are full section
specs) intersected with the catalog. Inject the catalog into the sheet via `_module.var: catalog`
(build-time), and compute eligible fields with a `_js` operator over
`_state: sheet_sections` + the injected catalog. Eligibility rule = the field is on a queried
collection AND is (enum `values`) OR (has a `relationships` entry) OR (`type: date`); exclude
`type: number` and plain strings/objects/ids-without-relationship. Each eligible option should
carry enough to drive the row: the field name (value), a human label, its `type`, whether it is
a relationship (and its target collection), and whether it is an enum.

### 2. Filter picker region — new `sheet_filters` `ControlledList`

Replace the reserved-region comment (lines 219-220) with a `ControlledList` `id: sheet_filters`:

- Add button shown (`hideAddButton` unset/false); remove per row shown; no move up/down.
- A new row initialises empty; the user picks a field first.
- **Row blocks** (ids on the `sheet_filters.$.` path so state auto-binds):
  - `sheet_filters.$.field` — `Selector`, options = the eligible-field list from step 1.
  - `sheet_filters.$.label` — `TextInput`, the filter's display `label` (required; a filter
    section needs a non-empty label per `validateReportSpec`). Default it to the field's label.
  - `sheet_filters.$.labelKey` — `Selector`, shown only when the chosen field is a relationship
    (`visible` keyed off the selected option's relationship flag); options = the target
    collection's `type: string` fields from the catalog.
  - `sheet_filters.$.match` — `SegmentedSelector` (`any`/`all`), shown only when the chosen field
    is `type: array`.
  - remove `Button` (mirror `sheet_sections.$.remove`, calling `removeItem`).

### 3. Assemble the posted spec on `onOk`

The `create-report` `payload.spec.sections` currently sends `_state: sheet_sections`. Change it
to send the **concatenation** of `sheet_sections` and the picker's filter sections built from
`sheet_filters`, each shaped as:

```
{ type: "filter",
  control: <daterange if the field is a date else multiselect>,
  field:   <sheet_filters.$.field>,
  label:   <sheet_filters.$.label>,
  labelKey: <sheet_filters.$.labelKey>  # only for a relationship field; omit otherwise
  match:   <sheet_filters.$.match>       # only for an array field; omit otherwise
}
```

Derive `control` from the field's catalog `type` (date → `daterange`, else `multiselect`) using
the eligible-field metadata — do not add a user control for it. Omit `labelKey`/`match` where not
applicable (do not send `null`/`""` — task 1 strips `labelKey`, but a stray `match` on a
non-multiselect is rejected by `validateReportSpec.js:337`). Use `_array.concat` / a `_js`
mapping so filterless reports (empty `sheet_filters`) still post `sheet_sections` unchanged.

Seed `sheet_filters` to `[]` when the sheet opens (mirror how `sheet_description` is seeded), so
filters from a prior open don't carry over.

## Acceptance Criteria

- `pnpm ldf:b` from `apps/demo` compiles clean.
- Inspect the generated chat page artifact under `apps/demo/.lowdefy/server/build/pages/**`:
  the sheet carries `sheet_filters` with a field `Selector`, a conditional `labelKey` `Selector`,
  and a conditional `match` `SegmentedSelector`; the `create-report` `onOk` payload concatenates
  `sheet_sections` with the assembled filter sections.
- A filter section built by the picker carries no `optionsQuery`, no `filterBy`, and no `labelKey`
  on enum/date rows — matching the shape task 1's `deriveReportSpec` expects.
- Filterless save (no filters added) posts `sheet_sections` unchanged and still saves.

## Files

- `modules/ai-reporting/pages/chat/components/save_report_sheet.yaml` — modify — add the
  `sheet_filters` picker in the reserved region; compute eligible fields; assemble the posted
  spec on `onOk`; seed `sheet_filters: []` on open.

## Notes

- This is the demo consumer for the feature: the demo mounts this chat page and its catalog
  (`apps/demo/modules/ai-reporting/catalog.yaml`) already seeds a `demo_activities.company_ids` →
  `demo_companies` relationship with `name` as a label field, so `pnpm ldf:b` build-verifies the
  looked-up path end-to-end at compile time. The live derive → save → resolve-on-open path needs
  a dev server with Mongo + AI and is a dev-test follow-up (task 3 documents it).
- The eligible-field `_js` runs over runtime `sheet_sections`; guard for an empty/absent list so
  a freshly opened sheet with sections not yet seeded doesn't throw (`_if_none` / length guard,
  as the `okButtonProps.disabled` block already does).
- Keep the one-`gap` modal layout — the picker region is another direct child of the modal body.
