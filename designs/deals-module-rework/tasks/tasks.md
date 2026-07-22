# Implementation Tasks — Deals Module Rework

## Overview

Implements `designs/deals-module-rework/design.md`: generalize the deals module off its host-specific coupling (A), extract three deals-local pieces up into shared modules + close two reuse gaps (B), and sub deals into the richer onboarding workflow in the demo (C). Folds into draft PR #111 as one reviewable commit per task.

## Tasks

| #   | File                                   | Summary                                                                                      | Depends On |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-connection-id-var.md`              | Promote the literal `deals` connection_id to an `entity_connection_id` var (deals)           | —          |
| 2   | `02-deal-value-stored-field.md`        | Read stored `value`/`close_date` (+`$ifNull`); volumes tile → host info-grid slot (deals)     | —          |
| 3   | `03-activities-task-crud.md`           | Move task create/update + task-modal to activities with entity-link + event seams            | —          |
| 4   | `04-workflows-open-actions-card.md`    | Add compact actions-only `open-actions` card to workflows; deals consumes it                  | —          |
| 5   | `05-activities-open-tasks-card.md`     | Add `open-tasks` card to activities; deals composes both cards; retire deals' actions surface | 3, 4       |
| 6   | `06-events-note-capture.md`            | Extract @mention note-capture to events with mention-source + context seams; deals consumes   | —          |
| 7   | `07-deal-view-gap-closes.md`           | Drop shared `check-action-modal` + use `entity-workflows-refetch` on the deal view (deals)     | 4, 5, 6    |
| 8   | `08-onboarding-workflow-on-deals.md`   | Author onboarding workflow on deals (port actions, drop tracker, carry deal-outcome, register) | 2          |
| 9   | `09-quote-builder-demo-page.md`        | Build the lightweight deal-scoped quote-builder demo page send-quote links to                 | 8          |
| 10  | `10-demo-vars-and-verification.md`     | Demo deals vars (workflow_type: onboarding, stages/groups/outcomes) + full runtime + host gate | 1–9        |

## Ordering Rationale

Three dependency chains, largely parallelizable until C:

- **Workstream A (tasks 1–2)** — deals-module generalization. Independent of each other and of B. Task 2 (stored value) is the prerequisite for C's value display; the demo shows the `$ifNull` fallback (`0`/`—`) between task 2 and task 8, which is expected.
- **Workstream B (tasks 3–7)** — extractions. Tasks 3, 4, 6 are independent and can run in parallel. Task 5 (activities open-tasks card) depends on 3 (activities owns task storage/CRUD) and 4 (pairs with the workflows open-actions card to replace deals' unified widget). Task 7 (gap closes) is functionally independent but edits the same `modules/deals/pages/view.yaml` as 4/5/6, so it's ordered last among B to serialize those edits and avoid churn.
- **Workstream C (tasks 8–10)** — demo. Task 8 (onboarding workflow) needs task 2's value seam to make stamping meaningful. Task 9 (quote-builder page) is the custom page task 8's `send-quote` links to. Task 10 wires the demo deals vars and is the integration/verification point — it depends on everything (1–9), runs the full demo walkthrough, and records the manual host-reconstitution gate.

**Shared-file note:** tasks 4, 5, 6, 7 all edit `modules/deals/pages/view.yaml` (and `components/detail/*`). Run them in listed order; each leaves the app building.

**Cross-repo note:** the host-reconstitution gate (task 10) and the host-side backfill migration are Phase-D concerns performed by someone with host access — not automatable in this repo's CI. Task 10 records the gate; it does not implement the host migration.

## Scope

**Source:** `designs/deals-module-rework/design.md`
**Context files considered:** none beyond `design.md` (no supporting/research files in this design).
**Review files skipped:** `review/review-1.md`, `review/consistency-1.md`.
