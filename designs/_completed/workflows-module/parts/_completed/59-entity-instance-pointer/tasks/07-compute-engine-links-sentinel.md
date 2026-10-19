# Task 7: computeEngineLinks — substitute the entity id from action.entity.id (keyword stays flat)

## Context

`computeEngineLinks.js` resolves a tracker action's `start_link.urlQuery` link sentinels. Config authors write `entity_id: true` inside the urlQuery to mean "fill this URL param with the entity id" (~lines 96-97):

```js
} else if (key === 'entity_id' && val === true) {
  urlQuery[key] = action.entity_id;
```

The keyword `entity_id` is simultaneously the recognized **sentinel** and the emitted URL query-param **name** that the host start-page reads (`?entity_id=…`). Per the design's "Where uniform stops", the keyword stays flat (a dotted `entity.id: true` would be awkward YAML and an ugly URL param). Only the **value the engine substitutes** moves to the nested doc field.

## Task

In `computeEngineLinks.js`, change the substituted value only:

```js
} else if (key === 'entity_id' && val === true) {
  urlQuery[key] = action.entity.id;
```

Keep the keyword check `key === 'entity_id'` and the emitted param name `urlQuery[key]` (i.e. `entity_id`) exactly as-is. Update the doc comment (~line 27) that reads `entity_id: true → action.entity_id` to `entity_id: true → action.entity.id`.

### Test

`computeEngineLinks.test.js` — action fixtures carry `entity: { connection_id, id }`; assert the resolved `urlQuery.entity_id` equals `action.entity.id` (the emitted param name remains `entity_id`).

## Acceptance Criteria

- The sentinel keyword and emitted URL param name remain `entity_id` (flat); the substituted value reads `action.entity.id`.
- The `action_id` sibling sentinel is unchanged.
- `computeEngineLinks.test.js` passes.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js` — modify — sentinel value source + doc comment.
- `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.test.js` — modify — nested fixtures + assertion.
