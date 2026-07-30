# Review 1

Reviewed `designs/reporting/report-filters/design.md` against the engine source, the
report page, the demo seed and catalog, the block package, and the sibling
[`ux`](../../ux/design.md) design.

The design's factual claims mostly hold — resolved questions 1, 2, 4, 5, 6, 7 and 8 all
check out against source (see **Verified as written** at the end). The findings below are
one real correctness collision the design's own reasoning depends on, two omissions in
what gets touched and how it is verified, and three decisions the design leaves resting on
something outside it.

## Correctness

### 1. `MAX_QUERY_FILTER_OPTIONS = 500` collides with the 100-element `$in`/`$all` cap, and it is the argument for "no new value validation" that breaks

> **Resolved.** The caps are lined up by raising the array-literal cap, not by capping options: `MAX_ARRAY_LITERAL_LENGTH` becomes `500` outright and the now-unused `MAX_IN_VALUES` alias is deleted. New _Raising `MAX_ARRAY_LITERAL_LENGTH` to 500_ section argues the safety — the cap bounds pipeline _text_, not data volume (`$range` makes that plain), and the two budgets that do bound it are untouched: ~14 KB of 100 000 serialized bytes and 500 of 10 000 nodes for a full list. The provenance-scoped alternative is rejected as a second path through the security gate. The "no new value validation" section now states the `options cap ≤ array-literal cap` invariant, why a violation fails _quietly_ (`CallAPI` aborts before its `SetState`, so bound sections read stale) and that `maxTagCount` cannot prevent it; both constants carry the invariant as a comment. Resolved question 3, the risks list, proposal 7 and the test list updated; the widening is recorded as an accepted risk, and the open-query-engine design's cap entry now notes the raise.

Proposal 7 raises the query-sourced option list to 500. The built `$match` then goes
through `walkOperatorDocument`, whose `$in`/`$nin`/`$all` branch caps the operand at
`MAX_ARRAY_LITERAL_LENGTH` (`validatePipeline.js:519-523`), which is
`MAX_IN_VALUES = 100` (`constants.js:13,71`). So a user offered 500 companies who selects
101 of them gets the whole re-query rejected with
`the "$in" value list exceeds …` — an ordinary UI action producing a hard validator error.

The design explicitly rules out a filter-layer cap on the grounds that "the UI cannot
select more values than the options offered" (§_The connection needs no new value
validation_, resolved question 3). That premise is true today only because
`MAX_FILTER_OPTIONS` (50) sits under the array cap (100). Raising the options cap to 500
is precisely what invalidates it.

The block cannot save this: `@lowdefy/blocks-antd` 5.5.1 `MultipleSelector` exposes
`maxTagCount` (a display cap on rendered tags) and no selection-count property, so nothing
stops a user selecting all 500. The failure is also quiet rather than loud — `requeryActions`
emits `CallAPI` then `SetState` per bound section (`compileReport.js:98-121`); the rejected
call aborts the chain before its `SetState`, so the bound sections keep their previous rows
and the report reads as stale, not broken.

Fix: pick one number and make the design state the relationship. Either cap query-sourced
options at `MAX_ARRAY_LITERAL_LENGTH` (100 — one line, keeps the "no new value validation"
argument sound), or raise `MAX_ARRAY_LITERAL_LENGTH` and say in the design why the higher
bound is safe for a `$in` list. Whichever is chosen, the invariant
`options cap ≤ array literal cap` belongs in a comment next to both constants, because the
next person to raise one of them will otherwise reintroduce this.

### 2. `modules/reporting/pages/report.yaml` is missing from _Files changed_ — and it is the one file whose omission 404s every report

> **Resolved (auto).** `report.yaml` added to _Files changed_ with `MultipleSelector` under the `Dynamic` block's `properties.types.blocks`, stating why it is not optional (an undeclared type drops the whole report to the fallback slot — the `_intl` regression). `compileReport.declared.test.js` named in the test list as the guard.

The report page's `Dynamic` block declares a closed allowlist of block/action/operator types
(`report.yaml:19-43`). An undeclared type does not degrade the offending section: it drops
the **whole report** to the fallback slot, which is exactly how a formatted table column once
404'd every report containing one (`compileReport.declared.test.js:11-24`). Emitting
`MultipleSelector` without adding it to `properties.types.blocks` reproduces that failure for
every report carrying a multi-select filter.

Fix: add `modules/reporting/pages/report.yaml` to _Files changed_ (`MultipleSelector` under
`types.blocks`), and name `compileReport.declared.test.js` in the test list — it is the
existing guard for this invariant and will fail loudly if the declaration is forgotten, which
is the outcome you want.

### 3. An `optionsQuery` that returns rows with the wrong columns produces a silently dead filter, not an Alert

> **Resolved.** `verifyContract.js` gains a fourth export, `verifyFilterOptionsContract({ valueKey, labelKey, rows })` — one `requireKeys` call — whose throw routes into the per-filter Alert like any other contract mismatch. Proposal 6 and the degradation section now list all three outcomes with distinct descriptions (failed/denied · contract mismatch, naming the columns actually returned · no rows), and note that `requireKeys` skips empty results so the contract check and the zero-rows case stay independent. `verifyContract.js` added to _Files changed_; `verifyContract.test.js` and per-outcome Alert cases added to the test list.

Proposal 6 degrades to an Alert when the options query "fails validation, is denied by roles,
or returns no rows". The fourth case is missing: rows come back, but `valueKey`/`labelKey`
name a column the pipeline did not project. `filterOptions` would then build
`[{ label: undefined, value: undefined }, …]` — a dropdown of blank rows whose selected
values are `undefined`, which `buildFilterMatch` drops (`AnalyticsPipeline.js:59`). The
filter renders, the user picks values, and nothing happens.

This is the same class of failure the engine already handles for every other renderer:
`verifySection` checks the declared contract against the actual rows and routes a mismatch to
one Alert card (`compileReport.js:313-325`, `verifyContract.js`). `optionsQuery` introduces a
new presentation contract (`valueKey`/`labelKey`) and the design does not give it the same
verification.

Fix: verify the options contract against its rows the way `verifyTableContract` does, and
route a mismatch into the Alert path with the reason in the description. Give the three
outcomes distinct messages — failed/denied ("options failed to load"), contract mismatch
(the verifier's message), empty ("no options available") — otherwise the one message
misdescribes two of the three.

### 4. The normalized filter section must carry `match`, `optionsQuery`, `valueKey` and `labelKey` forward explicitly

> **Resolved (auto).** The `validateReportSpec.js` bullet in _Files changed_ now states that the normalized filter section must carry `match` and `optionsQuery` forward, that `valueKey`/`labelKey` must be re-attached because `validateQuery` returns only `{ collection, pipeline }`, and what each omission looks like at runtime (blank options; every `all` filter silently downgraded to `any`).

Resolved question 6 is right that `validateQuery` tolerates extra keys — but it _returns only_
`{ collection, pipeline }` (`validateChartSpec.js:43`), and the filter branch returns a fixed
key set, `{ id, type, control, field, label, options }` (`validateReportSpec.js:233-240`).
`compileReport` reads that normalized spec, not the raw one (`compileReport.js:333`). So
`optionsQuery: validateQuery(section.optionsQuery, …)` silently drops `valueKey`/`labelKey`,
and forgetting `match` in the returned object silently downgrades every `all` filter to `any`.

Both failures are invisible at validation time and surface as finding #3's blank dropdown or
as a wrong-but-plausible query. Worth one explicit line in the design (or in the task), since
the shape of `validateQuery`'s return is what sets the trap.

## Verification plan

### 5. `pnpm ldf:b` cannot verify any of this, and the render-side e2e is currently disabled

> **Resolved (auto).** The _Demo consumer_ section's build-artifact inspection is replaced by a "How this is verified" list that assigns each half to the tool that can reach it: `compileReport.test.js` for emitted blocks/options/triples, `compileReport.declared.test.js` for the `Dynamic` types invariant, `validateReportSpec.test.js` for the new validation (the seed skips it), `ldf:b` for config compile and block-type existence only, and a manual dev-server pass for the live path — with the `test.fixme` harness gap noted.

The _Demo consumer_ section says to build and inspect
`.lowdefy/server/build/pages/reporting%2Freport.json` for the emitted `MultipleSelector`
blocks, `{ label, value }` options and `in`/`all` triples. Those never appear there.
`_analytics` is a **server** operator (`plugins/modules-mongodb-plugins/src/types.js:10`) and
reports compile per request inside `resolve-report`, so the build artifact holds only the
`Dynamic` block, its `types` and the fallback slot. `compileReport.declared.test.js:19-20`
states this directly: "`ldf:b` cannot, because reports compile at runtime from a stored spec".

The browser-side check is also unavailable right now: the report-render spec is `test.fixme`
because `@lowdefy/server-e2e` drops `urlQuery`, so the resolver never finds the report
(`apps/demo/e2e/reporting/formatted-report.spec.js:127-146`).

Fix: restate verification as what actually covers each half —
`compileReport.test.js` for emitted block types, options and triple shapes;
`compileReport.declared.test.js` for the Dynamic-types invariant; `ldf:b` only to prove
`MultipleSelector` is a real block type once `report.yaml` declares it (a bad type name fails
the build); and a manual dev-server pass on the seeded report for the live re-query. Note
also that the seed inserts the spec raw and deliberately skips `validateReportSpec`
(`apps/demo/api/reporting-seed-example-report.yaml:14-16`), so the demo exercises
`compileReport` but never the new validation — that side is unit tests only.

## Decisions resting on something outside this design

### 6. Who authors an `optionsQuery`? The sheet in the sibling design cannot

> **Resolved.** One wire format kept. New _Two authors_ decision section: the agent writes pipelines freely; the sheet derives the same `optionsQuery` from the catalog `relationships` entry (target collection + `foreignField` → `valueKey`) plus a label field the user picks from the target's `type: string` fields, since the catalog carries no label on a relationship. A per-relationship label field is named as a possible later catalog addition, out of scope here. The UX design's proposal 8 now links to that section. The speculative `$concat` justification is replaced by the two cases the declarative `optionsFrom: { collection, valueField, labelField }` shape structurally cannot express: a pre-filtered option list, and distinct values over an array field (`$unwind` + `$group`) for a field with no catalog enum `values`.

The UX design routes report creation through a confirm sheet whose filter picker offers
"catalog-derived fields" (`../../ux/design.md:34,88`). A sheet cannot author an aggregation
pipeline, and the catalog gives it nothing to derive one from: `relationships` declare
`{ field, collection, foreignField }` and no label field
(`apps/demo/modules/reporting/catalog.yaml:132-135`). So as designed, the marquee capability —
a company filter showing names — is authorable **only** by the agent, while the design the
wireframes produced says the user picks filters in a sheet. The two designs disagree and
neither says so.

The design also never considers the declarative alternative
(`optionsFrom: { collection, valueField, labelField }` compiled server-side to a fixed
`$project`/`$sort`, the same posture `buildFilterMatch` already takes with the filter `$match`),
and the case it uses to justify the pipeline form — "`labelKey` may name a column the pipeline
composed (`$concat` … where names collide)" — is speculative by the repo's own standard.

Recommendation: keep one wire format (`optionsQuery`), and resolve the gap by naming the sheet
as a second author in this design: it derives the pipeline from the catalog `relationships`
entry for the chosen field (target collection + `foreignField` → `valueKey`) plus a label
field the user picks from the target collection's `type: string` fields. That keeps
pre-filtering and composed labels available to the agent without a second shape, and it makes
the sheet's picker implementable. Cross-reference it from the UX design's proposal 8.

### 7. The `$all`-on-a-scalar-field mitigation points at UI this design does not own

> **Resolved.** The rule moves into `reporting-assistant.yaml` — use `match: all` only on a field the catalog declares `type: array` — stated in the _any/all_ decision section ("not enforced does not mean not stated"), in the agent-instructions bullet in _Files changed_, and in the risk entry, whose mitigation now names the instructions as the operative one (the agent being the sole author of specs today) and the save sheet as a second layer once it exists.

The risk entry accepts `$all`-on-scalar surprise because "the save sheet only offers the
toggle on array-typed fields". That sheet is in the UX design and is not built; until it is,
the agent is the sole author of specs, so the mitigation is currently vacuous. Proposal 8
teaches the agent the new vocabulary but not this rule.

Fix: make `reporting-assistant.yaml` carry it explicitly — use `match: all` only on a field
the catalog declares `type: array` — and point the risk's mitigation at the instructions
first, the sheet second.

## Smaller points

### 8. Give the filter section strict-key validation instead of a one-off `match`-placement check

> **Resolved.** The filter branch adopts the table-column pattern: allowed keys `type, label, control, field, options, match, optionsQuery`, anything else rejected with the list in the message. The `match`-placement rejection becomes one conditional on top of it rather than the branch's only key rule, and typos like `optionsquery` / `labelkey` — silently dropped today, yielding a filter with no options — now fail loudly. `id` is excluded (server-assigned `s{index}`), and the list matches the key set the agent instructions already state, so this enforces the documented contract rather than adding one. Noted in the any/all decision section, the `validateReportSpec.js` bullet, and the test list.

The design rejects `match` on `select`/`daterange` and cites table columns as precedent — but
the filter branch has no key checking at all (`validateReportSpec.js:209-241`), whereas table
columns enumerate allowed keys and reject the rest (`:182-187`). Adopting the column pattern
here (`type, label, control, field, options, match, optionsQuery`) gets the `match` placement
check for free _and_ catches `optionsquery` / `optionQuery` / `labelkey` typos, which
otherwise persist silently and produce a filter with no options. Same argument the design
already makes: the message is how the agent learns the vocabulary.

### 9. An empty options query rendering a warning is the first exception to a documented rule

> **Resolved.** Behaviour kept (empty options ⇒ Alert), and the design now states the reasoning: the zero-rows rule governs a section's _result_ rows, where empty means "nothing matched"; an options list is the control the user operates, and an empty one cannot be. The _Files changed_ entry for `presentation-contract.md` now requires the verification section to scope the absolute rule and name the options exception. Folded in alongside: correct that section's stale "checked against the first row" to _at least one row_, matching `verifyContract.js` and its reason (`$project` conditionals / `$unionWith` make row 0 an unreliable sample).

`docs/reporting/reference/presentation-contract.md:51` states that zero rows is a legitimate
outcome and "never treated as an error". Proposal 6 makes zero options rows render an Alert.
That is defensible (an empty dropdown teaches nothing), but it is a real exception to a rule
the docs state absolutely, and `docs/` is the source of truth for behavior. The
presentation-contract rewrite in _Files changed_ should state the exception and why options
differ from result rows.

### 10. `match: any` → `op: in` leaves `all` naming two different things

> **Resolved (auto).** _Wire format_ now states that the op vocabulary is named after the Mongo operators it maps to — `match` is the author's intent, `op` is the query it compiles to — and that triples are server-built, so the agent only ever sees `any | all`.

The spec vocabulary is `any | all`; the triple vocabulary is `in | all`. So `all` names both a
match mode and an op while `any` does not — harmless (triples are server-built and the agent
never sees them), but the _Wire format_ section reads as a typo until you work it out. One
sentence saying the ops are named after the Mongo operators they map to would settle it.

### 11. Nothing exercises a dotted filter field, which this design makes the likely case

> **Resolved** via the unit-test route, not the demo swap. `compileReport.test.js` gains a dotted-field case asserting the emitted block id (`filter_global_attributes.company_ids`) and that the triple's `__state` reference reads the same nested key. The demo's Companies filter stays on `demo_activities.company_ids`: moving it to the contacts field would force a contacts-grain bound section in place of the activities one, losing the worked-out array-FK + looked-up-labels + document-not-element demonstration in a single control, to buy coverage the unit test gives more cheaply. The runtime round-trip is not in doubt — `modules/contacts` already binds a `TextArea` to the dotted id `global_attributes.internal_details` — so what was missing is coverage of the compiler emitting it. (The nested field _is_ seeded, `scripts/seed-reporting-domain.mjs:86`, so the demo route was viable.)

`filterStateKey` builds the block id `filter_${field}` (`compileReport.js:61`), so a filter on
`global_attributes.company_ids` — the second array FK the design cites in _Why this, and why
now_ — emits a block id containing a dot, i.e. a nested state path. It should round-trip
(the `__state` read uses the same dotted key), but it is untested, and nested array FK fields
are exactly what query-sourced options are for. Either add a compileReport case with a dotted
field, or use `demo_contacts.global_attributes.company_ids` for the demo's Companies filter so
the demo covers it.

## Verified as written

Checked against source; no action needed:

- `$in`/`$all` are both in `ALLOWED_MATCH_OPERATORS` and handled explicitly by
  `walkOperatorDocument` with a per-element `copyQueryLiteral` that rejects `$`-prefixed keys
  in literal match values (`validatePipeline.js:256-279,519-523`) — resolved questions 2 and 3
  (apart from the cap collision in finding #1).
- `MultipleSelector.onChange` always calls `setValue` with an array, so `[]` is the cleared
  state and the empty-array drop is required, not defensive (`MultipleSelector.js` `onChange`).
  Note the block's own `allowClear` description claims it "sets the value to null" — that text
  is wrong; keeping both the null and `[]` branches, as the design does, is correct.
- `MultipleSelector` reads `opt.value` for non-primitive options and defaults `showSearch`
  to true, so `{ label, value }` options and search need no new property.
- `querySections` / `compileReport` have exactly two consumers — `analyticsOperator.js` and
  `resolve-report.yaml` (`_item: section.query` only) — so adding filter-options entries to the
  ordered list genuinely needs no routine change, and the shared-helper refactor is the only
  alignment work.
- The demo needs no new seed data: `demo_activities.company_ids` is `type: array` with a
  `relationships` entry into `demo_companies` (`catalog.yaml:123-135`), and `demo_orders.createdAt`
  exists in the catalog _and_ is written by the orders seed
  (`apps/demo/api/reporting-seed-orders.yaml:35`), so the `daterange` demo filter is buildable.
