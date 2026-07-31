---
title: Indexes
module: activities
type: reference
concepts: [indexes, mongodb, atlas-search, stored-source, search, activities]
---

# Activities — Indexes

The module does not create indexes — index creation is a host-app concern. Host apps must add the following indexes to the collection backing the `activities-collection` connection (default `activities`) before running the list and Excel export flows.

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
      }
    }
  }
}
```

`title` and `description.text` are the only mapped fields, and both as `string` — they are the text paths the `$search` searches, with a `text` clause for whole-token relevance and a `wildcard: *term*` clause for substring matching. `description` is Tiptap rich text stored as `{ html, text }`, so it is mapped as a document with a `text` string child; the `html` sibling is deliberately unmapped, as searching markup would match tag names and attributes.

Nothing else needs mapping. The list's type, stage, contact, company and date-range filters, plus `deleted.timestamp` and any consumer `request_stages.filter_match` clauses, are all plain `$match` clauses — `mongot` never evaluates them, so none of them needs a `token`, `date`, or `objectId` mapping.

| Query site       | Searches                                           | Stored source |
| ---------------- | -------------------------------------------------- | ------------- |
| `get_activities` | `title`, `description.text` (list page search box) | No            |

`get_activities_excel_data` runs no `$search` — the Excel export is a plain `$match` pipeline — so it depends only on the regular indexes below.

### Stored source is deliberately **not** required

`get_activities` passes `returnStoredSource: false`. `mongot` returns matched `_id`s and `mongod` hydrates the live documents from the collection, so the `$match` that follows always sees current documents. Nothing reads `mongot`'s stored copy, and configuring `storedSource` would cost index storage on a path no query takes.

This is not an oversight, and the asymmetry with [`contacts`](../../contacts/reference/indexes.md) and [`companies`](../../companies/reference/indexes.md) — which do require whole-document stored source — is the point. The activities list is refetched immediately after every write, and `mongot`'s copy lags index replication: with stored source, editing an activity and refetching the list returns the pre-edit values. Reading live documents trades a hydration round trip for that freshness.

The trade also means this module gets no benefit from the missing-field footgun mitigation the other two need, because a live document cannot be missing a field the index failed to store. See [Search](../../shared/search.md) for the full trade-off.

## Regular `mongod` indexes

These matter in two situations, both of which bypass `$search` entirely:

- **The browse path on Atlas.** With no search term the list request skips `$search` and runs as a plain `$match` + `$sort`, which is the majority of list loads. The Excel export never uses `$search` at all.
- **Fallback mode.** With `atlas_search: false` there is no `$search`; text matching becomes a `$regex` `$or` inside the same `$match`.

| Index                                 | Serves                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `{ "updated.timestamp": -1, _id: 1 }` | The default list sort (`Date Updated`) and the Excel export's fixed sort |
| `{ "created.timestamp": -1, _id: 1 }` | The `Date Created` sort option                                           |
| `{ title: 1, _id: 1 }`                | The `Title` sort option                                                  |

```
db.activities.createIndex({ "updated.timestamp": -1, _id: 1 })
db.activities.createIndex({ "created.timestamp": -1, _id: 1 })
db.activities.createIndex({ title: 1, _id: 1 })
```

**Each index is the sort field plus `_id`, because that is the sort the list request builds** — `$sort: { <sort.by>: <order>, _id: 1 }`, the `_id` key being the stable tiebreaker that keeps pagination from repeating or skipping rows. Without an index matching the sort, MongoDB performs a blocking sort over the whole filtered set on every page load. The `{ "updated.timestamp": -1 }` index does double duty: the Excel export sorts by that field unconditionally.

**The unconditional exclusion is a residual filter, not an index prefix.** Both requests filter `deleted.timestamp: { $exists: false }`. Do not lead a compound index with it: an `$exists` predicate does not give the equality bound an index needs to preserve the sort order, so the query would serve the filter from the index and still pay for a blocking sort. It is also ineligible for a `partialFilterExpression`, which accepts `$exists: true` but not `$exists: false`. Index the sort field and let MongoDB apply the exclusion as a residual filter.

The optional filters — `type`, the stage (`status.stage` on the list, `status.0.stage` on the Excel export), `contacts.contact_id`, `company_ids`, and the `updated.timestamp` range — drop out of the `$match` when unset, so they cost nothing on a plain load. A deployment whose users lean on one of them heavily may want a compound index leading with that field, but the sort indexes above are what every load needs.

**Switching a deployment to `atlas_search: false` without these indexes gives performance acceptable only at small scale.** The fallback's `$regex` is an unindexed scan whatever indexes exist — a leading-wildcard pattern cannot use an index — so on a large `activities` collection every search reads the collection. Nothing here makes fallback text search fast; the indexes keep the far more common no-term browse, filter, and paginate path fast in both modes.
