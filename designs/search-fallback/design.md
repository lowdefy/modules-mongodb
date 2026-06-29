# Atlas Search fallback (search portability)

Several modules build their list pages, Excel exports, and the rich contact-selector typeahead on MongoDB Atlas `$search`, which only exists on Atlas (it needs the `mongot` process). On a community/local MongoDB server every one of these pipelines hard-fails, so the demo — and any self-hosted deployment — can't list contacts, users, companies, or activities. This design makes text search **portable**: a module-level flag selects Atlas `$search` (the default) or a plain-MongoDB regex fallback, and the structural filtering is restructured so the same pipeline works in both modes. It also commits and documents the Atlas Search index definitions the modules have always silently depended on.

## Proposed change

1. Add a boolean `atlas_search` var (default `true`) to every module that does text search (`contacts`, `user-admin`, `companies`, `activities`). When `false`, requests use a regex fallback instead of `$search`.
2. Split text search from structural filtering in all 8 affected requests: structural filters (and the consumer filter hook) always run as a standard `$match`; only the free-text term toggles between an Atlas `$search` text stage and a case-insensitive `$regex` `$or`.
3. Centralise the text-stage / regex-clause construction in one shared `_ref` under `modules/shared/search/` so all requests build it identically ("one correct way").
4. Standardise `returnStoredSource: true` across all `$search` stages (adds it to `activities`, which is currently missing it) and skip `$search` entirely when there is no search term.
5. Commit the Atlas Search index definitions (one `default.search.json` per searchable collection, in the ensure-index CI tool format, with `storedSource: true`) and document both the search indexes and the regular `mongod` indexes the fallback/browse paths need.
6. Convert the consumer filter hook (`request_stages.filter_match`) from Atlas-compound syntax to standard `$match` syntax so it works unchanged in both modes (a breaking change to that var; the demo does not use it).

## Background: how search works today

`$search` is the **first stage** of 8 requests across 4 modules. `$search` is Atlas-only, so all 8 fail on local MongoDB:

| Module     | Requests                                                                             | Collection                                    |
| ---------- | ------------------------------------------------------------------------------------ | --------------------------------------------- |
| contacts   | `search_contacts` (selector typeahead), `get_all_contacts`, `get_contact_excel_data` | `user-contacts`                               |
| user-admin | `get_all_users`, `get_user_excel_data`                                               | `user-contacts` (same collection as contacts) |
| companies  | `get_all_companies`, `get_company_excel_data`                                        | `companies`                                   |
| activities | `get_activities`                                                                     | `activities`                                  |

`modules/contacts/requests/get_contacts_for_selector.yaml` (the `basic-contact-selector`) already uses `$match`+`$sort` with no `$search`, so it works on local today and is **out of scope**.

**7 of the 8** requests have the same shape: a single `$search.compound` block mixing two unrelated concerns —

- **Free-text ranking** — a `should` of `text` + `wildcard *term*` over name/email-style fields (`profile.name`, `lowercase_email`; `title` + `description.text` for activities; `name_field` + `lowercase_email` for companies), with results ordered by `$meta: searchScore`.
- **Structural filters** — `equals`/`in`/`range`/`exists`/`mustNot` clauses (e.g. `hidden`, `disabled`, `deleted.timestamp`, `type`, `status.stage`, `roles`, date ranges) plus the consumer `request_stages.filter_match` var (documented as _"Atlas Search compound clauses"_).

The structural clauses all have exact plain-`$match` equivalents. Only the free-text part genuinely needs Atlas.

The 8th, `contacts/requests/search_contacts.yaml` (the rich-selector typeahead), is **already split**: text-only `$search` followed by a standard-`$match` carrying the structural filters, with its own consumer hook — the component-level `filter` var (already plain `$match`, see decision 4), not `request_stages.filter_match`. It is _not_ a filters-in-`$search` request, so it needs no filters→`$match` restructure: only the stage-1 `lead` toggle and the `regex_clause` from the shared builder apply (it has no `$facet`/score sort/pagination, so `score_addfields`/`use_score` are inapplicable). Decision 2's split therefore lands on the **7** filters-in-`$search` requests; `search_contacts` is brought into the same fallback story by adding only the toggle + regex clause.

7 of the 8 requests already set `returnStoredSource: true`; `activities/get_activities.yaml` is the lone exception. **No search-index definition is committed anywhere in the repo** — the `storedSource` config these requests depend on is entirely undocumented, so a fresh Atlas project (or local setup) has no reference for what to create.

## Key decisions

### 1. Regex substring fallback, not `$text`

The current UX is **substring typeahead** (`joh` → `John`), implemented with `wildcard *term*`. MongoDB's native `$text` index only does whole-word stemmed matching (no substring), allows just one text index per collection, and can't be combined per-field the way this needs — it would silently change behaviour.

The fallback is therefore a case-insensitive `$or` of `$regex` over the same fields the Atlas text clause searches:

```yaml
$or:
  - profile.name: { $regex: <escaped-term>, $options: i }
  - lowercase_email: { $regex: <escaped-term>, $options: i }
```

This preserves substring matching exactly. What's lost is **relevance ranking** — there is no `searchScore` — so fallback results use the existing field sort (the same sort the Atlas path uses when there's no search term). User input is **regex-escaped** before interpolation (escape `.[]{}()*+?^$|\` and `/`) so metacharacters can't break the query or be injected.

Trade-off, and why Atlas stays the default: an unanchored regex (`*term*`) can't use a btree index, so it's a collection scan. Fine for local/dev and CRM-scale collections; not a substitute for Atlas at large scale. The flag defaults to `atlas_search: true` precisely so production keeps the indexed path.

### 2. Split text from filters (so only the text stage toggles)

Rather than branch the _whole_ pipeline per request — which would mean ~8 parallel pipeline copies guaranteed to drift, and a `filter_match` that silently does nothing in fallback mode — we pull the structural filters **out of `$search`** into a normal `$match` that runs in **both** modes. The flag then toggles only the text mechanism and the sort tie-break:

|         | Atlas + term            | Atlas, no term     | Fallback (any)                             |
| ------- | ----------------------- | ------------------ | ------------------------------------------ |
| Stage 1 | `$search` (text only)   | _(skipped)_        | _(skipped)_                                |
| Filter  | `$match` (filters)      | `$match` (filters) | `$match` (filters + `$or` regex when term) |
| Sort    | `score`, then tie-break | field sort         | field sort                                 |

**Two independent gating dimensions — keep them on the right operator.** The skeleton toggles on two things, and they resolve at different times:

- **`atlas_search`** is a `_module.var` — a build-time literal. When it's `false` the entire Atlas text mechanism can be dropped **at compile** with `_build.*`.
- **`term` (`_payload: filter.search`)** is runtime-only. "Skip `$search` when there's no search term" and the `score` toggle are **runtime** decisions, so the stages they gate must appear/disappear via a runtime `_array.concat` + `_if` returning `[]`/`[stage]` — exactly the pattern the current requests already use inside their `must` array. A runtime-gated stage cannot be spliced by an outer `_build.array.concat` (the build pass would try to flatten an unresolved operator).

So the **outer pipeline assembly is a runtime `_array.concat`**; `_build.*` is reserved for the `atlas_search` dimension alone (dropping the text mechanism when the flag is `false`). Resulting pipeline skeleton (per request):

```yaml
pipeline:
  _array.concat: # runtime concat — `text_lead`/`score_addfields` appear/disappear on the runtime term
    - <text_lead> # [ $search text-only ] when atlas_search (build) && term (runtime), else []
    - - $match:
          $and: # array of clause objects; empty entries dropped (see "Merge semantics" below)
            - <structural filters> # standard Mongo query, written once
            - <regex_clause> # { $or: [...] } when !atlas && term, else omitted
            - request_stages.filter_match # consumer $match clauses (see decision 4)
    - <score_addfields> # [ { $addFields: { score: { $meta: searchScore } } } ] when atlas && term, else []
    -  # ...existing $facet / $sort / $skip / $limit / derived stages...
```

Each gated piece is a runtime `_if` (on `term`) wrapped by a build-time `_build.if` (on `atlas_search`): when `atlas_search` is `false` the builder emits a literal `[]` at compile, so no `$search`/`score` operator survives into the runtime pipeline at all; when it's `true` the builder emits the runtime `_if` that gates on `term`.

The `$sort` inside the facet uses `score` only when `atlas_search && term`; otherwise the existing field sort (`sort.by`/`sort.order` + `_id`). This is a small tweak to the runtime `_if` test each request already has — the `$facet` continues to use `_build.array.concat` to splice the build-time-known `request_stages.*` stages, which is correct because those splice points are build-time literals.

**Merge semantics — `$and`, not shallow assign.** The `$match` body combines three sources that can collide on a key: the structural filters, the `regex_clause` (`{ $or: [...] }`), and the consumer `request_stages.filter_match`. A shallow `_object.assign` is last-writer-wins keyed by top-level field, so collisions vanish silently — concretely, `get_activities` filters `updated.timestamp` twice (`filter.date_from` → `$gte`, `filter.date_to` → `$lte`); merged as two assign entries the second clobbers the first and one bound is lost. Likewise a consumer `filter_match` using `$or` would clobber the regex clause's `$or`. So the `$match` body wraps the clauses in a top-level **`$and`** array (empty entries dropped), which composes any clauses without key collisions and is collision-proof by construction rather than by authoring discipline. (The doubled `updated.timestamp` bounds may still be authored as one nested object for tidiness, but `$and` no longer _requires_ it.)

**Emergent property:** when there's no search term, `$search` is skipped entirely, so the browse / filter / paginate path becomes `$match`+`$sort` on **both** Atlas and local — identical behaviour. Only an actual text query diverges between modes. This shrinks the surface that needs Atlas-specific testing to "did someone type in the search box."

### 3. `returnStoredSource` makes filters-in-`$match` fast (no perf regression)

The classic reason to keep filters inside the `$search.compound` is to filter on the search index before the `_id`→full-document hydration round-trip from `mongot` back to `mongod`. That rationale only holds **without** stored source. With `returnStoredSource: true` and a `storedSource`-configured index, `$search` returns documents straight from `mongot`, skipping the hydration round-trip — so a `$match` over those returned docs costs no extra round trip. Moving filters to `$match` is therefore comparably fast _and_ readable _and_ works unchanged in fallback mode.

This is already the de-facto pattern (7/8 requests). We standardise it: the shared text-stage builder always emits `returnStoredSource: true`, which also fixes the `activities` inconsistency.

**The footgun (documented prominently):** if `storedSource` omits a field that a post-`$search` `$match` references, `returnStoredSource` docs silently lack it. A `hidden: { $ne: true }` filter then stops excluding hidden docs (missing ≠ `true`), and positive `equals`-style filters exclude everything. Mitigation: configure **`storedSource: true`** (store the whole document) — see decision 5.

**This footgun is already live, not hypothetical.** `search_contacts` today runs `returnStoredSource: true` and then `$match`es on `hidden`, `disabled`, and `global_attributes.company_ids`. With no search index committed anywhere, if the deployed `default` index doesn't store those fields the filter is _already silently wrong on Atlas_. So `storedSource: true` (decision 5) isn't only fallback-enabling — it closes a pre-existing latent correctness gap, which strengthens the case for storing the whole document by default.

### 4. Flag shape: boolean `atlas_search`, default `true`

Each searchable module gets:

```yaml
atlas_search:
  type: boolean
  default: true
  description: >-
    Whether the deployment's MongoDB has Atlas Search available. When true,
    text search uses Atlas `$search` (indexed, relevance-ranked). When false,
    text search falls back to a case-insensitive regex `$match` that runs on
    any MongoDB (community/local) — substring matching, no relevance ranking,
    and an unindexed scan, so suitable for development or small collections.
```

Boolean (not an enum) because regex is the only fallback we have a concrete need for; an enum would be speculative surface. It reads naturally as "default Atlas." Consumers that want to switch the whole app at once set it once in `app_config.yaml` and reference it per module entry — the same idiom already used for `app_name` (`_ref: app_config.yaml, key: ...`). The demo wires it this way so `pnpm ldf:b` + a local MongoDB works end-to-end.

Because the structural filters are now standard `$match`, the consumer hook `request_stages.filter_match` must also be standard `$match` syntax (not Atlas compound). This is a **breaking change** to that var, but it then works identically in both modes — one syntax instead of two. The demo does not pass `filter_match` (only `request_stages.write`), so blast radius is low; the change is called out in the module CHANGELOGs and the migration note below.

**Two consumer hooks, deliberately separate.** There are two filter-extension points, at different layers, and they stay distinct:

- `request_stages.filter_match` — a **module var** set by the app consumer on the module entry, feeding the heavy list/Excel requests. An **array of clauses**; converted from Atlas-compound to plain `$match` here.
- `filter` — a **component/`_ref` var** on the `search_contacts` selector pipeline, one layer down: the `contact-selector` block exposes it and passes it through to the typeahead request. A **single `$match` object**, default `{}`, and **already plain `$match`** today.

They differ on every axis — who sets it (app config vs. a page composing the selector block), which request it feeds (faceted list vs. capped typeahead), shape (array vs. object), and starting syntax — so unifying them would mean reworking the already-correct selector for no functional gain. Post-redesign both are plain `$match`, so they are consistent in _syntax_; they remain distinct in _name and layer_ by design.

### 5. Index definitions: committed JSON + docs, `storedSource: true`

We commit one Atlas Search index definition per searchable collection, in the ensure-index CI tool format (`{ name, mappings, storedSource }`), named **`default`** (our `$search` stages specify no `index:`, so Atlas uses `default`):

- `modules/contacts/search-indexes/default.search.json` → `user-contacts` (`profile.name`, `lowercase_email`). **This single index also serves `user-admin`**, which queries the same `user-contacts` collection — documented, not duplicated.
- `modules/companies/search-indexes/default.search.json` → `companies` (maps **`name`** + `lowercase_email`). **Coupling to the `name_field` var:** the committed JSON is static and maps the default `name`, but `get_all_companies` searches `_module.var: name_field` (consumer-overridable). A consumer who sets `name_field` to another field must **regenerate this search index to map that field** and redeploy it to Atlas — otherwise Atlas `$search` silently returns no text matches on the overridden field, while the regex fallback (which reads the same var at query time) still works, producing a confusing mode-dependent discrepancy. This obligation is documented in decision 6's `docs/shared/search.md` and the companies module reference. (We don't template the index JSON on `name_field`: it's consumed by external index tooling, not the Lowdefy build, so there's no clean templating hook, and `name` is the near-universal default.)
- `modules/activities/search-indexes/default.search.json` → `activities` (`title`, `description.text`).

Because filters moved to `$match`, the index **mappings only need the text fields** as `string` — none of the `token`/filter-field mappings a filters-in-`$search` index would carry. Every field is carried through for the `$match` by **`storedSource: true`** (store the whole document), the simplest correct default; it eliminates the missing-field footgun from decision 3 at the cost of extra index storage. Example:

```json
{
  "name": "default",
  "mappings": {
    "dynamic": false,
    "fields": {
      "profile": {
        "type": "document",
        "fields": { "name": { "type": "string" } }
      },
      "lowercase_email": { "type": "string" }
    }
  },
  "storedSource": true
}
```

Regular `mongod` indexes also matter — for the no-term browse path (decision 2) on Atlas _and_ for the fallback regex mode's filter/sort. These are documented per collection (fields such as `hidden`, `disabled`, `deleted.timestamp`, `updated.timestamp`, and the configured sort fields); they are normal indexes, so they're described in docs and left to the consuming app's index tooling to format.

### 6. Documentation

- `docs/shared/search.md` — new shared concept page: the `atlas_search` flag, what the fallback does and its limits (substring, no ranking, unindexed scan), the `returnStoredSource` + `storedSource: true` requirement, and the missing-field footgun. Linked from each searchable module's `index.md`.
- Per-module reference: the committed `default.search.json` plus the required regular `mongod` indexes. The companies reference also documents the `name_field`-override → regenerate-search-index coupling (decision 5).
- Manifest `description:` for the new `atlas_search` var (drives generated `docs/{module}/reference/vars.md` via `pnpm docs:gen`).

## Shared builder

`modules/shared/search/` holds the single source of truth for text-stage construction, referenced by all 8 requests with `vars`. It exposes (via `_ref` `key:`) the pieces each request splices. Each piece composes the two gating dimensions described in decision 2: a build-time `_build.if` on `atlas_search` wrapping a runtime `_if` on `term`.

- **lead** — when `atlas_search` is `true` (build), a runtime `_if`: `[ { $search: { returnStoredSource: true, compound: { should: [text, wildcard] } } } ]` when `term`, else `[]`; when `atlas_search` is `false`, a literal `[]` at compile.
- **regex_clause** — when `atlas_search` is `false` (build), a runtime `_if`: `{ $or: [ { <path>: { $regex: <escaped>, $options: i } }, ... ] }` when `term`, else `{}`; when `atlas_search` is `true`, a literal `{}` at compile.
- **score_addfields** — when `atlas_search` is `true` (build), a runtime `_if`: `[ { $addFields: { score: { $meta: searchScore } } } ]` when `term`, else `[]`; when `atlas_search` is `false`, a literal `[]` at compile.
- **use_score** — the request's `$sort` `_if` test. Build-collapses to `false` when `atlas_search` is `false`; otherwise a runtime predicate on `term`.

Because `term` is runtime, the splice points that consume `lead`/`score_addfields` (the outer pipeline `_array.concat`) must themselves be **runtime** `_array.concat`, never `_build.array.concat` — see decision 2. Vars: `{ atlas_search, term, paths }`. The builder owns regex escaping and the build/runtime composition of the `atlas_search`/`term` gates so no request re-derives them. This is what enforces "one correct way": adding a fifth searchable request, or changing how the fallback escapes input, is a one-file change.

## Files changed

**Modules (manifests + requests):**

- `modules/{contacts,user-admin,companies,activities}/module.lowdefy.yaml` — add `atlas_search` var; restate `request_stages.filter_match` description as `$match` syntax.
- **7 request files restructured** (filters → `$match`, text via shared builder): `contacts/requests/{get_all_contacts,get_contact_excel_data}.yaml`, `user-admin/requests/{get_all_users,get_user_excel_data}.yaml`, `companies/requests/{get_all_companies,get_company_excel_data}.yaml`, `activities/requests/get_activities.yaml`.
- **1 request adjusted** (already split — only the stage-1 toggle + `regex_clause`, no facet/score): `contacts/requests/search_contacts.yaml`.

**New shared + index files:**

- `modules/shared/search/*.yaml` — the text-stage builder.
- `modules/{contacts,companies,activities}/search-indexes/default.search.json`.

**Demo + docs:**

- `apps/demo/app_config.yaml` + per-module `vars.yaml` — wire `atlas_search` from a single source so a local-MongoDB build works.
- `docs/shared/search.md` (new); module `index.md` links; regenerated `docs/{module}/reference/vars.md`; CHANGELOG entries.

## Non-goals

- The `basic-contact-selector` (`get_contacts_for_selector`) — already non-Atlas, unchanged.
- Replicating relevance ranking in fallback mode — fallback intentionally uses field sort.
- Index-management tooling — we commit index JSON in the existing ensure-index format and document the regular indexes; running them against a cluster stays the consuming app's job.
- Atlas Search features beyond `text`/`wildcard` (synonyms, fuzzy, faceting) — none are used today.

## Migration note

`request_stages.filter_match` changes from Atlas-compound clauses to standard `$match` clauses (decision 4). The var **stays an array** — each element is now one Mongo query clause instead of an Atlas-compound clause, and the array is composed into the `$match` via `$and` (decision 2). Consumers passing custom `filter_match` rewrite each clause in Mongo query syntax. A multi-clause example:

```yaml
# before (Atlas-compound clauses)
- equals: { path: region, value: "x" }
- range: { path: score, gte: 10 }
# after (plain $match clauses — still an array, ANDed via $and)
- region: "x"
- score: { $gte: 10 }
```

Because the clauses are ANDed via `$and` (not shallow-merged), a clause using `$or` is safe and won't collide with the regex fallback's `$or`. The default (`[]`) is unaffected. Switching a deployment to `atlas_search: false` additionally requires the regular `mongod` indexes (documented) for acceptable performance.
