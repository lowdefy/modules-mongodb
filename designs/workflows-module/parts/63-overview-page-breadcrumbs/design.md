# Overview-page breadcrumbs

The two workflow overview pages — `workflow-overview` and `workflow-group-overview` — currently have only a back button, no breadcrumb. Action pages (Part 56) already render a full breadcrumb trail through the layout `page` component's `breadcrumbs` var. This part gives the overview pages the same trail so navigation is consistent: a user landing on a workflow or group overview can see and click their way back up through `Home / [entity list] / entity / workflow [/ group]`.

The work is now **mechanical**. The hard part used to be resolving the entity instance name on these shared pages — and that obstacle is removed by [Part 26](../26-entity-data-contract/design.md), which has the read APIs populate `entity_link.name` server-side. This part just builds the trail and reads that field.

## Proposed change

1. Add a breadcrumb trail to `workflow-overview`: `Home / [entity list] / entity / workflow`, with the workflow as the terminal (non-link) crumb.
2. Add a breadcrumb trail to `workflow-group-overview`: `Home / [entity list] / entity / workflow→ / group`, with the workflow linking to `workflow-overview` and the group as the terminal crumb.
3. The entity-list crumb is config-optional, matching action pages: present only when the workflow configures `entity.list_page_id` + `entity.list_title`.
4. The **entity crumb** label reads `entity_link.name` (the instance name, populated by Part 26), falling back to `entity_link.title` (the type label) when no name resolved.
5. Factor the shared prefix (`Home / [list] / entity / …`) so the two overview pages and ideally the action page don't each hand-roll the trail.

## Confirmed decisions

- **Final nodes** (agreed with user):
  - `workflow-overview` → trail ends at the **workflow title** (no link, current page).
  - `workflow-group-overview` → trail ends at the **group title** (no link), with the **workflow title as a link** to `workflow-overview?workflow_id=…`.
- **Entity crumb content**: the instance name when available (`entity_link.name`), else the type label (`entity_link.title`). Identical to action pages, and now sourced identically (both read `entity_link.name`).

## Entity name resolution (was the core problem — now resolved by Part 26)

Earlier this part carried an open decision (Options A/B/C) about _how_ a shared overview page could resolve the entity instance name, because the action-page mechanism didn't transfer:

- Action pages baked a per-workflow `get_entity` request whose `connectionId` was substituted at build time — possible only because each action page is generated per workflow type.
- The overview pages are **single shared pages** addressed by `?workflow_id=…`; one page serves every workflow type, so it can't bake a single entity connection. (A Lowdefy request's `connectionId` is read from static config before operator evaluation, so it can't be a runtime operator either.)

Part 26 dissolves this. The overview read APIs (`GetWorkflowOverview`, `GetWorkflowActionGroupOverview`) already return `entity_link`; Part 26 has them call the host's `data_endpoint` routine server-side and lift its `name` onto `entity_link.name`. So the name arrives on the response the page already loads — no per-page fetch, no `connectionId` baking, no new `entity.collection` field, no same-database assumption, and no per-workflow page generation. The page just reads `_state.workflow.entity_link.name`.

The three previously-considered options (type-label-only; server-side direct collection read; per-workflow generated overview pages) are all obsoleted by this and are not pursued.

## Building the trail

Both overview pages load their data via a single `CallApi` → `SetState` into `_state.workflow` (carrying `entity_link`). The breadcrumb list is assembled at runtime from that state.

The entity crumb label:

```yaml
label:
  _if:
    test:
      _ne:
        - _state: workflow.entity_link.name
        - null
    then:
      _state: workflow.entity_link.name
    else:
      _state: workflow.entity_link.title
```

**Runtime conditional crumbs.** Lowdefy breadcrumb items have no per-item `visible`, so the optional list crumb must be included or omitted by building the `breadcrumbs` _list_ conditionally (`_array.concat` + `_if`) rather than hiding an item. This differs from the action page's `action-breadcrumbs.yaml`, which gates the list crumb with `_build.if` (build-time) because its values are baked by `makeActionPages`.

## Breadcrumb fragment factoring

`components/action-breadcrumbs.yaml` builds the action-page trail and (per Part 26) reads the entity name from `entity_link.name`. But it gates the list crumb at **build time** (`_build.if`) and bakes human-string labels, which the runtime-driven overview pages can't reuse directly. Two ways to share:

- **(a) Sibling runtime fragment** — add a new fragment that builds the trail from runtime state (`_array.concat` + `_if`), used by the two overview pages; leave `action-breadcrumbs.yaml` as the build-time variant.
- **(b) Refactor to one fragment** both consume — harder, because the two contexts differ in how the list crumb is gated (build-time vs runtime) and in their terminal segments (action-terminal vs workflow-terminal vs group-terminal).

Recommendation: **(a)** — the build-time and runtime gating are genuinely different evaluation phases; one fragment trying to serve both adds conditional surface for little gain. Revisit consolidation only if a third consumer appears.

## Files in play

- `modules/workflows/pages/workflow-overview.yaml` — add `breadcrumbs:` var built from `_state.workflow.entity_link` + workflow title.
- `modules/workflows/pages/workflow-group-overview.yaml` — add `breadcrumbs:` var; workflow crumb links to `workflow-overview`, group crumb terminal.
- New runtime breadcrumb fragment (per factoring decision (a)) — `_array.concat` + `_if`, reading `entity_link.name`/`title` and the optional list crumb from state.
- `modules/workflows/components/action-breadcrumbs.yaml` — already reads `entity_link.name` after Part 26; no change here beyond what Part 26 makes, unless consolidation (b) is chosen.

No plugin/API changes in this part — `entity_link.name` is delivered by Part 26.

## Open questions

1. **Breadcrumb fragment factoring** — confirm (a) sibling runtime fragment vs (b) one shared fragment. Leaning (a).

## Depends on

- [Part 26 — Entity data contract](../26-entity-data-contract/design.md) — populates `entity_link.name` on the overview read-API responses; this part consumes it.
- [Part 56 — three-tier action pages](designs/workflows-module/parts/_completed/56-three-tier-action-pages/design.md) — established the `breadcrumbs` var on the layout `page` component and `action-breadcrumbs.yaml`.
