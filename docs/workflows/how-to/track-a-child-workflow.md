---
title: Track a Child Workflow
module: workflows
type: how-to
concepts: [tracker, start-link, child-workflow, parent-action]
---

# Track a child workflow

**Goal:** Add a `kind: tracker` action to a parent workflow so that it mirrors the lifecycle of a child workflow running on a related entity — and provide a `start_link` so users can create the child entity from the tracker card.

**Prerequisites:** Two workflow types must exist (parent and child). The child workflow's `entity_collection` must already be declared. Understanding of [Action kinds](../concepts/action-kinds.md) — the tracker section.

## How tracker actions work

A tracker action has no submit endpoint and no edit page. Its status updates automatically whenever the child workflow transitions via the engine's tracker subscription. Once a child workflow is linked (via `start-workflow` with `parent_action_id`), the mapping is:

| Child workflow stage | Parent tracker action status |
| -------------------- | ---------------------------- |
| `active`             | `in-progress`                |
| `completed`          | `done`                       |
| `cancelled`          | `not-required`               |

Before a child is linked, the tracker sits at `action-required`. `start_link` provides the navigation target for that state so users know where to go to create the child entity.

## Steps

### 1. Declare the tracker action YAML

The tracker in the `onboarding` demo workflow tracks a `company-setup` child workflow:

```yaml
# onboarding/track-company-setup.yaml
type: track-company-setup
title: Company Setup
kind: tracker
action_group: conversion
blocked_by:
  - upload-po
description: Tracks the company-setup workflow on the converted company.
access:
  demo:
    view: true
    edit: true # controls start_link visibility
tracker:
  child_workflow_type: company-setup
  start_link:
    pageId:
      _module.pageId: { id: new, module: companies }
    urlQuery:
      action_id: true # → tracker action _id (passed as parent_action_id to start-workflow)
      entity_id: true # → lead _id (referenced by the convert event)
```

Key fields:

- `tracker.child_workflow_type` — the `type` of the child workflow to mirror.
- `tracker.start_link.pageId` — the page where users create the child entity. Can be a plain string (e.g., `company-new`) or a `_module.pageId` operator for cross-module page references.
- `tracker.start_link.urlQuery.action_id: true` — substituted with the tracker action's `_id` at render time. The child-creation page passes this to `start-workflow` as `parent_action_id`.
- `tracker.start_link.urlQuery.entity_id: true` — substituted with the parent workflow's entity `_id` at render time. Use this to prefill the child entity's parent reference.

`action_id: true` and `entity_id: true` are the two reserved `urlQuery` keys that receive runtime substitution. Any other key is passed through verbatim.

### 2. Add the tracker to the workflow's `starting_actions`

Seed it at `blocked` if it has `blocked_by`, or `action-required` if it is immediately available:

```yaml
# onboarding/onboarding.yaml
starting_actions:
  - type: qualify
    status: action-required
  - type: send-quote
    status: blocked
  - type: schedule-followup
    status: blocked
  - type: upload-po
    status: blocked
  - type: track-company-setup
    status: blocked # ← unblocks once upload-po is done
```

### 3. Reference the tracker in the workflow's `actions:` list

```yaml
actions:
  - _ref: modules/workflows/workflow_config/onboarding/qualify.yaml
  - _ref: modules/workflows/workflow_config/onboarding/site-visit.yaml
  - _ref: modules/workflows/workflow_config/onboarding/send-quote.yaml
  - _ref: modules/workflows/workflow_config/onboarding/schedule-followup.yaml
  - _ref: modules/workflows/workflow_config/onboarding/upload-po.yaml
  - _ref: modules/workflows/workflow_config/onboarding/track-company-setup.yaml # ← add
```

### 4. Wire the child workflow's start endpoint on the child-creation page

On the page the `start_link` points to, call the child workflow type's `{type}-start` endpoint with `parent_action_id` populated from the URL query param. This establishes the bidirectional link in a single call. The endpoint is type-scoped — its id is built from the workflow type (here `company-setup-start`), so the workflow type is **not** passed in the payload:

```yaml
# On the child-entity new page — e.g., companies/new.yaml
- id: start_child_workflow
  type: CallApi
  endpointId:
    _module.endpointId: { id: company-setup-start, module: workflows }
  payload:
    entity_id:
      _state: company._id # the just-created child entity id
    entity_collection:
      _module.connectionId: { id: companies-collection, module: companies }
    parent_action_id:
      _url_query: action_id # passed by the tracker's start_link urlQuery
```

The engine writes in one call:

1. The new child workflow doc (with back-references to the parent).
2. The child's starting action docs.
3. The parent tracker action's `child_workflow_id`, `child_entity_id`, and `child_entity_collection` fields, plus the `in-progress` transition.

No follow-up API call is needed to wire the link.

### 5. Add status copy for the tracker states

Tracker actions can reach `blocked`, `action-required`, `in-progress`, `done`, and `not-required`. Add a `status_map` with meaningful messages for each:

```yaml
status_map:
  blocked:
    demo:
      message: Convert the lead to a customer once the purchase order is uploaded.
  action-required:
    demo:
      message: Convert the lead to a customer.
  in-progress:
    demo:
      message: Company setup in progress.
  done:
    demo:
      message: Company setup complete.
  not-required:
    demo:
      message: Conversion skipped.
```

### 6. The `edit` verb gates `start_link` visibility

`start_link` is only rendered for apps that declare `edit` in the tracker's `access` block. An app with only `view` sees the tracker card as display-only — no navigation link to the child-creation page. To make the tracker display-only for an app, omit `edit:`:

```yaml
access:
  demo:
    view: true
    edit: true # start_link visible in demo
  read-only-app:
    view: true # no start_link in read-only-app
```

## When to use `start_link` vs a paired trigger action

- **App page owns creation → `start_link`.** When the child entity is created on a normal app page (a new-company form, new-ticket form, etc.), add `start_link` to the tracker. The `onboarding` demo uses this pattern: `start_link` points to the companies `new` page.
- **Inline form owns creation → paired trigger + tracker.** When creation needs a small inline form with no existing app page, use a `kind: form` trigger action to create the entity and call `start-workflow`, plus a separate tracker action to mirror the child's lifecycle.

## See also

- [Action kinds](../concepts/action-kinds.md) — full tracker kind reference, instanced action form data paths, `start_link` wiring, and the `none` creation row.
- [Exports](../reference/exports.md) — `start-workflow` endpoint payload reference.
- [FSM and signals](../reference/fsm-and-signals.md) — tracker FSM table and `internal_mirror_child_*` signals.
- [Authoring grammar](../reference/authoring-grammar.md) — `tracker:` block field reference and `urlQuery` reserved keys.
