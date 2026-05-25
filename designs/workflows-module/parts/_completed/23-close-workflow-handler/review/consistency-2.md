# Consistency Review 2

## Summary

Second part-scoped consistency sweep of Part 23, run after the [`r:design-task` pass](../tasks/tasks.md) produced 7 task files. Surveyed Part 23's `design.md`, both review files, and all 8 task files against the decision register from [review-1](designs/workflows-module/parts/_completed/23-close-workflow-handler/review/review-1.md) and the post-review reality that Part 10 has shipped. Found 9 inconsistencies — all auto-resolved.

## Files Reviewed

**Design:**

- `parts/23-close-workflow-handler/design.md`

**Reviews:**

- `parts/23-close-workflow-handler/review/review-1.md`
- `parts/23-close-workflow-handler/review/consistency-1.md`

**Tasks (newly created):**

- `parts/23-close-workflow-handler/tasks/tasks.md`
- `parts/23-close-workflow-handler/tasks/01-scaffold-handler.md`
- `parts/23-close-workflow-handler/tasks/02-validate-payload-and-stage.md`
- `parts/23-close-workflow-handler/tasks/03-push-completed-and-defend-references.md`
- `parts/23-close-workflow-handler/tasks/04-conditional-action-sweep.md`
- `parts/23-close-workflow-handler/tasks/05-recompute-summary-and-groups.md`
- `parts/23-close-workflow-handler/tasks/06-tracker-subscription-and-return.md`
- `parts/23-close-workflow-handler/tasks/07-close-workflow-yaml.md`

**Shipped engine code (cross-verified against):**

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js` — confirmed `fireTrackerSubscription` is now called inline (Part 10 has shipped); return shape is `tracker_fired: <array>`, not `null`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js` — confirmed Part 10 helper exists.
- `plugins/modules-mongodb-plugins/src/connections/shared/pushWorkflowStatus.js` — confirmed signature can't carry `reason` or `$set` of references.

## Decision Register

Carried forward from [review-1](designs/workflows-module/parts/_completed/23-close-workflow-handler/review/review-1.md):

- **D1** — No new `shared/closeWorkflow.js`. Reuse shipped helpers inline; mirror `CancelWorkflow.js`'s two-write shape.
- **D2** — Groups with `required_after_close: true` survivors land at `in-progress`/`blocked`, not `done`.
- **D3** — `CloseWorkflow.js` calls `fireTrackerSubscription` directly.
- **D4** — Close event/notifications deferred to a follow-on.
- **D5** — Sweep is bulk two-step + `MongoDBUpdateMany`, NOT `updateAction(force: true)`.
- **D6** — `references` uses `RESERVED_WORKFLOW_KEYS` defensive delete.
- **D7** — `required_after_close` applies to `completed` only.
- **D8** — Stale paths to `_completed/` accepted; separate sweep.

**New context** discovered during this consistency review (not a review-1 decision, but post-review reality): **Part 10 has shipped.** `fireTrackerSubscription.js` exists at the expected path and shipped `CancelWorkflow.js` already invokes it. Several spots in design.md still carried "until part 10 lands" / "when part 10 lands" / "part 10 will ship" forward-looking language. Those are stale per skill section 3f.

## Inconsistencies Found

### 1. Design.md carried stale "until part 10 lands" notes

**Type:** Stale Status / Blocker Notes (skill section 3f)
**Source of truth:** Shipped reality — `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/fireTrackerSubscription.js` exists; `CancelWorkflow.js:130–134` already invokes it; the helper's return-shape population is live.
**Files affected:** `parts/23-close-workflow-handler/design.md` — three locations:

- Line 35 (Tracker fan-up bullet): "Until part 10 lands, the call site is a TODO at the same line where `CancelWorkflow.js` carries its `tracker_fired: null` literal." But `CancelWorkflow.js` no longer carries that literal.
- Line 70 (Out-of-scope bullet): "`fireTrackerSubscription` implementation → part 10. … part 10 ships the helper itself, the recursion shape, and the `tracker_fired` return-shape population."
- Line 89 (Verification bullet): "Tracker fan-up: when part 10 lands, closing a child workflow fires the parent tracker action's `done` push."

**Resolution:** Rewrote all three to past tense, noting Part 10 has shipped. Tracker fan-up bullet now describes the call site as live, with `CancelWorkflow.js:130–134` as the shipped reference. Out-of-scope bullet became "owned by shipped Part 10; this handler reuses the helper as-is". Verification bullet describes the behaviour without conditionals.

### 2. Design.md return-shape literal was stale

**Type:** Stale Reference (cascades from #1)
**Source of truth:** Shipped `CancelWorkflow.js:135` returns `{ action_ids, event_id, tracker_fired }` where `tracker_fired` is the array, not `null`.
**Files affected:** `parts/23-close-workflow-handler/design.md:36` — "Returns: `{ action_ids, event_id: null, tracker_fired: null }` (side effects land in parts 8, 10)."
**Resolution:** Updated to "Returns: `{ action_ids, event_id: null, tracker_fired }` — `tracker_fired` is the array returned by `fireTrackerSubscription` (empty when no parent was written, one entry per fan-up level otherwise). The no-op path on already-`completed` returns `{ action_ids: [], event_id: null, tracker_fired: [] }`." Also dropped the misleading "side effects land in parts 8, 10" parenthetical — Part 10 is shipped, not future.

### 3. Design.md Write sequence note contradicted Tracker fan-up commitment

**Type:** Internal Contradiction
**Source of truth:** design.md:35 commits the handler to calling `fireTrackerSubscription` directly.
**Files affected:** `parts/23-close-workflow-handler/design.md:53` — "Event/notifications/tracker side-effects are out of scope here (see Out of scope below)."
**Resolution:** Tightened to "Event/notifications side-effects are out of scope (see Out of scope below); tracker fan-up is in scope and committed in step 4."

### 4. Design.md Helpers-used list named `pushWorkflowStatus` as used

**Type:** Internal Contradiction (within design.md)
**Source of truth:** Task 3's resolved decision (option (b), inline write) and shipped `CancelWorkflow.js:55–69` which doesn't use `pushWorkflowStatus` either.
**Files affected:** `parts/23-close-workflow-handler/design.md:44` — "Used for the `completed` push."

The helper's docstring names this part as a future caller, but the helper's signature can't carry `reason` on the entry or a `$set` of defended `references` — both of which the close-write needs.

**Resolution:** Rewrote the Helpers-used list:
- Kept `recomputeGroups.js` (genuinely reused).
- Added `fireTrackerSubscription.js` (added per #1's cascade).
- Replaced the `pushWorkflowStatus.js` entry with a note explaining why the helper is NOT invoked here despite its docstring forward-reference, pointing readers at the inline `MongoDBUpdateOne` in Write sequence step 1.

### 5. Design.md Write sequence had only 3 steps, missing tracker fan-up

**Type:** Internal Contradiction
**Source of truth:** design.md:35 commits the handler to a 4-step sequence (status push → sweep → recompute → tracker); Task 6 implements step 4. The original 3-step write sequence pre-dated D3 (which committed the in-handler `fireTrackerSubscription` call).
**Files affected:** `parts/23-close-workflow-handler/design.md:47–51` — Write sequence numbered 1–3.
**Resolution:** Added step 4: "Call `fireTrackerSubscription` (see Tracker fan-up bullet above) to mirror the workflow `completed` push onto a parent tracker action, if any. Returns `[]` when no `parent_action_id` is set — safe to call unconditionally."

Also fixed step 1 to drop the stale "via `pushWorkflowStatus`" wording and describe the inline write directly, in line with #4.

### 6. Task 2's no-op return literal was `null`, not `[]`

**Type:** Design-vs-Task (cascade from #2; Task 2 propagated design.md:36's stale literal)
**Source of truth:** Task 6's documented patch — uniformly `tracker_fired: <array>` across all return paths.
**Files affected:** `parts/23-close-workflow-handler/tasks/02-validate-payload-and-stage.md` — three locations:

- Line 16 (outcomes table): `tracker_fired: null` in the `completed` no-op row.
- Line 46 (code snippet): `return { action_ids: [], event_id: null, tracker_fired: null };`.
- Line 70 (acceptance criterion): asserts `tracker_fired: null`.

**Resolution:** Updated all three to `tracker_fired: []`. Now Task 2 ships with the final return shape from the start; Task 6 no longer needs to retrofit.

Also updated Task 6's "Update the Task 2 no-op return to match" subsection to a verification note ("should already return `[]` — if it doesn't, fix it here") rather than a mandatory patch. Removed the redundant "the design's return-shape line is stale" callout since the design has been corrected.

### 7. `tasks.md` summary table said Task 3 uses `pushWorkflowStatus.js`

**Type:** Design-vs-Task (cascade from #4; `tasks.md` propagated design.md's pre-#4 wording)
**Source of truth:** Task 3's documented decision (Option (b), inline write).
**Files affected:** `parts/23-close-workflow-handler/tasks/tasks.md:13` — task summary table row 3.
**Resolution:** Updated to "push `completed` via an inline `MongoDBUpdateOne` (mirrors `CancelWorkflow.js:55–69`)".

### 8. `tasks.md` ordering rationale said Task 3 uses `pushWorkflowStatus.js`

**Type:** Design-vs-Task (cascade from #4)
**Source of truth:** Task 3's documented decision.
**Files affected:** `parts/23-close-workflow-handler/tasks/tasks.md:25`.
**Resolution:** Updated to describe the inline write + explain why the helper isn't a fit.

### 9. Design.md "Contract to neighbours" claimed `pushWorkflowStatus.js` reuse

**Type:** Internal Contradiction
**Source of truth:** #4 resolution.
**Files affected:** `parts/23-close-workflow-handler/design.md:105` — "This part reuses `recomputeGroups.js` and `pushWorkflowStatus.js` as-is."
**Resolution:** Updated to "reuses `recomputeGroups.js` as-is; … The shipped `shared/pushWorkflowStatus.js` is NOT used (its signature can't carry `reason` or defended `references`; the handler inlines the workflow-status push instead — see Write sequence step 1)." Also updated Part 10 bullet to past tense ("Part 10 (shipped)") and described the call-site posture.

## Bonus cleanup

While in the file, also tightened **"Depends on"** at design.md:79–84 to list both Part 7 and Part 10 as light dependencies (helper reuse only, no contract change). Previously listed only Part 7; Part 10's helper is now reused too.

## No Issues

Areas checked where everything was consistent:

- **D2 (group-recompute asymmetry)** — design.md:34, design.md:85 (Verification), Task 5's tests all consistent.
- **D5 (bulk sweep, not `force: true`)** — design.md:28–31 sweep description, Task 4's full implementation + Notes (which explicitly cites engine spec § Priority rule).
- **D6 (`RESERVED_WORKFLOW_KEYS` defensive delete)** — design.md:22, Task 3's implementation + tests.
- **D7 (`required_after_close` close-only)** — design.md:98 Resolved Question; no drift in tasks.
- **Task 1** — scaffold-only; no cross-task drift.
- **Task 4** — sweep mechanism description, blocked-exception, `requiredAfterCloseByType` lookup all match design.md.
- **Task 5** — recompute description, asymmetry assertions all match design.md.
- **Task 7** — `close-workflow.yaml` routine; payload + return shapes match Part 19's spec at [19-operational-apis/design.md:29–37](../../19-operational-apis/design.md).

## Files Modified

- `parts/23-close-workflow-handler/design.md` — five edits: Tracker fan-up bullet (#1), Returns bullet (#2), Write sequence introduction note (#3), Write sequence step 1 + new step 4 (#5), Helpers-used list (#4), Out-of-scope tracker bullet (#1), Verification tracker bullet (#1), Depends-on list (bonus cleanup), Contract-to-neighbours Part 7 + Part 10 (#9).
- `parts/23-close-workflow-handler/tasks/tasks.md` — two edits: summary-table Task 3 row (#7), ordering rationale Task 3 paragraph (#8), Verified-against tooltip note for `pushWorkflowStatus.js`.
- `parts/23-close-workflow-handler/tasks/02-validate-payload-and-stage.md` — three edits: outcomes table no-op row (#6), code snippet (#6), acceptance criterion (#6).
- `parts/23-close-workflow-handler/tasks/03-push-completed-and-defend-references.md` — two edits: Context section trimmed (no longer presents the helper-vs-inline decision as a tradeoff because design.md now agrees), Notes bullet for "don't import" (#4 cascade).
- `parts/23-close-workflow-handler/tasks/06-tracker-subscription-and-return.md` — three edits: Context paragraph dropped the "design line is stale" callout (#1 cascade), step 4 of Task instructions softened from "Update Task 2" to "Verify Task 2" (#6 cascade), Files-section bullet softened (#6 cascade), Notes-list dropped the stale "design's Returns line" callout.

## Open follow-ons

None new. Carried forward from [consistency-1](designs/workflows-module/parts/_completed/23-close-workflow-handler/review/consistency-1.md): the Part 6 terminal-workflow gate follow-on (cancel-side `required_after_close` no longer applies; shipped Part 6 code + design + tasks need tightening).
