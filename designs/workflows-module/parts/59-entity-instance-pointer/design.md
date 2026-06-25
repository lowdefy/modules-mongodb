# Part 59 — Nested entity instance pointer

Across the workflows engine an entity is identified by a spray of flat, parallel scalars: workflow/action documents carry `entity_collection` + `entity_id`; tracker children denormalize `parent_entity_collection`/`parent_entity_id` and `child_entity_collection`/`child_entity_id`; `StartWorkflow` takes `entity_collection` and `entity_id` as separate params; `GetEntityWorkflows` queries `{ entity_collection, entity_id }`; the documented index keys both; and the four read methods read `wfDoc.entity_collection` / `action.entity_id` off the loaded doc. This part collapses that pointer into a single nested object — `entity: { collection, id }` — at the document, param, query, index, denormalization, and engine-read layers, so entity identity is represented one way end to end.

This is the persistence/runtime counterpart to Part 57, which nests the entity **definition** on the workflow config into an `entity:` block. The two `entity` objects are intentionally different shapes for different roles (see [Two `entity` objects](#two-entity-objects)). The modules are unreleased with no consumers, so there is **no data migration** — this is a clean rename/restructure. It is its own part rather than part of Part 57 because it is cross-cutting: ~8 engine source files plus `StartWorkflow`, the generated start endpoint, the documented index, the entity-workflow components, the demo + workflows-test apps, and nearly every engine test suite.

## Proposed change

1. **Document shape** — replace the flat `entity_collection` + `entity_id` with a nested `entity` object. On the **workflow** document it carries `{ collection, id, ref_key }` — `entity_ref_key` folds in here. On the **action** document and the denormalized `parent_entity` / `child_entity` links it carries `{ collection, id }` (no `ref_key` — those docs never use it). See [Decision: `entity_ref_key` folds into the workflow `entity` object](#decision-entity_ref_key-folds-into-the-workflow-entity-object).
2. **StartWorkflow param contract** — the payload carries `entity: { id }` only; the collection is sourced from `workflowConfig.entity.collection`, not the payload (it is a config constant, redundant to pass — see [Decision: drop `collection` from the start payload](#decision-drop-collection-from-the-start-payload)).
3. **GetEntityWorkflows param + query** — the param becomes `entity: { collection, id }`; the Mongo query keys on `{ "entity.collection": …, "entity.id": … }`.
4. **Index** — the documented `workflows` index becomes `{ "entity.collection": 1, "entity.id": 1 }` (dotted keys; identical behaviour and equality-prefix match).
5. **Engine reads + denormalization** — all four read methods, `planActionTransition` (action-doc seed), `planEventDispatch` (event references), the StartWorkflow parent/child denormalization, and the `Cancel`/`Close` reserved-key lists read and write the nested shape. `GetWorkflowAction`'s response returns `entity: { collection, id }` instead of flat scalars.
6. **Authoring-grammar exceptions** — the `computeEngineLinks` link sentinel keeps the flat keyword `entity_id: true` (only its value source moves to `action.entity.id`); the entity-workflow components keep their local `_var: entity_id` / `_var: entity_collection` input names (they assemble the nested object when calling the API). See [Where "uniform" stops](#where-uniform-stops).
7. **Tests + docs + apps** — update every engine + resolver test suite, the indexes reference, and the demo / workflows-test app callers (start buttons, entity-workflow lists, e2e fixtures, app-authored action requests reading `context.workflow.entity.id`).

## Two `entity` objects

After this part and Part 57 there are two objects named `entity`, with different shapes for different roles. This is deliberate; the shared name signals they describe the same concept from two angles.

| | **Config `entity:` block** (Part 57) | **Document `entity` object** (this part) |
|---|---|---|
| Role | Workflow **definition** — how this workflow kind is wired to an entity | Instance **pointer** (+ event-routing key on workflows) |
| Fields | `collection`, `ref_key`, `page_id`, `id_query_key`, `title`, `name_field?` | workflow: `collection`, `id`, `ref_key` · action / parent / child: `collection`, `id` |
| Lifetime | Static, authored once per workflow definition | Written once at Start, per workflow/action document |
| Shared fields | `collection`, `ref_key` (the workflow `entity` denormalizes both from config) | `collection`, `ref_key` (workflow doc); `collection` only (action / parent / child) |

The config block is the full per-kind wiring. The document object denormalizes the runtime subset onto each doc: the workflow keeps `collection` + `id` + `ref_key` (everything the engine reads off a loaded workflow — the pointer plus the events key), while action / parent / child docs keep just the `{ collection, id }` pointer since they never read `ref_key`.

## Relationship to Part 57 (dependency + boundary)

Part 57 ("Inline entity config on the workflow") owns the **config** `entity:` block. Its design currently keeps `entity_collection` / `entity_ref_key` flat in config and nests only `page_id` / `id_query_key` / `title`; that decision is being revised so the config block holds `collection` + `ref_key` too (the design.md in `parts/57-inline-entity-config/` may read stale until updated). This part **depends on the updated Part 57** and consumes its block via `workflowConfig.entity.collection` and `workflowConfig.entity.ref_key`.

The boundary:

- **Part 57 owns** the config block shape, its build-time validation in `makeWorkflowsConfig`, the `WORKFLOW_FIELDS` normalization, the `workflowsConfig` schema `required` list in `WorkflowAPI/schema.js`, and removal of the `entities` connection param.
- **This part owns** the document shape, the `StartWorkflow` / `GetEntityWorkflows` param contracts, the queries and index, the parent/child denormalization, all engine read methods, the `GetWorkflowAction` response shape, and the test/app/doc sweep for the runtime layer.

Order: Part 57 first (so `workflowConfig.entity.collection` / `.ref_key` exist to read), then this part.

## Canonical shapes

### Workflow document

```js
{
  _id,
  workflow_type,
  key,
  display_order,
  entity: { collection: 'leads-collection', id: '<lead _id>', ref_key: 'lead_ids' },  // was entity_collection + entity_id + entity_ref_key
  parent_action_id: null,
  parent_workflow_id: null,
  parent_entity: null,            // was parent_entity_id + parent_entity_collection; { collection, id } when a tracker child
  status, summary, groups, form_data, created, updated,
}
```

### Action document

```js
{
  _id, workflow_id, type, kind, key, status,
  entity: { collection, id },     // was entity_collection + entity_id, denormalized from the parent workflow (no ref_key — unused on actions)
  assignees, due_date, description, access,
  tracker,
  child_workflow_id: null,
  child_entity: null,             // was child_entity_id + child_entity_collection; { collection, id } once a child links
}
```

### StartWorkflow payload

```js
{
  // workflow_type is baked into the type-scoped endpoint, not passed
  entity: { id: '<lead _id>' },   // collection is sourced from workflowConfig.entity.collection
  parent_action_id?, actions?, references?, metadata?,
}
```

The handler composes the document's `entity.collection` from config and `entity.id` from the payload:

```js
entity: {
  collection: workflowConfig.entity.collection,
  id: params.entity.id,
  ref_key: workflowConfig.entity.ref_key,
},
```

### GetEntityWorkflows param + query

```js
// param
{ entity: { collection, id } }
// query
findDocs({ collection: workflowsCollection, query: { 'entity.collection': collection, 'entity.id': id }, … })
```

## Key decisions

### Decision: `entity_ref_key` folds into the workflow `entity` object

`entity_ref_key` (e.g. `lead_ids`) is the **events-references key** — `planEventDispatch` writes `{ [refKey]: [workflow.entity.id] }` onto each event doc so the event surfaces on the entity's timeline (`planEventDispatch.js:160-261`). It is read only off the workflow document, written once at Start from `workflowConfig.entity.ref_key`.

It folds into the workflow document's `entity` object as `entity.ref_key`, so everything about the entity a workflow concerns sits under one key: which collection, which record, and how its events are keyed. `planEventDispatch` reads `workflow.entity.ref_key`.

**Workflow only — accepted asymmetry.** The fold-in applies to the *workflow* document. Action documents and the denormalized `parent_entity` / `child_entity` links keep the bare `{ collection, id }` pointer, because nothing ever reads `ref_key` off them — denormalizing it there would be speculative surface (CLAUDE.md: build for concrete needs). The consequence, accepted deliberately: the object named `entity` has two shapes — `{ collection, id, ref_key }` on a workflow, `{ collection, id }` on an action / parent / child. The alternative (keep `entity_ref_key` a separate flat field) was the only shape with one uniform `entity` everywhere; it was rejected in favour of co-locating all of a workflow's entity facts under `entity`. The split is contained — `ref_key` appears on exactly one document kind, where it is exactly the doc kind that uses it.

### Decision: drop `collection` from the start payload

Today `StartWorkflow` requires both `params.entity_id` and `params.entity_collection`, then independently loads `workflowConfig` by `workflow_type` — which *also* declares the collection. The two are necessarily the same value, so passing `entity_collection` is redundant and introduces a "what if they disagree" failure mode (the handler trusts the payload, the doc could be written against a collection the config doesn't expect). The collection is a static per-kind fact; only the entity **id** is per-instance. So the payload carries `entity: { id }` and the handler sources `entity.collection` from `workflowConfig.entity.collection`. One fewer field for callers, one fewer way to be wrong.

`GetEntityWorkflows`, by contrast, genuinely needs `collection` as a param: it lists workflows across *all* types for one entity, so it has no single `workflow_type` to derive the collection from — it queries the indexed `{ "entity.collection", "entity.id" }` pair directly. So its param stays `entity: { collection, id }`.

### Decision: `parent_entity` / `child_entity` are nullable objects, not objects-of-nullables

When there is no parent/child link the field is `null` (not `{ collection: null, id: null }`). "No link" is naturally one absent object, and `parent ? { collection, id } : null` reads cleaner than spreading nulls across members. Types: `parent_entity: { collection, id } | null`, `child_entity: { collection, id } | null`. The StartWorkflow tracker fire that links a child writes the populated object (`child_entity: { collection: childDoc.entity.collection, id: childDoc.entity.id }`) onto the parent tracker action via `planActionTransition`'s `payload.fields`, replacing the seed's `null`.

### Decision: index keys go dotted, behaviour unchanged

`workflows.{ entity_collection: 1, entity_id: 1 }` becomes `workflows.{ "entity.collection": 1, "entity.id": 1 }`. MongoDB indexes dotted sub-fields identically to top-level fields; the `GetEntityWorkflows` query `{ "entity.collection": x, "entity.id": y }` is an exact equality match on the compound prefix, so the index serves it the same way. The non-partial constraint and its rationale (future tasks-module docs) carry over verbatim. No new index is added — the `actions` collection still indexes only `{ workflow_id: 1 }`; action docs carry `entity` but nothing queries it (the read methods read it off already-loaded docs).

### Where "uniform" stops

The nesting is uniform across everything the engine **persists, queries, indexes, and accepts as an API param**. It deliberately stops at two authoring-layer tokens, because neither is a document field, param, or query key:

- **The `computeEngineLinks` link sentinel.** Config authors write `entity_id: true` inside a tracker action's `start_link.urlQuery` to mean "fill this URL param with the entity id" (`computeEngineLinks.js:93-101`). The keyword `entity_id` is simultaneously the recognized sentinel *and* the emitted URL query-param name that the host start-page reads (`?entity_id=…`). A dotted `entity.id: true` would be awkward YAML and an ugly URL param. The keyword (and its sibling `action_id`) stays flat; only the value the engine substitutes moves to `action.entity.id`.
- **The entity-workflow components' `_var` inputs.** `actions-on-entity.yaml` and `entity-workflows-refetch.yaml` take `_var: entity_id` / `_var: entity_collection` from their `_ref` callers. These are local composition tokens, not the persisted shape. Keeping the input names means host pages that `_ref` these components don't change (relevant to Part 56, which bakes them into the action-workspace shell); the components internally assemble `entity: { id: { _var: entity_id }, collection: { _var: entity_collection } }` when calling `get-entity-workflows`.

This is the "uniform as possible" line: nest at every machine boundary, leave the two human-authoring tokens flat with a documented reason.

## Files changed

### Engine source (`plugins/modules-mongodb-plugins/src/connections/`)

- `shared/types.js` — `WorkflowDoc`: `entity_id`/`entity_collection`/`entity_ref_key` → `entity: { collection, id, ref_key }`; `parent_entity_id`/`parent_entity_collection` → `parent_entity: { collection, id } | null`. `ActionDoc`: `entity: { collection, id }` (no `ref_key`); `child_entity_id`/`child_entity_collection` → `child_entity: { collection, id } | null`.
- `WorkflowAPI/StartWorkflow/StartWorkflow.js` — param precondition: require `params.entity?.id`, drop the `params.entity_collection` check. Doc write: `entity: { collection: workflowConfig.entity.collection, id: params.entity.id, ref_key: workflowConfig.entity.ref_key }` (no separate `entity_ref_key` field). Parent denorm: `parent_entity: parent ? { collection: parent.entity.collection, id: parent.entity.id } : null`. Tracker fire: `child_entity: { collection: plannedWorkflowDoc.entity.collection, id: plannedWorkflowDoc.entity.id }`.
- `WorkflowAPI/GetEntityWorkflows/GetEntityWorkflows.js` — param `{ entity: { collection, id } }`; query `{ "entity.collection": collection, "entity.id": id }`; `entity_link` urlQuery uses `wfDoc.entity.id` (the routing fields already come from `wfConfig.entity` per Part 57).
- `WorkflowAPI/GetWorkflowOverview/GetWorkflowOverview.js`, `…/GetWorkflowActionGroupOverview/…` — `entity_link` urlQuery uses `wfDoc.entity.id`.
- `WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js` — `entity_link` urlQuery uses `action.entity.id`; **response** returns `entity: { collection: action.entity?.collection ?? null, id: action.entity?.id ?? null }` in place of the flat `entity_id` / `entity_collection` fields.
- `WorkflowAPI/CancelWorkflow/CancelWorkflow.js`, `…/CloseWorkflow/CloseWorkflow.js` — `RESERVED_WORKFLOW_KEYS`: replace `'entity_id'`, `'entity_collection'` with `'entity'`.
- `shared/phases/planners/planActionTransition.js` — action-doc seed: `entity: { collection: loadedWorkflow.entity.collection, id: loadedWorkflow.entity.id }`; `child_entity: null`.
- `shared/phases/planners/planEventDispatch.js` — `const refKey = workflow.entity.ref_key` and `[refKey]: [workflow.entity.id]` (and the missing-ref_key guard message).
- `shared/render/computeEngineLinks.js` — sentinel value source `action.entity.id` (keyword `entity_id` unchanged); update the doc comment.

### Module (`modules/workflows/`)

- `resolvers/makeWorkflowApis.js` — generated start endpoint: drop the `entity_collection` property; pass `entity: { _payload: entity }` (forwarding `{ id }`), and `entity_id` → carried inside it.
- `api/get-entity-workflows.yaml` — properties become `entity: { collection: { _payload: entity.collection }, id: { _payload: entity.id } }` (or `entity: { _payload: entity }`).
- `components/actions-on-entity.yaml`, `components/entity-workflows-refetch.yaml` — keep `_var` input names; build the nested `entity` object in the `get-entity-workflows` call.
- `templates/view.yaml.njk`, `edit.yaml.njk`, `review.yaml.njk` — these bake `entity_collection` (config-derived) and feed a host `get_entity` request. The collection name they inject is unchanged in meaning; reconcile their source with `makeActionPages` once Part 57's config block lands (the `get_entity` request property name that fetches the *actual* entity record is the host page's contract, not the workflow pointer — left flat).

### Indexes + docs

- `docs/workflows/reference/indexes.md` — the `workflows` index → `{ "entity.collection": 1, "entity.id": 1 }`; update the query-site table.
- `modules/workflows/README.md` — the `## Indexes` section's `workflows.{ entity_collection: 1, entity_id: 1 }` → dotted form.
- Doc sweep — `docs/workflows/concepts/*.md` and reference pages that show the document shape or the `{ entity_collection, entity_id }` query update to the nested shape.

### Apps

- `apps/demo/pages/leads/lead-view.yaml` — start-button payloads `entity_id` / `entity_collection` → `entity: { id }` (collection dropped); `get-entity-workflows` callers → nested `entity`.
- `apps/demo/modules/workflows/workflow_config/company-setup/billing-details.yaml` — app-authored action requests reading `context.workflow.entity_id` → `context.workflow.entity.id`.
- `apps/demo/modules/companies/vars.yaml` and any other entity-workflow / start callers — same nesting.
- `apps/workflows-test/` — workflow_config start callers, `get-entity-workflows` callers, and the e2e specs + `workflowFixture.js` that seed or assert documents with `entity_collection` / `entity_id` → nested shape.

### Tests

- Engine suites (`StartWorkflow`, `GetEntityWorkflows`, `GetWorkflowOverview`, `GetWorkflowAction`, `GetWorkflowActionGroupOverview`, `Cancel`, `Close`, `planActionTransition`, `planEventDispatch`, `runTrackerCascade`, `computeEngineLinks`, `loadWorkflowState`, and the planner suites) — fixtures move from flat `entity_collection`/`entity_id` to nested `entity`; assertions on written docs, queries, and responses follow.
- `resolvers/makeWorkflowApis.test.js` — the generated start-endpoint param assertions move to the nested `entity` shape (drop `entity_collection`).

## Non-goals

- No data migration — the modules are unreleased with no consumers.
- No change to the config `entity:` block shape or its validation (Part 57).
- No new indexes; no change to the `actions` `{ workflow_id: 1 }` index or the validator constraint.
- No change to the `entity_ref_key` mechanism — it relocates onto the workflow `entity` object (`workflow.entity.ref_key`) and its config source becomes `workflowConfig.entity.ref_key` (Part 57), but the event-references behaviour is unchanged.

## Dependencies

- **Depends on Part 57** (`parts/57-inline-entity-config`, updated to fold `collection` + `ref_key` into the config `entity:` block). Sequence 57 → 59.
- **Touches Part 56** (`parts/56-three-tier-action-pages`) surface: keeping the entity-workflow components' `_var` input names flat means the Part 56 action-workspace shell that bakes `entity_collection` / `reference_field` does not need to change for this part.
