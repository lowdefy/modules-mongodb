# Consistency Review 5

## Summary

First consistency pass to include the **task files** (`tasks/01`–`20` + `tasks.md`),
the new **review-4**, and the cross-referenced concept authority
`workflows-module-concept/state-machine/design.md`. (consistency-4 predated the
tasks — it checked only design ↔ reviews 1–3.) One inconsistency found and
auto-resolved: `state-machine.md`'s `submit → in-review/done` split still carried the
per-app phrasing that review-3 #2 corrected to action-global in Part 38 / Part 34.
All other review decisions — including all of review-4's behaviour-preservation
findings — are correctly propagated across the design and the task files.

## Files Reviewed

- **Design:** `design.md`
- **Concept authority (cross-referenced):** `../../../workflows-module-concept/state-machine/design.md`
- **Reviews:** `review/review-1.md`, `review/review-2.md`, `review/review-3.md`, `review/review-4.md`, `review/consistency-4.md`
- **Tasks:** `tasks/tasks.md`, `tasks/01`–`tasks/20`
- **Plans:** none present.

## Inconsistencies Found

### 1. `state-machine.md` keeps per-app phrasing for the `submit` review split; Part 38 / Part 34 made it action-global

**Type:** Review-vs-Design drift (concept authority not updated by review-3 #2)
**Source of truth:** review-3 #2 resolution → "the `submit` → in-review/done split
is decided by whether **any** app's `access` declares the `review` verb — an
action-global property, not the submitting app's view." Landed in Part 34 D6 and
Part 38 D4 (`hasReview`, app-agnostic `resolveSignal`).
**Files affected:** `workflows-module-concept/state-machine/design.md` line 98.
**Resolution:** Auto-resolved. The signal-inventory `submit` cell read "Lands
`in-review` if the action declares the `review` verb in its `access.{app_name}`
map" — the per-app reading review-3 #2 flagged as wrong (a `team-app` submit would
land `in-review` while a `support-app` submit on the *same* action lands `done`).
review-3 #2's resolution updated Part 34 D6 and Part 38 D4 but did not propagate back
to the concept doc. Rewrote the cell to "Lands `in-review` if **any** app's `access`
block declares the `review` verb … an **action-global** property — one action doc is
shared across every app, so the split is the action's, not the submitting app's,"
matching Part 38 D4's `hasReview` definition, worked example (line 663), and
integration test (line 765).

## No Issues

Re-verified, with no residual drift:

### Design ↔ reviews 1–4

- **review-4 #1 (upsert spawn / `none` row):** the `none` creation row is in
  state-machine.md, Part 38 D4/D13, and task 02; the upsert→insert trigger is in task
  10; `PreHookResult.upsert?` is in task 09; `mergePreHookActions.js` /
  `utils/shouldCreate.js` have a deletion disposition (folded into
  `planActionTransition`, task 15). Missing target without `upsert` throws (D13 (2)),
  with `upsert` resolves via `none`.
- **review-4 #2 (auto-unblock group-id resolution + interleaved recompute):** Part 38
  D4 and task 10 restore action-type **and** group-id `blocked_by` resolution and the
  interleaved recompute⇄unblock fixpoint; task 11 exposes the group recompute to the
  fixpoint; the group-gated-unblock test is in task 10's AC.
- **review-4 #3 (`required_after_close` carve-out):** restored in D2, the data-flow
  stage check, and task 09 (task + AC), with the allowed post-close test.
- **review-4 #4 (`mongodb` peer dep):** `mongodb: "^6"` in `peerDependencies` is in
  task 01 (task/AC/Files), the design's `mongo/` Files-changed, and the D8
  single-driver-version note.
- **review-4 #5 (change-log request-context fields):** D7 and task 12 carry the
  `lowdefyContext` provenance + exact-parity note.
- **reviews 1–3:** all decisions confirmed still propagated (CAS workflow-first +
  `updated.timestamp` scalar; no `submit_edit`/`save_draft`/`target_status`/current-
  action-redirect; `simple` kind naming + Part 35 sequencing; events via
  `callApi('new-event')` only; per-fire tracker depth; unblock-only cascade; Q6
  form_data merge open; lifecycle event context branch; schema.js description
  rewrites; FSM `simple` alias; unprefixed derived ids + `workflow-` on fixed pages;
  action-global `hasReview`; access-drives-reachability V1 limitation; shared
  role-gate oracle; notification_roles → Part 41; no action-doc backfill).

### Design ↔ tasks (new this pass)

- **Phase model:** tasks 09–17 implement load → pre-hook → plan → commit →
  post-hook + tracker loop exactly as D2/D3/D9/D10; planner file names, the `Plan`
  shape, and the commit ordering match.
- **FSM (task 02):** `simple` aliased to `form`, `none` row in form/simple only,
  `hasReview` app-global, `unblock` no-op guard — all match state-machine.md and D4.
- **Mongo layer (task 01) / commit (task 13):** workflow-first CAS claim,
  transaction-vs-standalone paths, `ConcurrentSubmitError`, events outside txn on the
  community client — all match D8/D9/D11/D15.
- **Access cluster (tasks 05–08, 18, 19):** shared `gates.fixtures.js` oracle;
  `validateActionAccess` + `validateStatusMapCells`; unprefixed derived ids + reserved
  `workflow` type; `visible_verbs_filter.yaml` replacing `access_filter.yaml` in the
  three get-\* APIs; `action_role_check` per-verb bag; fixed-page `workflow-*` renames;
  payload mapping dropping `force` — all match D16 / Part 34 and the design's
  Files-changed.
- **Demo migration (task 20):** signals, per-verb access maps, stripped
  `force`/`link:`, new lifecycle event subscriptions, no action-doc backfill — matches
  Proposed change #13 and the Non-goals.
- **tasks.md dependency graph and band ordering** are internally consistent with the
  per-task `Depends On` and the design's D16 tasking-note split.

### state-machine.md ↔ Part 38 (other than finding 1)

- FSM tables (form/simple/tracker), the `none` creation row, tracker mirror signals,
  `internal_cancel_action`, terminal-state handling, and the signal renames all align
  with Part 38 D4/D13 and tasks 02/16/17. The line-366 "items 1–4 carried out" note is
  accurate; the only genuinely-open concept item (simple `error`-recovery page) is a
  ui follow-on, out of Part 38's scope and not contradicted by it.
</content>
</invoke>
