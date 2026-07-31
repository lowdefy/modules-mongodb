---
title: Indexes
module: contacts
type: reference
concepts: [indexes, mongodb, atlas-search, stored-source, search, contacts]
---

# Contacts — Indexes

The module does not create indexes — index creation is a host-app concern. Host apps must add the following indexes to the collection backing the `contacts-collection` connection (default `user-contacts`) before running the list, Excel export, and contact-selector flows.

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
      "lowercase_email": { "type": "string" }
    }
  },
  "storedSource": true
}
```

`profile.name` and `lowercase_email` are the only mapped fields, and both as `string` — they are the two text paths every `$search` in this module searches, with a `text` clause for whole-token relevance and a `wildcard: *term*` clause for substring matching. Nothing else needs mapping: the structural filters (`hidden`, `disabled`, and any consumer `request_stages.filter_match` clauses) are plain `$match` clauses, so `mongot` never evaluates them and needs no `token` mappings for them.

| Query site               | Searches                                                                                                                      | Stored source |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `get_all_contacts`       | `profile.name`, `lowercase_email` (list page search box)                                                                      | Yes           |
| `get_contact_excel_data` | `profile.name`, `lowercase_email` (Excel export)                                                                              | Yes           |
| `search_contacts`        | `profile.name`, `lowercase_email` (`contact-selector` typeahead, instantiated per selector as `<selector_id>_contact_search`) | Yes           |

`user-admin` reads the same `user-contacts` collection but uses **no** `$search` — its members filter is always a plain-`$match` regex — so this index is not a `user-admin` requirement.

### Whole-document stored source is required

All three requests pass `returnStoredSource: true`, so `mongot` returns the matched documents from its own copy and `mongod` never re-reads the collection. The `$match` that follows then runs against those returned documents. **A field the index does not store is simply absent from them**, and the failure is silent rather than an error:

- `hidden: { $ne: true }` and `disabled: { $ne: true }` stop excluding anything — a missing field is not `true`, so hidden and disabled contacts appear in the list and in the selector.
- A positive clause (`global_attributes.company_ids: { $in: … }`, or any consumer `filter` / `request_stages.filter_match` equality) matches nothing, so the list comes back empty.

The contract is therefore **whole-document** stored source, expressed as `"storedSource": true`. `storedSource` also accepts an `{ "include": [...] }` / `{ "exclude": [...] }` form, but anything narrower has to cover every field a post-`$search` `$match` can reference — which includes consumer-supplied `request_stages.filter_match` clauses and the selector's `filter` var, fields the module cannot enumerate. Storing the whole document is the only form that is correct for every consumer.

## Regular `mongod` indexes

These matter in two situations, both of which bypass `$search` entirely:

- **The browse path on Atlas.** With no search term the requests skip `$search` and run as a plain `$match` + `$sort`, which is the majority of list loads.
- **Fallback mode.** With `atlas_search: false` there is no `$search` at all; text matching becomes a `$regex` `$or` inside the same `$match`.

| Index                                 | Serves                                       |
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

**Each index is the sort field plus `_id`, because that is the sort the requests build** — `$sort: { <sort.by>: <order>, _id: 1 }`, the `_id` key being the stable tiebreaker that keeps pagination from repeating or skipping rows. Without an index matching the sort, MongoDB performs a blocking sort over the whole filtered set on every page load.

**The unconditional exclusion is a residual filter, not an index prefix.** Every one of these queries filters `hidden: { $ne: true }` and `disabled: { $ne: true }`. Do not lead a compound index with those fields: `$ne` produces a multi-interval index scan, which destroys the ordering the sort needs, so a `{ hidden: 1, disabled: 1, "updated.timestamp": -1 }` index would serve the filter and then still pay for a blocking sort. They are also ineligible for a `partialFilterExpression`, which does not accept `$ne`. Index the sort field and let MongoDB apply the two exclusions as a residual filter — they are low-selectivity negations that exclude a small minority of contacts, so there is little for a dedicated index to narrow.

**Switching a deployment to `atlas_search: false` without these indexes gives performance acceptable only at small scale.** The fallback's `$regex` is an unindexed scan whatever indexes exist — a leading-wildcard pattern cannot use an index — so on a large `user-contacts` collection every keystroke-driven search reads the collection. Nothing here makes fallback text search fast; the indexes keep the far more common no-term browse, filter, and paginate path fast in both modes.
