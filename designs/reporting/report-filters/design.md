# Report filters: multi-select, array fields, and looked-up options

Saved reports carry `filter` sections that other sections subscribe to via `filterBy`. Today a filter is either a `daterange` or a single-value `select` whose options must be literal scalars the agent typed into the spec or enum `values` the catalog declares for the field. That covers "one region, one month" and nothing else: a user cannot pick three regions, cannot filter on a field that holds an array (tags, `company_ids`, assignees), and cannot filter by a foreign key without reading raw ids out of a dropdown. This design adds a `multiselect` control with explicit any/all semantics over both scalar and array fields, and a query-sourced options list with a label contract, so a filter can offer human-readable values pulled from another collection.

It follows the [open query engine](../open-query-engine/design.md) design, whose [filter-binding decision](../open-query-engine/design.md#filter-binding-server-built-match-prepended-to-the-pipeline) this extends — the server still builds the `$match` from fixed `{ field, op, value }` triples and still prepends it. No new security boundary is introduced and nothing here widens _what_ the agent may query. One cap does move: `MAX_ARRAY_LITERAL_LENGTH` goes from 100 to 500 so that a full multi-select selection fits inside one `$in` — a quantitative widening of pipeline text, argued and accepted below.

> **Implemented.** This design shipped in the `reporting` module —
> `multiselect`, `match: any | all`, and query-sourced `optionsQuery` options
> are live (`plugins/modules-mongodb-plugins/src/analytics/`). `docs/reporting/`
> is the source of truth for consumer-observable behaviour; this file records
> the rationale.

## Proposed change

1. Add **`multiselect`** to `FILTER_CONTROLS`, compiling to the `MultipleSelector` block. Its state value is an array of the chosen option values.
2. Add **`match: any | all`** to a `multiselect` filter section (default `any`), selecting between two new filter-triple ops: `in → $in` (match documents carrying any of the chosen values) and `all → $all` (match documents carrying all of them). Both operators are already in `ALLOWED_MATCH_OPERATORS`; neither needs `$expr`.
3. Treat an **empty array as "no constraint"** in `buildFilterMatch`, alongside the existing null/undefined drop. `MultipleSelector` sets `[]` — never null — when its last tag is removed, so this is the ordinary cleared state, not an edge case.
4. Add **`optionsQuery: { collection, pipeline, valueKey, labelKey }`** to a filter section: a catalog-validated, role-checked pipeline whose rows become `{ label, value }` options, resolved on every report open. This is what makes a foreign-key filter possible — `value` is the id the `$match` compares, `label` is what the user reads.
5. Run those options queries through the **existing resolve loop**: `querySections` returns them alongside the data-section queries, so `resolve-report`'s `:for` / `:try` / `AnalyticsPipeline` loop validates and executes them with no new endpoint and no new routine step. One exported helper computes the ordered query list for both `querySections` and `compileReport`, so their index alignment is structural rather than duplicated.
6. **Degrade a failed, mis-declared or empty options query to a per-filter Alert** in the filter row, leaving the rest of the report — including the sections bound to that filter — rendering normally with their unfiltered resolve-time rows. `valueKey`/`labelKey` are a presentation contract and get verified against the returned rows like every other one.
7. Raise the options cap for query-sourced lists (`MAX_QUERY_FILTER_OPTIONS = 500`, separate from the agent-typed `MAX_FILTER_OPTIONS = 50`), **raise `MAX_ARRAY_LITERAL_LENGTH` to the same 500** so a full selection cannot outrun the validator, and **say so in the control's title when the list is truncated**, the way a table heading already says "first 1000 rows".
8. Teach the agent the new vocabulary in `reporting-assistant.yaml`, and document the one real limitation: **a bound filter matches documents, not array elements.**

## Why this, and why now

The [wireframe deck](#related) put the filter picker in the save-report sheet, which forced the question of what a filter can actually offer. Three of the four filters a reviewer would expect on a realistic report are unbuildable today: several regions at once, a tag from an array field, and a company by name. The first two are one control and two operators; the third needs an options source that isn't a literal list. All three land in the same files and the same section of the spec, so splitting them into separate changes would mean touching `validateReportSpec`, `compileReport`, and the agent instructions twice.

The demo already contains the array case in production shape — `demo_activities.company_ids` and `demo_contacts.global_attributes.company_ids` are scalar FK arrays with `relationships` pointing at `demo_companies` — so the array-field filter and the looked-up-label filter are the _same_ demo consumer, and neither needs new seed data.

## Current state

- `plugins/modules-mongodb-plugins/src/analytics/constants.js` — `FILTER_CONTROLS = ["select", "daterange"]` (:17), `MAX_FILTER_OPTIONS = 50` (:14), `MAX_ARRAY_LITERAL_LENGTH = MAX_IN_VALUES` (100).
- `validateReportSpec.js` — the `filter` branch checks `control` against `FILTER_CONTROLS`, requires a non-`$`-prefixed `field`, and accepts an optional `options` array of at most 50 strings/numbers. A second pass requires distinct filter fields, requires every filter to be bound by at least one section, and (validate-before-persist only) requires a `select` to have an options source.
- `compileReport.js` — `filterStateKey(field)` → `filter_${field}` (block id doubles as the state key); `boundFilters()` emits `gte`/`lte` triples for `daterange` and a single `eq` triple otherwise; `filterOptions()` returns declared `options` or `catalogFieldValues(...)`, sliced to 50; the `filter` branch emits `DateRangeSelector` or `Selector` with `allowClear: true`.
- `AnalyticsPipeline.js` — `const FILTER_OPS = { eq: "$eq", gte: "$gte", lte: "$lte" }`; `buildFilterMatch()` drops null/undefined values, throws on an unmapped op, and returns one `$match` with `$and`.
- `querySections.js` — returns `{ id, type, query }` for `kpi`/`chart`/`table` sections in spec order; `compileReport` recomputes the same filtered list to align the resolver's `:for` step results index-for-index.
- `validatePipeline.js` — `walkOperatorDocument` already handles `$in`/`$nin`/`$all`: array-operand type check, `MAX_ARRAY_LITERAL_LENGTH` cap, and each element through `copyQueryLiteral`, which rejects `$`-prefixed keys inside literal match values.
- `modules/reporting/agents/reporting-assistant.yaml` (:131-143) — the filter section contract and the base-collection-field rule.
- `docs/reporting/reference/presentation-contract.md` — the consumer-facing filter-binding section.
- `apps/demo/api/reporting-seed-example-report.yaml` — one `select` filter on `demo_orders.region` bound to three sections, all over `demo_orders`.

## Key decisions and rationale

### `multiselect` is a control, not a new section type

A filter section already carries `control`, and `daterange` already proves that a control can change both the block emitted and the shape of the triples produced. Multi-select is the same kind of variation — same field binding, same state key, same re-query actions — so it belongs in `FILTER_CONTROLS` rather than in a parallel concept. The alternative (a boolean `multiple: true` on `select`) splits one decision across two keys and makes `FILTER_CONTROLS` no longer describe the set of controls.

### `any` / `all` is the filter's declaration, not an inference from the field's type

For a scalar field, "several chosen values" can only mean _any of them_. For an array field it is genuinely ambiguous — "activities for companies A **or** B" and "actions tagged both urgent **and** blocked" are both ordinary requests — and nothing in the query can disambiguate it. So the spec carries `match: any | all`, defaulting to `any` (the meaning that also holds for scalars, so the default is never surprising).

`match` is **not** validated against the catalog's `type: array`. Catalog types are prompt material, not enforcement — the docs are explicit that display hints and types are never enforced by the engine — so gating on them would let a missing or wrong `type` reject a legitimate report. `$all` on a scalar field is harmless anyway: it matches when exactly one value is chosen.

Not enforced does not mean not stated. Because the catalog type is the only signal that distinguishes a sensible `all` from a confusing one, the rule lives where the authoring happens: the agent instructions say to use `match: all` only on a field the catalog declares `type: array`. That is the operative mitigation today, the agent being the sole author of specs until the save sheet exists; the sheet then withholds the toggle on scalar fields as a second layer, using the same catalog type as a _UI hint_.

`match` on a `select` or `daterange` section **is** rejected with an actionable message. It is not harmful, but it means the agent believed it had asked for something the control cannot express, and the message is how it learns the vocabulary.

That rejection is not written as its own check. The filter branch gets the treatment table columns already have — an **allowed-key list**, `type, label, control, field, options, match, optionsQuery`, with anything else rejected and the list named in the message. `match` on the wrong control is then one conditional on top of a rule that already exists, rather than the only key-shape rule on a branch that tolerates every other extra key. It also catches what the one-off check cannot: `optionsquery`, `optionQuery` or `labelkey` are silently dropped today, and a dropped options source produces a filter with no options rather than an error. The list deliberately excludes `id` — the validator assigns `s{index}` itself — and matches the key set the agent instructions already state for a filter section, so strictness enforces the documented contract rather than adding one.

### `$in` and `$all`, not `$expr` + `$setIntersection`

`$in` needs no array special case: `{ tags: { $in: ["urgent", "blocked"] } }` matches a document whose `tags` array _contains_ either value, by the same multikey rule that makes it match a scalar `tags` equal to either. One op covers both field shapes.

For `all`, the natural instinct is `$expr` with a set intersection:

```js
{
  $expr: {
    $eq: [{ $size: { $setIntersection: ["$tags", ["urgent", "blocked"]] } }, 2];
  }
}
// vs.
{
  tags: {
    $all: ["urgent", "blocked"];
  }
}
```

`$all` is chosen for three reasons:

1. **It can use an index.** The filter `$match` is prepended _specifically_ so it runs pre-aggregation against raw source fields where an index applies — that is the stated rationale for the documented "no post-`$group` alias" limitation. `$expr` with `$setIntersection` forfeits exactly the property the leading position was bought for.
2. **`$setIntersection` errors on non-arrays.** All of its operands must be arrays, so a single document where the field is missing, null, or scalar fails the whole aggregation rather than simply not matching. Making it safe means wrapping the field in an `$isArray`/`$ifNull` guard, which turns the ordinary case into a special case. `$in` and `$all` are type-tolerant by construction.
3. **It keeps the triple flat.** `buildFilterMatch` emits `{ [field]: { [mongoOp]: value } }`. `$expr` would make it emit expression trees whose shape depends on the op — a second code path in the one function that turns untrusted client input into a query.

Both operators are already in `ALLOWED_MATCH_OPERATORS`, so the built stage passes the same walk it does today.

### The connection needs no new value validation — the walk already covers it

The obvious-looking addition is a type check on the array value in `buildFilterMatch`. It would be redundant. Because the built `$match` goes through `validatePipeline` like any other stage, `walkOperatorDocument` already rejects a non-array operand for `$in`/`$all` with an actionable message, caps the array at `MAX_ARRAY_LITERAL_LENGTH`, and passes every element through `copyQueryLiteral`, which rejects `$`-prefixed keys inside literal match values and rebuilds regexes. A second cap at the filter layer could only fire on a hand-crafted payload — the UI cannot select more values than the options offered — where the validator's message is already the right answer.

What the walk cannot know is _intent_, which is why the empty-array drop below is the one genuinely new check.

This argument only holds while **the options cap stays at or below the array-literal cap**, and that is what forces the second half of proposal 7. A 500-option dropdown over a 100-element array cap means an ordinary selection of 101 companies is rejected by the gate — and rejected _quietly_, because the re-query is a `CallAPI` followed by a `SetState`: the failed call aborts the chain before the `SetState`, so the bound sections keep their previous rows and the report reads as stale rather than broken. Nothing in the UI prevents it either; `MultipleSelector` exposes `maxTagCount` (a cap on rendered tags) and no selection-count property. So the two numbers are one decision, and the invariant belongs in a comment on **both** constants — the next person to raise one will otherwise reintroduce this.

### Raising `MAX_ARRAY_LITERAL_LENGTH` to 500

The two ways to line the caps up are capping options at 100 or raising the array-literal cap to 500. The cap is raised, because 100 companies is not a company list and the cap does not defend against the thing its name suggests.

`MAX_ARRAY_LITERAL_LENGTH` is validator self-protection — it bounds _what can be written into_ a pipeline, not what a pipeline produces. Its own comment makes the point: `{ $range: [0, 500000] }` is three tokens and half a million elements, and output volume is bounded at execution by `MAX_RESULT_BYTES` and `PIPELINE_RESULT_CAP`, not here. So raising it five-fold widens the amount of _literal text_ the agent may type, and moves no data-volume boundary.

That text is bounded twice over by caps that do not change:

- **Serialized size** — `MAX_PIPELINE_BYTES` is 100 000. Five hundred ObjectId strings are roughly 14 KB, about a seventh of the budget, and the check runs before the walker recurses.
- **Node count** — `MAX_PIPELINE_NODES` is 10 000 and each element costs one node (`copyQueryLiteral` calls `countNode` per element), so a full 500-element list spends 5% of the pipeline's budget.

Per-element scrutiny is unchanged: every element still passes `copyQueryLiteral`, which rejects `$`-prefixed keys inside literal match values and rebuilds regexes. At execution a 500-point `$in` on an indexed field is 500 index seeks under the same `maxTimeMS` as any other query — linear, not quadratic. The scoped alternative — a higher cap for the server-built filter `$match` only — is rejected for the same reason `$expr` was: it means the walker treating one stage's provenance differently from every other, a second path through the one function that turns untrusted client input into a query.

`MAX_IN_VALUES = 100` goes away with the raise. It has no consumer other than the `MAX_ARRAY_LITERAL_LENGTH = MAX_IN_VALUES` alias it feeds, and leaving it behind would put a constant in `constants.js` that names a limit the engine no longer enforces.

### An empty array means "no constraint", uniformly

`$in: []` matches nothing. Without a drop, clearing a multi-select would blank every section bound to it instead of widening back to everything — the exact opposite of what removing a filter means. This is the ordinary cleared state, not a corner case: `MultipleSelector`'s `onChange` always calls `setValue` with an array, so removing the last tag (or pressing the clear button) sets `[]`, never null, and the existing null branch never sees it.

The drop is applied to **any** empty-array value, not only to `in`/`all`. No control can produce an empty array for `eq` or a range bound, so the uniform rule loses no expressible query and is one line instead of a per-op branch.

### Query-sourced options: `optionsQuery` carries its own contract

A foreign-key filter is blocked three ways today: options must be scalars (so a value cannot carry a label), they are capped at 50, and they are frozen into the spec at save time. `optionsQuery` addresses all three:

```yaml
- type: filter
  control: multiselect
  field: company_ids
  label: Companies
  match: any
  optionsQuery:
    collection: demo_companies
    pipeline:
      - $project: { company_id: "$_id", name: 1 }
      - $sort: { name: 1 }
    valueKey: company_id
    labelKey: name
```

`{ collection, pipeline }` plus the columns a renderer reads is exactly the section shape, so `optionsQuery` reuses it one level down: `validateQuery` validates the query half (and ignores the extra keys, as it already returns only `{ collection, pipeline }`), and `valueKey`/`labelKey` are validated as ordinary contract strings. Because that return is only the two query keys, the contract keys are re-attached to the normalized section rather than assumed to survive it — the trap `Files changed` spells out. Keeping them inside `optionsQuery` rather than as siblings on the section means the query and the contract that reads it cannot be separated.

Options precedence becomes: declared `options` → `optionsQuery` rows → catalog enum `values`. Declaring **both** `options` and `optionsQuery` is rejected — two sources for one list is an agent mistake, not a merge. Declaring either on a `daterange` is rejected too, for the same reason `match` is rejected off a `multiselect`: a `daterange` shows no list, so the key is inert to `compileReport` — but an `optionsQuery` there is worse than inert, because `querySections` would still run it on every report open for rows nothing reads.

The catalog fallback is **role-gated**, and this is a correctness point rather than a nicety. A field's enum `values` are contents of the collection that declares them, and `catalogFieldValues` originally consulted the catalog without reference to the viewer's roles — safe enough at save time, where any bound section over an unreadable collection has already failed `validatePipeline`, but not at compile time, where `compileReport` deliberately validates **without** a catalog so one inaccessible section stays one Alert. On that path the fallback is reached precisely when the options query was _denied_, so a viewer refused a collection would have been handed its cataloged values in exchange. The lookup now applies the same union-of-roles rule `validatePipeline`'s `checkCollectionAccess` applies (absent or empty `roles` means any authenticated user), which also closes the same gap on the pre-existing `select`-filter fallback.

The alternative shape is declarative — `optionsFrom: { collection, valueField, labelField }`, compiled server-side into a fixed `$project`/`$sort`, the same posture `buildFilterMatch` takes with the filter `$match`. It is rejected because two ordinary option lists fall outside it: a **pre-filtered** list (companies excluding test accounts, or only those with activity) and a **distinct-value** list over an array field (`$unwind` + `$group` on `tags`, which is the only options source for a field the catalog declares no enum `values` for). Neither is expressible as a collection plus two field names, and both are ordinary pipelines. Since a pipeline subsumes the declarative form and reuses `validateQuery` unchanged, there is one shape rather than two.

Both `Selector` and `MultipleSelector` already default `showSearch` to true and filter on the rendered label, so a long list is searchable without a new property.

### Two authors: the agent writes the pipeline, the sheet derives it

`optionsQuery` holds a pipeline, but that does not make the agent its only author. The [UX design](../ux/design.md) routes report creation through a save-report confirm sheet whose filter picker offers catalog-derived fields (its proposal 8), and a sheet cannot author an aggregation pipeline. It does not have to: for the case the picker actually covers — a filter on a field the catalog declares a `relationships` entry for — the pipeline is derivable.

A relationship declares `{ field, collection, foreignField }`. That gives the sheet the target collection and the id column, so `valueKey` is `foreignField`. What it does **not** give is a label: the catalog carries no label field on a relationship, so nothing in it says `name` is what a human reads on `demo_companies`. The sheet therefore asks — it lists the target collection's `type: string` fields and the user picks one, which becomes `labelKey`. From those three values the sheet emits the same `optionsQuery` the agent would write, projecting the two columns and sorting by the label.

So the wire format has one shape and two authors: the agent writes pipelines freely (pre-filtered lists, distinct values over an array field, composed labels), and the sheet writes the derivable subset. Extending the catalog with a per-relationship label field would let the sheet skip the question, which is worth considering when a real app's picker feels tedious; it is not needed to make the picker implementable, so it stays out of scope here.

### Options queries run through the existing resolve loop

`resolve-report` already iterates `querySections` with `:for`, runs each entry's `AnalyticsPipeline` inside `:try`, and hands the sparse step array to `compileReport`. An options query is a catalog-validated pipeline that must be role-checked for the _viewing_ user, which is precisely what that loop provides — so `querySections` returns filter-options entries alongside the data sections, and **the routine does not change at all**.

This makes the index alignment between `querySections` and `compileReport` load-bearing in a second place. Today both compute `sections.filter(s => ["kpi","chart","table"].includes(s.type))` independently and rely on the two expressions staying identical. With two entry kinds that is a latent bug, so the ordered list moves into one exported helper both import — mechanical alignment instead of a convention two files must remember.

### A failed options query degrades the filter, not the report

If the options query cannot produce a usable list, and no fallback source exists, the filter block is replaced by an **Alert in the filter row**. Its bound sections still render with their resolve-time rows; they simply never re-query. This is the same containment the design already applies to a failed data section (one Alert card, not a whole-report error), and it is the honest outcome: a control with an empty dropdown looks broken and teaches nothing, and one that silently disappears makes the report look like it never had that filter.

There are three ways to land there, and each gets its own description — one message covering all of them would misdescribe two:

| Outcome                                                                                        | Alert description                                               |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Query failed validation or was denied by the viewer's roles                                    | Options failed to load (see the note below)                     |
| Rows returned, but `valueKey`/`labelKey` name absent columns, or `valueKey` holds a non-scalar | The verifier's message, naming the columns the query did return |
| Query succeeded and returned no rows                                                           | No options available                                            |

**The gate's message does not reach the Alert.** The first row originally promised it; implementation showed it cannot be delivered. `resolve-report`'s `:catch` only logs, so a denied or invalid options query reaches `compileReport` as a _sparse step entry_ carrying no error text, and the compiler has no way to recover one. The implementation emits an honest failed-to-load description instead. It cannot be otherwise from config: `controlTry` runs `:catch` as a plain routine and discards the error — there is no `_error` operator — and no control writes a step result, so a `:catch` could only echo a constant the config already knows. Delivering the real message would mean `AnalyticsPipeline` returning an error marker instead of throwing, which changes the failure shape for _every_ section rather than filters.

That is a reason to keep the generic description, not only a limitation: these are gate messages, and a validation or catalog error names collections, fields and roles. Telling a viewer who was **denied** which collection they missed and which role they'd need inverts the boundary the catalog exists to hold. The failure stays diagnosable where it belongs — the routine's `:catch` logs the report id, section id, section type (`filter` distinguishing an options query from a data section) and collection, server-side.

The third row is the engine's first case where zero rows is a failure, against a rule the docs state without exception ("zero rows … is never treated as an error"). It is a boundary that rule never drew rather than a contradiction of it: the rule governs a section's _result_ rows, where empty means "nothing matched" — information. An options list is not a result, it is the control the user operates, and an empty one cannot be operated. `docs/` says the rule absolutely, so the docs rewrite has to scope it; see _Files changed_.

The middle row is the one the design would otherwise miss, and it is the only silent failure of the three. `valueKey`/`labelKey` are a presentation contract exactly like a chart's `x`/`y` or a table's column keys, and the engine's rule is that a raw pipeline's output shape is confirmed against actual rows rather than assumed — so `verifyContract.js` gains a fourth export, `verifyFilterOptionsContract({ valueKey, labelKey, rows })`, which is `requireKeys(rows, [valueKey, labelKey], "Filter options contract")`. Its throw routes into the Alert path the same way `verifySection` already routes a chart or table mismatch. Without it, `filterOptions` builds `{ label: undefined, value: undefined }` rows: the user gets a dropdown of blanks, selects some, and `buildFilterMatch` drops every `undefined` — a filter that visibly does nothing. `requireKeys` skips empty results by design, so the contract check and the zero-rows outcome stay independent.

The contract also has to check the value's **type**, not only its presence, and this is the sharper half of the row. An option value is the one piece of a compiled report that makes a round trip: it goes out with the options, sits in browser state, and comes back in the re-query payload before reaching the filter `$match`. Only scalars survive that intact — Lowdefy's serializer preserves a `Date` (a `~d` marker) but reduces an `ObjectId` to a bare hex **string**, which then never equals the `ObjectId` stored in the field. `optionsQuery` is the first options source that can carry a non-scalar at all: declared `options` are validated as `string | number` and catalog `values` come from YAML. So without a type check, `valueKey: _id` on an ObjectId-keyed collection — the default shape of most collections — yields a filter that lists exactly the right names, matches nothing, and reports no error anywhere. `verifyFilterOptionsContract` therefore adds a `requireScalar` pass over `valueKey` (mirroring the existing `requireNumeric` for chart/KPI values, null-tolerant for the same reason), and the message names the fix: project it with `$toString`, and only where the filtered field stores strings too. `labelKey` is deliberately left alone — a non-scalar label renders oddly at worst and never breaks the match.

### Truncation is stated, not silent

Query-sourced options get their own cap, `MAX_QUERY_FILTER_OPTIONS = 500`. The existing 50 bounds what the _agent types into a persisted spec_ (a payload-size concern); query-sourced options are resolved server-side per open and already bounded by `PIPELINE_RESULT_CAP`, so the same number is needlessly tight — 50 companies is not a company list. When rows exceed the cap the list is sliced **and the control's title says so** (`Companies — first 500`), reusing the pattern `sectionHeading` already uses for a table that lands on the row cap. A dropdown silently missing the company someone is looking for is indistinguishable from that company not existing.

That reason has nothing to do with where the list came from, so the notice is not scoped to the query path: **every** source runs through one capping helper that reports the cap that cut it, and the title carries that number (`— first 500` for a query, `— first 50` for a declared or cataloged list). A 60-value catalog enum losing ten values silently is the same failure the notice exists to prevent, and stating it for one source while hiding it for another is the harder rule to keep.

The relationship between the two caps and `MAX_ARRAY_LITERAL_LENGTH` is arithmetic, so it is asserted in a test rather than left to the comment beside each constant: a full selection compiles to one `$in`/`$all` operand, and if the options cap ever exceeded the array-literal cap an ordinary selection would be rejected — silently, since the failed `CallAPI` aborts before its `SetState` and the bound sections keep stale rows. A second assertion keeps `MAX_QUERY_FILTER_OPTIONS` under `PIPELINE_RESULT_CAP`, without which the truncation notice above could never fire and the cap would be decoration.

An options set genuinely too large for one dropdown wants an autocomplete (`MultipleSelector` already exposes `onSearch`). That is a separate design, and it earns its complexity when a real case appears.

### Documented limitation: a bound filter matches documents, not array elements

The filter `$match` is prepended, so it constrains **documents**. A section that `$unwind`s the same array and groups by it will therefore include the unselected elements of matching documents: filtering tags to `urgent, blocked` keeps every document carrying either, and the unwind then emits _all_ of their tags, so the chart shows bars for tags nobody selected.

This is documented rather than fixed. Filtering elements would mean inserting the `$match` _after_ the unwind, which prepend-only cannot express, and the fix that suggests itself — "if the pipeline's first stage unwinds the bound field, insert after it" — is a positional special case that also loses the index. The agent is prompted instead: bind an array-field filter on sections that count or aggregate documents, and prefer a catalogued view at the unwound grain when a section needs to group by the element itself (the pattern `docs/reporting/how-to/complex-data.md` already describes, and which `demo_contact_companies` already demonstrates).

## Wire format

Additions to the `filter` section, all optional except `control`'s new value:

| Key            | Type                                           | Meaning                                                                    |
| -------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `control`      | `select \| multiselect \| daterange`           | `multiselect` is new; state value is an array.                             |
| `match`        | `any \| all` (default `any`)                   | `multiselect` only. Selects `$in` or `$all`. Rejected on other controls.   |
| `optionsQuery` | `{ collection, pipeline, valueKey, labelKey }` | Rows become `{ label, value }` options. Mutually exclusive with `options`. |

Triples emitted by `boundFilters`, unchanged except for the new row:

| Control       | Triples                                                              |
| ------------- | -------------------------------------------------------------------- |
| `daterange`   | `{ field, op: gte, value: __state key.0 }`, `{ … op: lte, … key.1 }` |
| `select`      | `{ field, op: eq, value: __state key }`                              |
| `multiselect` | `{ field, op: in \| all, value: __state key }`                       |

`FILTER_OPS` becomes `{ eq: "$eq", gte: "$gte", lte: "$lte", in: "$in", all: "$all" }` — still a fixed, default-deny map. The op vocabulary is named after the Mongo operators it maps to, which is why `match: any` emits `op: in` rather than `op: any`: the spec's `match` is the author's intent, the triple's `op` is the query it compiles to. Triples are server-built and never appear in the spec, so the agent only ever sees `any | all`.

## Architecture / data flow

1. `generate_report` → `validateReportSpec` (with catalog): the filter section's keys are checked against the allowed list, then its `control`, `match`, `options`/`optionsQuery` exclusivity, and the `optionsQuery` pipeline are validated; the pipeline is walked against the catalog with the _saving_ user's roles.
2. Report open → `resolve-report` → `querySections` returns data-section queries **and** filter-options queries in one ordered list; the existing `:for` / `:try` loop runs each through `AnalyticsPipeline` with the _viewing_ user's roles.
3. `compileReport` maps the sparse results back by the same shared ordered list: data sections render or degrade as today; a filter's rows are verified against `valueKey`/`labelKey` and become `{ label, value }` options, or the filter degrades to an Alert naming which of the three outcomes occurred.
4. User changes a control → `onChange` re-query: `CallAPI` to `query-data` with `{ query, filters: [{ field, op, value }] }`, values resolved from live page state.
5. `buildFilterMatch` drops null/undefined **and empty-array** values, maps the op through `FILTER_OPS`, and prepends one `$match` with `$and`.
6. `validatePipeline` walks the combined pipeline — including the built `$match` — rejecting operator-shaped fields, over-length `$in`/`$all` arrays, and `$`-prefixed keys in literal values.

## Files changed (anticipated)

- `plugins/modules-mongodb-plugins/src/analytics/constants.js` — `FILTER_CONTROLS` gains `multiselect`; new `FILTER_MATCH_MODES = ["any", "all"]` and `MAX_QUERY_FILTER_OPTIONS = 500`; `MAX_ARRAY_LITERAL_LENGTH` becomes `500` outright and the now-unused `MAX_IN_VALUES` alias is deleted. Both caps carry a comment naming the invariant that ties them together (`MAX_QUERY_FILTER_OPTIONS ≤ MAX_ARRAY_LITERAL_LENGTH`, because a full selection becomes one `$in` operand).
- `validateReportSpec.js` — the `filter` branch gains an allowed-key check on the section (`type, label, control, field, options, match, optionsQuery`, the same pattern as table columns) and validates `match` (allowed only on `multiselect`), `optionsQuery` (via `validateQuery` plus `valueKey`/`labelKey` string checks), and `options`/`optionsQuery` exclusivity; the second pass's "a select needs an options source" check extends to `multiselect` and accepts `optionsQuery` as a source. The **normalized** filter section must carry `match` and `optionsQuery` forward explicitly — the branch returns a fixed key set today, and `compileReport` reads the normalized spec, not the raw one. `validateQuery` returns only `{ collection, pipeline }`, so `valueKey`/`labelKey` have to be re-attached rather than assumed to survive it: dropping them yields a dropdown of blank options, and dropping `match` silently downgrades every `all` filter to `any` — neither fails at validation time.
- `querySections.js` — export the shared ordered-query-list helper; include filter sections that carry an `optionsQuery`.
- `verifyContract.js` — new `verifyFilterOptionsContract({ valueKey, labelKey, rows })`, one `requireKeys` call alongside the chart/KPI/table exports.
- `compileReport.js` — import that helper instead of recomputing the list; `boundFilters` emits the `in`/`all` triple; `filterOptions` gains the `optionsQuery` branch (contract verification, rows → `{ label, value }`, cap + title truncation note); the `filter` branch emits `MultipleSelector`; a filter with no resolvable options emits an Alert whose description names which outcome occurred.
- `AnalyticsPipeline.js` — `FILTER_OPS` gains `in`/`all`; `buildFilterMatch` drops empty arrays alongside null.
- `modules/reporting/pages/report.yaml` — `MultipleSelector` added to the report `Dynamic` block's `properties.types.blocks`. Not optional: `Dynamic` validates every type in the resolved output against that closed list and an undeclared one drops the **whole** report to the fallback slot rather than degrading a section — the failure mode that once 404'd every report carrying a formatted table column, because `_intl` was declared nowhere.
- Tests — `validateReportSpec.test.js` (new control, the allowed-key rejection including a misspelled `optionsquery`, `match` placement, `optionsQuery` shape, exclusivity, options-source check), `verifyContract.test.js` (the options contract: both keys present, either key absent, empty rows skipped), `compileReport.test.js` (block type, triple shape per control, `{label,value}` options, cap + truncation title, Alert degradation for each of the three outcomes, index alignment with a filter-options entry interleaved between data sections, and a **dotted filter field** — `global_attributes.company_ids` emits the block id `filter_global_attributes.company_ids`, i.e. a nested state path, and the triple's `__state` reference must read back the same key. Nested array foreign keys are the case query-sourced options exist for, so the compiler's handling of them is asserted rather than assumed; the mechanic itself is established — `modules/contacts` already binds a `TextArea` to the id `global_attributes.internal_details`), `compileReport.declared.test.js` (the existing guard that everything the compiler can emit is declared on the `Dynamic` block — it fails if `MultipleSelector` is missing from `report.yaml`), and an `AnalyticsPipeline` case per op plus the empty-array drop. `validatePipeline.test.js` needs no number change — its over-length case derives from `MAX_ARRAY_LITERAL_LENGTH` — but gains one case proving a full 500-value `$in` clears the byte and node budgets rather than merely the length check.
- `modules/reporting/agents/reporting-assistant.yaml` — the filter contract gains `control: select|multiselect|daterange`, `match`, and `optionsQuery`; instructions state the document-not-element limitation and when to prefer a view at the unwound grain, and that `match: all` belongs only on a field the catalog declares `type: array` (the engine deliberately does not enforce this, so the instruction is the mitigation).
- `modules/reporting/api/query-data.yaml` — the `filters` payload description mentions array values (the schema itself already accepts `value: {}`).
- `docs/reporting/reference/presentation-contract.md` — rewrite the filter-binding section for the three controls, any/all, the options sources and their precedence, the caps, and the document-not-element limitation. The **verification** section also needs two corrections: scope its absolute "zero rows is never an error" rule to a section's _result_ rows and name the options list as the one place where empty is a failure (with the reason — an options list is the control, not an answer), and fix "checked against the first row" to _at least one row_, which is what `verifyContract.js` actually does and why (`$project` conditionals and `$unionWith` make row 0 an unreliable sample).
- `apps/demo/api/reporting-seed-example-report.yaml` — the demo report gains the filters below.

## Demo consumer

The seeded example report (`reporting-seed-example-report.yaml`) today carries one `select` filter on `demo_orders.region` and three data sections, all over `demo_orders`. It gains all three controls, over collections that already exist — no new seed data:

1. **Region** — the existing filter, changed to `multiselect`. Options still come from the catalog's enum `values`. The scalar multi-select case, no options query.
2. **Created** — a `daterange` on `demo_orders.order_date`, bound to the same three sections, so the report shows a range and a multi-select side by side.
3. **Companies** — `multiselect` over `demo_activities.company_ids` (an array field) with `match: any`, options from an `optionsQuery` over `demo_companies` projecting `_id` → value and `name` → label. Covers array matching _and_ looked-up labels in one control.

Because a filter must be bound by a section whose base collection carries the field, the Companies filter needs an activities-grain section: the report gains a KPI or table over `demo_activities` (or `demo_activities_report`) counting activities per type. Counting documents rather than unwinding `company_ids` is exactly the documented rule in practice — the demo therefore also demonstrates the workaround, not just the capability.

**How this is verified.** A report's blocks are compiled per request by `resolve-report` (`_analytics` is a server operator), so they never appear in the build artifact — `ldf:b` cannot see the emitted `MultipleSelector`, the `{ label, value }` options or the `in`/`all` triples. Each half needs the tool that can actually reach it:

- `compileReport.test.js` — the emitted block type per control, the triple shape per control, `{ label, value }` options, the cap and its truncation title, Alert degradation per outcome, a dotted filter field's nested state key, and results alignment with a filter-options entry interleaved between data sections.
- `compileReport.declared.test.js` — that `MultipleSelector` is declared on the report page's `Dynamic` block.
- `verifyContract.test.js` — the options contract against its rows, which is what turns a mis-declared `valueKey`/`labelKey` into an Alert instead of a dropdown of blanks.
- `validateReportSpec.test.js` — the new validation, including the allowed-key rejection. The demo cannot cover this side: the seed inserts the spec raw and deliberately skips `validateReportSpec`.
- `validatePipeline.test.js` — that a full 500-value `$in` clears the byte and node budgets, not merely the raised length cap.
- `pnpm ldf:b` from `apps/demo` — proves the config compiles and that `MultipleSelector` is a real block type once `report.yaml` declares it (a bad type name fails the build). Nothing more.
- A dev-server pass on the seeded report — the only check of the live path: options resolving on open, and a selection re-querying its bound sections. The report-render e2e spec is `test.fixme` for an unrelated harness gap (`@lowdefy/server-e2e` drops `urlQuery`, so the resolver never finds the report), so this step is manual today.

## Resolved questions

Resolved 2026-07-29 against the source rather than deferred to implementation.

1. **Does `$in` work on an array field?** Yes — multikey matching means `{ f: { $in: [a, b] } }` matches a document whose `f` array contains either value, with no separate operator and no `$expr`. Only "all of" needs a second op.
2. **Are `$in`/`$all` allowed by the validator?** Yes — both are in `ALLOWED_MATCH_OPERATORS` (`matchOperatorAllowlist.js`), and `walkOperatorDocument` handles them explicitly (array-type check, length cap, per-element `copyQueryLiteral`).
3. **Is a new length/type cap needed on the array value?** No new _check_ — `MAX_ARRAY_LITERAL_LENGTH` already applies to the built `$match` and `copyQueryLiteral` already rejects `$`-prefixed keys inside literal values — but the existing cap has to move: at 100 it sits below the 500-option list, so a large-but-ordinary selection would be rejected by the gate. It is raised to 500 and the invariant is commented on both constants. Only the empty-array _intent_ check is genuinely new.
4. **What does `MultipleSelector` set when cleared?** `[]`. Its `onChange` always calls `setValue` with an array; `onClear` only triggers the event. So the empty-array drop is required for the ordinary cleared state, not a defensive extra.
5. **Does `MultipleSelector` accept `{ label, value }` options?** Yes — it reads `opt.value` when the option is not a primitive, and renders `opt.label`. `Selector` does the same, and both default `showSearch` to true, so searching a long looked-up list needs no new property.
6. **Can `validateQuery` validate `optionsQuery` with its contract keys attached?** Yes — it checks `collection`/`pipeline` and returns only those two keys, ignoring extras.
7. **Where do options queries execute?** Inside the existing `resolve-report` `:for` / `:try` / `AnalyticsPipeline` loop, via `querySections`. No new endpoint, no routine change, and catalog + per-viewer role enforcement come for free from the one gate every query already passes.
8. **Does the demo need new seed data?** No. `demo_activities.company_ids` and `demo_contacts.global_attributes.company_ids` are already scalar FK arrays catalogued as `type: array` with `relationships` into `demo_companies`.

## Non-goals

- **Per-element filtering** of an unwound array — the prepend-only rule cannot express it; documented as a limitation with the view-at-grain workaround.
- **Autocomplete / server-side option search** — `onSearch` exists on the block, but a set too large for a 500-option dropdown is a separate design.
- **Filter binding to post-`$group`/post-`$lookup` aliases** — unchanged limitation, and the reason the `$match` is prepended.
- **Additional ops** (`$nin`, `$regex`, numeric ranges on non-date fields) — no concrete need yet; `FILTER_OPS` stays default-deny and small.
- **Cross-filter dependency** (a company list narrowed by the selected region) — a real want, but it makes options a function of live state rather than of resolve time, which is a different mechanism.
- **Chat-surface filters** — filters exist only on saved reports; the chat surface re-asks instead.
- **Where the filter controls sit on the page, and how a control conveys what it scopes.** This design keeps the existing single row at the top of the report. Manual testing showed that is a real problem once a report carries two independent filter groups — a control whose bound sections are all below the fold is indistinguishable from a broken filter — but it is a layout decision, so it belongs to [`reporting/ux/report-page`](../ux/report-page/design.md#the-filter-row-says-nothing-about-what-it-scopes), which owns the report page's shape. The demo compensates by hand, binding every filter to at least one KPI or chart.

## Risks

- **One extra query per looked-up filter, per report open.** The resolve loop is sequential, so a report with two FK filters adds two round trips to first paint. Bounded by `PIPELINE_RESULT_CAP` and the same `maxTimeMS` as any section; the options pipelines are small projections over reference collections. If it bites, the fix is caching at the resolve layer, not a different mechanism.
- **An options query is a query.** It reaches app data through the same gate as a section, so a filter cannot become a way to read a collection the viewer can't otherwise reach — but it _is_ another AI-authored pipeline in the persisted spec, revalidated per viewer, and it can rot the same way if the catalog drifts. Contained as an Alert in the filter row.
- **`$all` semantics can surprise.** "All of" on a scalar field matches only when one value is chosen, which reads as a broken filter to a user who selected three. Accepted, because the alternative is a catalog-type gate that rejects legitimate reports when the catalog is imprecise. Mitigated where the authoring happens: the agent instructions state the rule (use `match: all` only on a field the catalog declares `type: array`), which is the only mitigation that applies today, since the agent is currently the sole author of specs. The save sheet withholding the toggle on scalar fields is a second layer once that sheet exists, not the primary one.
- **Document-vs-element confusion** is the most likely user-visible wrongness — a chart that shows tags nobody selected looks like a bug, not a grain subtlety. Mitigated by prompting and docs only; if it recurs, the answer is a validation-time warning when a `filterBy` field is unwound in the same pipeline, which is checkable but not free.
- **Truncated option lists.** 500 is a guess, not a measurement. Stating the truncation in the title makes the cap visible rather than silent, which is the property that matters until a real list exceeds it.
- **The raised array-literal cap is a real widening, in one direction.** It also lets the agent type a 500-element literal array anywhere the grammar allows one, not just in a filter `$match`. Accepted: the cap bounds pipeline _text_, both budgets that bound it (bytes, nodes) are untouched and a full list spends a small fraction of each, and no data-volume boundary moves. The cost of the alternative — a provenance-scoped cap — is a second path through the security gate, which is worse than the widening.

## Related

- [`designs/reporting/open-query-engine/design.md`](../open-query-engine/design.md) — the engine, the filter-binding decision this extends, and the two-layer security model. Its array-literal cap entry records the raise to 500 made here.
- [`designs/reporting/ux/save-as-report/design.md`](../ux/save-as-report/design.md) — the save-report confirm sheet whose filter picker is the second author of an `optionsQuery`; it points back at the derivation rule above.
- [`designs/reporting/ux/report-page/design.md`](../ux/report-page/design.md) — where the filter controls sit, which this design leaves open.
- The reporting UX [wireframe deck](../ux/wireframes.html) — plates 3 and 6 show the save-sheet filter picker (including the any/all toggle) and the report filter bar with tag-style multi-select; its closing implications table maps each proposal to the files above.
