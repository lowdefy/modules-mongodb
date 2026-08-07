# Task 1: Server-side report-spec derivation (`_analytics.deriveReportSpec`) wired into `create-report`

## Context

The save-as-report sheet will let a user author a filter from a catalog field. It posts only
the two leaf inputs it knows — the chosen base-collection `field` and, for a looked-up field,
a `labelKey` (the label column to show). The stored/validated filter shape is richer:
`validateReportSpec` (`plugins/modules-mongodb-plugins/src/analytics/validateReportSpec.js`)
requires a looked-up filter to carry a full
`optionsQuery { collection, pipeline, valueKey, labelKey }`, and requires **every** filter
section to be bound by at least one data section via that section's `filterBy` array
(`validateReportSpec.js:484` throws `filter "…" is not bound by any section`).

Two hard constraints from the validator, both verified in its source:

- **`labelKey` is not an allowed filter key.** The filter branch strict-key-checks against
  `[id, type, label, control, field, options, match, optionsQuery]`
  (`validateReportSpec.js:262-279`) and throws on any other key. So `labelKey` must be
  **consumed and removed** before `validateReportSpec` runs — it can never reach the validator.
- **A filter with no `filterBy` binding fails.** So a sheet-authored filter must have its
  `field` added to the `filterBy` of the sections it scopes, or the save throws.

This task adds a pure derivation pass that turns the sheet's leaf inputs into a spec
`validateReportSpec` accepts, and wires it into `create-report` **before** validation. The
agent route (`generate-report`) does not use it — it already writes full `optionsQuery`
pipelines. Derivation is create-time only, exactly like validate-before-persist.

The catalog shape the pass reads (`apps/demo/modules/reporting/catalog.yaml`):

```yaml
demo_activities:
  fields:
    company_ids: { type: array, description: ... }
  relationships:
    - field: company_ids # base-collection field the filter targets
      collection: demo_companies # lookup target
      foreignField: _id # → becomes optionsQuery.valueKey
demo_companies:
  fields:
    name: { type: string } # a labelKey candidate
    _id: { type: string }
```

The `optionsQuery` shape `querySections`/`compileReport` already consume
(`querySections.js:24-31`): `{ collection, pipeline, valueKey, labelKey }`, where the pipeline
projects the two columns and sorts by label.

## Interfaces

- **Produces:**
  - `deriveReportSpec({ spec, catalog }) → spec` — default export of a new file
    `plugins/modules-mongodb-plugins/src/analytics/deriveReportSpec.js`. Pure; returns a new
    spec object (does not mutate the input). Registered as `_analytics.deriveReportSpec` in
    `analyticsOperator.js`.
- **Consumes (existing):**
  - `_analytics.validateReportSpec { spec, catalog, roles } → normalized spec` — runs after
    this pass in `create-report`.
  - Catalog collection shape `{ fields: { <name>: { type, values? } }, relationships: [{ field, collection, foreignField }] }`.

## Task

### 1. `plugins/modules-mongodb-plugins/src/analytics/deriveReportSpec.js`

Write a pure function `deriveReportSpec({ spec, catalog })` returning a new spec. Leave a spec
with no filter sections (and the agent route's already-complete filters) unchanged. For each
`section.type === "filter"`:

1. **Establish the binding.** Add the filter's `field` to the `filterBy` array of every
   **data** section (`type` in `kpi | chart | table`) whose `query.collection` declares that
   field in the catalog (`catalog[collection].fields[field]` is present). Preserve any existing
   `filterBy` entries; do not duplicate. (Binding data sections whose collection lacks the field
   is wrong — the report-open `$match` would run the field against a collection that has no such
   path.) This runs for every filter section, looked-up or enum.

2. **Derive the `optionsQuery`** — only when the section carries a non-empty `labelKey` **and**
   no `optionsQuery`:
   - Resolve the relationship: search the catalog `relationships` entries of the collections
     the filter is now bound to (from step 1) for one whose `field` equals the filter's `field`;
     take its `{ collection, foreignField }`. If none is found, **throw** an actionable error:
     `` `filter field "${field}": labelKey "${labelKey}" was given but no relationship for that field is declared in the catalog.` `` — do not silently drop it.
   - Build:
     ```js
     optionsQuery = {
       collection,
       pipeline: [
         { $project: { [labelKey]: 1, [foreignField]: 1 } },
         { $sort: { [labelKey]: 1 } },
       ],
       valueKey: foreignField,
       labelKey,
     };
     ```
     (Computed object keys in JS are fine — the dynamic-key concern is only about building this
     in Lowdefy config, which is exactly why the derivation lives here.)

3. **Strip `labelKey`** from the returned filter section in **all** cases (looked-up, enum, or
   already-carrying-`optionsQuery`). It is a sheet-only leaf and is never a valid key on the
   shape `validateReportSpec` accepts.

Throw with a clear `Error` message on the no-relationship case; otherwise never throw (leave
validation to `validateReportSpec`). Do not require `roles` — the derived `optionsQuery` is
role-checked downstream by `validateReportSpec` (via `validateQuery` → `validatePipeline`), so
an author who cannot query the lookup target gets an actionable failure from validation.

### 2. Register the operator — `plugins/modules-mongodb-plugins/src/analytics/analyticsOperator.js`

Import `deriveReportSpec` and add `["deriveReportSpec", deriveReportSpec]` to the `functions`
Map (alphabetical order, alongside the other `validate*` entries). Add a one-line entry to the
JSDoc method list at the top.

### 3. Wire into `create-report` — `modules/reporting/api/create-report.yaml`

Insert a derive `:set_state` step **before** the existing `validated` step, and feed its output
into validation:

```yaml
- :set_state:
    derived:
      _analytics.deriveReportSpec:
        spec:
          _payload: spec
        catalog:
          _module.var: catalog
- :set_state:
    validated:
      _analytics.validateReportSpec:
        spec:
          _state: derived
        catalog:
          _module.var: catalog
        roles:
          _user: roles
```

Update the `payloadSchema` comment (lines 36-39) so the filter shape reads
`filter carries { control, field, label, labelKey?, match? }`. The schema itself needs no
tightening — `sections.items` already only requires `type`, so the picker's leaf keys pass.
Leave the insert step, auth guard, and return unchanged.

## Acceptance Criteria

- New `deriveReportSpec.js` with a `deriveReportSpec.test.js` covering:
  - Looked-up filter (`{ type: filter, control: multiselect, field: "company_ids", label, labelKey: "name" }`) over a spec with a `demo_activities` table section → filter gains `optionsQuery { collection: "demo_companies", pipeline: [{$project:{name:1,_id:1}},{$sort:{name:1}}], valueKey: "_id", labelKey: "name" }`, `labelKey` stripped, and the table section's `filterBy` now includes `company_ids`.
  - Enum filter (`field` with catalog `values`, no `labelKey`) → no `optionsQuery` added, `filterBy` bound, no `labelKey` on output.
  - `labelKey` given for a field with no matching relationship → throws the actionable message.
  - `labelKey` present alongside an existing `optionsQuery` → `optionsQuery` untouched, `labelKey` stripped.
  - Spec with no filter sections → returned unchanged (deep-equal).
  - Input spec is not mutated.
  - Output of `deriveReportSpec` passes `validateReportSpec` with a catalog and roles (round-trip: derive → validate does not throw for the looked-up and enum cases).
- `pnpm --filter @lowdefy/modules-mongodb-plugins test` (or the repo's jest invocation, sandbox off per `tests-need-sandbox-off`) passes.
- `pnpm ldf:b` from `apps/demo` compiles; the generated `create-report` routine shows the `derived` step before `validated`, with `validated` reading `_state: derived`.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/deriveReportSpec.js` — create — the derivation pass.
- `plugins/modules-mongodb-plugins/src/analytics/deriveReportSpec.test.js` — create — unit tests above.
- `plugins/modules-mongodb-plugins/src/analytics/analyticsOperator.js` — modify — register `deriveReportSpec`; extend JSDoc.
- `modules/reporting/api/create-report.yaml` — modify — derive-before-validate step; payloadSchema comment.

## Notes

- **The `filterBy` binding rule is the one point the design left implicit.** The design specifies deriving the `optionsQuery` but not how a sheet-authored filter gets bound to sections. Binding to every data section whose collection declares the field (checked against the catalog) is the safe, catalog-driven rule and keeps the sheet from having to compute bindings in config. If a report mixes collections, a filter binds only the sections whose collection actually has the field. Confirm this is the intended policy before relying on it in task 2.
- Derivation is **idempotent-safe**: a filter already carrying `optionsQuery` (the agent shape) passes through with only `labelKey` stripped, so running the pass over an already-complete spec is harmless.
- `download` sections have no `filterBy` in the validator's output shape — bind only `kpi`/`chart`/`table`.
