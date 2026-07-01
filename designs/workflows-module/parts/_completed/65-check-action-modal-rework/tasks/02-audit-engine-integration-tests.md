# Task 2: Audit the engine integration tests for check-user field-write assertions

## Context

Task 1 changed `planActionTransition.js` so a **user**-source update no longer writes the universal fields `assignees` / `due_date` (previously a `kind: check` user submit did). Two broader engine suites exercise the submit pipeline end-to-end and may carry assertions that encode the _old_ behavior:

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planSubmit.test.js` — the plan-phase orchestrator.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.test.js` — the handler end to end.

A prior grep found these suites reference `fields` only via `description: "seeded"` / `description: "spawned"` on **auxiliary / insert** paths (and `description` is no longer a universal field) — so it is likely there is nothing to change. This task confirms that, and runs the full suite green.

## Task

1. Search both files for any assertion that a **`check`** action's **user** submit persists `assignees` or `due_date` onto the action doc via the submit `fields` payload. Grep starting points:
   - `grep -n "assignees\|due_date\|fields\|check" planSubmit.test.js`
   - `grep -n "assignees\|due_date\|fields\|check" SubmitWorkflowAction.test.js`
2. For any such assertion on a **user**-source / current-action transition: update it to the new behavior — a user-path check submit does **not** write universal fields on transition.
3. For assertions that universal (or other) fields **are** written: confirm they exercise a **non-`user`** source (pre-hook auxiliary action, engine cascade, or the create/upsert/seed path). Those stay valid and must not be weakened. If an auxiliary/insert assertion is implicit about source, leave it as-is — do not add speculative coverage.
4. Run the full plugin test suite and confirm green.

## Acceptance Criteria

- No assertion in either file claims a `check` **user** submit writes `assignees` / `due_date` on transition.
- Auxiliary/cascade/insert field-write assertions remain intact and exercise a non-`user` source.
- `pnpm jest` (from repo root) passes for the whole plugin package.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planSubmit.test.js` — modify (only if an offending assertion exists) — align check-user field-write expectations.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.test.js` — modify (only if an offending assertion exists) — same.

## Notes

- This task may be a no-op confirmation. That is an acceptable outcome — the deliverable is a green full suite plus certainty that no test still encodes the old check-kind write behavior. Do not invent new tests here; the new-behavior unit coverage lives in Task 1.
