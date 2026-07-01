# Implementation Tasks — Part 65: Check-action modal rework + decouple universal fields from transitions

## Overview

These tasks implement `designs/workflows-module/parts/65-check-action-modal-rework/design.md`: re-gate the engine's universal-fields write rule on transition **source** (user vs. orchestration) instead of action **kind**, stop both check surfaces sending `fields` on submit, and rework the in-context check-action modal onto the converged chips + edit-modal + authored-description + shared-`title-block` composition the workspace pages already use.

## Tasks

| #   | File                                   | Summary                                                                                 | Depends On |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-regate-engine-rule.md`             | Re-gate `applyUpdateFieldsRule` on `source` (not `kind`) + rewrite/add its unit tests   | —          |
| 2   | `02-audit-engine-integration-tests.md` | Audit `planSubmit` / `SubmitWorkflowAction` tests for check-user field-write assertions | 1          |
| 3   | `03-rework-check-action-surface.md`    | Rework `check-action-surface.yaml` (Box, title-block, chips+modal, description, drops)  | —          |
| 4   | `04-converge-modal-comments.md`        | Comment-only convergence in `check-action-modal.yaml` (pruning rationale now stale)     | 3          |
| 5   | `05-decouple-workspace-page-fields.md` | `action.yaml.njk`: drop `fields` from submit/progress payloads; drop field-edit resets  | —          |

## Ordering Rationale

There are two independent workstreams that join only behaviorally:

- **Engine (1 → 2).** Task 1 makes the governing change (D1: the `source` gate) inside `planActionTransition.js` and rewrites that planner's own unit tests so the file stays green. Task 2 then audits the two broader integration suites (`planSubmit.test.js`, `SubmitWorkflowAction.test.js`) for any assertion that a _check user submit_ persists `assignees`/`due_date`, and confirms the full plugin suite is green. It depends on Task 1 because it validates Task 1's behavior across the orchestrator.

- **Module YAML (3, 4, 5).** Task 3 reworks the modal body surface. Task 4 is a comment-only convergence in the modal container that only makes sense **after** Task 3 deletes the status-history List (its comments justify a pruning behavior that no longer exists), so 4 depends on 3. Task 5 reworks the workspace page template and is independent of 3/4 (different file, same two concerns: drop `fields` from payloads, drop the field-edit comment resets).

**Parallelism.** The engine workstream (1, 2) and each of the module-YAML tasks (3, 5) are mutually independent and order-independent — the `source` gate and the payload drop each fully preserve correct behavior on their own (one strips what the other no longer sends), so neither blocks the other. The natural grouping is: do 1→2, and 3→4, and 5, in any interleaving. Verify the whole set with `pnpm jest` (plugin) and `pnpm ldf:b` (demo build) at the end.

## Scope

**Source:** `designs/workflows-module/parts/65-check-action-modal-rework/design.md`
**Context files considered:** `mockups/mockup.html` (visual exploration of the modal header variants — Option A compact / Option B page-scaled; D3 chose page-scaled-minus-eyebrow with Option A as the documented fallback).
**Review files skipped:** `review/review-1.md`
