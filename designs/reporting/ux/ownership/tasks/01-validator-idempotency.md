# Task 1: Make `validateReportSpec` idempotent and give sections durable ids

## Context

`plugins/modules-mongodb-plugins/src/analytics/validateReportSpec.js` validates an AI-authored report spec and returns a normalized copy. Today the reports store persists the **raw** payload; the ownership design changes that so every writer persists **this function's return value**.

That makes idempotency load-bearing: the stored document is re-validated by the same function on every read — `querySections.js:58` (`const { sections } = validateReportSpec({ spec, catalog, roles })`) and again inside `compileReport.js:424` (`const validated = validateReportSpec({ spec, roles })`) — and once more on `remove-report-section`'s read → cascade → revalidate → write path.

**Fed its own output, the current function throws three ways.** Verified by running it, not by reading it:

- A kpi that omits `format` comes back with `format` explicitly `null` (`:179-182`, `: null`), and re-validation fails `format must be an object` (`:60-62`). This needs no serialization argument — it is a `null` in the returned object.
- A filter section's absent `options` / `match` / `optionsQuery` are `undefined` in the return value (`:416-425`). `:set_state` writes the operator's result into routine state in-process with no serialization (`@lowdefy/api/dist/routes/endpoints/control/controlSetState.js:32-34`), so they reach the insert and the driver's default (`ignoreUndefined` is set nowhere in this repo) stores them as `null`. Each then trips a `!== undefined` check — a select fails `match is only valid on a multiselect control` (`:363-367`), a multiselect fails `declares both options and optionsQuery` (`:369-373`), a daterange fails `options and optionsQuery are only valid on a select or multiselect control` (`:342-349`).
- A report with no description composes `description: null` (`_payload` of an absent key resolves to `null`) and fails `description must be a string` (`:146-148`).

A spec-level throw is a **whole-report** failure, not a per-section Alert — `querySections` runs in the resolver's `:for … :in`, which `controlFor` evaluates before iteration and outside the per-section `:try` — so it renders as "Report not found". Unfixed, this ships as _every kpi report is broken on first open_.

Separately, section ids are derived from array position (`const id = \`s${index}\``, `:160`). The design makes them **durable identities** so `remove-report-section` can name a section by id with no positional guard. The validator is the only party that authors them, which is why this costs nothing at the three call sites — but preserving a supplied id means checking it, because the validator cannot tell a stored document's id from one the model invented (`generate-report`'s payload schema constrains a section only to `{ type }`).

The id is not an inert label. `compileReport` uses it as the **block id** (`:372, 512, 529, 539, 610, 619`), as a request id (`query_${id}`), as a download id, and as a **page-state path** (`sections.${id}.rows`). Two sections sharing an id collide in `rowsBySectionId` (`:438-440`) so both render the same rows — wrong numbers, not a rendering glitch — and an id containing a `.` forks the state path so a section reads rows nothing writes.

## Interfaces

- **Produces:** `validateReportSpec({ spec, catalog, roles })` returning `{ title, description?, sections }` where every section carries a durable `id`, every absent optional is an **absent key**, and no value anywhere is `null` or `undefined`. Re-validating that return value returns it unchanged. Tasks 3, 4, 7 and 8 all depend on this property.

## Task

### 1. Preserve and check a supplied section `id`

Add a helper beside `validateLabel` and use it in every one of the six section branches in place of `const id = \`s${index}\``:

```js
// A section's id is durable: it is the block id, the request id, the download
// id and the page-state path (`sections.${id}.rows`) in compileReport, so a
// stored spec must keep the id it was saved with. This function cannot tell a
// stored id from one the model invented — generate-report's payload schema
// constrains a section only to { type } — so a supplied id is checked rather
// than trusted, and rejected rather than silently re-derived: a rejected tool
// call carries a message the model can act on, where a stored spec whose ids
// changed under it is the exact bug durable ids exist to remove.
function resolveSectionId(section, index) {
  if (section.id === undefined || section.id === null) return `s${index}`;
  if (typeof section.id !== "string" || section.id === "") {
    fail(`section ${index} id must be a non-empty string.`);
  }
  if (section.id.length > MAX_LABEL_LENGTH) {
    fail(`section ${index} id exceeds ${MAX_LABEL_LENGTH} characters.`);
  }
  // A '.' forks the page-state path so the section reads rows nothing writes;
  // '$' is excluded for the same reason every other field name in this file is.
  if (section.id.includes(".") || section.id.includes("$")) {
    fail(`section ${index} id must not contain "." or "$".`);
  }
  return section.id;
}
```

**Then check uniqueness over the resolved ids, not just the supplied ones.** A supplied `s1` on section 0 collides with the derived `s1` on section 1, and that collision is exactly what the rule exists to prevent. Add this immediately after the `spec.sections.map(...)` first pass completes (before the filter-bindings second pass at `:456`):

```js
const ids = new Set();
for (const section of sections) {
  if (ids.has(section.id)) {
    fail(
      `section ids must be unique across the report — "${section.id}" is used more than once.`,
    );
  }
  ids.add(section.id);
}
```

### 2. Omit absent optionals from the output

Add a helper next to `fail`:

```js
// An optional is absent whether it arrived as undefined or as null. A stored
// spec reaches this function through MongoDB, which turns an undefined into a
// null (the driver's ignoreUndefined default is false and nothing in this repo
// sets it), so treating only undefined as absent would make the validator's own
// output invalid input to itself.
const absent = (value) => value === undefined || value === null;
```

Then build each return value key by key, adding an optional only when it is present. **The pattern already exists in this file** — the table-column branch does exactly this (`:249-267`), as does `validateFormat` (`:82-86`). Copy it into:

- **Top level (`:514-518`)** — `const out = { title: spec.title, sections }; if (!absent(spec.description)) out.description = spec.description;` then `return out;`.
- **kpi (`:183-191`)** — drop the `format: … : null` ternary. Build `{ id, type: "kpi", label, query, valueKey, filterBy: section.filterBy ?? [] }` and add `format` only when `!absent(section.format)`, with `validateFormat` applied.
- **filter (`:416-425`)** — build `{ id, type: "filter", control, field, label }` and add `options`, `match` and `optionsQuery` only when each is present. **Keep `match` on every multiselect**: it is defaulted to `"any"` (`:356-357`), and that default is a create-time input that must freeze in the document, not a read-time fallback. On a non-multiselect `match` is never set, so it is simply omitted.
- **chart, table, markdown, download** — no change needed; they emit no optionals. `filterBy: section.filterBy ?? []` stays as it is: `[]` is a present value and re-validates.

The invariant to hold: **no value at any depth of the return value is `null` or `undefined`.** Task 1's test asserts this structurally, which is what stops the next optional field reintroducing the bug.

### 3. Read `null` as absent wherever an optional is read

Replace every `!== undefined` guard on an optional with `!absent(...)`, uniformly rather than special-cased on `description`, so no caller has to learn which fields tolerate a null. This is a **loosening**, which the compatibility rule permits. The sites:

- `spec.description` (`:146`)
- kpi `section.format` (`:179-181`)
- filter `section.options` (`:318`, `:344`, `:369`)
- filter `section.match` (`:356-357` via `??`, and `:363`) — `section.match ?? "any"` already treats null as absent; the `else if (section.match !== undefined)` at `:363` does not
- filter `section.optionsQuery` (`:344`, `:369`, `:381`)
- table column `col.label` (`:250`) and `col.format` (`:261`)
- `validateFormat`'s `format.currency` / `format.locale` / `format.decimals` (`:68-81`) and the corresponding `out` assignments (`:83-85`)
- the options-source check at `:499-500` (`filter.options === undefined && filter.optionsQuery === undefined`) — this reads the **normalized** section, so after change 2 the keys are genuinely absent; use `absent()` anyway so the two halves cannot drift

`section.filterBy ?? []` (`:190, 215, 275`, and `:464, 467, 489`) already handles null.

### 4. Correct the two comments that now describe the old behaviour

- The module docstring (`:38`): "Returns the normalized spec: sections carry positional ids (s0, s1, …)." — rewrite to state that a section's id is preserved when supplied and derived from position otherwise, that ids are unique across the report, and that the function is **idempotent**: validating its own output returns that output, which is what lets the reports store persist it.
- The filter strict-key comment (`:282-287`) currently says `id` "is ignored, not read: the id below is always derived from the section's position." That is where the next reader will go to understand id assignment. Rewrite it to say `id` is now read and checked by `resolveSectionId`, and that it stays on the allowed-key list because a normalized section must be re-validatable.

## Acceptance Criteria

- Extend `plugins/modules-mongodb-plugins/src/analytics/validateReportSpec.test.js` with a round-trip block asserting `validateReportSpec({ spec: validateReportSpec({ spec }) })` deep-equals `validateReportSpec({ spec })` for, at minimum: a kpi **with** and **without** `format`; a chart; a table with a plain column and a formatted column; a `select` filter with declared `options`; a `multiselect` filter with `match` omitted (so the `"any"` default is exercised) and one with `match: "all"`; a `daterange` filter; an `optionsQuery` filter; a markdown section; a download section; a spec **with** and **without** `description`.
- A structural assertion over the same outputs: walking the return value finds **no `null` and no `undefined`** at any depth.
- Id tests: a valid supplied id is preserved; a supplied id is rejected when it is an empty string, a non-string, over `MAX_LABEL_LENGTH`, or contains `.` or `$`; two sections supplying the same id are rejected; a section supplying `s1` alongside a second section whose id derives to `s1` is rejected.
- `pnpm --filter @lowdefy/modules-mongodb-plugins test` passes. Existing `validateReportSpec.test.js`, `querySections.test.js`, `compileReport.test.js` and `compileReport.declared.test.js` assertions that expect `format: null` or `options: undefined` in the output are updated to the absent-key shape — that is the change, not a regression.
- Run tests with the sandbox off: sandboxed, ~19 unrelated `mongodb-memory-server` suites under `src/connections/` fail spuriously.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/validateReportSpec.js` — modify — `resolveSectionId`, the `absent` helper, the uniqueness pass, key-by-key return values in the top level / kpi / filter branches, `absent()` at every optional read, two rewritten comments
- `plugins/modules-mongodb-plugins/src/analytics/validateReportSpec.test.js` — modify — the round-trip block, the no-null/undefined structural assertion, the id checks

## Notes

- **`validateChartSpec.js` needs no change.** Its docstring and `:43` confirm `validateQuery` returns `{ collection: query.collection, pipeline: query.pipeline }` with the pipeline array **unchanged** — which is what keeps the design's safety argument intact: the validator's output carries every pipeline byte-for-byte, nothing is sanitized, and `AnalyticsPipeline` still revalidates per section per viewer on every resolve. The chart branch emits no optionals.
- **`compileReport` needs no change**, and its downstream reads are already safe with an absent optional: `verifyFormatUsable` is `if (!format) return;` (`:393-394`), `if (column.format)` (`:248`), `if (filter.optionsQuery)` (`:324`). One read is `filter.options !== undefined` (`:307`) — that is fine because `compileReport` calls `validateReportSpec` itself at `:424`, so it only ever sees a normalized section.
- **Do not touch `MAX_SECTIONS`, the strict-key lists' membership, or any pipeline check.** The only grammar movement here is a loosening (null reads as absent) plus reading a key that was previously accepted-and-ignored. Tightening anything would retroactively invalidate documents, and there is no migration mechanism in this repo.
