---
title: The presentation contract
module: ai-reporting
type: reference
concepts:
  [
    presentation-contract,
    charts,
    kpi,
    tables,
    number-format,
    filter-binding,
    derived-layout,
  ]
---

# The presentation contract

A raw aggregation pipeline has no statically derivable output shape, so every query that feeds a **renderer** — a chart, a KPI tile, a table — is paired with an AI-declared **presentation contract**: the output columns the renderer reads, and how numbers format. The query says _what data_; the contract says _which columns become the axes / value / columns_. CSV exports carry **no** contract — their headers come from the row keys.

The contract is inert display data — length-capped strings, no query grammar, zero security surface. It cannot be checked against the pipeline statically, so it is **verified against the actual result rows** at each render point.

## Contract per renderer

Each query-backed section carries `query: { collection, pipeline }` plus its contract:

| Section    | Contract                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `chart`    | `chart: bar\|line\|pie`, `x: column`, `y: [column, …]` (one or more value series), optional `stacked: true` (bar only) |
| `kpi`      | `valueKey: column` (read from row 0), optional `format`                                                                |
| `table`    | `columns: [{ key, label?, format? }]`                                                                                  |
| `download` | none — CSV headers are the row keys                                                                                    |

`x` is the category (or pie-item) column; `y` is the value series. A KPI reads `valueKey` out of the first row. Table columns render as plain text; there is no enum-tag styling.

**Numeric table columns right-align.** A column carrying a `format` always does. A column without one is right-aligned when every non-empty value in the result is a number — so counts line up with formatted money instead of sitting flush-left beside it. Empty cells are ignored when deciding; a single non-numeric value, or a result with no rows to judge from, leaves the column aligned as text. Alignment never changes the value: an unformatted column still renders raw, since inventing a format would impose decimals and grouping the agent did not ask for.

### Chart appearance is compiled, not authored

The chart contract names columns; it never describes the picture. Axis names, label rotation, grid padding, series colours and pie labels are compiled server-side by the `flint-chart` compiler, from the declared `chart` / `x` / `y` and the actual result rows. Column names are shown humanized — `contact_count` labels its axis `Contact Count`, and legend entries and tooltips read the same way; data values are never altered. The authoring contract is unchanged — the same three keys, with the same meanings, and still no chart-styling vocabulary to learn — but four things about the rendered chart follow from the rows rather than from the spec.

**Ordering is derived, not taken from the pipeline.** A bar chart over plain category labels renders sorted by **value descending**, whatever the pipeline's `$sort` said. Where the x column reads as temporal or otherwise ordered — dates, `2026-01`-style month strings — the rows keep the order they arrived in. A `$sort` in a chart section's pipeline still decides _which_ rows make the chart when a `$limit` follows it; it does not decide the left-to-right order of the bars.

**Height follows content.** A chart's canvas is a constant plot area plus the axis furniture its own labels need, so two charts in one report are rarely the same height, and moving a filter can resize the section it re-queries. The plot itself is never squeezed to fit a frame — a chart of long category names grows instead of cramming. A **pie** is the exception: it has no axis labels to lay out, so it gets a fixed square-ish canvas and fills it — the circle scales with whatever width it is given, so the same pie is larger in a report's full-width column than in the chat panel.

**Multiple `y` columns render as sibling series** — grouped bars, or one line per column — named by the column names, so the legend reads the measures an author declared. The shared y-axis reads `Value`: two differently-named measures share one axis, and either name would be wrong for the other.

**Display names must not collide.** Two columns that humanize to the same name (`total_sales` beside `totalSales`), or an `x` column whose display name is `Measure` or `Value` on a multi-series chart, are rejected with a message naming the rename that fixes it — `$project` the column to another name. Rejecting beats drawing: a collision would silently produce a wrong chart, not an ugly one.

**`stacked: true` stacks a bar chart's series instead.** Grouped is the default because arbitrary `y` columns are unrelated measures whose stacked total means nothing; declare `stacked: true` when the series are parts of a whole — a breakdown such as sales by channel within each region. Bar charts only: on `line` or `pie` it is a validation error, not silently ignored. With a single `y` column it changes nothing (one series stacks with nothing).

**Tooltips are the ECharts defaults.** A compiled chart reaches the browser as JSON, and JSON carries no functions, so the compiler's own tooltip formatter cannot make the trip. Hovering shows the series name and the raw value.

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

## Layout is derived, not authored

A spec carries no widths, no card boundaries and no row breaks — there is no layout vocabulary to author. Placement is derived at **every open**, from three things and nothing else: the section's `type`, its position among adjacent sections of the same type, and the shape of the rows that open's queries returned. None of it is stored, so a report follows its data as that grows rather than keeping the shape the data had the day it was saved.

**Section order is the only channel an author has into layout.** Two charts placed next to each other may pair onto one line; the same two with a section of any other type between them will not. Adjacency is read off the spec exactly as written — a `markdown` section between two charts separates their runs, and so does a `filter`, whose control may be exactly what renders between them.

| A run of…                                | renders as                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `kpi` × n                                | One row of tiles, at most four to a line, balanced so every line is full — five tiles are 3 + 2, not 4 + 1           |
| `chart` needing width                    | Full width, one to a line                                                                                            |
| two adjacent narrow charts               | A pair, half the width each, side by side                                                                            |
| a narrow chart with nothing to pair with | Promoted to full width — never half a line beside an empty half                                                      |
| `table`                                  | Always full width, in **no** card — the grid draws its own frame; columns flex to fill it, whatever the column count  |
| `download` × n                           | **One** card titled _Downloads_, with a button per section                                                           |
| `markdown`                               | Full width, and no card either — prose narrates between the panels rather than sitting in one                        |

Every other section renders in a card, with its label above it. The two that don't are the two that need no frame drawn for them: a grid brings its own border, header band and row rules, and prose belongs on the page plane between the panels.

**A chart needs the full width when its own rows say so** — when the `x` column reads as temporal (dates, `2026-01`-style month strings), when it has more than eight distinct categories, or when it carries more than four `y` series. Past those, half a column stops working: a ninth category label tilts and then collides with its neighbours, and a fifth series funds a legend wider than the plot left beside it. A **pie** never needs the width, however many rows it summarises — it has no axis to label and fills whatever square it is given, so a pie is always a candidate to pair.

A section that failed to resolve reads as needing the width too: its Alert has no business sitting in a half-column hole.

### Pies cap at seven slices

A pie over more than seven rows draws the **top six by value** and folds everything after them into a single `Other`. Past seven, slices are thinner than their own labels and the picture stops being a summary. `Other` is painted a neutral grey and is deliberately **outside** the palette — an aggregate wearing an identity hue reads as one more entity beside the six it stands in for.

### Colours are report-scoped

A series or slice **name** wears one hue across every section of the report that names it: a category is the same colour in the pie and in the stacked bar beside it. The map is decided over the first, unfiltered resolve, so a filter that changes a chart's ranking cannot repaint the series that survive. Eight names get that cross-section stability; names past the eighth are coloured per chart from the slots that chart left unused, so no chart ever repeats a hue within itself. Charts also share one typographic and axis theme, so two charts in one report look like two views of one report.

Nothing here is derived from the consuming app's `colorPrimary`: these are data marks, and a brand hue is not a data hue.

## Verification against actual rows

Because the contract can't be checked statically, it is verified once rows are in hand — at turn end for chat charts, and at report-view time for KPI/chart/table sections:

- **Declared columns must exist in at least one row** — not necessarily the first. A pipeline doesn't guarantee a stable row shape: a conditional `$project`, a `$unionWith` over differing shapes, or a `$group` whose first bucket lacks an optional field can all make row 0 an unreliable sample. A key present in some rows but absent from others is legitimate sparse output (it renders as blank cells); a key absent from every row is the mismatch that fails.
- **Value columns must be numeric** where present (`y` on a chart, `valueKey` on a KPI). `null` cells are tolerated — a null group key is normal pipeline output.

**Verification of a section's result rows applies to non-empty results only.** Zero rows is a legitimate outcome (a filter narrowing to nothing): a chart renders empty, a KPI renders zero, a table renders empty. It is never treated as an error — with one exception: a [filter's options list](#filter-binding) is not a result, and an empty one is a failure, because it's the control the user operates, not an answer to a question.

When a contract _does_ mismatch the rows (a wrong `x`/`y`/`valueKey`/column key), it is a **rendering** failure, never a safety one:

- **In chat**, the tool fails with an actionable message and the agent self-corrects.
- **In a saved report**, the affected section degrades to a per-section **Alert card** — one bad section never fails the whole report. (Reports persist the _raw_ spec and re-validate each section per viewer at resolve time, which is what contains a failure to a single card.)

## Filter binding

A saved report can carry `filter` sections that other sections subscribe to via `filterBy: [field, …]`. At re-query time the server builds one or more `{ field, op, value }` triples from the filter's live value, combines them into a `$match`, and **prepends** it to the section's pipeline, before any other stage.

| Control       | Value shape             | Semantics                                                                                                                |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `select`      | a single value          | equals                                                                                                                   |
| `multiselect` | an array of values      | `match: any` (default) — the field equals any selected value; `match: all` — the field must satisfy every selected value |
| `daterange`   | two bounds (start, end) | the field is between them, inclusive                                                                                     |

`match` only makes sense on `multiselect`; `all` is meant for a field that holds an **array** (every selected value must appear in it). The engine doesn't check the catalog's declared field `type` before choosing the op — catalog types are prompt material for the agent, never enforcement — so `all` on a scalar field is not rejected; it just behaves like "the field equals one of the values, and you happened to pick one," since a scalar can't contain more than one of them at once.

**An empty multi-select means no constraint**, not "match nothing": clearing the control widens the bound sections back to their unfiltered rows, the same as never touching the control at all.

### What a filter group renders

A control does not sit in a top row. It compiles **inline, directly above the first section (in spec order) that subscribes to it** — so a report over three collections shows three groups of controls, each next to what it scopes. Controls anchored above the **same** section share a row, at most three of them, and their widths are balanced so every line the group takes is full.

Each group closes on one line of its own:

- **One shared scope note.** Where the group's controls drive the same set of sections, that scope is stated **once** — `Also filters: {the sections beyond the one the group sits above}` — rather than once per control. A control whose set differs keeps a note of its own beside the shared line, because a shared line cannot speak for it. Where position already answers for every control (each drives only the section it sits above), there is no note at all.
- **A Reset.** It clears the group's controls and returns the sections they drive to the values the report opened with. It runs no query: every bound section falls back to the rows the first resolve inlined, so Reset restores the report **as of the timestamp the header states** rather than as of now — which a fresh query would silently move.

### Options: three sources, in precedence order

A `select` or `multiselect` filter needs a list of options to show. In order:

1. **Declared `options`** — an explicit list the agent types straight into the spec, capped at 50 values.
2. **`optionsQuery`** — the filter section's own query, resolved server-side; its rows become the options, capped at 500.
3. **The field's catalog enum `values`** — the fallback when neither of the above is declared, capped at 50 values.

Only `select` and `multiselect` accept an options source. Either key on a `daterange` is a validation error rather than a silently ignored one: the control shows no list, and an `optionsQuery` there would still cost a query on every report open for rows nothing reads.

`options` and `optionsQuery` are mutually exclusive on one filter section — declaring both is a validation error at save time.

The catalog enum fallback is **role-gated**: a collection the viewer may not query contributes no values. A field's enum `values` are contents of the collection that declares them, so serving them to a viewer refused that collection would route around the gate the pipeline itself passes through.

`optionsQuery: { collection, pipeline, valueKey, labelKey }` is for a filter whose options aren't a short fixed list: a foreign-key filter that should show names rather than ids, a pre-filtered list (only active records), or the distinct values of an array field. It is a query section like any other — it resolves **on every report open**, through the same pipeline validation and per-viewer role gate as any section's `query`. `valueKey` and `labelKey` name the columns the resolved rows are read from ({ label, value } pairs) and are themselves a presentation contract: they're verified against the returned rows the same way a table's `columns` are verified against its result.

**`valueKey` must project a string or a number.** The value round-trips through browser state — it goes out with the compiled options and comes back in the re-query payload — and only scalars survive that trip intact. A `Date` does; an **ObjectId does not**: it arrives at the browser as a bare hex string and, coming back, no longer equals the ObjectId stored in the field. Left unchecked that is the worst kind of failure — a filter listing exactly the right names that matches nothing and reports no error — so a non-scalar `valueKey` is a contract mismatch (below). Project it with `$toString`, and only where the filtered field stores strings too; if the field itself holds ObjectIds, it cannot be filtered this way at all.

### When an options list can't be produced

If `optionsQuery` fails or comes back unusable, the filter's catalog enum `values` are tried as a fallback before giving up — a stale-but-operable control beats an error. Only when that fallback is also unavailable does the control degrade to an **Alert card** in the filter row, naming which of three outcomes occurred:

- **Failed or denied** — the options query couldn't be run (it failed pipeline validation, or the viewer's roles don't allow one of its collections). The report doesn't have the underlying error text to show, so the Alert says the options failed to load rather than guessing at a reason.
- **Contract mismatch** — the query ran, but `valueKey` or `labelKey` isn't a column the rows actually have, or `valueKey` holds something other than a string or number.
- **No rows** — the query ran and matched nothing. An empty options list is a failure here (see [Verification against actual rows](#verification-against-actual-rows)), unlike an empty section result.

The sections that filter is bound to are unaffected: they keep rendering their resolve-time rows and simply never re-query, since the control that would trigger a re-query isn't there.

**Truncation is stated, not silent — whichever source supplied the list.** An options list over its source's cap is sliced, and the control's title gains a suffix naming the cap that cut it: `{label} — first 500` for a query-sourced list, `{label} — first 50` for a declared or cataloged one. A missing option then reads as "the list was cut" rather than "that value doesn't exist."

### Limitations

**A bound filter field must exist on the base-collection documents — not a post-`$group` or post-`$lookup` alias.** Because the filter `$match` runs first, pre-aggregation, it can only see raw source fields (and this lets it use indexes). Keep filterable fields at the source grain; the agent is prompted to do so.

**A bound filter matches documents, not array elements.** The `$match` it prepends selects whole documents whose field satisfies the filter — it does not reach inside an array to drop the elements that don't. A section that `$unwind`s a filtered array field will still include every element of a matching document, selected ones and unselected ones alike. Bind array-field filters on sections that count or aggregate at the **document** grain; when a section must group by the array element itself, prefer a catalogued view at the unwound grain (see [Reporting over complex data](../how-to/complex-data.md)) so the filter's document-level match lines up with the section's per-element rows.
