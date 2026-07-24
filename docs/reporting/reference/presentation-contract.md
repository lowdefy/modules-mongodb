---
title: The presentation contract
module: reporting
type: reference
concepts:
  [presentation-contract, charts, kpi, tables, number-format, filter-binding]
---

# The presentation contract

A raw aggregation pipeline has no statically derivable output shape, so every query that feeds a **renderer** — a chart, a KPI tile, a table — is paired with an AI-declared **presentation contract**: the output columns the renderer reads, and how numbers format. The query says _what data_; the contract says _which columns become the axes / value / columns_. CSV exports carry **no** contract — their headers come from the row keys.

The contract is inert display data — length-capped strings, no query grammar, zero security surface. It cannot be checked against the pipeline statically, so it is **verified against the actual result rows** at each render point.

## Contract per renderer

Each query-backed section carries `query: { collection, pipeline }` plus its contract:

| Section    | Contract                                                                          |
| ---------- | --------------------------------------------------------------------------------- |
| `chart`    | `chart: bar\|line\|pie`, `x: column`, `y: [column, …]` (one or more value series) |
| `kpi`      | `valueKey: column` (read from row 0), optional `format`                           |
| `table`    | `columns: [{ key, label?, format? }]`                                             |
| `download` | none — CSV headers are the row keys                                               |

`x` is the category (or pie-item) column; `y` is the value series. A KPI reads `valueKey` out of the first row. Table columns render as plain text; there is no enum-tag styling.

### The `format` descriptor

KPI sections and table columns may declare a number format:

```yaml
format:
  style: decimal | currency # required
  currency: USD # optional (e.g. for style: currency)
  locale: en-US # optional
  decimals: 2 # optional, integer 0–20
```

The agent copies these from the catalog's per-field [display hints](catalog.md#display-hints-are-prompt-material-not-enforcement) so a field formats the same everywhere it appears. When a descriptor omits a field, the renderer defaults to `en-US` / `USD` / 2 decimals. Only the shape is validated — formatting is applied at compile time, never enforced against the data.

## Verification against actual rows

Because the contract can't be checked statically, it is verified once rows are in hand — at turn end for chat charts, and at report-view time for KPI/chart/table sections:

- **Declared columns must exist** in the result (checked against the first row — a pipeline emits a stable row shape).
- **Value columns must be numeric** where present (`y` on a chart, `valueKey` on a KPI). `null` cells are tolerated — a null group key is normal pipeline output.

**Verification applies to non-empty results only.** Zero rows is a legitimate outcome (a filter narrowing to nothing): a chart renders empty, a KPI renders zero, a table renders empty. It is never treated as an error.

When a contract _does_ mismatch the rows (a wrong `x`/`y`/`valueKey`/column key), it is a **rendering** failure, never a safety one:

- **In chat**, the tool fails with an actionable message and the agent self-corrects.
- **In a saved report**, the affected section degrades to a per-section **Alert card** — one bad section never fails the whole report. (Reports persist the _raw_ spec and re-validate each section per viewer at resolve time, which is what contains a failure to a single card.)

## Filter binding

A saved report can carry `filter` sections (`control: select | daterange`) that other sections subscribe to via `filterBy: [field, …]`. At re-query time the server builds a `{ field, op, value }` `$match` and **prepends** it to the section's pipeline, before any other stage.

**Documented limitation: a bound filter field must exist on the base-collection documents — not a post-`$group` or post-`$lookup` alias.** Because the filter `$match` runs first, pre-aggregation, it can only see raw source fields (and this lets it use indexes). Keep filterable fields at the source grain; the agent is prompted to do so. A `select` filter needs an options source — either explicit `options` on the filter section, or enum `values` declared for the field in the catalog.
