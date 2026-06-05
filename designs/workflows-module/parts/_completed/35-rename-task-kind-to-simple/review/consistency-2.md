# Consistency Review 2

## Summary

Checked Part 35 (`rename-task-kind-to-simple`) for internal drift and cross-design consistency against the two designs the reviewer named — [Part 38 (engine-rebuild)](../../38-engine-rebuild/design.md) and [state-machine](../../../../../workflows-module-concept/state-machine/design.md). Part 35 is internally consistent (review-1 fully resolved and propagated). One substantive cross-design inconsistency was found — Part 35's largest rename target (Part 30) is marked for rejection by Part 38 — and resolved by user decision (drop Part 30 from scope). Five files were edited.

## Files Reviewed

- **Design:** `35-rename-task-kind-to-simple/design.md`
- **Reviews:** `review/review-1.md` (all 7 findings carry resolution annotations: 5 Resolved, 2 Rejected)
- **Tasks:** `tasks/tasks.md`, `tasks/01-rename-kind-in-shipped-code.md`, `tasks/02-rename-shared-pages-and-manifest.md`, `tasks/03-update-demo-workflow-config.md`, `tasks/04-update-active-follow-on-parts.md`
- **Compared against:** `38-engine-rebuild/design.md` (+ its `review/review-1.md`, `review-2.md`), `workflows-module-concept/state-machine/design.md`
- **Filesystem cross-checks:** `parts/` tree (Part 30 still active at `30-status-map-rendering/`, no `_rejected/` dir yet); grep of `kind: task` / `task-*` surface across all active parts.

## Inconsistencies Found

### 1. Part 35's largest rename target (Part 30) is slated for rejection by Part 38

**Type:** Cross-design (Design-vs-Design)
**Source of truth:** Part 38 — the most recent design (currently uncommitted; latest review across the whole tree is its `review-2`). It explicitly declares: *"Supersedes Part 30 — Engine-managed display. Part 30 is moved to `_rejected/`"* and sequences itself **after** Part 35.
**Files affected:** `design.md` (item 3, item 6, "Why a dedicated part" counts, the follow-on table's two Part 30 rows, Open question 2, Related), `tasks/04-update-active-follow-on-parts.md` (scope table, sweep, acceptance, file list, title/context), `tasks/tasks.md` (Task 4 summary + ordering rationale).

Part 35 predates Part 38 and treated Part 30 as a living design to keep consistent — Part 30 was the single largest cluster of its rename surface (16+ design sites + 6 `tasks/*.md` files, called out in item 6, the follow-on table, Open question 2, and most of Task 4). Once Part 38 lands, Part 30 becomes frozen `_rejected/` history, so renaming `kind: task` across it is wasted churn — the same reason Part 35 already excludes `_completed/` parts. (A half-applied linter edit had already rewritten Part 30's design-link to `../_rejected/...` while leaving the `tasks/` link un-rewritten — a broken, inconsistent half-state that confirmed the direction of travel.)

**Resolution:** Asked user — chose **"Drop Part 30 from scope."** Applied:
- `design.md` item 6 now lists parts **22, 24, 28, 33, 34** (Part 30 removed) with a parenthetical pointing to the exclusion; item 3 drops the Part 30 `computeEngineLinks` link-defaults clause (it referenced unimplemented Part 30 code); "Why a dedicated part" counts corrected (6→**5** active-part design.md files; dropped "~3 active-part `tasks/` directories"; parts list `(24, 28, 33, 34)`).
- Removed both Part 30 rows from the "active follow-on parts" table.
- Removed the now-moot **Open question 2** (Part 30 sequencing).
- Added an **Out-of-scope** bullet explaining the exclusion via Part 38's supersession.
- Replaced the stale "Status-map link-defaults … `_rejected/30-…`" **Related** link with a Part 38 supersession reference.
- Task 4 retitled (Designs only), scope table trimmed to 22/24/28/33/34 with an exclusion callout, the "Prose mentions (Part 30 specific)" section and the `track-step-*.yaml` leave-alone note removed, sweep command parts list narrowed to `{22,24,28,33,34}`, acceptance criteria and Files list pruned of all Part 30 entries, scope-rules updated to note `_rejected/` is frozen.
- `tasks.md` Task 4 summary and ordering rationale updated to exclude Part 30.

## No Issues (checked, consistent)

- **Review-1 propagation (internal).** All 5 Resolved findings are reflected in the current `design.md`: `resolveTargetStatus.js` naming (item, table, Part 28 note, Open question 1), the deleted "Files changed — concept docs" section + dropped item 7, the tightened 19/17 test-site counts, the manifest `_build.array.concat` line-range note (128–134), and the Part 30 tasks `04`/`10` prose note (now moot and removed with Part 30). The 2 Rejected findings (dev-server restart note; `isTask` README coverage) correctly produced no change. Tasks 1–3 match the design.
- **Part 38 deletions vs Part 35 test/file flips.** Part 35 Task 1 flips `kind:"task"` in `resolveTargetStatus.js` (+test), `reevaluateBlockedActions.test.js`, `handleSubmit.test.js`, etc. Part 38 deletes/rewrites all of these — but Part 38 explicitly sequences after Part 35 and reconciles it (*"Renamed task→simple by Part 35; this part sequences after Part 35 and deletes the file outright"*). No contradiction; ordering is handled by Part 38.
- **state-machine.** Part 35 is a pure vocabulary swap; state-machine already uses `simple` throughout (its FSM "Simple kind" table) and is the upstream decision source via tasks-module-plan. Part 35's "Why simple" rationale cites tasks-module-plan, the correct source. No drift.
- **Follow-on list completeness.** Newer active parts (31, 36, 37, 38, 39, 40) carry **zero** `kind: task` / `task-*` surface (verified by grep) — they were authored post-rename using `simple`. Part 35's follow-on list is not missing any newer part.
- **Frozen `review-1.md`** left untouched (including its pre-existing `_rejected/` links, which are historical record).

## Next Step

`designs/workflows-module/parts/35-rename-task-kind-to-simple/tasks/` exists and was updated in place. Next: run `/r:design-start 35-rename-task-kind-to-simple all` to create GitHub issues from the updated tasks.
