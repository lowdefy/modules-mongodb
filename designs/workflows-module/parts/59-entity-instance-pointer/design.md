# Part 59 — Nested entity instance pointer

Across the workflows engine an entity is identified by a spray of flat, parallel scalars: workflow/action documents carry `entity_collection` + `entity_id`; tracker children denormalize `parent_entity_collection`/`parent_entity_id` and `child_entity_collection`/`child_entity_id`; `StartWorkflow` takes `entity_collection` and `entity_id` as separate params; `GetEntityWorkflows` queries `{ entity_collection, entity_id }`; the documented index keys both; and the four read methods read `wfDoc.entity_collection` / `action.entity_id` off the loaded doc. This part collapses that pointer into a single nested object — `entity: { connection_id, id }` — at the document, param, query, index, denormalization, and engine-read layers, so entity identity is represented one way end to end. The old flat `entity_collection` becomes `entity.connection_id`: the value is a Lowdefy connection id (e.g. `leads-collection`, defined as a connection `id` and consumed as `connectionId:`), so the member is named for what it is, not loosely as "collection". See [Decision: the pointer member is `connection_id`, not `collection`](#decision-the-pointer-member-is-connection_id-not-collection).

This is the persistence/runtime counterpart to Part 57, which nests the entity **definition** on the workflow config into an `entity:` block. The two `entity` objects are intentionally different shapes for different roles (see [Two `entity` objects](#two-entity-objects)). The modules are unreleased with no consumers, so there is **no data migration** — this is a clean rename/restructure. It is its own part rather than part of Part 57 because it is cross-cutting: ~8 engine source files plus `StartWorkflow`, the generated start endpoint, the documented index, the entity-workflow components, the demo + workflows-test apps, and nearly every engine test suite.

## Proposed change

1. **Document shape** — replace the flat `entity_collection` + `entity_id` with a nested `entity` object. On the **workflow** document it carries `{ connection_id, id, ref_key }` — `entity_ref_key` folds in here. On the **action** document and the denormalized `parent_entity` / `child_entity` links it carries `{ connection_id, id }` (no `ref_key` — those docs never use it). See [Decision: `entity_ref_key` folds into the workflow `entity` object](#decision-entity_ref_key-folds-into-the-workflow-entity-object).
2. **StartWorkflow param contract** — the payload carries `entity: { id }` only; the connection id is sourced from `workflowConfig.entity.connection_id`, not the payload (it is a config constant, redundant to pass — see [Decision: drop the connection id from the start payload](#decision-drop-the-connection-id-from-the-start-payload)).
3. **GetEntityWorkflows param + query** — the param becomes `entity: { connection_id, id }`; the Mongo query keys on `{ "entity.connection_id": …, "entity.id": … }`.
4. **Index** — the documented `workflows` index becomes `{ "entity.connection_id": 1, "entity.id": 1 }` (dotted keys; identical behaviour and equality-prefix match).
5. **Engine reads + denormalization** — all four read methods, `planActionTransition` (action-doc seed), `planEventDispatch` (event references), the StartWorkflow parent/child denormalization, and the `Cancel`/`Close` reserved-key lists read and write the nested shape. `GetWorkflowAction`'s response returns `entity: { connection_id, id }` instead of flat scalars.
6. **Authoring-grammar exceptions** — the `computeEngineLinks` link sentinel keeps the flat keyword `entity_id: true` (only its value source moves to `action.entity.id`); the entity-workflow components keep their local flat `_var` input names (renamed to `entity_connection_id` / `entity_id`, but still flat — they assemble the nested object when calling the API). See [Where "uniform" stops](#where-uniform-stops).
7. **Tests + docs + apps** — update every engine + resolver test suite, the indexes reference, and the demo / workflows-test app callers (start buttons, entity-workflow lists, e2e fixtures, app-authored action requests reading `context.workflow.entity.id`).

## Two `entity` objects

After this part and Part 57 there are two objects named `entity`, with different shapes for different roles. This is deliberate; the shared name signals they describe the same concept from two angles.

|               | **Config `entity:` block** (Part 57)                                             | **Document `entity` object** (this part)                                                    |
| ------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Role          | Workflow **definition** — how this workflow kind is wired to an entity           | Instance **pointer** (+ event-routing key on workflows)                                     |
| Fields        | `connection_id`, `ref_key`, `page_id`, `id_query_key`, `title`, `name_field?`    | workflow: `connection_id`, `id`, `ref_key` · action / parent / child: `connection_id`, `id` |
| Lifetime      | Static, authored once per workflow definition                                    | Written once at Start, per workflow/action document                                         |
| Shared fields | `connection_id`, `ref_key` (the workflow `entity` denormalizes both from config) | `connection_id`, `ref_key` (workflow doc); `connection_id` only (action / parent / child)   |

The config block is the full per-kind wiring. The document object denormalizes the runtime subset onto each doc: the workflow keeps `connection_id` + `id` + `ref_key` (everything the engine reads off a loaded workflow — the pointer plus the events key), while action / parent / child docs keep just the `{ connection_id, id }` pointer since they never read `ref_key`.

## Relationship to Part 57 (dependency + boundary)

Part 57 ("Inline entity config on the workflow") owns the **config** `entity:` block. Its design is being revised so the config block holds `connection_id` + `ref_key` (alongside `page_id` / `id_query_key` / `title`) and **stops lifting them to flat names** — leaving them nested in the materialized config. This part **depends on the updated Part 57** and consumes its block via `workflowConfig.entity.connection_id` and `workflowConfig.entity.ref_key`.

The boundary:

- **Part 57 owns** the config block shape (including the `connection_id` member name), its build-time validation in `makeWorkflowsConfig`, the `WORKFLOW_FIELDS` normalization (now keeping `connection_id`/`ref_key` nested rather than lifting), the `workflowsConfig` schema `required` list in `WorkflowAPI/schema.js`, removal of the `entities` connection param, and the `makeActionPages` read of the authored field (`workflow.entity_collection` → `workflow.entity.connection_id`).
- **This part owns** the document shape, the `StartWorkflow` / `GetEntityWorkflows` param contracts, the queries and index, the parent/child denormalization, all engine read methods, the `GetWorkflowAction` response shape, and the test/app/doc sweep for the runtime layer.

Order: Part 57 first (so `workflowConfig.entity.connection_id` / `.ref_key` exist to read), then this part. The two are applied in sequence and the repo may be in a **broken state between them** — that is acceptable (unreleased modules, no consumers). No compatibility shim is added for the in-between state; once Part 57 stops lifting `connection_id`/`ref_key` to flat names, `StartWorkflow` and `planEventDispatch` read the (now-absent) flat config fields until this part lands and switches them to `workflowConfig.entity.*`.

## Canonical shapes

### Workflow document

```js
{
  _id,
  workflow_type,
  key,
  display_order,
  entity: { connection_id: 'leads-collection', id: '<lead _id>', ref_key: 'lead_ids' },  // was entity_collection + entity_id + entity_ref_key
  parent_action_id: null,
  parent_workflow_id: null,
  parent_entity: null,            // was parent_entity_id + parent_entity_collection; { connection_id, id } when a tracker child
  status, summary, groups, form_data, created, updated,
}
```

### Action document

```js
{
  _id, workflow_id, type, kind, key, status,
  entity: { connection_id, id },  // was entity_collection + entity_id, denormalized from the parent workflow (no ref_key — unused on actions)
  assignees, due_date, description, access,
  tracker,
  child_workflow_id: null,
  child_entity: null,             // was child_entity_id + child_entity_collection; { connection_id, id } once a child links
}
```

### StartWorkflow payload

```js
{
  // workflow_type is baked into the type-scoped endpoint, not passed
  entity: { id: '<lead _id>' },   // connection_id is sourced from workflowConfig.entity.connection_id
  parent_action_id?, actions?, references?, metadata?,
}
```

The handler composes the document's `entity.connection_id` from config and `entity.id` from the payload:

```js
entity: {
  connection_id: workflowConfig.entity.connection_id,
  id: params.entity.id,
  ref_key: workflowConfig.entity.ref_key,
},
```

### GetEntityWorkflows param + query

```js
// param
{ entity: { connection_id, id } }
// query
findDocs({ collection: workflowsCollection, query: { 'entity.connection_id': connection_id, 'entity.id': id }, … })
```

## Key decisions

### Decision: the pointer member is `connection_id`, not `collection`

The value stored on every workflow/action document and matched by `GetEntityWorkflows` (e.g. `leads-collection`) is a **Lowdefy connection id**: it is declared as a connection `id` in `lowdefy.yaml` and consumed everywhere as `connectionId:` (the `get_entity` request bakes it straight into `connectionId: {{ connection_id }}`). It is not a MongoDB collection name (the actual collection lives inside the connection's config). So the nested pointer member is named `connection_id`, end to end — authored config block (Part 57), persisted document field, `GetEntityWorkflows` param + query, the index, parent/child denormalization, and the template var threaded by `makeActionPages`. Authored name and stored name stay identical (Part 57 no longer lifts to a flat alias), so a developer sees one name top to bottom. The loose "collection" name (`entity_collection`) is retired; references to it below describe the pre-existing flat field being replaced.

### Decision: `entity_ref_key` folds into the workflow `entity` object

`entity_ref_key` (e.g. `lead_ids`) is the **events-references key** — `planEventDispatch` writes `{ [refKey]: [workflow.entity.id] }` onto each event doc so the event surfaces on the entity's timeline (`planEventDispatch.js:160-261`). It is read only off the workflow document, written once at Start from `workflowConfig.entity.ref_key`.

It folds into the workflow document's `entity` object as `entity.ref_key`, so everything about the entity a workflow concerns sits under one key: which connection, which record, and how its events are keyed. `planEventDispatch` reads `workflow.entity.ref_key`.

**Workflow only — accepted asymmetry.** The fold-in applies to the _workflow_ document. Action documents and the denormalized `parent_entity` / `child_entity` links keep the bare `{ connection_id, id }` pointer, because nothing ever reads `ref_key` off them — denormalizing it there would be speculative surface (CLAUDE.md: build for concrete needs). The consequence, accepted deliberately: the object named `entity` has two shapes — `{ connection_id, id, ref_key }` on a workflow, `{ connection_id, id }` on an action / parent / child. The alternative (keep `entity_ref_key` a separate flat field) was the only shape with one uniform `entity` everywhere; it was rejected in favour of co-locating all of a workflow's entity facts under `entity`. The split is contained — `ref_key` appears on exactly one document kind, where it is exactly the doc kind that uses it.

### Decision: drop the connection id from the start payload

Today `StartWorkflow` requires both `params.entity_id` and `params.entity_collection`, then independently loads `workflowConfig` by `workflow_type` — which _also_ declares the connection id. The two are necessarily the same value, so passing the connection id is redundant and introduces a "what if they disagree" failure mode (the handler trusts the payload, the doc could be written against a connection the config doesn't expect). The connection id is a static per-kind fact; only the entity **id** is per-instance. So the payload carries `entity: { id }` and the handler sources `entity.connection_id` from `workflowConfig.entity.connection_id`. One fewer field for callers, one fewer way to be wrong.

This is enforced **mechanically at the request mapping**, not by a schema guard: the generated start endpoint maps only `entity: { id: { _payload: entity.id } }`, so a caller that includes `connection_id` has it dropped at the mapping before the method ever sees it. No `additionalProperties: false` constraint on the `entity` param is needed (and none is added) — the narrow pick is the filter.

`GetEntityWorkflows`, by contrast, genuinely needs `connection_id` as a param: it lists workflows across _all_ types for one entity, so it has no single `workflow_type` to derive the connection id from — it queries the indexed `{ "entity.connection_id", "entity.id" }` pair directly. So its param stays `entity: { connection_id, id }`.

### Decision: `parent_entity` / `child_entity` are nullable objects, not objects-of-nullables

When there is no parent/child link the field is `null` (not `{ connection_id: null, id: null }`). "No link" is naturally one absent object, and `parent ? { connection_id, id } : null` reads cleaner than spreading nulls across members. Types: `parent_entity: { connection_id, id } | null`, `child_entity: { connection_id, id } | null`. The StartWorkflow tracker fire that links a child writes the populated object (`child_entity: { connection_id: childDoc.entity.connection_id, id: childDoc.entity.id }`) onto the parent tracker action via `planActionTransition`'s `payload.fields`, replacing the seed's `null`.

### Decision: index keys go dotted, behaviour unchanged

`workflows.{ entity_collection: 1, entity_id: 1 }` becomes `workflows.{ "entity.connection_id": 1, "entity.id": 1 }`. MongoDB indexes dotted sub-fields identically to top-level fields; the `GetEntityWorkflows` query `{ "entity.connection_id": x, "entity.id": y }` is an exact equality match on the compound prefix, so the index serves it the same way. The non-partial constraint and its rationale (future tasks-module docs) carry over verbatim. No new index is added — the `actions` collection still indexes only `{ workflow_id: 1 }`; action docs carry `entity` but nothing queries it (the read methods read it off already-loaded docs).

### Where "uniform" stops

The nesting is uniform across everything the engine **persists, queries, indexes, and accepts as an API param**. It deliberately stops at two authoring-layer tokens, because neither is a document field, param, or query key:

- **The `computeEngineLinks` link sentinel.** Config authors write `entity_id: true` inside a tracker action's `start_link.urlQuery` to mean "fill this URL param with the entity id" (`computeEngineLinks.js:93-101`). The keyword `entity_id` is simultaneously the recognized sentinel _and_ the emitted URL query-param name that the host start-page reads (`?entity_id=…`). A dotted `entity.id: true` would be awkward YAML and an ugly URL param. The keyword (and its sibling `action_id`) stays flat; only the value the engine substitutes moves to `action.entity.id`.
- **The entity-workflow components' `_var` inputs.** `actions-on-entity.yaml` and `entity-workflows-refetch.yaml` take `_var: entity_id` / `_var: entity_connection_id` (renamed from `entity_collection`) from their `_ref` callers. These are local composition tokens, not the persisted shape — they stay **flat** (a dotted `_var` name would be awkward), but adopt the `connection_id` name for consistency. The components internally assemble `entity: { id: { _var: entity_id }, connection_id: { _var: entity_connection_id } }` when calling `get-entity-workflows`. Renaming the input token touches the Part 56 action-workspace shell that supplies it (a token rename in one place — see Dependencies).

This is the "uniform as possible" line: nest at every machine boundary, leave the two human-authoring tokens flat with a documented reason.

## Files changed

### Engine source (`plugins/modules-mongodb-plugins/src/connections/`)

- `shared/types.js` — `WorkflowDoc`: `entity_id`/`entity_collection`/`entity_ref_key` → `entity: { connection_id, id, ref_key }`; `parent_entity_id`/`parent_entity_collection` → `parent_entity: { connection_id, id } | null`. `ActionDoc`: `entity: { connection_id, id }` (no `ref_key`); `child_entity_id`/`child_entity_collection` → `child_entity: { connection_id, id } | null`.
- `WorkflowAPI/StartWorkflow/StartWorkflow.js` — param precondition: require `params.entity?.id`, drop the `params.entity_collection` check. Doc write: `entity: { connection_id: workflowConfig.entity.connection_id, id: params.entity.id, ref_key: workflowConfig.entity.ref_key }` (no separate `entity_ref_key` field). Parent denorm: `parent_entity: parent ? { connection_id: parent.entity.connection_id, id: parent.entity.id } : null`. Tracker fire: `child_entity: { connection_id: plannedWorkflowDoc.entity.connection_id, id: plannedWorkflowDoc.entity.id }`.
- `WorkflowAPI/GetEntityWorkflows/GetEntityWorkflows.js` — param `{ entity: { connection_id, id } }`; query `{ "entity.connection_id": connection_id, "entity.id": id }`; `entity_link` urlQuery uses `wfDoc.entity.id` (the routing fields already come from `wfConfig.entity` per Part 57).
- `WorkflowAPI/GetWorkflowOverview/GetWorkflowOverview.js`, `…/GetWorkflowActionGroupOverview/…` — `entity_link` urlQuery uses `wfDoc.entity.id`.
- `WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js` — `entity_link` urlQuery uses `action.entity.id`; **response** returns `entity: { connection_id: action.entity?.connection_id ?? null, id: action.entity?.id ?? null }` in place of the flat `entity_id` / `entity_collection` fields.
- `WorkflowAPI/CancelWorkflow/CancelWorkflow.js`, `…/CloseWorkflow/CloseWorkflow.js` — `RESERVED_WORKFLOW_KEYS`: replace `'entity_id'`, `'entity_collection'` with `'entity'`.
- `shared/phases/planners/planActionTransition.js` — action-doc seed: `entity: { connection_id: loadedWorkflow.entity.connection_id, id: loadedWorkflow.entity.id }`; `child_entity: null`.
- `shared/phases/planners/planEventDispatch.js` — `const refKey = workflow.entity.ref_key` and `[refKey]: [workflow.entity.id]` (and the missing-ref_key guard message).
- `shared/render/computeEngineLinks.js` — sentinel value source `action.entity.id` (keyword `entity_id` unchanged); update the doc comment.

### Module (`modules/workflows/`)

- `resolvers/makeWorkflowApis.js` — generated start endpoint: drop the `entity_collection` property; map the id explicitly with `entity: { id: { _payload: entity.id } }`. The narrow pick is deliberate — the mapping itself is the filter, so a caller can't smuggle in a conflicting `connection_id` (it never reaches the method); the connection id is sourced from config per [Decision: drop the connection id from the start payload](#decision-drop-the-connection-id-from-the-start-payload). A whole-object forward (`entity: { _payload: entity }`) is **not** used here: it would either pass a stray `connection_id` through (footgun) or, under a strict `additionalProperties: false` schema, hard-error a start that included one — neither is wanted for internal plumbing.
- `api/get-entity-workflows.yaml` — properties become `entity: { _payload: entity }` (whole-object forward — the param genuinely _is_ `{ connection_id, id }`, so forwarding the client object as-is is exactly right).
- `components/actions-on-entity.yaml`, `components/entity-workflows-refetch.yaml` — rename the `_var: entity_collection` input to `_var: entity_connection_id` (kept flat); build the nested `entity: { connection_id, id }` object in the `get-entity-workflows` call.
- `templates/view.yaml.njk`, `edit.yaml.njk`, `review.yaml.njk`, `error.yaml.njk` + `requests/get_entity.yaml.njk` — the `get_entity` request touches the entity pointer in two distinct places, each resolved differently:
  - **`connectionId`** (`connectionId: {{ connection_id }}`) — a config-derived connection id, threaded in by `makeActionPages`. Rename the template var `entity_collection` → `connection_id`. Its **source** (`makeActionPages.js:86`, `workflow.entity_collection` → `workflow.entity.connection_id`) tracks the authored config shape and is changed under **Part 57** (which owns the authored rename and `makeActionPages`). This part renames only the var name the template reads.
  - **entity id** (`payload.entity_id._request: get_workflow_action.entity_id`) — reads the `GetWorkflowAction` **response**, which this part nests, so change it to `get_workflow_action.entity.id`. This is a **Part 59** change (it consumes the response shape this part owns). (The host page's own `get_entity` request id and the entity-record fields it returns are the host's contract and are unaffected.)

### Indexes + docs

- `docs/workflows/reference/indexes.md` — the `workflows` index → `{ "entity.connection_id": 1, "entity.id": 1 }`; update the query-site table.
- `modules/workflows/README.md` — the `## Indexes` section's `workflows.{ entity_collection: 1, entity_id: 1 }` → dotted `{ "entity.connection_id": 1, "entity.id": 1 }`.
- Doc sweep — `docs/workflows/concepts/*.md` and reference pages that show the document shape or the `{ entity_collection, entity_id }` query update to the nested `entity: { connection_id, id }` shape.

### Apps

- `apps/demo/pages/leads/lead-view.yaml` — start-button payloads `entity_id` / `entity_collection` → `entity: { id }` (connection id dropped); `get-entity-workflows` callers → nested `entity: { connection_id, id }`.
- `apps/demo/modules/workflows/workflow_config/company-setup/billing-details.yaml` — app-authored action requests reading `context.workflow.entity_id` → `context.workflow.entity.id`.
- `apps/demo/modules/companies/vars.yaml` and any other entity-workflow / start callers — same nesting.
- `apps/workflows-test/` — workflow_config start callers, `get-entity-workflows` callers, and the e2e specs + `workflowFixture.js` that seed or assert documents with `entity_collection` / `entity_id` → nested `entity: { connection_id, id }` shape.

### Tests

- Engine suites (`StartWorkflow`, `GetEntityWorkflows`, `GetWorkflowOverview`, `GetWorkflowAction`, `GetWorkflowActionGroupOverview`, `Cancel`, `Close`, `planActionTransition`, `planEventDispatch`, `runTrackerCascade`, `computeEngineLinks`, `loadWorkflowState`, and the planner suites) — fixtures move from flat `entity_collection`/`entity_id` to nested `entity: { connection_id, id }`; assertions on written docs, queries, and responses follow.
- `resolvers/makeWorkflowApis.test.js` — the generated start-endpoint param assertions move to the nested `entity` shape (drop `entity_collection`).

## Non-goals

- No data migration — the modules are unreleased with no consumers.
- No change to the config `entity:` block shape or its validation (Part 57) beyond the `connection_id` member name it shares with this part.
- No new indexes; no change to the `actions` `{ workflow_id: 1 }` index or the validator constraint.
- No change to the `entity_ref_key` mechanism — it relocates onto the workflow `entity` object (`workflow.entity.ref_key`) and its config source becomes `workflowConfig.entity.ref_key` (Part 57), but the event-references behaviour is unchanged.

## Dependencies

- **Depends on Part 57** (`parts/57-inline-entity-config`, updated to put `connection_id` + `ref_key` in the config `entity:` block, kept nested in the materialized config rather than lifted to flat). Sequence 57 → 59.
- **Touches Part 56** (`parts/56-three-tier-action-pages`) surface: the entity-workflow components' `_var` input token is renamed `entity_collection` → `entity_connection_id`, so the Part 56 action-workspace shell that supplies it updates that one token (it still passes a flat value; only the name changes).
