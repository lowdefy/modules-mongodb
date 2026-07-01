# Consistency Review 4

## Summary

First consistency pass to cover **review-5** and the new `open-questions.md`
(both landed after `consistency-3`, which covered reviews 1–4 + tasks). Walked
reviews 1–5 + `todo-discuss` as the decision register against `design.md`, the 12
task files, and `tasks.md`. `design.md` is fully consistent with all five reviews
— review-5's four resolutions (the `workflow_closed` envelope field, dropping the
unprovisioned action `title` in favour of `message`, the demo-lead-view timeline
migration, and the array→object shape callout) are all propagated. The **tasks**
carried two stale fragments and one stale scope note — **3 inconsistencies, all
auto-resolved**.

## Files Reviewed

- **Design:** `design.md`
- **Supporting:** `open-questions.md`, `review/todo-discuss.md`
- **Reviews:** `review/review-1.md`–`review/review-5.md`
- **Prior consistency reports (context only, out of chronology):** `consistency-1.md`, `consistency-2.md`, `consistency-3.md`
- **Tasks:** `tasks/tasks.md` + `tasks/01`–`12`
- **Plans:** none

## Inconsistencies Found

### 1. Task 1 omits four of the five handler-test `buildContext` fixture updates

**Type:** Design-vs-Task (stale — predates review-3 #3's propagation into the design)
**Source of truth:** `design.md` Ripple "Shipped submit gate" (line 195); review-3 #3
**Files affected:** `tasks/01-connection-user-entities-plumbing.md`
**Resolution:** Auto-resolved. The design mandates that **every** handler test's
`buildContext` helper nest `user` under `connection` once `createEngineContext`
reads `connection.user` — naming `StartWorkflow`, `CancelWorkflow`, `CloseWorkflow`,
`SubmitWorkflowAction`, and `SubmitWorkflowAction/dispatchNotifications`. Verified
against source: `StartWorkflow.test.js:161`, `CancelWorkflow.test.js:126`, and
`CloseWorkflow.test.js:135` each return `user` as a **top-level sibling** of
`connection`, so they break under the change exactly as the design predicts. Task 1
listed only `SubmitWorkflowAction.test.js` ("modify (if needed)"). Rewrote the
acceptance criterion to require the nesting fix across all five handler tests (with
the line citations and the failing role-test cases) and added the four missing test
files to the Files list.

### 2. Task 6 carried the rejected "no consumers to migrate" framing

**Type:** Stale Reference (review-5 #3 reversed this exact claim)
**Source of truth:** `design.md` D6 (line 76); review-5 #3
**Files affected:** `tasks/06-get-events-timeline-method.md`
**Resolution:** Auto-resolved. Task 6's closing note said removing the inline
events-timeline lookup is "a behavior change, but **workflows has not shipped — no
consumers to migrate.**" review-5 #3 proved this false for the demo lead-view (the
onboarding workflow targets `leads-collection`/`lead_ids`, so started workflows put
action cards on its timeline) and the design's D6 now splits the four shipped
consumers two ways. Replaced the note with the corrected D6 framing: a no-op on
current data for `contacts`/`companies` `tile_events` + `activities/pages/view`,
but the demo lead-view is a real consumer that **migrates to the new
workflows-provided timeline surface in task 11**.

### 3. `tasks.md` scope note predated reviews 3–5 and `open-questions.md`

**Type:** Stale Status/Reference
**Source of truth:** current file tree; consistency-3 (folded reviews 3–4 in)
**Files affected:** `tasks/tasks.md`
**Resolution:** Auto-resolved. The "Context files considered: none … design folder
contains only `design.md` and a `review/` folder" + "Review files skipped:
review-1/-2…" note was written at task-generation time and no longer matches: the
folder now holds `open-questions.md` and reviews 3–5, whose resolutions were folded
in by the consistency passes. Updated the note to name `open-questions.md` (a
deferred-OQ record that doesn't affect task scope) and to state that reviews 1–5
were propagated via `consistency-1`–`consistency-3`.

## No Issues

- **design.md ↔ reviews 1–5:** fully consistent. review-5's four resolutions are
  propagated — `workflow_closed` boolean on the `GetWorkflowAction` envelope (D8,
  read-methods §4, response table, deletions); action `title` dropped, header
  reuses `message` (D8 line 94, with the broader per-verb-title question parked in
  `open-questions.md`); the demo-lead-view migration + exported
  `workflows-events-timeline` component folded into D6/"The read methods"/Ripples;
  and the array→object shape change called out in proposal point 2.
- **`open-questions.md`:** consistent with D8 — the shared header reuses `message`
  now; the per-verb `pages.{verb}.title` collapse is correctly deferred (lives in
  the foundational authoring spec, needs the reference implementation).
- **Tasks 5 and 10 (review-5 #1/#2 targets):** already correct — task 5 step 6
  carries `workflow_closed` and drops action `title` (reuses `message`); task 10
  steps 1/1b/1c handle the view-header `message` repoint, the `get_workflow`
  deletion for both consumer sets, and the static-page `workflow_closed` rewire.
  No drift — review-5's task edits landed.
- **Task 11:** matches the design's timeline-surface migration (review-5 #3 noted
  it "drifted in the right direction" and the design was the side to update).
- **Tasks 2, 3, 4, 7, 8, 9, 12:** no drift against the current design.
- **Internal task contradictions:** none — file deletions/exports remain
  partitioned with the explicit "defer to task 12 if not yet landed" guards.
- **Method count / naming / `meta` flags:** five methods, fully renamed,
  `meta = { checkRead: false, checkWrite: false }` consistent across design + tasks
  4–6 (re-confirmed from consistency-2/-3; unchanged).
