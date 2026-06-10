# Task 13: Unit-test backfill (jest, not Playwright)

## Context

The design's audit of `plugins/modules-mongodb-plugins/` (37 jest files covering the workflows engine) flagged a short list of engine behaviours that may lack isolated unit coverage. Per Principle 4 and the top-level Testing-conventions rule ("a bug that could exist in the plugin JS without the runtime needs a *unit* test"), these are **plugin unit backfill**, explicitly not e2e scope. The design's caveat is binding: *the audit list is a lead, not gospel — verify each against the existing test files first.*

Candidates (from the design's "Explicitly NOT in this suite" section):

1. **Keyed terminality as an isolated phase rule** — likely home: `planAutoUnblock.test.js` (it already covers blocked_by fixpoint "incl. keyed terminality" per the audit — confirm whether that coverage isolates the phase rule or only exercises it incidentally).
2. **User-signal re-fire no-op safety** — re-firing a user signal that the FSM maps to no transition must not mutate state. Likely homes: `resolveSignal.test.js`, `SubmitWorkflowAction.test.js`.
3. **Terminal-workflow submit gates** — submits against actions of a cancelled/closed/completed workflow are rejected at the gate. Likely home: `SubmitWorkflowAction.test.js` (it covers per-verb gates; check for workflow-terminality gates specifically).
4. **Multi-group completion in one submit** — one submit completing the last open action of two groups at once; both groups recompute. Likely homes: `recomputeGroups` / `deriveGroupStatus` tests, `SubmitWorkflowAction.test.js` (covers completed-groups — check plurality).

Test posture (top-level design § Testing conventions): jest, colocated `*.test.js`; pure-function tests table-driven without Mongo; handler tests against `mongodb-memory-server`.

## Task

For each of the four candidates:

1. **Verify**: read the named existing test files under `plugins/modules-mongodb-plugins/src/connections/` (and `modules/workflows/resolvers/` where relevant) and determine whether the behaviour is already asserted *as such* — an assertion that would fail if the specific behaviour regressed, not merely a path that happens to traverse it.
2. **If covered**: record it — file + test name — in a short closure note (see below). No new test.
3. **If not covered**: add the jest test at the owning layer, matching the file's existing style (table-driven where the input space is enumerable, `mongodb-memory-server` for handler-level cases). Smallest test that pins the behaviour; no speculative fixtures.

Write the closure note as `designs/workflows-module/parts/22-workflows-e2e-suite/tasks/13-backfill-notes.md`: one line per candidate — `covered by {file}::{test}` or `added {file}::{test}` — so the design's open lead is closed with evidence either way.

Additionally: if any cluster task (3–10) flagged a Principle-4 gap in its PR ("awkward to reach through Playwright — belongs in jest"), fold it into this task's list with the same verify-then-backfill treatment.

## Acceptance Criteria

- All four candidates resolved with evidence: existing test cited or new test added.
- `pnpm --filter @lowdefy/modules-mongodb-plugins test` (or the repo's jest invocation) green.
- New tests live at the owning layer (planner/FSM/handler), not as e2e specs; no Playwright files touched.
- `13-backfill-notes.md` written with the per-candidate disposition.

## Files

- `plugins/modules-mongodb-plugins/src/connections/**/*.test.js` — modify/extend only where a gap is confirmed (likely candidates: `planAutoUnblock.test.js`, `resolveSignal.test.js`, `SubmitWorkflowAction.test.js`, group-recompute tests)
- `designs/workflows-module/parts/22-workflows-e2e-suite/tasks/13-backfill-notes.md` — create

## Notes

- Independent of all other tasks; can run first or in parallel.
- Resist scope growth: the audit named four behaviours. Other "while I'm here" gaps belong in their own issue unless a cluster task explicitly handed one over.
