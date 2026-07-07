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
│ entity's          │  description lead-in    │  Details? (form only)     │
│ workflows + steps │  action surface         │                           │
│ (actions-on-      │  (form / check body)    │  History (fills, scrolls) │
│  entity)          │  floating action bar    │                           │
└──────────────────┴────────────────────────┴───────────────────────────┘
```

The action's **universal fields** (`assignees`, `due_date`) live in the title bar, not the right column: assignees render as avatars and the due date as a pill in the title bar's right-aligned actions, and a pencil (✎) button beside them opens a modal that edits both. The modal's **Update** saves the fields independently of any form submit or signal. The action's authored [`description`](../reference/authoring-grammar.md#description-description) — a separate, workflow-authored markdown field, **not** a universal field and not editable per instance — renders read-only as a chrome-less lead-in at the top of the middle column when set.

- **Left** — the `actions-on-entity` widget: every workflow attached to this entity with its action list. The current action's row links back to its own page.
- **Middle** — the authored description lead-in (when set), then the action surface, then a floating (sticky) action bar. For a form action the surface is the form (edit / view / review / error verb); for a check action it is the check surface (the optional `entity_view` review subject + a comment field). The action bar holds the action's buttons — any workflow-defined `buttons.extra` on the left, the standard signal verbs on the right — docked at the bottom of the column. The edit page's progress ("Save Draft") and submit ("Submit") button titles can be relabelled per action via `page_config.buttons.progress.title` / `page_config.buttons.submit.title`.
- **Right** — a single card with an optional **Details** section stacked above the **History** timeline (no tabs). History is always present (the action-filtered events timeline) and fills the remaining card height, scrolling internally. The **Details** section appears only when the workflow declares an `entity_view` slot (form pages only — see below); on the check page it is absent (the entity is the middle review subject), leaving History as the sole section.

## The per-workflow check page

Each workflow that has any `kind: check` action emits exactly one page, `{workflow_type}-action`, addressed by `?action_id=<id>`. That single page serves **all** of the workflow's check actions — there is no page per check action type.

On load the page fetches the action and derives a **mode** from the action's stage and the caller's resolved access:

| Stage                                                  | Access   | Mode     |
| ------------------------------------------------------ | -------- | -------- |
| `error`                                                | —        | `view`   |
| `in-review`                                            | `review` | `review` |
| `action-required` / `in-progress` / `changes-required` | `edit`   | `edit`   |
| otherwise                                              | —        | `view`   |

The mode drives which signal buttons appear (`submit` / `progress` / `not_required` in edit, `approve` / `request_changes` in review, `resolve_error` in error-stage view). After a successful **terminal** signal (`submit`, `not_required`, `approve`, `request_changes`, `resolve_error`) the page returns to the entity it belongs to — the same behaviour as the form action pages — falling back to browser-back when the action has no resolvable entity page. The one non-terminal signal, `progress` (Mark Started), refetches in place instead: the user is still working the same action, so it stays put. The in-context [`check-action-modal`](../reference/exports.md#components) differs here on purpose — it already sits on the entity page, so it closes rather than navigating.

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
  data: # the entity.data routine (see Breadcrumbs) supplies the slot's fields
    routine:
      - id: load
        type: MongoDBAggregation
        connectionId: leads-collection
        payload: { entity_id: { _payload: entity_id } }
        properties:
          pipeline: [{ $match: { _id: { _payload: entity_id } } }]
      - ":return":
          name: { _step: load.0.company_name } # reserved → breadcrumb instance name
          email: { _step: load.0.email } # host-owned → read by the slot below
entity_view:
  slot:
    - id: lead_summary
      type: Html
      properties:
        html:
          _nunjucks:
            template: "{{ email }}"
            # Slot blocks read the entity.data result off the action response —
            # an object, so no `.0`: get_workflow_action.entity.<field>.
            on: { email: { _request: get_workflow_action.entity.email } }
```

Where the slot renders depends on the page kind:

- **Form pages** — the slot is the right column's **Details** section (stacked above the action's History).
- **Check page** — the slot is the **middle** review subject (the thing being checked), directly above the comment and the floating signal-button bar.

Omit `entity_view` and the Details section is dropped on form pages / the middle review subject is empty on the check page. The slot's fields come from the workflow's `entity.data` routine (below), surfaced on `get_workflow_action.entity` — there is no per-page entity request to author.

## Breadcrumbs

Every action page shows a four-segment trail:

```
Home / {entity title [· name]} / {workflow title} / {action title}
```

The entity segment links to the entity's `page_id`; when the workflow's `entity.data` routine returns a reserved `name` key, that instance name is appended after a `·` (otherwise the segment is just the type label). The workflow segment links to `workflow-overview`. The action segment is the current page (no link). The in-context modal has no breadcrumb.

The instance name is resolved **server-side**: the module generates an engine-only `{type}-entity-data` endpoint from the `entity.data` routine, the action read handler calls it (payload `{ entity_id }`), and lifts the routine's `name` onto the response. The same routine result powers the `entity_view` slot (above) — its non-`name` keys are arbitrary host-owned fields read off `get_workflow_action.entity`. Resolution never fails the page: a missing routine, a throwing routine, or a deleted entity all fall back to the type label.
