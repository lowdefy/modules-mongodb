# Consistency Review 1

## Summary

Scanned part 16's design + review-1 against the cross-touched parts (12, 13, 17, 18, 24, implementation-plan, concept specs). Found 15 inconsistencies — 14 auto-resolved (review decisions propagated to drifting files), 1 surfaced as a user-decision drift between part 24's "Consumers" claim and part 18's actual tracker-rendering scope and resolved in-session by narrowing part 24's scope to form + task kinds only.

## Files Reviewed

**Part 16 (the subject):**

- `designs/workflows-module/parts/16-page-templates/design.md`
- `designs/workflows-module/parts/16-page-templates/review/review-1.md`

**Adjacent parts cross-touched by review-1 resolutions:**

- `designs/workflows-module/parts/12-resolver-pages/design.md` + `tasks/02-make-action-pages.md` + `tasks/tasks.md` + `review/*.md`
- `designs/workflows-module/parts/13-resolver-apis/design.md` + `tasks/02-make-workflow-apis.md` + `tasks/tasks.md`
- `designs/workflows-module/parts/17-shared-pages/design.md`
- `designs/workflows-module/parts/18-entity-components/design.md`
- `designs/workflows-module/parts/24-universal-fields/design.md`
- `designs/workflows-module/implementation-plan.md`

**Concept (rationale-bearing):**

- `designs/workflows-module-concept/ui/spec.md` + `ui/design.md`
- `designs/workflows-module-concept/submit-pipeline/spec.md`
- `designs/workflows-module-concept/action-authoring/spec.md` + `action-authoring/design.md`
- `designs/workflows-module-concept/spec.md` + `design.md`

**Resolver code (touched today):**

- `modules/workflows/resolvers/makeActionPages.js` + `.test.js`
- `modules/workflows/resolvers/makeWorkflowApis.js` + `.test.js`
- `modules/workflows/resolvers/README.md`

All resolver tests pass (51/51).

## Inconsistencies Found

### 1. Part 16 design Goal undersells part 24's role

**Type:** Internal Contradiction (within part 16)
**Source of truth:** Review-1 finding #8 created part 24 for universal-fields; design body lines 14/21 reference it. Goal section line 7 didn't.
**Files affected:** [part 16 design.md](../../../parts/16-page-templates/design.md) line 7.
**Resolution:** Goal section now reads "the universal-fields band (via [part 24]'s component), the form body (via [part 15]'s `makeActionsForm` resolver)" — separates the two cleanly.

### 2. Part 16 error template defaulted `form_error` to `form`

**Type:** Design-vs-Design (part 16 contradicts part 15's "no `form_error` defaulting" rule)
**Source of truth:** [Part 15 design.md line 30](../../../parts/_completed/15-resolver-form-builder/design.md) explicitly says "the resolver does not synthesize one from `form:`. Templates handle the absent case by defaulting to `[]`."
**Files affected:** [part 16 design.md](../../../parts/16-page-templates/design.md) line 35.
**Resolution:** Error-template bullet now reads "Recovery form via `_ref: { resolver: makeActionsForm.js, vars: { form: <action_config.form_error>, mode: 'error' } }`. Per part 15, the resolver does **not** synthesize `form_error` from `form` when absent — the template defaults to `[]` (empty form body) and the failure-context banner stands alone."

### 3. Part 16 line 30 ambiguous about comment payload field

**Type:** Internal Contradiction (within part 16)
**Source of truth:** Review-1 #5's resolution committed top-level `comment` in payload; line 149 documents it explicitly; line 30 said "flows through `event.metadata.comment`" without distinguishing payload from engine destination.
**Files affected:** [part 16 design.md](../../../parts/16-page-templates/design.md) line 30.
**Resolution:** Line 30 now reads: "Page sends a top-level `comment` field in the submit payload; the resolver-emitted API (part 13) maps it to `event.metadata.comment` on the engine-emitted event. See 'Button payload' below for the full payload shape."

### 4. Part 16 verification claimed "handler-level integration smoke"

**Type:** Internal Contradiction (within part 16's Verification section)
**Source of truth:** Part 16 ships templates (YAML), not handler code. Line 223 says verification is the demo-app render + manual sweep; line 224 contradicted with "unit-tests + handler-level integration smoke only" (copy-pasted from part 13's verification).
**Files affected:** [part 16 design.md](../../../parts/16-page-templates/design.md) line 224.
**Resolution:** Line 224 now: "This part's verification is the demo-app render checks + outer-card suppression fixtures + manual a11y sweep above — no unit-tests (templates are YAML, not JS) and no handler-level integration (the engine path is exercised end-to-end via part 22)."

### 5. Part 13 verification list missed the comment passthrough test

**Type:** Design-vs-Code (test exists, design doesn't list it)
**Source of truth:** Review-1 #5 added a `comment: { _payload: 'comment' }` emission to the resolver and a test asserting it; both shipped today. Part 13 design's verification list didn't mention the new test case.
**Files affected:** [part 13 design.md](../../../parts/13-resolver-apis/design.md) lines 85–91.
**Resolution:** Added a new bullet between the task-endpoint and hooks bullets: "Every emitted form/task endpoint passes the runtime `comment` field through to the handler via `comment: { _payload: 'comment' }` (per 'Comment mapping' above)."

### 6. Part 13 task 02 omitted `comment` from YAML, JS, and verification

**Type:** Design-vs-Task
**Source of truth:** Review-1 #5; part 13 design.md committed the comment-mapping contract; tasks/02-make-workflow-apis.md was written before and didn't propagate.
**Files affected:** [part 13 tasks/02-make-workflow-apis.md](../../../parts/13-resolver-apis/tasks/02-make-workflow-apis.md) — YAML skeleton (line 60), JS skeleton (line 244), verification step list (renumbered from 11 → 12 cases), Acceptance Criteria count.
**Resolution:** Added `comment: { _payload: comment }` to both skeleton blocks (with a comment pointing to part 13 design § Comment mapping); inserted verification step 3 ("Every form/task endpoint passes `comment` through"); renumbered subsequent steps; updated Acceptance Criteria from "11 test cases" to "12".

### 7. Concept submit-pipeline canonical YAML omitted `comment`

**Type:** Design-vs-Design (concept contract vs. part 13 design)
**Source of truth:** Part 13 design's Comment mapping subsection is the new contract; submit-pipeline/spec.md is the rationale-bearing source that needs to mirror it.
**Files affected:** [concept submit-pipeline/spec.md](../../../../workflows-module-concept/submit-pipeline/spec.md) line 55.
**Resolution:** Added `comment: { _payload: comment }` immediately after `fields` in the canonical endpoint YAML, with inline comment "user-supplied comment; handler maps to event.metadata.comment".

### 8. Concept submit-pipeline button-vocabulary table had stale `not_required` row

**Type:** Review-vs-Design (review-1 #2 reversed the placement; concept spec wasn't updated for the submit-pipeline copy)
**Source of truth:** Review-1 #2 committed `not_required` to `edit (opt-in)` only; ui/spec.md was updated earlier in the action-review, but submit-pipeline/spec.md's parallel table wasn't.
**Files affected:** [concept submit-pipeline/spec.md](../../../../workflows-module-concept/submit-pipeline/spec.md) line 90.
**Resolution:** `not_required` row now reads `edit (opt-in)` instead of `view (optionally edit)`. Column widths adjusted for the shorter cell.

### 9. Concept submit-pipeline button-payload example omitted `comment`

**Type:** Design-vs-Design (same as #7, different code block)
**Files affected:** [concept submit-pipeline/spec.md](../../../../workflows-module-concept/submit-pipeline/spec.md) line 303.
**Resolution:** Added `comment: { _state: comment }` to the canonical button-payload example, with inline comment "optional; handler maps to event.metadata.comment".

### 10. Concept ui/spec.md task-edit / task-review / page-level universal-fields described comment as `event.metadata.comment` in the payload

**Type:** Review-vs-Design (review-1 #5's contract not propagated to concept ui/spec.md)
**Source of truth:** Part 16's button-payload subsection.
**Files affected:** [concept ui/spec.md](../../../../workflows-module-concept/ui/spec.md) lines 76, 78, 208.
**Resolution:** All three rewritten to clearly distinguish payload field (top-level `comment`) from engine destination (`event.metadata.comment`), with the API mapping cross-referenced.

### 11. Concept ui/design.md task-edit / task-review / page-level universal-fields — same drift as #10

**Type:** Review-vs-Design
**Files affected:** [concept ui/design.md](../../../../workflows-module-concept/ui/design.md) lines 163, 165, 228.
**Resolution:** Same rewording as #10.

### 12. Worked-example narrative in concept design.md + spec.md

**Type:** Review-vs-Design
**Files affected:** [concept design.md](../../../../workflows-module-concept/design.md) line 270; [concept spec.md](../../../../workflows-module-concept/spec.md) line 68.
**Resolution:** Both now describe the page calling `update-action-schedule-followup` with "a top-level `comment` field (the resolver-emitted API maps it to `event.metadata.comment`)" instead of the ambiguous earlier wording.

### 13. action-authoring/spec.md worked-example narrative

**Type:** Review-vs-Design
**Files affected:** [concept action-authoring/spec.md](../../../../workflows-module-concept/action-authoring/spec.md) line 421.
**Resolution:** Reworded to match the new contract.

### 14. Part 17 (shared-pages) — comment payload + universal-fields composition

**Type:** Design-vs-Design (both part 16's new comment contract AND part 24's new universal-fields component need to be reflected in part 17, which composes them)
**Source of truth:** Review-1 #5 (comment) + review-1 #8 (part 24).
**Files affected:** [part 17 design.md](../../../parts/17-shared-pages/design.md) lines 13–29 (task-edit / task-view / task-review descriptions); Depends-on section.
**Resolution:**

- Task-edit / task-view / task-review now describe the universal-fields band as `_ref` to part 24's component with explicit `mode` + `kind: task` vars (no inline assignees/due_date/description input authoring).
- Task-edit's Save-button payload bullet now uses the corrected comment contract (top-level `comment` field with cross-reference to part 13 § Comment mapping).
- Task-review's comment field bullet uses the same corrected contract.
- Depends-on section now lists part 24 alongside parts 13/15/16/19.

## User-decision items (1)

### 15. Part 24 over-claims part 18's tracker rendering scope

**Type:** Internal Contradiction (between part 24's "Consumers" table and part 18's actual scope)
**Source of truth:** User clarified that tracker actions don't have a view surface — `actions-on-entity` is `status_map.message`-only.
**Files affected:** [part 24 design.md](../../../parts/24-universal-fields/design.md) — Goal (line 7), component-vars `kind` enum, "Where the component renders" table, Display rules, Consumers section, Verification, Contract to neighbours; [implementation-plan.md](../../../../implementation-plan.md) Wave 6 rationale.
**Resolution:** Adopted option (a) — narrow part 24's scope to form + task only. Edits:

- Goal: drops "all action kinds" and the part-18 consumer reference; adds a one-paragraph note explaining why trackers are excluded (no view surface).
- Component-vars: `kind` enum drops `'tracker'`.
- "Where the component renders" table: tracker row removed.
- Display rules: "Tracker compact mode" bullet removed.
- Verification: `compact: true` assertion removed.
- Consumers: part 18 bullet removed.
- Contract to neighbours: "Parts 16 / 17 / 18 consume" → "Parts 16 / 17 consume" with a one-line note that part 18 doesn't consume the component in v1.
- Implementation-plan: Wave 6 rationale tightened — "16 and 17 consume (part 18 doesn't in v1)".

Part 24's "Open questions" section still carries the tracker authoring question — left in place per user direction so part 24's own review cycle can decide what to do later.

Part 18 is untouched. The two designs now agree.

## No Issues

Areas checked, all consistent:

- **`chrome` → `page_config` rename** — fully purged from part 12's design, task, resolver, test, and README. Part 16 design uses `page_config` consistently in operator paths; remaining `chrome` mentions are the generic-concept sense (page chrome, back-link chrome, card chrome), not the old var name.
- **`Edit` navigation button on review** — review-1 #3's contract is reflected in part 16 design (button-vocabulary section split), concept ui/spec.md, and concept ui/design.md.
- **Stale-URL redirect allowlists** — only described in part 16; no other file claims a different rule.
- **`_ref: layout.page` as template top-level** — part 16 design's "Layout-module composition" subsection commits it; concept ui/spec.md "Form-action page YAML shape" now shows the right `_ref` shape (was `type: PageHeaderMenu`); part 12's task and resolver align.
- **Outer-card suppression** — only described in part 16; v0 reference and `box`-first edge case documented.
- **`not_required` opt-in on edit-only** — propagated to part 16 design, ui/spec.md (line 51, 67), ui/design.md (line 124), and submit-pipeline/spec.md (now via #8 above).
- **Implementation-plan Wave 6** — part 24 slotted in ahead of 16/17/18 with rationale; repo-footprint table updated.
- **Part 24's "Consumers" reference to part 16 + part 17** — both consuming parts now explicitly reference part 24 in their descriptions and Depends-on.
- **All 12 makeWorkflowApis tests + 11 makeActionPages tests pass** — resolver changes from review-1 are tested.

## Next Step

Resolve the one user-decision item (part 24 / part 18 tracker scope). Then run `/r:design-task workflows-module/parts/16-page-templates` to break the design into implementation tasks — there's no tasks/ directory yet, so it'll create one.
