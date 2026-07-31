---
title: Deals
module: deals
type: index
---

# Deals

A workflow-driven deal (opportunity) workspace — a list page, a create form, and a master-detail workspace where a deal's pipeline actions, people, notes, files, tasks, and won/lost outcome are managed in one place. Deals are stored in their own collection with auto-generated consecutive IDs (`D-0001`, `D-0002`, …).

The module **orchestrates** the other modules rather than reimplementing them: the pipeline is a [`workflows`](../workflows/index.md) workflow rendered on the deal, people come from [`contacts`](../contacts/index.md), the account from [`companies`](../companies/index.md), attachments from [`files`](../files/index.md), the timeline from [`events`](../events/index.md) and [`activities`](../activities/index.md). The `deals` collection is host-app-owned and mapped in.

## Dependencies

| Module                               | Why                                           |
| ------------------------------------ | --------------------------------------------- |
| [layout](../layout/index.md)         | Page wrapper                                  |
| [events](../events/index.md)         | Audit logging, `change_stamp`, timeline       |
| [activities](../activities/index.md) | Notes/activities timeline on the deal         |
| [files](../files/index.md)           | Deal attachments panel                        |
| [companies](../companies/index.md)   | Company selector + company detail fields      |
| [contacts](../contacts/index.md)     | Deal people (roles), mentions, task assignees |
| [workflows](../workflows/index.md)   | The deal pipeline (actions, stages, outcome)  |

## When to use

Add `deals` when an app needs a pipeline-driven opportunity/deal workspace — a sales pipeline, an onboarding pipeline, or any "advance an entity through stages and record an outcome" surface (a deal can carry more than one workflow). The pipeline itself is defined as a `workflows` workflow (`workflow_type`), so the stages/actions are app-configured, not baked into the module.

## Quickstart

```yaml
# lowdefy.yaml (or modules.yaml)
modules:
  - id: deals
    source: "github:lowdefy/modules-mongodb/modules/deals@v0.13.0"
    vars:
      workflow_type: sales-pipeline # the workflows workflow to render
      stages: # deal.status[].stage display config, keyed by stage slug
        prospecting:
          {
            title: Prospecting,
            fg: var(--ant-color-primary),
            bd: var(--ant-color-primary-border),
          }
      # Host domain fields — rendered as inputs on the create form and read-only
      # on the deal view (SmartDescriptions). Block ids prefixed `attributes.`.
      fields:
        - id: attributes.sector
          type: Selector
          properties:
            title: Sector
            options: [{ value: manufacturing, label: Manufacturing }]
```

See the [vars reference](reference/vars.md) for the full list (required + optional).

## Required indexes

The list/workspace pipelines assume the consuming app applies these indexes on the mapped `deals` collection. The module documents the contract; the app owns creating them (e.g. under its own `actions/indexes/indexes/{app}/deals/` via `splice-actions`).

**This contract is versioned with the module.** The search mappings below are narrow because every structural filter runs in a plain `$match` _after_ `$search`; they are correct from the module version that moved the filters onward. The CHANGELOG records the version that changed the requirement, so an app upgrading knows to update its cluster's index, and an app still on an earlier version should read that version's copy of this page.

### Regular `mongod` indexes

| Index                | Fields                                                 | Used by                                        |
| -------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| `company_status`     | `{ company_id: 1, "status.0.stage": 1 }`               | company-scoped deal lookups filtered by stage  |
| `salesperson_status` | `{ "salesperson.contact_id": 1, "status.0.stage": 1 }` | salesperson-scoped deal lookups by stage       |
| `status_updated`     | `{ "status.0.stage": 1, "updated.timestamp": -1 }`     | stage-filtered lists sorted by recency         |
| `updated`            | `{ "updated.timestamp": -1 }`                          | the deal list's sort, on every unsearched load |

The deal list sorts by `updated.timestamp: -1` whenever no search term is active — which is the majority of loads, and every load in fallback mode — so without an index on that field MongoDB performs a blocking sort over the whole filtered set each time.

`get_deals_list` also filters `removed: null` unconditionally. Do not lead a compound index with it: the clause excludes only a small minority of deals, and the list's other filters (`status.0.stage`, `company_id`, `salesperson.name`, `outcome.type`, `outcome.reason`) are `$in` predicates that drop out when unset, so neither gives an index the equality bound it would need to also supply the sort. Index the sort field and let MongoDB apply `removed: null` as a residual filter.

These indexes matter in two situations, both of which bypass `$search` entirely: the browse path on Atlas (no term, so no `$search` stage), and fallback mode (`atlas_search: false`, no `$search` at all). **Switching a deployment to `atlas_search: false` without them gives performance acceptable only at small scale** — and the fallback's `$regex` text match is an unindexed scan whatever indexes exist, since a leading-wildcard pattern cannot use one.

### Atlas Search index: `default` on `deals`

An Atlas Search index named **`default`** — the module's `$search` stage names no index, so Atlas resolves it to `default`.

```json
{
  "name": "default",
  "mappings": {
    "dynamic": false,
    "fields": {
      "name": { "type": "string" },
      "_id": {
        "type": "string",
        "multi": {
          "keywordAnalyzer": { "type": "string", "analyzer": "lucene.keyword" }
        }
      }
    }
  }
}
```

`name` and `_id` are the only mapped fields. `_id` holds the deal code (`D-0001`), which `get_deals_list` searches through `path: { value: _id, multi: keywordAnalyzer }` — so the index must declare that `keywordAnalyzer` multi, or the deal-code clause finds nothing. Company name is not stored on the deal document (it comes from a `$lookup`), so it is a `$match` filter rather than a search field and needs no mapping. Nothing else needs mapping either: the stage, company, salesperson and outcome filters are plain `$match` clauses that `mongot` never evaluates.

| Query site       | Searches                                                      | Stored source |
| ---------------- | ------------------------------------------------------------- | ------------- |
| `get_deals_list` | `name`, and the deal code via `_id`'s `keywordAnalyzer` multi | No            |

**Stored source is deliberately not required.** `get_deals_list` passes `returnStoredSource: false`: `mongot` returns matched `_id`s and `mongod` hydrates the live documents, so the `$match` that follows always sees current documents. The deal list is refetched after every deal write and `mongot`'s copy lags index replication, so a stored-source row could come back showing pre-edit values. Reading live documents trades a hydration round trip for that freshness — the same trade [`activities`](../activities/reference/indexes.md) makes, and the opposite of [`contacts`](../contacts/reference/indexes.md) and [`companies`](../companies/reference/indexes.md), whose `$search` requests do require whole-document stored source. See [Search](../shared/search.md).
