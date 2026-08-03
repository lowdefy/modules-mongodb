---
title: Indexes
module: contacts
type: reference
concepts: [indexes, mongodb, atlas-search, stored-source, search, contacts]
---

# Contacts — Indexes

The module does not create indexes — index creation is a host-app concern. Everything below goes on the collection backing the module's `contacts-collection` connection; that connection names `user-contacts`, and an app that keeps its people somewhere else remaps the connection in its module entry to one of its own and applies the indexes there.

The two kinds carry different weight. The **Atlas Search index is required** wherever `atlas_search` is `true`: without it the list, Excel export, and contact-selector searches match nothing, and without whole-document stored source the filters that run after `$search` are silently wrong. The **regular `mongod` indexes are not prerequisites** for those flows — none of the module's own browse queries bounds one of them, for the reasons that section gives. They serve the filtered reads a consumer or host app adds, in either search mode.

**This contract is versioned with the module.** The search mappings below are narrow because every structural filter runs in a plain `$match` _after_ `$search`; they are correct from the module version that moved the filters onward. The module CHANGELOG records the version that changed the requirement, so an app upgrading knows to update its cluster's index, and an app still on an earlier version should read that version's copy of this page.

See [Search](../../shared/search.md) for the `atlas_search` flag and what the non-Atlas fallback does.

## Atlas Search index: `default` on `user-contacts`

An Atlas Search index named **`default`** — no `$search` stage in the module names a non-default index, so Atlas resolves them all to `default`.

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
      "lowercase_email": { "type": "string" },
      "organizationId": { "type": "token" },
      "_id": { "type": "token" }
    }
  },
  "storedSource": true
}
```

**`organizationId` and `_id` serve `compound.filter`, not the text search.** Every `$search` here is emitted unconditionally (see [Search](../../shared/search.md)), so its compound always carries one `filter` clause — and Atlas refuses a compound whose clause lists are all empty. Under `auth.organizations.policy: tenant` that clause is a string `equals` on `organizationId`, the authored tenant clause the wall audits on every run; under `pinned` it is `exists` on `_id`, a match-all that narrows nothing. `dynamic: false` maps neither by default and a string `equals` requires a `token` mapping specifically, so both are listed explicitly. Keep both regardless of the policy the app runs today — an index missing the `organizationId` mapping blanks every list page the moment a deployment flips to `tenant`, fail-closed and silent.

`profile.name` and `lowercase_email` are the only mapped fields, and both as `string` — they are the two text paths every `$search` in this module searches, with a `text` clause for whole-token relevance and a `wildcard: *term*` clause for substring matching. Nothing else needs mapping: the structural filters (`hidden`, `disabled`, the selector's `global_attributes.company_ids` scope, its `filter` var, and any consumer `request_stages.filter_match` clauses) are plain `$match` clauses, so `mongot` never evaluates them and needs no `token` mappings for them.

| Query site               | Searches                                                                                                                                                                                                                                    | Stored source |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `get_all_contacts`       | `profile.name`, `lowercase_email` (list page search box)                                                                                                                                                                                    | Yes           |
| `get_contact_excel_data` | `profile.name`, `lowercase_email` (Excel export)                                                                                                                                                                                            | Yes           |
| `search_contacts`        | `profile.name`, `lowercase_email` (`contact-selector` typeahead, instantiated per selector as `<selector_id>_contact_search` with dots in the selector id replaced by underscores — `edit.ticket.subs` → `edit_ticket_subs_contact_search`) | Yes           |

`user-admin` reads the same `user-contacts` collection but uses **no** `$search` — its members filter is always a plain-`$match` regex — so this index is not a `user-admin` requirement.

### Whole-document stored source is required

All three requests pass `returnStoredSource: true`, so `mongot` returns the matched documents from its own copy and `mongod` never re-reads the collection. The `$match` that follows then runs against those returned documents. **A field the index does not store is simply absent from them**, and the failure is silent rather than an error:

- `hidden: { $ne: true }` and `disabled: { $ne: true }` stop excluding anything — a missing field is not `true`, so hidden and disabled contacts appear in the list and in the selector.
- A positive clause (`global_attributes.company_ids: { $in: … }`, or any consumer `filter` / `request_stages.filter_match` equality) matches nothing, so the list comes back empty.

Filtering is not the only casualty: every stage after `$search` reads those same returned documents. The list's `$sort` inside `$facet` orders on whichever column the user picked — `updated.timestamp`, `created.timestamp`, `profile.name` or `email` — and the `$addFields` after it derives the `updated_at` / `created_at` display columns with `$dateToString` over `$updated.timestamp` and `$created.timestamp`. A stored source missing any of those sorts the page by an absent field and blanks the date columns.

The contract is therefore **whole-document** stored source, expressed as `"storedSource": true`. `storedSource` also accepts an `{ "include": [...] }` / `{ "exclude": [...] }` form, but anything narrower has to cover every field the stages after `$search` can reference — the sort and date-derivation fields above, plus consumer-supplied `request_stages.filter_match` clauses and the selector's `filter` var, which the module cannot enumerate. Storing the whole document is the only form that is correct for every consumer.

## Regular `mongod` indexes

These matter in **fallback mode**, now the only situation that bypasses `$search` entirely. With `atlas_search: false` there is no `$search` stage: the request is a plain `$match` + `$sort`, and text matching becomes a `$regex` `$or` inside that same `$match`.

With `atlas_search: true` every load goes to `mongot` instead, term or no term. The `$search` stage is emitted unconditionally so that its `tenant: authored` declaration holds on the browse path as well as the search path — see [Search](../../shared/search.md). There is therefore no Atlas browse path left for these indexes to serve.

| Index                                 | Sort it mirrors                              |
| ------------------------------------- | -------------------------------------------- |
| `{ "updated.timestamp": -1, _id: 1 }` | The default list/Excel sort (`Date Updated`) |
| `{ "created.timestamp": -1, _id: 1 }` | The `Date Created` sort option               |
| `{ "profile.name": 1, _id: 1 }`       | The `Name` sort option                       |
| `{ email: 1, _id: 1 }`                | The `Email` sort option                      |

```
db["user-contacts"].createIndex({ "updated.timestamp": -1, _id: 1 })
db["user-contacts"].createIndex({ "created.timestamp": -1, _id: 1 })
db["user-contacts"].createIndex({ "profile.name": 1, _id: 1 })
db["user-contacts"].createIndex({ email: 1, _id: 1 })
```

**Each index is a sort field plus `_id`, mirroring the sort the requests build** — `$sort: { <sort.by>: <order>, _id: 1 }`, the `_id` key being the stable tiebreaker that keeps pagination from repeating or skipping rows.

**They serve the `$match`, not the `$sort`.** `get_all_contacts` sorts inside `$facet` and `get_contact_excel_data` sorts behind an `$addFields`; probed on mongod 7.0.24, both shapes keep the sort out of the query plan, so it runs in the aggregation layer as a blocking sort over the whole filtered set. Neither shape gets the `$limit` pushdown a top-level sort does. The two plans are distinct: a top-level `$match` + `$sort` + `$limit` plans as `LIMIT <- FETCH <- IXSCAN`, with the limit inside the cursor; move that same `$sort` inside `$facet` (or put an `$addFields` in front of it) and the plan is `FETCH <- IXSCAN` with the sort left as an aggregation stage and no limit in the cursor, so it streams every matching document into the sort. That cost is fixed by the pipeline's shape; no index removes it. What an index earns is the filter: where the `$match` bounds an index's leading field the plan is `FETCH <- IXSCAN` rather than a collection scan. Index order buys nothing for the sort itself — an aggregation-layer `$sort` buffers its whole input whatever order that input arrives in. A no-term browse with no consumer clause added leaves only the `hidden`/`disabled` exclusions in the `$match`, which bound no documented index's leading field, so that read is a collection scan (probed on mongod 7.0.24) feeding a blocking in-memory sort. On this collection these indexes pay off for the reads that do bound a sort field — a consumer `request_stages.filter_match` clause, the selector's `filter` var, or a host app's own date-ordered query.

**The unconditional exclusions are residual filters, not index prefixes.** Every one of these queries filters `hidden: { $ne: true }` and `disabled: { $ne: true }`. They are low-selectivity negations that exclude a small minority of contacts, so a compound index leading with them narrows almost nothing. `$ne` also compiles to multi-interval index bounds — probed on mongod 7.0.24, `[MinKey, true)` plus `(true, MaxKey]` — so a `{ hidden: 1, disabled: 1, "updated.timestamp": -1 }` index cannot supply a trailing sort key's order either: a top-level sort on `updated.timestamp` over that index plans as `FETCH <- SORT <- IXSCAN`. They are ineligible for a `partialFilterExpression` as well, which rejects `$ne` as a `$not` expression while accepting `$exists: true`. Index the sort fields and let MongoDB apply the two exclusions as residual filters.

**Switching a deployment to `atlas_search: false` without these indexes gives performance acceptable only at small scale.** The fallback's `$regex` is unanchored, so it cannot use an index to narrow — a leading wildcard gives nothing to seek on — and the predicate is evaluated against every document the query's other `$and` clauses let through. On this collection those other clauses are the `hidden`/`disabled` exclusions, which let nearly everything through, so on a large `user-contacts` collection a keystroke-driven search reads nearly every contact. Nothing here makes fallback text search fast; what the indexes serve is the filtered read, in both modes.
