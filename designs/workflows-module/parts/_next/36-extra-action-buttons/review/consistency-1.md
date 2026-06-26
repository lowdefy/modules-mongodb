# Consistency Review 1

## Summary

Checked design.md, both reviews, and all six task files after the review-2 actioning pass. Found 15 inconsistencies — all task-file drift from review-2 decisions plus one internal arithmetic slip in design.md. All 15 auto-resolved (every one was settled by an unambiguous review-2 resolution annotation); none required user input.

## Files Reviewed

- **Design:** `design.md`
- **Supporting:** none (the part has no supporting files)
- **Reviews:** `review/review-1.md`, `review/review-2.md` (all findings in both carry resolution annotations)
- **Tasks:** `tasks/tasks.md`, `tasks/01-validator-buttons-extra.md`, `tasks/02-template-concat-wiring.md`, `tasks/03-demo-help-button.md`, `tasks/04-readme-per-page-chrome.md`, `tasks/05-concept-docs-roadmap.md`, `tasks/06-e2e-help-button.md`
- **Plans:** none
- **Live state cross-checked:** `apps/demo/e2e/workflows/` (the `onboarding-happy-path.spec.js` the design's e2e decision targets exists, with the deferred-verification `NOTE:` header the design describes)

## Inconsistencies Found

### 1. Task 1's `RESERVED_BUTTON_IDS` missing `button_edit`

**Type:** Design-vs-Task
**Source of truth:** review-2 finding #7 (resolved — `button_edit` added to the reserved set; nav buttons reserve too)
**Files affected:** `tasks/01-validator-buttons-extra.md`
**Resolution:** Added `'button_edit'` to the constant; updated the constant's comment from "signal buttons" to "bar buttons — signal plus navigation" with the collision rationale; updated the context paragraph to name the review page's `button_edit` nav button.

### 2. Task 1 missing test cases (f2) and (f3)

**Type:** Design-vs-Task
**Source of truth:** review-2 findings #7 and #8 (design Verification now lists (f2) `button_edit` on review rejected, (f3) `button_approve` on edit rejected pinning global semantics)
**Files affected:** `tasks/01-validator-buttons-extra.md`
**Resolution:** Added both cases to the unit-test list and noted them in the Files section.

### 3. Task 1 silent on global-vs-per-page reservation semantics

**Type:** Design-vs-Task
**Source of truth:** review-2 finding #8 (resolved — semantics flattened to **global**: any reserved id rejected on every verb page)
**Files affected:** `tasks/01-validator-buttons-extra.md`
**Resolution:** The reserved-id check bullet now states the check is global with the design's rationale (per-page would only let authors name an edit extra `button_approve`; global self-protects when buttons move between pages); constant comment carries the same note.

### 4. Task 4 used the request-changes modal as the `buttons.{signal}.modal` worked example with a knob shape that doesn't exist

**Type:** Design-vs-Task
**Source of truth:** review-2 finding #2 (resolved — `.modal.{title,content}` exists on `submit`/`not_required`/`approve`/`resolve_error`; `request_changes` carries `.visible`/`.disabled` only, its comment modal mandatory)
**Files affected:** `tasks/04-readme-per-page-chrome.md`
**Resolution:** Switched the worked example to the **approve modal** and documented the correct knob distribution and the request-changes exception.

### 5. Task 4 reserved-id list missing `button_edit`

**Type:** Design-vs-Task
**Source of truth:** review-2 finding #7
**Files affected:** `tasks/04-readme-per-page-chrome.md`
**Resolution:** Added `button_edit` to the README's reserved-id list and noted global reservation ("rejected at build time on every verb page").

### 6. Task 4 modal pattern used `method: open` for `Modal`

**Type:** Design-vs-Task
**Source of truth:** review-2 finding #1 (resolved — `Modal` registers `toggleOpen`/`setOpen`; `open` is `ConfirmModal`-only)
**Files affected:** `tasks/04-readme-per-page-chrome.md`
**Resolution:** Changed to `method: toggleOpen` with the ConfirmModal-only note for `open`.

### 7. Task 4 role-gating idiom used `_state: action_allowed` (object compared to bool)

**Type:** Design-vs-Task
**Source of truth:** review-2 finding #3 (resolved — `action_allowed` is an object `{ view, edit, review, error }`; gate on the verb-specific bool; extras get no implicit gating)
**Files affected:** `tasks/04-readme-per-page-chrome.md`
**Resolution:** Changed to `_state: action_allowed.{verb}`, named the object shape, and added the no-implicit-gating + server-side-checks note the design's "Visibility and role gating" section now carries.

### 8. Task 5 context asserted the wrong "correct" shape (`buttons.request_changes.modal.{title,content,visible}`)

**Type:** Design-vs-Task
**Source of truth:** review-2 finding #2
**Files affected:** `tasks/05-concept-docs-roadmap.md`
**Resolution:** Context paragraph now states the shipped knobs live under `buttons.{signal}.modal.{title,content}` on `submit`/`not_required`/`approve`/`resolve_error` and that request_changes is mandatory with `.visible`/`.disabled` only.

### 9. Task 5 §1 (action-authoring edits) instructed writing the wrong request-changes attribution into the concept doc

**Type:** Design-vs-Task
**Source of truth:** review-2 finding #2 — review explicitly warned "the concept-doc correction tasks must write _this_ shape, or they replace one stale doc claim with another"
**Files affected:** `tasks/05-concept-docs-roadmap.md`
**Resolution:** The "remove the stale modals paragraph" bullet now writes the verified knob distribution instead of `buttons.request_changes.modal.*`.

### 10. Task 5 §1 modal pattern used `method: open`

**Type:** Design-vs-Task
**Source of truth:** review-2 finding #1
**Files affected:** `tasks/05-concept-docs-roadmap.md`
**Resolution:** Changed to `CallMethod { blockId, method: toggleOpen }` with the ConfirmModal-only note.

### 11. Task 5 §2 (ui chrome table) same wrong request-changes attribution

**Type:** Design-vs-Task
**Source of truth:** review-2 finding #2; design's ui files-changed row
**Files affected:** `tasks/05-concept-docs-roadmap.md`
**Resolution:** Chrome-table bullet now mirrors the design row: knobs on `submit`/`not_required`/`approve`/`resolve_error`, request_changes mandatory with no knobs. Acceptance criterion reworded to match.

### 12. Task 5 §3 roadmap dependency note omitted Part 39

**Type:** Design-vs-Task
**Source of truth:** review-2 finding #9 (resolved — roadmap row reads "depends on Parts 16, 4, 39")
**Files affected:** `tasks/05-concept-docs-roadmap.md`
**Resolution:** Follow-on entry bullet now names Parts 16, 4, **and 39** as dependencies and notes Part 39 is design-only at time of writing.

### 13. Task 6 still deferred to Part 22 coordination

**Type:** Design-vs-Task
**Source of truth:** review-2 finding #11 (resolved — self-owned; assertion added to the existing `onboarding-happy-path.spec.js`; no Part 22 coordination; deferred-verification caveat). The resolution annotation explicitly flagged "Task 6's 'coordinate with Part 22' wording to be aligned at consistency review."
**Files affected:** `tasks/06-e2e-help-button.md`
**Resolution:** Rewrote the task: targets `apps/demo/e2e/workflows/onboarding-happy-path.spec.js` directly (verified the file exists with the deferred-verification `NOTE:` header), drops all Part 22 coordination, inherits the spec's existing deferred-verification note instead of a `STATUS:` skip block, and states the assertion verifies nothing at ship time (live verification = tasks 2–3 build/render checks).

### 14. tasks.md ordering rationale and table row repeated the Part 22 supplement framing; sequencing note missing `button_edit`

**Type:** Design-vs-Task
**Source of truth:** review-2 findings #11 and #7
**Files affected:** `tasks/tasks.md`
**Resolution:** Task-6 ordering paragraph rewritten to the self-owned + deferred-verification framing; task table row 6 summary updated; cross-part sequencing bullet's reserved-id list gains `button_edit`.

### 15. design.md "six-id set" vs seven listed reserved ids

**Type:** Internal Contradiction
**Source of truth:** design.md's own reserved-set list in Proposed Change item 3 (seven ids after review-2 #7 added `button_edit`)
**Files affected:** `design.md`
**Resolution:** "six-id set" → "seven-id set" in the duplication-tradeoff sentence.

## No Issues

- **design.md vs review-2 resolutions** — every review-2 annotation is already reflected in the design (toggleOpen split, approve-modal knob shape, per-verb `action_allowed`, Resend-Reminder citation correction, formHeader/formFooter port note, view rejection, `button_edit` reservation, global semantics + test f3, Part 39 dependency banner, `extra` rename rationale, self-owned e2e). The one exception was the six/seven arithmetic slip (#15).
- **review-1 resolutions** — all five annotated resolutions (demo target `qualify.yaml`, dropped `modals:` slot, README per-page-chrome subsection, softened single-source claim, `makeActionPages` round-trip test) are consistently propagated through design and tasks. Review-1 findings #5, #6, #8 without annotations were superseded by review-2 #8, #10, #11 respectively.
- **Task 2 (template concat wiring)** — fully consistent with the design: bar contents per template, Part 39 name-agnostic composition note, round-trip-only resolver test, view untouched.
- **Task 3 (demo Help button)** — consistent: `qualify.yaml` target, YAML block matches the design's demo snippet verbatim, Parts 38/45 reshaping caveat present.
- **Cross-task contradictions** — none; tasks touch disjoint files except the shared design references, which now agree.
- **Stale status/blockers** — the Part 39 design-only caveats in design.md and tasks.md accurately describe current state (Part 39 templates not yet shipped); kept.
