---
title: Indexes
module: companies
type: reference
concepts: [indexes, mongodb, atlas-search, stored-source, search, companies]
---

# Companies — Indexes

The module does not create indexes — index creation is a host-app concern. Everything below goes on the collection backing the module's `companies-collection` connection; that connection names `companies`, and an app that keeps its companies somewhere else remaps the connection in its module entry to one of its own and applies the indexes there.

The two kinds carry different weight. The **Atlas Search index is required** wherever `atlas_search` is `true`: without it the list and Excel export searches match nothing, and without whole-document stored source the filters that run after `$search` are silently wrong. The **regular `mongod` indexes are not prerequisites** for those flows — none of the module's own browse queries bounds one of them, for the reasons that section gives. They serve the filtered reads a consumer or host app adds, in either search mode.

**This contract is versioned with the module.** The search mappings below are narrow because every structural filter runs in a plain `$match` _after_ `$search`; they are correct from the module version that moved the filters onward. The module CHANGELOG records the version that changed the requirement, so an app upgrading knows to update its cluster's index, and an app still on an earlier version should read that version's copy of this page.

See [Search](../../shared/search.md) for the `atlas_search` flag and what the non-Atlas fallback does.

## Atlas Search index: `default` on `companies`

An Atlas Search index named **`default`** — no `$search` stage in the module names a non-default index, so Atlas resolves them all to `default`.

```json
{
  "name": "default",
  "mappings": {
    "dynamic": false,
    "fields": {
      "name": { "type": "string" },
      "lowercase_email": { "type": "string" }
    }
  },
  "storedSource": true
}
```

`name` and `lowercase_email` are the only mapped fields, and both as `string` — they are the text paths both `$search` requests search, with a `text` clause for whole-token relevance and a `wildcard: *term*` clause for substring matching. Nothing else needs mapping: the structural filters (`deleted.timestamp`, and any consumer `request_stages.filter_match` clauses) are plain `$match` clauses, so `mongot` never evaluates them and needs no `token` mappings for them.

| Query site               | Searches                                                           | Stored source |
| ------------------------ | ------------------------------------------------------------------ | ------------- |
| `get_all_companies`      | `name` (the `name_field` var), `lowercase_email` (list search box) | Yes           |
| `get_company_excel_data` | `name` (the `name_field` var), `lowercase_email` (Excel export)    | Yes           |

### Coupling to the `name_field` var

Both requests search **`_module.var: name_field`**, not a literal `name`. The mappings above map its default, `name`. **A consumer who overrides `name_field` must map their field instead** — swap the `name` entry for the overridden path.

Getting this wrong fails in a way that is easy to misread, because it is mode-dependent. Atlas `$search` silently returns no text matches on an unmapped path: `dynamic: false` means an unmapped field is simply not searchable, and no error is raised. The regex fallback reads `name_field` at query time and needs no index, so the same search still works with `atlas_search: false`. The symptom is therefore "search by company name works locally and returns nothing in production", with nothing in either deployment's logs to explain it.

The same override also moves the `Name` sort option's field, so the regular index below follows `name_field` too.

### Whole-document stored source is required

Both requests pass `returnStoredSource: true`, so `mongot` returns the matched documents from its own copy and `mongod` never re-reads the collection. The `$match` that follows then runs against those returned documents. **A field the index does not store is simply absent from them**, and the failure is silent rather than an error:

- `deleted.timestamp: { $exists: false }` becomes true for every returned document, so **soft-deleted companies reappear** in search results and in the Excel export.
- Any positive consumer clause (a `request_stages.filter_match` equality) matches nothing, so the list comes back empty.

Filtering is not the only casualty: every stage after `$search` reads those same returned documents. The list's `$sort` inside `$facet` orders on whichever column the user picked — `updated.timestamp`, `created.timestamp`, or the `name_field` path — and the `$addFields` after it derives the `updated_at` / `created_at` display columns with `$dateToString` over `$updated.timestamp` and `$created.timestamp`. A stored source missing any of those sorts the page by an absent field and blanks the date columns.

The contract is therefore **whole-document** stored source, expressed as `"storedSource": true`. `storedSource` also accepts an `{ "include": [...] }` / `{ "exclude": [...] }` form, but anything narrower has to cover every field the stages after `$search` can reference — the sort and date-derivation fields above, plus consumer-supplied `request_stages.filter_match` clauses, which the module cannot enumerate. Storing the whole document is the only form that is correct for every consumer.

## Regular `mongod` indexes

These matter in two situations, both of which bypass `$search` entirely:

- **The browse path on Atlas.** With no search term the requests skip `$search` entirely and run as a plain `$match` + `$sort`; only an actual text query goes to `mongot`.
- **Fallback mode.** With `atlas_search: false` there is no `$search` at all; text matching becomes a `$regex` `$or` inside the same `$match`.

| Index                                 | Sort it mirrors                                                   |
| ------------------------------------- | ----------------------------------------------------------------- |
| `{ "updated.timestamp": -1, _id: 1 }` | The default list/Excel sort (`Date Updated`)                      |
| `{ "created.timestamp": -1, _id: 1 }` | The `Date Created` sort option                                    |
| `{ name: 1, _id: 1 }`                 | The `Name` sort option — on `name_field`, so an override moves it |

```
db.companies.createIndex({ "updated.timestamp": -1, _id: 1 })
db.companies.createIndex({ "created.timestamp": -1, _id: 1 })
db.companies.createIndex({ name: 1, _id: 1 })
```

**Each index is a sort field plus `_id`, mirroring the sort the requests build** — `$sort: { <sort.by>: <order>, _id: 1 }`, the `_id` key being the stable tiebreaker that keeps pagination from repeating or skipping rows.

**They serve the `$match`, not the `$sort`.** `get_all_companies` sorts inside `$facet` and `get_company_excel_data` sorts behind an `$addFields`; probed on mongod 7.0.24, both shapes keep the sort out of the query plan, so it runs in the aggregation layer as a blocking sort over the whole filtered set. Neither shape gets the `$limit` pushdown a top-level sort does. The two plans are distinct: a top-level `$match` + `$sort` + `$limit` plans as `LIMIT <- FETCH <- IXSCAN`, with the limit inside the cursor; move that same `$sort` inside `$facet` (or put an `$addFields` in front of it) and the plan is `FETCH <- IXSCAN` with the sort left as an aggregation stage and no limit in the cursor, so it streams every matching document into the sort. That cost is fixed by the pipeline's shape; no index removes it. What an index earns is the filter: where the `$match` bounds an index's leading field the plan is `FETCH <- IXSCAN` rather than a collection scan. Index order buys nothing for the sort itself — an aggregation-layer `$sort` buffers its whole input whatever order that input arrives in. A no-term browse with no consumer clause added leaves only the `deleted.timestamp` exclusion in the `$match`, which bounds no documented index's leading field, so that read is a collection scan feeding a blocking in-memory sort. These indexes pay off for the reads that do bound a sort field — a consumer `request_stages.filter_match` clause, or a host app's own date- or name-ordered query.

**The unconditional exclusion is a residual filter, not an index prefix.** Both queries filter `deleted.timestamp: { $exists: false }`. Its bound covers nearly the whole collection — soft-deleted companies are a small minority — so a compound index leading with it narrows almost nothing while its scan reads nearly every key and fetches nearly every document. Selectivity is the objection, not ordering: probed on mongod 7.0.24, `$exists: false` compiles to a single `[null, null]` interval plus a residual filter, and a `{ "deleted.timestamp": 1, "updated.timestamp": -1 }` index does supply the trailing key's order. The predicate is also ineligible for a `partialFilterExpression`, which rejects `$exists: false` as a `$not` expression while accepting `$exists: true`. Index the sort fields and let MongoDB apply the exclusion as a residual filter.

**Switching a deployment to `atlas_search: false` without these indexes gives performance acceptable only at small scale.** The fallback's `$regex` is unanchored, so it cannot use an index to narrow — a leading wildcard gives nothing to seek on — and the predicate is evaluated against every document the query's other `$and` clauses let through. On this collection that is the `deleted.timestamp` exclusion plus whatever a consumer adds, which on their own let nearly everything through, so on a large `companies` collection a search reads nearly every company. Nothing here makes fallback text search fast; what the indexes serve is the filtered read, in both modes.
