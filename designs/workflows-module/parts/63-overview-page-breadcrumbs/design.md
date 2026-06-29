# Overview-page breadcrumbs

The two workflow overview pages — `workflow-overview` and `workflow-group-overview` — currently have only a back button, no breadcrumb. Action pages (Part 56) already render a full breadcrumb trail through the layout `page` component's `breadcrumbs` var. This part gives the overview pages the same trail so navigation is consistent: a user landing on a workflow or group overview can see and click their way back up through `Home / [entity list] / entity / workflow [/ group]`.

The work is mostly mechanical — the layout `page` component already accepts a `breadcrumbs` list and the overview pages already load everything the trail needs **except one thing: the entity instance name.** Resolving that name on these pages is the whole design problem, because the mechanism action pages use does not transfer to the overview pages. The rest of this document is about that obstacle and the options for getting past it.

## Proposed change

1. Add a breadcrumb trail to `workflow-overview`: `Home / [entity list] / entity / workflow`, with the workflow as the terminal (non-link) crumb.
2. Add a breadcrumb trail to `workflow-group-overview`: `Home / [entity list] / entity / workflow→ / group`, with the workflow linking to `workflow-overview` and the group as the terminal crumb.
3. The entity-list crumb is build-time/​config optional, matching action pages: present only when the workflow configures `entity.list_page_id` + `entity.list_title`.
4. Decide and implement how the **entity crumb** resolves its label — the type label (free, already available) vs. the entity instance name (matches action pages, but needs new infrastructure). **This is the open decision — see below.**
5. Factor the shared prefix (`Home / [list] / entity / …`) so the two overview pages and ideally the action page do not each hand-roll the trail.

## Confirmed decisions

- **Final nodes** (agreed with user):
  - `workflow-overview` → trail ends at the **workflow title** (no link, current page).
  - `workflow-group-overview` → trail ends at the **group title** (no link), with the **workflow title as a link** to `workflow-overview?workflow_id=…`.
- **Entity crumb content** (preference, not locked): the instance name (matching action pages) is preferred, but it is gated on the infrastructure obstacle below — the actual approach is the deferred decision.

## The core problem: resolving the entity instance name

### How action pages do it (and why it doesn't transfer)

Action pages show the entity _instance_ name (e.g. "Acme Corp") in the entity crumb, falling back to the type label (e.g. "Lead") when the workflow has no `name_field`. That name is **not** returned by the action API — it comes from a **separate per-page request**:

- `modules/workflows/requests/get_entity.yaml.njk` is a `MongoDBAggregation` whose `connectionId: {{ connection_id }}` is **baked at build time** by `makeActionPages` (`workspaceVars` → `connection_id: workflow.entity.connection_id`).
- The breadcrumb fragment (`components/action-breadcrumbs.yaml`) reads the name via `_request: get_entity.0.{name_field}`.
- This works because action pages are **generated per workflow type** — each page hard-wires its own entity connection.

The overview pages are **single shared pages** (`pages/workflow-overview.yaml`, `pages/workflow-group-overview.yaml`, exported statically in the manifest), addressed by `?workflow_id=…`. One page serves every workflow type, so it cannot bake a single entity connection.

**Verified constraint:** a Lowdefy request's `connectionId` is read from static config (`@lowdefy/api` → `routes/request/callRequest.js` calls `getConnectionConfig({ connectionId: requestConfig.connectionId })`) _before_ operator evaluation; only `connectionConfig.properties` and `requestConfig.properties` are operator-evaluated (`evaluateOperators.js`). So `connectionId` **cannot be a runtime operator** — the overview pages cannot issue a `get_entity` against a per-workflow connection chosen from `_state` at runtime.

### What the overview APIs return today

Both `GetWorkflowOverview` and `GetWorkflowActionGroupOverview` (and `GetWorkflowAction`) build the same `entity_link` from the workflow config's `entity` block:

```js
const entity_link = entityConfig
  ? {
      pageId: entityConfig.page_id,
      urlQuery: { [entityConfig.id_query_key]: wfDoc.entity.id },
      title: entityConfig.title ?? null,
    } // type label only — no instance name
  : null;
```

The workflow doc's `entity` block stores `{ connection_id, id, ref_key }` — **no denormalized name.** So the instance name is not available anywhere the overview pages can currently reach it without new work.

> Note: Part 56's task-07 doc described `entity_link` as `{ pageId, urlQuery, title, name }`, but `name` was never implemented on `entity_link`; the action page resolves the name via the separate `get_entity` request instead.

## Options for the entity name

### Option A — Type label only (no new infra)

Use `entity_link.title` (already returned). No new config, no DB read, no same-DB constraint. Consistent with action pages that have **no** `name_field`. Loses the instance name when a workflow _does_ configure `name_field` (inconsistent with its own action pages in that case).

- Effort: small. Only the two overview pages + a shared breadcrumb fragment.

### Option B — Resolve the name server-side in the overview APIs

Both overview APIs load the entity doc and resolve `name_field` → add `entity_link.name`.

- **Blocker:** the engine has the entity's `connection_id` (a Lowdefy connection id like `leads-collection`), **not** its Mongo collection name (`leads`). That mapping lives in the Lowdefy connection config, which neither the engine nor the build-time `makeWorkflowsConfig` resolver can see.
- Requires a **new authoring field** — e.g. `entity.collection` — validated in `makeWorkflowsConfig`, documented in the manifest + `docs/`.
- Requires a **same-database assumption** — the entity collection must live in the workflow-api connection's DB. Precedent exists (`contactsCollection` is read this way in `GetWorkflowAction`), but it is a real constraint and breaks if the entity lives in a different cluster/DB than the workflow store.
- Effort: medium. New config field + validation + docs, plus an extra read in both APIs.

### Option C — Generate the overview pages per workflow type (true "same mechanism")

Convert `workflow-overview` / `workflow-group-overview` from static shared pages to `makeActionPages`-style per-workflow generation, so each baked page carries its own `get_entity` request + breadcrumb — exactly like action pages.

- Honors the entity's own connection (DB routing, read perms) with **no** new config field and **no** same-DB assumption — architecturally the most consistent with action pages ("one correct way").
- **Large** refactor: the two pages move from static manifest exports to generated pages; page-id/URL surface changes from one shared `workflow-overview` to one-per-workflow-type; every cross-module link to these pages (`_module.pageId: workflow-overview`, the engine link builders in `GetEntityWorkflows.buildGroupLink`, `computeEngineLinks`) must be revisited.
- Effort: large, with blast radius across engine link building and any consumer that links to the overview pages.

## Decision deferred

No option chosen yet — to be decided when this part is picked up. The trade-off in brief:

- **A (type label)** — cheap, no new surface; loses the instance name where a workflow configures `name_field`.
- **B (server-side resolve)** — medium; adds a new `entity.collection` field + a same-DB assumption.
- **C (per-workflow generated pages)** — large refactor with engine-link blast radius; architecturally the most consistent ("same mechanism" as action pages), no new config.

## Files in play

- `modules/workflows/pages/workflow-overview.yaml` — add `breadcrumbs:` var.
- `modules/workflows/pages/workflow-group-overview.yaml` — add `breadcrumbs:` var.
- `modules/workflows/components/action-breadcrumbs.yaml` — existing trail builder; uses `_build.if` on `entity_list_page_id` (build-time), so **not directly reusable** at runtime for these pages. A new runtime-driven fragment (`_array.concat` + `_if`) is likely needed, or a refactor that serves both.
- `plugins/.../GetWorkflowOverview.js`, `GetWorkflowActionGroupOverview.js` — `entity_link` construction (shared with `GetWorkflowAction.js`; candidate for a `buildEntityLink` helper). Only touched under Option B.
- `modules/workflows/resolvers/makeWorkflowsConfig.js`, `module.lowdefy.yaml`, `docs/` — only under Option B (new `entity.collection` field).

## Open questions

1. **Entity crumb resolution** — pick Option A, B, or C (see recommendation). Everything else is mechanical.
2. **Breadcrumb fragment factoring** — the existing `action-breadcrumbs.yaml` gates the list crumb with `_build.if` (build-time), which the runtime-driven overview pages can't use. Decide whether to (a) add a sibling runtime fragment, or (b) refactor `action-breadcrumbs.yaml` into a form both the build-time action pages and runtime overview pages can share. Note the two trails also differ in their terminal segments (action vs workflow-terminal vs group-terminal).
3. **Runtime conditional crumbs** — Lowdefy breadcrumb items have no per-item `visible`; the optional list crumb must be omitted by building the `breadcrumbs` _list_ conditionally at runtime (`_array.concat` + `_if`) rather than hiding an item.
