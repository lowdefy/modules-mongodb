# Task 13 — Unit-test backfill: per-candidate disposition

One line per candidate (`covered by …` or `added …`). Verified against the actual
test files, not the audit lead. Owning layer noted in parentheses.

1. **Keyed terminality as an isolated phase rule** (planner) — covered by `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planAutoUnblock.test.js`::`keyed-type rule: a type is terminal only when every keyed instance is`. Directly pins the `terminalByType` reduction (partial keyed → no unblock; all keyed terminal → unblock); regressing the rule fails this assertion.

2. **User-signal re-fire no-op safety** (handler) — added `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.test.js`::`re-firing approve on an already-done action rejects and leaves the action doc unmutated`. The plan-layer throw was already covered (`planActionTransition.test.js`::`user null FSM resolution throws signal_not_allowed`, `planSubmit.test.js`::`user-driven signal with no FSM entry throws signal_not_allowed`), but the end-to-end "no mutation" guarantee (plan phase throws before `commitPlan`, so the DB is untouched) was not asserted. New handler test pins it: reject with `signal_not_allowed` AND `status` still length 1 / doc unchanged.

3. **Terminal-workflow submit gates** (load phase) — covered by `plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.test.js`::`%s workflow rejects submit with stage_rejects_submit` (the `test.each(['completed','cancelled'])` case). Both terminal stages are asserted; the `required_after_close` escape hatch is covered by the adjacent `completed workflow allows submit on a required_after_close action`. (The engine has no separate `closed` stage — `completed`/`cancelled` are the two terminals.)

4. **Multi-group completion in one submit** (planner / composition) — added `plugins/modules-mongodb-plugins/src/connections/shared/phases/planSubmit.test.js`::`completed_groups: one submit completing the last open action of two groups emits both, each with its on_complete`. Existing coverage only flipped a single group (`planSubmit.test.js`::`completed_groups: a group whose status flips to done emits with joined on_complete`); the plurality of the `completedGroups` diff loop was not pinned. New test: target submit completes g1's last open action, a pre-hook auxiliary submit completes g2's, both flip in-progress → done, and both appear in `completedGroups` with their distinct `on_complete`.

## Jest run

`plugins/modules-mongodb-plugins` suite green: 47 suites / 703 tests passing
(`npx jest --roots plugins/modules-mongodb-plugins`, run with the sandbox
disabled because `mongodb-memory-server` must spawn `mongod` and bind a port).
No bugs surfaced; no engine code changed.
