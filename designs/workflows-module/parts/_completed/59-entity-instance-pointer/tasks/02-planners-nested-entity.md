# Task 2: Read/write the nested entity shape in the planners

## Context

Two planners touch the entity pointer and are invoked by StartWorkflow and the submit path:

- `planActionTransition` seeds/transitions action docs. Its action-doc seed currently copies the flat `entity_id` / `entity_collection` off the loaded workflow and writes `child_entity_id: null` / `child_entity_collection: null`.
- `planEventDispatch` writes the events-references key onto each event doc so the event surfaces on the entity's timeline. It reads `workflow.entity_ref_key` and writes `{ [refKey]: [workflow.entity_id] }`.

Part 59 nests the entity object: action docs carry `entity: { connection_id, id }` and `child_entity: { connection_id, id } | null`; the workflow doc carries `entity: { connection_id, id, ref_key }`, so `entity_ref_key` becomes `entity.ref_key`.

## Task

### `shared/phases/planners/planActionTransition.js`

In the action-doc seed (~lines 176-184), replace the flat copy:

```js
entity_id: loadedWorkflow.entity_id,
entity_collection: loadedWorkflow.entity_collection,
// ...
child_entity_id: null,
child_entity_collection: null,
```

with the nested shape:

```js
entity: {
  connection_id: loadedWorkflow.entity.connection_id,
  id: loadedWorkflow.entity.id,
},
// ...
child_entity: null,
```

Update the seed doc comment (~line 85) that names `_id` / `entity_id` / `entity_collection` of the loaded workflow to reference `loadedWorkflow.entity.*`.

### `shared/phases/planners/planEventDispatch.js`

- `const refKey = workflow.entity_ref_key;` → `const refKey = workflow.entity.ref_key;` (~line 160).
- The reference write `[refKey]: [workflow.entity_id]` → `[refKey]: [workflow.entity.id]` (~line 261).
- Update the missing-ref_key guard message (~line 163) and the `@property` doc comment (~line 113) that say `entity_ref_key` to reference `entity.ref_key` (e.g. "workflow.entity.ref_key is required — the workflow config must declare entity.ref_key").

### Tests

Update the colocated suites so their workflow/action fixtures use the nested shape and assertions follow:

- `planActionTransition.test.js` — `loadedWorkflow` fixtures carry `entity: { connection_id, id }`; assertions on the seeded action doc expect `entity: { connection_id, id }` and `child_entity: null`.
- `planEventDispatch.test.js` — `workflow` fixtures carry `entity: { connection_id, id, ref_key }`; assertions on the event reference key expect `[ref_key]: [entity.id]`; the missing-ref_key case sets up an absent `entity.ref_key`.

## Acceptance Criteria

- `planActionTransition` seeds `entity: { connection_id, id }` and `child_entity: null`; no flat `entity_*` / `child_entity_*` keys remain.
- `planEventDispatch` reads `workflow.entity.ref_key` and writes `[refKey]: [workflow.entity.id]`; the guard fires when `entity.ref_key` is absent.
- `planActionTransition.test.js` and `planEventDispatch.test.js` pass.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` — modify — nested action-doc seed + `child_entity: null`.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js` — modify — `entity.ref_key` / `entity.id` reads + guard message.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.test.js` — modify — nested fixtures + assertions.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.test.js` — modify — nested fixtures + assertions.

## Notes

`planActionTransition` reads `loadedWorkflow.entity.*` directly (no `?.`), matching the design's seed snippet — the loaded workflow always carries a populated `entity`. The `child_entity: { connection_id, id }` write that **replaces** the seed's `null` happens via `payload.fields` on the tracker-fire path (StartWorkflow, Task 3) — not here.
