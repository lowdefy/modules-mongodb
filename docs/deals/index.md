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
    source: "github:lowdefy/modules-mongodb/modules/deals@v0.36.0"
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

| Index                | Fields                                                | Used by                                        |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| `company_status`     | `{ company_id: 1, "status.0.stage": 1 }`              | company-scoped deal lookups filtered by stage  |
| `salesperson_status` | `{ "salesperson.contact_id": 1, "status.0.stage": 1 }` | salesperson-scoped deal lookups by stage       |
| `status_updated`     | `{ "status.0.stage": 1, updated: -1 }`                | stage-filtered lists sorted by recency         |

### Search index

`get_deals_list` runs an Atlas `$search` stage against an index named `default` on `deals`, covering `name` (full-text) and `_id` (full-text + exact-match, for deal-code lookups). The consuming app owns creating this search index.
