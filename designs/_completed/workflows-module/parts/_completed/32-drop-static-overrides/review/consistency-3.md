# Consistency Review 3

## Summary

Scanned the full file tree of Part 32 (design.md, both reviews, tasks.md, seven task files) for drift between review decisions, the design body, and the task briefs. Two inconsistencies found, both auto-resolved from the design (Review 2 source-of-truth).

## Files Reviewed

**Design:**

- `designs/workflows-module/parts/32-drop-static-overrides/design.md`

**Reviews (chronological):**

- `designs/workflows-module/parts/32-drop-static-overrides/review/review-1.md`
- `designs/workflows-module/parts/32-drop-static-overrides/review/review-2.md`

**Tasks:**

- `designs/workflows-module/parts/32-drop-static-overrides/tasks/tasks.md`
- `designs/workflows-module/parts/32-drop-static-overrides/tasks/01-update-concept-specs.md`
- `designs/workflows-module/parts/32-drop-static-overrides/tasks/02-update-neighbour-part-designs.md`
- `designs/workflows-module/parts/32-drop-static-overrides/tasks/03-drop-bake-in-makeWorkflowApis.md`
- `designs/workflows-module/parts/32-drop-static-overrides/tasks/04-drop-layer2-resolveTargetStatus.md`
- `designs/workflows-module/parts/32-drop-static-overrides/tasks/05-drop-layer2-mergeEventOverrides.md`
- `designs/workflows-module/parts/32-drop-static-overrides/tasks/06-rewire-handleSubmit.md`
- `designs/workflows-module/parts/32-drop-static-overrides/tasks/07-cleanup-demo-and-config-comment.md`

**No supporting files / no plan directory.**

## Inconsistencies Found

### 1. Task 4 carried the false historical claim that the runtime enum check "moves" a pre-existing build-time check

**Type:** Design-vs-Task drift
**Source of truth:** Review 2 finding #1 (resolved); design.md § Trade-offs / What gets better (line 154: "Net-new runtime enum check on the pre-hook `status` return. Today there is no enum-membership validation on either the YAML or pre-hook channel…").
**Files affected:** `tasks/04-drop-layer2-resolveTargetStatus.md` (Context, line 18).
**The drift:** Review 2 finding #1 verified against `makeWorkflowsConfig.js:128–166` and `makeWorkflowApis.emitInteractions:55–64` that no enum check exists today on either channel. The design was reframed accordingly (net-gain bullet under "What gets better"; "regression vs. build-time validation" bullet removed from "What gets worse"). The review note said "Task 4 wording follow-up handled by finding #2's rename," but finding #2's rename only swapped `mergeStatus → resolveTargetStatus` — it did not sweep the false "used to live in `makeWorkflowsConfig`" history. Task 4 still read:

> Part 32 collapses this to two layers: engine default + pre-hook return. It also moves the build-time enum-membership check that used to live in `makeWorkflowsConfig` (for the now-dropped YAML field) to **runtime**…

**Resolution:** Rewrote the sentence to match the design's net-new framing — names the runtime check as added (not moved), and cites the same audit evidence (`makeWorkflowsConfig` doesn't inspect `action.interactions[].status`; `emitInteractions` passes `v.status` through unchanged).

### 2. tasks.md "Review files skipped" note didn't mention review-2

**Type:** Stale reference
**Source of truth:** Filesystem (`review/review-2.md` exists; its findings were applied to design and tasks before this consistency pass).
**Files affected:** `tasks/tasks.md` (line 32).
**The drift:** `tasks.md` was generated when only review-1 existed and noted "Review files skipped: `review/review-1.md` (per design-task convention)." Review-2 has since been written and its findings propagated into the tasks (e.g. Task 1 AC #4 rephrased per R2 finding #4; Task 7 acceptance criterion #5 strengthened per R2 finding #5; Task 4 UserError helper added per R2 minor #1). The skipped-reviews note still listed only review-1.

**Resolution:** Updated the note to list both reviews and clarify that review findings were applied to the design and tasks before task break-out.

## No Issues

The following cross-cuts were checked and are consistent:

- **`mergeStatus → resolveTargetStatus` rename (R2 finding #2)** — no stale `mergeStatus` references in design.md or any task file.
- **`:return:` control prefix in pre-hook examples (R1 finding #2 + R2 finding #3)** — design.md Cases A/B and the § `_nunjucks` evaluation line all use the `:return:` shape.
- **"One Api per interaction that didn't already declare a pre-hook" wording (R1 finding #5)** — change #5 in § Proposed change and the trade-offs bullet both carry the tightened phrasing.
- **Pre-hook retry idempotency framing (R1 finding #4)** — design.md change #6 cites Part 29 § D6 and drops "naturally idempotent"; Task 4 Notes mirror this.
- **Demo behavioural side-effect note (R2 finding #5)** — design.md § Parts touched demo row carries the explicit "send-quote's `request_changes` flow now writes `changes-required`" sentence; Task 7 acceptance criterion #5 marks it as deliberate.
- **"Cross-referencing design documents" wording (R2 minor #3)** — design.md § Migration no longer calls Parts 4/13 "in-flight"; Task 2 correctly handles Parts 4 and 13 as `_completed/` (deviation notes) and Part 9 as in-flight (direct edit).
- **UserError helper plan (R2 minor #1)** — Task 4 Context, step 4, and Files list all reference the local `UserError.js` helper.
- **Layer-count framing for event-overrides merge (R2 finding #4)** — Task 1 AC describes "three layers: engine default + runtime `comment` + pre-hook return (the first two folded together by `buildDefaultLogEventPayload`)," matching the design's "4 → 3" math.
- **Schema unknown-key rejection accepted as cheap risk (R1 finding #6)** — design.md § Parts touched, § Migration, and Task 3 Notes all consistently state silent acceptance with no rejecting validator.
- **§ `_nunjucks` evaluation (R1 finding #3)** — explicitly deferred to the in-flight nunjucks-template-handling rewrite; the one-token "`Return params.event_overrides`" tweak per R2 finding #3 is applied.
- **Status-resolver layer count** — design, Task 1, Task 2, Task 4 all describe a 2-layer (engine default + pre-hook) resolver post-collapse.
- **No internal contradictions** between Tasks 3, 4, 5, 6 about which file owns which removal — Task 3 (resolver bake-in) → Task 4 (`resolveTargetStatus`) → Task 5 (`mergeEventOverrides`) → Task 6 (handleSubmit call-site cleanup) is a clean dependency chain matching tasks.md ordering rationale.
