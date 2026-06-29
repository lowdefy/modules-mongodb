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

Every affected request has the same shape: a single `$search.compound` block mixing two unrelated concerns —

- **Free-text ranking** — a `should` of `text` + `wildcard *term*` over name/email-style fields (`profile.name`, `lowercase_email`; `title` + `description.text` for activities; `name_field` + `lowercase_email` for companies), with results ordered by `$meta: searchScore`.
- **Structural filters** — `equals`/`in`/`range`/`exists`/`mustNot` clauses (e.g. `hidden`, `disabled`, `deleted.timestamp`, `type`, `status.stage`, `roles`, date ranges) plus the consumer `request_stages.filter_match` var (documented as _"Atlas Search compound clauses"_).

The structural clauses all have exact plain-`$match` equivalents. Only the free-text part genuinely needs Atlas.

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

Resulting pipeline skeleton (per request):

```yaml
pipeline:
  _build.array.concat:
    - <text_lead> # [ $search text-only ] when atlas_search && term, else []
    - - $match:
          _object.assign:
            - <structural filters> # standard Mongo query, written once
            - <regex_clause> # { $or: [...] } when !atlas && term, else {}
            - request_stages.filter_match # consumer $match clause (see decision 4)
    - <score_addfields> # [ { $addFields: { score: { $meta: searchScore } } } ] when atlas && term, else []
    -  # ...existing $facet / $sort / $skip / $limit / derived stages...
```

The `$sort` inside the facet uses `score` only when `atlas_search && term`; otherwise the existing field sort (`sort.by`/`sort.order` + `_id`). This is a small tweak to the `_if` test each request already has.

**Emergent property:** when there's no search term, `$search` is skipped entirely, so the browse / filter / paginate path becomes `$match`+`$sort` on **both** Atlas and local — identical behaviour. Only an actual text query diverges between modes. This shrinks the surface that needs Atlas-specific testing to "did someone type in the search box."

### 3. `returnStoredSource` makes filters-in-`$match` fast (no perf regression)

The classic reason to keep filters inside the `$search.compound` is to filter on the search index before the `_id`→full-document hydration round-trip from `mongot` back to `mongod`. That rationale only holds **without** stored source. With `returnStoredSource: true` and a `storedSource`-configured index, `$search` returns documents straight from `mongot`, skipping the hydration round-trip — so a `$match` over those returned docs costs no extra round trip. Moving filters to `$match` is therefore comparably fast _and_ readable _and_ works unchanged in fallback mode.

This is already the de-facto pattern (7/8 requests). We standardise it: the shared text-stage builder always emits `returnStoredSource: true`, which also fixes the `activities` inconsistency.

**The footgun (documented prominently):** if `storedSource` omits a field that a post-`$search` `$match` references, `returnStoredSource` docs silently lack it. A `hidden: { $ne: true }` filter then stops excluding hidden docs (missing ≠ `true`), and positive `equals`-style filters exclude everything. Mitigation: configure **`storedSource: true`** (store the whole document) — see decision 5.

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

### 5. Index definitions: committed JSON + docs, `storedSource: true`

We commit one Atlas Search index definition per searchable collection, in the ensure-index CI tool format (`{ name, mappings, storedSource }`), named **`default`** (our `$search` stages specify no `index:`, so Atlas uses `default`):

- `modules/contacts/search-indexes/default.search.json` → `user-contacts` (`profile.name`, `lowercase_email`). **This single index also serves `user-admin`**, which queries the same `user-contacts` collection — documented, not duplicated.
- `modules/companies/search-indexes/default.search.json` → `companies` (configured `name_field`, default `name`; `lowercase_email`).
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
- Per-module reference: the committed `default.search.json` plus the required regular `mongod` indexes.
- Manifest `description:` for the new `atlas_search` var (drives generated `docs/{module}/reference/vars.md` via `pnpm docs:gen`).

## Shared builder

`modules/shared/search/` holds the single source of truth for text-stage construction, referenced by all 8 requests with `vars`. It exposes (via `_ref` `key:`) the pieces each request splices:

- **lead** — `[ { $search: { returnStoredSource: true, compound: { should: [text, wildcard] } } } ]` when `atlas_search && term`, else `[]`.
- **regex_clause** — `{ $or: [ { <path>: { $regex: <escaped>, $options: i } }, ... ] }` when `!atlas_search && term`, else `{}`.
- **score_addfields** — `[ { $addFields: { score: { $meta: searchScore } } } ]` when `atlas_search && term`, else `[]`.
- **use_score** — boolean (`atlas_search && term`) the request's `$sort` `_if` keys off.

Vars: `{ atlas_search, term, paths }`. The builder owns regex escaping and the `atlas_search && term` predicate so no request re-derives them. This is what enforces "one correct way": adding a fifth searchable request, or changing how the fallback escapes input, is a one-file change.

## Files changed

**Modules (manifests + requests):**

- `modules/{contacts,user-admin,companies,activities}/module.lowdefy.yaml` — add `atlas_search` var; restate `request_stages.filter_match` description as `$match` syntax.
- 8 request files restructured (filters → `$match`, text via shared builder): `contacts/requests/{search_contacts,get_all_contacts,get_contact_excel_data}.yaml`, `user-admin/requests/{get_all_users,get_user_excel_data}.yaml`, `companies/requests/{get_all_companies,get_company_excel_data}.yaml`, `activities/requests/get_activities.yaml`.

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

`request_stages.filter_match` changes from Atlas-compound clauses to a standard `$match` expression (decision 4). Consumers passing custom `filter_match` must rewrite those clauses in Mongo query syntax — e.g. `{ equals: { path: "region", value: "x" } }` becomes `{ region: "x" }`. The default (`[]`/`{}`) is unaffected. Switching a deployment to `atlas_search: false` additionally requires the regular `mongod` indexes (documented) for acceptable performance.
