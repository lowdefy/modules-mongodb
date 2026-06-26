# Task 1: `deriveGroupStatus.js` — pure 3-value group-status derivation

## Context

Group status is a derived 3-value enum (`blocked` / `in-progress` / `done`), distinct from the 8-value action-status enum. Every later task in part 7 reads this rule:

- `StartWorkflow` extension (task 5) calls it once per declared group to pre-populate `groups[]` at workflow creation.
- `recomputeGroups.js` (task 3) calls it per group to build the workflow doc's full `groups[]` array.
- `CancelWorkflow` extension (task 9) calls it during the cancel-side `groups[]` write.

It's a pure function — no Mongo, no I/O — so it lives next to the other `SubmitWorkflowAction` pure utilities (`computeAutoUnblocks.js`, `utils/getCurrentAction.js`, etc.) at the part-7 / part-6 boundary. Folder choice: `SubmitWorkflowAction/` (rather than `shared/`) because that's where `computeAutoUnblocks.js` lives and the group state machine is logically engine work.

## Task

Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/deriveGroupStatus.js`.

Signature:

```js
/**
 * Derive a group's status from the actions assigned to it.
 *
 * Three-value enum (distinct from the 8-value action-status enum):
 *   - 'done'        — every action in the group is terminal ('done' or
 *                     'not-required'). Empty groups are 'done' by convention.
 *   - 'blocked'     — every non-terminal action in the group is 'blocked'.
 *   - 'in-progress' — otherwise.
 *
 * @param {Array<Object>} groupActions — actions belonging to the group, each
 *   shaped `{ status: [{ stage, ... }, ...], ... }`. Pre-filtered by caller
 *   (the caller already knows which actions belong to which group).
 * @returns {'done' | 'blocked' | 'in-progress'}
 */
function deriveGroupStatus(groupActions) {
  // ...
}

export default deriveGroupStatus;
```

Behaviour:

1. **Empty group** (`groupActions.length === 0`) → return `'done'`.

2. **All terminal** → return `'done'`. An action is terminal when `status[0].stage ∈ {'done', 'not-required'}`.

3. **All non-terminal actions are `blocked`** → return `'blocked'`. Walk every action; if any action has `status[0].stage !== 'blocked'` AND is non-terminal, fall through to step 4.

4. **Otherwise** → return `'in-progress'`.

A clean two-pass implementation is fine:

```js
function deriveGroupStatus(groupActions) {
  if (groupActions.length === 0) return "done";
  const TERMINAL = ["done", "not-required"];
  const stages = groupActions.map((a) => a.status?.[0]?.stage);
  if (stages.every((s) => TERMINAL.includes(s))) return "done";
  if (stages.every((s) => TERMINAL.includes(s) || s === "blocked"))
    return "blocked";
  return "in-progress";
}
```

The `'blocked'` rule reads as "every non-terminal action is `blocked`" — equivalently, "no action has a non-terminal, non-`blocked` stage." The implementation above expresses it as "every stage is either terminal or `blocked`," which is the same condition without the negation.

## Acceptance Criteria

- File exists at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/deriveGroupStatus.js`.
- Default export matches the signature above.
- Pure function — no Mongo, no I/O, no closures over module state.
- Empty array → `'done'`.
- Every action terminal → `'done'`.
- Every non-terminal action `blocked` → `'blocked'`.
- Mix of `blocked` + at least one terminal → `'blocked'` (because the non-terminals are all `blocked`).
- Any non-terminal, non-`blocked` action → `'in-progress'`.
- Colocated `deriveGroupStatus.test.js` is table-driven over the 8-value action-status enum (per [enums/action_statuses.yaml](../../../../modules/workflows/enums/action_statuses.yaml)):
  - `[]` → `'done'`.
  - `[done]` → `'done'`.
  - `[done, not-required]` → `'done'`.
  - `[blocked]` → `'blocked'`.
  - `[blocked, blocked]` → `'blocked'`.
  - `[blocked, done]` → `'blocked'` (the one non-terminal is `blocked`).
  - `[blocked, action-required]` → `'in-progress'`.
  - `[action-required]` → `'in-progress'`.
  - `[in-progress]` → `'in-progress'`.
  - `[in-review]` → `'in-progress'`.
  - `[changes-required]` → `'in-progress'`.
  - `[error]` → `'in-progress'` (error is non-terminal).
  - `[done, action-required]` → `'in-progress'`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/deriveGroupStatus.js` — create — pure 3-value enum derivation.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/deriveGroupStatus.test.js` — create — table-driven cases above.

## Notes

- The function takes pre-filtered actions (only those belonging to the group). Callers (`recomputeGroups`, `StartWorkflow` extension) own the filtering by `action.action_group`. Keeps this helper a single-responsibility pure function.
- Don't pass the group id or the workflow config — the function doesn't need either. The empty-group convention is encoded in the input being `[]`.
- The action-status enum lives at `modules/workflows/enums/action_statuses.yaml`. The 8 stages are: `not-required` (0), `error` (1), `changes-required` (2), `done` (3), `in-review` (4), `in-progress` (5), `action-required` (6), `blocked` (7). Only `done` and `not-required` are terminal.
