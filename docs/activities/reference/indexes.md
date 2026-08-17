---
title: Indexes
module: activities
type: reference
concepts: [indexes, mongodb, atlas-search, stored-source, search, activities]
---

# Activities — Indexes

The module does not create indexes — index creation is a host-app concern. Everything below goes on the collection backing the module's `activities-collection` connection; that connection names `activities`, and an app that keeps its activities somewhere else remaps the connection in its module entry to one of its own and applies the indexes there.

The two kinds carry different weight. The **Atlas Search index is required** wherever `atlas_search` is `true`: without it the list and Excel export searches match nothing. The **regular `mongod` indexes** earn their place only on the reads that actually bound them — the list's date-range filter is the one built-in predicate that does, as that section explains. An unfiltered browse bounds none of them and scans the collection in either search mode.

**This contract is versioned with the module.** The search mappings below are narrow because every structural filter runs in a plain `$match` _after_ `$search`; they are correct from the module version that moved the filters onward. The module CHANGELOG records the version that changed the requirement, so an app upgrading knows to update its cluster's index, and an app still on an earlier version should read that version's copy of this page.

See [Search](../../shared/search.md) for the `atlas_search` flag and what the non-Atlas fallback does.

## Atlas Search index: `default` on `activities`

An Atlas Search index named **`default`** — the module's `$search` stage names no index, so Atlas resolves it to `default`.

```json
{
  "name": "default",
  "mappings": {
    "dynamic": false,
    "fields": {
      "title": { "type": "string" },
      "description": {
        "type": "document",
        "fields": { "text": { "type": "string" } }
      },
      "organization_id": { "type": "token" },
      "_id": { "type": "token" }
    }
  }
}
```

**`organization_id` and `_id` serve `compound.filter`, not the text search.** The `$search` here is emitted unconditionally (see [Search](../../shared/search.md)), so its compound always carries one `filter` clause — and Atlas refuses a compound whose clause lists are all empty. Under `auth.organizations.policy: tenant` that clause is a string `equals` on `organization_id`, the authored tenant clause the wall audits on every run; under `pinned` it is `exists` on `_id`, a match-all that narrows nothing. `dynamic: false` maps neither by default and a string `equals` requires a `token` mapping specifically, so both are listed explicitly. Keep both regardless of the policy the app runs today — an index missing the `organization_id` mapping blanks the list page the moment a deployment flips to `tenant`, fail-closed and silent.

`title` and `description.text` are the only mapped fields, and both as `string` — they are the text paths the `$search` searches, with a `text` clause for whole-token relevance and a `wildcard: *term*` clause for substring matching. `description` is Tiptap rich text stored as `{ html, text }`, so it is mapped as a document with a `text` string child; the `html` sibling is deliberately unmapped, as searching markup would match tag names and attributes.

Nothing else needs mapping. The list's type, stage, contact, company and date-range filters, plus `deleted.timestamp` and any consumer `request_stages.filter_match` clauses, are all plain `$match` clauses — `mongot` never evaluates them, so none of them needs a `token`, `date`, or `objectId` mapping.

| Query site       | Searches                                           | Stored source |
| ---------------- | -------------------------------------------------- | ------------- |
| `get_activities` | `title`, `description.text` (list page search box) | No            |

`get_activities_excel_data` runs no `$search` — the Excel export is a plain `$match` pipeline — so it depends only on the regular indexes below.

### Stored source is deliberately **not** required

`get_activities` passes `returnStoredSource: false`, so `mongot` returns matched `_id`s and `mongod` hydrates the live documents from the collection — the activities list is refetched immediately after every write, and `mongot`'s copy lags index replication, so a stored-source read would return pre-edit values. [`contacts`](../../contacts/reference/indexes.md) and [`companies`](../../companies/reference/indexes.md) require whole-document stored source; [Search](../../shared/search.md) states the trade and what each side costs.

## Regular `mongod` indexes

These matter in two situations that bypass `$search` entirely. The first is **fallback mode**: with `atlas_search: false` there is no `$search` stage, so the request is a plain `$match` + `$sort` and text matching becomes a `$regex` `$or` inside that same `$match`. The second is the **Excel export**, which runs no `$search` in either mode.

The list's Atlas browse path is not one of them. With `atlas_search: true` every load goes to `mongot`, term or no term — the `$search` stage is emitted unconditionally so that its `tenant: authored` declaration holds on the browse path as well as the search path, see [Search](../../shared/search.md).

| Index                                 | Sort it mirrors                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `{ "updated.timestamp": -1, _id: 1 }` | The default list sort (`Date Updated`) and the Excel export's fixed sort; also bounds the date-range filter |
| `{ "created.timestamp": -1, _id: 1 }` | The `Date Created` sort option                                                                              |
| `{ title: 1, _id: 1 }`                | The `Title` sort option                                                                                     |

```
db.activities.createIndex({ "updated.timestamp": -1, _id: 1 })
db.activities.createIndex({ "created.timestamp": -1, _id: 1 })
db.activities.createIndex({ title: 1, _id: 1 })
```

**Each index is a sort field plus `_id`, mirroring the sort the list request builds** — `$sort: { <sort.by>: <order>, _id: 1 }`, the `_id` key being the stable tiebreaker that keeps pagination from repeating or skipping rows.

**They serve the `$match`, not the `$sort`.** The list request sorts inside `$facet`; probed on mongod 7.0.24, that keeps the sort out of the query plan, so it runs in the aggregation layer as a blocking sort over the whole filtered set. It does not get the `$limit` pushdown a top-level sort does. The two plans are distinct: a top-level `$match` + `$sort` + `$limit` plans as `LIMIT <- FETCH <- IXSCAN`, with the limit inside the cursor; move that same `$sort` inside `$facet` and the plan is `FETCH <- IXSCAN` with the sort left as an aggregation stage and no limit in the cursor, so it streams every matching document into the sort. The Excel export's `$sort` is at top level but runs after `$addFields` and two `$lookup`s, which is equally unservable — probed, an `$addFields` alone is enough to leave the `$sort` in the aggregation layer. That cost is fixed by the pipelines' shape; no index removes it.

What an index earns is the filter: where the `$match` bounds an index's leading field the plan is `FETCH <- IXSCAN` rather than a collection scan. Index order buys nothing for the sort itself — an aggregation-layer `$sort` buffers its whole input whatever order that input arrives in. The list's date-range filter is the one built-in predicate that lands on a documented index: `date_from` and `date_to` add `updated.timestamp` `$gte`/`$lte` clauses to the `$match` in both requests, bounding the leading key of `{ "updated.timestamp": -1, _id: 1 }`. The other optional filters — `type`, the stage (`status.stage` on the list, `status.0.stage` on the Excel export), `contacts.contact_id`, `company_ids` — drop out of the `$match` when unset; a deployment whose users lean on one of them heavily may want a compound index leading with that field. With no term and no filter set the `$match` is the `deleted.timestamp` exclusion alone, which bounds no documented index's leading field, so that browse is a collection scan feeding a blocking in-memory sort.

**The unconditional exclusion is a residual filter, not an index prefix.** Both requests filter `deleted.timestamp: { $exists: false }`. Its bound covers nearly the whole collection — soft-deleted activities are a small minority — so a compound index leading with it narrows almost nothing while its scan reads nearly every key and fetches nearly every document. Selectivity is the objection, not ordering: probed on mongod 7.0.24, `$exists: false` compiles to a single `[null, null]` interval plus a residual filter, and a `{ "deleted.timestamp": 1, "updated.timestamp": -1 }` index does supply the trailing key's order. The predicate is also ineligible for a `partialFilterExpression`, which rejects `$exists: false` as a `$not` expression while accepting `$exists: true`. Index the sort fields and let MongoDB apply the exclusion as a residual filter.

**Switching a deployment to `atlas_search: false` without these indexes gives performance acceptable only at small scale.** The fallback's `$regex` is unanchored, so it cannot use an index to narrow — a leading wildcard gives nothing to seek on — and the predicate is evaluated against every document the query's other `$and` clauses let through. A type, stage, contact, company or date filter narrows that set first; a search box with nothing else set does not, so on a large `activities` collection that search reads nearly every activity. Nothing here makes fallback text search fast; what the indexes serve is the filtered read — the date-range browse most of all — in both modes.
