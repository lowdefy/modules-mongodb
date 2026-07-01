# Consistency Review 3

## Summary

Scanned design.md and all task files against the resolutions in review-3 and review-4. Found 5 inconsistencies — all task-side drift from review-resolved design decisions. All auto-resolved by updating the affected task files; no design.md edits needed (the design already reflects every resolution).

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md`, `review/review-2.md`, `review/review-3.md`, `review/review-4.md`, `review/consistency-2.md`
- **Tasks:** `tasks/tasks.md`, `tasks/01-…` through `tasks/15-…`
- **Plans:** none exist
- **Supporting files:** none alongside `design.md`

## Inconsistencies Found

### 1. Task 9 still commits the Cancel/Close cascade to `bulkWrite`

**Type:** Design-vs-Task Drift
**Source of truth:** review-4 finding #1 (resolved option a) → design.md D11 § Wire shape (lines 200-202) + the Cancel/Close "Modified" bullets at lines 585-586
**Files affected:** `tasks/09-refactor-cancel-close-cascade.md`, `tasks/tasks.md`

Design D11 was rewritten to use a per-action `MongoDBUpdateOne` loop because the community plugin (`@lowdefy/community-plugin-mongodb`) deliberately omits `MongoDBBulkWrite`. Task 9 still said "Switch Cancel/Close per-action sweeps to `bulkWrite`" — title, step 5 ("Push `{ updateOne: { filter, update } }` onto the bulkWrite ops array"), step 6 ("Send one `bulkWrite`"), and the Acceptance Criteria all referenced bulkWrite. Task 8's old text included a contradictory "no structural change" claim for handleSubmit.js that compounded this.

**Resolution:** Rewrote `tasks/09-refactor-cancel-close-cascade.md` to use a per-action `MongoDBUpdateOne` loop — title, context paragraph, step list, tests, acceptance criteria, and notes. Updated the row for task 9 in `tasks/tasks.md` to reflect the new mechanic.

### 2. Task 8 missing the three handleSubmit.js edits

**Type:** Design-vs-Task Drift
**Source of truth:** review-3 finding #2 + review-4 findings #2 and #6 (all resolved) → design.md D11 / D14 + the `handleSubmit.js` "Modified" bullet at lines 590-595
**Files affected:** `tasks/08-wire-updateAction.md`

Design.md enumerates three explicit edits to `handleSubmit.js`:

1. Pass `actionDisplay: params.action_display` and `metadata: params.metadata` into `updateAction` / `createAction` in the step-4 loop.
2. Refresh `context.action = recomputeResult.workflowActions.find(a => a._id === context.action._id)` after step-5 recompute.
3. Reassign `context.workflow = recomputeResult.workflow` after step-5 recompute.

Without these, `action.metadata`, `action.<appName>.message`, `action.status[0].stage`, and `workflow.summary.*` in event templates resolve to pre-write (or unset) values. Task 8 said "verify metadata flows through; no structural change expected" — the opposite of what the design now requires.

**Resolution:** Rewrote `tasks/08-wire-updateAction.md` to enumerate the three handleSubmit.js edits in a dedicated step, with the rationale and the specific lines.

### 3. Task 8 missing the force/fetch unification

**Type:** Design-vs-Task Drift
**Source of truth:** review-4 finding #5 (resolved) → design.md D11 § Force/fetch unification (paragraph after the three call-site bullets, around line 244)
**Files affected:** `tasks/08-wire-updateAction.md`

Design.md commits to pulling the `getCurrentAction` fetch out of the `if (force !== true)` block so render-on-write has access to the pre-write doc on every call. Task 8 didn't mention this — the implementer would either re-introduce a force-vs-non-force asymmetry or leave the renderer with no doc on force calls.

**Resolution:** Added a Context paragraph and a step to `tasks/08-wire-updateAction.md` covering the unconditional fetch and the narrowed semantics of `force`.

### 4. Task 7 missing the `workflow_type` denormalisation

**Type:** Design-vs-Task Drift
**Source of truth:** review-3 finding #3 + review-4 finding #3 (both resolved option a) → design.md Schema additions § Action doc row for `workflow_type` (line 427) + `createAction.js` "Modified" bullet (around line 586) referencing "Add `workflow_type: workflow.workflow_type` to the action draft"
**Files affected:** `tasks/07-wire-createAction-and-StartWorkflow.md`

Design.md commits to writing `workflow_type` on every action doc so `computeEngineLinks` can read it for the `form` kind's `pageId` (`${actionDoc.workflow_type}-${actionDoc.type}-${verb}`). Task 7 didn't mention the denormalisation step — the implementer would land render + link computation against a draft whose `workflow_type` is undefined and form-kind links would silently break.

**Resolution:** Added the denormalisation step to `tasks/07-wire-createAction-and-StartWorkflow.md` under the `createAction.js` task list and added a test assertion that every inserted action doc carries top-level `workflow_type`. Also added a form-kind test ensuring `pageId` interpolates the denormalised field.

### 5. Tasks 7 and 8 referenced `payload.X` for params that aren't named `payload`

**Type:** Internal Contradiction (within tasks)
**Source of truth:** design.md "Modified" bullets giving the full helper signatures: `updateAction(context, { actionId, newStage, fields, actionDisplay, metadata, eventId, currentActionId, force })` and `createAction(context, { workflow, action, actionDisplay, metadata, eventId })`
**Files affected:** `tasks/07-wire-createAction-and-StartWorkflow.md`, `tasks/08-wire-updateAction.md`

Both tasks referenced `payload.action_display` and `payload.metadata` in their implementation steps and in `renderStatusMap` call snippets — but neither helper takes a `payload` argument. The handler (`handleSubmit.js` / `StartWorkflow.js`) extracts those values from its request payload and threads them through as the keyed args `actionDisplay` and `metadata`.

**Resolution:** Replaced `payload.action_display` / `payload.metadata` with the proper param names (`actionDisplay` / `metadata`) in both task files. Spelled out the new full signatures (with safe defaults for `actionDisplay = {}` and `metadata = null`) up front in each task's Context section. Adjusted the test descriptions accordingly.

### 6. Task 10 missing the `access.demo` shape migration

**Type:** Design-vs-Task Drift
**Source of truth:** review-4 finding #8 (resolved) → design.md Demo + tests bullet for `install-step.yaml` (around line 617) which calls for migrating `access.demo` from the nested `{ roles, verbs }` shape to the array-of-verbs shape
**Files affected:** `tasks/10-strip-link-from-demo-configs.md`

Design.md's Demo + tests entry for `install-step.yaml` calls for fixing the bad `access.demo` config so `computeEngineLinks` doesn't emit divergent link sets across demo workflows. Task 10 only mentioned stripping authored `link:` — the access-shape fix was missing.

**Resolution:** Added a third edit bullet to task 10's `install-step.yaml` step, plus an acceptance-criteria line, calling out the migration to the array-of-verbs canonical shape and noting that `access.roles` / `access.notification_roles` are the only top-level reserved keys.

## No Issues

The following were checked and are consistent:

- Decision-letter numbering (D1–D14) — sequential, no duplicates, matches consistency-2.md's renumbering.
- D4 link-defaults table (kind × stage × verb) — referenced consistently across design, task 3, and task 11.
- D9 cell-shape validation rules — task 11 mirrors design wording (built-in kind rejects `link:`; custom accepts `{ message, link }`; `status_title` is string-or-null; no coverage requirement; resolver drops `status_map_app_slugs`).
- D13 render-tree walker — task 1 mirrors the design's recursive-walk snippet verbatim.
- D14 event render context — task 13 lists the six bindings (`user`, `action`, `workflow`, `interaction`, `status_before`, `status_after`) and matches D14's "no top-level metadata", "no entity", "post-write action doc" rules; task 14 wires `dispatchLogEvent` with the same context.
- Default event template — task 14 commits to `"{{ user.profile.name }} marked {{ action.type }} as {{ status_after }}"` matching review-3 finding #7's "marked X as Y" resolution.
- `app_name` manifest description — task 6 mirrors design's three-role wording.
- API contract for `metadata` / `action_display` — task 6 covers both Start (`api/start-workflow.yaml`) and Submit (`makeWorkflowApis.js`); task 15 documents both in the README.
- File paths and line-number references in tasks — verified against design.md cross-references; no stale paths.
- Cross-design reference to Part 32 (D14, Related section) — Part 32 already lives in `_completed/`; the design's text correctly frames this as a follow-on edit.
- No client-name leakage in any task or in design.md.
