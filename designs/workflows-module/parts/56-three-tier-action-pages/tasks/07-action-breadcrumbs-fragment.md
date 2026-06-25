# Task 7: Create the four-segment breadcrumb config fragment

## Context

Part 56's action-page header is the layout `page` component's native chrome. The
page's breadcrumb is rendered from its `breadcrumbs` var (page.yaml wires
`breadcrumb.list` from it). The trail is four segments:

```
Home / {entity type · name} / {workflow title} / {action title}
```

Lowdefy breadcrumb items spread their whole object onto the `Link` component
(`Breadcrumb.js:50`), so a breadcrumb item supports `label` + `pageId` +
`urlQuery` directly. The segments (D8/D9/D10):

- **Home** — the standard `- home: true` item every module page uses.
- **Entity** — links via the action's `entity_link` (`{ pageId, urlQuery, title,
  name }`). Label is the type (`entity_link.title`), plus `· {name}` when
  `entity_link.name` is set (D10).
- **Workflow** — links to `workflow-overview?workflow_id=…` (D9). Label is the
  baked workflow title; `pageId` bakes via `_module.pageId: workflow-overview`;
  `workflow_id` is read at runtime from the action envelope (Task 3 adds it).
- **Action** — the current page, **no link** (label only).

To avoid duplicating this four-segment assembly across the form templates and the
check page, extract it into one shared fragment.

## Task

Create `modules/workflows/components/action-breadcrumbs.yaml` — a config fragment
that returns the four-segment breadcrumb **list** (the value a template assigns to
its `breadcrumbs` page var). It takes vars (each template supplies its own
state-path operators):

- `entity_link` — the action's `entity_link` object (template passes
  `_state.action.entity_link` or `_state.current_action.entity_link`).
- `workflow_id` — runtime id for the Workflow link (template passes
  `_state.{action|current_action}.workflow_id`).
- `workflow_title` — the baked workflow-title label.
- `action_label` — the baked action-title label (current segment, no link).

Behaviour:

- Home segment: `- home: true`.
- Entity segment: `{ label, pageId, urlQuery }` from `entity_link`, where `label`
  is `entity_link.title` plus `· {name}` when `entity_link.name` is non-null
  (use an operator to compose the conditional label). Omit/guard the link when
  `entity_link` is null (de-configured workflow — render type-only or skip
  gracefully).
- Workflow segment: `{ label: workflow_title, pageId: _module.pageId
  workflow-overview, urlQuery: { workflow_id } }`.
- Action segment: `{ label: action_label }` (no `pageId`).

## Acceptance Criteria

- `_ref`ing `action-breadcrumbs.yaml` with the four vars yields a four-item list
  in the order Home / Entity / Workflow / Action.
- The Entity label reads "{type} · {name}" when `entity_link.name` is set and
  "{type}" when null.
- The Workflow item carries `pageId` (scoped `workflow-overview`) + `urlQuery:
  { workflow_id }`; the Action item has no `pageId`.
- A template (or a throwaway page) `_ref`ing the fragment compiles via
  `pnpm ldf:b`.

## Files

- `modules/workflows/components/action-breadcrumbs.yaml` — create — the breadcrumb list fragment.
- `modules/workflows/module.lowdefy.yaml` — modify — register under `components:` only if cross-module `_ref` is needed (templates use an in-module `_ref` path; match existing convention).

## Notes

- Page-only — the in-context modal has no breadcrumb; do not wire it there.
- Full function of the Workflow/Entity links depends on Task 3 (envelope
  `workflow_id` + `entity_link.name`). The fragment itself is layout-only and can
  be authored independently; verify end-to-end after Task 3 lands.
- No custom title component is created — title/eyebrow/status are layout-page vars
  (Task 9/10 wire them).
