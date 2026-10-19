# Task 2: Add `substituteActionIdSentinel` helper

## Context

For `kind: custom` (Part 28), authors write `link:` in `status_map` cells using the sentinel `{ action_id: true }` for the URL-query value so the cell config doesn't need to know the action's UUID at authoring time. After Nunjucks rendering, the engine substitutes any `{ action_id: true }` occurrence with the real action UUID before writing the cell onto the action doc.

Built-in kinds don't go through this swap — the engine builds `urlQuery` directly with the UUID when computing the link.

## Task

Add `plugins/modules-mongodb-plugins/src/connections/shared/substituteActionIdSentinel.js` exporting a default function:

```js
substituteActionIdSentinel(node, actionId) → node
```

Recursive walk of the rendered cell tree. Any object whose entry value matches the exact literal `{ action_id: true }` is replaced with the `actionId` string. The walk preserves all other keys/values unchanged. Primitives, `null`, and `undefined` pass through.

Choose the simplest correct shape — walking the tree once and replacing values keyed by `action_id` whose value is exactly `true` is fine; you do not need to support deeper sentinel shapes.

Name is `substituteActionIdSentinel` to avoid collision with the existing `connections/shared/populateIds.js` (UUID assigner for new action drafts).

Add `substituteActionIdSentinel.test.js` covering:

- A `link.urlQuery.action_id: true` in a custom-kind cell is swapped to the UUID string.
- Other primitive values (`true` outside the `action_id` key) pass through unchanged.
- Nested structures are walked correctly.
- Cells with no sentinel pass through unchanged.

## Acceptance Criteria

- Helper file and test file exist under `src/connections/shared/`.
- Tests pass.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/substituteActionIdSentinel.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/shared/substituteActionIdSentinel.test.js` — create.
