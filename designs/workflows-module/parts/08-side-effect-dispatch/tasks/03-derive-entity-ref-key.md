# Task 3: `deriveEntityRefKey.js` helper

## Context

The default log event's `references` block carries `<entity-ref-key>: [workflow.entity_id]` so the event surfaces on entity-page timelines (which query by `<entity>_ids`, per [apps/demo/.claude/guides/events.md](../../../../../apps/demo/.claude/guides/events.md)). The entity ref key is derived from `workflow.entity_collection`:

- `leads-collection` → `leads_ids`
- `tickets-collection` → `tickets_ids`
- `user-contacts` → `user_contacts_ids`

The rule: **strip a trailing `-collection` if present, replace remaining `-` with `_`, append `_ids`.**

The rule is small (~5 LOC), pure, and unit-testable in isolation. Split it into its own file so it's reusable (Part 11's group `on_complete` fan-out may want to surface the same key) and so it can be tested without standing up `buildDefaultLogEventPayload`.

## Task

Create [plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/deriveEntityRefKey.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/deriveEntityRefKey.js):

```js
/**
 * Derive the entity-ref key used on log-event `references` blocks.
 *
 * Convention: `references.<entity>_ids` — matches the events module timeline's
 * `$<reference_field>` projection in modules/events/components/events-timeline.yaml.
 *
 * Rule:
 *   - Strip a trailing `-collection` if present.
 *   - Replace remaining `-` with `_`.
 *   - Append `_ids`.
 *
 * Examples:
 *   leads-collection → leads_ids
 *   tickets-collection → tickets_ids
 *   user-contacts → user_contacts_ids
 *   contacts → contacts_ids
 *
 * @param {string} entityCollection
 * @returns {string}
 */
function deriveEntityRefKey(entityCollection) {
  if (typeof entityCollection !== 'string' || entityCollection.length === 0) {
    throw new Error('deriveEntityRefKey: entityCollection is required');
  }
  const stripped = entityCollection.endsWith('-collection')
    ? entityCollection.slice(0, -'-collection'.length)
    : entityCollection;
  return `${stripped.replace(/-/g, '_')}_ids`;
}

export default deriveEntityRefKey;
```

Create the colocated test file [deriveEntityRefKey.test.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/deriveEntityRefKey.test.js):

Table-driven, four cases minimum:

| `entityCollection`  | expected            |
| ------------------- | ------------------- |
| `leads-collection`  | `leads_ids`         |
| `tickets-collection`| `tickets_ids`       |
| `user-contacts`     | `user_contacts_ids` |
| `contacts`          | `contacts_ids`      |

Plus throw cases for empty string and non-string input.

## Acceptance Criteria

- File created at the path above with the function as JSDoc-typed.
- Test file colocated, runs under `pnpm test` from the repo root.
- All four happy-path cases plus the two throw cases pass.
- `node -e "import('./...').then(m => console.log(m.default('leads-collection')))"` smoke check returns `leads_ids`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/deriveEntityRefKey.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/deriveEntityRefKey.test.js` — create.

## Notes

- Match the existing utility style — see sibling files `getCurrentAction.js`, `shouldCreate.js`, `shouldUpdate.js` in the same `utils/` directory. Single default export, JSDoc-typed, paired test file.
- Don't generalize beyond the design's rule. There's no need to handle plural-singular conversion (`leads` → `lead`) or anything else — the rule is mechanical string manipulation.
- The function throws on invalid input rather than returning a default. Reason: a missing `entity_collection` at handler entry is a workflow-config schema violation (Part 21 made `entity_collection` required), so reaching this point with bad input is a real engine bug worth surfacing loudly.
