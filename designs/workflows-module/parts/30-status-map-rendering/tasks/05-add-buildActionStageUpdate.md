# Task 5: Add `buildActionStageUpdate` pipeline builder

## Context

All three call sites that transition an action's stage (single `updateAction`, Cancel cascade, Close cascade) need the same update shape. The build switches to a Mongo aggregation pipeline `$set` so we can use `$concatArrays` to prepend the new status entry and `$mergeObjects` to merge engine-computed links onto each slug subtree.

The pipeline replaces today's two-step `$set` + `$push` shape with a single `$set`:

```js
[
  {
    $set: {
      updated: changeStamp,
      status: {
        $concatArrays: [
          [{ stage: newStage, event_id: eventId, created: changeStamp }],
          "$status",
        ],
      },
      metadata: mergedMetadata,
      ...renderedCell,   // sticky author content (message, status_title)
      ...engineLinks,    // built-in kinds: { [slug]: { $mergeObjects: ['$<slug>', { link }] } }; custom kind: {}
    },
  },
];
```

For built-in kinds, `engineLinks` carries per-slug `$mergeObjects` expressions that preserve any sticky `message` on the slug subtree while overwriting `link`. For `kind: custom`, `engineLinks` is `{}` and the author's `link` flows through `renderedCell`.

## Task

Add `plugins/modules-mongodb-plugins/src/connections/shared/buildActionStageUpdate.js` exporting a default function:

```js
buildActionStageUpdate({ renderedCell, engineLinks, newStage, mergedMetadata, eventId, changeStamp }) → pipeline
```

Output: a one-element array — the single-stage aggregation pipeline above.

Add `buildActionStageUpdate.test.js` covering:
- Pipeline is a one-element array with `$set` at the top level.
- `$set.status` is a `$concatArrays` of `[{ new entry }]` and `'$status'`, in that order (new entry first → prepended).
- The new status entry contains `{ stage: newStage, event_id: eventId, created: changeStamp }`.
- `$set.updated` is `changeStamp`.
- `$set.metadata` is `mergedMetadata`.
- Fields from `renderedCell` appear at the top level of `$set`.
- Fields from `engineLinks` (e.g. `{ demo: { $mergeObjects: ['$demo', { link: ... }] } }`) appear at the top level of `$set`.
- Empty `engineLinks` (custom-kind case) produces a pipeline with no slug-merge fields — only `renderedCell` carries the link.

## Acceptance Criteria

- Helper and test file exist under `src/connections/shared/`.
- All test cases pass.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/buildActionStageUpdate.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/shared/buildActionStageUpdate.test.js` — create.
