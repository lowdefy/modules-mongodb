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
    source: "github:lowdefy/modules-mongodb/modules/deals@v0.36.0"
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

## Workflow form data on the deal

Values captured in workflow action forms live on the workflow documents, not on the deal. `get_selected_deal` joins **all** of the deal's workflows and exposes their form data on the deal as:

```
workflows.{workflow_type}.{action_type}.{field}
```

Each of the deal's workflow types appears under its own key, so a deal running two chained workflows exposes both. The key is the workflow *type*, not the instance — if a deal ever carries two workflows of the same type, only one of them is exposed here. Host `request_stages.get_selected_deal` stages and host-injected tiles (e.g. via `info_grid_slots`) read through this shape — for example `workflows.sales-pipeline.volumes.annual_volume_ton`.

An instanced action keys its own form data by instance, so those reads carry a fourth segment: `workflows.{workflow_type}.{action_type}.{key}.{field}`.

## Workflow state on the deal view

The deal view seeds the selected deal's `get-entity-workflows` response into `entity_workflows` page state, and reseeds it on mount, on deal switch, on a related-deal click, and after a check action completes. Blocks injected through `topbar_slots`, `main_slots`, `sidebar_slots` or `info_grid_slots` render inside that page, so they can read it with `_state: entity_workflows` and stay in step with the rest of the workspace.

Each entry is a workflow carrying `workflow_type`, `title` and `groups[].actions[]`, where each action has `status`, `message` and a server-resolved `link`. Two rules are worth mirroring rather than reinventing: the terminal statuses are **`done` and `not-required`** — the set the engine's own `deriveGroupStatus` treats as closed — and "this deal's workflow work is finished" means every action of **every** workflow is terminal, not just the first. That distinction matters as soon as a lifecycle chains two workflows, where a rule written against one would fire early.

## Extending deal creation

`create-deal` persists whatever the host's `fields` blocks bind under `attributes.*`, so a host that only needs to **store** something needs nothing more. A host that needs creation to also **do** something — write to another collection, back-fill a field on the linked company — supplies routine steps through the `hooks` var.

| Slot | In scope | On failure |
| --- | --- | --- |
| `pre_insert` | the create payload: `_payload: form.*` and `_payload: attributes.*` | no deal is written |
| `post_insert` | the above, plus `_step: deals_insert_deal.insertedId` | the deal exists with no workflow |

Pick the slot by what the steps need to **do**, not by what they need to see:

- **`pre_insert` is for validation.** It is the only point at which a create can still be stopped — a `:reject: <message>` there surfaces the message on the page and no deal is written.
- **`post_insert` is for side effects**, including ones that don't need the deal id. There is no transaction around the routine, so a write made from `pre_insert` stays behind if the insert then fails — leaving, say, a company stamped from a deal that never existed. From `post_insert` the deal is already committed, so nothing can strand the write.

"The create aborts" means no *deal* was written. It does not mean the hook's own writes are undone; nothing here rolls back. Past the insert that is doubly true, so keep `post_insert` steps idempotent.

`post_insert` runs **before** the workflow starts, not after. That ordering is deliberate: a failing hook then leaves a deal with no workflow, which a host can detect and repair, rather than a workflow pointing at a deal that was never created, which it cannot. Steps run server-side in the same request as the insert — these are routine steps, not a client action list like the activities module's `hooks.on_created`.

Host steps are spliced into the module's own routine and share its step namespace. **Step ids beginning `deals_` are reserved.** Reusing one does not fail the build; it shadows the module's step at runtime, and `deals_insert_deal` in particular would break the workflow link and the returned deal id.

Hooks may reach another module's connection by its scoped id. The demo app does both slots, in `apps/demo/modules/deals/vars.yaml`: `pre_insert` refuses a deal against a deleted company, and `post_insert` back-fills that company's industry from a field the deal form captured and stamps it with the new deal's id.

```yaml
hooks:
  pre_insert:
    - id: check_company_active
      type: MongoDBFindOne
      connectionId: companies/companies-collection
      properties:
        filter:
          _id:
            _payload: form.company_id
    - :if:
        _ne:
          - _step: check_company_active.deleted
          - null
      :then:
        :reject: That company has been deleted. Pick another company for this deal.
```

## Required indexes

The list/workspace pipelines assume the consuming app applies these indexes on the mapped `deals` collection. The module documents the contract; the app owns creating them (e.g. under its own `actions/indexes/indexes/{app}/deals/` via `splice-actions`).

**This contract is versioned with the module.** The search mappings in the next section are narrow because every structural filter runs in a plain `$match` _after_ `$search`; they are correct from the module version that moved the filters onward. The module CHANGELOG records the version that changed the requirement, so an app upgrading knows to update its cluster's index, and an app still on an earlier version should read that version's copy of this page.

### Atlas Search index: `default` on `deals`

An Atlas Search index named **`default`** — `get_deals_list`'s `$search` names no index, so Atlas resolves it to `default`.

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
      },
      "organization_id": { "type": "token" }
    }
  }
}
```

> **This index does not yet exist on the QA cluster.** `listSearchIndexes()` on `deals` returns nothing, which is why the deal search box has never worked under either policy. Because the `$search` stage is now unconditional, the deal list needs this index to load at all — create it before deploying, and see [Search](../shared/search.md) for the `atlas_search: false` alternative if Atlas Search is unavailable.

**`organization_id` serves `compound.filter`, not the text search.** The `$search` is emitted unconditionally (see [Search](../shared/search.md)), so its compound always carries one `filter` clause — and Atlas refuses a compound whose clause lists are all empty. Under `auth.organizations.policy: tenant` that clause is a string `equals` on `organization_id`, the authored tenant clause the wall audits on every run; under `pinned` it is `exists` on `_id`, which the mapping below already covers. `dynamic: false` maps nothing by default and a string `equals` requires a `token` mapping specifically, so `organization_id` is listed explicitly. Keep it regardless of the policy the app runs today — an index missing it blanks the deal list the moment a deployment flips to `tenant`, fail-closed and silent.

`name`, `_id` and `organization_id` are the only mapped fields. `_id` holds the deal code (`D-0001`), which `get_deals_list` searches through `path: { value: _id, multi: keywordAnalyzer }` — so the index must declare that `keywordAnalyzer` multi, or the deal-code clause finds nothing. Company name is not searchable at all: it is not stored on the deal document, and the list's `$lookup` fetches it for display only — the company filter matches `company_id`. Nothing else needs mapping either: the stage, company, salesperson and outcome filters are plain `$match` clauses that `mongot` never evaluates.

| Query site       | Searches                                                      | Stored source |
| ---------------- | ------------------------------------------------------------- | ------------- |
| `get_deals_list` | `name`, and the deal code via `_id`'s `keywordAnalyzer` multi | No            |

**Stored source is deliberately not required.** `get_deals_list` passes `returnStoredSource: false`, so `mongot` returns matched `_id`s and `mongod` hydrates the live documents — the deal list is refetched after every deal write, and `mongot`'s copy lags index replication, so a stored-source read would return pre-edit values. [`activities`](../activities/reference/indexes.md) makes the same trade; [`contacts`](../contacts/reference/indexes.md) and [`companies`](../companies/reference/indexes.md) require whole-document stored source, and [Search](../shared/search.md) states the trade and what each side costs.

### Regular `mongod` indexes

| Index                | Fields                                                 | Used by                                                                         |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `company_status`     | `{ company_id: 1, "status.0.stage": 1 }`               | company-scoped deal lookups filtered by stage                                   |
| `salesperson_status` | `{ "salesperson.contact_id": 1, "status.0.stage": 1 }` | salesperson-scoped deal lookups by stage                                        |
| `status_updated`     | `{ "status.0.stage": 1, "updated.timestamp": -1 }`     | stage-filtered list loads — the `status.0.stage` `$in` bounds the leading key   |
| `updated`            | `{ "updated.timestamp": -1 }`                          | `updated.timestamp`-ordered reads a host app issues itself — see the note below |

```
db.deals.createIndex({ company_id: 1, "status.0.stage": 1 }, { name: "company_status" })
db.deals.createIndex({ "salesperson.contact_id": 1, "status.0.stage": 1 }, { name: "salesperson_status" })
db.deals.createIndex({ "status.0.stage": 1, "updated.timestamp": -1 }, { name: "status_updated" })
db.deals.createIndex({ "updated.timestamp": -1 }, { name: "updated" })
```

`status_updated`'s second key is `"updated.timestamp"`, not `updated`: the change stamp is a subdocument and every deals pipeline orders on its `timestamp` path, which an index on the parent field does not serve. A deployment holding a `{ "status.0.stage": 1, updated: -1 }` index needs it rebuilt in this shape.

**These indexes serve the `$match`, not the `$sort`.** `get_deals_list` sorts inside `$facet`, and on `{ score: -1, "updated.timestamp": -1 }` — `score` being a computed `$meta` field. Probed on mongod 7.0.24, a `$sort` inside `$facet` stays out of the query plan entirely: it runs in the aggregation layer as a blocking sort over the whole filtered set, and it does not get the `$limit` pushdown a top-level sort does. The two plans are distinct: a top-level `$match` + `$sort` + `$limit` plans as `LIMIT <- FETCH <- IXSCAN`, with the limit inside the cursor; move that same `$sort` inside `$facet` and the plan is `FETCH <- IXSCAN` with the sort left as an aggregation stage and no limit in the cursor, so it streams every matching deal into the sort. That cost is fixed by the pipeline's shape; no index removes it. What an index earns is the filter: where the `$match` bounds an index's leading field the plan is `FETCH <- IXSCAN` rather than a collection scan. Index order buys nothing for the sort itself — an aggregation-layer `$sort` buffers its whole input whatever order that input arrives in.

**The `updated` row has no in-module beneficiary.** No deals request carries an `updated.timestamp` _predicate_ — the field appears only as a sort key (`get_deals_list` and `get_active_deals` inside `$facet`, the related-deals `$lookup` in `get_selected_deal` inside its sub-pipeline), so nothing the module issues bounds this index's leading field. Nor can a single-key `{ "updated.timestamp": -1 }` index supply the list's order: that sort is two keys, `{ score: -1, "updated.timestamp": -1 }`. It is here for a host app's own `updated.timestamp`-ordered reads over the `deals` collection.

`get_deals_list` filters `removed: null` unconditionally, and its other filters (`status.0.stage`, `company_id`, `salesperson.name`, `outcome.type`, `outcome.reason`) are `$in` or equality predicates that drop out of the `$match` when unset. Do not lead a compound index with `removed`: the clause excludes only a small minority of deals, so as a prefix it narrows almost nothing. Let MongoDB apply it as a residual filter and index the fields users actually filter on. With no term and no filter set the `$match` is `removed: null` alone, which bounds no documented index's leading field, so that browse is a collection scan feeding a blocking in-memory sort.

These indexes matter in **fallback mode** (`atlas_search: false`), now the only situation that bypasses `$search` entirely. The Atlas browse path is no longer one: with `atlas_search: true` every load goes to `mongot`, term or no term, because the `$search` stage is emitted unconditionally so that its `tenant: authored` declaration holds on the browse path as well as the search path. **Switching a deployment to `atlas_search: false` without them gives performance acceptable only at small scale** — the fallback's `$regex` is unanchored, so it cannot use an index to narrow, and the predicate is evaluated against every deal the query's other `$and` clauses let through. A stage or company filter narrows that set first; a search box with nothing else set does not.

## Shared idioms

- [Text search and the Atlas fallback](../shared/search.md) — the `atlas_search` flag, index requirements, and what the fallback trades away
