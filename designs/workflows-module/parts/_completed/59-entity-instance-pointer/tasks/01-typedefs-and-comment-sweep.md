# Task 1: Nest the entity pointer in typedefs and sweep stale flat-shape comments

## Context

Across the workflows engine an entity is identified by flat parallel scalars: `entity_collection` + `entity_id` (+ `entity_ref_key` on workflows), with `parent_entity_collection`/`parent_entity_id` and `child_entity_collection`/`child_entity_id` denormalizations. Part 59 collapses these into a single nested `entity` object. This first task lays the documentation foundation — JSDoc typedefs and stale doc comments — with **no behavioural change**, so every later task references one canonical shape.

Canonical shapes (from the design):

- **Workflow doc:** `entity: { connection_id, id, ref_key }` (the flat `entity_ref_key` folds in here); `parent_entity: { connection_id, id } | null`.
- **Action doc:** `entity: { connection_id, id }` (no `ref_key` — actions never read it); `child_entity: { connection_id, id } | null`.

`parent_entity` / `child_entity` are **nullable objects, not objects-of-nullables**: when there is no link the field is `null`, not `{ connection_id: null, id: null }`.

## Task

### `shared/types.js`

In the `WorkflowDoc` typedef, replace:

```
 * @property {string} entity_id
 * @property {string} entity_collection
 * ... (entity_ref_key)
 * @property {string | null} parent_entity_id
 * @property {string | null} parent_entity_collection
```

with a nested `entity` object property and a nullable `parent_entity` object:

```
 * @property {{ connection_id: string, id: string, ref_key: string }} entity
 * @property {{ connection_id: string, id: string } | null} parent_entity
```

In the `ActionDoc` typedef, replace:

```
 * @property {string} entity_id
 * @property {string} entity_collection
 * @property {string | null} child_entity_id
 * @property {string | null} child_entity_collection
```

with:

```
 * @property {{ connection_id: string, id: string }} entity
 * @property {{ connection_id: string, id: string } | null} child_entity
```

(Confirm exact line numbers; current refs are around `types.js:24-62`.)

### Comment-only sweep (no behavioural change)

Update stale flat-shape references in doc comments only:

- `shared/errors.js` (~line 10) — Start's param list names `entity_id`/`entity_collection`; update to the nested `entity: { id }` param (connection id is sourced from config, not the payload — see Task 3).
- `shared/phases/runTrackerCascade.js` (~line 63) — `payload.fields` doc comment names `child_entity_id`, `child_entity_collection`; update to `child_entity: { connection_id, id }`.
- `shared/phases/planners/planTrackerLevel.js` (~lines 46-47) — same `child_entity_id`/`child_entity_collection` mention in the `payload.fields` doc comment; update to `child_entity: { connection_id, id }`.

## Acceptance Criteria

- `types.js` `WorkflowDoc` and `ActionDoc` describe the nested `entity` / `parent_entity` / `child_entity` shapes; no `entity_collection` / `entity_id` / `entity_ref_key` / `parent_entity_*` / `child_entity_*` properties remain in these typedefs.
- Doc comments in `errors.js`, `runTrackerCascade.js`, `planTrackerLevel.js` name the nested shape.
- No runtime/behavioural code changed in this task; the engine test suites still pass unchanged (`pnpm --filter @lowdefy/modules-mongodb-plugins test` or the package's test script).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/types.js` — modify — nest `entity` / `parent_entity` (WorkflowDoc), `entity` / `child_entity` (ActionDoc) in the JSDoc typedefs.
- `plugins/modules-mongodb-plugins/src/connections/shared/errors.js` — modify — comment-only: Start param list to nested `entity`.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/runTrackerCascade.js` — modify — comment-only: `child_entity` nested.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planTrackerLevel.js` — modify — comment-only: `child_entity` nested.

## Notes

In-file comments inside files that change behaviourally in later tasks (StartWorkflow, planActionTransition, planEventDispatch, computeEngineLinks, etc.) are updated alongside their code in those tasks — not here.
