# Overview-page breadcrumbs

The two workflow overview pages — `workflow-overview` and `workflow-group-overview` — currently have only a back button, no breadcrumb. Action pages (Part 56) already render a full breadcrumb trail through the layout `page` component's `breadcrumbs` var. This part gives the overview pages the same trail so navigation is consistent: a user landing on a workflow or group overview can see and click their way back up through `Home / [entity list] / entity / workflow [/ group]`.

The work is now **mechanical**. The hard part used to be resolving the entity instance name on these shared pages — and that obstacle is removed by [Part 26](designs/workflows-module/parts/_completed/26-entity-data-contract/design.md), which has the read APIs populate `entity_link.name` server-side. This part just builds the trail and reads that field.

## Proposed change

1. Add a breadcrumb trail to `workflow-overview`: `Home / [entity list] / entity / workflow`, with the workflow as the terminal (non-link) crumb.
2. Add a breadcrumb trail to `workflow-group-overview`: `Home / [entity list] / entity / workflow→ / group`, with the workflow linking to `workflow-overview` and the group as the terminal crumb.
3. The entity-list crumb is config-optional, matching action pages: present only when the workflow configures `entity.list_page_id` + `entity.list_title`. Because the overview pages are runtime-driven, these two fields must arrive **on the API response** — see "Small handler change" below; the action page bakes them at build time instead.
4. The **entity crumb** label reads `entity_link.name` (the instance name, populated by Part 26), falling back to `entity_link.title` (the type label) when no name resolved.
5. Factor the shared prefix (`Home / [list] / entity / …`) into a runtime fragment shared by the **two overview pages** (decision (a) below). The action page keeps its own build-time fragment.
6. **Keep the existing back button.** Both overview pages currently set `show_back_button: true` + `back_link`; the trail is added alongside it, not in place of it. This matches the action-page templates, which set both `breadcrumbs:` and `show_back_button: true` (breadcrumb renders in the page header; the back button renders next to the title — two distinct slots in the layout `page` component).

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

## Small handler change — list-crumb fields on `entity_link`

Part 26 lifts only `name` onto `entity_link`; the overview handlers build it as `{ pageId, urlQuery, title, name }`. The optional entity-list crumb needs `list_page_id` + `list_title`, which the **action page bakes at build time** (`makeActionPages.js` — `list_page_id: workflow.entity.list_page_id ?? ""`). The shared overview pages can't bake, so these two fields must ride the response. They are trivially available on `entityConfig` (the workflow's `entity` block), so the two **overview read handlers** emit them on `entity_link`:

```js
// GetWorkflowOverview.js / GetWorkflowActionGroupOverview.js (src, not dist)
const entity_link = entityConfig
  ? {
      pageId: entityConfig.page_id,
      urlQuery: { [entityConfig.id_query_key]: wfDoc.entity.id },
      title: entityConfig.title ?? null,
      name: entityData?.name ?? null, // Part 26
      list_page_id: entityConfig.list_page_id ?? null, // this part
      list_title: entityConfig.list_title ?? null, // this part
    }
  : null;
```

The runtime fragment then gates the list crumb on `_state.workflow.entity_link.list_page_id != null`. `GetWorkflowAction` is **not** touched — the action page bakes its list crumb. This supersedes the earlier "no plugin/API changes" note: there is one small, mechanical handler edit, naturally folded into the same `entity_link` builder Part 26 already edits.

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
- New runtime breadcrumb fragment (per factoring decision (a)) — `_array.concat` + `_if`, reading `entity_link.name`/`title` and the optional list crumb from state. Shared by the two overview pages; the action page keeps its build-time `action-breadcrumbs.yaml`.
- `modules/workflows/components/action-breadcrumbs.yaml` — already reads `entity_link.name` after Part 26; no change here beyond Part 26's comment refresh.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowOverview/GetWorkflowOverview.js` and `.../GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.js` — add `list_page_id` + `list_title` to the `entity_link` object (see "Small handler change"). Edit `src/`; the build regenerates `dist/`.

The only plugin change is the two-field `entity_link` addition above; `entity_link.name` itself is delivered by Part 26.

## Resolved questions

1. **Breadcrumb fragment factoring** — **(a)** sibling runtime fragment, shared by the two overview pages. Build-time (`_build.if`, baked labels) and runtime (`_array.concat` + `_if`, state-read) gating are genuinely different evaluation phases; one fragment serving both adds conditional surface across three different terminal segments for no real gain. Revisit consolidation only if a third consumer appears.
2. **Back button** — **retained** alongside the trail, matching the action-page templates (both set `breadcrumbs:` and `show_back_button: true`).

## Depends on

- [Part 26 — Entity data contract](designs/workflows-module/parts/_completed/26-entity-data-contract/design.md) — populates `entity_link.name` on the overview read-API responses; this part consumes it.
- [Part 56 — three-tier action pages](designs/workflows-module/parts/_completed/56-three-tier-action-pages/design.md) — established the `breadcrumbs` var on the layout `page` component and `action-breadcrumbs.yaml`.
