# Review 1

Reviewed `design.md` as of 2026-07-22 (post charts/reports fold-in and catalog-bootstrap addition). Factual claims verified against `plugins/modules-mongodb-plugins/src/analytics/`, `src/connections/ReportingData/`, `modules/reporting/api/`, and `apps/demo/modules/reporting/datasets.yaml`. The verified claims hold: `AnalyticsQuery.js` runs `maxTimeMS: 30000` / `allowDiskUse: false` with `meta: { checkRead: true, checkWrite: false }`; `compileMongo.js` escapes every regex input (`escapeRegExp`, line 26) and emits only the five stages; `validateQuerySpec.js:120-127` is the single-dataset role gate the design extends; the demo has `contact_companies` → `demo_contact_companies_report`. Findings below.

## Security & validation model

### 1. §3b lists query operators but never defines the query-document _shape rules_ — the exact conflation trap the Risks section warns about

> **Resolved.** §3b gains a "query-document walk rules" list: any-`$`-key → operator document with all keys allowlisted (mixed docs fail); literals reject `$`-shaped keys fail-closed (no `$literal` escape exists in the query grammar); per-operator operand grammars stated (`$elemMatch` → query doc, `$not` → operator doc/regex, `$expr` → §3). Mixed-doc and literal-position `$where` added to the Risks adversarial suite.

§3b gives allow/deny operator sets for the `$match` query grammar, but the structural walk rules are unstated, and they are where `$where` actually slips through:

- When is an object value under a field key an **operator document** vs a **literal**? `{ f: { $gt: 5 } }` is operators; `{ f: { a: 1 } }` is a literal document-equality match; `{ f: { $gt: 1, $where: "…" } }` must fail even though `$gt` is allowed. Propose the rule: if _any_ key of the value object starts with `$`, then _all_ keys must be allowlisted query operators; otherwise the value is a literal.
- Literals in the query grammar have no `$literal`-style escape marker, so a literal object that happens to contain `$`-shaped keys deeper down (`{ f: { a: { $where: "…" } } }` — which MongoDB treats as pure data) should be stated as **rejected fail-closed**, mirroring how §3 handles strings-that-look-like-operators everywhere except under `$literal`.
- `$elemMatch`'s operand recurses as a nested **query document** (query grammar, not expression grammar); `$not` takes an operator document or `$regex`. These per-operator operand grammars belong next to the allowlist the way `$expr → §3` is already noted.

Without these rules the implementer re-derives them at code time. Add a short "query-document walk rules" list to §3b and add `{ f: { $gt: 1, $where: "…" } }` and literal-position `$where` to the adversarial suite enumerated in Risks.

### 2. Filter re-query triples are untrusted client input — the design's framing suggests otherwise

> **Resolved (auto).** §Filter-binding now states the triples are untrusted client input, the op map is default-deny (unknown `op` rejects), and the built `$match` passes through the same validation walk; the Risks adversarial suite gains `field: "$where"` / `field: "__proto__"` / `value: { $gt: … }` posted straight to the re-query endpoint.

§Filter-binding says "the agent contributes no query syntax at re-query time" and "the server builds the `$match` itself," which reads as if the triples were trusted config. They are not: today's re-query is a browser-side CallAPI carrying `spec` + `filters` (see `compileReport.js` requery actions), and in the new model a direct caller can POST arbitrary `{ field, op, value }` — `field` lands in **key position** of the server-built `$match`, and `value` can be any JSON value. Safety rests entirely on (a) the fixed op map being default-deny (unknown `op` → reject, not skip) and (b) the combined pipeline going back through `validatePipeline`, whose walk rejects `$`-prefixed and `__proto__`/`constructor` keys in the built stage. The design already says (b); it should state the untrusted-input threat model explicitly, state (a), and add to the adversarial suite: `field: "$where"`, `field: "__proto__"`, `value: { $gt: … }`.

### 3. Bootstrap emits empty `roles`, but empty roles means "any authenticated user" — the draft fails open

> **Resolved.** Kept today's semantics but stated them: §Collection-namespace now says an entry with absent/empty `roles` is open to any authenticated user (role-gating is opt-in; declaring is the act of exposure). The bootstrap draft now fails closed: §Catalog-authoring has the script emit every collection entry commented out, so uncommenting is the curator's declaration decision and an unedited draft declares nothing.

Today a dataset with no `roles` is queryable by any authenticated user (`validateQuerySpec.js:121-126`; `apps/demo/modules/reporting/datasets.yaml:1-2` documents it). The design never states the catalog's empty-roles semantics, and §Catalog-authoring has the bootstrap script emit `roles` "empty/commented for the curator to fill in" — so an unedited draft checked in exposes **every sampled collection to every authenticated user**. Two fixes: (1) state the empty-roles semantics in the catalog section (presumably keep today's "empty = any authenticated user"); (2) make the draft fail closed — emit each collection entry **commented out entirely**, so uncommenting is the curator's declaration decision. That also matches the section's own claim that "a human decides which collections are declared at all."

## Presentation contract & rendering

### 4. Row-verification of the contract false-fails on empty result sets

> **Resolved (auto).** The contract section now states verification applies only to non-empty results (zero rows render an empty chart / zero KPI / empty table, matching today's `?? 0` fallback) and that `null` cells in `y`/value columns are tolerated.

§Declared-presentation-contract: "declared keys must exist in the result, chart `y` / KPI values must be numeric." A legitimately empty result — a filter narrowed to zero rows — has no keys at all, so as written every zero-row section becomes a tool error at chat time and an Alert card at view time. Today an empty KPI renders `0` (`compileReport.js:288`, `rows?.[0]?.[valueKey] ?? 0`), not an error. State: verification runs only against non-empty results (zero rows render an empty chart / zero KPI / empty table as today), and `null` cells in a `y`/value column are tolerated — null group keys are normal MongoDB output.

### 5. Enum tag-column rendering is silently dropped from tables

> **Resolved.** Dropped deliberately: the contract stays `{ key, label?, format? }` and the design's table-sections bullet now records that enum tag styling is a deliberate simplification (plain-text cells), with a `tag` flag as the future opt-in if it's missed.

`validateReportSpec.js:119-122` derives `tag: true` for table columns whose dimension declares enum `values`, and the renderer styles those as tags. The new column contract `{ key, label?, format? }` has no tag affordance and the design doesn't mention the loss, even though the catalog keeps per-field enum `values` (§Collection-namespace). Either add an optional `tag` (or `style`) to the column contract — prompted from catalog `values` exactly like display hints — or record dropping tag styling as a deliberate simplification.

### 6. Export contract: the design contradicts itself

> **Resolved.** Exports carry no contract: proposed-change 2 now scopes the presentation contract to renderer-feeding queries (charts/KPIs/tables) with CSV headers from row keys, and Files-changed marks `export-data.yaml` pipeline-only and `validateExportSpec.js` as label/description + query, as today.

§What-changes says "CSV export takes columns from the row keys as today," but proposed-change 2 pairs a contract with _every_ rendered query, and Files-changed says `export-data.yaml` gets "pipeline + contract payloads" and `validateExportSpec.js` is "rewritten for pipeline + contract." (Today's `validateExportSpec.js` validates only `label`/`description` + query — no columns.) Pick one: exports need no contract (row keys suffice) and the change-2/files-changed wording excludes export, or exports gain declared columns for header labels/ordering and §What-changes says so. Recommend the first — no concrete need for export column contracts.

## Architecture

### 7. Bind the catalog at the connection, not per request

> **Resolved.** The catalog moves to `ReportingData` connection properties (`schema.js` gains `catalog`, wired once via `_module.var` in the module's connection YAML); requests carry only `{ query, roles }`. Architecture step 3 and Files-changed updated.

Every caller today wires `datasets: { _module.var: datasets }` and `roles: { _user: roles }` into the request per API YAML (`query-data.yaml:99-104`), and the design keeps that shape. "Every caller passes the same gate mechanically" is then only half true: the gate runs inside the request, but _which catalog_ it gates against is per-caller convention — a future endpoint can wire a stale or different catalog. Since the catalog is app-level config, move it to `ReportingData` **connection** properties (`schema.js` gains `catalog`; the module's `connections/reporting-data.yaml` does `_module.var` once), leaving requests to carry only `{ query, roles }`. That is "one correct way" enforced mechanically — no caller can bypass or mis-wire the catalog. `roles` must stay per-request (`_user: roles`); note that an endpoint omitting `roles` fails closed for role-gated collections, same as today.

### 8. "Post-JSON.parse" holds only for the chat path; persisted pipelines round-trip through BSON

> **Resolved (auto).** §0 now names both entry paths (JSON.parse at chat time, BSON deserialization at resolve time) and requires the walker to treat non-plain scalars (`Date`, `ObjectId`) as opaque values; §What-changes records the MongoDB ≥ 5.0 floor for storing `$`-prefixed keys in report documents.

§0 grounds the duplicate-key-collapse guarantee in "the tree is post-`JSON.parse`." That's true for tool-call input, but resolve-time pipelines come back **BSON-deserialized from the reports collection**, not from `JSON.parse`. The guarantee still stands — the driver also collapses duplicate keys, and the reconstruct walker re-establishes every invariant on whatever object it's handed — but the stated reason is wrong for the report path; reword to cover both entry paths. Two adjacent one-liners worth adding: (a) persisting raw pipelines means storing nested `$`-prefixed field names (`$match`, `$lookup`, …) inside report documents, which MongoDB allows only from **5.0** — a new minimum-server-version requirement the old spec (no `$` keys anywhere) never had; (b) the walker should treat non-plain scalar instances (`Date`, `ObjectId`) as opaque values, since BSON deserialization can produce them where `JSON.parse` cannot.

## Scope & consistency

### 9. Saved-conversation download parts break too — the compat waiver names only reports

> **Resolved (auto).** The waiver in §Charts-reports-exports now names saved-conversation result parts: download entries fail validation on click after the replacement; persisted charts keep rendering (stored pre-rendered).

`get-conversation-results.yaml:6`: persisted conversation parts' "downloads carry a query spec that re-runs live on click." After the replacement, clicking a download in a pre-existing conversation submits an old structured spec to the new endpoint and fails validation. (Persisted _charts_ keep working — they're stored pre-rendered.) This is acceptable under the waiver, but the waiver text ("reports persisted in the old format are simply invalid") should name this second persisted surface so it's a decided consequence rather than a surprise at implementation.

### 10. `$densify`: cap-or-defer is left undecided

> **Resolved.** Deferred: `$densify` moved from the allow row to the deferred/opt-in row in §2 (it's the only allowed-class stage that synthesizes documents, and no concrete gap-filling need exists); §6 records the decision and notes a deployment enabling it later must bring the span×step cap with it.

The §2 stage table **allows** `$densify`, while §6 says "Cap the generated span (bounds×step) or defer `$densify` until a concrete need appears" — an unresolved either/or the implementer would have to decide. Per the repo rule (resolve the open question, don't defer it): recommend **defer** — no concrete need exists, the deferred/opt-in row already holds stages parked on complexity-vs-need grounds, and deferring deletes an entire cap (span arithmetic across numeric _and_ date ranges) from the validator. If the design prefers to keep it, it should say so and specify the cap instead.

### 11. Files-changed omissions

> **Resolved (auto).** Files-changed now includes `analyticsOperator.js` and `testDatasets.js` in the rewrite list, and notes `AnalyticsQuery.test.js` is deleted with its request.

- `plugins/modules-mongodb-plugins/src/analytics/analyticsOperator.js` — the `_analytics` operator's method roster (`validateChartSpec`/`validateReportSpec`/`validateExportSpec`/`querySections`/`compileReport`/`buildDataParts`) is the module's YAML-facing validation surface; the rewrites land here too, and any renamed/removed method changes API YAML call sites.
- `plugins/modules-mongodb-plugins/src/analytics/testDatasets.js` — the shared test fixture is a dataset list; it becomes a catalog fixture consumed by every rewritten test.
- `plugins/modules-mongodb-plugins/src/connections/ReportingData/AnalyticsQuery/AnalyticsQuery.test.js` — deleted with its request; the design's deletion list scopes "and their tests" only to `compileMongo`/`validateQuerySpec`.
