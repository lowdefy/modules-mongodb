---
title: Indexes
module: companies
type: reference
concepts: [indexes, mongodb, atlas-search, stored-source, search, companies]
---

# Companies — Indexes

The module does not create indexes — index creation is a host-app concern. Host apps must add the following indexes to the collection backing the module's `companies-collection` connection before running the list and Excel export flows. That connection names `companies`; an app that keeps its companies somewhere else remaps the connection in its module entry to one of its own and applies the indexes there.

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

| Query site               | Searches                                               | Stored source |
| ------------------------ | ------------------------------------------------------ | ------------- |
| `get_all_companies`      | `name_field`, `lowercase_email` (list page search box) | Yes           |
| `get_company_excel_data` | `name_field`, `lowercase_email` (Excel export)         | Yes           |

### Coupling to the `name_field` var

Both requests search **`_module.var: name_field`**, not a literal `name`. The mappings above map its default, `name`. **A consumer who overrides `name_field` must map their field instead** — swap the `name` entry for the overridden path.

Getting this wrong fails in a way that is easy to misread, because it is mode-dependent. Atlas `$search` silently returns no text matches on an unmapped path: `dynamic: false` means an unmapped field is simply not searchable, and no error is raised. The regex fallback reads `name_field` at query time and needs no index, so the same search still works with `atlas_search: false`. The symptom is therefore "search by company name works locally and returns nothing in production", with nothing in either deployment's logs to explain it.

The same override also moves the `Name` sort option's field, so the regular index below follows `name_field` too.

### Whole-document stored source is required

Both requests pass `returnStoredSource: true`, so `mongot` returns the matched documents from its own copy and `mongod` never re-reads the collection. The `$match` that follows then runs against those returned documents. **A field the index does not store is simply absent from them**, and the failure is silent rather than an error:

- `deleted.timestamp: { $exists: false }` becomes true for every returned document, so **soft-deleted companies reappear** in search results and in the Excel export.
- Any positive consumer clause (a `request_stages.filter_match` equality) matches nothing, so the list comes back empty.

The contract is therefore **whole-document** stored source, expressed as `"storedSource": true`. `storedSource` also accepts an `{ "include": [...] }` / `{ "exclude": [...] }` form, but anything narrower has to cover every field a post-`$search` `$match` can reference — which includes consumer-supplied `request_stages.filter_match` clauses, fields the module cannot enumerate. Storing the whole document is the only form that is correct for every consumer.

## Regular `mongod` indexes

These matter in two situations, both of which bypass `$search` entirely:

- **The browse path on Atlas.** With no search term the requests skip `$search` and run as a plain `$match` + `$sort`, which is the majority of list loads.
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

**They serve the `$match`, not the `$sort`.** `get_all_companies` sorts inside `$facet` and `get_company_excel_data` sorts behind an `$addFields`; probed on mongod 7.0.24, both shapes keep the sort out of the query plan, so it runs in the aggregation layer as a blocking sort over the whole filtered set. The `$limit` pushdown a top-level sort gets goes with it — the same filter and sort plan as `LIMIT <- FETCH <- IXSCAN` at top level, but inside `$facet` the cursor streams every matching document into the sort. That cost is fixed by the pipeline's shape; no index removes it. What an index earns is the filter: where the `$match` bounds an index's leading field the plan is `FETCH <- IXSCAN` rather than a collection scan, and the documents then reach the aggregation layer already in index order, so the sort's input is pre-ordered. The `deleted.timestamp` exclusion alone bounds nothing worth seeking on, so these indexes pay off for the reads that do bound a sort field — a consumer `request_stages.filter_match` clause, or a host app's own date- or name-ordered query.

**The unconditional exclusion is a residual filter, not an index prefix.** Both queries filter `deleted.timestamp: { $exists: false }`. Its bound covers nearly the whole collection — soft-deleted companies are a small minority — so a compound index leading with it narrows almost nothing while its scan reads nearly every key and fetches nearly every document. Selectivity is the objection, not ordering: probed on mongod 7.0.24, `$exists: false` compiles to a single `[null, null]` interval plus a residual filter, and a `{ "deleted.timestamp": 1, "updated.timestamp": -1 }` index does supply the trailing key's order. The predicate is also ineligible for a `partialFilterExpression`, which rejects `$exists: false` as a `$not` expression while accepting `$exists: true`. Index the sort fields and let MongoDB apply the exclusion as a residual filter.

**Switching a deployment to `atlas_search: false` without these indexes gives performance acceptable only at small scale.** The fallback's `$regex` is unanchored, so it cannot use an index to narrow — a leading wildcard gives nothing to seek on — and the predicate is evaluated against every document the query's other `$and` clauses let through. On this collection that is the `deleted.timestamp` exclusion plus whatever a consumer adds, which on their own let nearly everything through, so on a large `companies` collection a search reads nearly every company. Nothing here makes fallback text search fast; what the indexes serve is the filtered read, in both modes.
