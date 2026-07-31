---
title: Indexes
module: companies
type: reference
concepts: [indexes, mongodb, atlas-search, stored-source, search, companies]
---

# Companies — Indexes

The module does not create indexes — index creation is a host-app concern. Host apps must add the following indexes to the collection backing the `companies-collection` connection (default `companies`) before running the list and Excel export flows.

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

| Index                                 | Serves                                                            |
| ------------------------------------- | ----------------------------------------------------------------- |
| `{ "updated.timestamp": -1, _id: 1 }` | The default list/Excel sort (`Date Updated`)                      |
| `{ "created.timestamp": -1, _id: 1 }` | The `Date Created` sort option                                    |
| `{ name: 1, _id: 1 }`                 | The `Name` sort option — on `name_field`, so an override moves it |

```
db.companies.createIndex({ "updated.timestamp": -1, _id: 1 })
db.companies.createIndex({ "created.timestamp": -1, _id: 1 })
db.companies.createIndex({ name: 1, _id: 1 })
```

**Each index is the sort field plus `_id`, because that is the sort the requests build** — `$sort: { <sort.by>: <order>, _id: 1 }`, the `_id` key being the stable tiebreaker that keeps pagination from repeating or skipping rows. Without an index matching the sort, MongoDB performs a blocking sort over the whole filtered set on every page load.

**The unconditional exclusion is a residual filter, not an index prefix.** Both queries filter `deleted.timestamp: { $exists: false }`. Do not lead a compound index with it: an `$exists` predicate does not give the equality bound an index needs to preserve the sort order, so the query would serve the filter from the index and still pay for a blocking sort. It is also ineligible for a `partialFilterExpression`, which accepts `$exists: true` but not `$exists: false`. Index the sort field and let MongoDB apply the exclusion as a residual filter — soft-deleted companies are a small minority, so there is little for a dedicated index to narrow.

**Switching a deployment to `atlas_search: false` without these indexes gives performance acceptable only at small scale.** The fallback's `$regex` is an unindexed scan whatever indexes exist — a leading-wildcard pattern cannot use an index — so on a large `companies` collection every search reads the collection. Nothing here makes fallback text search fast; the indexes keep the far more common no-term browse, filter, and paginate path fast in both modes.
