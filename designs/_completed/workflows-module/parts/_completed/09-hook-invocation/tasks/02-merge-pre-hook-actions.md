# Task 2: `mergePreHookActions.js` — pre-hook actions[] merge with collision rule

## Context

Part 6's per-entry write loop ([handleSubmit.js:186–237](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) iterates over `internal.actions` and writes one transition per `(type, key)` pair. It reads the **plural** `keys` field (`const keys = entry.keys ?? [null];` at line 188).

In v1 the list contains:

1. The `currentActionId` entry built at step 1 ([handleSubmit.js:153–161](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) — already plural.
2. Auto-unblock entries from [computeAutoUnblocks.js](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/computeAutoUnblocks.js) — currently emit no `keys` field (action-type unblocks; no key). The loop's `entry.keys ?? [null]` defaults handle this correctly today.

Part 9 adds pre-hook `actions[]` entries on top, in the **singular** spec shape:

```
{ type, key?, status?, fields?, upsert?, force? }
```

Per the design, the merge function must:

- Normalise **all three** inputs to engine-internal `{ type, keys, ... }` shape — the step-1 `currentActionEntry`, the auto-unblock entries, and the pre-hook entries. Apply the same default everywhere: `keys: undefined → [null]`. Specifically:
  - Pre-hook entries: singular `key` → plural `keys: [<key>]`; omitted/null key → `keys: [null]`.
  - Auto-unblock entries arrive **keyless** from `computeAutoUnblocks` (`{ type, status: 'action-required' }`); default `keys: undefined → [null]`. Keyed-action fan-out for auto-unblocks is tracked under [Part 31](../../../_next/31-keyed-auto-unblock-fanout/design.md) — out of scope here.
  - The step-1 `currentActionEntry` has `keys: params.current_key ? [params.current_key] : undefined` ([`handleSubmit.js:152–161`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)) — non-keyed actions land at `keys: undefined` and need the same default before collision evaluation.
- Expand both pre-hook and auto-unblock entries across their (now-normalised) `keys` arrays before evaluating collisions.
- **Collision rule:** on `(type, key)` match between a pre-hook entry and an auto-unblock entry, the pre-hook entry **replaces** the auto-unblock entry for that pair (not a per-field overlay).
- **`currentActionId` collision:** if a pre-hook entry's `(type, key)` matches the step-1 `currentActionId` entry, the pre-hook entry replaces that entry too. If the replacement omits `status`, the engine grafts in the three-layer-resolved status (from Task 1) so the entry's effective target stage matches the top-level channel.
- The `currentActionId` entry itself must remain in the merged list under the same logical identity (so step 4 still knows which doc is the submitted one) — the replacement keeps the `currentActionId` semantic by writing to the same `(type, key)` pair the user-submitted action lives on; the per-entry loop at step 4 handles the self-exception by id at write time.

## Task

1. Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/mergePreHookActions.js`. Export default function with the signature:

   ```js
   mergePreHookActions({
     currentActionEntry,      // the step-1 entry: { type, status, keys, fields }
     autoUnblockEntries,      // Array — output of computeAutoUnblocks
     preHookActions,          // Array | undefined — raw pre-hook return `actions[]`
     resolvedStatus,          // string — result of resolveTargetStatus with all three layers
   }) → Array<{ type, status?, keys, fields?, force? }>
   ```

2. Normalize every entry to the internal `{ type, status?, keys, fields?, force? }` shape:
   - Pre-hook `{ key }` → `{ keys: [key] }`.
   - Pre-hook with no `key` (or `key: null`) → `{ keys: [null] }`.
   - Auto-unblock entries pass through unchanged (today they have no `keys` field — emit `keys: [null]` so downstream comparison is uniform).
   - `upsert: true` from pre-hook entries flows through unchanged (Part 6's write loop owns the create branch — see [handleSubmit.js:196–202](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)).

3. Expand each entry across its `keys` array into a flat list of `(type, single-key)` write intents, then collapse back to internal `{ type, keys: [single-key], ... }` form for the loop (one entry per `(type, key)` pair).

4. Build the merged list:
   - Start from the auto-unblock entries (post-expand).
   - For each pre-hook entry (post-expand): if a `(type, key)` match exists in the merged list, replace that entry; else append.
   - For the `currentActionEntry`: if a pre-hook entry matches its `(type, key)`, the pre-hook entry replaces it. If the pre-hook entry omits `status`, set its `status` to `resolvedStatus`. Otherwise prepend `currentActionEntry` (preserving its first-position semantics so step 4's `actionIds` ordering remains stable).

5. Pre-hook entries' `force: true` flag passes through; default `force` is absent (write loop reads `entry.force === true`).

6. Colocated `mergePreHookActions.test.js` covers:
   - No pre-hook entries → output is `[currentActionEntry, ...autoUnblocks]` with auto-unblocks normalised to `keys: [null]`.
   - Pre-hook entry `{ type: X, status: Y }` matching an auto-unblock entry `{ type: X, status: 'action-required' }` → pre-hook replaces; one entry for `(X, null)` in output with `status: Y`.
   - Pre-hook entry `{ type: X, key: 'k1', status: Y }` plus auto-unblock `{ type: X }` (no key) → both written (different `(type, key)` pairs).
   - Pre-hook entry with `keys` expansion — `{ type: X, key: 'k1' }` and `{ type: X, key: 'k2' }` → two entries.
   - Pre-hook entry whose `(type, key)` matches `currentActionEntry` and omits `status` → replaces; gets `resolvedStatus` grafted in.
   - Same scenario but with explicit `status` → graft skipped; pre-hook `status` wins.
   - Pre-hook entry with `force: true` → flag preserved.
   - Pre-hook entry with `upsert: true` → flag preserved (write-loop concern).
   - Pre-hook entry `{ type: X, status: 'error' }` → entry preserved; design note: priority rule will allow it because `error.priority = 1` (assertion belongs in handler tests, not this util).

## Acceptance Criteria

- `mergePreHookActions.js` exists; pure function (no Mongo, no callApi).
- `mergePreHookActions.test.js` exists; all cases above pass.
- Output shape is compatible with Part 6's per-entry write loop input (`{ type, status?, keys, fields?, force? }`).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/mergePreHookActions.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/mergePreHookActions.test.js` — create.

## Notes

- The merge does **not** apply the priority rule — that's Part 6's per-entry `updateAction` concern. Pre-hook entries without `force` may produce no-op writes; that's expected and surfaced by Part 6's existing loop semantics.
- Today's `computeAutoUnblocks.js` emits entries without a `keys` field. The design owns the engine-internal `{ type, keys, ... }` shape inside the merge function — don't modify `computeAutoUnblocks` — so part 9 is the sole change site.
- The merge's "replace on collision" rule is intentionally not a per-field overlay. Design rationale: silently mixing engine-default fields with author intent invites debugging traps. The test cases lock this in.
