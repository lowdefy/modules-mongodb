# Consistency Review 3

## Summary

Re-walked the part-05 tree after tasks shipped and the entity_type drop landed. Found 4 inconsistencies — 3 from the task plan diverging from design.md's verification section, plus 2 stale line-number refs after the design's Verification section shrank. All auto-resolved.

## Files Reviewed

**Design:**
- `parts/05-start-cancel-handlers/design.md`

**Reviews:**
- `parts/05-start-cancel-handlers/review/review-1.md` (decision register; nothing new since consistency-2)
- `parts/05-start-cancel-handlers/review/consistency-2.md`

**Tasks:**
- `parts/05-start-cancel-handlers/tasks/tasks.md`
- `parts/05-start-cancel-handlers/tasks/01-add-change-stamp-to-connection-schema.md`
- `parts/05-start-cancel-handlers/tasks/02-create-action-helper.md`
- `parts/05-start-cancel-handlers/tasks/03-update-action-helper-scaffold.md`
- `parts/05-start-cancel-handlers/tasks/04-start-workflow-happy-path.md`
- `parts/05-start-cancel-handlers/tasks/05-start-workflow-parent-linking.md`
- `parts/05-start-cancel-handlers/tasks/06-cancel-workflow.md`

**Plans:** none.

## Inconsistencies Found

### 1. Verification section in `design.md` listed unit tests that `tasks/tasks.md` explicitly retired

**Type:** Review-vs-Design / Design-vs-Task drift
**Source of truth:** `tasks/tasks.md` § "Verification posture" (most recent decision; the user explicitly chose to drop task 7 mid-design-task-walkthrough — "Drop task 7 if not useful").
**Files affected:** `design.md:67-75` enumerated nested unit-test bullet lists for both handlers ("Unit tests on `StartWorkflow`" + "Unit tests on `CancelWorkflow`"). `tasks/tasks.md:28-35` declares "Part 05 ships **no unit tests of its own**" with rationale.
**Resolution:** Rewrote the Verification section of `design.md` to retire the unit-test bullet lists. Kept the integration smoke and the part-22 e2e cross-reference; folded the per-bullet assertions into a single sentence describing what part 22's `start-cancel.spec.js` covers, so the coverage scope isn't lost — only its location moves. Pointed the reader at `tasks/tasks.md § Verification posture` for the rationale.

### 2. Stale "task 7" reference in `04-start-workflow-happy-path.md`

**Type:** Stale Reference
**Source of truth:** the dropped task — task 7 was deleted when the user accepted the recommendation to lean on part 22 instead of a dedicated unit-test task.
**Files affected:** `04-start-workflow-happy-path.md:113` said "Tests in task 7 should assert the field is absent" referring to the `entity_type` field-absent assertion. Task 7 doesn't exist.
**Resolution:** Updated the note to point the "field is absent" assertion at part 22's `start-cancel.spec.js` instead, with a cross-reference to `tasks/tasks.md § Verification posture` so a reader following the trail lands on the rationale.

### 3. Stale line-number reference `design.md:76` in `tasks/tasks.md`

**Type:** Stale Reference (line-number drift after design.md Verification section was rewritten in finding 1)
**Source of truth:** `design.md` content after finding 1's rewrite — the integration-smoke line moved from line 76 to line 69 when the Verification section shrank from 13 lines to 6.
**Files affected:** `tasks.md:32` cited `design.md:76` for the integration smoke.
**Resolution:** Replaced the line-number ref with a section ref (`design.md § Verification`). Section refs are stable against future re-flows; line refs aren't.

### 4. Stale line-number reference `design.md:81` in `06-cancel-workflow.md`

**Type:** Stale Reference (line-number drift after design.md Verification section was rewritten in finding 1)
**Source of truth:** `design.md` content — the cancel-idempotency open-question line moved from line 81 to line 73.
**Files affected:** `06-cancel-workflow.md:138` cited `design.md:81` for the cancel-idempotency open question.
**Resolution:** Replaced the line-number ref with a section ref (`design.md § Open questions`).

## No Issues

Confirming coverage of the rest of the design ↔ task surface:

- **Part 21 `entity_type` drop** propagated correctly: design.md:14 payload no longer lists `entity_type`; tasks/tasks.md:43 and 02-create-action-helper.md:11,39 and 04-start-workflow-happy-path.md:29,113 all carry the "no entity_type" guidance with cross-reference to part 21.
- **Connection-schema extension** (`changeStamp`): design.md:43-45 and `tasks/01-add-change-stamp-to-connection-schema.md` agree on the schema property shape, optional flag, and consumer-side wiring contract.
- **Shared helpers location** (`src/connections/shared/`): design.md:47-52 and `tasks/02-create-action-helper.md`, `tasks/03-update-action-helper-scaffold.md` agree on the path. Contract to neighbours at `design.md:85` also matches.
- **Parent-link validation rules** (4 rules): design.md:18-21 Validation block lists them; `tasks/05-start-workflow-parent-linking.md` enumerates all four in its task steps; design.md:25 Parent linking bullet defers to the Validation block ("When `parent_action_id` is set (and the Validation block above passes)") — no duplicate rule lists.
- **Half-linked failure mode + retry posture**: design.md:26,28 and `tasks/05-start-workflow-parent-linking.md` Notes section agree on the "no retry-safety logic, no idempotency check" posture.
- **`force: true` on parent push**: design.md:25 and `tasks/05-start-workflow-parent-linking.md` step 5 match.
- **CancelWorkflow references reserved-key merge**: design.md:35 commits the merge order; `tasks/06-cancel-workflow.md` step 3 + the defensive `safeReferences` pattern matches.
- **CancelWorkflow `groups[]` recompute deferral**: design.md:39 cross-references part 7's `#cancelworkflow-integration`; tasks/06-cancel-workflow.md "What's not in scope" matches.
- **v0 references**: every v0 mention in tasks uses item-name form (no `dist/...` paths), per the v0-reference memory rule.
- **Line refs `design.md:15` and `design.md:41`**: re-verified against current line content; both still match.

**Decision register (review-1 + consistency-2) check:** all 14 review-1 resolutions and both consistency-2 cleanups are still correctly propagated.
