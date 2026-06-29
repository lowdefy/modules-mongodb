# Review 1

Scope: `designs/search-fallback/design.md`. Verified against the 8 affected request
files, the four module manifests, the `modules/shared/` reference convention, and the
`_build` vs runtime operator semantics in `apps/demo/.claude/guides/operators.md`.

## Correctness of the core mechanics

### 1. `search_contacts` is already in the target shape — the design mischaracterizes it, and the uniform builder does not fit it

The design's premise (Background, lines 27–32) is that **all 8** requests "have the same
shape: a single `$search.compound` block mixing two unrelated concerns" — text ranking
and structural filters — and that the work is to split them. That is true for 7 of them,
but **not** for `modules/contacts/requests/search_contacts.yaml`. That request is already
restructured exactly the way this design proposes:

- `$search` (lines 21–54) does **text-only** ranking via `should`, with a baseline
  `filter: [exists: _id]` — no structural filters inside `$search`.
- `$match` (lines 55–81) carries the structural filters as a **standard Mongo query**
  (`hidden: { $ne: true }`, `disabled`, `global_attributes.company_ids`) merged with
  `_object.assign`.
- Its consumer hook is `_var: filter` (lines 79–81), already documented as a "plain
  `$match` expression, not Atlas compound syntax" (file header, line 7) — i.e. it is _not_
  `request_stages.filter_match` and is _not_ in the Atlas-compound syntax the design says
  it must convert.

The file header (lines 9–10) even states the intent: "Apps without Atlas search can drop
stage 1; the remaining pipeline works standalone (unranked results)."

Consequences the design should address:

- **The "split filters into `$match`" work (proposed change #2) is already done for this
  request.** Listing it among "8 request files restructured (filters → `$match`)" (Files
  changed, line 162) overcounts the work and misrepresents the starting state.
- **The breaking `filter_match` → `$match` conversion (decision 4 / migration note) does
  not apply to the selector** — its hook is a separate `filter` var that is already plain
  `$match`. So the design actually has _two_ differently-named consumer hooks
  (`request_stages.filter_match` on the list requests, `filter` on the selector). A design
  whose banner is "one correct way" should either reconcile these or explicitly note they
  stay distinct and why.
- **The uniform shared builder does not fit this request.** `search_contacts` has no
  `$facet`, no `score` sort, and no pagination — it ends in `$limit: 10` + `$project`. So
  `score_addfields` and `use_score` (Shared builder, lines 152–154) are meaningless here,
  and its text clause lives in a top-level `should` rather than nested inside
  `filter[].compound.must[].compound.should` like the list requests. Only `lead` (toggle
  the `$search` stage) and `regex_clause` (add a text `$or` to the existing `$match` when
  in fallback) actually apply.

Recommendation: treat `search_contacts` as a distinct, already-split case. It needs **only**
the stage-1 toggle + the regex clause, drawn from the subset of the builder that applies —
not the full facet/score machinery. Correct the Background table and Files-changed list to
say so, and decide explicitly whether the selector's `filter` var and the list requests'
`filter_match` var are unified or deliberately separate.

### 2. `_object.assign` silently clobbers the two `updated.timestamp` range bounds in `get_activities`

The skeleton (lines 71–76) merges all structural filters into a **single** object with
`_object.assign`. That is a shallow merge keyed by top-level field — later keys overwrite
earlier ones. `get_activities` is the one request that filters the **same field twice**:
`filter.date_from` → `range gte updated.timestamp` (lines 100–113) and `filter.date_to` →
`range lte updated.timestamp` (lines 114–127).

In Atlas-compound form these are two independent `range` clauses ANDed in a `must` array,
so both apply. In `$match` form they must collapse to one key:
`{ "updated.timestamp": { $gte: x, $lte: y } }`. If the conversion builds them as two
`_if` objects — `{ "updated.timestamp": { $gte } }` and `{ "updated.timestamp": { $lte } }`
— and `_object.assign`s them, **the second clobbers the first** and one bound is silently
lost. The "write structural filters once as a standard Mongo query" instruction (skeleton
comment, line 73) hides this; the date range needs to be authored as a single nested
object, not two assign entries.

This is the concrete instance of a general hazard: `_object.assign` is a shallow,
last-writer-wins merge, and the design uses it to combine `[structural filters,
regex_clause, filter_match]`. Any key collision across those three vanishes silently — e.g.
`regex_clause` emits `{ $or: [...] }`, so a consumer `filter_match` that also uses `$or`
would collide on the `$or` key. Call out the merge semantics and either mandate
collision-free authoring or use `$and`-wrapping where collisions are possible.

### 3. `_build.array.concat` in the pipeline skeleton cannot gate stage inclusion on the runtime search term

The skeleton (lines 67–77) assembles the pipeline with `_build.array.concat`, splicing
`text_lead` and `score_addfields` described as present "when `atlas_search && term`". Per
`apps/demo/.claude/guides/operators.md` (lines 9, 21, 293), `_build.*` "resolve once when
the app compiles… Never use these for runtime logic." `atlas_search` is build-time (a
`_module.var`, resolved to a literal at compile), but **`term` (`_payload: filter.search`)
is runtime-only** — `_build.array.concat` cannot see it.

So the "skip `$search` entirely when there is no search term" behaviour (decision 2, the
"emergent property" on lines 81 and decision 4) and the `score_addfields` toggle both
depend on a **runtime** decision and must use a **runtime** `_array.concat` + `_if`
returning `[]`/`[stage]` — exactly the pattern the current requests already use inside the
`must` array (e.g. `get_all_contacts.yaml` lines 27–54). A builder piece that is a runtime
`_if`-array cannot be spliced by an outer `_build.array.concat` (the build pass would try to
flatten an unresolved operator). Note also that the current `$facet.results` correctly uses
`_build.array.concat` only because it splices build-time-known `_module.var` stages and its
sort is a single always-present stage whose _body_ toggles at runtime — not a stage that
appears/disappears.

Recommendation: the outer pipeline assembly must be runtime `_array.concat`. Reserve
`_build.*` for the `atlas_search` dimension alone (which legitimately drops the entire text
mechanism at compile time when the flag is `false`). The skeleton and the "Shared builder"
descriptions should be corrected to say which pieces are build-time and which are runtime.

## Spec / migration accuracy

### 4. `request_stages.filter_match` is an array of clauses, not a single object — the migration note understates the change

All four manifests default `filter_match` to `[]` (`contacts` line 91, `activities` line 97,
`companies` line 154), and the requests consume it as an **array**: spread into the `must`
array via `_array.filter` dropping nulls (e.g. `get_all_contacts.yaml` lines 55–60). The
design's `_object.assign` skeleton (line 75) instead expects `filter_match` to be a single
`$match` **object** (you cannot `_object.assign` an array of clauses and get a sensible
query). So the var changes shape **array → object**, not merely "Atlas-compound syntax →
Mongo syntax."

The migration note (lines 182–183) gives a single-clause example
(`{ equals: { path: "region", value: "x" } }` → `{ region: "x" }`) and never mentions that
a consumer passing **multiple** clauses must now combine them into one object (and handle
`$or`/`$and` collisions per finding #2). Tighten the note: state the array→object shape
change explicitly and show the multi-clause case.

### 5. The committed `companies` search index hardcodes `name`, but the search path uses the configurable `name_field` var

Decision 5 (line 116) commits `modules/companies/search-indexes/default.search.json`
indexing "configured `name_field`, default `name`." But the committed JSON is static,
while `get_all_companies.yaml` searches `_module.var: name_field` (lines 36–38, 50–52) —
a consumer-overridable var. A consumer who sets `name_field` to anything other than `name`
gets a `default` search index that does not map their text field, so Atlas `$search` silently
returns no text matches for it, while the regex fallback (which reads the same var) still
works — a confusing mode-dependent discrepancy. The design should document that overriding
`name_field` requires regenerating the committed index accordingly (or otherwise reconcile
the static JSON with the dynamic path).

## Worth noting (supporting, not blocking)

### 6. `storedSource: true` (decision 5) fixes a latent pre-existing bug, which strengthens the case

`search_contacts` already runs `returnStoredSource: true` (line 22) and then `$match`es on
`hidden`, `disabled`, and `global_attributes.company_ids` (lines 57–76) — precisely the
missing-field footgun decision 3 describes. Today, if the committed-but-currently-absent
search index does not store those fields, that filter is already silently wrong on Atlas.
So decision 5 (`storedSource: true`) is not only fallback-enabling — it closes an existing
latent correctness gap. The design could cite this as concrete motivation rather than
framing storedSource purely as a fallback concern.

## Summary

The design's direction is sound and the decisions are well-argued (regex-over-`$text`,
defaulting Atlas, `storedSource: true`, committing index JSON). The blocking issues are
mechanical and concrete:

- #1 — `search_contacts` is already split; recount the work, fit it to the subset of the
  builder that applies, and reconcile the two consumer-hook vars (`filter` vs `filter_match`).
- #2 — `_object.assign` clobbers the doubled `updated.timestamp` bounds in `get_activities`;
  the merge is shallow and collision-prone.
- #3 — `_build.array.concat` can't gate stages on the runtime term; the pipeline assembly
  must be runtime `_array.concat`.
- #4/#5 — tighten the `filter_match` migration note (array→object) and the static-vs-dynamic
  `name_field` index mismatch.
