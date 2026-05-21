# Task 3: Push `completed` to workflow status with defensive `references` spread

## Context

After Task 2, `CloseWorkflow.js` validates payload + stage and falls through on `active` workflows. This task adds the first write: push `completed` onto the workflow's `status[]` array, optionally writing `reason` into the status entry and spreading payload `references` onto the workflow doc — defended against reserved-key collisions.

Two design references are load-bearing here:

**[design.md:22](../design.md)** — payload `references` are spread onto the workflow doc on close, defended via the same `RESERVED_WORKFLOW_KEYS` deletion pattern shipped in `CancelWorkflow.js:4–18`. The engine spec's "merge order" rule alone doesn't protect the workflow close write because it combines `$set` with `$push: status` — a malicious `references: { status: [...] }` would land in `$set` before `$push` appends, replacing the existing status array.

**[design.md § Write sequence step 1](../design.md)** — one inline `MongoDBUpdateOne` doing both the defended-`references` `$set` and the `completed` `$push`. The shipped `shared/pushWorkflowStatus.js` helper isn't a fit here — its signature can't carry the `reason` field on the entry or a `$set` of defended `references`, so inlining keeps the close write to one round-trip and matches `CancelWorkflow.js:55–69`'s shape exactly. The same-stage idempotency guard the helper would provide is already covered by Task 2's stage gate (already-`completed` returns at the gate without reaching this code).

## Task

### 1. Add `RESERVED_WORKFLOW_KEYS` constant

At the top of `CloseWorkflow.js`, after the imports:

```js
const RESERVED_WORKFLOW_KEYS = [
  '_id',
  'workflow_id',
  'type',
  'workflow_type',
  'entity_id',
  'entity_collection',
  'status',
  'summary',
  'groups',
  'form_data',
  'created',
  'updated',
];
```

This list is verbatim from `CancelWorkflow.js:4–18`. Keep the two lists in sync — if `CancelWorkflow.js`'s list ever grows, `CloseWorkflow.js` grows with it.

### 2. Inside the handler, after Task 2's validation block, defend `references`

```js
const safeReferences = { ...(payload.references ?? {}) };
for (const key of RESERVED_WORKFLOW_KEYS) {
  delete safeReferences[key];
}
```

### 3. Build the `completed` status entry

```js
const completedEntry = {
  stage: 'completed',
  created: context.changeStamp,
  ...(payload.reason ? { reason: payload.reason } : {}),
};
```

### 4. Issue the workflow-doc write

One `MongoDBUpdateOne` doing both the defended `$set` of `references` and the `$push` of `completed`:

```js
await context.mongoDBConnection('workflows').MongoDBUpdateOne({
  filter: { _id: payload.workflow_id },
  update: {
    $set: {
      ...safeReferences,
      updated: context.changeStamp,
    },
    $push: {
      status: {
        $position: 0,
        $each: [completedEntry],
      },
    },
  },
});
```

The `$position: 0` keeps newest-at-index-0 ordering — same convention every workflow + action status write uses.

## Acceptance Criteria

Add unit tests to `CloseWorkflow.test.js`:

- **Happy path:** seed an `active` workflow with `status[0].stage === 'active'`; call `CloseWorkflow({ workflow_id: 'wf-1' })`; assert the workflow's `status[0]` is now `{ stage: 'completed', created: <changeStamp> }` and `status[1]` is the original active entry.
- **Reason propagated:** call with `{ workflow_id, reason: 'lead went cold' }`; assert `status[0].reason === 'lead went cold'`.
- **Reason omitted:** call without `reason`; assert `'reason' in status[0]` is `false` (no empty/null reason field).
- **References spread:** call with `{ workflow_id, references: { company_ids: ['c1'], region_ids: ['r1'] } }`; assert the workflow doc now has `company_ids: ['c1']` and `region_ids: ['r1']` at the root.
- **Reserved-key collision blocked:** call with `{ workflow_id, references: { status: ['injected'], summary: { hax: true } } }`; assert `status[0].stage === 'completed'` (the `$push` lands on the real status array) and `summary` is whatever the seeded workflow had — `references.status` and `references.summary` were dropped.
- **`updated` change-stamp:** assert the workflow doc's `updated` field equals `context.changeStamp`.

Subsequent tasks (4–6) will add more writes; this task's tests only assert the status-push + references-spread shape. Leave them passing without modification when later tasks land.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.js` — modify — add `RESERVED_WORKFLOW_KEYS`; add defensive-delete + status-push block.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.test.js` — modify — add six tests above.

## Notes

- Don't import `shared/pushWorkflowStatus.js`. Its signature doesn't accommodate `reason` on the entry or `$set` of `references`. Inlining the write matches `CancelWorkflow.js`'s shipped shape exactly and keeps the close write to one Mongo round-trip.
- If a future refactor pulls `references`-defense + status-push into a shared helper across `CancelWorkflow` and `CloseWorkflow`, that's a follow-on — not in this task's scope.
- The `safeReferences` spread happens BEFORE `updated: context.changeStamp` in the `$set` block. Order matters: if `references` ever contained an `updated` key (it can't — `updated` is in `RESERVED_WORKFLOW_KEYS`), the explicit `updated:` line would still win. The defensive list is the primary defence; merge-order is the safety net.
