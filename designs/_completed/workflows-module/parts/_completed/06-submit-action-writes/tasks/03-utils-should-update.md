# Task 3: `utils/shouldUpdate.js` — priority rule + self-exception + force gate

## Context

The priority rule from [design.md § Priority rule](../design.md#priority-rule) is the load-bearing transition gate for the per-entry write loop in step 4. It decides whether each `actions[]` entry's status push lands or no-ops.

Rule summary (from design.md):

- Allow when `priority(new) < priority(current)`.
- Self-exception: same-stage allowed for the `currentActionId`. A re-click writes a fresh status entry — audit history is the source of truth for "user did this again."
- Per-entry `force: true` bypasses the rule for that entry only. **Per-entry is the only force surface** — no top-level `force` on the handler payload.
- Priority is read from `connection.actionsEnum[stage].priority`. A resolved target status not present in `actionsEnum` throws.
- `not-required` (priority 0) is universal terminal.

V0 reference: `dist/workflows-module/old/WorkflowAPI/UpdateWorkflowActions/utils/shouldUpdate.js` (18 lines). v0's check computes `getAllowedTransitions` (every status with priority < current), then permits when the new status is in that set, OR `params.currentActionId === fetchedAction._id`, OR `actionUpdate.force`. v0 also short-circuits `false` if `fetchedAction.status[0].stage === actionUpdate.status` — that's a different shape from the new design (the new self-exception **does** allow same-stage on `currentActionId`, writing a fresh audit entry).

The new shape diverges from v0 in two specific ways, per part 6 review-1 findings #13 and #5:

1. **Same-stage on `currentActionId` writes a fresh audit entry.** v0 returned `false` (no write); the new design returns `true` and lets the duplicate push land as audit history.
2. **Same-stage on non-self entries rejects via the priority rule** (priority(X) < priority(X) is false), not via a separate `actionUpdate.status === fetchedAction.status[0].stage` early-exit.

## Task

Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/shouldUpdate.js`.

Signature:

```js
/**
 * Apply the priority rule to a single per-entry status transition.
 *
 * Returns `true` if the transition should land (priority allows it, the
 * self-exception applies, or the entry opts in with `force: true`).
 * Returns `false` if the priority rule rejects it.
 *
 * Throws when the new status is not present in `actionsEnum` (guards typos in
 * `action.interactions[*].status` overrides and pre-hook return values that
 * resolved to unknown stages, per part 6 design § Priority rule).
 *
 * @param {Object} args
 * @param {Object} args.actionsEnum — `connection.actionsEnum`; each value
 *   carries `priority: number` (load-bearing). Other display fields ignored.
 * @param {string} args.currentActionId — the user-submitted action's id.
 * @param {Object} args.actionEntry — one entry from the internal `actions[]`
 *   array: `{ type, status, keys?, fields?, references?, force? }`.
 * @param {Object} args.fetchedAction — the action doc as currently in Mongo:
 *   `{ _id, status: [{ stage, ... }, ...], ... }`.
 * @returns {boolean}
 */
function shouldUpdate({
  actionsEnum,
  currentActionId,
  actionEntry,
  fetchedAction,
}) {
  // ...
}

export default shouldUpdate;
```

Behaviour:

1. **Per-entry force bypass.** If `actionEntry.force === true`, return `true` immediately. No priority lookup, no self-exception check.

2. **Validate the new status exists in `actionsEnum`.** Look up `actionsEnum[actionEntry.status]`. If undefined or missing `priority`, throw:

   ```js
   throw new Error(
     `shouldUpdate: target status "${actionEntry.status}" not found in actionsEnum (typo or missing display config?)`,
   );
   ```

3. **Read current priority.** Look up `actionsEnum[fetchedAction.status[0].stage].priority`. If the current stage isn't in `actionsEnum` either, throw the same shape of error.

4. **Self-exception.** If `fetchedAction._id === currentActionId`, return `true`. The self-exception allows same-stage re-clicks; the audit-history posture is intentional (design.md § Priority rule).

5. **Priority comparison.** Return `actionsEnum[actionEntry.status].priority < currentPriority`. Strict less-than. Same-stage on non-self entries returns `false` (idempotency falls out of this case).

Note that `not-required` (priority 0) being the universal terminal is **not a special case here** — it falls out of the priority rule naturally (priority 0 is less than every other priority; only `force: true` can push onto an already-`not-required` action, and that's via the force-bypass branch above).

## Acceptance Criteria

- File exists at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/shouldUpdate.js`.
- Default export matches the signature above.
- Per-entry `force: true` short-circuits to `true` without reading `actionsEnum` or `fetchedAction.status`.
- Unknown new-status (`actionsEnum[actionEntry.status]` undefined) throws with a precise message naming the offending status.
- Self-exception returns `true` on same-id entries regardless of priority comparison (so same-stage re-clicks write fresh audit entries).
- Non-self entries return `true` only when strict priority comparison passes.
- Pure function (no Mongo, no I/O) — colocated `shouldUpdate.test.js` is table-driven and doesn't need `inMemoryMongo`.
- Plugin builds cleanly.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/shouldUpdate.js` — create — pure priority-rule check.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/utils/shouldUpdate.test.js` — create — table-driven cases:
  - `force: true` short-circuits to `true` even when priority would reject.
  - Unknown new status throws.
  - Self-exception: same-id entry with same stage returns `true`.
  - Non-self same-stage returns `false` (strict less-than).
  - Allowed transition (lower priority) returns `true`.
  - `not-required` (priority 0) can be pushed onto any non-terminal stage; pushing onto already-`not-required` requires `force` (returns `false` without it).

## Notes

- The fixture `actionsEnum` for tests can be a minimal shape: `{ done: { priority: 3 }, 'not-required': { priority: 0 }, 'action-required': { priority: 6 }, ... }`. Doesn't need the full display fields.
- This utility is consumed by the extended `updateAction.js` (task 5) and the per-entry write loop (task 10). Both call it once per entry per write.
- Keep it pure. No Mongo dispatcher access, no side effects. The fetched action doc is the responsibility of the caller (`getCurrentAction.js` from task 2 fetches it before calling here).
