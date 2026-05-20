# Consistency Review 3

## Summary

Top-level sweep following the [part 6 review-1](../parts/06-submit-action-writes/review/review-1.md) action-review pass (which cascaded edits into engine spec, part 9, top-level design, implementation plan, and spawned part 23). Found 7 inconsistencies in the wake of that cascade — all auto-resolved against the latest decisions.

## Files Reviewed

**Top-level:**

- `designs/workflows-module/design.md`
- `designs/workflows-module/implementation-plan.md`
- `designs/workflows-module/review/{review-1, consistency-1, consistency-2}.md`

**Part designs (23):**

- `parts/01-call-api-primitive/design.md` through `parts/23-close-workflow-handler/design.md`

**Per-part reviews:**

- `parts/04-workflow-config-schema/review/{review-1, consistency-1}.md`
- `parts/05-start-cancel-handlers/review/{review-1, consistency-2, consistency-3}.md`
- `parts/06-submit-action-writes/review/review-1.md` (the cascade source)
- `parts/12-resolver-pages/review/{review-1, consistency-1}.md`
- `parts/21-entity-type-to-collection/review/{review-1, consistency-1}.md`

**Task files** — all 31 task files across parts 3, 4, 5, 12, 14, 21 (no edits needed — task files predate the cascade and are agnostic to the contract changes).

**Targeted grep across the tree** for: `per-call.*force`, `force.*per-call`, `payload-root.*force`, `composes OR`, `current_status, interaction`, `four operational`, `four Apis`, `auto-complete`, `lifecycle step 6`, `close-workflow`, `CloseWorkflow`.

## Decisions Extracted from [parts/06-submit-action-writes/review/review-1.md](../parts/06-submit-action-writes/review/review-1.md)

1. **Per-entry `force` is the only force surface** — no top-level `force` on the `SubmitWorkflowAction` payload. Engine-internal force-pushes call `updateAction(...force: true)` directly. (review-1 #1 → resolved → cascaded to part 6 design, engine/spec.md, part 9 design.)
2. **Idempotency falls out of the priority rule + `currentActionId` self-exception**, not a `(action_id, current_status, interaction)` payload triple. The self-exception writes a fresh audit entry; non-self entries are rejected by the priority rule. (review-1 #5 → resolved.)
3. **Terminal-workflow gate in step 1**: reject submits on `completed`/`cancelled` workflows unless `action.required_after_close`. (review-1 #7 → resolved → folded into part 6's Validate step.)
4. **New Part 23 — `CloseWorkflow` handler + `close-workflow` operational API.** Author-initiated `completed` push, sweep honoring `required_after_close: true` with blocked-action exception. Tracker fan-up uses `completed → done` mapping. (review-1 #7 → resolved → spawned [part 23](../parts/23-close-workflow-handler/design.md).)
5. **Auto-complete attribution: part 7, not part 6.** Part 7 owns the workflow-status push to `completed` when every action is terminal. Part 23 introduces a shared workflow-close write helper that part 7 and `CloseWorkflow` both consume. (Surfaced during consistency review 3 — see finding 4 below.)
6. **`form` and `form_review` merge into one flat `form_data.{action_type}` bag** before write. (review-1 #9 → resolved.)
7. **Priority lookup**: `connection.actionsEnum[stage].priority` is the source; throw on unknown stage. (review-1 #4 → resolved.)
8. **Dual validation paths**: throw before action lookup; force-push `error` transition after lookup. (review-1 #6 → resolved, open question 1 closed.)

## Inconsistencies Found

### 1. Part 22 matrix line for part 06 still claimed "per-call and per-entry `force`"

**Type:** Review-vs-Design (part 6 review-1 #1 → part 22 matrix)
**Source of truth:** [part 6 review-1 #1](../parts/06-submit-action-writes/review/review-1.md): per-entry is the only force surface.
**Files affected:** `parts/22-workflows-e2e-suite/design.md:60`
**Resolution:** Rewrote the row to assert per-entry `force: true` bypass only. Also folded in the form + form_review merge assertion (decision #6), the audit-entry self-exception behavior (decision #2), and the terminal-workflow gate (decision #3) so the matrix matches the design's full v1 contract.

### 2. Part 22 matrix missing a row for part 23 (close-workflow)

**Type:** Internal contradiction (part 22's contract sentence promised every shipping part has a row; part 23 had none)
**Source of truth:** [part 23 design § Verification](../parts/23-close-workflow-handler/design.md) and the contract sentence in [part 22](../parts/22-workflows-e2e-suite/design.md).
**Files affected:** `parts/22-workflows-e2e-suite/design.md` (matrix + contract sentence).
**Resolution:** Added a part-23 row to the matrix with the load-bearing assertions (`completed` push, sweep honors `required_after_close`, blocked exception, idempotent re-close, cancel rejection, tracker fan-up). Updated the contract sentence from "(5–20)" to "(5–20, 23)". Also added the `close-workflow` end-to-end assertion to part 19's row.

### 3. Auto-complete misattributed to part 6 in two places

**Type:** Internal contradiction (within part 6's own design; within part 23's design)
**Source of truth:** [part 7 design § Auto-complete check](../parts/07-group-state-machine/design.md) — part 7 explicitly owns the auto-complete check + workflow `completed` push. Part 6's lifecycle scaffold has no step that pushes workflow status.
**Files affected:**
- `parts/06-submit-action-writes/design.md:112` (Out-of-scope bullet for part 23) — said "Part 6's auto-complete (lifecycle step 6 — workflow status push to `completed`...)". But part 6's lifecycle step 6 is "Write `form_data`", and part 6 has no auto-complete at all.
- `parts/23-close-workflow-handler/design.md:38, 41, 72, 91` (Shared helper + Depends on + Contract to neighbours) — all said part 6 owns auto-complete and consumes the shared helper.
**Resolution:** Rewrote both to attribute auto-complete to part 7, with the shared `closeWorkflow.js` helper consumed by part 7's auto-complete and part 23's `CloseWorkflow` (not part 6 and part 23). Updated part 23's Depends-on from "light dependency on part 6" to "light dependency on part 7."

### 4. Top-level design.md said "four operational Apis"

**Type:** Review-vs-Design (part 23's commitment to add a fifth)
**Source of truth:** [part 23 design § Contract to neighbours](../parts/23-close-workflow-handler/design.md) commits part 19 and part 20 to declaring `close-workflow` as the fifth API.
**Files affected:** `design.md:20` (Layers table, Surface row).
**Resolution:** Updated to "four operational Apis + demo wiring (a fifth `close-workflow` Api joins from part 23)."

### 5. Part 19 design listed only four APIs

**Type:** Review-vs-Design (part 23 → part 19)
**Source of truth:** [part 23 design § In scope](../parts/23-close-workflow-handler/design.md) — "Add a fifth operational API to part 19 … Part 19's design and exports list need updating to include this fifth API."
**Files affected:** `parts/19-operational-apis/design.md` (Goal, In scope, Depends on, Verification, Contract to neighbours).
**Resolution:**
- Updated Goal sentence to mention `close-workflow` and link to part 23.
- Added an `api/close-workflow.yaml` sub-section (between cancel-workflow and get-entity-workflows) with payload/routine/return per part 23's contract.
- Added part 23 to the Depends-on list.
- Added the `close-workflow` unit-test bullet.
- Updated the Contract-to-neighbours bullet for part 20 ("all five Apis"), added a part 23 bullet.

### 6. Part 20 manifest exports listed only four APIs

**Type:** Review-vs-Design (part 23 → part 20)
**Source of truth:** [part 23 design § Contract to neighbours](../parts/23-close-workflow-handler/design.md) — "Part 20 adds `close-workflow` to the module manifest's exports."
**Files affected:** `parts/20-module-manifest/design.md:27` (api exports list).
**Resolution:** Added `close-workflow` to the static-API exports list with a parenthetical naming part 23 as the source.

### 7. Part 22 grandfathered-parts bullet — already consistent, surveyed only

**Type:** Already consistent (no change needed).
**Source of truth:** [top-level review-1 #3](review-1.md) — "Parts 3, 4, 5, 14 shipped before this convention; their existing posture stands."
**Files affected:** None — `parts/22-workflows-e2e-suite/design.md:83` already lists "Parts 3, 4, 5, 14" and links to the top-level Testing conventions subsection.
**Resolution:** Verified. Listed here for coverage.

## No Issues

Areas checked where everything was consistent:

- **`force: true` propagation** in parts 5, 8, 9, 10 and the engine spec — all references now reflect per-entry only. Part 5's `force: true` callers (parent-link push, cancel sweep) are engine-internal `updateAction` calls, which is the documented exit hatch.
- **Idempotency triple** — the old `(action_id, current_status, interaction)` text only survives inside [part 6 review-1 #5's preserved finding body](../parts/06-submit-action-writes/review/review-1.md), which is the original text shown above the Resolved annotation per the action-review skill's convention. No design or task file carries the stale triple.
- **`required_after_close` propagation** — part 6's terminal-workflow gate is documented in step 1; part 23's sweep filter is documented in the action-sweep bullet; part 5's cancel sweep correctly defers the filter as a part 23 open question.
- **Testing conventions** — already verified clean by [consistency-2](consistency-2.md); no new drift in this pass.
- **`entity_type` → `entity_collection`** — already verified clean by [consistency-1](consistency-1.md); part 23 design uses `entity_collection` only.
- **Part 22 e2e line** in every shipping part 5–20 + part 23 — all present.
- **Top-level design.md** parts table, dependency graph, hard gates, follow-on parts narrative — all include part 23 consistently.
- **Implementation-plan.md** — `close-workflow-handler` row present in Follow-ons table; repo footprint includes part 23 in both `plugins/` and `modules/workflows/`.
- **Engine spec `SubmitWorkflowAction` payload + Priority rule** — already updated during the part 6 action-review pass; verified the lifecycle "Ordering inside one SubmitWorkflowAction invocation" bullet (line 312) now says "per-entry force bypasses" without the "per-call or" qualifier.
- **Part 9 design** — `force: true` propagation section and the dropped Out-of-scope bullet about payload-root force both reflect the per-entry-only contract.

## Files Modified

1. `designs/workflows-module/design.md` — Layers table updated for fifth API.
2. `designs/workflows-module/parts/06-submit-action-writes/design.md` — auto-complete attribution fix.
3. `designs/workflows-module/parts/19-operational-apis/design.md` — added `close-workflow.yaml` sub-section, updated Goal/Depends-on/Verification/Contract-to-neighbours.
4. `designs/workflows-module/parts/20-module-manifest/design.md` — added `close-workflow` to api exports.
5. `designs/workflows-module/parts/22-workflows-e2e-suite/design.md` — part 06 matrix row rewritten, part 23 matrix row added, part 19 row extended, contract sentence widened.
6. `designs/workflows-module/parts/23-close-workflow-handler/design.md` — auto-complete attribution corrected throughout (Shared helper section, Depends-on, Contract-to-neighbours).
