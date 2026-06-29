---
title: Action pages
module: workflows
type: concept
concepts: [action-pages, workspace, entity_view, check-page, breadcrumbs]
---

# Workflows — Action pages

Every action a user opens — whether a `kind: form` action or a `kind: check` action — renders in the same **three-tier workspace**. The shell is layout-only and identical across page kinds, so navigating between actions in a workflow never produces a jarring column shift; only the middle content (and whether the right column shows a Details section) changes.

```
┌──────────────────┬────────────────────────┬───────────────────────────┐
│ entity's          │  description callout    │  Details? (form only)     │
│ workflows + steps │  action surface         │                           │
│ (actions-on-      │  (form / check body)    │  History (fills, scrolls) │
│  entity)          │  floating action bar    │                           │
└──────────────────┴────────────────────────┴───────────────────────────┘
```

The action's **universal fields** (`assignees`, `due_date`, `description`) live in the title bar and middle column, not the right column: assignees render as avatars and the due date as a pill in the title bar's right-aligned actions, a pencil (✎) button beside them opens a modal that edits all three, and the description — when set — renders as a tinted callout at the top of the middle column. The modal's **Update** saves the fields independently of any form submit or signal.

- **Left** — the `actions-on-entity` widget: every workflow attached to this entity with its action list. The current action's row links back to its own page.
- **Middle** — the description callout (when set), then the action surface, then a floating (sticky) action bar. For a form action the surface is the form (edit / view / review / error verb); for a check action it is the check surface (the optional `entity_view` review subject + a comment field). The action bar holds the action's buttons — any workflow-defined `buttons.extra` on the left, the standard signal verbs on the right — docked at the bottom of the column.
- **Right** — a single card with an optional **Details** section stacked above the **History** timeline (no tabs). History is always present (the action-filtered events timeline) and fills the remaining card height, scrolling internally. The **Details** section appears only when the workflow declares an `entity_view` slot (form pages only — see below); on the check page it is absent (the entity is the middle review subject), leaving History as the sole section.

## The per-workflow check page

Each workflow that has any `kind: check` action emits exactly one page, `{workflow_type}-action`, addressed by `?action_id=<id>`. That single page serves **all** of the workflow's check actions — there is no page per check action type.

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

- **Form pages** — the slot is the right column's **Details** section (stacked above the action's History).
- **Check page** — the slot is the **middle** review subject (the thing being checked), directly above the comment and the floating signal-button bar.

Omit `entity_view` and the Details section is dropped on form pages / the middle review subject is empty on the check page.

## Breadcrumbs

Every action page shows a four-segment trail:

```
Home / {entity title [· name]} / {workflow title} / {action title}
```

The entity segment links to the entity's `page_id`; when the workflow's `entity.name_field` is set, the instance name is appended after a `·`. The workflow segment links to `workflow-overview`. The action segment is the current page (no link). The in-context modal has no breadcrumb.
