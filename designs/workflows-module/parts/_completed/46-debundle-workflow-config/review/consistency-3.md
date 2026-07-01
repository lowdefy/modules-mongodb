# Consistency Review 3

## Summary

First consistency pass to cover the **task files** (created after consistency-2,
which recorded "Tasks/Plans: none yet"). Walked reviews 1–4 + `todo-discuss` as
the decision register against `design.md` and the 13 task files. `design.md` is
fully consistent with all four reviews (confirmed by consistency-1/-2 for 1–2;
re-confirmed here for review-4). The **tasks**, however, were generated from a
design state predating **review-4**'s resolutions and missed one **review-3**
schema item — **5 inconsistencies found, 4 auto-resolved, 1 resolved by user
decision** (the `get_action` rename).

## Files Reviewed

- **Design:** `design.md`
- **Supporting:** `review/todo-discuss.md` (resolutions A–G)
- **Reviews:** `review/review-1.md`, `review/review-2.md`, `review/review-3.md`, `review/review-4.md`
- **Prior consistency reports (context only, out of chronology):** `review/consistency-1.md`, `review/consistency-2.md`
- **Tasks:** `tasks/tasks.md` + `tasks/01`–`12` (12 task files)
- **Plans:** none

## Inconsistencies Found

### 1. `get_action` → `get_workflow_action` rename dropped by the tasks

**Type:** Design-vs-Task (internal contradiction)
**Source of truth:** `design.md` intro line 9, D8; review-4 #3; consistency-2 decision register (F+G)
**Files affected:** `tasks/tasks.md` (Naming note + table), `05`, `07`, `10`
**Resolution:** Asked user — **follow the design (rename)**. `design.md` mandates
renaming the detail-read request `get_action` → `get_workflow_action` _in this
part_; `tasks.md`'s "Naming note" had deliberately decided the opposite (keep
`get_action`, treat `get_workflow_action` as design-only naming). Rewrote the
Naming note and task-7 table row to describe the rename; updated task 7 to rename
the file/id + route to `GetWorkflowAction`; updated task 10 to repoint every
`_request: get_action.*` read to `_request: get_workflow_action`. Current-state
descriptions of today's `get_action.yaml` left intact (accurate).

### 2. `GetWorkflowAction` missing the parent-workflow read for form-field values

**Type:** Design-vs-Task (stale — predates review-4 #1)
**Source of truth:** `design.md` D8 line 95, "The read methods" §4 line 141; review-4 #1
**Files affected:** `tasks/05-get-workflow-action-method.md`
**Resolution:** Auto-resolved. Task 5 read only the action doc and described
form-field values as "an allowlist keyed by the form field keys the engine knows
from `form_meta`" — the exact conflation review-4 corrected (knowing the keys ≠
having the values; values live on `workflow.form_data`, not the action doc).
Rewrote step 2 to specify **two reads** (action by `_id` + parent workflow by
`action.workflow_id`), corrected the step-6 form-field-values bullet to read the
`form_data[type]`/`[type][key]` slice off the workflow doc (allowlisted by the
validated keys), and added an acceptance criterion.

### 3. `get_workflow.yaml` deletion + form-value template rewire absent from all tasks

**Type:** Design-vs-Task (stale — predates review-4 #1b)
**Source of truth:** `design.md` "What gets deleted" line 184, "The read methods" §4 line 141; review-4 #1b
**Files affected:** `tasks/05`, `tasks/10`
**Resolution:** Auto-resolved. The design deletes `requests/get_workflow.yaml`
(the second ungated detail-path read) and rewires the four form templates to read
submitted values off the single `GetWorkflowAction` response — no task carried
this. Added step **1b** to task 10 (drop the `get_workflow` step from all four
templates, repoint `get_workflow.form_data.*` reads at the envelope, delete the
file), a Files entry for the deletion, acceptance criteria, and a note in task 5
that the envelope subsumes `get_workflow`.

### 4. Overview methods missing the filtered `workflow.form_data` return (values)

**Type:** Design-vs-Task (stale — predates review-4 #2)
**Source of truth:** `design.md` "The read methods" bullet 3 line 139, response table lines 160–161; review-4 #2
**Files affected:** `tasks/04-overview-read-methods.md`
**Resolution:** Auto-resolved. Task 4 returned `form_meta` (schema) but omitted
`workflow.form_data` (the submitted **values**), which the design returns
**filtered to the view-visible actions** (closing a pre-existing leak). Task 8
already _assumed_ `form_data` rides the response. Added the `form_data` pruning to
task 4's display-join step, both overview response shapes, and an acceptance
criterion.

### 5. `eventsCollection` connection property unaccounted for

**Type:** Design-vs-Task (stale — predates review-3 #1)
**Source of truth:** `design.md` "The read methods" lines 146–147, "Validated config additions" line 173; review-3 #1
**Files affected:** `tasks/01-connection-user-entities-plumbing.md`, `tasks/06-get-events-timeline-method.md`
**Resolution:** Auto-resolved. The design names **three** new top-level connection
properties requiring `schema.js` declarations (`user`, `entities`,
`eventsCollection`); task 1 declared only the first two and task 6 hand-waved the
events collection name as "from the connection/config." Added `eventsCollection`
(type `string`, default `"log-events"`) to task 1's schema work + acceptance +
Files; pointed task 6 at `context.connection.eventsCollection`; updated
`tasks.md`'s ordering rationale and task-1 summary from "two" → "three".

## No Issues

- **design.md ↔ reviews 1–4:** fully consistent — all four reviews' resolutions
  are propagated (1–2 confirmed by consistency-1/-2; 3–4 re-verified here, incl.
  the two-read form-data story, filtered overview `form_data`, the `eventsCollection`
  third property, and the rename).
- **Tasks 2, 3, 9, 11, 12:** no drift — verb/link/button port (2), validated-config
  additions (3), `actions-on-entity` rewrite (9), timeline surface migration (11),
  and the cleanup sweep (12) all match the design.
- **Task ordering / dependency graph:** internally consistent; the rename and the
  new form-data work land in tasks already sequenced for them (7/10/4), no new
  dependencies introduced.
- **`meta = { checkRead: false, checkWrite: false }`** consistent across tasks 4–6
  and design line 153.
- **Internal task contradictions:** none — no two tasks edit the same file in
  conflicting ways (e.g. `module.lowdefy.yaml` export removals are partitioned
  across tasks 8/10/12 with explicit "defer to task 12 if not yet landed" guards).
