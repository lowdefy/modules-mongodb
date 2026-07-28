# Atlas Search fallback (search portability)

Several modules build their list pages, Excel exports, and the rich contact-selector typeahead on MongoDB Atlas `$search`, which only exists on Atlas (it needs the `mongot` process). On a community/local MongoDB server every one of these pipelines hard-fails, so the demo — and any self-hosted deployment — can't list contacts, companies, activities, or deals. This design makes text search **portable**: a module-level flag selects Atlas `$search` (the default) or a plain-MongoDB regex fallback, and the structural filtering is restructured so the same pipeline works in both modes. It also commits and documents the Atlas Search index definitions the modules have always silently depended on.

> **Scope correction (re-audited at task time).** The inventory below was written against an older tree. Two changes:
>
> - **`user-admin` is out of scope.** The BetterAuth rebuild removed `$search` from the module entirely — `get_all_users` / `get_user_excel_data` no longer exist, and `requests/stages/members_filter.yaml` is already a plain-`$match` case-insensitive regex over the post-`$lookup` name/email fields, with `request_stages.filter_match` already declared as plain `$match` clauses. It needs no `atlas_search` var and no request changes. Its search is _always_ the unindexed regex path, even on Atlas; that is documented, not changed.
> - **`deals` is in scope.** The module landed after this design was written and `requests/get_deals_list.yaml` leads with `$search`, so the demo's deal list hard-fails on local MongoDB — the design's own goal is not met without it. Like `search_contacts` it is **already split** (text-only `$search` followed by a `$match` with a `$and` array), so it needs only the stage-1 toggle, the regex clause, and the score-sort gate. It carries one Atlas-specific extra clause (a boosted keyword-analyzer wildcard on `_id`, the deal code) that the shared builder takes verbatim.
>
> Net: **7 requests across 4 modules** (`contacts`, `companies`, `activities`, `deals`) — 5 of them filters-in-`$search`, 2 already split.

## Proposed change

1. Add a boolean `atlas_search` var (default `true`) to every module that does text search (`contacts`, `companies`, `activities`, `deals`). When `false`, requests use a regex fallback instead of `$search`.
2. Split text search from structural filtering in all affected requests: structural filters (and the consumer filter hook) always run as a standard `$match`; only the free-text term toggles between an Atlas `$search` text stage and a case-insensitive `$regex` `$or`.
3. Centralise the text-stage / regex-clause construction in one shared `_ref` under `modules/shared/search/` so all requests build it identically ("one correct way").
4. Standardise `returnStoredSource: true` across all `$search` stages (adds it to `activities`, which is currently missing it) and skip `$search` entirely when there is no search term.
5. Commit the Atlas Search index definitions (one `default.search.json` per searchable collection, in the ensure-index CI tool format, with `storedSource: true`) and document both the search indexes and the regular `mongod` indexes the fallback/browse paths need.
6. Convert the consumer filter hook (`request_stages.filter_match`) from Atlas-compound syntax to standard `$match` syntax so it works unchanged in both modes (a breaking change to that var; the demo does not use it).

## Background: how search works today

`$search` is the **first stage** of 7 requests across 4 modules. `$search` is Atlas-only, so all 7 fail on local MongoDB:

| Module     | Requests                                      | Collection      | Shape                |
| ---------- | --------------------------------------------- | --------------- | -------------------- |
| contacts   | `get_all_contacts`, `get_contact_excel_data`  | `user-contacts` | filters-in-`$search` |
| contacts   | `search_contacts` (selector typeahead)        | `user-contacts` | already split        |
| companies  | `get_all_companies`, `get_company_excel_data` | `companies`     | filters-in-`$search` |
| activities | `get_activities`                              | `activities`    | filters-in-`$search` |
| deals      | `get_deals_list`                              | `deals`         | already split        |

`modules/contacts/requests/get_contacts_for_selector.yaml` (the `basic-contact-selector`) already uses `$match`+`$sort` with no `$search`, so it works on local today and is **out of scope**. So is `user-admin` — see the scope correction above.

**5 of the 7** requests have the same shape: a single `$search.compound` block mixing two unrelated concerns —

- **Free-text ranking** — a `should` of `text` + `wildcard *term*` over name/email-style fields (`profile.name`, `lowercase_email`; `title` + `description.text` for activities; `name_field` + `lowercase_email` for companies), with results ordered by `$meta: searchScore`.
- **Structural filters** — `equals`/`in`/`range`/`exists`/`mustNot` clauses (e.g. `hidden`, `disabled`, `deleted.timestamp`, `type`, `status.stage`, `roles`, date ranges) plus the consumer `request_stages.filter_match` var (documented as _"Atlas Search compound clauses"_).

The structural clauses all have exact plain-`$match` equivalents. Only the free-text part genuinely needs Atlas.

The other two are **already split**:

- `contacts/requests/search_contacts.yaml` (the rich-selector typeahead) — text-only `$search` followed by a standard `$match` carrying the structural filters, with its own consumer hook: the component-level `filter` var (already plain `$match`, see decision 4), not `request_stages.filter_match`. It has no `$facet`/score sort/pagination, so `score_addfields`/`use_score` are inapplicable — only the stage-1 `lead` toggle and the regex clause apply.
- `deals/requests/get_deals_list.yaml` — text-only `$search` followed by a `$match` whose body is already a `$and` array, then `$lookup` + `$facet`. It needs the toggle, the regex clause, and the score-sort gate (its facet `$sort` currently reads `score: -1` unconditionally, which relies on the missing field sorting as null when there is no term). Its `$search` searches `name` by text+wildcard **plus a boosted keyword-analyzer wildcard on `_id`** (the deal code), and it does not lowercase the term — see decision 2's note on `should_extra`.

Decision 2's filters→`$match` restructure therefore lands on the **5** filters-in-`$search` requests; the other two are brought into the same fallback story by the toggle + regex clause alone.

5 of the 7 requests already set `returnStoredSource: true`; `activities/get_activities.yaml` and `deals/get_deals_list.yaml` are the exceptions. **No search-index definition is committed anywhere in the repo** — the `storedSource` config these requests depend on is entirely undocumented, so a fresh Atlas project (or local setup) has no reference for what to create.

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
          $and: # every entry is spliced in as an array, so gated-off pieces leave nothing behind
            _array.concat:
              - - <structural filters> # standard Mongo query, written once
              - <regex_clause> # [ { $or: [...] } ] when !atlas && term, else []
              - <request_stages.filter_match> # consumer $match clauses, nulls dropped (decision 4)
    - <score_addfields> # [ { $addFields: { score: { $meta: searchScore } } } ] when atlas && term, else []
    -  # ...existing $facet / $sort / $skip / $limit / derived stages...
```

Each gated piece is a runtime `_if` (on `term`) wrapped by a build-time `_build.if` (on `atlas_search`): when `atlas_search` is `false` the builder emits a literal `[]` at compile, so no `$search`/`score` operator survives into the runtime pipeline at all; when it's `true` the builder emits the runtime `_if` that gates on `term`.

The `$sort` inside the facet uses `score` only when `atlas_search && term`; otherwise the existing field sort (`sort.by`/`sort.order` + `_id`). This is a small tweak to the runtime `_if` test each request already has — the `$facet` continues to use `_build.array.concat` to splice the build-time-known `request_stages.*` stages, which is correct because those splice points are build-time literals.

**Merge semantics — `$and`, not shallow assign.** The `$match` body combines three sources that can collide on a key: the structural filters, the `regex_clause` (`{ $or: [...] }`), and the consumer `request_stages.filter_match`. A shallow `_object.assign` is last-writer-wins keyed by top-level field, so collisions vanish silently — concretely, `get_activities` filters `updated.timestamp` twice (`filter.date_from` → `$gte`, `filter.date_to` → `$lte`); merged as two assign entries the second clobbers the first and one bound is lost. Likewise a consumer `filter_match` using `$or` would clobber the regex clause's `$or`. So the `$match` body wraps the clauses in a top-level **`$and`** array (empty entries dropped), which composes any clauses without key collisions and is collision-proof by construction rather than by authoring discipline. The `$and` array is never empty — every one of these requests carries at least one unconditional structural clause (`hidden`/`disabled`, `deleted.timestamp`, `removed`) — so the `$and: []` MongoDB rejects cannot arise. (The doubled `updated.timestamp` bounds may still be authored as one nested object for tidiness, but `$and` no longer _requires_ it.)

**Emergent property:** when there's no search term, `$search` is skipped entirely, so the browse / filter / paginate path becomes `$match`+`$sort` on **both** Atlas and local — identical behaviour. Only an actual text query diverges between modes. This shrinks the surface that needs Atlas-specific testing to "did someone type in the search box."

### 3. `returnStoredSource` makes filters-in-`$match` fast (no perf regression)

The classic reason to keep filters inside the `$search.compound` is to filter on the search index before the `_id`→full-document hydration round-trip from `mongot` back to `mongod`. That rationale only holds **without** stored source. With `returnStoredSource: true` and a `storedSource`-configured index, `$search` returns documents straight from `mongot`, skipping the hydration round-trip — so a `$match` over those returned docs costs no extra round trip. Moving filters to `$match` is therefore comparably fast _and_ readable _and_ works unchanged in fallback mode.

This is already the de-facto pattern (5 of the 7 requests). We standardise it: the shared text-stage builder always emits `returnStoredSource: true`, which also fixes the `activities` and `deals` inconsistencies.

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

Boolean (not an enum) because regex is the only fallback we have a concrete need for; an enum would be speculative surface. It reads naturally as "default Atlas." The demo wires it so `pnpm ldf:b` + a local MongoDB works end-to-end.

**How consumers set this app-wide: repeated per module entry, no shared config file.** This design originally proposed setting the flag once in `app_config.yaml` and `_ref`-ing it per module entry, by analogy with `app_name`. That analogy is gone: [`designs/app-operator`](../app-operator/design.md) removed the `app_name` var in favour of Lowdefy's `_app: slug` operator and **deleted `app_config.yaml` from every app**. So the boolean is simply set on each searchable module entry (four entries in the demo), and no shared-config file is reintroduced.

The drift objection that killed `app_config.yaml` does not transfer, because the two failure modes are not comparable:

- **`app_name` drift was silent and permanent.** Miss one entry and event/notification writes key under the wrong app for the lifetime of the document — nothing surfaces at build or at read time, and the damage is in stored data.
- **`atlas_search` drift fails loudly and immediately, and touches nothing stored.** Miss one entry on a community server and that module's list page hard-fails on its first load with an unrecognised-`$search` error. The flag only selects a query mechanism; no write path reads it.

A shared file would also not be free of the same class of mistake (a new module entry that forgets to `_ref` it), so it buys consistency in exactly the case that already fails loudly. There is no operator route either: `_app` reads only app metadata (`slug`, `name`, `version`, `description`) and cannot carry an arbitrary app-level flag, and `_secret` is server-runtime-only, which would forfeit decision 2's build-time collapse. Repeat the boolean.

Because the structural filters are now standard `$match`, the consumer hook `request_stages.filter_match` must also be standard `$match` syntax (not Atlas compound). This is a **breaking change** to that var, but it then works identically in both modes — one syntax instead of two. The demo does not pass `filter_match` (only `request_stages.write`), so blast radius is low; the change is called out in the module CHANGELOGs and the migration note below.

**Two consumer hooks, deliberately separate.** There are two filter-extension points, at different layers, and they stay distinct:

- `request_stages.filter_match` — a **module var** set by the app consumer on the module entry, feeding the heavy list/Excel requests. An **array of clauses**; converted from Atlas-compound to plain `$match` here.
- `filter` — a **component/`_ref` var** on the `search_contacts` selector pipeline, one layer down: the `contact-selector` block exposes it and passes it through to the typeahead request. A **single `$match` object**, default `{}`, and **already plain `$match`** today.

They differ on every axis — who sets it (app config vs. a page composing the selector block), which request it feeds (faceted list vs. capped typeahead), shape (array vs. object), and starting syntax — so unifying them would mean reworking the already-correct selector for no functional gain. Post-redesign both are plain `$match`, so they are consistent in _syntax_; they remain distinct in _name and layer_ by design.

### 5. Index definitions: committed JSON + docs, `storedSource: true`

We commit one Atlas Search index definition per searchable collection, in the ensure-index CI tool format (`{ name, mappings, storedSource }`), named **`default`** (our `$search` stages specify no `index:`, so Atlas uses `default`):

- `modules/contacts/search-indexes/default.search.json` → `user-contacts` (`profile.name`, `lowercase_email`). It serves both `get_all_contacts`/`get_contact_excel_data` and the `search_contacts` typeahead. It is **not** needed by `user-admin`, which reads the same `user-contacts` collection but no longer uses `$search` at all (see the scope correction) — `user-admin`'s list needs regular `mongod` indexes only, documented alongside the rest.
- `modules/companies/search-indexes/default.search.json` → `companies` (maps **`name`** + `lowercase_email`). **Coupling to the `name_field` var:** the committed JSON is static and maps the default `name`, but `get_all_companies` searches `_module.var: name_field` (consumer-overridable). A consumer who sets `name_field` to another field must **regenerate this search index to map that field** and redeploy it to Atlas — otherwise Atlas `$search` silently returns no text matches on the overridden field, while the regex fallback (which reads the same var at query time) still works, producing a confusing mode-dependent discrepancy. This obligation is documented in decision 6's `docs/shared/search.md` and the companies module reference. (We don't template the index JSON on `name_field`: it's consumed by external index tooling, not the Lowdefy build, so there's no clean templating hook, and `name` is the near-universal default.)
- `modules/activities/search-indexes/default.search.json` → `activities` (`title`, `description.text`).
- `modules/deals/search-indexes/default.search.json` → `deals` (`name`, plus `_id` with a `keywordAnalyzer` multi — `get_deals_list` searches the deal code through `path: { value: _id, multi: keywordAnalyzer }`, which requires the index to declare that multi analyzer: `"_id": { "type": "string", "multi": { "keywordAnalyzer": { "type": "string", "analyzer": "lucene.keyword" } } }`).

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

Regular `mongod` indexes also matter — for the no-term browse path (decision 2) on Atlas _and_ for the fallback regex mode's filter/sort. These are documented per collection (fields such as `hidden`, `disabled`, `deleted.timestamp`, `removed`, `updated.timestamp`, and the configured sort fields); they are normal indexes, so they're described in docs and left to the consuming app's index tooling to format. `user-admin` needs only these — its members search is always a regex `$match`, so it has no search-index requirement at all.

### 6. Documentation

- `docs/shared/search.md` — new shared concept page: the `atlas_search` flag, what the fallback does and its limits (substring, no ranking, unindexed scan), the `returnStoredSource` + `storedSource: true` requirement, and the missing-field footgun. Linked from each searchable module's `index.md`.
- Per-module reference: the committed `default.search.json` plus the required regular `mongod` indexes. The companies reference also documents the `name_field`-override → regenerate-search-index coupling (decision 5).
- `docs/user-admin/index.md` links the same shared page, stating that the module needs **no** `atlas_search` var because its members search is always a plain-`$match` regex. Without that note a reader comparing modules reads the missing var as an oversight.
- Manifest `description:` for the new `atlas_search` var (drives generated `docs/{module}/reference/vars.md` via `pnpm docs:gen`).

## Shared builder

`modules/shared/search/` holds the single source of truth for text-stage construction, referenced by all 7 requests with `_ref` + `vars` (the relative-path `_ref` idiom already used for `../shared/profile/*`, `../shared/layout/*`, `../shared/sessions/*`). It is **one file per splice point** — each is ref'd independently, so no `_ref` needs to combine `path` + `key` + `vars`, a combination with no precedent in this repo.

Every piece composes the two gating dimensions from decision 2: a build-time `_build.if` on `atlas_search` (passed in as `{ _module.var: atlas_search }`, which resolves before `_build.*` — the same shape `search_contacts.yaml` already uses for `_build.if` + `_var`) wrapping a runtime `_if` on `term`. Every piece that lands in a pipeline or `$and` position returns an **array** (`[]` or `[clause]`), so gated-off pieces vanish through `_array.concat` rather than leaving an empty object behind.

| File                   | Vars                                            | Returns                                                                                                                      |
| ---------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `text_lead.yaml`       | `atlas_search`, `term`, `paths`, `should_extra` | `[ { $search: { returnStoredSource: true, compound: { should: [...] } } } ]` when atlas (build) && term (runtime), else `[]` |
| `regex_value.yaml`     | `term`                                          | `{ $regex: <escaped term>, $options: i }` — owns escaping, nothing else                                                      |
| `regex_clause.yaml`    | `atlas_search`, `term`, `or`                    | `[ { $or: <or> } ]` when !atlas (build) && term (runtime), else `[]`                                                         |
| `score_addfields.yaml` | `atlas_search`, `term`                          | `[ { $addFields: { score: { $meta: searchScore } } } ]` when atlas && term, else `[]`                                        |
| `use_score.yaml`       | `atlas_search`, `term`                          | the `$sort` `_if` test — build-collapses to `false` when !atlas, else a runtime predicate on `term`                          |

**Why the regex fan-out is split across two files.** Building `$or: [ { <path>: <regex> }, … ]` from a `paths` list needs iteration with a dynamic key, and every available mechanism is either unproven here or breaks a caller: `_array.map` + `_function` would put the term's runtime operator inside a `_function` body (no precedent in this repo, and the `__`-prefix scoping rules make it a guess), a `_build.array.map` callback has no precedent either, and a `.yaml.njk` loop cannot interpolate `companies`' `paths` because one of them is `{ _module.var: name_field }` — an operator, not a literal string. So the fan-out is authored per request (2 clauses each; 3 for `deals`), each clause getting its regex value from `regex_value.yaml`. The security-relevant part — escaping — stays single-source, which is the point.

**Escaping** (verified, `_string.replace` is `String.prototype.replace` and is available server-side, where request properties evaluate):

```yaml
_string.replace:
  on:
    _var: term
  regex: '[.*+?^${}()|[\]\\/]'
  newSubstr: '\$&'
  regexFlags: g
```

Single-quoted YAML keeps both strings literal; `$&` re-inserts the matched metacharacter after the added backslash. Verified against `jo.h*n (a)+b[c]\d/e^$|{2}?` → `jo\.h\*n \(a\)\+b\[c\]\\d\/e\^\$\|\{2\}\?`, which matches the input literally and no longer matches `joXhnn`.

**`should_extra`** (default `[]`) exists for `deals`, whose Atlas clause set includes a boosted `keywordAnalyzer` wildcard on `_id` that must **not** be lowercased and must not join the `text` clause. The caller passes that clause verbatim and the builder splices it into the `should` array inside its gate, so a caller-specific Atlas quirk stays with its caller while the gating stays shared. The generic clauses lowercase the term (`_string.toLowerCase`), as 5 of the 7 requests already do — `search_contacts` and `deals`' generic `name` clause gain that lowercasing, which is what makes the `wildcard` clause match the lowercase-stored `lowercase_email`. The regex fallback needs no lowercasing; `$options: i` covers it.

Because `term` is runtime, the splice points that consume `text_lead`/`score_addfields` (the outer pipeline `_array.concat`) must themselves be **runtime** `_array.concat`, never `_build.array.concat` — see decision 2. Adding an eighth searchable request, or changing how the fallback escapes input, stays a one-file change.

## Files changed

**Modules (manifests + requests):**

- `modules/{contacts,companies,activities,deals}/module.lowdefy.yaml` — add `atlas_search` var; restate `request_stages.filter_match` description as `$match` syntax in the three modules that declare it (`deals` has no such var).
- **5 request files restructured** (filters → `$match`, text via shared builder): `contacts/requests/{get_all_contacts,get_contact_excel_data}.yaml`, `companies/requests/{get_all_companies,get_company_excel_data}.yaml`, `activities/requests/get_activities.yaml`.
- **2 requests adjusted** (already split — toggle + regex clause, plus the score-sort gate for `deals`): `contacts/requests/search_contacts.yaml`, `deals/requests/get_deals_list.yaml`.

**New shared + index files:**

- `modules/shared/search/*.yaml` — the text-stage builder (five files, see [§Shared builder](#shared-builder)).
- `modules/{contacts,companies,activities,deals}/search-indexes/default.search.json`.

**Demo + docs:**

- `apps/demo/modules/{contacts,companies,activities,deals}/vars.yaml` — set `atlas_search: false` on each entry so a local-MongoDB build works end-to-end (there is no shared config file — see decision 4).
- `docs/shared/search.md` (new); module `index.md` links; regenerated `docs/{module}/reference/vars.md`; a changeset for the four module packages.

## Non-goals

- The `basic-contact-selector` (`get_contacts_for_selector`) — already non-Atlas, unchanged.
- `user-admin` — out of scope entirely (see the scope correction). Its members search is a plain-`$match` regex over post-`$lookup` fields, so it is already portable. Giving it an `atlas_search` var, or moving it onto `$search` when the flag is `true`, would reintroduce Atlas surface the module deliberately dropped and would mean indexing fields that only coexist after the joins. Its unindexed-on-Atlas cost is documented, not fixed here.
- Replicating relevance ranking in fallback mode — fallback intentionally uses field sort.
- Index-management tooling — we commit index JSON in the existing ensure-index format and document the regular indexes; running them against a cluster stays the consuming app's job.
- Atlas Search features beyond `text`/`wildcard` (synonyms, fuzzy, faceting) — none are used today.

## Migration note

`request_stages.filter_match` changes from Atlas-compound clauses to standard `$match` clauses (decision 4) in the three modules that declare it — `contacts`, `companies`, `activities`. (`user-admin` declares the var too, but its clauses are **already** plain `$match`, so consumers of that module have nothing to change; `deals` declares no such var.) The var **stays an array** — each element is now one Mongo query clause instead of an Atlas-compound clause, and the array is composed into the `$match` via `$and` (decision 2). Consumers passing custom `filter_match` rewrite each clause in Mongo query syntax. A multi-clause example:

```yaml
# before (Atlas-compound clauses)
- equals: { path: region, value: "x" }
- range: { path: score, gte: 10 }
# after (plain $match clauses — still an array, ANDed via $and)
- region: "x"
- score: { $gte: 10 }
```

Because the clauses are ANDed via `$and` (not shallow-merged), a clause using `$or` is safe and won't collide with the regex fallback's `$or`. The default (`[]`) is unaffected. Switching a deployment to `atlas_search: false` additionally requires the regular `mongod` indexes (documented) for acceptable performance.
