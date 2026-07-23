---
title: Deals
module: deals
type: index
---

# Deals

A workflow-driven deal (opportunity) workspace — a list page, a create form, and a master-detail workspace where a deal's pipeline actions, people, notes, files, tasks, and won/lost outcome are managed in one place. Deals are stored in their own collection with auto-generated consecutive IDs (`D-0001`, `D-0002`, …).

The module **orchestrates** the other modules rather than reimplementing them: the pipeline is a [`workflows`](../workflows/index.md) workflow rendered on the deal, people come from [`contacts`](../contacts/index.md), the account from [`companies`](../companies/index.md), attachments from [`files`](../files/index.md), the timeline from [`events`](../events/index.md) and [`activities`](../activities/index.md). The `deals` collection is host-app-owned and mapped in.

## Dependencies

| Module                             | Why                                              |
| ---------------------------------- | ------------------------------------------------ |
| [layout](../layout/index.md)       | Page wrapper                                     |
| [events](../events/index.md)       | Audit logging, `change_stamp`, timeline          |
| [activities](../activities/index.md) | Notes/activities timeline on the deal          |
| [files](../files/index.md)         | Deal attachments panel                           |
| [companies](../companies/index.md) | Company selector + company detail fields         |
| [contacts](../contacts/index.md)   | Deal people (roles), mentions, task assignees    |
| [workflows](../workflows/index.md) | The deal pipeline (actions, stages, outcome)     |

## When to use

Add `deals` when an app needs a pipeline-driven opportunity/deal workspace — a sales pipeline, an onboarding pipeline, or any "advance an entity through stages and record an outcome" surface (a deal can carry more than one workflow). The pipeline itself is defined as a `workflows` workflow (`workflow_type`), so the stages/actions are app-configured, not baked into the module.

## Quickstart

```yaml
# lowdefy.yaml (or modules.yaml)
modules:
  - id: deals
    source: "github:lowdefy/modules-mongodb/modules/deals@v0.13.0"
    vars:
      app_name: my-app
      workflow_type: sales-pipeline # the workflows workflow to render
      stages: # deal.status[].stage display config, keyed by stage slug
        prospecting: { title: Prospecting, fg: var(--ant-color-primary), bd: var(--ant-color-primary-border) }
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

| Index                | Fields                                                | Used by                                        |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| `company_status`     | `{ company_id: 1, "status.0.stage": 1 }`              | company-scoped deal lookups filtered by stage  |
| `salesperson_status` | `{ "salesperson.contact_id": 1, "status.0.stage": 1 }` | salesperson-scoped deal lookups by stage       |
| `status_updated`     | `{ "status.0.stage": 1, updated: -1 }`                | stage-filtered lists sorted by recency         |

### Search index

`get_deals_list` runs an Atlas `$search` stage against an index named `default` on `deals`, covering `name` (full-text) and `_id` (full-text + exact-match, for deal-code lookups). The consuming app owns creating this search index.
