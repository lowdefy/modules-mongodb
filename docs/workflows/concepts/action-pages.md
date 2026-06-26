---
title: Action pages
module: workflows
type: concept
concepts: [action-pages, workspace, entity_view, check-page, breadcrumbs]
---

# Workflows — Action pages

Every action a user opens — whether a `kind: form` action or a `kind: check` action — renders in the same **three-tier workspace**. The shell is layout-only and identical across page kinds, so navigating between actions in a workflow never produces a jarring column shift; only the middle content (and whether the right column shows a Details tab) changes.

```
┌──────────────────┬────────────────────────┬───────────────────────────┐
│ entity's          │  action surface         │  universal fields card    │
│ workflows + steps │  (form / check body)    │  Tabs[ Details? · History ]│
│ (actions-on-      │                         │                           │
│  entity)          │                         │                           │
└──────────────────┴────────────────────────┴───────────────────────────┘
```

- **Left** — the `actions-on-entity` widget: every workflow attached to this entity with its action list. The current action's row links back to its own page.
- **Middle** — the action surface. For a form action this is the form (edit / view / review / error verb). For a check action it is the check surface: the optional `entity_view` review subject, a comment field, and the signal button bar.
- **Right** — the universal-fields card (`assignees`, `due_date`, `description`) above a Tabs wrapper. The **History** tab is always present (the action-filtered events timeline). The **Details** tab appears only when the workflow declares an `entity_view` slot (form pages only — see below); when absent, History is the sole tab and the Tabs wrapper stays so the layout is stable form↔check.

## The per-workflow check page

Each workflow that has any `kind: check` action emits exactly one page, `{workflow_type}-check`, addressed by `?action_id=<id>`. That single page serves **all** of the workflow's check actions — there is no page per check action type.

On load the page fetches the action and derives a **mode** from the action's stage and the caller's resolved access:

| Stage                                              | Access      | Mode     |
| -------------------------------------------------- | ----------- | -------- |
| `error`                                            | —           | `view`   |
| `in-review`                                        | `review`    | `review` |
| `action-required` / `in-progress` / `changes-required` | `edit`  | `edit`   |
| otherwise                                          | —           | `view`   |

The mode drives which signal buttons appear (`submit` / `progress` / `not_required` in edit, `approve` / `request_changes` in review, `resolve_error` in error-stage view). After a successful signal the page refetches in place — it does not navigate away.

This page replaces the three former shared check pages (`workflow-action-edit` / `-view` / `-review`). There is also a separate in-context [`check-action-modal`](../reference/exports.md#components) for opening a check action without leaving the entity page; the modal and the check page are independent compositions and share no layout.

## `entity_view` — the read-only entity slot

A workflow may declare an optional `entity_view:` block carrying a single `slot` (a Lowdefy block ref). It is a **build-time, read-only UI hint** — it never reaches the materialized engine config and has no effect on engine behaviour. Use it to show a read-only view of the entity alongside the action:

```yaml
type: onboarding
entity:
  connection_id: leads-collection
  ref_key: lead_ids
  page_id: lead-view
  title: Lead
  name_field: company_name # breadcrumb shows "Lead · Acme Co"
entity_view:
  slot:
    - id: lead_summary
      type: Descriptions
      properties: { ... } # a read-only entity view
```

Where the slot renders depends on the page kind:

- **Form pages** — the slot is the right column's **Details** tab (the reviewer can flip between the entity detail and the action's History).
- **Check page** — the slot is the **middle** review subject (the thing being checked), directly above the comment and signal buttons.

Omit `entity_view` and the Details tab is dropped on form pages / the middle review subject is empty on the check page.

## Breadcrumbs

Every action page shows a four-segment trail:

```
Home / {entity title [· name]} / {workflow title} / {action title}
```

The entity segment links to the entity's `page_id`; when the workflow's `entity.name_field` is set, the instance name is appended after a `·`. The workflow segment links to `workflow-overview`. The action segment is the current page (no link). The in-context modal has no breadcrumb.
